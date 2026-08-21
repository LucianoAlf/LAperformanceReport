import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  agruparAusentesPorAluno,
  decidirDestinos,
  planejarConsultas,
} from '../supabase/functions/_shared/reconciliacao-ausentes-operacional.ts';

const fonte = readFileSync(
  'supabase/functions/_shared/reconciliacao-ausentes-operacional.ts',
  'utf8',
);

test('agrupa por aluno: dois cursos encerrando juntos custam UMA consulta', () => {
  // `alunos` e matrícula, nao pessoa — quem faz dois instrumentos tem duas linhas,
  // e elas encerram no mesmo dia com frequencia.
  const { grupos } = agruparAusentesPorAluno([
    { emusys_matricula_id: 647, emusys_aluno_id: 1005 },
    { emusys_matricula_id: 648, emusys_aluno_id: 1005 },
    { emusys_matricula_id: 2298, emusys_aluno_id: 3100 },
  ]);

  assert.equal(grupos.length, 2, 'duas pessoas = duas consultas, nao tres');
  const doAluno1005 = grupos.find((g) => g.emusys_aluno_id === 1005);
  assert.deepEqual(doAluno1005.matriculas, [647, 648]);
});

test('ausente sem emusys_aluno_id nao vira consulta', () => {
  // `/matriculas` nao filtra por matricula_id — so por aluno. Sem a chave, nao ha
  // pergunta a fazer, e inventar uma varredura completa aqui estouraria o timeout.
  const { grupos, semChaveDeConsulta } = agruparAusentesPorAluno([
    { emusys_matricula_id: 835, emusys_aluno_id: null },
    { emusys_matricula_id: 838, emusys_aluno_id: 0 },
    { emusys_matricula_id: 647, emusys_aluno_id: 1005 },
  ]);

  assert.equal(grupos.length, 1);
  assert.deepEqual(semChaveDeConsulta.sort(), [835, 838]);
});

test('nao duplica a mesma matricula repetida na entrada', () => {
  const { grupos } = agruparAusentesPorAluno([
    { emusys_matricula_id: 647, emusys_aluno_id: 1005 },
    { emusys_matricula_id: 647, emusys_aluno_id: 1005 },
  ]);

  assert.deepEqual(grupos[0].matriculas, [647]);
});

test('teto da rodada adia o excedente em vez de estourar o timeout', () => {
  const ausentes = Array.from({ length: 10 }, (_, i) => ({
    emusys_matricula_id: 100 + i,
    emusys_aluno_id: 200 + i,
  }));

  const plano = planejarConsultas(ausentes, 4);

  assert.equal(plano.consultar.length, 4);
  assert.equal(plano.adiadas.length, 6, 'o resto fica para a proxima rodada');
  // O estado e idempotente: adiar nao perde nada, so atrasa.
  assert.deepEqual(plano.adiadas, [104, 105, 106, 107, 108, 109]);
});

test('teto zero ou invalido nao consulta nada (nunca consulta tudo)', () => {
  const ausentes = [{ emusys_matricula_id: 1, emusys_aluno_id: 2 }];

  for (const teto of [0, -1, Number.NaN]) {
    const plano = planejarConsultas(ausentes, teto);
    assert.equal(plano.consultar.length, 0, `teto ${teto} nao pode liberar consulta`);
    assert.deepEqual(plano.adiadas, [1]);
  }
});

test('achou na API: reidrata com o payload real (e o motivo vem junto)', () => {
  // Este e o caso da Gabriela da Costa: sumiu do payload operacional porque virou
  // `inativa`, e a consulta direta devolve `motivo_inativa: 'concluida'`.
  const destinos = decidirDestinos(
    { emusys_aluno_id: 1005, matriculas: [647] },
    [{ id: 647, status: 'inativa', motivo_inativa: 'concluida' }],
  );

  assert.equal(destinos.length, 1);
  assert.equal(destinos[0].acao, 'reidratar');
  assert.equal(destinos[0].emusysMatriculaId, 647);
  assert.equal(destinos[0].matricula.motivo_inativa, 'concluida');
});

test('nao achou na API: ai sim a ausencia e o fato', () => {
  const destinos = decidirDestinos(
    { emusys_aluno_id: 1005, matriculas: [647] },
    [{ id: 999, status: 'ativa' }],
  );

  assert.equal(destinos[0].acao, 'confirmar_ausente');
  assert.equal(destinos[0].emusysMatriculaId, 647);
});

test('matricula que voltou a ser ativa e reidratada, nao marcada como inativa', () => {
  // Se ela sumiu da foto por corrida entre paginas e nao por ter encerrado, o certo
  // e devolver o estado verdadeiro.
  const destinos = decidirDestinos(
    { emusys_aluno_id: 1005, matriculas: [647] },
    [{ id: 647, status: 'ativa', motivo_inativa: null }],
  );

  assert.equal(destinos[0].acao, 'reidratar');
  assert.equal(destinos[0].matricula.status, 'ativa');
});

test('grupo com dois cursos resolve cada matricula por conta propria', () => {
  const destinos = decidirDestinos(
    { emusys_aluno_id: 1005, matriculas: [647, 648] },
    [{ id: 647, status: 'inativa', motivo_inativa: 'concluida' }],
  );

  assert.equal(destinos.find((d) => d.emusysMatriculaId === 647).acao, 'reidratar');
  assert.equal(destinos.find((d) => d.emusysMatriculaId === 648).acao, 'confirmar_ausente');
});

test('a edge nao pode chamar decidirDestinos quando a consulta falha', () => {
  // Guarda de documentacao viva: com lista vazia TUDO vira confirmar_ausente. Por isso
  // falha de rede tem que pular a funcao — e nao passar [] fingindo que a API respondeu.
  const destinos = decidirDestinos({ emusys_aluno_id: 1005, matriculas: [647, 648] }, []);

  assert.ok(destinos.every((d) => d.acao === 'confirmar_ausente'));
  assert.match(fonte, /Consulta que FALHOU nao pode chegar aqui|Consulta que FALHOU não pode chegar aqui/u);
});

// ─── Contrato da edge: a ligação com o módulo puro ───────────────────────────
const edge = readFileSync('supabase/functions/sync-matriculas-emusys/index.ts', 'utf8');

test('a edge consulta a API antes de marcar ausente', () => {
  assert.match(edge, /fetchMatriculasDoAluno\(opcoes\.token, grupo\.emusys_aluno_id\)/u);
  assert.match(edge, /status=todas/u, 'a consulta precisa pedir status=todas');
});

test('a reidratacao usa o MESMO caminho de derivacao do fluxo normal', () => {
  // Duas fontes de escrita com regras proprias para o mesmo campo foi a causa-raiz
  // das duplicatas de renovacao neste projeto. Aqui a derivacao continua unica.
  assert.match(
    edge,
    /matriculasParaReidratar[\s\S]{0,400}?buildEstadoAtualRows\([\s\S]{0,200}?upsertEstadosAtuaisEmLote/u,
  );
});

test('marcar ausente e escopado por id, nao um UPDATE largo', () => {
  // O UPDATE antigo atingia TUDO que faltasse na foto. Agora so as matriculas que a
  // consulta direta confirmou ausentes.
  assert.match(edge, /\.in\('emusys_matricula_id', emusysMatriculaIds\)/u);
});

test('falha de consulta preserva a linha em vez de marcar ausente', () => {
  assert.match(edge, /consultas_com_falha\+\+/u);
  assert.match(edge, /consulta falhou, linha preservada/u);
});

test('a rodada tem teto e orcamento de tempo', () => {
  // O escopo operacional existe para caber no idle timeout de 150s.
  assert.match(edge, /AUSENTES_TETO_CONSULTAS_POR_RODADA\s*=\s*\d+/u);
  assert.match(edge, /AUSENTES_ORCAMENTO_MS\s*=\s*[\d_]+/u);
  assert.match(edge, /if \(Date\.now\(\) > prazo\)/u);
});
