-- Health Score Professor V3 - ciclos operacionais e publicacao progressiva.
-- Decisao Alf 19/07/2026: Jun-Ago, Set-Nov, Dez-Fev e Mar-Mai.
-- Snapshots anteriores permanecem como legado_calendario e nunca viram oficiais.

create table if not exists public.health_score_professor_v3_ciclos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  data_inicio date not null,
  data_fim date not null,
  label text not null,
  estado text not null default 'aberto'
    check (estado in ('aberto', 'em_fechamento', 'fechado', 'cancelado')),
  publicacao_oficial boolean not null default false,
  ranking_habilitado boolean not null default false,
  fechado_em timestamptz,
  fechado_por integer references public.usuarios(id),
  justificativa_fechamento text,
  criado_em timestamptz not null default now(),
  constraint health_score_professor_v3_ciclos_datas_chk
    check (data_fim >= data_inicio),
  constraint health_score_professor_v3_ciclos_publicacao_chk
    check (not ranking_habilitado or publicacao_oficial)
);

insert into public.health_score_professor_v3_ciclos
  (codigo, data_inicio, data_fim, label)
values
  ('2026-JUN-AGO', date '2026-06-01', date '2026-08-31', 'Jun-Ago/2026'),
  ('2026-SET-NOV', date '2026-09-01', date '2026-11-30', 'Set-Nov/2026'),
  ('2026-DEZ-2027-FEV', date '2026-12-01', date '2027-02-28', 'Dez/2026-Fev/2027'),
  ('2027-MAR-MAI', date '2027-03-01', date '2027-05-31', 'Mar-Mai/2027'),
  ('2027-JUN-AGO', date '2027-06-01', date '2027-08-31', 'Jun-Ago/2027'),
  ('2027-SET-NOV', date '2027-09-01', date '2027-11-30', 'Set-Nov/2027'),
  ('2027-DEZ-2028-FEV', date '2027-12-01', date '2028-02-29', 'Dez/2027-Fev/2028'),
  ('2028-MAR-MAI', date '2028-03-01', date '2028-05-31', 'Mar-Mai/2028')
on conflict (codigo) do update
set data_inicio = excluded.data_inicio,
    data_fim = excluded.data_fim,
    label = excluded.label;

create or replace function public.fn_health_score_v3_periodo(
  p_competencia date,
  p_periodicidade text
)
returns table (
  periodicidade text,
  periodo_inicio date,
  periodo_fim date,
  ciclo_codigo text,
  periodo_label text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_ano integer := extract(year from v_competencia)::integer;
  v_mes integer := extract(month from v_competencia)::integer;
begin
  if p_competencia is null then
    raise exception 'HEALTH_SCORE_V3_PERIODO_INVALIDO: competencia obrigatoria';
  end if;
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODO_INVALIDO: use mensal ou ciclo';
  end if;

  if p_periodicidade = 'mensal' then
    return query select
      'mensal'::text,
      v_competencia,
      (v_competencia + interval '1 month - 1 day')::date,
      to_char(v_competencia, 'YYYY-MM'),
      to_char(v_competencia, 'MM/YYYY');
    return;
  end if;

  if v_mes between 6 and 8 then
    return query select 'ciclo'::text, make_date(v_ano, 6, 1),
      make_date(v_ano, 8, 31), format('%s-JUN-AGO', v_ano),
      format('Jun-Ago/%s', v_ano);
  elsif v_mes between 9 and 11 then
    return query select 'ciclo'::text, make_date(v_ano, 9, 1),
      make_date(v_ano, 11, 30), format('%s-SET-NOV', v_ano),
      format('Set-Nov/%s', v_ano);
  elsif v_mes = 12 then
    return query select 'ciclo'::text, make_date(v_ano, 12, 1),
      (make_date(v_ano + 1, 3, 1) - 1),
      format('%s-DEZ-%s-FEV', v_ano, v_ano + 1),
      format('Dez/%s-Fev/%s', v_ano, v_ano + 1);
  elsif v_mes between 1 and 2 then
    return query select 'ciclo'::text, make_date(v_ano - 1, 12, 1),
      (make_date(v_ano, 3, 1) - 1),
      format('%s-DEZ-%s-FEV', v_ano - 1, v_ano),
      format('Dez/%s-Fev/%s', v_ano - 1, v_ano);
  else
    return query select 'ciclo'::text, make_date(v_ano, 3, 1),
      make_date(v_ano, 5, 31), format('%s-MAR-MAI', v_ano),
      format('Mar-Mai/%s', v_ano);
  end if;
end;
$$;

alter table public.health_score_professor_v3_snapshots
  add column if not exists periodicidade text not null default 'legado_calendario',
  add column if not exists periodo_inicio date,
  add column if not exists periodo_fim date,
  add column if not exists ciclo_codigo text,
  add column if not exists estado_publicacao text not null default 'sem_base',
  add column if not exists score_exibivel boolean not null default false,
  add column if not exists ranking_habilitado boolean not null default false;

-- O trigger de imutabilidade protege inclusive snapshots provisorios. A migracao
-- o suspende apenas para acrescentar metadados de periodo/publicacao ao legado;
-- score, metricas e revisoes existentes permanecem intocados.
alter table public.health_score_professor_v3_snapshots
  disable trigger trg_health_score_professor_v3_snapshot_imutavel;

update public.health_score_professor_v3_snapshots
set periodo_inicio = coalesce(periodo_inicio, trimestre_inicio),
    periodo_fim = coalesce(
      periodo_fim,
      (trimestre_inicio + interval '3 months - 1 day')::date
    ),
    ciclo_codigo = coalesce(
      ciclo_codigo,
      'LEGADO-' || to_char(trimestre_inicio, 'YYYY-"T"Q')
    ),
    estado_publicacao = case
      when publicado and publicavel then 'oficial'
      when score is not null then 'parcial'
      else 'sem_base'
    end,
    score_exibivel = score is not null,
    ranking_habilitado = publicado and publicavel
where periodo_inicio is null
   or periodo_fim is null
   or ciclo_codigo is null;

alter table public.health_score_professor_v3_snapshots
  enable trigger trg_health_score_professor_v3_snapshot_imutavel;

alter table public.health_score_professor_v3_snapshots
  alter column periodo_inicio set not null,
  alter column periodo_fim set not null;

alter table public.health_score_professor_v3_snapshots
  drop constraint if exists health_score_professor_v3_snapshot_competencia_chk,
  drop constraint if exists health_score_professor_v3_snapshot_publicacao_chk,
  add constraint health_score_professor_v3_snapshot_competencia_chk check (
    competencia = date_trunc('month', competencia)::date
    and periodo_inicio <= competencia
    and periodo_fim >= competencia
    and periodo_fim >= periodo_inicio
  ),
  add constraint health_score_professor_v3_snapshot_periodicidade_chk check (
    periodicidade in ('legado_calendario', 'mensal', 'ciclo')
  ),
  add constraint health_score_professor_v3_snapshot_estado_publicacao_chk check (
    estado_publicacao in ('parcial', 'oficial', 'sem_base')
  ),
  add constraint health_score_professor_v3_snapshot_publicacao_chk check (
    (not publicado or (
      estado = 'fechado'
      and publicavel
      and estado_publicacao = 'oficial'
    ))
    and (not ranking_habilitado or (
      estado_publicacao = 'oficial'
      and publicavel
      and publicado
    ))
  );

drop index if exists public.ux_health_score_professor_v3_snapshot_unidade_revisao;
drop index if exists public.ux_health_score_professor_v3_snapshot_consolidado_revisao;
drop index if exists public.ux_health_score_professor_v3_snapshot_unidade_fechado;
drop index if exists public.ux_health_score_professor_v3_snapshot_consolidado_fechado;

create unique index ux_health_score_professor_v3_snapshot_unidade_revisao
  on public.health_score_professor_v3_snapshots (
    professor_id, unidade_id, competencia, periodicidade, revisao
  ) where unidade_id is not null;
create unique index ux_health_score_professor_v3_snapshot_consolidado_revisao
  on public.health_score_professor_v3_snapshots (
    professor_id, competencia, periodicidade, revisao
  ) where unidade_id is null;
create unique index ux_health_score_professor_v3_snapshot_unidade_fechado
  on public.health_score_professor_v3_snapshots (
    professor_id, unidade_id, competencia, periodicidade
  ) where unidade_id is not null and estado = 'fechado';
create unique index ux_health_score_professor_v3_snapshot_consolidado_fechado
  on public.health_score_professor_v3_snapshots (
    professor_id, competencia, periodicidade
  ) where unidade_id is null and estado = 'fechado';
create index if not exists idx_health_score_professor_v3_snapshots_periodo
  on public.health_score_professor_v3_snapshots (
    periodicidade, periodo_inicio, periodo_fim, unidade_id, professor_id
  );

-- A V2 nasce como rascunho para receber metricas sem contornar o guard de
-- imutabilidade. A ativacao acontece somente depois de a configuracao estar
-- completa, na mesma transacao que arquiva a V1.
with nova_config as (
  insert into public.health_score_professor_v3_config_versoes (
    versao, status, vigencia_inicio, cobertura_minima,
    faixa_atencao_min, faixa_saudavel_min, exige_pilar_fidelizacao,
    justificativa, ativado_em
  ) values (
    2, 'rascunho', date '2026-06-01', 60, 50, 70, true,
    'Ciclos fixos e seis metas aprovados pelo Alf em 19/07/2026; publicacao parcial sem ranking ate o fechamento oficial.',
    now()
  )
  on conflict (versao) do nothing
  returning id
), config as (
  select id from nova_config
  union all
  select id from public.health_score_professor_v3_config_versoes where versao = 2
  limit 1
)
insert into public.health_score_professor_v3_config_metricas (
  config_id, metrica, peso, meta, amostra_minima, cobertura_minima, parametros
)
select config.id, valores.metrica, valores.peso, valores.meta,
       valores.amostra_minima, valores.cobertura_minima, valores.parametros
from config
cross join (values
  ('retencao', 25::numeric, 90::numeric, 10, null::numeric,
    '{"normalizacao":"meta_versionada","janela":"periodo_selecionado","regra_historica_ate":"2026-08-02"}'::jsonb),
  ('permanencia', 25::numeric, 12::numeric, 3, null::numeric,
    '{"normalizacao":"meta_versionada","corte_meses":4,"janela":"historico_acumulado"}'::jsonb),
  ('conversao', 15::numeric, 70::numeric, 3, null::numeric,
    '{"normalizacao":"meta_versionada","janela_credito_dias":30}'::jsonb),
  ('media_turma', 15::numeric, 1.44::numeric, 1, null::numeric,
    '{"normalizacao":"meta_versionada","agregacao_ciclo":"soma_ocupacoes_sobre_soma_turmas"}'::jsonb),
  ('numero_alunos', 10::numeric, 33::numeric, 1, null::numeric,
    '{"normalizacao":"meta_versionada","agregacao_ciclo":"media_fechamentos_disponiveis"}'::jsonb),
  ('presenca', 10::numeric, 80::numeric, 10, 95::numeric,
    '{"normalizacao":"meta_versionada","fonte":"vw_aluno_presenca_semantica_v1","campo_grande":"fora_do_score_em_auditoria"}'::jsonb)
) as valores(metrica, peso, meta, amostra_minima, cobertura_minima, parametros)
on conflict (config_id, metrica) do nothing;

-- A ativacao segue o mesmo contrato da UI: a revisao exata precisa ser
-- simulada e registrada antes de sair de rascunho.
select public.simular_health_score_professor_v3_config(
  (select id
   from public.health_score_professor_v3_config_versoes
   where versao = 2),
  date '2026-07-01'
);

-- A V1 serviu a homologacao inicial e nao possui snapshot fechado. Ela e
-- preservada, mas arquivada de forma controlada para que a V2 possa representar
-- a decisao funcional completa desde o primeiro ciclo Jun-Ago/2026.
alter table public.health_score_professor_v3_config_versoes
  disable trigger trg_health_score_professor_v3_config_versao_imutavel;
update public.health_score_professor_v3_config_versoes
set status = 'arquivada',
    vigencia_fim = date '2026-07-18',
    atualizado_em = now()
where versao = 1
  and status = 'ativa';
update public.health_score_professor_v3_config_versoes
set status = 'ativa',
    vigencia_fim = null,
    ativado_em = coalesce(ativado_em, now()),
    atualizado_em = now()
where versao = 2
  and status = 'rascunho';
alter table public.health_score_professor_v3_config_versoes
  enable trigger trg_health_score_professor_v3_config_versao_imutavel;

alter table public.health_score_professor_v3_ciclos enable row level security;
revoke all on table public.health_score_professor_v3_ciclos
  from public, anon, authenticated;
grant select, insert, update on table public.health_score_professor_v3_ciclos
  to service_role;

revoke all on function public.fn_health_score_v3_periodo(date, text)
  from public, anon;
grant execute on function public.fn_health_score_v3_periodo(date, text)
  to authenticated, service_role;

comment on table public.health_score_professor_v3_ciclos is
  'Calendario versionado do Health Score V3: Jun-Ago, Set-Nov, Dez-Fev e Mar-Mai. Ranking somente depois do fechamento oficial.';
comment on column public.health_score_professor_v3_snapshots.estado_publicacao is
  'parcial: score visivel sem ranking; oficial: ciclo fechado e rankeavel; sem_base: score indisponivel.';
