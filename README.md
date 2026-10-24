# Handy Writer

글쓰기를 도와주는 로컬 우선 데스크톱 앱. 글은 작업 폴더의 마크다운(`.md`) 파일로 저장돼서 Obsidian이나 git과 그대로 같이 쓸 수 있어요.

## Stack

Electron · electron-vite · React · TypeScript · Tailwind CSS v4 · shadcn/ui · Tiptap · zustand · pnpm

## Scripts

```bash
pnpm dev          # 개발 모드 실행
pnpm typecheck    # 타입 체크
pnpm test         # 단위 테스트 (vitest)
pnpm build        # 프로덕션 빌드
pnpm test:e2e     # 빌드된 앱을 실제 Electron으로 띄우는 E2E (먼저 pnpm build, 리눅스는 xvfb-run -a 필요)
pnpm test:e2e:ime # 한글 조합 입력(IME)과 맞춤법 표시 E2E (실제 composition 이벤트를 흘려보냄)
pnpm test:e2e:templates # 템플릿 블록 E2E (가짜 claude로 웹 검색·삽입·내보내기까지)
pnpm build:mac    # 맥 설치 파일 (dmg)
pnpm build:win    # 윈도우 설치 파일
pnpm build:linux  # 리눅스 설치 파일
```

## 기능

- 작업 폴더 선택 (Obsidian 볼트, git 저장소 폴더도 그대로 사용 가능)
- 사이드바: 폴더 트리, 글 검색, 새 글, 삭제(휴지통)
- 노션 같은 에디터: `/` 블록 메뉴, 블록 드래그 핸들, 선택 서식 툴바, 할 일·표·코드 블록
- `[[위키링크]]` (`[[` 자동완성, 클릭 이동), Obsidian 콜아웃(`> [!note]`)
- frontmatter는 에디터에 보이지 않고 저장할 때 그대로 보존
- 자동 저장 (내용을 바꿨을 때만 파일을 씀), 다른 프로그램이 바꾼 파일 자동 반영
- 전체 검색 (`Ctrl/Cmd+K` 또는 `Ctrl/Cmd+P`): 제목·태그·본문 검색, 일치한 단어 강조, 결과를 열면 그 단어로 이동, 입력이 없으면 최근 글 이 글의 태그, 백링크, 나가는 링크 (없는 글은 눌러서 바로 생성)
- 태그: frontmatter `tags`와 본문 `#태그`(중첩 `#a/b` 포함), 사이드바 태그 탭, 본문 태그 칩 클릭
- 없는 글로 가는 `[[링크]]`는 흐리게 표시
- 그래프 보기: 글과 링크를 force 그래프로 표시 (고립된 글 숨기기, 없는 글 보기, 글 찾기)
- AI 패널(오른쪽 `AI` 탭): 맞춤법 교정(변경 내용 diff), 다듬기, 이어쓰기, 지시대로 처리. 선택한 부분만, 선택이 없으면 본문 전체가 대상
- 나의 글쓰기 룰: 작업 폴더의 `.handy-writer/rules.md` (git으로 글과 함께 관리), 모든 AI 요청에 자동 포함
- 참고할 글: 직접 고르거나 이 글이 링크한 글을 자동 포함하면, AI가 `[[글 이름]]`으로 출처를 밝혀 인용
- 첨부 탭: 이 글의 이미지·영상·오디오·PDF를 한 줄씩 접어서 보여주고, 눌러서 펼치면 미리보기와 라벨(캡션) 수정. 너비·높이는 '크기 조정'에 따로 있고, 크기를 정하지 않으면 항상 글 폭 100%로 표시. 붙여넣기, 끌어다 놓기, `/이미지·영상·파일`, `첨부 추가`로 `attachments/` 에 저장
- 첨부 문법은 Obsidian 호환: `![[파일.png|라벨|300]]`, `![[파일.png|300x200]]`, 일반 마크다운 `![라벨|300](경로)` (읽은 문법 그대로 다시 씀)
- Git 연동 (`Git` 탭, 시스템 `git` 사용): 저장소 만들기, 변경 파일 목록, 커밋, 가져오기, 푸시, 동기화(커밋→가져오기→푸시), 원격 주소 연결, 사이드바의 브랜치 상태와 변경 표시
- 자동화: 자동 커밋(N분마다)과 자동 푸시, 앱을 열 때 가져오기. 설정은 컴퓨터별로 저장돼서 git에 올라가지 않음
- 안전한 충돌 처리: 가져오기가 충돌하면 병합을 되돌려 글에 `<<<<<<<` 표시가 남지 않음 (강제 푸시, reset은 하지 않음)
- 글 이름을 바꾸면 다른 글의 `[[링크]]`도 새 이름으로 자동 수정 (섹션, 별칭, 코드 블록 보존)
- 맞춤법: 입력하는 대로 규칙 기반 검사(자주 틀리는 표기 사전, 라이브러리 없음). 온라인이면 문단 텍스트를 다음/네이버 맞춤법 검사기(hanspell)로도 보내 더 넓게 검사하고, 오프라인이면 건너뜀. **기본 켜짐이며 문단이 외부 서비스로 전송되므로** 하단 메뉴에서 끌 수 있음 (코드·URL·#태그는 보내지 않음)
- 템플릿 블록: 책의 "더 알아보기", "Tip" 같은 블록을 한 번 정의해 두고 어디서나 호출. 아래 '템플릿 블록' 참고

## 템플릿 블록

템플릿은 작업 폴더의 `.handy-writer/templates/*.md` 파일이에요(git으로 글과 함께 관리). 앞부분 frontmatter에 이름·제목·입력 필드·참고 범위를 적고, 본문이 AI에게 줄 지침이에요. 지침에서는 `{{필드}}` 치환만 쓸 수 있어요.

```md
---
name: 더 알아보기
title: 더 알아보기
fields:
  - { key: topic, label: 주제, type: text, required: false }
  - { key: depth, label: 분량, type: select, options: [짧게, 보통, 자세히], default: 보통 }
context: section   # selection | section | note | none
web: true          # false면 웹 검색 없이 참고한 글과 본문으로만
---
'{{topic}}'과 관련해 독자가 더 찾아볼 만한 내용을 {{depth}} 분량으로 써 주세요.
```

- 호출: 슬래시 메뉴(`/더 알…`) 또는 AI 탭의 템플릿 목록의 `사용`. 사용자가 직접 호출할 때만 AI가 움직여요.
- 필수 값을 비워 두면 AI가 본문 맥락으로 정해요. 기본 참고 범위는 현재 섹션(가까운 소제목부터 다음 소제목 전까지)이에요.
- 웹 검색(`WebSearch`, `WebFetch`)은 템플릿 단위로 켜고 끌 수 있어요. 검색 결과는 오래됐거나 틀릴 수 있어 미리보기에 "AI가 쓴 내용이니 사실을 확인하세요"가 표시되고, 출처를 적도록 지시해요. 템플릿 지침이 나의 글쓰기 룰보다 우선해요.
- 결과는 앱 전용 블록이에요. 파일에는 콜아웃(`> [!note]`) + 숨은 메타데이터 주석(`<!--hw-template {...}-->`)으로 저장되고, 내보낼 때는 `stripTemplateMetadata`가 메타를 떼어 실제 콘텐츠만 넘겨요. Obsidian에서는 일반 콜아웃으로 보여요.
- 내장 템플릿 5개(더 알아보기, Tip, 용어 풀이, 요약, 생각해 볼 질문)는 수정하면 같은 이름 파일로 저장되고 '기본값으로 되돌리기'로 복원돼요.

## Structure

```
src/
├── main/       # Electron main process (파일 I/O, IPC, 파일 감시)
├── preload/    # contextBridge API
├── shared/     # main/preload/renderer 공용 타입
└── renderer/   # React app (app / widgets / features / entities / shared)
```

## AI 연동

로컬에 설치되어 로그인된 [Claude Code](https://claude.com/claude-code) CLI(`claude`)를 자식 프로세스로 실행해요. 앱에는 API 키가 필요 없어요.

- 프롬프트는 stdin으로 넘기고, 도구는 모두 끈 채(`--tools ""`)로 텍스트만 받아요.
- `claude`를 못 찾으면 환경변수 `HANDY_WRITER_CLAUDE_PATH`로 경로를 지정할 수 있어요.
- 개발 모드 E2E는 `e2e/fake-claude.mjs`(같은 stream-json 형식)로 돌아서 네트워크가 필요 없어요.

## Git 연동

앱에 내장된 git 구현 대신 컴퓨터에 설치된 `git`을 그대로 실행해요. 그래서 이미 설정해 둔 SSH 키와 자격 증명이 그대로 쓰이고, Obsidian Git과 같은 폴더를 함께 써도 돼요.

- 인증이 필요한 상황에서 멈추지 않도록 프롬프트를 끄고(`GIT_TERMINAL_PROMPT=0`), 실패하면 터미널에서 할 일을 안내해요.
- 커밋하는 사람 정보(`user.name`, `user.email`)는 git 설정을 따라요.
- 작업 폴더가 더 큰 저장소의 하위 폴더여도 그 폴더 안의 변경만 다뤄요.

## 설치 파일과 자동 업데이트

- 설치 파일: `pnpm build:mac`(dmg+zip), `pnpm build:win`(nsis), `pnpm build:linux`(AppImage). 결과는 `dist/`에 생겨요. 각 운영체제에서 빌드해야 해요.
- 배포: `package.json`의 `version`을 올리고 `v0.2.0` 같은 태그를 푸시하면 `.github/workflows/release.yml`이 세 운영체제 설치 파일을 만들어 GitHub Release에 올려요.
- 업데이트: 설치한 앱은 시작 15초 뒤와 6시간마다 새 버전을 확인하고 자동으로 내려받아, 사이드바 아래에 '다시 시작해서 설치'를 보여줘요(안 눌러도 앱을 끌 때 설치). 개발 모드와 AppImage가 아닌 리눅스 실행에서는 꺼져 있어요.
- 주의: 업데이트 피드는 `gyeongseokKang/handy-writer`의 GitHub Release예요. **저장소가 private이면 앱이 피드를 읽지 못해요.** 저장소를 public으로 바꾸거나, 설치 파일만 올리는 public 저장소를 따로 만들어 `electron-builder.json`의 `publish`를 바꿔야 해요(앱에 토큰을 넣지 마세요).
- macOS에서 '손상되었기 때문에 열 수 없습니다'가 뜨면 서명되지 않은 앱을 내려받았을 때 생기는 격리 표시 때문이에요. `/Applications`에 옮긴 뒤 터미널에서 `xattr -cr "/Applications/Handy Writer.app"`를 실행하면 열려요. (빌드는 임시 서명(ad-hoc)을 하지만 Apple 공증은 없어요.)
- 주의: macOS는 코드 서명·공증이 없으면 자동 업데이트가 동작하지 않고 처음 실행 때 경고가 떠요. Windows는 서명이 없어도 업데이트되지만 SmartScreen 경고가 떠요. 서명 인증서는 아직 설정하지 않았어요.

## 로드맵

- [x] 앱 셸, 파일 기반 저장
- [x] 에디터 (슬래시 메뉴, 위키링크, 콜아웃)
- [x] 링크 색인: 백링크, 태그, 그래프
- [x] AI 패널 (Claude Code CLI): 글쓰기 룰, 맞춤법 교정, 이어쓰기와 인용
- [x] git 연동

## 라이선스

MIT (`LICENSE`)
