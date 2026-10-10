window.MOCKUP_VIEWER_DESCRIPTIONS = {
  "visd-software-ko": [
    {
      "id": "software-filter-name",
      "title": "필터명 오타 수정",
      "body": "High-Performance Filter 섹션에서 필터 목록의 두 번째 항목 Florine을 Gray로 수정합니다.",
      "targetId": "software-filter-revised-text",
      "x": 930,
      "y": 490
    },
    {
      "id": "software-ai-menu-link",
      "title": "AI 서브 메뉴 연결 확인",
      "body": "소프트웨어 서브 메뉴의 AI를 선택해도 별도 페이지로 이동하지 않습니다. AI 페이지를 추가 제작할 예정인지, 이미 제작된 페이지의 메뉴 연결이 누락된 것인지 확인 부탁드립니다."
    }
  ],
  "visd-project-ko": [
    {
      "id": "project-menu-hidden-until-open",
      "title": "프로젝트 메뉴 숨김",
      "body": "프로젝트를 추가한 뒤 공개할 예정이므로, 그전까지 프로젝트 메뉴를 숨겨 주세요."
    }
  ],
  "visd-article-ko": [
    {
      "id": "article-menu-hidden-until-open",
      "title": "아티클 메뉴 숨김",
      "body": "아티클별 고유 URL(슬러그)을 가진 상세 페이지를 구축한 뒤 공개할 예정이므로, 그전까지 아티클 메뉴를 숨겨 주세요."
    }
  ],
  "visd-contact-ko": [
    {
      "id": "contact-country-code-default",
      "title": "국가번호 기본값",
      "body": "국문 페이지에서는 국가번호의 기본값을 대한민국(+82)으로 표시합니다. 연락처는 010-1234-5678, 01012345678, 1012345678 모두 입력할 수 있으며, 입력 화면에서는 사용자가 입력한 형식을 그대로 유지합니다. 대한민국이 선택된 경우 DB 저장 시에만 하이픈 등 구분 문자를 정리하고, 국내 접두사 0이 있을 때만 제거한 뒤 국가번호 +82를 붙입니다. 10으로 시작하면 첫 숫자 1을 제거하지 않습니다. 예: 010-1234-5678 → +821012345678, 01012345678 → +821012345678, 1012345678 → +821012345678.",
      "targetId": "contact-country-code-anchor",
      "x": 646,
      "y": 625
    }
  ],
  "visd-footer-ko-revision": [
    {
      "id": "footer-contact-link",
      "title": "문의하기 버튼 연결",
      "body": "문의하기 버튼의 연결을 이메일에서 문의하기 페이지(/contact/)로 변경합니다.",
      "targetId": "footer-contact-revised-html",
      "x": 930,
      "y": 490
    }
  ],
  "visd-footer-en-revision": [
    {
      "id": "footer-contact-en-link",
      "title": "CONTACT 버튼 연결",
      "body": "CONTACT 버튼의 연결을 이메일에서 영문 문의 페이지(/en/contact/)로 변경합니다.",
      "targetId": "footer-contact-en-revised-html",
      "x": 930,
      "y": 490
    }
  ],
  "visd-software-en": [
    {
      "id": "software-en-heading",
      "title": "상단 제목 영어 수정",
      "body": "상단 제목을 영어로 수정합니다.",
      "targetId": "software-en-heading-anchor",
      "x": 260,
      "y": 60
    },
    {
      "id": "software-en-filter",
      "title": "두 번째 필터명 수정",
      "body": "두 번째 항목의 Florine을 Gray로 수정합니다."
    }
  ],
  "visd-hardware-en": [
    {
      "id": "hardware-en-heading",
      "title": "상단 제목 영어 수정",
      "body": "상단 제목을 영어로 수정합니다.",
      "targetId": "hardware-en-heading-anchor",
      "x": 260,
      "y": 60
    }
  ],
  "visd-contact-en": [
    {
      "id": "contact-en-country-code",
      "title": "국가번호 선택과 저장 방식",
      "body": "개발 가능 시 접속 IP로 국가를 추정해 해당 국가번호를 기본값으로 제안합니다. 기능이 없거나 국가를 확인하지 못하면 Select country code를 표시하고, 제안된 국가번호도 사용자가 직접 변경할 수 있어야 합니다. 입력 화면에서는 사용자가 입력한 형식을 그대로 유지합니다. 저장 시에는 IP 추정 국가가 아닌 사용자가 최종 선택한 국가를 기준으로 번호를 검증하고, E.164 국제 형식(+국가번호와 전화번호를 붙인 공백, 하이픈 없는 문자열)으로 변환합니다. 국가마다 번호 체계가 다르므로 모든 번호를 10으로 시작하게 만들거나 앞자리 0을 일괄 제거하지 않습니다. 이탈리아처럼 국제 형식에서도 앞자리 0이 필요한 경우가 있습니다. 대한민국(+82)을 선택한 한국 휴대전화의 예: 010-1234-5678, 01012345678, 1012345678 → +821012345678. 국가별 규칙을 임의의 공통 치환 로직으로 처리하지 말고 Google libphonenumber 또는 개발 환경에 맞는 호환 라이브러리로 파싱, 국가별 번호 형식 검증, E.164 변환을 수행해 주세요. 형식 검증은 실제 개통이나 소유 여부 인증과 다릅니다. 유효하지 않거나 해석할 수 없는 번호는 임의 변환해 저장하지 말고 입력 확인을 안내해 주세요.",
      "targetId": "contact-country-code-anchor",
      "x": 646,
      "y": 625
    }
  ]
};
