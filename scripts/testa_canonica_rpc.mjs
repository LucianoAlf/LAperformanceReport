// Testa a canonica via PostgREST com service_role — mesmo caminho da edge.
// Uso: node scripts/testa_canonica_rpc.mjs
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
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('sem VITE_SUPABASE_URL/SERVICE_ROLE'); process.exit(2); }

const r = await fetch(`${url}/rest/v1/rpc/get_faturas_alunos_financeiro_v1`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_unidade_id: null, p_ano: 2026, p_mes: 9,
    p_modo_periodo: 'janela_3', p_status: 'reconciliacao', p_as_of_date: '2026-09-23',
  }),
});
const j = await r.json();
if (!r.ok) { console.error('HTTP', r.status, j); process.exit(1); }
const rec = j.reconciliation ?? {};
console.log('reconciliation:', JSON.stringify({
  total: rec.total, source_missing: rec.source_missing,
  pagamento_detectado: rec.pagamento_detectado,
  identidade_invalida: rec.identidade_invalida,
  validacoes_origem: rec.validacoes_origem,
  forma_pagamento_ausente: rec.forma_pagamento_ausente,
}));
const comProva = (rec.items ?? []).filter(i => (i.motivos ?? []).includes('pagamento_detectado_fora_origem'));
console.log('itens com pagamento_detectado_fora_origem:', comProva.length);
for (const i of comProva.slice(0, 6)) {
  console.log(`- fatura ${i.emusys_fatura_id} | ${i.aluno?.nome} | motivos=${JSON.stringify(i.motivos)} | prova=${JSON.stringify(i.prova_pagamento)}`);
}
