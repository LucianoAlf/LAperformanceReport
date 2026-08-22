-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 7 · RLS
alter table public.fabio_registros_aula enable row level security;
drop policy if exists fabio_reg_prof_select on public.fabio_registros_aula;
create policy fabio_reg_prof_select on public.fabio_registros_aula
  for select to authenticated using (professor_id = public.fn_professor_do_usuario());
drop policy if exists fabio_reg_prof_update on public.fabio_registros_aula;
create policy fabio_reg_prof_update on public.fabio_registros_aula
  for update to authenticated
  using  (professor_id = public.fn_professor_do_usuario()
          and status in ('rascunho','aguardando_confirmacao'))
  with check (professor_id = public.fn_professor_do_usuario());

alter table public.fabio_fila_audios enable row level security;
drop policy if exists fabio_audio_prof_select on public.fabio_fila_audios;
create policy fabio_audio_prof_select on public.fabio_fila_audios
  for select to authenticated using (professor_id = public.fn_professor_do_usuario());
drop policy if exists fabio_audio_prof_insert on public.fabio_fila_audios;
create policy fabio_audio_prof_insert on public.fabio_fila_audios
  for insert to authenticated
  with check (professor_id = public.fn_professor_do_usuario());

alter table public.risco_evasao enable row level security;
drop policy if exists risco_coordenacao_select on public.risco_evasao;
create policy risco_coordenacao_select on public.risco_evasao
  for select to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.auth_user_id = auth.uid()
                   and u.perfil in ('admin','unidade')));

-- 8 · EXTENSÕES LEVES — Fila de Casos
alter table public.farmer_tarefas add column if not exists sla_em date;
alter table public.farmer_tarefas add column if not exists desfecho text;
alter table public.farmer_tarefas add column if not exists origem_alerta text;
alter table public.farmer_tarefas drop constraint if exists chk_farmer_desfecho;
alter table public.farmer_tarefas add constraint chk_farmer_desfecho
  check (desfecho is null or desfecho in ('retido','evadiu','renovou','sem_resposta','em_andamento'));
