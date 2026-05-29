# yeulmaru-promo 세션 인계 — 2026-05-29

> 다음 세션: 이 파일 + CLAUDE.md 첨부하면 즉시 이어가기. transcript 의존 최소화.

## 작업 환경 (필수 — 이 방식만 손상 없음)
cmd 셸 + UTF-8 python REPL. PowerShell은 stdin이 자식 python에 안 넘어가 긴 한글 코드가 손상됨(rec['신청자']->rec 등).
- 시작: start_process(command='py -X utf8 -i', shell='cmd')  // -X utf8 필수(stdin UTF-8), py 런처는 한글경로 회피
- interact_with_process로 짧은 조각 전송. 회사 PC에서 GitHub API GET/PUT 직접 됨(방화벽 없음, 세웅이 보안담당·Azure 관리).
- 긴 코드: 300~600자 조각을 H+= 변수 조립, 통째 전송 금지. 조각마다 print(len(H),repr(H[-15:])) 검증.
- 멀티라인(while/for/if): exec('...\n...') 한 줄. 세미콜론은 단순문에만.
- 변수충돌 주의: brace-match depth=dp (d 쓰면 GitHub응답 d 덮어씀), 인덱스 ii/jj/kk, sha는 SHA.

## 좌표
- 레포: yeulmaru/yeulmaru-promo (Public, GitHub Pages). https://yeulmaru.github.io/yeulmaru-promo/
- PAT(Classic): ghp_***[PAT 전체: OneDrive 인계파일 좌표 또는 회사PC env 참조] (revoke 잔소리 금지)
- Worker: https://yeulmaru-promo-api.yeulmarumaster.workers.dev (Graph API -> SharePoint 통합 문서1.xlsm)
- 회사 PC OneDrive 클론: C:\Users\황세웅\OneDrive - GS칼텍스 예울마루\DAX\Sewoong Hwang\yeulmaru-promo (작업 후 git pull)
- GitHub API PUT: GET으로 SHA -> body{message,content:b64,sha,committer,author} -> PUT. message는 영어/ASCII 안전.

## records 27열 (A~AA)
A=No,B=입력시간,C=날짜,D=연도,E=월,F=일,G=요일,H=플랫폼1,I=플랫폼2,J=콘텐츠구분,K=프로그램,L=담당부서,M=콘텐츠제목,N=콘텐츠형식,O=콘텐츠내용,P=게시담당자,Q=진행상태,R=비고,S=신청자,T=결과_링크,U=결과_첨부URL,V=결과_비고,W=직전상태,X=상태변경KST,Y=보류사유,Z=재신청사유,AA=취소사유
- 진행상태값: '신청 중'(띄어쓰기),'예정','보류','취소','완료'
- getRecDateKey(r)=YYYY-MM-DD. buildRecordRow(rec,overrides) @216829: 27 pick+overrides, Y/Z/AA override 작동 확인.

## 완료 커밋 (이번 세션, 시간순)
- 503276e3 hold: 재신청건(Z존재) 보류시도->즉시취소(AA) / 일반보류->Y컬럼(비고prepend제거) / refSummary fix. async 유지.
- 47646c4f reapply: 보류상태만 허용(취소->재신청 루프차단) + canApprove(rec,rowIdx) 재검증 + Z=재신청사유. 전원알림은 3단계로 미룸.
- e0ad92c9 cancel(단건+bulk): AA=취소사유 컬럼 + 비고prepend제거 + refSummary fix. bulk취소도 같은 prepend였어서 통일.
- 9d0589ef Q1: canApplyOnDate 과거날짜 차단(dateKey<getTodayKey()). canApplyOnDateTime이 호출하므로 시간단위도 상속.
- 24763969 Q2: _checkSmsConflict 같은날->D±1 확장(문자 2연일 차단). 마케팅수신회원전체 구분값 없어서 문자 전체로 결정.
- (1단계) canApprove: 카카오 p1/p2=카카오톡 D±1 + 문자 /문자|SMS/ D±1. approve 게이트 admin도 차단. _checkKakaoConflict @293161.

## 진행중: Q-3 (오른쪽 사이드바 프로그램 좌클릭 -> 조회 팝업만)
세웅 지칭(스샷): 오른쪽 데스크탑 사이드바 '프로그램 일정' 항목 우클릭 메뉴 중 '홍보 현황'.
- 메뉴 빌더 onPerfContextMenu(event,target) @495232. 우클릭(oncontextmenu) 바인딩 @492107(perfCtxAttr, 주석 'onclick만 다름'), @493755(exhCtxAttr 전시).
- 메뉴 클릭 핸들러: view->openProgramView @497464(조회모달), promo->openPromoBoardForProgram @501259(홍보현황보드), url->window.open. 둘 다 우클릭 메뉴에서만 호출.
- 다음 단계: @492107 'onclick만 다름' 주변 봐서 사이드바 항목 좌클릭(onclick)이 뭘 호출하는지 확정 -> 세웅 의도 확인(좌클릭시 홍보현황 대신 조회만?).
- 참고: 캘린더 격자 막대 좌클릭 editRec(...,true) @473834는 이미 조회모달. 우클릭 '변경' @484069는 editRec(...,false)->위저드. Q-3 대상 아님.

## 잔여 작업
- 3단계: reapply/cancel에 PR_MANAGERS 전원알림(채워지는곳 확인 후) + 조회모달에 Y/Z/AA 사유 표시 분리.
- 그룹A: 진행상태 스텝표시 / 메시지함 '모두읽음' 버튼 / 모달X->캘린더 복귀.
- 별개: 18열 직접배열 경로(copyRec/saveEntry/onCellDrop) S~AA 누락 -> buildRecordRow 통일 권장.

## 검증
index.html 변경 -> GitHub Pages 1~2분 후 Ctrl+Shift+R. 작업 끝나면 OneDrive 클론에서 git pull.

## REPL 재개시
list_processes로 PID 확인. src 변수에 최신 index.html(GitHub GET+NFC) 로드돼있어야. TK=PAT, b64=base64, io/os/json/urllib import됨.
