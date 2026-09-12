import assert from 'node:assert/strict';
import test from 'node:test';

import { decidirRotaDoNumero } from '../supabase/functions/_shared/caixa-dono-do-numero.ts';

const UNID_CG = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';

test('decidirRotaDoNumero', async (t) => {
  await t.test('numero de UM aluno vira conversa com dono — inclusive vindo do responsavel', async () => {
    // O caso que abriu a frente: o responsavel escreve primeiro, do numero dele.
    const r = decidirRotaDoNumero({
      status: 'unico', aluno_id: 2492, nome: 'Maria Rosa', unidade_id: UNID_CG, via_responsavel: true,
    });
    assert.equal(r.rota, 'aluno');
    assert.deepEqual(r.aluno, { id: 2492, nome: 'Maria Rosa', unidade_id: UNID_CG });
  });

  await t.test('numero de IRMAOS nao elege ninguem', async () => {
    // Escolher um dos dois fixa o dono da conversa para sempre: o roteamento por conversa
    // passa a usa-lo, e todo o historico do outro irmao entraria sob o nome errado.
    const candidatos = [
      { aluno_id: 967, nome: 'Lucca', unidade_id: UNID_CG },
      { aluno_id: 973, nome: 'Theo', unidade_id: UNID_CG },
    ];
    const r = decidirRotaDoNumero({ status: 'ambiguo', candidatos });
    assert.equal(r.rota, 'externo');
    assert.equal(r.motivo, 'ambiguo');
    assert.deepEqual(r.candidatos, candidatos, 'os candidatos seguem para o log, senao o caso nao e mensuravel');
  });

  await t.test('falha ao resolver NUNCA descarta a mensagem', async () => {
    // Conversa externa e recuperavel; mensagem perdida nao. A direcao da falha e essa.
    const r = decidirRotaDoNumero(null, true);
    assert.equal(r.rota, 'externo');
    assert.equal(r.motivo, 'falha_na_resolucao');
  });

  await t.test('erro vence resposta: resolucao aproveitada de uma chamada que falhou e ignorada', async () => {
    const r = decidirRotaDoNumero({ status: 'unico', aluno_id: 1, unidade_id: UNID_CG }, true);
    assert.equal(r.rota, 'externo');
    assert.equal(r.motivo, 'falha_na_resolucao');
  });

  await t.test('"unico" sem aluno_id ou sem unidade NAO vira conversa com dono indefinido', async () => {
    // Resposta malformada e defeito nosso. Deixar passar gravaria aluno_id undefined e
    // unidade nula numa conversa que o sistema trataria como vinculada.
    for (const resposta of [
      { status: 'unico', aluno_id: null, unidade_id: UNID_CG },
      { status: 'unico', unidade_id: UNID_CG },
      { status: 'unico', aluno_id: 2492, unidade_id: null },
      { status: 'unico', aluno_id: '2492', unidade_id: UNID_CG },
    ]) {
      const r = decidirRotaDoNumero(resposta);
      assert.equal(r.rota, 'externo', JSON.stringify(resposta));
      assert.equal(r.motivo, 'sem_aluno');
    }
  });

  await t.test('numero sem aluno nenhum segue como contato externo', async () => {
    assert.deepEqual(decidirRotaDoNumero({ status: 'nenhum' }), { rota: 'externo', motivo: 'sem_aluno' });
    assert.deepEqual(decidirRotaDoNumero(null), { rota: 'externo', motivo: 'sem_aluno' });
    assert.deepEqual(decidirRotaDoNumero(undefined), { rota: 'externo', motivo: 'sem_aluno' });
  });

  await t.test('status desconhecido cai no lado seguro', async () => {
    // Se a RPC ganhar um status novo, o comportamento e "nao sei quem e", nunca vincular.
    const r = decidirRotaDoNumero({ status: 'talvez', aluno_id: 2492, unidade_id: UNID_CG });
    assert.equal(r.rota, 'externo');
  });
});
