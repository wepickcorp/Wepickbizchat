# wepick x SKT 비즈챗 (BizChat) 광고 관리 플랫폼

## Overview
wepick x SKT BizChat is an advertising management platform for sending SMS/MMS/RCS campaigns to 16 million SK Telecom customers who have consented to receive advertisements. It enables small business owners to create campaigns with a minimum budget of ₩100,000, leveraging SK CoreTarget for effective, targeted advertising. The platform handles campaign creation, targeting, billing, and performance reporting.

## User Preferences
- Korean language (한국어) for all UI text
- 당근마켓-inspired friendly UX writing tone
- Light mode only
- Mobile-responsive design

## System Architecture
The project utilizes a modern web stack with React 18, TypeScript, and Vite for the frontend, and Vercel Serverless Functions for the backend. Data is managed with PostgreSQL (Neon) via Drizzle ORM, and authentication is handled by Supabase Auth (JWT-based). The UI is built using shadcn/ui, Tailwind CSS, and Lucide Icons, with TanStack Query v5 for state management and Wouter for routing. Deployment is managed through Vercel.

**Key Features:**
- **Landing Page**: Introduction to the SKT BizChat service with a login call-to-action.
- **Auth Page**: User authentication via Supabase email/password.
- **Dashboard**: Overview of campaigns, statistics, and quick actions.
- **Template System**: Workflow for creating, submitting, approving, and rejecting message templates.
- **Campaign Wizard**: A 3-step process for campaign creation (template selection, targeting, budget).
- **Campaign Management**: List, filter, search, and manage advertising campaigns.
- **Billing**: Balance charging and transaction history, integrated with Stripe.
- **Reports**: Analytics and performance metrics for campaigns.
- **AI Features**: Generate ad copy, validate content, and request Goeonyeon (고언연) inspection.

**UI/UX Decisions:**
- **Primary Color**: SKT Red (#E84040).
- **Font**: Pretendard Variable.
- **Border Radius**: 8px (rounded-lg).

**System Design Choices:**
- Vercel Serverless Functions for scalable backend logic.
- Supabase for robust authentication and user management.
- Drizzle ORM for type-safe database interactions.
- BizChat API integration for core advertising functionality, including campaign creation, approval, and real-time statistics, with strict adherence to BizChat API v0.29.0 specifications.
- **BizChat API 환경 설정**: 개발 완료 전까지 모든 API 호출은 개발 URL(gw-dev.bizchat1.co.kr:8443)로 전송됩니다. `BIZCHAT_USE_PROD=true` 환경변수를 설정해야만 운영 API를 사용합니다.
- **KIS PG 환경 설정**: 기본값으로 테스트 API(testapi.kispg.co.kr)를 사용합니다. `KISPG_USE_PROD=true` 환경변수를 설정해야만 운영 API(api.kispg.co.kr)를 사용합니다. `KISPG_RETURN_URL` 환경변수로 콜백 URL을 명시적으로 지정할 수 있습니다 (예: `https://wepickbizchat-new.vercel.app/api/kispg/callback`).
- **마스터 계정 시스템**: `is_master=true`로 설정된 계정은 매일 자정(UTC) Vercel Cron Job에 의해 광고 캐시가 1억원(100,000,000원)으로 자동 리셋됩니다. 현재 마스터 계정: campaign@wepick.kr. `CRON_SECRET` 환경변수로 Cron API 보안 적용.
- **관리자 시스템**: 별도의 관리자 인증 체계와 대시보드를 통해 플랫폼 운영을 관리합니다.
  - **관리자 로그인**: `/admin/login` - SHA256 해시 기반 비밀번호 인증
  - **관리자 계정**: admin2026@wepick.co.kr / admin1234 (super 권한)
  - **권한 체계**: super (전체 권한), cs (고객지원), finance (재무)
  - **환경변수**: `ADMIN_JWT_SECRET`, `ADMIN_SALT`
  - **기능**: 대시보드(/admin), 유저관리(/admin/users), 캠페인모니터링(/admin/campaigns), 결제내역(/admin/transactions), 활동로그(/admin/logs)
- Elimination of local sender number CRUD in favor of BizChat-managed sender numbers.

## External Dependencies
- **SKT BizChat 3rd Party API**: For sending SMS/MMS/RCS advertisements, managing campaigns, ATS target audience estimation, file uploads (MMS images), sender number management, template management, and AI features.
- **Supabase**: Authentication and user management.
- **PostgreSQL (Neon)**: Main database.
- **Stripe**: Payment processing for balance charging.
- **Vercel**: Deployment and serverless function hosting.