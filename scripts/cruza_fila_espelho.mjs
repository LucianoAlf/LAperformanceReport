// Cruza fila SF residual x espelho financeiro_emusys_lancamentos (fatura_id)
// Gera: matches automaticos (unidade+valor exato+data +-2d) e o que sobra p/ humano.
import fs from 'node:fs';
import path from 'node:path';

const env = {};
for (const arq of ['.env', '.env.local']) {
  const p = path.join(process.cwd(), arq);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_SERVICE_ROLE;
const H = { apikey: key, Authorization: `Bearer ${key}` };
const TMP = '.tmp_conciliacao';

// unidades
const un = await (await fetch(`${url}/rest/v1/unidades?select=id,nome`, { headers: H })).json();
const unMap = {};
for (const u of un) {
  const n = u.nome.toLowerCase();
  if (n.includes('barra')) unMap['Barra Santander 1534'] = u.id;
  else if (n.includes('recreio')) unMap['Recreio Santander 1534'] = u.id;
  else if (n.includes('campo grande') || n.includes('emla')) { unMap['EMLA CG Santander 1534'] = u.id; unMap['Kids CG Santander 1534'] = u.id; }
}
console.log('mapa unidades:', Object.keys(unMap).length);

const fila = JSON.parse(fs.readFileSync(`${TMP}/fila_sf_atual.json`, 'utf8'));
const cob = new Set();
for (const f of fs.readdirSync(TMP).filter(x => x.startsWith('propostas_sf'))) {
  for (const line of fs.readFileSync(path.join(TMP, f), 'utf8').split('\n').slice(1)) {
    const c = line.split(';')[0]?.trim(); if (c && c.length >= 8) cob.add(c);
  }
}
const rest = fila.filter(x => !cob.has(x.id.slice(0, 8)));
console.log('fila residual:', rest.length);

const lanc = [];
let off = 0;
while (true) {
  const q = `${url}/rest/v1/financeiro_emusys_lancamentos?select=unidade_id,data,valor,emusys_fatura_id,forma_pagamento_descricao&data=gte.2026-06-15&data=lte.2026-09-23&emusys_fatura_id=not.is.null&sumiu_em=is.null&offset=${off}&limit=1000`;
  const b = await (await fetch(q, { headers: H })).json();
  if (!Array.isArray(b) || !b.length) break;
  lanc.push(...b); off += 1000;
  if (b.length < 1000) break;
}
console.log('lancamentos com fatura:', lanc.length);

const fatIds = [...new Set(lanc.map(l => l.emusys_fatura_id))];
const fats = {};
for (let i = 0; i < fatIds.length; i += 400) {
  const ids = fatIds.slice(i, i + 400).join(',');
  const b = await (await fetch(`${url}/rest/v1/emusys_faturas?select=emusys_fatura_id,emusys_student_id,descricao,competencia,valor_pago,status,data_pagamento&emusys_fatura_id=in.(${ids})`, { headers: H })).json();
  for (const f of b) fats[f.emusys_fatura_id] = f;
}
const stIds = [...new Set(Object.values(fats).map(f => f.emusys_student_id).filter(Boolean))];
const als = {};
for (let i = 0; i < stIds.length; i += 400) {
  const ids = stIds.slice(i, i + 400).map(encodeURIComponent).join(',');
  const b = await (await fetch(`${url}/rest/v1/alunos?select=emusys_student_id,nome&emusys_student_id=in.(${ids})`, { headers: H })).json();
  for (const a of b) als[String(a.emusys_student_id)] = a.nome;
}

const d2 = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
// subset-sum: subconjunto de faturas cujos lancamentos somam o valor da linha
function subconjuntos(cents_alvo, itens, maxN = 4) {
  // itens: [{fat, soma}] — soma em centavos por fatura
  const res = [];
  const arr = itens.filter(i => i.soma <= cents_alvo);
  function bt(i, acc, pick) {
    if (acc === cents_alvo) { res.push([...pick]); return res.length > 60; }
    if (i >= arr.length || acc > cents_alvo || pick.length >= maxN) return false;
    pick.push(arr[i].fat);
    if (bt(i + 1, acc + arr[i].soma, pick)) return true;
    pick.pop();
    return bt(i + 1, acc, pick);
  }
  bt(0, 0, []);
  return res;
}

const out = [];
for (const x of rest) {
  const uid = unMap[x.conta];
  const cand = lanc.filter(l => l.unidade_id === uid && d2(l.data, x.data) <= 2);
  if (!cand.length) { out.push({ ...x, res: 'SEM_LANCAMENTO' }); continue; }
  // soma por fatura (lancamento pode vir duplicado/parcial)
  const byFat = {};
  for (const c of cand) (byFat[c.emusys_fatura_id] ??= 0), byFat[c.emusys_fatura_id] += Math.round(+c.valor * 100);
  const itens = Object.entries(byFat).map(([fat, soma]) => ({ fat, soma }));
  const alvo = Math.round(+x.valor * 100);
  // 1) fatura unica com valor exato
  const exatos = itens.filter(i => i.soma === alvo);
  let subs = [];
  if (exatos.length) subs = exatos.map(i => [i.fat]);
  else subs = subconjuntos(alvo, itens);
  const det = s => s.map(fid => {
    const f = fats[fid] || {};
    return `${fid}:${(als[String(f.emusys_student_id)] || '?').split(' ').slice(0, 3).join(' ')}:${String(f.competencia || '').slice(0, 7)}`;
  });
  if (!subs.length) out.push({ ...x, res: 'SEM_SUBCONJUNTO', cand: det(itens.map(i => i.fat)) });
  else if (subs.length === 1) out.push({ ...x, res: subs[0].length === 1 ? 'MATCH_UNICO' : 'MATCH_COMPOSTO', fats: det(subs[0]) });
  else out.push({ ...x, res: 'AMBIGUO', opcoes: subs.slice(0, 8).map(det) });
}
fs.writeFileSync(`${TMP}/cruzamento_residual.json`, JSON.stringify(out, null, 1));
const stats = {};
for (const o of out) stats[o.res] = (stats[o.res] || 0) + 1;
console.log(stats);
for (const o of out) {
  if (o.res === 'SEM_LANCAMENTO' || o.res === 'SEM_SUBCONJUNTO') console.log('SEM>', o.conta.slice(0, 8), o.data, o.valor, o.id.slice(0, 8), '|', o.pagador_nome || '', o.cand ? '| cand:' + o.cand.length : '');
  else if (o.res === 'AMBIGUO') console.log('AMB>', o.conta.slice(0, 8), o.data, o.valor, o.id.slice(0, 8), '=>', o.opcoes.map(s => s.join('+')).join('  OU  '));
  else console.log(o.res === 'MATCH_UNICO' ? 'OK >' : 'CMP>', o.conta.slice(0, 8), o.data, o.valor, o.id.slice(0, 8), '=>', o.fats.join(' | '));
}
