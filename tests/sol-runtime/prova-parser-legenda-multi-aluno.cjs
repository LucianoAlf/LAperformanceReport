#!/usr/bin/env node
// PROVA DO PARSER DE LEGENDA MULTI-ALUNO, com o CÓDIGO REAL da Sol (08/09/2026).
//
// 🔴 O CASO, grupo FINANCEIRO LA RECREIO, 19:23. A Vitória mandou o comprovante
//    de R$ 1.227,38 com a legenda:
//
//      parcelas de setembro, alunos, Lúcia Lai Keun Dang Silva - R$385,00
//      Henrique Dang Silva - R$457,38
//      Christiano Lopes Silva - R$385,00
//      Total: R$1.227,38 - pix
//
//    A Sol respondeu: *"Não vou escolher um deles nem dividir o total sozinho.
//    Manda cada aluno com seu valor, por exemplo: João — R$ 360"* — pedindo
//    exatamente o que estava escrito na frente dela. Mesma família do caso
//    Mayra/Lucca de manhã.
//
//    Foram 17 minutos e 6 idas e vindas até lançar, com a ADM chamando o
//    Luciano no grupo.
//
// ⚠️ Não reimplemento o parser aqui: extraio o bloco do arquivo VIVO e rodo num
//    `vm`. Reimplementar provaria a minha cópia — foi o erro que me custou o
//    patch de áudio da Mila hoje de manhã.
const fs = require('fs');
const vm = require('vm');

const ALVO = process.argv[2] || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
const src = fs.readFileSync(ALVO, 'utf8');

function recorte(de, ate) {
  const i = src.indexOf(de);
  const j = src.indexOf(ate, i);
  if (i < 0 || j < 0) { console.error('nao achei o trecho: ' + de); process.exit(1); }
  return src.slice(i, j);
}

// as três peças reais que o parser usa
const money = recorte('function parseBRMoney', '\n}\n') + '\n}\n';
const bloco = recorte('const _TOKEN_NOME_SOL', 'const PRODUTO_LOJINHA_RE');
const unidadeTag = src.slice(src.indexOf('const _UNIDADE_TAG'),
                             src.indexOf('\n', src.indexOf('const _UNIDADE_TAG')));
// `nomePlausivel` mora longe e depende de `_NAO_NOME`; replico só a forma dela,
// que é permissiva — se o item cair, cai por outra razão, não por este stub.
const stubNome = 'function nomePlausivel(n){const t=String(n||"").trim();'
  + 'return t.length>=4 && /[a-zA-ZÀ-ÿ]{3}/.test(t) && !/^\\d+$/.test(t.replace(/\\s/g,""));}';

const ctx = { console };
vm.createContext(ctx);
vm.runInContext([money, unidadeTag, stubNome, bloco,
  'globalThis.__ex = extrairItensNomeValor; globalThis.__lin = _linhaNomeValorSol;'].join('\n'), ctx);

const CASOS = [
  ['19:23 — legenda COM contexto na frente (a que falhou)',
   'parcelas de setembro, alunos, Lúcia Lai Keun Dang Silva - R$385,00\n'
   + 'Henrique Dang Silva - R$457,38\nChristiano Lopes Silva - R$385,00\nTotal: R$1.227,38 - pix', 3],
  ['19:24 — a MESMA lista, sem o prefixo (a que funcionou)',
   'Lúcia Lai Keun Dang Silva - R$385,00\nHenrique Dang Silva - R$457,38\n'
   + 'Christiano Lopes Silva - R$385,00', 3],
  ['a mensagem de correção de competência (não é lista)',
   'sol, a parcela e do mês 09 - setembro', 0],
  ['o rótulo que a guarda existe para barrar (não pode virar aluno)',
   'Passaporte do Canto - R$400,00\nTaxa de matrícula - R$150,00', 0],
];

let falhou = 0;
for (const [rotulo, txt, esperado] of CASOS) {
  const r = ctx.__ex(txt);
  const soma = r.itens.reduce((a, b) => a + b.valor, 0);
  const ok = r.itens.length === esperado;
  if (!ok) falhou++;
  console.log(`${ok ? '✅' : '❌'} ${rotulo}`);
  console.log(`     itens=${r.itens.length} (esperado ${esperado}) · total_declarado=${r.totalDeclarado} · soma=${soma.toFixed(2)}`);
  for (const i of r.itens) console.log(`       · ${i.aluno_nome} = ${i.valor}`);
}

console.log('\nlinha a linha do caso das 19:23:');
for (const l of CASOS[0][1].split('\n')) {
  console.log('   ' + JSON.stringify(l.slice(0, 56)).padEnd(60) + ' -> ' + JSON.stringify(ctx.__lin(l)));
}
process.exit(falhou ? 1 : 0);
