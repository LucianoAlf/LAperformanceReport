// Prova a cadeia da correcao de COMPETENCIA sem mandar WhatsApp e sem gravar.
//
// Existe por causa dos incidentes Mayra/CG de 03/09 e 12/09/2026. No segundo,
// a Sol entendeu a competencia, mas a transformou numa frase sintetica com o
// nome do card e alegou que tinha corrigido o ALUNO. A competencia agora e um
// campo proprio, do detector ate o ledger.
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
const mod = require('./_alvo.cjs');

const { extrairCompetenciaTexto, extrairCorrecaoCompetencia,
  normalizarCorrecaoCompetenciaRoteador } = mod;
assert.ok(typeof extrairCompetenciaTexto === 'function', 'extrairCompetenciaTexto nao exportada');
assert.ok(typeof extrairCorrecaoCompetencia === 'function', 'extrairCorrecaoCompetencia nao exportada');

const src = fs.readFileSync(require('./_alvo.cjs').__alvo, 'utf8');
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

// (2) detector de campo: corrige a frase humana, mas nao sequestra uma legenda
// nova que apenas informa a competencia do pagamento.
ok(extrairCorrecaoCompetencia('Sol, a parcela e 09/2026') === '09/2026',
   'frase corretiva -> campo competencia 09/2026');
ok(extrairCorrecaoCompetencia('PG pix parcela 09/2026 aluno Lucas Nunes R$500') === null,
   'pagamento novo com competencia nao vira correcao');
const normalizada = normalizarCorrecaoCompetenciaRoteador(
  { intencao: 'aprovar', competencia: '09/2026' }, 'Sol, a parcela e 09/2026', true);
ok(normalizada.intencao === 'corrigir_competencia',
   'palpite aprovar do modelo e corrigido pela evidencia explicita');

// (3) o patch esta mesmo no fonte vivo
ok(/preview_competencia_corrigida/.test(src), 'fonte tem acao propria de competencia');
ok(/Corrigi a competência para/.test(src), 'fonte narra o campo realmente corrigido');
ok(/descricaoParcelaCoerente/.test(src), 'fonte prioriza competencia estruturada sobre descricao velha');
ok(/corrigir_competencia/.test(src), 'fonte tem a intencao corrigir_competencia');

assert.strictEqual(falhas, 0, `${falhas} caso(s) falharam`);
console.log('\nTODOS OS CASOS PASSARAM');
