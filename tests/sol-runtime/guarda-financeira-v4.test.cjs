#!/usr/bin/env node
/**
 * As duas guardas financeiras que faltam à V4, com os casos REAIS do shadow.
 *
 * 🔴 POR QUE EXISTE. Rotulando as 33 oportunidades acionáveis do shadow (08-09/09)
 *    achei 5 falsos positivos e 8 ambíguos, e os dois padrões que os explicam são
 *    exatamente os que a V4 executaria se o flip acontecesse hoje:
 *
 *    (a) COLAGEM DO RELATÓRIO DE RECEBIMENTOS — 3 de 5. A Rose cola no grupo o
 *        extrato "Recebimentos em aberto CG 🚩⚠️ EMLA 04/09/2026 PIX RECEBIDO…"
 *        e a V4 classificou `lancamento_multi_aluno` (0.92) e
 *        `lancamento_por_texto` (0.65). O legado tem guarda desde 31/08
 *        (`_ehDitadoDeCaixa`); a V4 não tem.
 *
 *    (b) "Conferido✅" VIRANDO APROVAÇÃO — 3 vezes em dois dias, com 0.85.
 *        A regra da casa é que dinheiro só se move com "pode" explícito. Se a
 *        V4 executasse, isso seria autorização financeira criada pelo modelo.
 *
 * ⚠️ Estas guardas são DETERMINÍSTICAS de propósito, e isso não contradiz o
 *    "AI-first": o modelo continua entendendo a conversa. O que ele não pode é
 *    CRIAR autorização. Autorizar é ato humano com forma declarada; verificar a
 *    forma é trabalho mecânico, e é exatamente onde regex é legítima (validação
 *    posterior à escolha, nunca descoberta de intenção).
 *
 * Roda o módulo REAL. Sem mock do guard.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ALVO = process.env.SOL_CAIXA_CJS
  || path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-financeiro.cjs');

const mod = { exports: {} };
const ctx = {
  module: mod, exports: mod.exports, require, console, process,
  __filename: ALVO, __dirname: path.dirname(ALVO),
  Buffer, setTimeout, clearTimeout, setInterval, clearInterval, fetch, URL,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ALVO, 'utf8'), ctx, { filename: ALVO });

const pega = (n) => {
  try { return vm.runInContext(`typeof ${n} === "function" ? ${n} : null`, ctx); }
  catch { return null; }
};

const guardaV4 = pega('guardaFinanceiraV4');

let ok = 0, falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; console.log('  ok  ' + nome); }
  catch (e) { falhas.push(nome + ' :: ' + e.message); console.log('FAIL  ' + nome); }
}

// ── (a) colagem de relatório ───────────────────────────────────────────────
const COLAGENS = [
  // do shadow, 08/09 20:39 — V4 disse lancamento_multi_aluno 0.92
  '03/09/2026\t\nPIX RECEBIDO 11548030740\tR$ 100,00= *PIX Lojinha - Baquetas - Lhays Marinho*\n\n08/09/2026\t\nPIX RECEBIDO 07895543725\tR$ 367,00= *PIX Parcela 09/2026*',
  // do shadow, 09/09 12:04 e 15:25 — 0.65 e 0.60
  '*Recebimentos em aberto CG* 🚩⚠️\n\n*EMLA*\n\n04/09/2026\t\nPIX RECEBIDO 09541382797\tR$ 1.722,00= *PIX Parcelas 08/2026 de Davi Guilherme e Thuanny Ribeiro*',
];

// legendas VERDADEIRAS que não podem ser barradas junto
const DITADOS_LEGITIMOS = [
  'PG pix parcela 09/2026 aluno Carlos Mamede Tibúrcio - Kids CG R$367,00',
  'PG pix parcelas 09/2026 aluno Davi Guilherme de Souza Chaves Ribeiro (4 cursos - R$1290,00) e aluna Thuanny de Souza Chaves Ribeiro (R$432,00) - LA CG R$1722,00',
  'parcela de setembro alunos\nMaria Helena Brizzi de Almeida - R$431,00\nJoão Pedro Brizzi de Almeida - R$431,00\npix',
];

// ── (b) aprovação ─────────────────────────────────────────────────────────
const NAO_SAO_APROVACAO = [
  'Conferido✅',            // shadow 08/09 15:31 — V4 disse aprovar 0.85
  'Conferido também✅',     // shadow 08/09 15:40 — aprovar 0.85
  'Confere',
  'isso mesmo',
  'ta certo',
  'ok',
];
const SAO_APROVACAO = ['pode', 'Pode', 'pode lançar', 'pode sim'];

console.log('GUARDA FINANCEIRA DA V4 — casos reais do shadow 08-09/09\n');

teste('a guarda existe', () => {
  assert.ok(guardaV4, 'guardaFinanceiraV4 nao encontrada no runtime');
});

if (guardaV4) {
  COLAGENS.forEach((t, i) => teste(`colagem de relatorio ${i + 1} nao vira lancamento`, () => {
    const r = guardaV4({ intencao: 'lancamento_multi_aluno', texto: t, confianca: 0.92 });
    assert.strictEqual(r.permitido, false, 'deveria barrar');
    assert.strictEqual(r.motivo, 'relatorio_colado');
  }));

  DITADOS_LEGITIMOS.forEach((t, i) => teste(`ditado legitimo ${i + 1} passa`, () => {
    const r = guardaV4({ intencao: 'lancamento_multi_aluno', texto: t, confianca: 0.95 });
    assert.strictEqual(r.permitido, true, 'nao deveria barrar: ' + t.slice(0, 40));
  }));

  NAO_SAO_APROVACAO.forEach((t) => teste(`"${t}" NAO autoriza dinheiro`, () => {
    const r = guardaV4({ intencao: 'aprovar', texto: t, confianca: 0.85 });
    assert.strictEqual(r.permitido, false, 'deveria exigir "pode"');
    assert.strictEqual(r.motivo, 'aprovacao_sem_pode');
  }));

  SAO_APROVACAO.forEach((t) => teste(`"${t}" autoriza`, () => {
    const r = guardaV4({ intencao: 'aprovar', texto: t, confianca: 0.85 });
    assert.strictEqual(r.permitido, true);
  }));

  // ── mutantes: o que aconteceria se alguem afrouxasse a guarda ───────────
  teste('MUTANTE: confianca alta nao compra aprovacao', () => {
    const r = guardaV4({ intencao: 'aprovar', texto: 'Conferido✅', confianca: 0.999 });
    assert.strictEqual(r.permitido, false, 'confianca nao pode substituir o "pode"');
  });

  teste('MUTANTE: colagem com confianca alta continua barrada', () => {
    const r = guardaV4({ intencao: 'lancamento_por_texto', texto: COLAGENS[1], confianca: 0.99 });
    assert.strictEqual(r.permitido, false);
  });

  teste('intencao nao-financeira passa direto', () => {
    const r = guardaV4({ intencao: 'conversa', texto: 'Conferido✅', confianca: 0.95 });
    assert.strictEqual(r.permitido, true);
  });
}

console.log(`\n${ok}/${ok + falhas.length} testes ok`);
if (falhas.length) { falhas.forEach((f) => console.log('  ' + f)); process.exit(1); }
