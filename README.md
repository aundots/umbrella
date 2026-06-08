# 우산챙겨 (umbrella)

앱인토스 미니앱 — 30분·1시간 강수 실시간 중계

## 구조

```
weather/
├── apps/umbrella/     # React Native 앱인토ss (granite + SDK 2.x)
├── server/            # Fastify API + KMA 연동
└── assets/            # 로고·썸네일
```

## 1. 백엔드

```bash
cd server
cp .env.example .env
# DATA_GO_KR_SERVICE_KEY=aimarketing에서 발급받은 키 입력
npm install
npm run dev
```

- `http://localhost:3001/health`
- `http://localhost:3001/relay?lat=37.5665&lng=126.978`
- `http://localhost:3001/legal/terms` — 서비스 이용약관 (토스 콘솔 URL)
- `http://localhost:3001/legal/privacy` — 개인정보 처리방침

## 2. 미니앱

```bash
cd apps/umbrella
npm install
npm run dev      # 토스 샌드박스 연결
npm run build    # umbrella.ait 생성 (Linux/macOS 권장)
```

> **Windows 참고:** `ait build`는 경로 이스케이프 이슈로 Windows에서 실패할 수 있습니다. GitHub Actions(`Build umbrella.ait` 워크플로)로 빌드하거나 Linux/WSL에서 실행하세요.

앱인토ss 패키지는 토스 npm 레지스트리 로그인이 필요할 수 있습니다.

## 3. Vercel 배포 (umbrella)

GitHub `umbrella` 레포 연결 후 Vercel에서 **Root Directory = `server`** 로 설정합니다.

| Vercel 설정 | 값 |
|-------------|-----|
| Project Name | umbrella |
| Root Directory | server |
| Build Command | npm run build |
| Output Directory | (비움) |

**Environment Variables** (Vercel 대시보드):

```
DATA_GO_KR_SERVICE_KEY=...인코딩키...
```

배포 후 URL 예:

- `https://umbrella.vercel.app/health`
- `https://umbrella.vercel.app/legal/terms` — 토스 콘솔 서비스 이용약관 URL
- `https://umbrella.vercel.app/legal/privacy`

미니앱 `apps/umbrella/src/config.ts`의 `API_BASE_URL`을 Vercel URL로 변경하세요.

## 4. 콘솔 정보

| 항목 | 값 |
|------|-----|
| appName | umbrella |
| displayName | 우산챙겨 |
| 부제 | 비 언제 오고 언제 그치는지 |

## API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/relay?lat=&lng=` | 실시간 중계 |
| GET | `/relay/all?userKey=` | 저장 위치 전체 |
| POST | `/users/register` | 알림 동의 |
| CRUD | `/locations` | 즐겨찾기 |

## 환경변수 (server/.env)

기상청 **초단기·동네예보** API는 전부 [공공데이터포털](https://www.data.go.kr)에서 받으며, 인증키는 **2종류만** 있습니다.

| 종류 | 사용 |
|------|------|
| **Encoding (인코딩)** | ✅ `.env`에 이것만 넣기 |
| **Decoding (디코딩)** | ❌ 사용 안 함 |

```
DATA_GO_KR_SERVICE_KEY=...%2B...%3D%3D   ← 인코딩 키 (% 포함)
```

- `PORT` — 기본 3001

> **참고:** [기상청 API허브](https://apihub.kma.go.kr)는 별도 사이트·별도 `authKey`입니다. 레이더(HSR)·MAPLE은 나중에 API허브에서 추가 신청합니다. MVP(초단기예보)는 공공데이터포털 **인코딩 키 하나**면 됩니다.
