// Teste de carga: 12 chamadas simultâneas à RPC get_pix_migracao_v1
// 3 unidades × (sem p_fatia + 5 fatias) = 18 chamadas, mas o usuário pediu 12.
// Vamos fazer: 3 unidades × (sem p_fatia + pix_avulso + autorizacao_pendente + cheque) = 12.
import { execSync } from 'node:child_process';

const URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co/rest/v1/rpc/get_pix_migracao_v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzU3ODk1OCwiZXhwIjoyMDgzMTU0OTU4fQ.C3MXjuIKxvcGaydfMAoARJiKsqux6zUOapLbhFZek68';

const UNITS = {
  CG:   '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  REC:  '95553e96-971b-4590-a6eb-0201d013c14d',
  BAR:  '368d47f5-2d88-4475-bc14-ba084a9a348e',
};

const FATIAS = [null, 'pix_avulso', 'autorizacao_pendente', 'cheque'];

// Monta 12 chamadas: 3 unidades × 4 variações de fatia
const calls = [];
for (const [un, uid] of Object.entries(UNITS)) {
  for (const fatia of FATIAS) {
    calls.push({ un, uid, fatia, label: `${un}/${fatia ?? 'ALL'}` });
  }
}

console.log(`Disparando ${calls.length} chamadas simultâneas...`);

const t0 = Date.now();
const results = await Promise.allSettled(calls.map(async (c) => {
  const start = Date.now();
  const body = JSON.stringify({ p_unidade_id: c.uid, p_fatia: c.fatia });
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body,
  });
  const elapsed = Date.now() - start;
  const status = res.status;
  let rowCount = -1;
  try {
    const json = await res.json();
    rowCount = Array.isArray(json) ? json.length : (json.code ? `ERR:${json.code}` : 0);
  } catch (e) {
    rowCount = `PARSE_ERR`;
  }
  return { ...c, status, elapsed, rowCount };
}));

const total = Date.now() - t0;
let ok = 0, fail = 0, maxMs = 0, sumMs = 0;
for (const r of results) {
  if (r.status === 'fulfilled') {
    const v = r.value;
    sumMs += v.elapsed;
    if (v.elapsed > maxMs) maxMs = v.elapsed;
    if (v.status === 200) ok++;
    else fail++;
    console.log(`${v.label.padEnd(28)} ${v.status}  ${String(v.elapsed).padStart(4)}ms  rows=${v.rowCount}`);
  } else {
    fail++;
    console.log(`REJECTED: ${r.reason?.message ?? r.reason}`);
  }
}

console.log('---');
console.log(`Total wall-clock: ${total}ms`);
console.log(`OK: ${ok}  FAIL: ${fail}  MAX: ${maxMs}ms  AVG: ${Math.round(sumMs / ok)}ms`);
console.log(ok === calls.length && maxMs < 1000 ? 'PASSOU: 12/12 < 1s, zero timeouts' : 'FALHOU');
