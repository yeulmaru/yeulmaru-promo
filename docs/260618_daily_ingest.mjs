// 260618 일일입력 인제스트 — 사용자가 전달한 일일 판매현황을 운영_일일입력 시트에 반영.
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ 인증: Worker 전체가 X-App-Password 게이트 뒤에 있고, 쓰기(POST /api/ops)는 admin.
//    슈퍼 비번(Worker env ADMIN_PASSWORD = 기존 DB 작업에 쓰던 그 값)이면 읽기·쓰기 모두 통과.
//    → 비번은 코드/대화에 적지 말고 실행 시 환경변수로만 전달:
//
//    DRY-RUN(미리보기, 기본):   DB_PW=<슈퍼비번> node docs/260618_daily_ingest.mjs
//    실제 반영:                 DB_PW=<슈퍼비번> node docs/260618_daily_ingest.mjs --write
//
// 동작: ① 라이브 운영_일일입력 GET → 헤더·기존행 파악
//       ② 기존 공연명으로 정규화 매칭표 구축(공연명은 DB 것 그대로 사용 — 새 이름 만들지 않음)
//       ③ 아래 DAILY 데이터를 (공연명,기준일자)로 중복 제거 → 신규만 append
//       ④ 이미 있는 날짜는 값 일치/불일치만 보고(자동 덮어쓰기 안 함 — 안전)
// ─────────────────────────────────────────────────────────────────────────────

const API = "https://yeulmaru-promo-api.yeulmarumaster.workers.dev";
const PW = process.env.DB_PW || "";
const SUB_PIN = process.env.SUB_PIN || ""; // 슈퍼비번이면 불필요
const WRITE = process.argv.includes("--write");

if (!PW) { console.error("✗ DB_PW 환경변수가 필요해요 (슈퍼 비번). 예) DB_PW=**** node docs/260618_daily_ingest.mjs"); process.exit(1); }

// 정규화 (index.html _uName 과 동일 규칙) — 매칭 전용. 저장은 DB 원래 공연명을 그대로 쓴다.
function uName(s){
  return String(s||"")
    .replace(/\s*[-–—]\s*여수\s*$/,"")
    .replace(/[〈〉<>「」『』\[\]（）()]/g,"")
    .replace(/[_\-–—·.,’'"~!:：]/g,"")
    .replace(/\s+/g,"")
    .toLowerCase();
}

// ── 사용자 전달 일일 데이터 (누적좌석=합계좌석 / 누적금액=합계금액 / occ=점유율 / d=전일대비석) ──
// 공연명은 매칭용 키일 뿐, 실제 저장은 DB의 정식 공연명으로 치환된다.
const DAILY = [
  ["2026-06-18", [ {n:"세비야의 이발사", seat:601, occ:"32.5", amt:16309000, d:"+5"} ]],
  ["2026-06-17", [ {n:"세비야의 이발사", seat:596, occ:"32.2", amt:16144000, d:"+13"} ]],
  ["2026-06-16", [ {n:"노인의 꿈", seat:1000, occ:"51.2", amt:63844000, d:"+13"},
                   {n:"세비야의 이발사", seat:583, occ:"31.5", amt:15862000, d:"+6"} ]],
  ["2026-06-13", [ {n:"노인의 꿈", seat:987, occ:"50.5", amt:63008000, d:"+6"},
                   {n:"세비야의 이발사", seat:570, occ:"30.8", amt:15586000, d:"+6"} ]],
  ["2026-06-12", [ {n:"노인의 꿈", seat:981, occ:"50.2", amt:63135050, d:"+14"},
                   {n:"세비야의 이발사", seat:564, occ:"30.5", amt:15431000, d:"+2"} ]],
  ["2026-06-11", [ {n:"노인의 꿈", seat:967, occ:"49.5", amt:62346900, d:"+6"},
                   {n:"세비야의 이발사", seat:562, occ:"30.3", amt:15421000, d:"0"} ]],
  ["2026-06-10", [ {n:"노인의 꿈", seat:961, occ:"49.2", amt:61959150, d:"+5"},
                   {n:"세비야의 이발사", seat:562, occ:"30.3", amt:15800000, d:"-42"} ]], // 세비야 -42: 광양중마초 취소
  ["2026-06-09", [ {n:"노인의 꿈", seat:956, occ:"48.9", amt:61612650, d:"+37"},
                   {n:"세비야의 이발사", seat:604, occ:"32.6", amt:16880000, d:"+17"} ]],
  ["2026-06-05", [ {n:"클래식과 함께하는 미술관 여행 II", seat:325, occ:"35.1", amt:6574000, d:"+18"},
                   {n:"노인의 꿈", seat:919, occ:"47.0", amt:59090900, d:"+21"},
                   {n:"세비야의 이발사", seat:587, occ:"31.7", amt:16403000, d:"+69"} ]],
  ["2026-06-04", [ {n:"클래식과 함께하는 미술관 여행 II", seat:307, occ:"33.2", amt:6494000, d:"+2"},
                   {n:"노인의 꿈", seat:898, occ:"46.0", amt:57758800, d:"+5"},
                   {n:"세비야의 이발사", seat:518, occ:"28.0", amt:14254000, d:"+16"} ]],
  ["2026-06-02", [ {n:"클래식과 함께하는 미술관 여행 II", seat:305, occ:"32.9", amt:6424000, d:"+1"},
                   {n:"노인의 꿈", seat:893, occ:"45.7", amt:57463450, d:"+22"},
                   {n:"세비야의 이발사", seat:502, occ:"27.1", amt:13962000, d:"+13"} ]],
];

function hdr(headers){ return headers.map(h=>String(h==null?"":h)); }
// 헤더 후보(부분일치)로 실제 헤더 문자열 찾기
function findCol(headers, ...cands){
  for(const c of cands){ const h=headers.find(x=>x.replace(/\s/g,"").includes(c.replace(/\s/g,""))); if(h) return h; }
  return null;
}

async function call(method, path, body){
  const headers = {"Content-Type":"application/json","X-App-Password":PW};
  if(SUB_PIN) headers["X-Sub-Admin-PIN"]=SUB_PIN;
  const res = await fetch(API+path, {method, headers, body: body?JSON.stringify(body):undefined});
  const txt = await res.text();
  let j; try{ j=JSON.parse(txt); }catch{ j={raw:txt}; }
  if(!res.ok) throw new Error(method+" "+path+" → "+res.status+" "+txt.slice(0,200));
  return j;
}

(async ()=>{
  console.log("● 운영_일일입력 읽는 중…");
  const d = await call("GET", "/api/ops?sheet="+encodeURIComponent("일일입력"));
  const headers = hdr(d.headers||[]);
  const rows = d.rows||[];
  console.log("  헤더:", JSON.stringify(headers));
  console.log("  기존 행수:", rows.length);

  const C = {
    name : findCol(headers,"공연명","공연","사업명"),
    date : findCol(headers,"기준일자","일자","날짜"),
    seat : findCol(headers,"합계좌석","누적좌석","좌석"),
    amt  : findCol(headers,"합계금액","누적금액","금액"),
    occ  : findCol(headers,"점유율"),
    delta: findCol(headers,"전일대비"),
    pid  : findCol(headers,"공연ID","공연 ID","ID"),
    paidS: findCol(headers,"유료좌석"),
    freeS: findCol(headers,"무료좌석"),
    paidA: findCol(headers,"유료금액"),
  };
  console.log("  컬럼 매핑:", JSON.stringify(C));
  if(!C.name || !C.date){ console.error("✗ 공연명/기준일자 컬럼을 못 찾음 — 중단"); process.exit(1); }

  // 기존 공연명 → {정식명, ID} 매칭표 + 기존 (정규화명|YYYYMMDD) 셋 + 값 조회
  const nameMap = {};          // uName → {name, id}
  const existing = {};         // uName|ymd → {seat, amt, occ}
  for(const r of rows){
    const nm = String(r[C.name]||"").trim(); if(!nm) continue;
    const k = uName(nm);
    if(!nameMap[k]) nameMap[k] = {name:nm, id: C.pid?String(r[C.pid]||"").trim():""};
    else if(C.pid && !nameMap[k].id) nameMap[k].id = String(r[C.pid]||"").trim();
    const ymd = String(r[C.date]||"").replace(/[^0-9]/g,"");
    if(ymd) existing[k+"|"+ymd] = {
      seat:String(C.seat?r[C.seat]:""), amt:String(C.amt?r[C.amt]:""), occ:String(C.occ?r[C.occ]:"")
    };
  }
  const cands = Object.keys(nameMap);
  console.log("  DB 공연명:", cands.map(k=>nameMap[k].name+(nameMap[k].id?" ["+nameMap[k].id+"]":"")).join(" / ")||"(없음)");

  // 최장 공통 부분문자열(LCS) 기반 매칭 — 양쪽에 보일러플레이트(2026/GS칼텍스/공동기획 등)가 붙어도
  // 공유 핵심("세비야의이발사","노인의꿈")이 길게 겹치면 매칭. 완전 포함은 가산점.
  function lcsLen(a,b){
    let best=0; const n=b.length; let prev=new Array(n+1).fill(0);
    for(let i=1;i<=a.length;i++){ const cur=new Array(n+1).fill(0);
      for(let j=1;j<=n;j++){ if(a[i-1]===b[j-1]){ cur[j]=prev[j-1]+1; if(cur[j]>best)best=cur[j]; } }
      prev=cur; }
    return best;
  }
  function resolve(raw){
    const q = uName(raw);
    let best=null, bestScore=0;
    for(const k of cands){
      if(k.length<2) continue;
      const score = (q.includes(k)||k.includes(q)) ? Math.min(q.length,k.length)+100 : lcsLen(q,k);
      if(score>bestScore){ bestScore=score; best=k; }
    }
    return (best && bestScore>=4) ? nameMap[best] : null;  // 4자 미만 겹침은 매칭 안 함
  }

  const toAppend = [];
  const unresolved = [], dupSame = [], dupDiff = [];
  for(const [date, items] of DAILY){
    const ymd = date.replace(/-/g,"");
    for(const it of items){
      const hit = resolve(it.n);
      if(!hit){ unresolved.push(date+"  "+it.n); continue; }
      const k = uName(hit.name);
      const ex = existing[k+"|"+ymd];
      if(ex){
        const same = String(ex.seat).replace(/[^0-9]/g,"")===String(it.seat) && String(ex.amt).replace(/[^0-9]/g,"")===String(it.amt);
        (same?dupSame:dupDiff).push(date+"  "+hit.name+"  (DB좌석 "+ex.seat+"/금액 "+ex.amt+" ↔ 전달 "+it.seat+"/"+it.amt+")");
        continue;
      }
      // 정식 헤더에 맞춰 행 구성 (없는 컬럼은 opsAppendRows가 무시)
      const row = {};
      row[C.name]=hit.name; row[C.date]=ymd;
      if(C.seat) row[C.seat]=it.seat;
      if(C.amt)  row[C.amt]=it.amt;
      if(C.occ)  row[C.occ]=it.occ;
      if(C.delta)row[C.delta]=it.d;
      if(C.pid)  row[C.pid]=hit.id;
      if(C.paidS)row[C.paidS]=it.seat;  // 유료/무료 분할 정보가 없어 전량 유료로 근사(합계좌석=유료+무료 불변식 유지)
      if(C.freeS)row[C.freeS]=0;
      if(C.paidA)row[C.paidA]=it.amt;
      toAppend.push({date, label:hit.name, row});
    }
  }

  console.log("\n── 미리보기 ──────────────────────────────");
  console.log("신규 append 대상:", toAppend.length, "건");
  toAppend.forEach(x=>console.log("  +", x.date, " ", x.label, " ", JSON.stringify(x.row)));
  if(dupSame.length){ console.log("\n이미 있음(값 일치, 건너뜀):", dupSame.length); dupSame.forEach(s=>console.log("  =", s)); }
  if(dupDiff.length){ console.log("\n⚠ 이미 있음(값 다름 — 자동 안 건드림, 필요시 수동확인):", dupDiff.length); dupDiff.forEach(s=>console.log("  ≠", s)); }
  if(unresolved.length){ console.log("\n✗ 공연명 매칭 실패(저장 안 함 — DB에 그 공연명이 없음):", unresolved.length); unresolved.forEach(s=>console.log("  ?", s)); }

  if(!toAppend.length){ console.log("\n반영할 신규 건이 없어요."); return; }
  if(!WRITE){ console.log("\n(DRY-RUN) 실제 반영하려면  --write  를 붙여 다시 실행하세요."); return; }

  console.log("\n● append 중…");
  const res = await call("POST","/api/ops",{sheet:"일일입력", mode:"append", rows: toAppend.map(x=>x.row)});
  console.log("✓ 반영 완료:", JSON.stringify(res));
})().catch(e=>{ console.error("✗ 오류:", e.message||e); process.exit(1); });
