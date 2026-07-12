import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260712120000_seguranca_aluno_p0_p1.sql';
const crmMigrationPath = 'supabase/migrations/20260712121000_crm_midia_privado_p0.sql';
const edgePath = 'supabase/functions/processar-matricula-emusys/index.ts';
const crmMediaPath = 'src/lib/crmMedia.ts';
const crmHookPath = 'src/components/App/PreAtendimento/hooks/useMensagens.ts';
const adminHookPath = 'src/components/App/Administrativo/CaixaEntrada/hooks/useAdminMensagens.ts';

const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('RPCs de aluno e professor exigem escopo e preservam passagem de bastao', () => {
  assert.ok(existsSync(migrationPath), 'migration de seguranca deve existir');
  const migration = read(migrationPath);

  assert.match(migration, /create or replace function public\.get_jornada_professor/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /professores\.editar/i);
  assert.match(migration, /create or replace function public\.get_historico_pedagogico_aluno/i);
  assert.match(migration, /create or replace function public\.get_relatorio_pedagogico_aluno/i);
  assert.match(migration, /fn_pode_ler_aluno_pedagogico/i);
  assert.match(migration, /revoke all on function public\.get_jornada_professor\(integer\) from public, anon/i);
  assert.match(migration, /revoke all on function public\.get_passagem_bastao_aluno\(integer\) from public, anon/i);
  assert.match(migration, /revoke all on function public\.get_passagens_bastao_pendentes\(integer\) from public, anon/i);
});

test('crm-midia fica privado e escrita exige permissao operacional', () => {
  const migration = read(crmMigrationPath);
  assert.match(migration, /update storage\.buckets\s+set public = false\s+where id = 'crm-midia'/i);
  assert.match(migration, /alunos\.whatsapp/i);
  assert.match(migration, /to authenticated/i);
  assert.doesNotMatch(migration, /create policy[^;]+crm-midia[^;]+to (?:public|anon)/is);

  assert.ok(existsSync(crmMediaPath), 'utilitario de URL assinada deve existir');
  for (const hookPath of [crmHookPath, adminHookPath]) {
    const hook = read(hookPath);
    assert.match(hook, /assinarUrlCrmMidia|assinarMidiasDasMensagens/);
    assert.doesNotMatch(hook, /from\('crm-midia'\)[\s\S]{0,160}getPublicUrl/);
  }
});

test('avatars mantem leitura publica sem escrita ou exclusao anonima', () => {
  const migration = read(migrationPath);
  assert.match(migration, /avatars_leitura_publica/i);
  assert.match(migration, /for select\s+to public/i);
  assert.doesNotMatch(migration, /create policy[^;]+avatars[^;]+for (?:insert|update|delete)[^;]+to (?:public|anon)/is);
});

test('classificacao canonica considera 12 anos como EMLA', () => {
  const edge = read(edgePath);
  assert.match(edge, /return idade < 12 \? 'LAMK' : 'EMLA';/);
  assert.doesNotMatch(edge, /return idade <= 12 \? 'LAMK' : 'EMLA';/);
});
