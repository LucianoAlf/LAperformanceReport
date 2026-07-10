import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql';
const disponibilidadeMigrationPath = 'supabase/migrations/20260710130000_disponibilidade_professor_espelho.sql';
const pagePath = 'src/components/App/Professores/ProfessoresPage.tsx';
const modalPath = 'src/components/App/Professores/ModalProfessor.tsx';
const syncPath = 'supabase/functions/sync-presenca-emusys/index.ts';
const gradePath = 'src/components/App/Professores/GradeDisponibilidadeProfessores.tsx';
const agendaPath = 'src/components/App/Professores/TabAgendaProfessores.tsx';

const page = readFileSync(pagePath, 'utf8');
const modal = readFileSync(modalPath, 'utf8');
const sync = readFileSync(syncPath, 'utf8');

test('edicao de professor preserva metadados dos vinculos Emusys', () => {
  const editStart = page.indexOf('// Atualizar professor existente');
  const editEnd = page.indexOf("toast.success('Professor atualizado!", editStart);
  const editFlow = page.slice(editStart, editEnd);

  assert.doesNotMatch(
    editFlow,
    /from\('professores_unidades'\)\.delete\(\)\.eq\('professor_id', professorId\)/,
  );
  assert.match(editFlow, /from\('professores_unidades'\)[\s\S]*\.update\(/);
  assert.match(editFlow, /unidadesRemovidas/);
  assert.match(modal, /espelho manual do Emusys/i);
});

test('migration cria camadas separadas e RPCs guardadas', () => {
  assert.ok(existsSync(migrationPath), `migration ausente: ${migrationPath}`);
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /add column if not exists status_presenca text/i);
  assert.match(migration, /create table if not exists public\.aula_alunos_emusys/i);
  assert.match(migration, /create table if not exists public\.aluno_presenca_administrativo/i);
  assert.match(migration, /create table if not exists public\.professor_ponto_confirmacoes/i);
  assert.match(migration, /create table if not exists public\.aluno_presenca_retificacoes/i);
  assert.match(migration, /create or replace function public\.fn_professor_do_usuario/i);
  assert.match(migration, /create or replace function public\.app_registrar_presencas_aula/i);
  assert.match(migration, /on conflict \(aluno_id, aula_emusys_id\) do nothing/i);
  assert.match(migration, /create or replace function public\.admin_corrigir_presenca/i);
  assert.match(migration, /create or replace view public\.vw_ponto_professor_diario/i);
  assert.match(migration, /unidades_ids uuid\[\]/i);
  assert.match(migration, /respondido_por_anterior/i);
  assert.match(migration, /ae\.cancelada = false/i);
  assert.match(migration, /revoke all on function public\.fn_professor_do_usuario\(\) from public, anon/i);
});

test('sync usa roster, camada administrativa, maturidade e first-write-wins', () => {
  assert.match(sync, /justificada\??:\s*boolean/);
  assert.match(sync, /aula_alunos_emusys/);
  assert.match(sync, /aluno_presenca_administrativo/);
  assert.match(sync, /MATUREZA_FALTA_HORAS\s*=\s*24/);
  assert.match(sync, /podeMaterializarFalta/);
  assert.match(sync, /ignoreDuplicates:\s*true/);
  assert.doesNotMatch(
    sync,
    /from\('aluno_presenca'\)[\s\S]{0,800}ignoreDuplicates:\s*false/,
  );
});

test('workflow de disponibilidade mantem o Emusys como fonte oficial', () => {
  assert.ok(
    existsSync(disponibilidadeMigrationPath),
    `migration ausente: ${disponibilidadeMigrationPath}`,
  );
  const migration = readFileSync(disponibilidadeMigrationPath, 'utf8');

  assert.match(migration, /create table if not exists public\.disponibilidade_professor_propostas/i);
  assert.match(migration, /'aprovada_aguardando_emusys'/);
  assert.match(migration, /create or replace function public\.app_propor_disponibilidade/i);
  assert.match(migration, /create or replace function public\.admin_decidir_proposta_disponibilidade/i);
  assert.match(migration, /create or replace function public\.admin_efetivar_proposta_disponibilidade/i);
  assert.match(migration, /encode\(convert_to\(v_dia\.key, 'UTF8'\), 'hex'\)/);
  assert.match(migration, /546572c3a761/);
  assert.match(migration, /53c3a16261646f/);

  const decidirInicio = migration.indexOf('admin_decidir_proposta_disponibilidade');
  const efetivarInicio = migration.indexOf('admin_efetivar_proposta_disponibilidade');
  const decidir = migration.slice(decidirInicio, efetivarInicio);
  assert.doesNotMatch(decidir, /update public\.professores_unidades/i);
  assert.match(migration.slice(efetivarInicio), /update public\.professores_unidades/i);
});

test('agenda da coordenacao cruza espelho, aulas e operacao de propostas', () => {
  assert.ok(existsSync(gradePath), `componente ausente: ${gradePath}`);
  const grade = readFileSync(gradePath, 'utf8');
  const agenda = readFileSync(agendaPath, 'utf8');

  assert.match(grade, /vw_disponibilidade_professores/);
  assert.match(grade, /aulas_emusys/);
  assert.match(grade, /admin_decidir_proposta_disponibilidade/);
  assert.match(grade, /admin_efetivar_proposta_disponibilidade/);
  assert.match(grade, /disponibilidade_vigente_proposta/);
  assert.match(grade, /function temConflito/);
  assert.match(grade, /Vigente x proposta/);
  assert.match(grade, /Tentar novamente/);
  assert.match(agenda, /GradeDisponibilidadeProfessores/);
  assert.match(agenda, /Grade e disponibilidade/);
});
