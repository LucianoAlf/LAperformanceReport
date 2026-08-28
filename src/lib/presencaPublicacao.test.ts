/// <reference lib="deno.ns" />
import { assertEquals } from 'jsr:@std/assert@1';
import {
  avaliarPublicacaoOcorrencias,
  criarPublicacaoFaltasEmAuditoria,
  filtrarOcorrenciasConfirmadas,
} from './presencaPublicacao.ts';

Deno.test('uma ocorrencia incerta bloqueia a publicacao do universo inteiro', () => {
  const linhas = [
    { status: 'presente', estado_publicacao: 'publicado' },
    { status: 'em_auditoria', estado_publicacao: 'em_auditoria' },
  ];

  assertEquals(avaliarPublicacaoOcorrencias(linhas), {
    denominador: null,
    estado_publicacao: 'em_auditoria',
  });
  assertEquals(filtrarOcorrenciasConfirmadas(linhas), [linhas[0]]);
});

Deno.test('universo completo e publicavel expõe denominador canonico', () => {
  assertEquals(avaliarPublicacaoOcorrencias([
    { status: 'presente', estado_publicacao: 'publicado' },
    { status: 'ausente', estado_publicacao: 'publicado' },
  ]), {
    denominador: 2,
    estado_publicacao: 'publicado',
  });
});

Deno.test('universo vazio ou experimental permanece em auditoria sem zero publicavel', () => {
  assertEquals(avaliarPublicacaoOcorrencias([]), {
    denominador: null,
    estado_publicacao: 'em_auditoria',
  });
  assertEquals(avaliarPublicacaoOcorrencias([
    { status: 'presente', estado_publicacao: 'publicado' },
  ], true), {
    denominador: null,
    estado_publicacao: 'em_auditoria',
  });
});

Deno.test('erro posterior substitui integralmente uma publicacao anterior', () => {
  const anterior = {
    denominador: 12,
    fonte: 'get_faltas_periodo_v2',
    periodo_inicio: '2026-08-01',
    periodo_fim: '2026-08-31',
    regra_versao: 'faltas-periodo-v2.1',
    estado_publicacao: 'publicado' as const,
  };

  const depoisDoErro = criarPublicacaoFaltasEmAuditoria('2026-09-01', '2026-09-30');
  assertEquals({ anterior, depoisDoErro }, {
    anterior,
    depoisDoErro: {
      denominador: null,
      fonte: 'get_faltas_periodo_v2',
      periodo_inicio: '2026-09-01',
      periodo_fim: '2026-09-30',
      regra_versao: 'faltas-periodo-v2.1',
      estado_publicacao: 'em_auditoria',
    },
  });
});
