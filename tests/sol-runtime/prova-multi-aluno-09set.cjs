#!/usr/bin/env node
/**
 * Roda o DETECTOR REAL de multi-aluno contra as legendas reais de 09/09/2026.
 *
 * 🔴 POR QUE EXISTE. A Mayra (CG) gastou 19 minutos e 6 mensagens tentando
 *    fazer a Sol entender um comprovante de dois alunos, e desistiu. A Sol
 *    lançou o preview com R$ 1.290 dizendo "✅ Soma confere com o comprovante"
 *    — o comprovante era R$ 1.722.
 *
 *    O roteador V4, em sombra, classificou a MESMA legenda como
 *    `lancamento_multi_aluno` com confiança 0.95. Ou seja: o dado estava lá e
 *    o runtime não o alcançou. Este arquivo prova em qual portão ele parou.
 *
 * ⚠️ Carrega o `caixa-financeiro.cjs` que está RODANDO (não uma cópia do repo)
 *    — a lição de "código no disco não é código rodando" custou uma semana de
 *    sombra inútil.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';

// ── carrega o módulo real num contexto isolado ────────────────────────────
const fonte = fs.readFileSync(ALVO, 'utf8');
const mod = { exports: {} };
const contexto = {
  module: mod, exports: mod.exports, require, console, process,
  __filename: ALVO, __dirname: path.dirname(ALVO),
  Buffer, setTimeout, clearTimeout, setInterval, clearInterval, fetch, URL,
};
vm.createContext(contexto);
vm.runInContext(fonte, contexto, { filename: ALVO });

// as funções internas não são exportadas — pego do escopo do módulo pelo vm
const detectar = vm.runInContext('detectarContextoMultiAluno', contexto);
const extrairItens = vm.runInContext('extrairItensNomeValor', contexto);
const normConf = vm.runInContext('_normConf', contexto);

// ── os casos REAIS ────────────────────────────────────────────────────────
const CASOS = [
  {
    quem: 'Mayra · CG · 11:25 e 11:42 (2x, idêntico)',
    esperado: true,
    texto: 'PG pix parcelas 09/2026 aluno Davi Guilherme de Souza Chaves Ribeiro '
         + '(4 cursos - R$1290,00) e aluna Thuanny de Souza Chaves Ribeiro '
         + '(R$432,00) - LA CG R$1722,00',
  },
  {
    quem: 'Mayra · CG · 11:37 (explicitou tudo, e a Sol disse "não entendi")',
    esperado: true,
    texto: 'Sol, são dois alunos diferentes Davi Guilherme de Souza Chaves Ribeiro '
         + '(4 cursos R$1290,00) e Thuanny de Souza Chaves Ribeiro '
         + '(1 curso R$432,00) total do comprovante R$1722,00',
  },
  {
    quem: 'Mayra · CG · 11:28 (relato de ausência, NÃO é comando)',
    esperado: true,
    texto: 'Sol, o comprovante é no valor de R$1722,00 faltou a parcela 09/2026 '
         + 'da Thuanny de Souza Chaves Ribeiro',
  },
  {
    quem: 'Fernanda · Recreio · 09:55 (um aluno, dois cursos — NÃO é multi)',
    esperado: false,
    texto: 'Sol, a aluna faz dois cursos',
  },
  {
    quem: 'CONTROLE — formato que a própria Sol ensina',
    esperado: true,
    texto: 'Davi Guilherme — R$ 1290,00\nThuanny Ribeiro — R$ 432,00\nLA CG - R$1722,00',
  },
];

console.log('DETECTOR REAL DE MULTI-ALUNO — legendas de 09/09/2026\n');
let erros = 0;
for (const c of CASOS) {
  const viu = detectar(c.texto);
  const itens = extrairItens(c.texto);
  const ok = viu === c.esperado;
  if (!ok) erros++;
  console.log(`${ok ? '  ' : '🔴'} detectou=${String(viu).padEnd(5)} esperado=${String(c.esperado).padEnd(5)} · ${c.quem}`);
  console.log(`     texto: ${c.texto.replace(/\n/g, ' ⏎ ').slice(0, 110)}`);
  console.log(`     itens deterministicos: ${itens.itens.length}`
            + (itens.totalDeclarado ? ` · total declarado ${itens.totalDeclarado}` : ''));
  if (!viu) {
    // qual ramo faltou? mostrar o texto normalizado ajuda a ver o porquê
    console.log(`     normalizado: ${String(normConf(c.texto)).slice(0, 110)}`);
  }
  console.log('');
}
console.log(erros === 0
  ? 'todos bateram com o esperado'
  : `🔴 ${erros} caso(s) em que o detector discorda da realidade`);
process.exit(erros ? 1 : 0);
