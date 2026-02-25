# WePick Bizchat - API 구조 변경 참고서
> 이 문서는 AI 또는 개발자가 현재 프로젝트 구조를 이해하기 위한 참고 문서입니다.
> 코드 수정/생성 시 반드시 이 구조를 따라야 합니다.

## 변경 배경

Vercel의 Static IPs(Secure Compute) 환경에서 70개 이상의 Serverless Function이
배포 크기/시간 제한을 초과하여 Production 배포가 반복 실패했습니다.
이를 해결하기 위해 70개 API를 **1개의 catch-all 라우터**로 통합했습니다.

---

## 현재 구조 (변경 후)

```
프로젝트 루트/
├── api/
│   └── router.js          ← 유일한 Serverless Function (esbuild 번들 결과물)
├── src/
│   ├── api-router.ts      ← 라우터 소스 (빌드 시 api/router.js로 번들됨)
│   └── handlers/           ← 기존 api/ 핸들러들이 이동된 위치
│       ├── admin/
│       │   ├── login.ts
│       │   ├── me.ts
│       │   ├── campaigns.ts
│       │   └── ...
│       ├── bizchat/
│       ├── campaigns/
│       └── ... (기존 api/ 하위 구조 그대로)
├── script/
│   └── build.ts            ← 빌드 스크립트 (Vite + esbuild)
├── shared/                 ← 공통 스키마, 유틸리티
├── server/                 ← 서버 관련 모듈
└── vercel.json
```

## 이전 구조 (변경 전) — 더 이상 사용하지 않음

```
api/
├── admin/login.ts          ← 개별 Serverless Function (70개+)
├── admin/me.ts
├── bizchat/campaigns.ts
└── ...
```

---

## 핵심 파일 설명

### 1. `src/api-router.ts`
- 모든 API 요청을 받아 해당 핸들러로 라우팅
- `import * as` 구문으로 각 핸들러를 정적 import
- URL 경로를 파싱하여 segments 배열로 매칭
- 동적 파라미터 ([id], [userId] 등)를 req.query에 주입
- `bizchat/maptics.ts`는 유틸리티 파일이므로 라우트에 미등록

### 2. `script/build.ts`
- Vite로 클라이언트 빌드 후, esbuild로 API 라우터 번들링
- **format: "esm"** (package.json에 "type": "module" 설정)
- **packages: "external"** (npm 패키지는 번들에 미포함)
- **banner**로 require, __dirname, __filename ESM 호환 심(shim) 주입
- **resolve-handler-paths 플러그인**: src/handlers/ 내 상대경로 import를
  원래 api/ 위치 기준으로 해석 (../../shared/schema 등이 정상 동작)

### 3. `api/router.js`
- git에 ESM placeholder로 커밋됨 (Vercel이 함수로 감지하도록)
- 빌드 시 esbuild가 이 파일을 번들 결과로 덮어씀
- **api/router.ts는 존재하면 안 됨** (TS가 JS보다 우선 컴파일되어 충돌)

### 4. `vercel.json`
```json
{
  "buildCommand": "npm run build",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/router" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```
- 모든 /api/* 요청이 api/router로 전달됨
- functions 설정 없음 (Vercel 자동 감지)

---

## 새 API 엔드포인트 추가 방법

1. `src/handlers/` 아래에 핸들러 파일 생성 (export default function handler 필수)
2. `src/api-router.ts`에 import 추가 및 routes 배열에 등록
3. 커밋 & 푸시 → 빌드 시 자동으로 번들에 포함

---

## 절대 하면 안 되는 것

- **api/ 폴더에 직접 .ts 핸들러 파일 생성 금지** → 개별 함수로 인식되어 원래 문제 재발
- **api/router.ts 파일 생성 금지** → router.js보다 우선 컴파일되어 번들 결과 무시됨
- **vercel.json에 functions 설정 추가 금지** → 빌드 전 패턴 체크로 실패할 수 있음
- **esbuild format을 cjs로 변경 금지** → "type": "module" 프로젝트라 ESM 필수
