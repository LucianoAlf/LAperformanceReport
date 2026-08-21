import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ESCOLA_ID_POR_UNIDADE,
  MOTIVO_CONTRATO_CONCLUIDO,
  dataFimDoContrato,
  ehContratoConcluido,
  montarWebhookFinalizacao,
} from '../supabase/functions/_shared/nao-renovacao-por-pull.ts';

const BARRA = '368d47f5-2d88-4475-bc14-ba084a9a348e';

// Payload real da Gabriela da Costa (Barra, matrícula 647), reduzido aos campos que o
// parser do webhook lê. Contrato concluído em 18/08/2026, 41 de 41 aulas dadas.
const GABRIELA = {
  id: 647,
  status: 'inativa',
  motivo_inativa: 'concluida',
  data_matricula: '2025-08-11',
  aluno: {
    id: 1005,
    lead_id: 4757,
    nome: 'Gabriela da Costa',
    email: '',
    telefone: '',
    data_nascimento: '2016-07-13',
  },
  responsavel: { id: 1004, nome: 'Daniela Cosentino Gomes', telefone: '(21) 98131-8329' },
  contrato_atual: {
    id: 887,
    valor_mensalidade: 467,
    data_original_ultima_aula: '2026-08-18',
    disciplinas: [{
      nome: 'Teclado T',
      nome_professor: 'Erick Cosme da Silva',
      id_professor: 1160,
      data_hora_primeira_aula: '2025-08-14 18:00:00',
      data_hora_ultima_aula: '2026-08-18 18:00:00',
      agendamentos: [{ dia_da_semana_nome: 'Terça-feira', horario: '18:00' }],
    }],
  },
};

test('so dispara para contrato CONCLUIDO', () => {
  assert.equal(ehContratoConcluido(GABRIELA), true);
});

test('interrompida NAO dispara — isso e evasao, outro caminho', () => {
  // Medido em 2026: das 58 nao-renovacoes lancadas a mao, 5 estao como `interrompida`
  // no Emusys. A fonte as classifica como evasao; tratar aqui inventaria classificacao.
  assert.equal(
    ehContratoConcluido({ ...GABRIELA, motivo_inativa: 'interrompida' }),
    false,
  );
  assert.equal(montarWebhookFinalizacao({ ...GABRIELA, motivo_inativa: 'interrompida' }, BARRA), null);
});

test('matricula ainda ativa nao dispara', () => {
  assert.equal(ehContratoConcluido({ ...GABRIELA, status: 'ativa', motivo_inativa: null }), false);
});

test('nulo e objeto vazio nao quebram nem disparam', () => {
  assert.equal(ehContratoConcluido(null), false);
  assert.equal(ehContratoConcluido(undefined), false);
  assert.equal(ehContratoConcluido({}), false);
});

test('a data da saida e a da ULTIMA AULA, nao a da deteccao', () => {
  // O sync roda de madrugada e pode achar a conclusao dias depois; datar pela descoberta
  // jogaria a movimentacao para a competencia errada.
  assert.equal(dataFimDoContrato(GABRIELA), '2026-08-18');
});

test('aceita data com hora e corta para o dia', () => {
  const comHora = { contrato_atual: { data_original_ultima_aula: '2026-08-18 18:00:00' } };
  assert.equal(dataFimDoContrato(comHora), '2026-08-18');
});

test('sem data de fim nao monta payload', () => {
  const semData = { ...GABRIELA, contrato_atual: { ...GABRIELA.contrato_atual, data_original_ultima_aula: null } };
  assert.equal(montarWebhookFinalizacao(semData, BARRA), null);
});

test('sem nome de aluno nao monta payload', () => {
  // Sem nome o handler cairia em `erro_aluno_nao_encontrado` do outro lado.
  const semNome = { ...GABRIELA, aluno: { ...GABRIELA.aluno, nome: '   ' } };
  assert.equal(montarWebhookFinalizacao(semNome, BARRA), null);
});

test('unidade desconhecida nao monta payload', () => {
  assert.equal(montarWebhookFinalizacao(GABRIELA, '00000000-0000-0000-0000-000000000000'), null);
});

test('traduz o item da API para o formato que o parser do webhook le', () => {
  const body = montarWebhookFinalizacao(GABRIELA, BARRA);

  assert.equal(body.evento, 'matricula_finalizacao');
  assert.equal(body.escola_id, 316, 'Barra');

  // A API usa `id`/`aluno.nome`; o webhook usa `matricula_id`/`nome_aluno`.
  assert.equal(body.matricula.matricula_id, 647);
  assert.equal(body.matricula.nome_aluno, 'Gabriela da Costa');
  assert.equal(body.matricula.aluno_id, 1005);
  assert.equal(body.matricula.lead_id, 4757);
  assert.equal(body.matricula.nome_curso, 'Teclado T');
  assert.equal(body.matricula.valor, 467);
  assert.equal(body.matricula.nome_responsavel, 'Daniela Cosentino Gomes');

  // O roteamento do handler depende destes dois.
  assert.equal(body.matricula.status, 'inativa');
  assert.equal(body.matricula.motivo_inativa, 'concluida');

  // `disciplinas` vai inteiro: o parser tira professor, dia e horario do primeiro item.
  assert.equal(body.matricula.disciplinas[0].id_professor, 1160);
  assert.equal(body.matricula.disciplinas[0].agendamentos[0].dia_da_semana_nome, 'Terça-feira');
});

test('a data e o motivo vao no bloco finalizacao, que e de onde o parser os le', () => {
  const body = montarWebhookFinalizacao(GABRIELA, BARRA);

  assert.equal(body.finalizacao.data_finalizacao, '2026-08-18');
  assert.equal(body.finalizacao.motivo, MOTIVO_CONTRATO_CONCLUIDO);
  assert.equal(body.finalizacao.motivo_inativa, 'concluida');
});

test('o motivo casa com o catalogo para o trigger resolver a FK', () => {
  // `trg_resolver_motivo_saida_movimentacao_admin` casa por motivos_saida.nome_normalizado,
  // que e upper(trim(nome)). O id 18 e "Concluído e não vai renovar".
  assert.equal(MOTIVO_CONTRATO_CONCLUIDO.trim().toUpperCase(), 'CONCLUÍDO E NÃO VAI RENOVAR');
});

test('marca a origem para o registro nao se passar por webhook do Emusys', () => {
  const body = montarWebhookFinalizacao(GABRIELA, BARRA);
  assert.equal(body.origem_sync, 'sync-matriculas-emusys');
});

test('as tres unidades estao mapeadas para o escola_id do webhook', () => {
  assert.deepEqual(Object.values(ESCOLA_ID_POR_UNIDADE).sort((a, b) => a - b), [39, 40, 316]);
});

// ─── Contrato: o modulo so TRADUZ, nao decide ────────────────────────────────
const fonte = readFileSync('supabase/functions/_shared/nao-renovacao-por-pull.ts', 'utf8');
// Os comentarios explicam o desenho e citam nomes de tabela e coluna de proposito;
// o que precisa ficar limpo e o CODIGO.
const codigo = fonte
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/^\s*\/\/.*$/gmu, '');

test('o modulo nao escreve no banco', () => {
  // A decisao e a escrita continuam no handler do webhook. Duas fontes de escrita com
  // regras proprias para o mesmo campo foi a causa-raiz das duplicatas de renovacao.
  assert.doesNotMatch(codigo, /movimentacoes_admin/u);
  assert.doesNotMatch(codigo, /\.insert\(|\.update\(|supabase|createClient/u);
});

test('o modulo nao crava o id do motivo (quem resolve e o trigger)', () => {
  assert.doesNotMatch(codigo, /motivo_saida_id/u);
  assert.doesNotMatch(codigo, /\b18\b/u);
});

// ─── Contrato da edge: onde e como o sync dispara ────────────────────────────
const edge = readFileSync('supabase/functions/sync-matriculas-emusys/index.ts', 'utf8');

test('o sync chama o handler que ja existe, em vez de inserir por conta propria', () => {
  assert.match(edge, /functions\/v1\/processar-matricula-emusys/u);
  assert.match(edge, /montarWebhookFinalizacao\(matricula, unidadeId\)/u);
});

test('o sync NAO insere nao_renovacao direto em movimentacoes_admin', () => {
  // A regra tem uma fonte so. Se isto quebrar, nasceu a segunda.
  assert.doesNotMatch(edge, /from\('movimentacoes_admin'\)[\s\S]{0,200}?\.insert\(/u);
});

test('a notificacao acontece DEPOIS do upsert do estado', () => {
  // Se o estado nao gravou, a movimentacao nao deve existir.
  assert.match(
    edge,
    /upsertEstadosAtuaisEmLote\(supabase, \{ id: unidadeId \}, linhas\)[\s\S]{0,600}?notificarContratosConcluidos/u,
  );
});

test('falha ao notificar nao derruba o sync', () => {
  assert.match(edge, /resultado\.falhas\+\+/u);
  assert.match(edge, /falha ao registrar contrato concluido/u);
});

test('o bearer e a ANON, nao a service role (senao 401 silencioso no gateway)', () => {
  // `processar-matricula-emusys` tem verify_jwt = true, e o gateway nao aceita a service
  // key opaca usada entre Edges — e o motivo pelo qual `reconciliar-grade-aluno` precisou
  // ficar com verify_jwt = false. Medido em 21/08: anon passa (400 da propria funcao),
  // service key nao. Como este bloco engole erro, o 401 ficaria invisivel.
  assert.match(
    edge,
    /processar-matricula-emusys[\s\S]{0,300}?Authorization: `Bearer \$\{SUPABASE_ANON_KEY\}`/u,
  );
});
