import assert from 'node:assert/strict';
import test from 'node:test';

import { checarMatricula, checarRenovacao } from '../supabase/functions/_shared/invariantes.ts';

// Caso real que motivou este teste (2026-09-08, Lara Boldrine / Barra, matrícula 870):
// o INSERT em `alunos` foi revertido por exceção num AFTER trigger, a edge não checava o
// `error` do supabase-js, e o log saiu `acao='inserido'` com `status='ok'` e `aluno_id: null`.
// A aluna ficou 6 dias fora do LA Report sem nada acusar. `checarRenovacao` já tratava
// `aluno_id === null` como crítico desde sempre; `checarMatricula` não tratava — era a
// lacuna exata deste caminho.
const PAYLOAD_LARA = {
  evento: 'matricula_nova',
  escola_id: 316,
  escola_nome: 'LA Music School Barra',
  matricula: {
    valor: 530,
    lead_id: 7269,
    aluno_id: 1286,
    curso_id: 32,
    matricula_id: 870,
    nome_aluno: 'Lara Boldrine Lima dos Santos',
    nome_curso: 'Circuito Musical',
    data_matricula: '2026-09-08',
    valor_taxa_matricula: 650,
    telefone_aluno: null,
    telefone_responsavel: '(21) 98138-4787',
    disciplinas: [{
      id: 1274,
      nome: 'Circuito Musical.',
      id_professor: 1002,
      nome_professor: 'Gabriel Santos Teixeira da Silva',
      agendamentos: [{ horario: '10:00', dia_da_semana_nome: 'Sexta-feira' }],
    }],
  },
};

const RESULTADO_OK = {
  aluno_id: 2505,
  curso_id: 46,
  professor_id: 8,
  lead_id: 13319,
  unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
};

const criticas = (invs) => invs.filter((i) => i.severidade === 'critico').map((i) => i.regra);

test('matrícula nova sem aluno gravado é invariante CRÍTICA', async (t) => {
  await t.test('aluno_id nulo com payload íntegro acusa matricula_aluno_nao_gravado', () => {
    const invs = checarMatricula(PAYLOAD_LARA, { ...RESULTADO_OK, aluno_id: null });
    assert.ok(
      criticas(invs).includes('matricula_aluno_nao_gravado'),
      `esperava a crítica matricula_aluno_nao_gravado, veio: ${JSON.stringify(invs)}`,
    );
  });

  await t.test('a mensagem carrega o identificador do registro, não só o sintoma', () => {
    const invs = checarMatricula(PAYLOAD_LARA, { ...RESULTADO_OK, aluno_id: null });
    const alvo = invs.find((i) => i.regra === 'matricula_aluno_nao_gravado');
    // "erro ao gravar aluno" não acha ninguém; "matrícula 870" acha.
    assert.match(alvo.mensagem, /870/);
    assert.match(alvo.mensagem, /Lara Boldrine Lima dos Santos/);
  });

  await t.test('aluno_id preenchido NÃO acusa nada', () => {
    const invs = checarMatricula(PAYLOAD_LARA, RESULTADO_OK);
    assert.equal(criticas(invs).includes('matricula_aluno_nao_gravado'), false);
  });

  await t.test('aluno_id = 0 é id inválido, não "sem id"', () => {
    // Guarda contra escrever a checagem como `!resultado.aluno_id`: id 0 não existe em
    // `alunos` (bigserial começa em 1), mas se um dia chegar, é gravação inválida — e o
    // teste fixa que a regra é sobre ausência de id, medida por `== null`.
    const invs = checarMatricula(PAYLOAD_LARA, { ...RESULTADO_OK, aluno_id: 0 });
    assert.equal(criticas(invs).includes('matricula_aluno_nao_gravado'), false);
  });

  await t.test('não rouba o diagnóstico de payload quebrado', () => {
    // Sem disciplinas, checarMatricula retorna cedo com `matricula_sem_disciplinas`.
    // A crítica nova não pode mascarar essa, que aponta para a causa de verdade.
    const semDisciplinas = {
      ...PAYLOAD_LARA,
      matricula: { ...PAYLOAD_LARA.matricula, disciplinas: [] },
    };
    const invs = checarMatricula(semDisciplinas, { ...RESULTADO_OK, aluno_id: null });
    assert.ok(criticas(invs).includes('matricula_sem_disciplinas'));
  });
});

test('paridade com a renovação, que já tratava o mesmo caso', () => {
  // checarRenovacao nasceu com essa crítica; a matrícula nova ficou sem por
  // esquecimento, não por decisão. Este teste trava as duas juntas.
  const invs = checarRenovacao(PAYLOAD_LARA, { ...RESULTADO_OK, aluno_id: null });
  assert.ok(criticas(invs).includes('renovacao_sem_matricula_anterior'));
});
