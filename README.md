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
- 연결 정보 패널: 이 글의 태그, 백링크, 나가는 링크 (없는 글은 눌러서 바로 생성)
- 태그: frontmatter `tags`와 본문 `#태그`(중첩 `#a/b` 포함), 사이드바 태그 탭, 본문 태그 칩 클릭
- 없는 글로 가는 `[[링크]]`는 흐리게 표시
- 그래프 보기: 글과 링크를 force 그래프로 표시 (고립된 글 숨기기, 없는 글 보기, 글 찾기)
- AI 패널(오른쪽 `AI` 탭): 맞춤법 교정(변경 내용 diff), 다듬기, 이어쓰기, 지시대로 처리. 선택한 부분만, 선택이 없으면 본문 전체가 대상
- 나의 글쓰기 룰: 작업 폴더의 `.handy-writer/rules.md` (git으로 글과 함께 관리), 모든 AI 요청에 자동 포함
- 참고할 글: 직접 고르거나 이 글이 링크한 글을 자동 포함하면, AI가 `[[글 이름]]`으로 출처를 밝혀 인용
- Git 연동 (`Git` 탭, 시스템 `git` 사용): 저장소 만들기, 변경 파일 목록, 커밋, 가져오기, 푸시, 동기화(커밋→가져오기→푸시), 원격 주소 연결, 사이드바의 브랜치 상태와 변경 표시
- 자동화: 자동 커밋(N분마다)과 자동 푸시, 앱을 열 때 가져오기. 설정은 컴퓨터별로 저장돼서 git에 올라가지 않음
- 안전한 충돌 처리: 가져오기가 충돌하면 병합을 되돌려 글에 `<<<<<<<` 표시가 남지 않음 (강제 푸시, reset은 하지 않음)
- 글 이름을 바꾸면 다른 글의 `[[링크]]`도 새 이름으로 자동 수정 (섹션, 별칭, 코드 블록 보존)

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

## 로드맵

- [x] 앱 셸, 파일 기반 저장
- [x] 에디터 (슬래시 메뉴, 위키링크, 콜아웃)
- [x] 링크 색인: 백링크, 태그, 그래프
- [x] AI 패널 (Claude Code CLI): 글쓰기 룰, 맞춤법 교정, 이어쓰기와 인용
- [x] git 연동
