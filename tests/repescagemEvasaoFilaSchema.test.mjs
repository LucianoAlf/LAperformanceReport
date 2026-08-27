import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260827090000_pesquisa_evasao_envios_fila.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('fila de repescagem tem estados e colunas de lease', () => {
  assert.ok(existsSync(migrationUrl), 'migration da fila deve existir');
  const source = sql();
  assert.match(source, /create table public\.pesquisa_evasao_envios_fila/i);
  assert.match(source, /pendente[\s\S]*enviando[\s\S]*enviada[\s\S]*falhou[\s\S]*cancelada/i);
  assert.match(source, /lease_expires_at/i);
  assert.match(source, /worker_id/i);
  assert.match(source, /toque\s+integer/i);
});

test('unicidade impede toque repetido e dois envios vivos', () => {
  const source = sql();
  assert.match(source, /unique\s*\(\s*pesquisa_id\s*,\s*toque\s*\)/i);
  assert.match(
    source,
    /create unique index[\s\S]+pesquisa_evasao_envios_fila_vivo_uidx[\s\S]+where[\s\S]+'pendente'[\s\S]+'enviando'/i,
  );
});

test('tabela nasce fechada e so abre select escopado para authenticated', () => {
  const source = sql();
  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on table public\.pesquisa_evasao_envios_fila\s+from public, anon, authenticated/i);
  assert.match(source, /grant select on table public\.pesquisa_evasao_envios_fila to authenticated/i);
  // chamada de funcao dentro de (select ...) vira InitPlan
  assert.match(source, /\(\s*select public\.is_admin\(\)\s*\)/i);
  assert.match(source, /\(\s*select public\.get_user_unidade_ids\(\)\s*\)/i);
});

const templateUrl = new URL(
  '../supabase/migrations/20260827091000_pesquisa_evasao_template_repescagem.sql',
  import.meta.url,
);

test('templates de repescagem existem nos dois publicos e nao citam o aluno', () => {
  assert.ok(existsSync(templateUrl), 'migration do template deve existir');
  const source = readFileSync(templateUrl, 'utf8');

  assert.match(source, /'evasao_repescagem'/);
  assert.match(source, /'direto'/);
  assert.match(source, /'responsavel'/);
  assert.match(source, /\{\{aluno_primeiro_nome\}\}/);
  assert.match(source, /\{\{responsavel_primeiro_nome\}\}/);
  assert.match(source, /\{\{assinatura_com_artigo\}\}/);
  // o texto aprovado nao menciona o aluno na versao do responsavel
  assert.doesNotMatch(source, /\{\{aluno_com_preposicao\}\}/);
});

const unicidadeUrl = new URL(
  '../supabase/migrations/20260827090500_pesquisa_evasao_templates_unicidade_por_chave.sql',
  import.meta.url,
);

test('BLOQUEANTE: unicidade de template ativo passa a ser por (chave, publico), antes da insercao dos templates', () => {
  assert.ok(
    existsSync(unicidadeUrl),
    'migration de unicidade por chave deve existir, com timestamp anterior a de insercao dos templates',
  );
  const source = readFileSync(unicidadeUrl, 'utf8');

  assert.match(source, /drop index if exists public\.pesquisa_evasao_templates_publico_ativo_uidx/i);
  assert.match(
    source,
    /create unique index pesquisa_evasao_templates_chave_publico_ativo_uidx[\s\S]+on public\.pesquisa_evasao_templates\s*\(\s*chave\s*,\s*publico\s*\)[\s\S]+where ativo/i,
  );

  // precisa rodar ANTES de 20260827091000 (insercao dos templates de repescagem)
  const nomeArquivo = unicidadeUrl.pathname.split('/').pop();
  const timestampUnicidade = nomeArquivo.slice(0, 14);
  const timestampTemplates = '20260827091000';
  assert.ok(
    timestampUnicidade < timestampTemplates,
    'a migration de unicidade precisa rodar antes da insercao dos templates de repescagem',
  );

  // item 5 do review: unica funcao de trigger da branch sem revoke de anon
  assert.match(
    source,
    /revoke execute on function public\.fn_pesquisa_evasao_envios_fila_touch\(\)\s*\n?\s*from public, anon, authenticated/i,
  );
});

const enviarPesquisaEvasaoIndexUrl = new URL(
  '../supabase/functions/enviar-pesquisa-evasao/index.ts',
  import.meta.url,
);

test('BLOQUEANTE: edge do 1o toque filtra template ativo por chave, nao so por publico', () => {
  const source = readFileSync(enviarPesquisaEvasaoIndexUrl, 'utf8');
  const inicio = source.indexOf('from("pesquisa_evasao_templates")');
  assert.ok(inicio >= 0, 'consulta de template deve existir em enviar-pesquisa-evasao/index.ts');
  const trecho = source.slice(inicio, inicio + 300);
  assert.match(
    trecho,
    /\.eq\(\s*"chave",\s*"evasao_aberta"\s*\)/,
    'a consulta precisa filtrar chave=evasao_aberta, senao a exigencia de "exatamente 1 template" passa a falhar sempre com duas chaves ativas',
  );
});
