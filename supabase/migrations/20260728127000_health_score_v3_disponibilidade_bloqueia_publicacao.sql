begin;

alter table public.health_score_professor_v3_carteira_politicas_unidade
  add column if not exists base_horas text not null
    default 'disponibilidade_total';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid =
      'public.health_score_professor_v3_carteira_politicas_unidade'::regclass
      and c.conname =
        'health_score_v3_carteira_politica_base_horas_check'
  ) then
    alter table public.health_score_professor_v3_carteira_politicas_unidade
      add constraint health_score_v3_carteira_politica_base_horas_check
      check (base_horas in (
        'disponibilidade_total',
        'carga_comprometida'
      ));
  end if;
end;
$$;

update public.health_score_professor_v3_carteira_politicas_unidade
set base_horas = 'disponibilidade_total'
where versao = 1
  and base_horas is distinct from 'disponibilidade_total';

comment on column
  public.health_score_professor_v3_carteira_politicas_unidade.base_horas is
  'V1 usa a disponibilidade total mantida pela recepcao/coordenacao no LA Report. Carga comprometida permanece evolucao futura.';

create or replace function
  public.fn_health_score_v3_bloquear_sem_disponibilidade()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.health_score_professor_v3_snapshot_metricas sm
    where sm.snapshot_id = new.id
      and sm.metrica = 'numero_alunos'
      and sm.estado_base = 'sem_base_disponibilidade'
  ) then
    new.score := null;
    new.classificacao := 'sem_base';
    new.publicavel := false;
    new.publicado := false;
    new.estado_publicacao := 'sem_base';
    new.score_exibivel := false;
    new.ranking_habilitado := false;
    new.motivo_bloqueio :=
      'disponibilidade canonica ausente; score bloqueado ate regularizacao do cadastro';
  end if;

  return new;
end;
$$;

revoke all on function
  public.fn_health_score_v3_bloquear_sem_disponibilidade()
  from public, anon, authenticated;

comment on function
  public.fn_health_score_v3_bloquear_sem_disponibilidade() is
  'Guardrail de publicacao: falta de disponibilidade canonica nunca redistribui peso para produzir Health Score.';

drop trigger if exists
  trg_health_score_v3_bloquear_sem_disponibilidade
  on public.health_score_professor_v3_snapshots;

create trigger trg_health_score_v3_bloquear_sem_disponibilidade
before update on public.health_score_professor_v3_snapshots
for each row
execute function
  public.fn_health_score_v3_bloquear_sem_disponibilidade();

comment on trigger
  trg_health_score_v3_bloquear_sem_disponibilidade
  on public.health_score_professor_v3_snapshots is
  'Impede publicacao de score quando numero_alunos esta sem_base_disponibilidade.';

commit;
