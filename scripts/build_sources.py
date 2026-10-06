#!/usr/bin/env python3
"""Build offline page/code sources using only the Python standard library.

Run from any directory: python3 /path/to/visd-site-improvement-ui-spec/scripts/build_sources.py
Author components with data-component, data-component-title and an optional
data-component-width (original pixels). Component styles should use classes
within the component; layout supplied by a parent grid is replaced by its width.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import re
from dataclasses import dataclass, field
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
SAMPLE_MIMES = {
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
}
VOID = set("area base br col embed hr img input link meta param source track wbr".split())
INHERITED = set("color direction font font-family font-feature-settings font-kerning font-size font-stretch font-style font-variant font-weight letter-spacing line-height text-align text-indent text-transform visibility white-space word-break word-spacing overflow-wrap".split())


@dataclass
class Element:
    tag: str
    attrs: dict
    start: str
    children: list = field(default_factory=list)
    end: str = ""

    def render(self, clean=False):
        start = self.start
        if clean:
            start = re.sub(r'\sdata-component(?:-[\w-]+)?\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)', '', start, flags=re.I)
        return start + ''.join(c.render(clean) if isinstance(c, Element) else c for c in self.children) + self.end


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.root = Element('', {}, '')
        self.stack = [self.root]
        self.elements = []
        self.feed(source)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Element(tag, dict(attrs), self.get_starttag_text())
        self.stack[-1].children.append(node)
        self.elements.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        node = Element(tag, dict(attrs), self.get_starttag_text())
        self.stack[-1].children.append(node)
        self.elements.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                self.stack[index].end = f'</{tag}>'
                del self.stack[index:]
                return
        raise ValueError(f'Unmatched closing HTML tag: {tag}')

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def handle_decl(self, decl):
        self.handle_data(f'<!{decl}>')

    def handle_comment(self, data):
        self.handle_data(f'<!--{data}-->')

    def handle_entityref(self, name):
        self.handle_data(f'&{name};')

    def handle_charref(self, name):
        self.handle_data(f'&#{name};')


def local_asset(value, directory):
    parts = urlsplit(value)
    if parts.scheme == 'data' or value.startswith('#'):
        return value
    if parts.scheme or parts.netloc:
        raise ValueError(f'Use local assets for offline export: {value}')
    path = (directory / unquote(parts.path)).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError(f'Asset must be inside the viewer folder: {value}')
    mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
    encoded = base64.b64encode(path.read_bytes()).decode('ascii')
    return f'data:{mime};base64,{encoded}' + (f'#{parts.fragment}' if parts.fragment else '')


def inline_css(css, directory):
    if re.search(r'@import\b', css, flags=re.I):
        raise ValueError('Use local <link rel="stylesheet"> instead of CSS @import.')
    def asset(match):
        value = match.group(1).strip().strip('\"\x27')
        return 'url("' + local_asset(value, directory) + '")'
    return re.sub(r'url\(([^)]+)\)', asset, css, flags=re.I)


def css_blocks(css):
    """Read balanced blocks without splitting braces inside strings/comments."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    start = 0
    depth = 0
    quote = None
    escaped = False
    header = None
    for index, char in enumerate(css):
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char == '{':
            if depth == 0:
                header = css[start:index].strip()
                start = index + 1
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                yield header, css[start:index]
                start = index + 1
            elif depth < 0:
                raise ValueError('Unbalanced CSS braces.')
    if depth or css[start:].strip():
        raise ValueError('Unsupported or unbalanced CSS syntax; use ordinary selector blocks.')


def split_selectors(selector):
    return re.split(r',\s*(?![^()]*\))', selector)


def inherited_declarations(body):
    kept = []
    for declaration in body.split(';'):
        name, sep, value = declaration.partition(':')
        if sep and (name.strip() in INHERITED or name.strip().startswith('--')):
            kept.append(name.strip() + ':' + value.strip())
    return ';'.join(kept)


def scoped_css(css, scope):
    rules = []
    for selector, body in css_blocks(css):
        if selector.startswith('@'):
            if re.match(r'@(media|supports|container|layer)\b', selector):
                rules.append(selector + '{' + scoped_css(body, scope) + '}')
            else:
                raise ValueError(f'Component export does not support {selector}; use self-contained ordinary CSS rules.')
            continue
        normal = []
        root = False
        for part in split_selectors(selector):
            part = part.strip()
            if part in ('html', 'body', ':root'):
                root = True
            elif part == '*':
                normal.extend([scope, scope + ' *'])
            elif re.match(r'^(?:html|body|:root)(?:\s|[.\[:#>+~])', part):
                # Root-dependent selectors would need page context. Make this
                # explicit instead of exporting a subtly broken component.
                raise ValueError(f'Use component-local classes instead of root-dependent selector: {part}')
            else:
                normal.append(scope + ' ' + part)
        if normal:
            rules.append(','.join(normal) + '{' + body.strip() + '}')
        if root:
            inherited = inherited_declarations(body)
            if inherited:
                rules.append(scope + '{' + inherited + '}')
    return '\n'.join(rules)


def build_page(path):
    document = Document(path.read_text(encoding='utf-8'))
    css_parts = []
    for node in document.elements:
        if node.tag == 'link' and 'stylesheet' in node.attrs.get('rel', '').split():
            href = node.attrs.get('href', '')
            if urlsplit(href).scheme or urlsplit(href).netloc:
                raise ValueError(f'{path.name}: stylesheets must be local: {href}')
            css_path = (path.parent / unquote(urlsplit(href).path)).resolve()
            if not css_path.is_relative_to(ROOT):
                raise ValueError(f'Stylesheet must be inside viewer folder: {href}')
            css = inline_css(css_path.read_text(encoding='utf-8'), css_path.parent)
            css_parts.append(css)
            node.start, node.children, node.end = '<style>', [css], '</style>'
        elif node.tag == 'script' and node.attrs.get('src'):
            src = node.attrs['src']
            script_path = (path.parent / unquote(urlsplit(src).path)).resolve()
            if urlsplit(src).scheme or urlsplit(src).netloc or not script_path.is_relative_to(ROOT):
                raise ValueError(f'{path.name}: scripts must be local: {src}')
            node.start, node.children, node.end = '<script>', [script_path.read_text(encoding='utf-8')], '</script>'
        elif node.tag == 'style':
            css = inline_css(''.join(node.children), path.parent)
            css_parts.append(css)
            node.children = [css]
        elif node.tag == 'img' and node.attrs.get('src'):
            original = node.attrs['src']
            embedded = local_asset(original, path.parent)
            node.start = re.sub(r'\bsrc\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)', 'src="' + escape(embedded, quote=True) + '"', node.start, count=1, flags=re.I)
        elif node.tag == 'a' and 'data-document-download' in node.attrs:
            href = node.attrs.get('href', '')
            parts = urlsplit(href)
            markdown = (path.parent / unquote(parts.path)).resolve()
            filename = node.attrs.get('download', '')
            if (parts.scheme or parts.netloc or parts.query or parts.fragment or
                    not markdown.is_relative_to((ROOT / 'docs').resolve()) or markdown.suffix.lower() != '.md'):
                raise ValueError(f'{path.name}: document downloads must reference a local Markdown file in docs/: {href}')
            if not filename.endswith('.md') or re.search(r'[/\\\x00-\x1f]', filename):
                raise ValueError(f'{path.name}: document downloads need a plain .md filename.')
            encoded = base64.b64encode(markdown.read_bytes()).decode('ascii')
            embedded = 'data:text/markdown;charset=utf-8;base64,' + encoded
            node.start = re.sub(r'\bhref\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)', 'href="' + embedded + '"', node.start, count=1, flags=re.I)
        elif node.tag == 'a' and 'data-sample-download' in node.attrs:
            href = node.attrs.get('href') or ''
            parts = urlsplit(href)
            decoded_path = unquote(parts.path)
            invalid_source = f'{path.name}: sample downloads must reference a local CSV, PDF, XLSX or XLS file in samples/: {href}'
            if (not decoded_path or parts.scheme or parts.netloc or parts.query or parts.fragment or
                    decoded_path.startswith('/') or re.search(r'[\\\x00-\x1f\x7f]', decoded_path)):
                raise ValueError(invalid_source)
            sample = (path.parent / decoded_path).resolve()
            suffix = sample.suffix.lower()
            filename = node.attrs.get('download') or ''
            if (not sample.is_relative_to(ROOT / 'samples') or
                    suffix not in SAMPLE_MIMES):
                raise ValueError(invalid_source)
            if (Path(filename).suffix.lower() != suffix or
                    re.search(r'[/\\\x00-\x1f\x7f]', filename)):
                raise ValueError(f'{path.name}: sample downloads need a plain filename matching the {suffix} source extension.')
            encoded = base64.b64encode(sample.read_bytes()).decode('ascii')
            embedded = f'data:{SAMPLE_MIMES[suffix]};base64,{encoded}'
            node.start = re.sub(r'\bhref\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)', 'href="' + embedded + '"', node.start, count=1, flags=re.I)
    css = '\n'.join(css_parts)
    components = []
    seen = set()
    for node in document.elements:
        identifier = node.attrs.get('data-component')
        if not identifier:
            continue
        if not re.fullmatch(r'[a-z][a-z0-9-]*', identifier) or identifier in seen:
            raise ValueError(f'{path.name}: component IDs must be unique lowercase names: {identifier}')
        seen.add(identifier)
        title = node.attrs.get('data-component-title', '').strip()
        if not title:
            raise ValueError(f'{path.name}: {identifier} needs data-component-title.')
        width = node.attrs.get('data-component-width', '')
        if width and (not re.fullmatch(r'\d+(?:\.\d+)?', width) or float(width) <= 0):
            raise ValueError(f'{path.name}: {identifier} width must be a positive pixel number.')
        scope = '.mockup-component--' + identifier
        component_css = scope + '{display:flow-root;' + (f'width:{width}px;' if width else '') + 'max-width:100%;}\n' + scoped_css(css, scope)
        components.append({
            'id': identifier,
            'title': title,
            'html': '<div class="' + scope[1:] + '">\n' + node.render(clean=True) + '\n</div>',
            'css': component_css,
        })
    return {'html': document.root.render(), 'components': components}


def main():
    pages = sorted((ROOT / 'pages').rglob('*.html'))
    registry = {path.relative_to(ROOT).as_posix(): build_page(path) for path in pages}
    serialized = json.dumps(registry, ensure_ascii=False, indent=2)
    # Safe both as an external script and when embedded in an HTML script tag.
    serialized = serialized.replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    output = ROOT / 'data' / 'page-sources.js'
    output.parent.mkdir(exist_ok=True)
    output.write_text('// Generated by scripts/build_sources.py. Edit pages/, docs/ Markdown or samples/, then rebuild.\nwindow.MOCKUP_VIEWER_SOURCES = ' + serialized + ';\n', encoding='utf-8')
    print(f'Built {len(registry)} pages / {sum(len(p["components"]) for p in registry.values())} components: {output}')


if __name__ == '__main__':
    main()
