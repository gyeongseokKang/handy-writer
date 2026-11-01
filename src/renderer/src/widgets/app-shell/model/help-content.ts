/**
 * 도움말 창에 나오는 기능 소개. 에디터가 지금 제공하는 기능을 묶음별로 늘어놓고, 기능마다 화면 그림 한 장과 설명을 붙인다.
 * 그림은 `shared/assets/help/<image>.webp`이고 `pnpm docs:screenshots`가 실제 앱 화면으로 만든다.
 */

export type HelpGroupId = "write" | "organize" | "polish" | "share" | "ai" | "safe" | "app";

export interface HelpGroup {
  id: HelpGroupId;
  title: string;
  description: string;
}

export const HELP_GROUPS: HelpGroup[] = [
  { id: "write", title: "글쓰기", description: "노션처럼 편하게 쓰고, 파일은 마크다운 그대로 남아요." },
  { id: "organize", title: "정리하고 찾기", description: "글이 많아져도 금방 찾고, 연결해서 봐요." },
  { id: "polish", title: "다듬기", description: "규칙 기반이라 오프라인에서도 바로 알려 줘요." },
  { id: "share", title: "가져오기·내보내기·원고", description: "웹 글을 가져오고, 책 한 권 분량의 원고로 묶어 내보내요." },
  { id: "ai", title: "AI", description: "내 컴퓨터의 Claude Code로 돌아가서 API 키가 필요 없어요." },
  { id: "safe", title: "안전하게 쓰기", description: "저장 실패, 바깥 변경, 실수까지 되돌릴 수 있게 해 둬요." },
  { id: "app", title: "앱 사용", description: "설정과 단축키는 한곳에 모여 있어요." },
];

export interface HelpFeature {
  /** 다른 곳에서 이 기능으로 바로 가려고 쓰는 이름 */
  id: string;
  group: HelpGroupId;
  title: string;
  /** 한두 문장 설명. `…`로 감싼 부분은 코드 모양으로 보인다. */
  summary: string;
  /** 이렇게 써요 */
  steps?: string[];
  /** 단축키 ("Mod+Shift+D" 꼴, Mod는 맥에서 ⌘, 그 밖에서 Ctrl) */
  shortcuts?: string[];
  /** `shared/assets/help/` 안 그림 이름 (확장자 없이) */
  image: string;
  /** 눌러 보게 할 명령 (명령 팔레트의 id와 이름) */
  command?: { id: string; label: string };
  keywords?: string[];
}

export const HELP_FEATURES: HelpFeature[] = [
  // ── 글쓰기 ──
  {
    id: "overview",
    group: "write",
    title: "화면 구성",
    summary: "왼쪽에는 글 목록과 즐겨찾기, 가운데에는 탭과 글, 오른쪽에는 연결·첨부·AI·맞춤법 패널, 아래에는 글의 상태 막대가 있어요. 글 제목 바로 아래에 태그와 속성이 붙어요.",
    steps: [
      "글 목록 맨 위의 즐겨찾기에 자주 여는 글과 폴더를 고정해요.",
      "제목 아래 태그 줄 끝의 ‘속성’으로 날짜·상태 같은 frontmatter를 고쳐요.",
      "오른쪽 패널의 ‘연결’ 탭에서 백링크와 나가는 링크를 봐요.",
      "아래 막대에서 글자 수, A4 페이지 수, 오늘 쓴 양, 맞춤법, 변경 기록, 내보내기를 열어요.",
      "본문 맨 앞의 `# 제목`이 글 제목과 같으면 위쪽 제목이 대신해서 숨겨요(파일은 그대로). 글 제목을 바꾸면 그 줄도 같이 바뀌어요.",
    ],
    image: "overview",
    keywords: ["처음", "레이아웃", "사이드바"],
  },
  {
    id: "slash",
    group: "write",
    title: "블록 메뉴 `/`",
    summary: "빈 줄에서 `/`를 입력하면 제목, 목록, 할 일, 표, 코드, 콜아웃, 이미지·파일, 각주, 그림·표 번호, 링크에서 가져오기, 템플릿 블록을 이름으로 찾아 넣어요.",
    steps: ["↑↓로 고르고 Enter로 넣어요.", "블록 왼쪽 손잡이를 끌어 순서를 바꿔요.", "글자를 선택하면 굵게·기울임·링크 같은 서식 막대가 떠요."],
    shortcuts: ["/"],
    image: "slash-menu",
    keywords: ["슬래시", "블록", "서식", "툴바"],
  },
  {
    id: "block-type",
    group: "write",
    title: "블록 종류 바꾸기와 단축키",
    summary: "이미 쓴 글도 블록 종류를 바꿀 수 있어요. 본문, 제목 1~3, 할 일·글머리·번호 목록, 인용, 코드 블록 가운데 고르면 새 블록을 만들지 않고 그 블록이 바뀌어요. 목록이나 인용 안에 있어도 돼요.",
    steps: [
      "블록 왼쪽의 ⋮⋮ 손잡이를 누르면 메뉴가 떠요. 끌면 블록을 옮기고, 메뉴에는 복제와 삭제도 있어요.",
      "글자를 선택하면 뜨는 막대의 맨 왼쪽 칸에 지금 블록 종류가 보이고, 눌러서 바꿔요.",
      "단축키는 Notion과 같아요: `Ctrl/Cmd+Alt+0` 본문, `1~3` 제목, `4` 할 일, `5` 글머리 목록, `6` 번호 목록, `7` 인용, `8` 코드 블록.",
      "`Ctrl/Cmd+Shift+↑↓`로 블록을 위·아래로 옮기고, `Ctrl/Cmd+D`로 블록을 복제해요. `Ctrl/Cmd+Shift+V`는 서식 없이 글자만 붙여넣어요.",
      "빈 제목 블록에는 ‘제목 2’처럼 몇 단계 제목인지 안내 글자가 보여요.",
    ],
    shortcuts: ["Mod+Alt+1", "Mod+Shift+V"],
    image: "block-menu",
    keywords: ["변환", "turn into", "제목", "목록", "인용", "복제", "옮기기", "붙여넣기", "서식 없이", "plain"],
  },
  {
    id: "links",
    group: "write",
    title: "[[링크]]와 #태그",
    summary: "`[[`를 입력하면 글 이름 자동완성이 열려요. 링크를 누르면 그 글로 가고, 아직 없는 글로 가는 링크는 흐리게 보이며 누르면 바로 만들어요. 본문의 `#태그`도 태그가 돼요.",
    steps: ["글 이름을 바꾸면 다른 글의 `[[링크]]`도 새 이름으로 자동으로 바뀌어요.", "Obsidian 콜아웃(`> [!note]`)도 그대로 읽고 써요."],
    shortcuts: ["[["],
    image: "wiki-link",
    keywords: ["위키링크", "백링크", "콜아웃", "자동완성"],
  },
  {
    id: "table",
    group: "write",
    title: "표 편집",
    summary: "표 안에 커서를 두면 위에 막대가 떠서 행·열을 더하고 지우고, 머리글 행을 켜고 끄고, 표를 지워요. `/표`로 만들어요.",
    image: "table",
    keywords: ["테이블", "행", "열"],
  },
  {
    id: "code",
    group: "write",
    title: "코드 블록",
    summary: "펜스에 언어를 적으면(```tsx 등) 그 언어대로 문법 색이 입혀져요. 머리줄에서 언어를 바꾸거나 코드를 복사해요. 라이트·다크 테마를 따라가요.",
    image: "code",
    keywords: ["문법", "하이라이트", "복사"],
  },
  {
    id: "footnote",
    group: "write",
    title: "각주와 그림·표 번호",
    summary: "Obsidian 호환 문법이라 파일을 다른 곳에서 열어도 그대로예요. HTML·PDF·Word로 내보내도 화면과 같은 번호가 나와요.",
    steps: [
      "`/각주`: 커서 자리에 번호를 넣고 글 끝에 내용 줄을 만들어요. 번호를 누르면 내용으로, 내용 줄의 번호를 누르면 본문으로 돌아가요.",
      "`/그림 번호`·`/표 번호`: 그림이나 표 아래 문단 끝에 `^fig-이름`을 붙이면 ‘그림 1.’ 번호가 매겨져요.",
      "본문에서 `[[#`로 고르면 ‘그림 1’처럼 보이고, 누르면 그 그림으로 가요. 순서가 바뀌면 번호도 따라 바뀌어요.",
    ],
    image: "footnote",
    keywords: ["참조", "캡션", "번호", "xref"],
  },
  {
    id: "embed",
    group: "write",
    title: "첨부와 다른 글 끼워 넣기",
    summary: "이미지·영상·오디오·PDF는 붙여넣기나 끌어다 놓기로 넣어요(작업 폴더의 `attachments/`에 저장). `![[다른 글]]`이나 `![[다른 글#소제목]]`은 그 글, 또는 그 소제목 부분을 본문 안에 읽기 전용으로 보여 줘요.",
    steps: [
      "크기는 `![[사진.png|300]]`, 설명은 `![[사진.png|설명|300]]`처럼 적어요.",
      "끼워 넣은 글이 저장되면 다시 읽어 오고, 머리의 버튼으로 그 글을 열어요.",
      "내보낼 때는 끼워 넣은 내용이 그대로 펼쳐져요.",
    ],
    image: "embed",
    keywords: ["이미지", "영상", "transclusion", "임베드", "첨부"],
  },
  {
    id: "attachments",
    group: "write",
    title: "첨부 탭",
    summary: "오른쪽 ‘첨부’ 탭이 이 글의 이미지·영상·오디오·PDF를 한 줄씩 보여 줘요. 눌러서 펼치면 미리보기와 라벨(캡션), 크기 조정이 있어요. 크기를 정하지 않으면 늘 글 폭 100%로 보여요.",
    image: "attachments",
    keywords: ["파일", "크기", "라벨"],
  },
  {
    id: "outline",
    group: "write",
    title: "목차",
    summary: "에디터 왼쪽 위에 떠 있는 목차예요. 평소에는 지금 읽는 제목과 그 위 제목만 보이고, 마우스를 올리면 전체가 펼쳐져요. 누르면 그 제목으로 가요. 글 칸 옆에 자리가 없으면 아이콘 하나로 줄어요.",
    steps: [
      "펼친 목차 위의 핀 버튼을 누르면 마우스를 올리지 않아도 전체 목차가 펼쳐진 채로 고정돼요. 다시 누르면 풀려요. 이 컴퓨터에 기억해요.",
      "글 제목과 같은 맨 앞 제목은 본문에서 숨겨져 있어서 목차에도 나오지 않아요.",
      "설정이나 명령 ‘목차 보이기·숨기기’로 켜고 꺼요.",
    ],
    image: "outline",
    command: { id: "view.outline", label: "목차 보이기·숨기기" },
    keywords: ["제목", "개요", "outline"],
  },
  {
    id: "width",
    group: "write",
    title: "글 너비",
    summary: "글 칸 양옆 가장자리에 마우스를 올리면 손잡이가 보여요. 한쪽을 끌면 가운데를 기준으로 반대쪽도 같이 넓어지거나 좁아져요. 손잡이를 두 번 누르면 기본 너비(768px)로 돌아가요. 설정에서 숫자로 정할 수도 있어요.",
    image: "width",
    keywords: ["폭", "여백"],
  },
  {
    id: "find",
    group: "write",
    title: "글 안에서 찾기·바꾸기",
    summary: "일치하는 곳을 모두 칠하고 Enter와 Shift+Enter로 오가요. 대소문자 구분, 바꾸기, 모두 바꾸기가 있고 모두 바꾸기는 한 번에 되돌릴 수 있어요. Esc로 닫아요.",
    shortcuts: ["Mod+F"],
    image: "find",
    command: { id: "note.find", label: "글 안에서 찾기·바꾸기" },
    keywords: ["검색", "치환", "replace"],
  },
  {
    id: "count",
    group: "write",
    title: "글자 수와 목표 분량",
    summary: "아래 막대에 글자 수와 읽는 시간이 보여요(글자를 선택하면 선택한 글자 수). 누르면 공백을 뺀 글자 수와 200자 원고지 매수를 보여 주고, 목표 분량을 정하면 진행률 막대가 나와요.",
    steps: ["목표는 글자 수나 원고지 매수로 정해요. 글의 frontmatter에 `goal: 3000` 또는 `goal: 15매`로 저장돼요."],
    image: "count",
    keywords: ["원고지", "분량", "목표"],
  },
  {
    id: "pages",
    group: "write",
    title: "A4 페이지 수와 구분선",
    summary: "아래 막대의 `A4 약 3p`는 PDF로 내보냈을 때의 페이지 수예요. 한글·Word 기본값(10pt, 줄 간격 160%, 여백 20mm)이라 한 페이지에 2,000자쯤(200자 원고지 10매) 들어가요.",
    steps: [
      "페이지가 넘어가는 자리마다 글 왼쪽 여백에 점선과 `2p` 같은 번호가 보여요.",
      "그 버튼을 누르면 구분선을 켜고 꺼요. 이 컴퓨터에 기억해요.",
      "줄을 반으로 자르지 않고, 문단의 첫·끝 두 줄이 홀로 남지 않게 하는 인쇄 규칙을 따라요.",
    ],
    image: "pages",
    keywords: ["쪽", "페이지", "A4", "분량"],
  },
  {
    id: "stats",
    group: "write",
    title: "오늘 쓴 양",
    summary: "아래 막대의 `오늘 +1,240자`예요. 이 앱에서 저장한 글마다 그날 처음보다 늘어난 글자 수를 더해요(자동 저장이 잦아도 두 번 세지 않고, 가져온 글과 되돌린 버전은 빼요). 누르면 연속으로 쓴 날, 하루 목표, 잔디 달력이 나와요.",
    steps: ["하루 목표를 적으면 진행률이 막대에 보여요.", "기록은 이 컴퓨터의 앱 데이터 폴더에만 남고 작업 폴더나 git에는 들어가지 않아요."],
    image: "stats",
    command: { id: "note.writing-stats", label: "오늘 쓴 양 보기" },
    keywords: ["연속", "잔디", "습관", "통계"],
  },
  {
    id: "focus",
    group: "write",
    title: "집중 모드",
    summary: "사이드바·탭·오른쪽 패널·목차를 숨기고 글만 보여 줘요. 지금 쓰는 문단만 진하고 나머지는 옅게 보이며, 키보드로 쓰거나 움직이면 커서 줄이 늘 화면 가운데쯤에 있게 글이 따라 움직여요.",
    steps: [
      "마우스로 누른 자리는 화면을 움직이지 않아요.",
      "열린 창이 없을 때 Esc나 구석의 ‘집중 모드 끄기’로 나가요.",
      "문단 강조와 타자기 스크롤은 설정에서 따로 끌 수 있어요.",
    ],
    shortcuts: ["Mod+Shift+D"],
    image: "focus",
    command: { id: "view.focus", label: "집중 모드 켜기·끄기" },
    keywords: ["타자기", "zen", "방해 금지"],
  },

  // ── 정리하고 찾기 ──
  {
    id: "search",
    group: "organize",
    title: "전체 검색",
    summary: "제목·태그·본문을 한 번에 찾고, 일치한 단어를 강조해요. 결과를 열면 그 단어로 이동해요. 입력이 없으면 최근 글이 나와요.",
    shortcuts: ["Mod+K", "Mod+P"],
    image: "search",
    command: { id: "note.search", label: "글 검색" },
    keywords: ["찾기", "search"],
  },
  {
    id: "palette",
    group: "organize",
    title: "명령 팔레트",
    summary: "검색 창에 `>`를 입력하거나 `Ctrl/Cmd+Shift+P`로 열면 모든 명령(새 글, 찾기, 변경 기록, 내보내기, 탭, 패널, 설정…)을 이름으로 찾아 실행해요. 단축키도 함께 보여요.",
    shortcuts: ["Mod+Shift+P"],
    image: "palette",
    command: { id: "app.commands", label: "명령 실행" },
    keywords: ["명령", "command", "단축키"],
  },
  {
    id: "tree",
    group: "organize",
    title: "글 목록과 우클릭 메뉴",
    summary: "글은 이름 바꾸기·복제·다른 폴더로 옮기기·링크와 경로 복사·Finder에서 보기·즐겨찾기·변경 기록·휴지통을, 폴더는 새 글·새 폴더·이름 바꾸기·원고로 보기·즐겨찾기·휴지통을 우클릭 메뉴에서 해요.",
    steps: ["이름은 목록에서 바로 고쳐요(Enter 저장, Esc 취소).", "열어 둔 글은 옮기거나 폴더 이름을 바꿔도 그대로 열려 있고, 즐겨찾기와 원고 순서도 따라가요."],
    image: "tree-menu",
    keywords: ["폴더", "이동", "즐겨찾기", "삭제", "복제"],
  },
  {
    id: "tabs",
    group: "organize",
    title: "탭과 분할 화면",
    summary: "글 목록에서 Cmd/Ctrl+클릭(가운데 버튼)이나 우클릭 ‘새 탭에서 열기’로 새 탭을 열어요. Alt+클릭이나 우클릭 ‘옆에 열기’로 다른 글을 오른쪽에 나란히 띄우면 양쪽 모두 편집하고 저장돼요.",
    steps: [
      "탭은 끌어서 순서를 바꾸고, `Ctrl/Cmd+W`로 닫고, `Ctrl/Cmd+Shift+T`로 닫은 탭을 다시 열어요.",
      "분할 화면은 `Ctrl/Cmd+\\`로 켜고 끄며, 경계를 끌어 너비를 바꾸고 더블클릭하면 반반이 돼요.",
    ],
    shortcuts: ["Mod+\\", "Mod+Shift+T"],
    image: "split",
    keywords: ["분할", "나란히", "탭"],
  },
  {
    id: "tags",
    group: "organize",
    title: "태그와 태그 추천",
    summary: "제목 아래 태그 줄의 ‘+ 태그’를 누르면 작업 폴더의 기존 태그 가운데 이 글에 어울리는 것을 골라 보여 줘요. 이 글에 자주 나오는 낱말은 새 태그 후보로 나와요. 누르면 frontmatter의 `tags`에 들어가요.",
    steps: ["본문에 태그 이름이 나오는지, 그 태그가 붙은 글과 얼마나 비슷한지, 링크로 이어진 글의 태그를 살펴서 골라요.", "태그를 누르면 사이드바 ‘태그’ 탭에서 그 태그의 글을 봐요."],
    image: "tag-suggest",
    keywords: ["추천", "분류"],
  },
  {
    id: "properties",
    group: "organize",
    title: "글 속성",
    summary: "태그 줄 끝의 ‘속성’을 누르면 frontmatter(날짜, 상태, 출처 등)를 표로 보고 고쳐요. 값 고치기, 예/아니오는 체크 상자, 목록은 쉼표로, 이름 바꾸기·지우기·새 속성 더하기가 돼요.",
    steps: ["주석, 따옴표, `[a, b]` 같은 파일의 모양은 그대로 둬요.", "표로 고치기 어려운 값은 읽기만 해요."],
    image: "properties",
    keywords: ["frontmatter", "메타데이터", "yaml"],
  },
  {
    id: "backlinks",
    group: "organize",
    title: "연결 패널",
    summary: "오른쪽 ‘연결’ 탭에 이 글의 태그, 이 글을 가리키는 글(백링크), 이 글이 가리키는 링크가 보여요. 없는 글로 가는 링크는 눌러서 바로 만들어요.",
    image: "backlinks",
    keywords: ["백링크", "나가는 링크"],
  },
  {
    id: "graph",
    group: "organize",
    title: "그래프 보기",
    summary: "글과 `[[링크]]`를 그래프로 봐요. 고립된 글 숨기기, 아직 없는 글 보기, 글 찾기가 있어요. 사이드바 위의 그래프 아이콘으로 열고 닫아요.",
    image: "graph",
    keywords: ["지도", "네트워크"],
  },

  // ── 다듬기 ──
  {
    id: "spell",
    group: "polish",
    title: "맞춤법·문장 다듬기·표기 통일",
    summary: "맞춤법은 빨간 물결, 문장 다듬기는 파란 점선으로 알려 줘요. 겹말, 이중 피동, 번역투, 두 칸 띄어쓰기, 긴 문장, 한 문장 안의 같은 낱말, ‘~것이다’ 되풀이를 보고, 같은 말을 `웹사이트`와 `웹 사이트`처럼 섞어 쓴 곳도 찾아요.",
    steps: [
      "오른쪽 ‘맞춤법’ 탭에서 이 글의 항목을 앞뒤 글과 함께 모두 보고, 고치기·건너뛰기·항상 무시를 해요.",
      "온라인 검사(다음·네이버)는 문단 내용을 외부로 보내므로 설정에서 끌 수 있어요. 오프라인이면 건너뛰어요.",
    ],
    image: "spell",
    keywords: ["맞춤법", "퇴고", "표기", "다듬기"],
  },
  {
    id: "popover",
    group: "polish",
    title: "밑줄 위에서 바로 고치기",
    summary: "밑줄에 마우스를 올리면 이유를 설명하는 작은 창이 떠요. ‘바꾸기’로 고치거나, 이번만 건너뛰거나, 항상 무시해요.",
    image: "spell-popover",
    keywords: ["제안", "교정"],
  },
  {
    id: "style-settings",
    group: "polish",
    title: "다듬기 설정과 내 표기 사전",
    summary: "규칙별로 켜고 끄고, 긴 문장 기준(글자 수)을 바꿔요. 내 표기 사전에 `틀린 말 -> 고친 말`을 적어 두면 내 글에서 찾아 고치기를 제안해요.",
    steps: ["사전은 작업 폴더의 `.handy-writer/style.md` 파일이라 글과 함께 git으로 관리돼요."],
    image: "style-settings",
    keywords: ["사전", "규칙", "긴 문장"],
  },

  // ── 가져오기·내보내기·원고 ──
  {
    id: "extract",
    group: "share",
    title: "링크에서 글 가져오기",
    summary: "블로그·기사 주소를 넣으면 메뉴와 광고를 빼고 본문만 뽑아 마크다운으로 미리 보여 줘요. 새 글로 만들거나 지금 글에 넣어요. 유튜브 주소는 영상 설명과 자막을 가져와요.",
    steps: ["사이드바의 가져오기 버튼, 빈 화면, `/링크에서 가져오기`로 열어요.", "원래 주소는 frontmatter의 `source`와 맨 아래 출처 줄에 남아요."],
    image: "extract",
    command: { id: "note.extract", label: "링크에서 글 가져오기" },
    keywords: ["웹", "url", "유튜브", "스크랩"],
  },
  {
    id: "export",
    group: "share",
    title: "내보내기",
    summary: "아래 막대의 ‘내보내기’로 지금 글을 마크다운(frontmatter 포함), HTML(이미지가 파일 안에 들어가요), PDF, Word(.docx)로 저장해요. 블로그·메일에 붙여 넣을 서식 있는 복사도 있어요.",
    steps: ["Word에는 제목·목록·표·코드·인용·그림이 들어가고, 각주는 Word 각주가 돼요.", "영상·오디오·PDF 첨부는 이름만 남아요."],
    shortcuts: ["Mod+Shift+C"],
    image: "export",
    keywords: ["pdf", "word", "docx", "html", "복사", "저장"],
  },
  {
    id: "manuscript",
    group: "share",
    title: "원고 묶기",
    summary: "폴더 우클릭 ‘원고로 보기’로 폴더 안의 글을 장으로 묶어요. 끌거나 화살표로 순서를 바꾸고, 체크를 풀어 원고에서 빼고, 장별·전체 분량과 목표 진행률을 봐요.",
    steps: [
      "마크다운·웹 문서·PDF·Word로 한 파일로 내보내요. 장마다 제목이 붙고 각주와 그림 번호가 장끼리 겹치지 않아요.",
      "순서·뺀 장·목표는 작업 폴더의 `.handy-writer/manuscripts.json`에 남아 git으로 함께 관리돼요.",
    ],
    image: "manuscript",
    command: { id: "note.manuscript", label: "원고 보기 (지금 글의 폴더)" },
    keywords: ["책", "장", "묶기", "분량"],
  },
  {
    id: "templates",
    group: "share",
    title: "템플릿 블록",
    summary: "‘더 알아보기’, ‘Tip’ 같은 블록을 한 번 정의해 두고 슬래시 메뉴(`/더 알…`)나 AI 탭에서 어디서나 불러요. 내장 템플릿 5개(더 알아보기, Tip, 용어 풀이, 요약, 생각해 볼 질문)가 있어요.",
    steps: ["사용자가 직접 부를 때만 AI가 움직여요.", "파일에는 콜아웃과 숨은 메타데이터로 저장돼서 Obsidian에서는 일반 콜아웃으로 보여요."],
    image: "template-slash",
    keywords: ["블록", "콜아웃", "책"],
  },

  // ── AI ──
  {
    id: "ai",
    group: "ai",
    title: "AI 패널",
    summary: "오른쪽 ‘AI’ 탭에서 맞춤법 교정(바뀐 내용을 diff로), 다듬기, 이어쓰기, 지시대로 처리를 해요. 선택한 부분만, 선택이 없으면 본문 전체가 대상이에요.",
    steps: [
      "이어쓰기는 커서가 있는 문단을 마무리하는 글을 다섯 문장 안팎으로만 써요. 새 문단이나 글 끝까지 쓰지 않고, 커서 뒤에 이미 있는 글과 자연스럽게 이어지게 해요. ‘이어 붙이기’로 그 자리에 바로 붙이거나 ‘아래에 삽입’으로 새 블록에 넣어요.",
      "나의 글쓰기 룰(작업 폴더의 `.handy-writer/rules.md`)은 모든 AI 요청에 자동으로 들어가요.",
      "참고할 글을 고르거나 이 글이 링크한 글을 자동 포함하면 AI가 `[[글 이름]]`으로 출처를 밝혀 인용해요.",
      "컴퓨터에 설치되어 로그인된 Claude Code를 쓰므로 API 키가 필요 없어요. 로그인이 안 돼 있으면 방법을 순서대로 안내해요.",
    ],
    image: "ai",
    keywords: ["claude", "교정", "이어쓰기", "룰"],
  },
  {
    id: "draft",
    group: "ai",
    title: "AI 초안 만들기",
    summary: "주제·글 종류·목적·독자·문체·분량·꼭 넣을 내용을 적으면 목차를 만들고, 목차를 고친 뒤 그대로 초안을 써서 새 글로 만들거나 지금 글에 넣어요. 확실하지 않은 사실은 `(확인 필요)`로 표시해요.",
    steps: [
      "분량은 글자 수나 원고지 매수로 정하고, 만든 초안이 목표의 몇 %인지 보여 줘요.",
      "유튜브 주소(영상 설명·자막)나 프로젝트 폴더를 자료로 붙일 수 있어요.",
    ],
    image: "draft",
    command: { id: "note.draft", label: "AI로 초안 만들기" },
    keywords: ["목차", "초안", "자료"],
  },

  // ── 안전하게 쓰기 ──
  {
    id: "history",
    group: "safe",
    title: "변경 기록",
    summary: "git 커밋마다 이 글의 버전을 카드로 늘어놓고 ←/→로 넘겨요. 추가는 초록, 삭제는 빨강(취소선)으로 보이고, 고친 줄은 낱말 단위로 보여요. ‘이 버전으로 되돌리기’로 그때 내용을 다시 쓸 수 있어요.",
    steps: ["Home/End로 처음·끝, Space로 자동 재생, F로 전체 보기.", "커밋하지 않은 지금 내용도 한 장으로 나오고, 이름을 바꾼 글도 따라가요."],
    shortcuts: ["Mod+Shift+H"],
    image: "history",
    command: { id: "note.history", label: "변경 기록 보기" },
    keywords: ["버전", "git", "되돌리기", "diff"],
  },
  {
    id: "git",
    group: "safe",
    title: "Git 연동과 동기화 버튼",
    summary: "사이드바 왼쪽 아래의 브랜치를 누르면 Git 화면이 열려요. 변경 파일, 커밋, 가져오기, 푸시, 동기화(커밋 → 가져오기 → 푸시)를 해요. 브랜치 옆의 동기화 버튼은 올리거나 받을 것이 있을 때만 나타나요.",
    steps: [
      "자동 커밋(N분마다)과 자동 푸시, 앱을 열 때 가져오기를 설정할 수 있어요.",
      "가져오기가 충돌하면 병합을 되돌려 글에 `<<<<<<<` 표시가 남지 않게 해요.",
    ],
    image: "git",
    keywords: ["동기화", "커밋", "푸시", "원격"],
  },
  {
    id: "conflict",
    group: "safe",
    title: "저장 안전장치",
    summary: "저장할 때 고친 블록만 다시 쓰고 손대지 않은 부분은 원래 마크다운 그대로 둬요. 저장에 실패하면 2·4·8·16·30초 간격으로 다시 시도하고, 저장하지 못한 글이 있으면 창을 닫기 전에 물어봐요.",
    steps: [
      "저장하지 않은 내 변경이 있는데 다른 프로그램(Obsidian, git 등)이 같은 글을 바꾸면 덮어쓰지 않고 멈춰요.",
      "‘차이 보기’, ‘바깥 내용 불러오기’, ‘내 것으로 덮어쓰기’ 중에서 골라요.",
    ],
    image: "conflict",
    keywords: ["충돌", "재시도", "보존", "저장"],
  },

  // ── 앱 사용 ──
  {
    id: "settings",
    group: "app",
    title: "설정",
    summary: "작업 폴더, 글 너비, 목차·오른쪽 패널, 집중 모드, 맞춤법·문장 다듬기, AI·Git, 단축키·시작 안내·업데이트를 한곳에서 다뤄요.",
    shortcuts: ["Mod+,"],
    image: "settings",
    command: { id: "app.settings", label: "설정" },
    keywords: ["환경", "업데이트"],
  },
  {
    id: "shortcuts",
    group: "app",
    title: "단축키",
    summary: "명령 팔레트와 같은 목록에서 단축키가 있는 것만 묶음별로 보여 줘요.",
    shortcuts: ["Mod+/"],
    image: "shortcuts",
    command: { id: "app.shortcuts", label: "단축키 보기" },
    keywords: ["키", "shortcut"],
  },
];
