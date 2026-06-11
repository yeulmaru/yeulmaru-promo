#!/usr/bin/env node
// ============================================================
// 공연명 동기화 도구 (260611) — 색인(운영_공연색인) = 유일한 원본
// 대표공연명을 기준으로 각 시트의 공연명 사본을 공연ID로 대조·전파.
//
//   node docs/260611_name_sync.mjs                  # dry-run: 시트별 불일치 리포트만
//   DB_PW=관리자비번 node docs/260611_name_sync.mjs --write   # 전파 실행
//
// 전파 대상 (공연ID 기준):
//   운영_공연마스터.사업명 / 운영_일일입력.공연명 / 운영_세부운영관리대장(정리).공연명
//   프로그램.풀네임 / 홍보기록(records).프로그램
// 원칙: 색인에서만 이름을 바꾸고 이 도구로 전파. ID 없는 행은 건드리지 않음.
// ============================================================
const BASE = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '0510';
const WRITE = process.argv.includes('--write');
const H = { headers: { 'X-App-Password': PW } };
const HJ = { ...H.headers, 'Content-Type': 'application/json' };
const g = s => fetch(BASE + '/api/ops?sheet=' + encodeURIComponent(s), H).then(r => r.json());

const idx = await g('공연색인');
const canon = {};
(idx.rows || []).forEach(r => { const id = String(r['공연ID'] || '').trim(); if (id) canon[id] = String(r['대표공연명'] || '').trim(); });
console.log('색인(원본):', Object.keys(canon).length, '건');

let totalDiff = 0;
const report = (sheet, diffs) => {
  console.log(`\n── ${sheet}: 불일치 ${diffs.length}건`);
  const seen = new Set();
  diffs.forEach(d => { const k = d.id + d.from; if (seen.has(k)) return; seen.add(k); console.log(`   ${d.id}  "${d.from}" → "${d.to}"  (${d.n}행)`); });
  totalDiff += diffs.length;
};
const groupDiffs = (rows, idKey, nameKey) => {
  const m = {};
  rows.forEach(r => {
    const id = String(r[idKey] || '').trim(); if (!id || !canon[id]) return;
    const cur = String(r[nameKey] || '').trim();
    if (cur === canon[id]) return;
    const k = id + '|' + cur;
    if (!m[k]) m[k] = { id, from: cur, to: canon[id], n: 0 };
    m[k].n++;
  });
  return Object.values(m);
};

// ── 운영 3시트 (전체 교체 방식) ──
for (const [sheet, idKey, nameKey] of [['공연마스터', 'ID', '사업명'], ['일일입력', '공연ID', '공연명'], ['세부운영관리대장(정리)', '공연ID', '공연명']]) {
  const d = await g(sheet);
  const diffs = groupDiffs(d.rows || [], idKey, nameKey);
  report('운영_' + sheet, diffs);
  if (WRITE && diffs.length) {
    const rows = (d.rows || []).map(r => {
      const o = {}; d.headers.forEach(h => o[h] = r[h] ?? '');
      const id = String(r[idKey] || '').trim();
      if (id && canon[id]) o[nameKey] = canon[id];
      return o;
    });
    const res = await fetch(BASE + '/api/ops', { method: 'POST', headers: HJ, body: JSON.stringify({ sheet, headers: d.headers, rows }) });
    console.log('   → 전파', res.status);
  }
}

// ── 프로그램 (행 단위 PATCH) ──
const prog = await (await fetch(BASE + '/api/sheet/program', H)).json();
const PH = ['NO', '콘텐츠구분', '풀네임', '줄임말', '판매시작일', '판매종료일', '시작일', '종료일', '담당자', '장소', 'URL', '공연ID'];
const pd = groupDiffs(prog.rows || [], '공연ID', '풀네임');
report('프로그램(풀네임)', pd);
if (WRITE && pd.length) {
  for (const p of prog.rows || []) {
    const id = String(p['공연ID'] || '').trim();
    if (!id || !canon[id] || String(p['풀네임'] || '').trim() === canon[id]) continue;
    const values = PH.map(h => h === '풀네임' ? canon[id] : (p[h] ?? ''));
    const res = await fetch(BASE + '/api/sheet/program/' + p._rowIndex, { method: 'PATCH', headers: HJ, body: JSON.stringify({ values }) });
    console.log('   →', p['풀네임'], res.status);
  }
}

// ── records (행 단위 PATCH) ──
const recs = await (await fetch(BASE + '/api/records', H)).json();
const rows = recs.records || [];
const RH = rows.length ? Object.keys(rows[0]).filter(k => k !== '_rowIndex') : [];
const rd = groupDiffs(rows, '공연ID', '프로그램');
report('홍보기록(프로그램)', rd);
if (WRITE && rd.length) {
  for (const r of rows) {
    const id = String(r['공연ID'] || '').trim();
    if (!id || !canon[id] || String(r['프로그램'] || '').trim() === canon[id]) continue;
    const values = RH.map(h => h === '프로그램' ? canon[id] : (r[h] ?? ''));
    const res = await fetch(BASE + '/api/records/' + r._rowIndex, { method: 'PATCH', headers: HJ, body: JSON.stringify({ values }) });
    if (res.status !== 200) console.log('   FAIL row', r._rowIndex, res.status);
  }
  console.log('   → records 전파 완료');
}

console.log('\n총 불일치:', totalDiff, WRITE ? '(전파 실행됨)' : '(dry-run — 전파하려면 --write)');
