import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// A regra pura vive em contract.ts. Reproduzida aqui em JS para rodar sem Deno
// e sem Docker, com o arquivo lido para garantir que os dois nao divergem.
const contrato = readFileSync(
  new URL('../supabase/functions/classificar-resposta-evasao/contract.ts', import.meta.url),
  'utf8',
);

function decidirAgradecimento(v) {
  const nao = (motivo) => ({ agradecer: false, motivo_nao_agradecer: motivo });
  if (!v.e_resposta) return nao('nao_e_resposta');
  if (v.confianca !== 'alta') return nao('confianca_insuficiente');
  if (v.contem_pergunta) return nao('contem_pergunta');
  if (v.pede_atendimento_humano) return nao('pede_atendimento');
  return { agradecer: true, motivo_nao_agradecer: null };
}

const respostaBoa = {
  e_resposta: true,
  confianca: 'alta',
  motivo: 'avaliou a experiencia',
  contem_pergunta: false,
  pede_atendimento_humano: false,
};

test('so agradece quando e resposta, com confianca alta e sem pendencia', () => {
  assert.deepEqual(decidirAgradecimento(respostaBoa), {
    agradecer: true,
    motivo_nao_agradecer: null,
  });
});

test('nunca agradece quando nao e resposta', () => {
  // Caso real: "Mando mais tarde" (Joachim, 05/08) -- promessa, nao resposta.
  const r = decidirAgradecimento({ ...respostaBoa, e_resposta: false });
  assert.equal(r.agradecer, false);
  assert.equal(r.motivo_nao_agradecer, 'nao_e_resposta');
});

test('duvida vira silencio: media e baixa nao agradecem', () => {
  // O erro de NAO agradecer e invisivel (e o comportamento de hoje); o de
  // agradecer a toa chega no WhatsApp da pessoa e nao tem desfazer.
  for (const confianca of ['media', 'baixa']) {
    const r = decidirAgradecimento({ ...respostaBoa, confianca });
    assert.equal(r.agradecer, false, `confianca ${confianca} nao pode agradecer`);
    assert.equal(r.motivo_nao_agradecer, 'confianca_insuficiente');
  }
});

test('pergunta no texto bloqueia o agradecimento', () => {
  // Agradecer sem responder confirma que ninguem leu -- pior que o silencio.
  const r = decidirAgradecimento({ ...respostaBoa, contem_pergunta: true });
  assert.equal(r.agradecer, false);
  assert.equal(r.motivo_nao_agradecer, 'contem_pergunta');
});

test('quem cobra atendimento precisa de gente, nao de obrigado', () => {
  const r = decidirAgradecimento({ ...respostaBoa, pede_atendimento_humano: true });
  assert.equal(r.agradecer, false);
  assert.equal(r.motivo_nao_agradecer, 'pede_atendimento');
});

test('a chave de idempotencia inclui a versao do prompt', () => {
  // Sem isso, reclassificar a mesma massa com prompt melhor sobrescreveria o
  // placar anterior em vez de permitir comparar os dois.
  assert.match(contrato, /chaveIdempotencia\([\s\S]*?promptVersao: string,/);
  assert.match(contrato, /classificacao_ia_evasao:\$\{pesquisaId\}:\$\{analiseVersao\}:\$\{promptVersao\}/);
});

test('o classificador nao tem veto sobre o registro', () => {
  // Guardrail de escopo: se alguem fizer o contract decidir o registro, este
  // teste cai. O registro segue com a regra permissiva de >= 3 palavras --
  // trocar um erro barato (registrar lixo) por um caro (perder feedback) foi
  // decisao explicita do Hugo em 27/08.
  assert.doesNotMatch(contrato, /resposta_status/);
  assert.doesNotMatch(contrato, /update|insert|from\(/i);
  assert.match(contrato, /NÃO decide o registro da resposta/);
});
