#!/usr/bin/env node
// ============================================================
// DB 통합 Phase 2 — 공연ID 공유키 마이그레이션 도구 (260610)
// 운영_일일입력 / 운영_세부운영관리대장(정리)에 '공연ID' 컬럼 추가 + 운영_공연색인 신설.
//
// 사용법:
//   node docs/260610_db_migrate.mjs              # dry-run: 매칭 리포트만 출력 (쓰기 없음)
//   DB_PIN=서브admin핀 node docs/260610_db_migrate.mjs --write   # 실제 시트 교체 (3개 POST)
//
// 규칙 (사용자 확정):
//   - 매칭은 _uName 정규화(꺾쇠/언더스코어/'- 여수'/공백 제거) + 연도 ±1
//   - 공연마스터 ID(YYMMDD_NN) 우선 상속, 없으면 에디션 첫 공연일로 신규 발급
//   - 미매칭은 빈칸 그대로 둠 ("인덱싱이 비는 거는 그냥 비어두게")
// ⚠️ POST는 시트 전체 교체(text 서식) — dash push와 동일 경로. 실행 전 dry-run 확인 필수.
// ============================================================
const BASE = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = '0510';
const PIN = process.env.DB_PIN || '';
const WRITE = process.argv.includes('--write');

const uName = s => String(s||'').replace(/\s*[-–—]\s*여수\s*$/,'').replace(/[〈〉<>「」『』\[\]（）()]/g,'').replace(/[_\-–—·.,’'"~!:：]/g,'').replace(/\s+/g,'').toLowerCase();
const pad = n => String(n).padStart(2,'0');

async function getSheet(name){
  const r = await fetch(BASE + '/api/ops?sheet=' + encodeURIComponent(name), { headers: { 'X-App-Password': PW } });
  if(!r.ok) throw new Error(name + ' GET ' + r.status);
  return r.json();
}
async function postSheet(payload){
  const r = await fetch(BASE + '/api/ops', { method:'POST', headers: { 'Content-Type':'application/json', 'X-App-Password': PW, 'X-Sub-Admin-PIN': PIN, '관리자여부':'true' }, body: JSON.stringify(payload) });
  const t = await r.text();
  if(!r.ok) throw new Error(payload.sheet + ' POST ' + r.status + ': ' + t.slice(0,200));
  return JSON.parse(t);
}

const [daily, master, ops] = await Promise.all([getSheet('일일입력'), getSheet('공연마스터'), getSheet('세부운영관리대장(정리)')]);
console.log('로드:', daily.rows.length, '/', master.rows.length, '/', ops.rows.length);

// 1) 마스터 ID 카탈로그
const masterByName = {}, masterYear = {};
master.rows.forEach(r => {
  const n = uName(r['사업명']); if(!n || !r['ID']) return;
  masterByName[n] = String(r['ID']).trim();
  const ym = String(r['시작일']||'').match(/^(\d{4})/); masterYear[n] = ym ? +ym[1] : 2026;
});

// 2) 운영대장 에디션 → ID 상속/발급
const eds = {};
ops.rows.forEach((r, i) => {
  const n = uName(r['공연명']); if(!n) return;
  const y = parseInt(r['년도']) || 0;
  const k = n + '|' + y;
  if(!eds[k]) eds[k] = { n, y, name: r['공연명'], rows: [], dates: [] };
  eds[k].rows.push(i);
  const m = parseInt(r['월'])||0, d = parseInt(r['일'])||0;
  if(y && m && d) eds[k].dates.push(y*10000 + m*100 + d);
});
const usedIds = new Set(Object.values(masterByName));
for (const e of Object.values(eds)) {
  if (masterByName[e.n] && Math.abs((masterYear[e.n]||2026) - e.y) <= 1) { e.id = masterByName[e.n]; continue; }
  const first = e.dates.length ? Math.min(...e.dates) : 0;
  if (!first) { e.id = ''; continue; }
  let seq = 1, id;
  do { id = String(first).slice(2) + '_' + pad(seq); seq++; } while (usedIds.has(id));
  usedIds.add(id); e.id = id;
}
const opsIds = new Array(ops.rows.length).fill('');
Object.values(eds).forEach(e => e.rows.forEach(i => opsIds[i] = e.id));

// 3) 일일입력 매칭 (마스터 → 에디션 연도근접)
const edsByName = {};
Object.values(eds).forEach(e => { (edsByName[e.n] = edsByName[e.n] || []).push(e); });
const dailyIds = new Array(daily.rows.length).fill('');
const unmatched = {};
daily.rows.forEach((r, i) => {
  const n = uName(r['공연명']); if(!n) return;
  const ds = String(r['기준일자']||''); const y = /^\d{8}/.test(ds) ? +ds.slice(0,4) : 0;
  if (masterByName[n]) { dailyIds[i] = masterByName[n]; return; }
  const cands = edsByName[n];
  if (cands && cands.length) {
    let best = cands[0], bd = 99;
    cands.forEach(c => { const d = y ? Math.abs(c.y - y) : 0; if (d < bd) { bd = d; best = c; } });
    if (bd <= 1 && best.id) { dailyIds[i] = best.id; return; }
  }
  unmatched[r['공연명']] = (unmatched[r['공연명']]||0) + 1;
});

// 리포트
const dM = dailyIds.filter(Boolean).length;
console.log(`일일입력 매칭: ${dM}/${daily.rows.length} (${(dM/daily.rows.length*100).toFixed(1)}%)`);
console.log(`운영대장 ID: ${opsIds.filter(Boolean).length}/${ops.rows.length} | 에디션 ${Object.keys(eds).length}`);
console.log('미매칭(빈칸 유지):', Object.keys(unmatched).length, '공연', unmatched);

// 페이로드
const mk = (src, ids) => ({ headers: [...src.headers.filter(h=>h!=='공연ID'), '공연ID'],
  rows: src.rows.map((r,i) => { const o={}; src.headers.forEach(h=>{ if(h!=='공연ID') o[h]=r[h] ?? ''; }); o['공연ID']=ids[i]; return o; }) });
const pDaily = { sheet:'일일입력', ...mk(daily, dailyIds) };
const pOps = { sheet:'세부운영관리대장(정리)', ...mk(ops, opsIds) };
const idx = Object.values(eds).filter(e=>e.id).map(e => ({ '공연ID':e.id, '대표공연명':e.name, '연도':e.y, '첫공연일':e.dates.length?String(Math.min(...e.dates)):'', '회차수':e.rows.length, '출처': masterByName[e.n]===e.id?'마스터':'운영대장' }));
const seen = new Set(); const dedup = idx.filter(r => seen.has(r['공연ID']) ? false : (seen.add(r['공연ID']), true));
dedup.sort((a,b)=>String(a['첫공연일']).localeCompare(String(b['첫공연일'])));
const pIdx = { sheet:'공연색인', headers:['공연ID','대표공연명','연도','첫공연일','회차수','출처'], rows: dedup };

if (!WRITE) { console.log('\n[dry-run] 쓰기 안 함. 실행: DB_PIN=핀 node docs/260610_db_migrate.mjs --write'); process.exit(0); }
if (!PIN) { console.error('DB_PIN 환경변수 필요'); process.exit(1); }
for (const p of [pIdx, pOps, pDaily]) {
  console.log('POST', p.sheet, p.rows.length + '행 …');
  console.log(' →', JSON.stringify(await postSheet(p)).slice(0,120));
}
console.log('완료. 판매현황 열어서 점유율 동일한지 검증할 것.');
