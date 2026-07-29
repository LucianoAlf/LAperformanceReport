-- Preserva o ciclo de vida Emusys v1.3.1 no grao matricula-disciplina.
-- Nao executa backfill e nao reinterpreta linhas historicas nesta migration.

alter table public.aluno_jornada_matricula_disciplina
  add column if not exists status_emusys text,
  add column if not exists motivo_inativa text,
  add column if not exists trancamento_id bigint,
  add column if not exists trancamento_motivo text,
  add column if not exists trancamento_data_inicial date,
  add column if not exists trancamento_data_final date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'aluno_jornada_status_emusys_v131_chk'
      and conrelid = 'public.aluno_jornada_matricula_disciplina'::regclass
  ) then
    alter table public.aluno_jornada_matricula_disciplina
      add constraint aluno_jornada_status_emusys_v131_chk
      check (
        status_emusys is null
        or status_emusys in (
          'ativa',
          'trancada',
          'inativa',
          'finalizada',
          'desconhecido'
        )
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'aluno_jornada_motivo_inativa_v131_chk'
      and conrelid = 'public.aluno_jornada_matricula_disciplina'::regclass
  ) then
    alter table public.aluno_jornada_matricula_disciplina
      add constraint aluno_jornada_motivo_inativa_v131_chk
      check (
        motivo_inativa is null
        or motivo_inativa in ('interrompida', 'concluida')
      ) not valid;
  end if;
end;
$$;

create index if not exists idx_jornada_unidade_status_emusys_v131
  on public.aluno_jornada_matricula_disciplina (
    unidade_id,
    status_emusys,
    motivo_inativa
  );

comment on column public.aluno_jornada_matricula_disciplina.status_emusys is
  'Estado bruto normalizado do GET/webhook Emusys v1.3.1.';

comment on column public.aluno_jornada_matricula_disciplina.motivo_inativa is
  'Distingue interrupcao definitiva de contrato concluido no Emusys v1.3.1.';

comment on column public.aluno_jornada_matricula_disciplina.trancamento_id is
  'Identificador do trancamento temporario ativo informado pelo Emusys.';
