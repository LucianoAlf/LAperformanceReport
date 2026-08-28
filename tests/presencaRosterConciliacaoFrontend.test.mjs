import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const component = readFileSync(
  'src/components/App/Alunos/ConciliacaoPresencas.tsx',
  'utf8',
);

function blocoEntre(inicio, fim) {
  const comeco = component.indexOf(inicio);
  const final = component.indexOf(fim, comeco + inicio.length);
  assert.notEqual(comeco, -1, `bloco ${inicio} ausente`);
  assert.notEqual(final, -1, `limite ${fim} ausente`);
  return component.slice(comeco, final);
}

test('oferece os tres filtros estruturais sem remover os filtros nominais', () => {
  assert.match(component, /Roster vazio confirmado/);
  assert.match(component, /Roster incompleto/);
  assert.match(component, /Identidade amb[ií]gua/);
  assert.match(component, /\['pendente',\s*'Pendentes'\]/);
  assert.match(component, /\['todas',\s*'Todas'\]/);
  assert.match(component, /'2026-08'.*'Ago\/2026'.*'2026-08-01'.*'2026-08-31'/);
  assert.match(component, /useState<Competencia>\('2026-08'\)/);
});

test('cabecalho estrutural usa seu proprio total e oculta a busca nominal', () => {
  assert.match(component, /filtroEstrutural \? 'Revis[aã]o estrutural do roster' : 'Presen[cç]as a confirmar'/);
  assert.match(component, /dadosRoster\.resumo\.total/);
  assert.match(component, /!filtroEstrutural && \([\s\S]*placeholder="Buscar aluno, professor ou curso"/);
});

test('carrega a fila estrutural pela RPC canônica com o recorte completo', () => {
  const carregarRoster = blocoEntre('const carregarRoster', 'const reprocessarRoster');

  assert.match(carregarRoster, /get_conciliacao_roster_operacional_v1/);
  for (const parametro of [
    'p_unidade_id',
    'p_data_inicio',
    'p_data_fim',
    'p_estado',
    'p_limite',
    'p_offset',
  ]) {
    assert.match(carregarRoster, new RegExp(`\\b${parametro}\\b`));
  }
});

test('reprocessamento apenas solicita novo sync de presença para a aula', () => {
  const reprocessar = blocoEntre('const reprocessarRoster', 'const abrirCorrecao');

  assert.match(reprocessar, /functions\.invoke\(['"]sync-presenca-emusys['"]/);
  assert.match(reprocessar, /modo:\s*['"]presenca['"]/);
  assert.match(reprocessar, /unidade_id:\s*revisao\.unidade_id/);
  assert.match(reprocessar, /data:\s*revisao\.data_aula/);
  assert.match(reprocessar, /dias:\s*1/);
  assert.doesNotMatch(reprocessar, /admin_confirmar_presencas_aula/);
  assert.doesNotMatch(reprocessar, /admin_revisar_presenca_conciliacao/);
  assert.doesNotMatch(reprocessar, /confirmar|corrigir_presente/i);
});

test('fila estrutural exibe metadados da fotografia sem nomes de pessoas', () => {
  const roster = blocoEntre('{filtroEstrutural ? (', ') : erro ? (');

  for (const campo of [
    'unidade_nome',
    'emusys_id',
    'curso_nome',
    'turma_nome',
    'data_aula',
    'data_hora_inicio',
    'estado',
    'qtd_esperada',
    'qtd_recebida',
    'sincronizado_em',
  ]) {
    assert.match(roster, new RegExp(`revisao\\.${campo}`));
  }

  assert.match(roster, /Reprocessar/);
  assert.doesNotMatch(roster, /aluno_nome|professor_nome|Confirmar chamada|Corrigir para presente/);
});
