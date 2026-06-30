#!/usr/bin/env node
// '홍보기록'(records) 시트에 '임시저장' 헤더(AC열) 1개 추가 — 임시저장(draft) 분리 키
//
// 배경(2026-06-30): 임시저장을 진행 상태='임시' 한 열에만 두면 앞으로 추가될 상태-필터 코드가
//   '임시'를 빠뜨려 누수가 날 수 있음(사용자 지적). → 전용 '임시저장' 컬럼을 추가하고, loadData에서
//   이 컬럼으로 records와 _DRAFTS를 분리 → records엔 임시저장이 절대 안 들어가 모든 집계/필터가 구조적으로 안전.
//
// ⚠️ 이 헤더가 없어도 앱은 동작함(진행 상태='임시' 폴백으로 분리). 다만 헤더가 있어야
//   '임시저장' 플래그('Y')가 키로 읽혀 컬럼이 깔끔하게 작동함. 권장 1회 실행.
//
// 사용:
//   미리보기: DB_PW=<관리자비번> node docs/260630_records_draft_col_ingest.mjs
//   적용:     DB_PW=<관리자비번> node docs/260630_records_draft_col_ingest.mjs --write
//   (서브admin이면 DB_PIN=<핀> 추가)
//
// Worker 변경 불필요(records 쓰기는 values.length로 컬럼 폭 자동 확장).

const BASE = process.env.BASE || 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '';
const PIN = process.env.DB_PIN || '';
const WRITE = process.argv.includes('--write');
const AUTH = { 'Content-Type': 'application/json', 'X-App-Password': PW, 'X-Sub-Admin-PIN': PIN };

// 시트가 비었을 때를 대비한 표준 28헤더(순서 = records 컬럼 A~AB)
const FALLBACK_HEADERS = ['No','입력시간(KST)','날짜','연도','월','일','요일','플랫폼 1','플랫폼 2','콘텐츠 구분','프로그램','담당 부서','콘텐츠 제목','콘텐츠 형식','콘텐츠 내용','게시 담당자','진행 상태','비고','신청자','결과_링크','결과_첨부URL','결과_비고','직전 상태','상태 변경 KST','보류사유','재신청사유','취소사유','공연ID'];

async function main() {
  if (!PW && !PIN) { console.error('DB_PW 또는 DB_PIN 환경변수가 필요합니다.'); process.exit(1); }

  const res = await fetch(BASE + '/api/records', { headers: AUTH });
  if (!res.ok) { console.error('GET /api/records 실패', res.status, await res.text()); process.exit(1); }
  const { records } = await res.json();
  console.log('records 행 수:', (records || []).length);

  // 현재 헤더 순서 = 첫 행 객체의 키(삽입 순서). 비었으면 표준 헤더 사용.
  let headers;
  if (records && records.length) {
    headers = Object.keys(records[0]).filter((k) => k !== '_rowIndex');
  } else {
    headers = FALLBACK_HEADERS.slice();
    console.log('(행이 없어 표준 28헤더 사용)');
  }
  console.log('현재 헤더:', headers.join(' | '));

  if (headers.includes('임시저장')) {
    console.log("이미 '임시저장' 헤더가 있습니다 — 변경 없음.");
    return;
  }
  const newHeaders = headers.concat('임시저장');
  console.log('새 헤더:', newHeaders.join(' | '), '  (+임시저장)');

  if (!WRITE) {
    console.log('\n[미리보기] 실제 적용하려면 --write 플래그를 붙여 다시 실행하세요.');
    return;
  }

  // 헤더 행(row 1)을 새 헤더로 덮어쓰기 — A1:<lastCol>1 (값=헤더 문자열, 기존 이름 그대로 + 임시저장 추가)
  const r = await fetch(BASE + '/api/records/1', { method: 'PATCH', headers: AUTH, body: JSON.stringify({ values: newHeaders }) });
  console.log('헤더 기록:', r.status, r.ok ? 'OK' : (await r.text()).slice(0, 200));
}

main().catch((e) => { console.error(e); process.exit(1); });
