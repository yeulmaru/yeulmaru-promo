# yeulmaru-promo — CLAUDE.md

> **예울마루 홍보 계획표 웹앱**  
> GS칼텍스 예울마루 직원이 홍보 콘텐츠 신청·관리를 위해 사용하는 단일파일 웹앱.  
> 기존 엑셀+VBA 매크로 워크플로우를 대체.  
>   
> **Last updated**: 2026-05-29 (KST)

> ⚠️ **대화 시작 시 첨부 룰**: yeulmaru-promo 작업할 때 이 파일을 채팅창에 첨부하면 매번 설명 안 해도 됨. 노뮤트 프로젝트와 동일 패턴.

---

## 1. 프로젝트 개요

- **레포**: [`yeulmaru/yeulmaru-promo`](https://github.com/yeulmaru/yeulmaru-promo) (Public, GitHub Pages)
- **사이트**: https://yeulmaru.github.io/yeulmaru-promo/
- **사용자**: GS칼텍스 예울마루 직원
- **인증**: PIN 4자리 (admin / user 2개 role)
- **메인 파일**: `index.html` (Vanilla JS 단일파일, ~7,100 lines, ~450KB)

## 2. 아키텍처

```
Client (index.html, GitHub Pages)
  ↓ fetch
Cloudflare Worker  (proxy)
  ↓ Graph API (Azure AD service account)
SharePoint Excel (통합 문서1.xlsm)
```

- **Frontend**: 단일 HTML, 외부 라이브러리 X, 모든 로직 inline
- **Backend**: Cloudflare Worker — Graph API 토큰 흐름 + SHEET_MAP slug 매핑
- **Storage**: SharePoint Excel (`통합 문서1.xlsm`)
- **Auth (Worker→Graph)**: Azure AD 앱 (service account)

### ⚠️ 데이터 흐름 — 헷갈리지 말 것 (다음 Claude 필독)

이 시스템엔 **완전히 별개의 두 흐름**이 공존한다. 섞으면 데이터 손상.

#### A. 데이터 흐름 (모달 변경 → Excel, 실시간 1~3초)

```
사용자 모달 → fetch → Cloudflare Worker → Graph API → SharePoint Excel 마스터
```

- 모달에서 일정 등록/수정/삭제 = **즉시** SharePoint 마스터 xlsm 반영 (1~3초)
- **OneDrive 동기화 안 거침** (그래서 빠름)
- 양 PC 로컬 xlsm 복사본은 *뒤늦게* OneDrive sync로 따라옴

#### B. 코드/파일 흐름 (수초~분)

```
회사 PC ↔ OneDrive 클라우드 (= SharePoint Document Library) ↔ 집 PC
```

- index.html, CLAUDE.md, docs/, .gitignore 등 *코드/문서 파일*
- OneDrive client가 변경 감지 → 양 PC + 클라우드 자동 반영
- 회사 PC `C:\Users\황세웅\...` ↔ 집 PC `C:\Users\Hwang\...` = **사용자명만 다르고 같은 파일** (OneDrive 안 경로 동일)

#### 🚨 절대 금지 — 로컬 xlsm 직접 편집

- 로컬 `통합 문서1.xlsm` = OneDrive sync로 받은 **복사본** (마스터 아님)
- 직접 편집 → OneDrive가 SharePoint에 push 시도 → Worker가 Graph API로 마스터 수정 중이면 **conflict copy 생성 + 데이터 손상**
- 그래서 `.gitignore`로 xlsm 차단 (`*.xlsm`) + **모든 데이터 변경은 반드시 모달에서만**
- `.xlsm` 로컬 파일은 *데이터 구조 참고용 read-only*로만 열 것

#### 변경 대상별 cheat sheet

| 변경 대상 | 어디서 | 흐름 | 속도 |
|---|---|---|---|
| 시트 데이터 (PIN/비번/홍보기록/일정/applysettings) | **모달** | Worker → Graph API → SharePoint Excel | 1~3초 |
| index.html / CSS / inline JS | **에디터 + git push** | GitHub → GitHub Pages | 1~2분 |
| Worker 코드 | **Cloudflare Quick Edit** 또는 wrangler | Cloudflare 배포 (git 무관) | 즉시 |
| CLAUDE.md / docs/ / README.md | **에디터 + git push** | GitHub (참고용, 시스템 동작 영향 X) | - |
| `통합 문서1.xlsm` 로컬 파일 | **🚫 절대 X** | (데이터 손상 위험) | - |

#### 헷갈리기 쉬운 포인트 정리

1. **"OneDrive sync로 데이터가 SharePoint Excel에 들어가는 거 아냐?"** → ❌ NO. Worker가 Graph API로 *직접 마스터 수정*. OneDrive 무관.
2. **"GitHub push하면 Excel 데이터도 바뀌나?"** → ❌ NO. GitHub는 index.html/Worker 코드만. Excel 데이터는 시스템 어디서도 git이 안 건드림.
3. **"회사 PC에서 작업한 게 집 PC에 안 보임"** → OneDrive sync 지연 (큰 파일/네트워크 느림). 5분 기다리거나 OneDrive 강제 sync. *git push한 코드는 git pull로 즉시 받기 가능*.
4. **"통합 문서1.xlsm 열어서 수동으로 한 줄 추가하면?"** → 🚨 conflict 위험. 데이터 백업하고 싶으면 *모달에서 export* 또는 SharePoint 웹에서 *읽기 전용 사본 다운로드*.

### Worker API 패턴
```
GET    /api/sheet/<slug>             → 시트 row 전체
POST   /api/sheet/<slug>             → row 추가 (body.values)
PATCH  /api/sheet/<slug>/<rowIndex>  → row 갱신
DELETE /api/sheet/<slug>/<rowIndex>  → row 제거
POST   /api/login                    → PIN 검증 → {ok, role}
POST   /api/records                  → records 시트 전용 (위 sheet/records와 별도)
```

### SHEET_MAP slug
- `applysettings` → `홍보접수설정`
- `records` → 신청 내역
- `programs` → 프로그램
- `platforms` → 플랫폼
- `contents` → 콘텐츠 형식
- `managers` → 담당자
- `special` → PromoSpecial (담당자 특별 일정)
- `logs` → 로그

## 3. 로컬 환경

- **회사 PC**: `C:\Users\황세웅\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo`
- **집 PC**: `C:\Users\Hwang\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo`
- **회사/집 동일 환경** — `$env:USERNAME` 자동 감지

### PowerShell 단축어
```powershell
클코프로모  # cd 프로젝트 + claude --dangerously-skip-permissions --remote-control
```

### Git 명령 (Windows)
```powershell
& "C:\Program Files\Git\bin\git.exe" -c user.name=yeulmaru -c user.email=yeulmarulicense@gmail.com commit -m "..."
```
- 작업 전 의무: `git fetch origin && git status`
- 한글 commit msg는 OneDrive 외부 파일에 utf8 저장 후 `-F`로 전달

## 4. GitHub 인증

- **계정**: `yeulmarulicense@gmail.com`
- **Classic PAT**: 7일 단위 재사용 OK (repo scope, yeulmaru 레포 한정)
- **Fine-grained**: Contents Read and write 권한 명시 필수 (없으면 PUT 막힘)
- **토큰 발급 URL**: https://github.com/settings/tokens/new?scopes=repo
- **바이브코딩 용도** — 매 turn revoke 잔소리 X, 만료/노출/오용 시점에만

## 5. 데이터 모델

### `APPLY_SETTINGS` (홍보접수설정 시트, 키-값 row)
```js
{
  접수ON: boolean,
  접수월: ['2026-06', '2026-07'],   // 배열, 최대 2개
  자동_낮에만: true,                  // 17:00~22:00 차단
  자동_일요일: true,                  // 일·월 차단 (시트 키 호환)
  자동_휴무: false                    // 모든 담당자 종일 충돌 시 차단
}
```
- 접수월은 시트에 **다중 row 허용** (같은 키 '접수월'로 row 2개)
- 헬퍼: `getApplyMonths()` / `getApplyMonthRows()` 로 배열/단수 둘 다 정규화

### `APPLY_EXCLUSIONS` (제외 일정, 같은 시트의 '제외' 키 row들)
```js
[
  {rowIndex, date: '', start: '18:00', end: '09:00'},   // 공통 시간 (모든 날)
  {rowIndex, date: '2026-06-17', start: '09:00', end: '14:00'},  // 개별
  {rowIndex, date: '2026-06-20', start: '', end: ''}    // 일자 차단 (그 날 전체)
]
```
시트 row 값 포맷: `"YYYY-MM-DD|HH:MM|HH:MM"` (date|start|end). 빈 값은 빈 문자열.

### `records` (신청 내역)
컬럼 순서:  
A=NO, B=입력시간(KST), C=날짜, D=연도, E=월, F=일, G=요일, H=플랫폼1, I=플랫폼2, J=콘텐츠구분, K=프로그램, L=담당부서, M=콘텐츠제목, N=콘텐츠형식, O=콘텐츠내용, **P=게시담당자**, Q=진행상태, R=비고, **S=신청자**, T=결과_링크, U=결과_첨부URL, V=결과_비고, W=직전상태, X=상태변경KST

> ⚠️ **신청자(S) ≠ 게시담당자(P)** — 자주 헷갈림 (다음 Claude 필독)
> - **`신청자`(S)** = 실제 신청한 본인 (= `sessionStorage.myApplicant`). UI 표시·메시지 recipient·"내 신청" 필터 전부 **이 컬럼** 기준.
> - **`게시 담당자`(P)** = 게시 담당자 지정값(`상관 없음` 또는 특정 담당자). 신청자와 별개.
> - 본인 판별 = `_isMineRec(rec, myAppl)`: 신청자(S) 우선, 빈값/`관리자`면 게시담당자(P) fallback.
> - 호버 툴팁·우클릭 안내·콘텐츠 조회 모달 전부 **신청자(S)** 표시 (2026-05-29 수정 — 이전엔 P 표시 버그).

### `PROMO_SPECIAL` (담당자 특별 일정)
```js
{
  _rowIndex, id, sheetNo,
  type: '휴무' | '출장' | '교육' | '회의' | '기타',
  label: string,            // 사용자 자유 입력
  start: 'YYYY-MM-DD',
  end: 'YYYY-MM-DD',
  time: 'HH:MM-HH:MM' | '',  // 빈값이면 종일
  person: string,            // 담당자
  author, kstStr
}
```

> **시간(`time`) 처리** (2026-05-29):
> - `time` 빈값 = 종일. `'HH:MM'`만 = 시작시각만(종료 미정).
> - **멀티데이(시작≠종료) + 종료시각 없음** → 캘린더 칸·모달 모두 `~18:00`으로 끊어 표시.
> - 시작시각 없어도(종일) **유형 그대로 표시** (이전 `typeStr='휴무'` 강제 제거).
> - 모달(`openSpecialView`)은 `it.time` 별도 컬럼을 읽어 시간 표시 (이전엔 start/end 공백분리만 봐서 시간 안 뜨던 버그 수정).
> - special 시트 컬럼: `#, 입력시간(KST), 시리얼, 시작일, 종료일, 시간, 유형, 내용, 담당자, 작성자, 비고`

### `MANAGERS` / `PR_MANAGERS`
- `MANAGERS`: 전체 담당자 (휴직 X)
- `PR_MANAGERS = MANAGERS.filter(m => isFlagOn(m['홍보여부']))` — 홍보 담당자만

## 6. 인증 / 권한

### 로그인 (개별 PIN + 관리자여부)
- 담당자 시트의 **개별 4자리 PIN**으로 로그인 (이전 "공유 PIN"에서 전환).
- **슈퍼admin**: PIN `0511` = Worker `ADMIN_PASSWORD`. `/api/auth` 직접 통과 → `role=admin`, `subAdminPin` 없음 (신원 없는 최고권한).
- **서브admin**: 담당자 PIN + `관리자여부=true` → `role=admin` + `sessionStorage.subAdminPin=PIN`. Worker엔 `X-Sub-Admin-PIN` 헤더로 인증 (`checkAdmin`).
- **일반 user**: 담당자 PIN + `관리자여부=false` → `role=user`.
- 비번 최초 설정: `/api/auth/set-password` (PIN으로 1회, 이미 설정 시 거부).
- 담당자 PIN(예): 황세웅 `2486`, 심희은 `4650`, 슈퍼admin `0511`.

### 🔑 신원·세션 저장 — 전부 sessionStorage (2026-05-29 변경, ★중요)
**`role` / `pw` / `subAdminPin` / `myApplicant`(이름) / `myUserDept`(부서) 모두 `sessionStorage`.** (이전엔 myApplicant/myUserDept만 localStorage라 문제)
- **왜**: `localStorage`=origin 전체(모든 탭) 공유, `sessionStorage`=탭별 격리. 섞어 쓰면 *탭A 관리자 / 탭B 일반사용자* 로그인 시 이름(localStorage)만 전파되고 권한(sessionStorage)은 탭별로 남아 **"OOO 님 [관리자]"** 신원 오염 발생.
- 전부 sessionStorage 통일 → 탭별 완전 격리. 한 브라우저 멀티계정 테스트도 안 섞임.
- 페이지 로드 시 `localStorage`의 myApplicant/myUserDept 잔재 자동 제거(오염원 청소).
- 헤더 role 배지(`updateRoleTag`)는 `userRole`(=`sessionStorage.role`) 기준.

### 본인 식별
- `sessionStorage.myApplicant` (담당자명 string). 로그인 시 PIN→담당자명으로 저장.
- `_isMineRec(rec, myAppl)`로 본인 신청 판별 (신청자 S 기준).

## 7. 핵심 함수

### 검증 (`canApply*`)
- `canApplyOnDate(dateKey)`: 일자 — 접수ON, 접수월, 자동_일요일, 자동_휴무(`allManagersConflict`), APPLY_EXCLUSIONS 일자
- `canApplyAtTime(time)`: 공통 시간 — 자동_낮에만, APPLY_EXCLUSIONS 공통
- `canApplyOnDateTime(dateKey, time)`: **통합 검증** — 위 둘 + 개별 제외 + 모든 담당자 시간 충돌

> **시간 정책**: `start ≤ time < end` (end 시점은 신청 가능)

### 충돌
- `personHasConflict(person, date, time)`: boolean
- `personConflictInfo(person, date, time)`: `{type, label}` | null
- `allManagersConflict(date, time)`: PR_MANAGERS 전원 충돌 여부

### 헬퍼
- `getApplyMonths()` / `getApplyMonthRows()`: 접수월 배열 정규화

## 8. UI 흐름

### 위저드 — User 신청
```
openPromoWizard(prefillDate?)
  → Step 1: 프로그램 (판매종료 ≥ _pwData.date)
  → Step 2: 콘텐츠 제목
  → Step 3: 일자 + 시간  (canApplyOnDateTime 검증)
  → Step 4: sub-steps (플랫폼, 게시자, 메시지 등)
  → Step 5: 확인
  → submitPromoRequest  (마지막 안전망 canApplyOnDateTime)
```

### 위저드 — Admin 직접 등록
```
openAdminWizard(prefillDate?)
  → Step 1: 담당자
  → Step 2: 일자 + 시간  (canApplyOnDateTime 검증)
  → Step 3: 플랫폼
  → Step 4: 콘텐츠 제목
  → submitAdminEntry  (마지막 안전망 canApplyOnDateTime)
```

### 우클릭 라우팅

| 우클릭 위치 | user | admin |
|---|---|---|
| 빈 셀 (당월) | 홍보 신청 / 신청 불가 안내 | 새 콘텐츠 등록 / 담당자 일정 추가 |
| 빈 셀 (비당월 빗금) | "이번 달이 아닙니다" | 동일 |
| 콘텐츠 row — 남 신청 | 살구색 "수정 불가 / OOO 님이 신청" | 수정/복사/삭제 |
| 콘텐츠 row — 본인 + '신청 중' | 살구색 "신청 대기 중" + 수정/취소 | 수정/복사/삭제 |
| 콘텐츠 row — 본인 + 그 외 | 수정/취소 | 수정/복사/삭제 |
| 특별 일정 항목 | 옅은 하늘색 "📌 홍보 담당자 일정 / OOO · 회의" | 수정/삭제 |

### 모달 헤더 표준
- X 닫기 버튼: `top:14px; right:14px`
- 뒤로 (`<`) 버튼: `top:14px; right:54px` (X 옆), 32×32 동그라미, SVG chevron
- 인라인 텍스트 "뒤로" 버튼은 모두 제거됨

### Step 4 게시자 자동 fallback (user)
- PR_MANAGERS 중 충돌 있는 사람은 select option `disabled` + `(해당 일시 {type} 중)` 표시
- 차단된 담당자가 있고 사용 가능한 1명만 남으면 자동 선택 + 살구색 말풍선
- 사용자가 명시적으로 선택한 경우 말풍선 안 뜸

## 9. 자동 옵션 의미

| 옵션 | 동작 |
|---|---|
| **자동_낮에만** | 17:00 ~ 22:00 시간대 신청 차단 (라벨 "낮에만" = 저녁·심야 차단 의미) |
| **자동_일요일** | 일(0) + 월(1) 차단. 화-토만 가능. (시트 키는 호환 위해 자동_일요일 유지) |
| **자동_휴무** | 모든 PR_MANAGERS가 종일 일정(휴무/출장 등) 충돌일 때 해당 날 전체 차단 |

## 10. 개발 워크플로우

### A. claude.ai 채팅 (모바일/웹/데스크탑) — 빠른 patch
1. Python 패치 작성
2. GitHub API `PUT /repos/yeulmaru/yeulmaru-promo/contents/index.html` 으로 직접 push
3. base SHA matching → 새 commit 생성

### B. PC 동기화
```powershell
cd "C:\Users\$env:USERNAME\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo"
& "C:\Program Files\Git\bin\git.exe" pull origin main
```

### C. Claude Code (`클코프로모`) — 토큰 노출 X
- 로컬 git 직접 작업, credential은 Windows Credential Manager
- 큰 변경/장기 작업에 적합

---

## 🚧 추후 추가 예정 (캘린더 기능 완료 후)

### 1️⃣ 이메일 알림 (Microsoft Graph API `sendMail`) — **A안 확정**

**목적**: 신청 등록/확정/취소 시 신청자·admin에게 알림 메일 자동 발신

**발신 계정**: 회사 M365 라이선스 1개 (남는 라이선스 활용, 공용 발신 계정으로 운용)

**구현 방식**:
1. 기존 Azure AD 앱(Worker가 사용 중)에 **`Mail.Send` 권한 추가** (Application permission)
2. Tenant admin consent
3. Worker에 `/api/notify/mail` 엔드포인트 추가
4. Graph API 호출: `POST https://graph.microsoft.com/v1.0/users/{발신계정}/sendMail`
5. 페이로드: `{message: {subject, body, toRecipients: [...]}}`

**트리거 시점**:
- user 신청 등록 → 신청자 본인 + admin(들)
- admin 확정 → 신청자
- admin 거절/취소 → 신청자
- user 자체 취소 → admin

**이점**:
- 기존 인프라 그대로 (Worker + Azure AD)
- 새 비용 0
- 발신 한도: 분당 ~30건, 일 ~10,000건 (Graph API 기본 한도)

**구현 시 확인 사항**:
- 발신 계정 실제 이메일 주소 (도메인 포함)
- 권한 추가 시 admin consent 필요 여부
- 발신자명 / 서명 포맷

---

### 2️⃣ Teams 알림 (보너스, 이메일 다음 단계)

**현재 환경 (2026-05-25 기준)**:
- ⚠️ **Incoming Webhook (Office 365 Connectors)는 2026-04-30 deprecated** — 신규 사용 불가
- ✅ **Power Automate Workflows** — 새 표준
- ✅ **Graph API `chatMessage`** — 코드 베이스 통합

**구현 옵션**:

**A. Power Automate Workflows** (가장 단순)
- Teams 채널 → "..." → Workflows → "Send webhook alerts to a channel" 템플릿
- 발급된 HTTP 트리거 URL을 Worker에서 POST
- Adaptive Card JSON 페이로드
- 단점: 채널 단위, 개인 DM 어려움

**B. Graph API `chatMessage`** (강력)
- 동일 Azure AD 앱에 권한 추가:
  - 채널 메시지 → `ChannelMessage.Send` (Application)
  - 개인 DM → `Chat.ReadWrite.All` (Application은 제한, Delegated 필요할 수도)
- 코드: `POST /teams/{teamId}/channels/{channelId}/messages`
- 단점: 개인 DM의 Application permission 정책 변동 가능 (구현 시 재확인)

**C. Adaptive Card 양방향** (최종 형태)
- 알림 카드에 "확정 / 거절" 버튼
- admin이 Teams 안에서 바로 처리 → Bot Framework 또는 Workflow 응답 처리
- 구현 복잡, 다만 UX 최고

**추천 순서**: 1차 **A (Workflows)** → 필요시 2차 **B (chatMessage)** → 향후 **C**

---

### 3️⃣ 그 외 검토 후보
- **사용자별 PIN / 본인 식별 강화** (현재 공유 PIN + 자유 myApplicant)
- **신청 상태 변경 admin 워크플로우 (대량 처리, 일괄 확정 등)**
- **모바일 반응형 추가 점검**

---

## 외부 API

### Naver Cloud Platform Maps API (Phase A2 협력기관 30개 여수시 지도)
- **위치**: NCP Console > **Services > VPC > Maps > Application** ⚠️ (AI·NAVER API 아님)
- **Application 이름**: yeulmaru-promo
- **Client ID**: `12kxk8z3z0` (Dynamic Map, public — JS 코드에 노출 OK)
- **Client Secret**: NCP 콘솔에서 별도 확인 (server-side API에만 필요)
- **등록된 Web URL**:
  - `https://yeulmaru.github.io/yeulmaru-promo`
  - `https://yeulmaru.github.io/yeulmaru-promo/`
- **무료 한도**: 월 100만 호출 (충분)
- **사용 예시**:
```html
<script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=12kxk8z3z0"></script>
```
- **주의**: `AI·NAVER API > Application`에 만든 동명 yeulmaru-promo (Client ID `sgzrzp8ucm`)는 CAPTCHA·Search Trend용이라 Maps 호출 시 429 에러. 안 씀.

---

## 변경 이력

### 2026-05-29 (세션 17 — Phase A1)

**플랫폼 현황 트리뷰 풀스크린 모달**
- `showComingSoon('플랫폼 현황')` placeholder → `openPlatformBoard()`로 교체
- `PLATFORM_TREE` const 추가 (오프라인 4그룹: 관외/관내/망마/장도, 온라인 5채널)
- `openPlatformBoard` / `closePlatformBoard` 모달 일체 (+255 lines, 9514→9769)
- 트리 펼침/접힘, 좌340 트리 + 우측 상세, 타입별 분기 (external/samsung-tizen/did/did-network/lamp-banner-print/signboard/electronic-board/pending)
- ESC/배경/X 닫기, pending opacity 0.6 + 미진행 뱃지

**Q3 — 캘린더 perf badge 좌클릭 매핑 정정** — `e0408d9`
- 좌클릭 `openPromoBoardForProgram` → `openProgramView` (handoff 의도: 조회 모달)
- `data-perf-name` + `this` 패턴으로 사이드바와 통일 (escape 안전, 사이드바 L8700 패턴 차용)
- 셀 onclick/oncontextmenu에 `event.target.closest('.perf-badge')` 방어 가드 추가
- duplicate `style` 속성 제거 (cursorStyle 분리)

### 2026-05-29 (세션 16)

**신청자 표시 버그 수정 (게시담당자 P → 신청자 S)** — `ee37c65`
- 캘린더 호버 툴팁("OOO 님이 신청 중") `게시담당자`→`신청자` (이전 "상관 없음 님이…" 오표시 원인)
- 호버 툴팁 본인 판별 `(게시담당자===myAppl)` → `_isMineRec`(S 기준)
- 우클릭 "남의 일정 안내"도 `게시담당자`→`신청자`
- 콘텐츠 조회 모달(`renderReadOnlyView`)에 **신청자 row 추가** (일시 위, S열)
- DB 점검(47건): 신청자(S) 오염 **0건** — 표시 버그였고 데이터는 정상

**담당자 일정 표시 개선** — `1c16fdc`, `c4590b4`
- 멀티데이(시작≠종료)+종료시각 없음 → 캘린더 칸·모달 `~18:00`로 끊어 표시
- 특별일정 모달(`openSpecialView`)이 `it.time` 컬럼 읽도록 수정 (시간 안 뜨던 버그)
- 시작시각 없는 종일 일정 `typeStr='휴무'` 강제 제거 → 유형 그대로
- 교육(`_rowIndex=9`) time `09:00`→`09:00 - 18:00` 데이터 보강

**신원 sessionStorage 격리** — `046907f`
- myApplicant/myUserDept를 localStorage→sessionStorage 이전 (탭간 신원 오염 방지) + localStorage 잔재 청소

---

### 2026-05-27 ~ 28 (세션 12~13)

**메시지함/알림 시스템 완성**
- pushMessage recipient: `게시 담당자`→`신청자` 통일 (5개 hook: approve/hold/cancel/complete/reject). 관리자에게 잘못 뜨던 알림을 실제 신청자에게 전달.
- 메시지 클릭 → `openScheduleRow`로 콘텐츠 상세 모달 진입 + 비고 사유 강조(`formatMemoCell`)
- `markMsgRead`: 읽음 처리 + badge 감소 + navigate (refNo로 record 매칭)
- `rejectPromo`: 사유 입력(`_renderCancelReasonModal`) + 신청자 메시지 푸시 추가 (기존 빈 hook 완성, trigger 신청→반려)

**변경 컬럼 재신청**
- `reapplyPromoRequest`: 취소 OR 보류 둘 다 허용 (`_curSt`)
- 변경 컬럼에 `canMineReapply` 블록 (일반 사용자 본인 취소/보류 → "↩ 재신청" 버튼)

**버그 fix**
- `markMsgRead` onclick 백슬래시 3→1 (클릭 무동작 → 정상). HTML onclick에 `\'` 들어가 JS SyntaxError 나던 것.
- `markMsgRead` dateKey: `rec['날짜']`(없는 컬럼)→`getRecDateKey(rec)` (모달 진입 빈값 에러)
- `renderReadOnlyView`: `modal-form` null 참조 제거 (콘텐츠 조회 "null.style" 에러). modal-form은 DEPRECATED로 삭제됐는데 참조 잔존.
- `approvePromoFromBoard`: `rec`→`r` 변수 (ReferenceError, pushMessage 실패하던 것)
- `_msgApiCall`: 401도 60초 throttle (콘솔 noise 제거)
- dead code 정리: 담당자 일정 드래그 핸들러의 잘못 복붙된 pushMessage 제거

**헤더 UI**
- "홍보 계획표" 부제(`nav-sub`) 제거, 실시간 시계(`id=kst`) 제거
- 환영 메시지 "님 환영합니다"→"님" (헤더 `_wel` + 로그인 토스트 둘 다)

**B-1 MSAL OneDrive 폴더 트리**
- `_MSAL_CONFIG` + `_msalFetchOneDriveChildren` + `openFolderTreeModal` (PublicClientApplication, PKCE, Files.Read)
- Azure AD `yeulmaru_dashboard` 앱에 **SPA 플랫폼** + redirectUri 등록 (`https://yeulmaru.github.io/yeulmaru-promo/`, trailing slash 필수). Web 플랫폼 아님(CORS).
- MSAL CDN 2.35.0 + 이중 fallback (alcdn.msauth → msftauth → jsdelivr). v3부터 CDN 미지원.
- Brave Shields ON 시 popup `user_cancelled` → Shields OFF로 우회.

**Worker(src/index.js) 백업** (474815d)
- `checkAdmin`(서브admin 인증 + 5분 매니저 캐시 `getManagersCached`), `autoCancelStalePending`(보류 3일 자동취소 cron, `scheduled` 핸들러), `isFlagOn`
- 로컬에만 있던 Worker 기능을 GitHub에 백업. 로컬 클론(OneDrive)↔GitHub 88 behind 해소·완전 동기화.


### 2026-05-24 ~ 25 (세션 10~11)
| commit | 내용 |
|---|---|
| `7ff80fe` | 신청 불가 메시지 우선순위 + 사유별 표현 개선 |
| `14d3bed` | UX 4건 — `.dn` 간격, 비당월 우클릭, 알림 타이틀 숨김, 뒤로 아이콘 통일 |
| `91066b7` | 담당자별 일정 충돌 + 판매종료 기준 변경 |
| `ad8a50a` + `2a08b0c` | 접수월 복수 (최대 2개) — 데이터 모델 + 헬퍼 함수 마무리 |
| `0a2fb9a` | Step 3 시간 검증 통합 (낮에만/공통제외/개별제외 모두 차단) |
| `3578c76` | Step 4 게시자 — 충돌 type 표시 + 자동 fallback + 말풍선 |
| `d646eec` | 콘텐츠 우클릭 4가지 케이스 분기 (admin/남신청/본인신청중/본인기타) |
| `e235cb6` | admin 직접 등록 흐름(`validateAwStep` Step 2 + `submitAdminEntry`) 검증 누락 fix |
| `46f7098` | 담당자 일정 우클릭 user 안내 ("📌 홍보 담당자 일정") |

---

## 알아두면 좋은 패턴 / 트러블슈팅

### 시트 키-값 다중 row
- `홍보접수설정` 시트는 키-값 row 구조. 같은 키로 여러 row 가능 (예: 접수월 2개).
- POST → 새 row 추가, PATCH → 특정 row 갱신, DELETE → row 제거

### 셀 비당월 (nm)
- 흐릿 + 빗금 패턴, `cursor:default`
- 우클릭 시 `onCellContextMenu` 안에서 `event.currentTarget.classList.contains('nm')` 분기 처리

### "신청 중" 상태 — 띄어쓰기 주의
- 시트 값: 한국어 `'신청 중'` (가운데 띄어쓰기 포함)
- 모든 비교 코드가 이 형식 사용. 띄어쓰기 빠지면 매칭 실패.
- 신규 신청 기본값 = `'신청 중'`. admin 확정 시 `'확정'` 등으로 변경.

### Cloudflare Worker 변경 시
- `wrangler deploy` 또는 Cloudflare dashboard에서 배포
- `SHEET_MAP` 변경 시 frontend slug와 정합성 확인

### GitHub Pages 캐시
- push 후 1~2분 대기 (Pages 빌드/배포)
- 강제 새로고침: `Ctrl + Shift + R` (또는 시크릿창)
- 캐시 이상 시 사용자에게 안내 필요

### Untracked 로컬 파일 (현재 로컬에만 있는 것)
- `README.md`, `_CLAUDE.md.local`, `index.js`, `index2.html`, `통합 문서1.xlsm`
- git에 포함 안 됨 (의도된 분리). 동기화에 영향 X.


### 신원이 탭마다 섞일 때 (2026-05-29 해결)
- **증상**: 한 브라우저서 admin+일반user 번갈아 로그인 → "나민혁 님 [관리자]" 등 이름/권한 불일치
- **원인**(해결 전): `myApplicant`=localStorage(공유) vs `role`=sessionStorage(탭별) → 이름만 탭 간 전파
- **해결**: 신원·세션 전부 sessionStorage. 확인 콘솔:
  `console.log('role:',sessionStorage.getItem('role'),'| myApplicant:',sessionStorage.getItem('myApplicant'),'| localStorage잔재:',localStorage.getItem('myApplicant'))`
  → localStorage잔재가 `null`이어야 정상.


---

## 세션 로그 — 2026-05-29 (2단계 상태머신 + Q1/Q2 완료)

**환경 돌파**: cmd 셸 + py -X utf8 -i REPL로 한글·긴코드 무손상 패치 확립. 회사 PC에서 GitHub API GET/PUT 직접(방화벽 없음, 세웅 보안담당). PowerShell stdin 미전달 문제 해결.

**완료 커밋**:
- 503276e3 hold (재신청건 보류시도->취소AA, 일반보류->Y컬럼, refSummary fix)
- 47646c4f reapply (보류상태만+canApprove재검증+Z컬럼)
- e0ad92c9 cancel 단건+bulk (AA컬럼, 비고prepend제거)
- 9d0589ef Q1 과거날짜 신청차단
- 24763969 Q2 문자 D±1 2연일 차단

**진행중 Q-3**: 오른쪽 사이드바 프로그램 우클릭 메뉴 '홍보현황'(openPromoBoardForProgram @501259) / '조회'(openProgramView @497464). 좌클릭 onclick 핸들러 @492107 확정 필요. 상세는 인계파일 260529_yeulmaru-promo_handoff 참조.

**잔여**: 3단계(PR_MANAGERS 전원알림, 조회모달 Y/Z/AA 표시분리), 그룹A(진행상태 스텝/모두읽음/모달X복귀).


---

## 작업 로그 — 2026-05-31 (세션 20: 로그인 무한루프 + PIN 우회 백도어 대수술)

집 PC(Hwang), Desktop Commander + 직접 수정. 로그인 흐름의 두 가지 치명 버그를 **콘솔 진단으로 추적·수정**. 최종 HEAD = `377ee4a`.

### 버그 A — 로그인 후 PIN 입력칸이 안 뜨고 "Microsoft 인증 확인 중" 무한
원인이 여러 겹이었음(하나씩 벗겨냄):

1. **TDZ 크래시**: reload 후 페이지 로드 IIFE가 `goToPinStep()`을 즉시 호출 → 그 시점엔 `MANAGERS`(let) 선언 전 → `ReferenceError: Cannot access 'MANAGERS' before initialization` → goToPinStep 즉사. **수정**: IIFE의 `_resumePin` 분기에서 `setTimeout(function(){goToPinStep(true)},0)`로 한 틱 미룸 (커밋 7f90d8f).
2. **COOP 후폭풍 회피 → reload 방식 도입**: MSAL `loginPopup` 직후 같은 페이지에서 화면을 PIN칸으로 전환하면 COOP(`Cross-Origin-Opener-Policy would block window.closed`) 잔여가 화면을 흔듦. → `switchMsAccount`/`msLogin`/`_doSwitchUser`는 loginPopup 성공 시 `localStorage._resumePin=email` 저장 후 **`location.reload()`**. reload된 깨끗한 페이지의 IIFE가 `_resumePin` 보고 loginPopup 없이 바로 PIN칸 재개 (커밋 b08b77a).
3. **fadeUp은 범인 아니었음**: `.login-card{animation:fadeUp}` opacity 0→1 의심했으나, `[pinFix]` 진단 로그로 `login.disp=flex op=1 card.op=1 vis=visible` 확인 → opacity/display 정상인데도 안 보였음 = CSS 문제 아님. (방어용 강제표시 폴백만 _enterPinInputStep에 남겨둠.)
4. **진짜 A 범인 = backToAccountStep이 화면 재렌더 안 함**: `[계정 다시 선택]`(backToAccountStep)이 `account-step.style.display=''`로 보이게만 하고 innerHTML을 계정목록으로 다시 안 그림 → goToPin이 넣어둔 "Microsoft 인증 확인 중" 문구가 그대로 남아 멈춤. **수정**: backToAccountStep 끝에서 `initLoginScreen()` 호출 → 계정목록 재렌더 (커밋 377ee4a).

### 버그 B — PIN 없이 통과되는 백도어 (보안)
- **원인**: `goToPinStep`/`_authWithEmail`이 관리자목록(`loadManagers`) 불러오려고 PIN 검증 **전에** `password='0510'`(SUPER 백도어 비번)을 박음. PIN 안 맞추고 취소해도 안 비워져 → 전역 `password=0510` 살아있는 한 모든 api가 관리자로 통과. 또 한 번 로그인하면 `sessionStorage.pw='0510'`이 남아 재진입 시 IIFE가 PIN 검증 없이 `initApp()`.
- **수정** (커밋 eff5171):
  - `_fullLogout()` 헬퍼 신설: `password=''`, `userRole='user'`, sessionStorage의 `pw/role/myApplicant/myUser/subAdminPin` 전부 제거.
  - `backToAccountStep` 진입 시 `_fullLogout()` 호출.
  - `msLogin` 취소 분기에서 `_fullLogout()`.
  - `goToPinStep`에서 loadManagers 끝나면 즉시 `password=''` 복구 (검증 전 백도어 비번 잔존 차단).
  - => 로그아웃/취소 후 재진입 시 MS인증+PIN 둘 다 다시 요구 (정상 보안 동작).

### 검증 결과 (시크릿창)
- OK: ems1130 선택 → PIN칸 정상
- OK: [계정 다시 선택] → 계정목록 복귀 → 재선택 → PIN칸
- OK: 로그아웃 후 재진입 → PIN 다시 요구 (우회 차단 확인)

### 남은 정리거리 (다음 세션, 기능엔 무해)
- **미정리 진단 로그** (콘솔에만, 사용자엔 안 보임): `[goToPin]`, `[pinInput] ENTER/DONE`, `[pinFix]`, `[DIAG-0ms]/[DIAG-500ms]`, `[backToAccount]`, `[fullLogout]`, `[initLogin] CALLED`, MutationObserver `[pinGuard]`.
- **A 폴백** (_enterPinInputStep의 login/card 강제표시 + `[pinFix]` 로그): 실제 효과 불확실하나 무해. 정리 시 빼고 테스트.
- **`_pinGuardInstalled` MutationObserver / `_pinActive` 가드**: 두더지잡기 흔적. reload 방식 도입 후엔 사실상 불필요할 수 있음 — 빼기 전 반드시 테스트.
- **백업 파일** `index.html.bak_260531` (untracked, 수정 전 스냅샷): 정리 확정되면 삭제.
- 정리 커밋은 "로그 한 줄씩 빼고 → 시크릿창 테스트" 반복으로 안전하게. 한 번에 다 빼지 말 것.

### 커밋 흐름 (이 세션)
`e9d967e`(진단) → `7f90d8f`(TDZ setTimeout) → `b08b77a`(reload 방식) → `eff5171`(버그B 로그아웃 + A 폴백) → `377ee4a`(backToAccount 재렌더) = 현재 HEAD.

### 이 세션에서 배운 디버깅 원칙
- 추측 패치 금지. **콘솔 진단 로그 먼저 박고 → 사용자가 시크릿창 캡처 → 원인 확정 → 수정**. (Claude는 브라우저 콘솔 못 봄 → 사용자 핑퐁 필수.)
- "DOM상 block/visible인데 화면 안 보임" 모순은 **상위 컨테이너 / 재렌더 누락 / 다른 함수의 되돌림**을 의심.
- 커밋 작게, 한 변경 후 즉시 테스트. 새 설계 충동이 와도 원인 특정되면 보통 10줄 안쪽 수정으로 끝.
