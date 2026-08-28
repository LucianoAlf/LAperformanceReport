/// <reference lib="deno.ns" />
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adaptarPresencaCanonica,
  adaptarPresencaProfessorCanonica,
  rotuloPresencaFonte,
  resumirAulaPresencaCanonica,
} from './presencaCanonica.ts';

Deno.test('rotula a origem temporal versionada do Emusys', () => {
  assertEquals(
    rotuloPresencaFonte('emusys_politica_temporal'),
    'Emusys (política temporal versionada)',
  );
});

Deno.test('versão flexível não promove ausência bruta sem ocorrência canônica', () => {
  assertEquals(
    adaptarPresencaCanonica({
      alunoId: 10,
      aulaEmusysId: 20,
      emusysPresencaBruta: 'ausente',
      envelope: {
        dados_status: 'atualizados',
        sincronizado_em: '2026-08-27T12:00:00Z',
        regra_versao: 'presenca-ocorrencia-canonica-v2.1+politica-2026-06-07',
        rollout_modo: 'sombra',
        ocorrencias: [],
      },
    }).estado,
    'indeterminado',
  );
});

Deno.test('ausente bruto do Emusys nunca vira falta sem ocorrencia canonica', () => {
  const estado = adaptarPresencaCanonica({
    alunoId: 10,
    aulaEmusysId: 20,
    emusysPresencaBruta: 'ausente',
    envelope: {
      dados_status: 'atualizados',
      sincronizado_em: '2026-08-26T12:00:00Z',
      regra_versao: 'presenca-v2',
      ocorrencias: [],
    },
  });
  assertEquals(estado.estado, 'indeterminado');
  assertEquals(estado.fonte, null);
});

Deno.test('estado estrutural mascara qualquer decisao nominal', () => {
  const estado = adaptarPresencaCanonica({
    alunoId: 10,
    aulaEmusysId: 20,
    envelope: {
      dados_status: 'roster_em_revisao',
      sincronizado_em: null,
      regra_versao: 'presenca-v2',
      ocorrencias: [{
        slot_key: 'slot-1', aluno_id: 10, ids_aulas_emusys: [20],
        resultado_canonico: 'presente', fonte_decisao: 'agenda_secretaria',
        decidido_em: '2026-08-26T12:01:00Z', possui_conflito: false,
        request_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recibo_status: 'concluido',
      }],
    },
  });
  assertEquals(estado.estado, 'roster_em_revisao');
  assertEquals(estado.fonte, null);
  assertEquals(estado.requestId, null);
});

Deno.test('decisao humana preserva fonte horario conflito e recibo', () => {
  const estado = adaptarPresencaCanonica({
    alunoId: 10,
    aulaEmusysId: 20,
    envelope: {
      dados_status: 'atualizados',
      sincronizado_em: '2026-08-26T12:00:00Z',
      regra_versao: 'presenca-v2',
      ocorrencias: [{
        slot_key: 'slot-1', aluno_id: 10, ids_aulas_emusys: [20],
        resultado_canonico: 'falta_justificada', fonte_decisao: 'fabio_audio',
        decidido_em: '2026-08-26T12:01:00Z', possui_conflito: true,
        request_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recibo_status: 'concluido',
      }],
    },
  });
  assertEquals(estado, {
    estado: 'falta_justificada', fonte: 'fabio_audio',
    decididoEm: '2026-08-26T12:01:00Z', conflito: true,
    requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', reciboStatus: 'concluido',
    regraVersao: 'presenca-v2', sincronizadoEm: '2026-08-26T12:00:00Z',
  });
});

Deno.test('ausente bruto do professor nao vira falta sem origem humana', () => {
  const estado = adaptarPresencaProfessorCanonica({
    professorId: 7,
    aulaIds: [20],
    envelope: {
      dados_status: 'atualizados', sincronizado_em: '2026-08-26T12:00:00Z',
      regra_versao: 'presenca-v2', ocorrencias: [], professores_ocorrencias: [],
    },
  });
  assertEquals(estado.estado, 'indeterminado');
});

Deno.test('professor humano preserva fonte horario e recibo', () => {
  const estado = adaptarPresencaProfessorCanonica({
    professorId: 7,
    aulaIds: [20],
    envelope: {
      dados_status: 'atualizados', sincronizado_em: '2026-08-26T12:00:00Z',
      regra_versao: 'presenca-v2', ocorrencias: [],
      professores_ocorrencias: [{
        aula_emusys_id: 20, professor_id: 7, estado: 'presente',
        fonte: 'agenda_secretaria', decidido_em: '2026-08-26T12:02:00Z',
        request_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', recibo_status: 'concluido',
      }],
    },
  });
  assertEquals(estado.estado, 'presente');
  assertEquals(estado.fonte, 'agenda_secretaria');
  assertEquals(estado.requestId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
});

Deno.test('resumo de aula usa somente o envelope e bloqueia pendencia estrutural', () => {
  const aula = {
    cancelada: false,
    alunos: [{ aluno_id: 10, aula_emusys_id: 20, emusys_presenca_bruta: 'ausente' }],
    experimental_leads: [],
  };
  const inseguro = resumirAulaPresencaCanonica({
    aula, ocorrida: true,
    envelope: { dados_status: 'dados_desatualizados', sincronizado_em: null, regra_versao: 'presenca-v2', ocorrencias: [] },
  });
  assertEquals(inseguro.estrutural, true);
  assertEquals(inseguro.pendencias, 0);
  assertEquals(inseguro.completa, false);
});
