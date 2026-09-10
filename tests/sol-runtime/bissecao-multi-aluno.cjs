#!/usr/bin/env node
/**
 * BISSEÇÃO: em qual versão do runtime a Sol parou de enxergar dois alunos?
 *
 * 🔴 POR QUE EXISTE. O Luciano afirmou que isto JÁ FUNCIONAVA — "a gente já
 *    tinha corrigido, ela identificava dois alunos e aluno com dois cursos".
 *    Se funcionava e parou, não é lacuna: é REGRESSÃO, e regressão tem data,
 *    arquivo e motivo. Achar o ponto exato vale mais que remendar o sintoma,
 *    porque o que quebrou provavelmente consertava outra coisa — e desfazer no
 *    escuro traz o defeito antigo de volta.
 *
 * Carrega cada `caixa-financeiro.cjs.bak-*` num contexto isolado, extrai o
 * `detectarContextoMultiAluno` daquela versão e roda as legendas reais.
 *
 * ⚠️ Versão antiga que nem tem a função conta como "não existia" — é diferente
 *    de "existia e disse não". A saída distingue os dois.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = process.env.SOL_CAIXA_DIR
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao';

const CASOS = [
  {
    id: 'mayra-2-alunos',
    esperado: true,
    texto: 'PG pix parcelas 09/2026 aluno Davi Guilherme de Souza Chaves Ribeiro '
         + '(4 cursos - R$1290,00) e aluna Thuanny de Souza Chaves Ribeiro '
         + '(R$432,00) - LA CG R$1722,00',
  },
  {
    id: 'joao-e-ana-08set',
    esperado: true,
    texto: 'PG pix parcela 09/2026 de João Lucas Henrique da Silva e de '
         + 'Ana Mel Henrique da Silva - Kids CG R$274,00',
  },
  {
    id: 'FALSO-POSITIVO-camisa',   // o que a trava de 29/08 existe para barrar
    esperado: false,
    texto: 'Pagamento camisa PagBank Lhays Marinho e Silva R$65,00',
  },
];

function carregar(arquivo) {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  const mod = { exports: {} };
  const ctx = {
    module: mod, exports: mod.exports, require, console: { log() {}, error() {}, warn() {} },
    process, __filename: arquivo, __dirname: path.dirname(arquivo),
    Buffer, setTimeout, clearTimeout, setInterval, clearInterval, fetch, URL,
  };
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx, { filename: arquivo });
  return ctx;
}

// ordena por data no nome (bak-AAAAMMDD...) — o que não tem data vai para o fim
function chaveDeOrdem(nome) {
  const m = nome.match(/bak-(\d{8})/);
  return m ? m[1] : '99999999';
}

const arquivos = fs.readdirSync(DIR)
  .filter((f) => f.startsWith('caixa-financeiro.cjs'))
  .sort((a, b) => chaveDeOrdem(a).localeCompare(chaveDeOrdem(b)) || a.localeCompare(b));

console.log('BISSEÇÃO — detectarContextoMultiAluno por versão\n');
console.log('legenda 1 = Mayra (2 alunos) · legenda 2 = João e Ana (2 alunos) · legenda 3 = camisa (falso positivo)\n');

let anterior = null;
for (const f of arquivos) {
  const caminho = path.join(DIR, f);
  let det = null;
  let erro = null;
  try {
    const ctx = carregar(caminho);
    det = vm.runInContext('typeof detectarContextoMultiAluno === "function" ? detectarContextoMultiAluno : null', ctx);
  } catch (e) {
    erro = String(e && e.message).slice(0, 60);
  }

  let marca;
  if (erro) marca = `nao carregou (${erro})`;
  else if (!det) marca = 'funcao nao existia';
  else {
    const r = CASOS.map((c) => {
      try { return det(c.texto) ? 'V' : '.'; } catch { return '?'; }
    });
    marca = r.join(' ');
    const assinatura = r.join('');
    if (anterior && anterior.assinatura !== assinatura) {
      console.log(`   ^^^ MUDOU AQUI: ${anterior.assinatura} -> ${assinatura}`);
    }
    anterior = { assinatura, arquivo: f };
  }
  console.log(`${marca.padEnd(34)} ${f}`);
}
console.log('\nV = detectou multi-aluno · . = nao detectou');
