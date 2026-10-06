## 실행

`index.html`을 브라우저에서 엽니다. 서버나 패키지 설치 없이 사용할 수 있습니다.

## 현재 구성

표지와 한글 메인 1안 및 2안 와이어프레임을 등록했습니다. 영문 그룹은 비어 있습니다. 좌측 화면 목록, 중앙 목업, 우측 설명, 확대 및 이동, 코드 보기 기능은 RIST 공통 뷰어를 기반으로 합니다.

## 편집 및 빌드

- 표지: `pages/visd-cover.html`
- 페이지 목록: `data/manifest.js`
- 화면 설명: `data/descriptions.js`
- 소스 생성: `python3 scripts/build_sources.py`

HTML 수정 후 소스를 다시 생성합니다. `data/page-sources.js`는 직접 수정하지 않습니다. RIST 전용 데이터와 문서 빌더는 포함하지 않습니다.

