import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260804220000_pesquisa_evasao_subprojeto_c_schema.sql',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('classificacao e desfecho sao versionados e append-only', () => {
  const sql = read(migrationPath);
  assert.ok(sql, 'migration estrutural do Subprojeto C ainda nao existe');
  assert.match(sql, /create table if not exists public\.pesquisa_evasao_classificacoes/i);
  assert.match(sql, /unique\s*\(pesquisa_id, versao\)/i);
  assert.match(sql, /create table if not exists public\.pesquisa_evasao_classificacao_categorias/i);
  assert.match(sql, /primary key\s*\(classificacao_id, categoria\)/i);
  assert.match(sql, /create table if not exists public\.pesquisa_evasao_desfechos/i);
  assert.match(sql, /before update or delete[\s\S]*fn_pesquisa_evasao_c_append_only/i);
});

test('aluno_acoes perde escrita direta e preserva leitura interna', () => {
  const sql = read(migrationPath);
  assert.match(sql, /drop policy if exists "Authenticated users can manage actions"/i);
  assert.match(sql, /create policy aluno_acoes_leitura_interna/i);
  assert.match(sql, /fn_pesquisa_evasao_usuario_interno_ativo\(\)/i);
  assert.match(sql, /revoke insert, update, delete on public\.aluno_acoes from authenticated/i);
  assert.doesNotMatch(sql, /create policy[^;]*aluno_acoes[^;]*for all/is);
});

test('colunas legadas ficam documentadas e sem backfill', () => {
  const sql = read(migrationPath);
  assert.match(sql, /comment on column public\.pesquisa_evasao\.categoria_resposta[\s\S]*LEGADO/i);
  assert.match(sql, /comment on column public\.pesquisa_evasao\.sentimento[\s\S]*LEGADO/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao[\s\S]*categoria_resposta/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao[\s\S]*sentimento/i);
});

test('schema fecha taxonomia e coerencia basica das acoes', () => {
  const sql = read(migrationPath);
  for (const categoria of [
    'financeiro',
    'tempo_horario',
    'saude',
    'desanimo',
    'pedagogico_professor',
    'atendimento_experiencia',
    'mudanca_endereco',
    'familia_estudos_trabalho',
    'outro',
    'inconclusivo',
    'resposta_invalida',
  ]) {
    assert.match(sql, new RegExp(`'${categoria}'`));
  }
  assert.match(sql, /aluno_acoes_estado_check/i);
  assert.match(sql, /estado in \('pendente', 'realizada', 'cancelada'\)/i);
  assert.match(sql, /classificacao_evasao_id uuid/i);
  assert.match(sql, /professor_id integer references public\.professores\(id\)/i);
});
