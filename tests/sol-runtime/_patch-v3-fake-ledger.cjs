#!/usr/bin/env node
// A SUITE ESCREVIA NO LEDGER V3 DE PRODUCAO (achado da auditoria de 31/08).
//
// Os testes rodam com SOL_CAIXA_V3_LEDGER_MODE=production para exercitar a
// fiacao V3 (vincular/registrar/approval), mas nao mockavam
// registrarPreviewV3Fn/registrarApprovalV3Fn — o default e' a RPC REAL.
// Medido em producao: 499 dos 807 previews da semana 24-31/08 (62%) eram
// artefato de teste (preview_message_id 'MSG\d+', o id do sendFn mockado),
// com unidade_id real. Qualquer metrica da V3 lida ingenuamente inflava ~2.6x.
//
// Fix NA RAIZ (ponto de injecao, nao teste a teste): com
// SOL_CAIXA_V3_LEDGER_FAKE=1, os dois registradores viram fakes em memoria com
// ids deterministicos — a fiacao V3 continua 100% ativa (vincular true, hashes
// presentes, asserts *_sem_v3 continuam significativos), mas NADA toca o banco.
// Teste novo nasce protegido sem precisar lembrar de mockar.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-v3-fake-ledger.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

trocar(
  `dryRun = (process.env.SOL_CAIXA_DRYRUN === '1') }) {`,
  `dryRun = (process.env.SOL_CAIXA_DRYRUN === '1') }) {
  // SOL_CAIXA_V3_LEDGER_FAKE=1 (suite de testes): fiacao V3 ativa, banco intacto.
  // Sem isto, teste que nao mocka os registradores grava preview/approval REAL
  // no ledger de producao — 62% dos previews de 24-31/08 eram artefato de teste.
  // ⚠️ So substitui o DEFAULT (RPC real): mock explicito do teste — inclusive
  // mock que FALHA, como no gate-regressao caso 2 — continua valendo.
  if (process.env.SOL_CAIXA_V3_LEDGER_FAKE === '1') {
    let _fakeSeq = 0;
    if (registrarPreviewV3Fn === registrarPreviewV3) registrarPreviewV3Fn = async () => ({ ok: true, preview_id: 'fake-prev-' + (++_fakeSeq) });
    if (registrarApprovalV3Fn === registrarApprovalV3) registrarApprovalV3Fn = async () => ({ ok: true, approval_id: 'fake-appr-' + (++_fakeSeq) });
  }`,
  'FAKE ledger switch no criarHandlerFinanceiro');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
