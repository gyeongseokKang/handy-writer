# Handy Writer

글쓰기를 도와주는 데스크톱 앱.

## Stack

Electron · electron-vite · React · TypeScript · Tailwind CSS v4 · shadcn/ui · zustand · pnpm

## Scripts

```bash
pnpm dev          # 개발 모드 실행
pnpm typecheck    # 타입 체크
pnpm build        # 프로덕션 빌드
pnpm build:mac    # 맥 설치 파일 (dmg)
pnpm build:win    # 윈도우 설치 파일
pnpm build:linux  # 리눅스 설치 파일
```

## Structure

```
src/
├── main/       # Electron main process
├── preload/    # contextBridge API
└── renderer/   # React app (app / features / shared)
```
