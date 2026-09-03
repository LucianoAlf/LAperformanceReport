// Regra pura: CONFLITO de grafia x ABREVIACAO no nome do aluno.
//
// Existe por causa do incidente Mayra/CG de 03/09/2026 22:22-22:24 (aluno
// Lucas Nunes): a Sol respondia "Atualizei a pendencia com o aluno informado"
// e reenviava um card IDENTICO, porque o nome ditado resolvia para o MESMO
// cadastro. Do lado de quem corrigiu e indistinguivel de ter sido ignorada —
// a Mayra repetiu, recebeu o mesmo card, e o pagamento ficou parado.
//
// ⚠️ O casamento estava CERTO (so existe um "Lucas Nunes" ativo em CG, Teclado,
//    R$ 417, parcela 09/2026 vence 05/09). O defeito era a FRASE.
//
// ⚠️ O gatilho tem que ser CONFLITO, nao qualquer diferenca: "aluno: Lucas"
//    contra "Lucas Nunes de Salles" e abreviacao. Disparar nela faria a Sol
//    virar burocrata em toda correcao com nome curto.
//
// Nao manda WhatsApp e nao grava no caixa — le a funcao do fonte e avalia.
// Uso: node conflito-grafia-nome.test.cjs   (de dentro de caixa-ingestao/)
const assert = require('assert');
const fs = require('fs');

const src = fs.readFileSync('caixa-financeiro.cjs', 'utf8');
const pega = (re, nome) => {
  const m = src.match(re);
  assert.ok(m, `nao achei ${nome} no fonte — o patch foi revertido?`);
  return m[0];
};
eval([
  pega(/function _normConf[\s\S]*?\n}/, '_normConf'),
  pega(/function _conflitoDeGrafiaAluno[\s\S]*?\n}/, '_conflitoDeGrafiaAluno'),
  pega(/function _mesmaPessoa[\s\S]*?\n}/, '_mesmaPessoa'),
].join('\n'));

const casos = [
  ['Lucas Nunes de Souza', 'Lucas Nunes de Salles', true, 'CASO REAL Mayra/CG 03/09'],
  ['Lucas', 'Lucas Nunes de Salles', false, 'abreviacao: so primeiro nome'],
  ['Lucas Nunes', 'Lucas Nunes de Salles', false, 'abreviacao: nome + sobrenome'],
  ['Lucas Nunes de Salles', 'Lucas Nunes de Salles', false, 'identico'],
  ['lucas nunes de salles', 'Lucas Nunes de SALLES', false, 'so caixa/acento'],
  ['Maria Flor', 'Maria Luisa Santos', true, 'mesmo 1o nome, pessoa diferente'],
  ['Soraia da Silveira Duarte', 'Laura Sobreira da Silveira', true, 'par que ja furou o corte de similaridade (29/08)'],
];

let falhas = 0;
for (const [ditado, cadastro, esperado, nota] of casos) {
  const got = _conflitoDeGrafiaAluno(ditado, cadastro);
  const ok = got === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok    ' : 'FALHOU'} conflito(${JSON.stringify(ditado)}, ${JSON.stringify(cadastro)}) = ${got} (esperado ${esperado}) — ${nota}`);
}

// O patch NAO mexe no casamento: Salles x Souza segue sendo "mesma pessoa",
// e e justamente por isso que a mensagem precisava mudar.
assert.strictEqual(_mesmaPessoa('Lucas Nunes de Salles', 'Lucas Nunes de Souza'), true,
  'o patch nao pode ter alterado _mesmaPessoa');
console.log('ok     _mesmaPessoa(Salles, Souza) = true (casamento intacto)');

assert.strictEqual(falhas, 0, `${falhas} caso(s) falharam`);
console.log('\nTODOS OS CASOS PASSARAM');
