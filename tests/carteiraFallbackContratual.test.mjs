import assert from 'node:assert/strict';
import test from 'node:test';

import { montarCarteirasFallbackContratual } from '../src/lib/carteiraFallbackContratual.mjs';

test('mantém a carteira contratual visível quando os KPIs canônicos ficam indisponíveis', () => {
  const carteiras = montarCarteirasFallbackContratual({
    linhasContratuais: [
      {
        professor_id: 14,
        professor_nome: 'Professora de teste',
        foto_url: null,
        total_alunos: 8,
        alunos_lamk: 5,
        alunos_emla: 3,
        mrr_total: 3200,
        ticket_medio: 400,
        alunos_ticket: 8,
        tempo_medio_meses: 10.5,
        total_turmas: 6,
        media_alunos_turma: 1.33,
        cursos: ['Piano'],
        unidades: ['Barra'],
      },
      {
        professor_id: 15,
        professor_nome: 'Sem carteira',
        total_alunos: 0,
      },
    ],
    trancadosPorProfessor: new Map([[14, 2]]),
  });

  assert.deepEqual(carteiras, [
    {
      id: 14,
      nome: 'Professora de teste',
      foto_url: null,
      total_alunos: 8,
      alunos_lamk: 5,
      alunos_emla: 3,
      mrr_total: 3200,
      ticket_medio: 400,
      alunos_ticket: 8,
      tempo_medio_meses: 10.5,
      total_turmas: 6,
      media_alunos_turma: 1.33,
      cursos: ['Piano'],
      unidades: ['Barra'],
      health_score: null,
      health_status: null,
      health_score_exibivel: false,
      health_score_estado_publicacao: 'indisponivel',
      health_score_cobertura: null,
      health_score_motivo: 'Dados de performance indisponíveis no momento',
      total_trancados: 2,
    },
  ]);
});

test('não inventa zero para trancados quando o enriquecimento não respondeu', () => {
  const [carteira] = montarCarteirasFallbackContratual({
    linhasContratuais: [{ professor_id: 14, professor_nome: 'Professora de teste', total_alunos: 1 }],
    trancadosDisponiveis: false,
  });

  assert.equal(carteira.total_trancados, null);
});

test('não apresenta média/turma viva como se fosse da competência quando o KPI falhou', () => {
  const [carteira] = montarCarteirasFallbackContratual({
    linhasContratuais: [{ professor_id: 14, professor_nome: 'Professora de teste', total_alunos: 1, media_alunos_turma: 1.5 }],
    mediaTurmaDisponivel: false,
  });

  assert.equal(carteira.media_alunos_turma, null);
});
