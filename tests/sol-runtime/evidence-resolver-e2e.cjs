#!/usr/bin/env node
'use strict';

// Politica compartilhada, corpus sanitizado Sol/Maria. Este teste nao chama
// banco, WhatsApp, OCR real nem escrita financeira.
const fs = require('fs');
const path = require('path');
const mod = require('./_alvo.cjs');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence-corpus-v1.json'), 'utf8'));

const falhas = [];
const check = (cond, msg) => { if (!cond) falhas.push(msg); };

for (const caso of corpus.cases) {
  const candidatos = caso.candidates.map((c) => ({
    valor: c.value,
    fonte: c.source,
    confianca: c.confidence,
    evidencia_id: c.evidence_id || null,
  }));
  const r = mod.resolverCampoEvidencia(caso.field, candidatos);
  check(r.status === caso.expected.status,
    `${caso.id}: status ${r.status}, esperado ${caso.expected.status}`);
  check(JSON.stringify(r.valor) === JSON.stringify(caso.expected.value),
    `${caso.id}: valor ${JSON.stringify(r.valor)}, esperado ${JSON.stringify(caso.expected.value)}`);
  check(r.fonte === caso.expected.source,
    `${caso.id}: fonte ${r.fonte}, esperada ${caso.expected.source}`);
}

const envelope = mod.construirEnvelopeEvidenciasV1({
  textoHumano: 'PG PIX parcela 09/2026 aluna Pessoa Teste R$190,00',
  ocrText: 'COMPROVANTE VISA CREDITO A VISTA VALOR R$ 190,00',
  ocrMeta: { status: 'ok', ocr_confidence: 82 },
  visao: { forma: 'cartao', valor: 190, confianca: 0.78 },
  llm: { forma: 'cartao', competencia: '08/2026', categoria: 'parcela', confianca: 0.91 },
});
check(envelope.fields.forma.valor === 'pix'
  && envelope.fields.forma.fonte === 'texto_humano_explicito',
  'envelope integrado: Pix humano nao venceu OCR/visao/LLM');
check(envelope.fields.competencia.valor === '09/2026',
  'envelope integrado: competencia humana nao venceu LLM');
check(envelope.fields.forma.discordancias >= 2,
  'envelope integrado: discordancias de forma nao ficaram auditadas');
check(envelope.source_refs.texto_humano_sha256 && envelope.source_refs.ocr_sha256,
  'envelope integrado: faltam referencias hash das fontes');
check(!JSON.stringify(envelope.source_refs).includes('Pessoa Teste'),
  'envelope integrado: texto bruto vazou em source_refs');

const antes = mod.construirEnvelopeEvidenciasV1({
  textoHumano: 'pagamento no cartão R$190,00',
  llm: { forma: 'cartao', confianca: 0.9 },
});
const correcao = mod.construirEnvelopeEvidenciasV1({
  textoHumano: 'corrigindo: foi pix',
  llm: { intencao: 'corrigir_forma', forma: 'pix', confianca: 0.95 },
});
const depois = mod.mesclarEnvelopesEvidenciasV1(antes, correcao);
check(depois.fields.forma.valor === 'pix'
  && depois.fields.forma.fonte === 'correcao_humana_explicita',
  'correcao humana nao superou estado anterior');

const cmp = mod.compararEnvelopeEvidenciasV1(envelope, {
  forma: 'cartao', competencia: '08/2026', valor_total: 190,
});
check(cmp.divergencias.includes('forma') && cmp.divergencias.includes('competencia'),
  'comparador shadow nao detectou divergencias esperadas');

if (falhas.length) {
  console.error('FALHOU:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`ok: ${corpus.cases.length} casos sanitizados + envelope integrado + correcao + shadow`);
