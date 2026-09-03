// Prova a cadeia da correcao de COMPETENCIA sem mandar WhatsApp e sem gravar.
//
// Existe por causa do incidente Mayra/CG de 03/09/2026 20:37-20:38 (Lucas
// Nunes): o card saiu com "Parcela 10/2026" e a Mayra escreveu "Sol, a parcela
// e 09/2026". A Sol respondeu "Nao entendi essa" — o bloco de correcao colhia o
// VALOR declarado no texto mas nao a COMPETENCIA, e so rodava quando havia um
// NOME. O classificador LLM tambem nao tinha a intencao `corrigir_competencia`.
//
// ⚠️ A competencia errada NAO foi bug de codigo: a fatura 09/2026 foi baixada
//    no Emusys e o espelho a viu 4 min antes do card; naquele instante ela
//    constava paga sem `valor_pago` propagado, entao caiu fora de todos os
//    ramos da cascata de `sol_caixa_parcela_canonica`. E janela de propagacao —
//    e o conserto e o humano poder DIZER a competencia, que e o que se testa aqui.
//
// ⚠️ Usa `require` do modulo, nao `eval` de funcao solta: extrair funcao por
//    regex arrasta dependencia invisivel (_MES_NOME, BODY_SINTETICO,
//    _UNIDADE_TAG...) e o teste quebra por motivo que nao e o defeito.
//
// Uso: node competencia-correcao.test.cjs   (de dentro de caixa-ingestao/)
const assert = require('assert');
const fs = require('fs');
// ⚠️ resolve contra o CWD, nao contra o diretorio do teste: a suite roda de
//    /tmp com cwd em caixa-ingestao/ (ver tests/sol-runtime/README.md).
const mod = require(require('path').resolve('caixa-financeiro.cjs'));

const { extrairCompetenciaTexto, _alunoRotulado } = mod;
assert.ok(typeof extrairCompetenciaTexto === 'function', 'extrairCompetenciaTexto nao exportada');
assert.ok(typeof _alunoRotulado === 'function', '_alunoRotulado nao exportada');

const src = fs.readFileSync('caixa-financeiro.cjs', 'utf8');
let falhas = 0;
const ok = (cond, msg) => {
  if (!cond) { falhas++; console.log('FALHOU ' + msg); } else console.log('ok     ' + msg);
};

// (1) a frase que a Mayra realmente escreveu
const real = extrairCompetenciaTexto('Sol, a parcela e 09/2026');
ok(real === '09/2026', `frase real da Mayra -> 09/2026 (got ${JSON.stringify(real)})`);
ok(extrairCompetenciaTexto('essa e a de setembro') === '09/' + new Date().getFullYear(),
   'mes por extenso -> 09/ano corrente');
ok(extrairCompetenciaTexto('nao entendi nada') === null, 'texto sem competencia -> null');

// (2) a frase SINTETICA que o fallback monta tem de render NOME e COMPETENCIA
//     ao mesmo tempo — e o nome NAO pode arrastar o sufixo "parcela ...".
// ⚠️ competencia ANTES do rotulo: com `aluno: Nome parcela MM/AAAA` o
//    captador de nome devolve "Lucas Nunes de Salles parcela" — a classe
//    de caracteres dele nao aceita digito, entao para no "09" e deixa a
//    palavra colada. Este teste pegou isso ANTES de ir para producao.
const sint = 'parcela 09/2026 aluno: Lucas Nunes de Salles';
const nome = _alunoRotulado(sint);
ok(/^lucas nunes de salles$/i.test(String(nome || '')),
   `sintetica -> nome limpo sem o sufixo parcela (got ${JSON.stringify(nome)})`);
ok(extrairCompetenciaTexto(sint) === '09/2026', 'sintetica -> competencia 09/2026');

// (3) o patch esta mesmo no fonte vivo
ok(/_competenciaDitada/.test(src), 'fonte tem _competenciaDitada');
ok(/competencia_do_texto_na_correcao/.test(src), 'fonte loga a competencia colhida do texto');
ok(/competencia_ditada_vence_fatura/.test(src), 'fonte tem o guard de fatura divergente');
ok(/corrigir_competencia/.test(src), 'fonte tem a intencao corrigir_competencia');

assert.strictEqual(falhas, 0, `${falhas} caso(s) falharam`);
console.log('\nTODOS OS CASOS PASSARAM');
