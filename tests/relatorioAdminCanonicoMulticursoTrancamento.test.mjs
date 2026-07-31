import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const migrationPath =
  'supabase/migrations/20260731163353_relatorio_admin_canonico_multicurso_trancamentos.sql';
const migration = read(migrationPath);
const migrationAcl = read(
  'supabase/migrations/20260731164500_restringe_kpis_admin_operacional.sql',
);
const migrationLocks = read(
  'supabase/migrations/20260731220000_relatorio_admin_trancamentos_detalhados.sql',
);
const edge = read('supabase/functions/relatorio-admin-whatsapp/index.ts');
const modal = read('src/components/App/Administrativo/ModalRelatorio.tsx');
const webhook = read('supabase/functions/processar-matricula-emusys/index.ts');

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `secao ausente: ${start}`);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  return source.slice(from, to === -1 ? source.length : to);
}

test('KPI administrativo separa pessoa Emusys de matricula e nunca agrega por nome', () => {
  assert.ok(migration, 'migration canonica administrativa ainda nao existe');
  const kpis = section(
    migration,
    'create or replace function public.get_kpis_alunos_admin_operacional_impl_v2',
    'create or replace function public.get_kpis_alunos_admin_operacional(',
  );

  assert.match(kpis, /a\.emusys_student_id/i);
  assert.match(kpis, /emusys_matriculas_estado_atual[\s\S]*emusys_aluno_id/i);
  assert.match(kpis, /aluno_jornada_matricula_disciplina[\s\S]*emusys_aluno_id/i);
  assert.match(kpis, /pessoa_key/i);
  assert.doesNotMatch(kpis, /lower\s*\(\s*btrim\s*\(\s*a\.nome/i);
  assert.doesNotMatch(kpis, /nome\s*\|\|\s*['"]\|['"]\s*\|\|\s*a\.unidade_id/i);
});

test('matricula adicional depende do flag estrutural, nao do tipo financeiro', () => {
  const kpis = section(
    migration,
    'create or replace function public.get_kpis_alunos_admin_operacional_impl_v2',
    'create or replace function public.get_kpis_alunos_admin_operacional(',
  );

  assert.match(kpis, /is_segundo_curso\s*=\s*true/i);
  assert.doesNotMatch(kpis, /is_segundo_curso\s*=\s*true\s+and\s+[^\n;]*tipo_codigo\s*<>/i);
  assert.match(kpis, /alunos_com_exatamente_2_cursos/i);
  assert.match(kpis, /alunos_com_exatamente_3_cursos/i);
  assert.match(kpis, /alunos_com_4_ou_mais_cursos/i);
  assert.match(kpis, /matriculas_trancadas/i);
  assert.match(kpis, /matriculas_ativas/i);
});

test('pessoa ativa e pagante e calculada por qualquer curso ativo pago', () => {
  const kpis = section(
    migration,
    'create or replace function public.get_kpis_alunos_admin_operacional_impl_v2',
    'create or replace function public.get_kpis_alunos_admin_operacional(',
  );

  assert.match(kpis, /bool_or\s*\([\s\S]*entra_base_ativa\s*=\s*true/i);
  assert.match(kpis, /bool_or\s*\([\s\S]*entra_ticket_medio\s*=\s*true[\s\S]*valor_parcela\s*>\s*0/i);
  assert.match(kpis, /tipo_codigo\s+not\s+in\s*\([^)]*BOLSISTA_INT[^)]*BOLSISTA_PARC[^)]*BANDA/is);
  assert.match(kpis, /eh_trancamento_atual\s*=\s*true/i);
});

test('detalhes de trancamento sao protegidos, por matricula e classificam a politica', () => {
  assert.match(migrationAcl, /create or replace function public\.pode_gerar_relatorio_admin_v1\s*\(\s*p_unidade_id uuid\s*\)/i);
  const locks = section(
    migrationLocks,
    'create or replace function public.get_trancamentos_admin_operacionais_v1',
  );

  assert.match(locks, /pode_gerar_relatorio_admin_v1/i);
  assert.match(locks, /eh_trancamento_atual\s*=\s*true/i);
  assert.match(locks, /emusys_matricula_id/i);
  assert.match(locks, /contratual/i);
  assert.match(locks, /extensao_gerencial/i);
  assert.match(locks, /fora_da_politica/i);
  assert.match(locks, /data_ausente/i);
  assert.match(migrationLocks, /revoke all on function public\.get_trancamentos_admin_operacionais_v1[\s\S]*from public, anon/i);
  assert.match(migrationLocks, /grant execute on function public\.get_trancamentos_admin_operacionais_v1[\s\S]*to authenticated, service_role/i);
});

test('preview do botao e cron usam o mesmo produtor administrativo autenticado', () => {
  const dryRun = section(
    edge,
    "if (payload.modo === 'dry_run') {",
    "if (payload.modo === 'dry_run_comercial') {",
  );
  assert.match(dryRun, /Authorization/i);
  assert.match(dryRun, /auth\.getUser\(\)/i);
  assert.match(dryRun, /pode_gerar_relatorio_admin_v1/i);
  assert.match(dryRun, /data_referencia/i);
  assert.match(dryRun, /gerarRelatorioDiario\s*\(/i);

  const diario = section(
    modal,
    'async function gerarRelatorioDiario(): Promise<string> {',
    'async function gerarRelatorioMensal(): Promise<string> {',
  );
  assert.match(
    diario,
    /supabase\.functions\.invoke\(['"]relatorio-admin-whatsapp['"],[\s\S]*modo:\s*['"]dry_run['"][\s\S]*data_referencia/i,
  );
  assert.match(diario, /return\s+data\.texto/);
  assert.doesNotMatch(diario, /\.rpc\s*\(/);
  assert.doesNotMatch(diario, /movimentacoes_admin|get_kpis_alunos_admin_operacional/);
});

test('webhook materializa identidade Emusys e tipo adicional sem ID fixo', () => {
  const nova = section(webhook, 'async function handleMatriculaNova', 'async function handleRenovacao');
  assert.match(nova, /emusys_student_id:\s*p\.alunoEmusysId\s*!=\s*null\s*\?\s*String\(p\.alunoEmusysId\)/i);
  assert.match(nova, /SEGUNDO_CURSO/i);
  assert.match(nova, /tipo_matricula_id/i);
  assert.doesNotMatch(nova, /tipo_matricula_id:\s*\d+/i);
});

test('migration e somente estrutural e nao reescreve alunos ou snapshots', () => {
  const migrations = `${migration}\n${migrationAcl}\n${migrationLocks}`;
  assert.doesNotMatch(migrations, /\b(update|delete)\s+public\.alunos\b/i);
  assert.doesNotMatch(migrations, /\binsert\s+into\s+public\.alunos\b/i);
  assert.doesNotMatch(migrations, /(insert|update|delete)\s+(table\s+)?public\.fechamento_mensal_snapshots/i);
});

test('KPI administrativo exige escopo inclusive no consolidado', () => {
  assert.match(
    migration,
    /create or replace function public\.get_kpis_alunos_admin_operacional_impl_v2/i,
  );
  assert.match(
    migrationAcl,
    /create or replace function public\.exigir_acesso_kpis_admin_v1/i,
  );
  assert.match(
    migrationAcl,
    /p_unidade_id is null[\s\S]*not public\.pode_gerar_relatorio_admin_v1\(u\.id\)/i,
  );
  assert.match(migrationAcl, /raise exception 'ACESSO_NEGADO_RELATORIO_ADMIN'/i);
  assert.match(
    migrationAcl,
    /return public\.get_kpis_alunos_admin_operacional_impl_v2/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.get_kpis_alunos_admin_operacional_impl_v2[\s\S]*from public, anon, authenticated, service_role/i,
  );
});
