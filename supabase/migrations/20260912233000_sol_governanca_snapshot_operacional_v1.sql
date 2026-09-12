-- Snapshot agregado e somente leitura para a Sonda V2 da Sol.
--
-- Não expõe aluno, telefone, mensagem, fatura ou qualquer payload de negócio.
-- A função existe no LA Report porque ele continua sendo a fonte operacional;
-- o resultado sanitizado é persistido no control plane do Supabase da Sol.

create or replace function public.sol_governanca_snapshot_operacional_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with switches as (
    select
      coalesce(bool_or(ativo) filter (where slug = 'radar_pauta_grupo'), false) as pauta,
      coalesce(bool_or(ativo) filter (where slug = 'radar_bloco_sinais_comercial'), false) as bloco
    from public.automacoes_config
  ), doors as (
    select count(distinct p.proname)::integer as present
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'sol_porta_inadimplencia_v1', 'sol_porta_faturas_do_mes_v1',
        'sol_porta_numeros_da_unidade_v1', 'sol_porta_situacao_alunos_v1',
        'sol_porta_presenca_pendente_v1', 'sol_porta_pendencias_cadastro_v1',
        'sol_porta_aviso_previo_v1', 'sol_porta_renovacoes_v1',
        'sol_porta_contratos_vencendo_v1', 'sol_porta_alunos_sem_fatura_v1',
        'sol_porta_pauta_do_dia_v1', 'sol_porta_registrar_desfecho_v1',
        'sol_porta_agenda_do_dia_v1'
      ])
  )
  select jsonb_build_object(
    'schema_version', 1,
    'source', 'la_report',
    'read_only', true,
    'foundation', jsonb_build_object(
      'active_rules', (select count(*) from public.radar_regras where ativo),
      'signals', (select count(*) from public.radar_sinais),
      'open_signals', (select count(*) from public.radar_sinais where status = 'aberto'),
      'latest_radar_run_at', (select max(concluida_em) from public.radar_rodadas)
    ),
    'first_floor', jsonb_build_object(
      'doors_present', (select present from doors),
      'doors_expected', 13
    ),
    'second_floor', jsonb_build_object(
      'active_patterns', (select count(*) from public.radar_padroes where ativo),
      'active_strategies', (select count(*) from public.radar_estrategias where ativo),
      'recorded_outcomes', (select count(*) from public.radar_sinais where desfecho is not null)
    ),
    'third_floor', jsonb_build_object(
      'radar_pauta_grupo', (select pauta from switches),
      'radar_bloco_sinais_comercial', (select bloco from switches),
      'active_recipients', (
        select count(*) from public.radar_destinatarios
        where ativo and lower(agente) = 'sol'
      ),
      'deliveries_previous_day', (
        select count(*) from public.radar_entregas
        where lower(agente) = 'sol'
          and (criado_em at time zone 'America/Sao_Paulo') >=
              date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '1 day'
          and (criado_em at time zone 'America/Sao_Paulo') <
              date_trunc('day', now() at time zone 'America/Sao_Paulo')
      ),
      'enabled', (
        select pauta or bloco from switches
      ) or exists (
        select 1 from public.radar_destinatarios
        where ativo and lower(agente) = 'sol'
      )
    )
  );
$function$;

revoke all on function public.sol_governanca_snapshot_operacional_v1()
  from public, anon, authenticated, service_role;

do $block$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'sol_acesso_restrito') then
    execute 'grant execute on function public.sol_governanca_snapshot_operacional_v1() to sol_acesso_restrito';
  end if;
end;
$block$;

comment on function public.sol_governanca_snapshot_operacional_v1() is
  'Snapshot agregado e sem PII das quatro camadas para a Sonda V2 da Sol.';
