# yeulmaru-promo — CLAUDE.md

> **예울마루 홍보 계획표 웹앱** — GS칼텍스 예울마루 직원이 홍보 콘텐츠 신청·관리하는 단일파일 웹앱. 엑셀+VBA 대체.
> **Last updated**: 2026-06-01 (KST) · **현재 HEAD**: `2a73525`
>
> 이 파일은 **청사진(구조·환경·함정·원칙)만** 담는다. 컬럼 순서·함수 시그니처·UI 흐름 같은 세부는 **`index.html`을 직접 grep/검색**해서 확인할 것. 과거 변경이력 전체는 `docs/CLAUDE_full_backup_260601.md`.

---

## ⚡ 0. 환경 제약 — 작업 전 필독 (여기서 안 읽으면 100% 헛발질함)

집/회사 PC 동일 환경. **집=`Hwang`, 회사=`황세웅`** (OneDrive 안 경로 동일, `$env:USERNAME`로 자동감지). 기본 셸 = **PowerShell 5.1**. 한글 경로.

### 🚫 하지 말 것 (전부 실제로 당한 함정)
- **cmd에서 `cd /d "한글경로"`** → 코드페이지 949에서 한글 깨져 "디렉터리 이름이 잘못되었습니다" → git이 엉뚱한 데서 돌아 `not a git repository`. → **cmd 쓰지 말고 PowerShell.**
- **PowerShell에서 `& $git ... | Out-String`** (네이티브 exe 파이프) → `CantActivateDocumentInPipeline` 에러. git stdout이 통째로 안 잡힘.
- **`git`을 PATH로 호출** → 세션에 따라 안 잡힘. **항상 풀패스** `C:\Program Files\Git\bin\git.exe`.
- **로컬 `index.html`을 PATH의 python/node로** → 집 PC는 PATH에 python/node 없음. 풀패스: `C:\Program Files\nodejs\node.exe`.

### ✅ 검증된 패턴 (그대로 복붙)

**git 실행** (파이프 금지 → Start-Process + 파일 리다이렉트):
```powershell
$git="C:\Program Files\Git\bin\git.exe"
$repo="C:\Users\$env:USERNAME\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo"
$o="$env:TEMP\g_o.txt"; $e="$env:TEMP\g_e.txt"
function G([string[]]$x){ Start-Process -FilePath $git -ArgumentList $x -WorkingDirectory $repo -NoNewWindow -Wait -RedirectStandardOutput $o -RedirectStandardError $e; $oc=Get-Content $o -Raw -EA SilentlyContinue; $er=Get-Content $e -Raw -EA SilentlyContinue; if($oc){$oc}; if($er){"[err] "+$er} }
G @('fetch','origin'); G @('status','--short','-b'); G @('log','--oneline','-3')
```
> git push 진행상황은 `[err]`(stderr)로 나와도 정상. 한글 commit msg는 ASCII 파일에 저장 후 `-F`:
> ```powershell
> Set-Content "$env:TEMP\cmsg.txt" -Value "fix: ..." -Encoding ASCII -NoNewline
> G @('-c','user.name=yeulmaru','-c','user.email=yeulmarulicense@gmail.com','commit','-F',"$env:TEMP\cmsg.txt")
> ```

**index.html 수정** (한글·대용량 무손상, BOM 없이):
```powershell
$p="$repo\index.html"
$c=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)
# 반드시 count 검증 후 교체 (유니크 1개 확인, 아니면 ABORT)
$cnt=([regex]::Matches($c,[regex]::Escape($old))).Count   # 1이어야 함
$c=$c.Replace($old,$new)
[IO.File]::WriteAllText($p,$c,(New-Object Text.UTF8Encoding $false))  # no BOM, CRLF 유지
```
> 큰 교체 전 `Copy-Item $p "$p.bak_YYMMDD"` 백업. 개행은 CRLF(``r`n``).

**JS 문법 체크** (커밋 전, 문법 깨지면 페이지 전체 죽음):
```powershell
$node="C:\Program Files\nodejs\node.exe"
$ms=[regex]::Matches($c,'(?s)<script>(.*?)</script>'); $main=$null
foreach($m in $ms){ if($m.Groups[1].Value.Contains('goToPinStep')){ $main=$m.Groups[1].Value; break } }
[IO.File]::WriteAllText("$env:TEMP\chk.js",$main,(New-Object Text.UTF8Encoding $false))
Start-Process -FilePath $node -ArgumentList @('--check',"$env:TEMP\chk.js") -NoNewWindow -Wait -RedirectStandardOutput $o -RedirectStandardError $e
Get-Content $e -Raw   # 비어있으면 OK
```

### 단축어 / 패치 경로
- **클코프로모**: `cd "C:\Users\$env:USERNAME\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo"; claude --dangerously-skip-permissions --remote-control`
- **모바일/웹 빠른 패치**: GitHub API `PUT /repos/yeulmaru/yeulmaru-promo/contents/index.html` (base SHA matching). cmd + `py -X utf8 -i` REPL로 한글 무손상.
- **DC(Desktop Commander)**: `start_process` 안정적. 단 대용량 파일은 위 .NET ReadAllText/Replace 패턴 권장.

---

## 1. 시스템 구조

```
Client (index.html, Vanilla JS 단일파일 ~7,100줄, GitHub Pages)
  ↓ fetch
Cloudflare Worker (proxy, src/index.js)   ← yeulmaru-promo-api.yeulmarumaster.workers.dev
  ↓ Graph API (Azure AD service account)
SharePoint Excel "통합 문서1.xlsm" (= 데이터 마스터)
```
- 외부 라이브러리 X(MSAL CDN 제외), 모든 로직 inline. accent color `#4A4DE7`(보라, 변경금지).
- **레포**: `yeulmaru/yeulmaru-promo` (Public) · **사이트**: https://yeulmaru.github.io/yeulmaru-promo/ (push 후 1~2분 배포지연)
- **Worker API**: `GET/POST/PATCH/DELETE /api/sheet/<slug>`, `/api/login`, `/api/auth`, `/api/records`. slug: `applysettings/records/programs/platforms/contents/managers/special/logs`.

---

## 2. 🚨 데이터 흐름 — 두 갈래, 섞으면 데이터 손상

| 무엇을 바꾸나 | 어디서 | 경로 | 속도 |
|---|---|---|---|
| **시트 데이터** (PIN/홍보기록/일정/설정) | **모달에서만** | Worker→Graph→SharePoint 마스터 | 1~3초 |
| index.html / CSS / JS | 에디터+git push | GitHub→Pages | 1~2분 |
| Worker 코드 | Cloudflare Quick Edit/wrangler | (git 무관) | 즉시 |
| CLAUDE.md / docs | 에디터+git push | GitHub (동작 영향 X) | - |

- **모달 데이터 변경은 OneDrive 안 거침** — Worker가 Graph API로 마스터 xlsm 직접 수정. OneDrive sync는 로컬 복사본을 뒤늦게 따라오게 할 뿐.
- 🚫 **로컬 `통합 문서1.xlsm` 직접 편집 절대 금지** — OneDrive가 SharePoint에 push 시도 → Worker 수정과 충돌 → conflict copy + 손상. `.gitignore`로 `*.xlsm` 차단됨. **데이터 구조 참고용 read-only로만** 열 것.
- 회사 PC↔집 PC 코드 동기화는 OneDrive(느릴 수 있음) + git pull(즉시). GitHub push는 Excel 데이터를 안 건드림.

---

## 3. 🚨 신청자(S) ≠ 게시담당자(P) — 자주 헷갈림

`records` 시트: **S열=신청자**(실제 신청 본인 = `sessionStorage.myApplicant`), **P열=게시담당자**(지정값, `상관 없음` 또는 특정인).
- UI 표시·메시지 수신자·"내 신청" 필터 **전부 신청자(S) 기준**.
- 본인 판별 = `_isMineRec(rec, myAppl)` — S 우선, 빈값/`관리자`면 P fallback.
- 호버툴팁·우클릭안내·조회모달 전부 S 표시 (P 표시하면 "상관없음 님이 신청…" 버그 재발).

---

## 4. 인증 모델

- 담당자 시트의 **개별 4자리 PIN**으로 로그인 (MSAL로 MS 신원 확인 + PIN 둘 다 통과해야 입장).
- **슈퍼admin**: PIN `0511` = Worker `ADMIN_PASSWORD` 직통 → `role=admin` (신원 없는 최고권한).
- **서브admin**: 담당자 PIN + `관리자여부=true` → `role=admin` + `sessionStorage.subAdminPin` (Worker엔 `X-Sub-Admin-PIN` 헤더).
- **일반 user**: 담당자 PIN + `관리자여부=false`.
- **신원·세션 전부 `sessionStorage`** (`role/pw/subAdminPin/myApplicant/myUserDept`). localStorage 쓰면 탭간 신원 오염("OOO 님 [관리자]"). 페이지 로드 시 localStorage 잔재 청소함.
- MSAL: clientId `9f3a0105-aa86-4a8b-bad0-bd651688d854`, SPA 플랫폼, redirectUri는 trailing slash 필수. Brave Shields ON이면 popup `user_cancelled` → Shields OFF.
- ⚠️ **MSAL loginPopup 후 같은 페이지에서 화면전환하면 COOP가 깨뜨림.** → loginPopup 성공 시 `localStorage._resumePin=email` 저장 후 `location.reload()`, 새 페이지에서 PIN칸 재개하는 방식 사용 (세션20).
- ⚠️ 관리자목록(`loadManagers`) 로드용으로 `password='0510'`을 임시로 박는데 **반드시 직후 `password=''` 복구** (안 하면 PIN 우회 백도어). 로그아웃/취소 시 `_fullLogout()` 호출 필수.

---

## 5. 작업 원칙

1. **작업 전 `git fetch + status` 의무.** 어느 커밋 위에 있는지부터.
2. **추측 패치 금지.** 브라우저 콘솔은 Claude가 못 봄 → **진단 로그 박고 → 사용자가 시크릿창 캡처 → 원인 확정 → 수정**. (세션20 핵심 교훈)
3. **커밋 작게, 한 변경마다 즉시 테스트.** "새로 다 엎자" 충동 와도 원인 특정되면 보통 10줄 안쪽으로 끝남.
4. **"DOM상 block/visible인데 화면 안 보임"** 류 모순 → 상위 컨테이너 / 재렌더 누락 / 다른 함수의 되돌림 의심.
5. 교체는 항상 **count 검증**(유니크 1개 확인 후 Replace, 아니면 중단).
6. GitHub 인증: 계정 `yeulmarulicense@gmail.com`, Classic PAT(repo scope) 7일 재사용 OK / Fine-grained는 Contents R&W 명시 필수. 토큰값 메모리 저장 X. 만료·노출·오용 시점에만 revoke 언급.

---

## 6. 현재 상태 (2026-06-01)

- **HEAD `2a73525`** — 세션20에서 로그인 무한루프 + PIN 우회 백도어 대수술 끝. 안정.
  - 버그A(PIN칸 무한): TDZ(`MANAGERS`)→setTimeout, COOP→reload방식, backToAccountStep이 `initLoginScreen()` 재렌더.
  - 버그B(PIN우회): 전역 `password='0510'` 잔존 → `_fullLogout()` + loadManagers 후 복구.
- **남은 정리거리** (기능 무해, 다음에): 진단로그 떨거지(`[goToPin]/[pinFix]/[DIAG]/[fullLogout]/[backToAccount]/[initLogin]`), `_pinGuard` MutationObserver / `_pinActive` 가드(reload 도입 후 불필요할 수 있음), 백업 `index.html.bak_260531`. **로그 한 줄씩 빼고 시크릿창 테스트** 원칙.
- **진행중 Q-3**: 캘린더 프로그램 좌클릭 → 조회모달(`openProgramView`). 사이드바 좌클릭 onclick(`@492107` 부근) 확정이 인계 포인트.
- **잔여 기획**: 이메일 알림(Graph `sendMail`, A안 확정 — Azure AD 앱에 `Mail.Send` 추가 + `/api/notify/mail`), Teams 알림(Power Automate Workflows 우선), 조회모달 Y/Z/AA 표시분리, PR_MANAGERS 전원알림.

---

## 7. 더 깊은 정보가 필요하면

- **컬럼 순서/데이터 모델/함수 시그니처/UI 흐름 상세/자동옵션/우클릭 라우팅** → `index.html` 직접 검색. (이 파일에 박제하면 코드와 어긋남)
- **과거 변경이력 전체(세션 10~20)** → `docs/CLAUDE_full_backup_260601.md`
- **Q-3 등 인계** → `docs/260529_yeulmaru-promo_handoff_064500.md`
- **외부 API**: Naver Maps(NCP VPC>Maps, Client ID `12kxk8z3z0`) — 상세는 백업 파일.
