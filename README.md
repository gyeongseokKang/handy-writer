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

## Structure

```
src/
├── main/       # Electron main process (파일 I/O, IPC, 파일 감시)
├── preload/    # contextBridge API
├── shared/     # main/preload/renderer 공용 타입
└── renderer/   # React app (app / widgets / features / entities / shared)
```

## 로드맵

- [x] 앱 셸, 파일 기반 저장
- [x] 에디터 (슬래시 메뉴, 위키링크, 콜아웃)
- [ ] 링크 색인: 백링크, 태그, 그래프
- [ ] AI 패널 (Claude Code CLI): 글쓰기 룰, 맞춤법 교정, 이어쓰기와 인용
- [ ] git 연동
