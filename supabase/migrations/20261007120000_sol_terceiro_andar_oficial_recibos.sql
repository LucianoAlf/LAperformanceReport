-- Terceiro Andar da Sol oficializado (decisão do Alf, 07/10/2026).
--
-- A "Atenção do dia" roda desde 13/09 nos grupos RELATÓRIOS DIÁRIOS de CG,
-- Recreio e Barra. O Alf decidiu manter LIGADO. Esta migration NÃO mexe em
-- switch, destinatário, sinal, Caixa ou fila; só:
--   1. faz radar_entregas da Sol acompanhar a fila real (trigger);
--   2. reconcilia os recibos já enviados (hoje 287 presos em 'pendente');
--   3. expõe no snapshot da governança quantos recibos estão presos,
--      para a sonda checar o contrato novo (ligado + recibos em dia).
--
-- Substitui a contenção 20260918014500 (desligar), que nunca foi aplicada.
-- Dedupe da pauta usa status <> 'erro': trocar pendente→enviado não muda envio.

create or replace function public.sol_sincronizar_radar_entrega_da_fila_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.tipo_relatorio is distinct from 'radar_pauta' then
    return new;
  end if;

  if new.status = 'enviada' then
    update public.radar_entregas
       set status = 'enviado',
           enviado_em = coalesce(new.enviada_em, clock_timestamp()),
           erro = null
     where lower(agente) = 'sol'
       and mensagem = 'fila:' || new.id::text
       and status in ('pendente', 'falhou');
  elsif new.status = 'erro' then
    update public.radar_entregas
       set status = 'falhou',
           erro = coalesce(nullif(new.erro, ''), 'fila_radar_pauta_erro'),
           enviado_em = null
     where lower(agente) = 'sol'
       and mensagem = 'fila:' || new.id::text
       and status in ('pendente', 'falhou');
  end if;

  return new;
end
$function$;

revoke all on function public.sol_sincronizar_radar_entrega_da_fila_v1()
  from public, anon, authenticated;

drop trigger if exists tr_sol_sincronizar_radar_entrega_da_fila_v1
  on public.fila_relatorios_sol_hermes;
create trigger tr_sol_sincronizar_radar_entrega_da_fila_v1
after update of status, enviada_em, erro on public.fila_relatorios_sol_hermes
for each row execute function public.sol_sincronizar_radar_entrega_da_fila_v1();

update public.radar_entregas e
   set status = case f.status when 'enviada' then 'enviado' else 'falhou' end,
       enviado_em = case when f.status = 'enviada' then f.enviada_em else null end,
       erro = case when f.status = 'erro'
                   then coalesce(nullif(f.erro, ''), 'fila_radar_pauta_erro')
                   else null end
  from public.fila_relatorios_sol_hermes f
 where lower(e.agente) = 'sol'
   and e.mensagem = 'fila:' || f.id::text
   and f.tipo_relatorio = 'radar_pauta'
   and f.status in ('enviada', 'erro')
   and e.status is distinct from case f.status when 'enviada' then 'enviado' else 'falhou' end;

create or replace function public.sol_governanca_snapshot_operacional_v1()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
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
      -- recibo preso: entrega da Sol ainda 'pendente' depois de 1 dia
      'stale_pending_deliveries', (
        select count(*) from public.radar_entregas
        where lower(agente) = 'sol'
          and status = 'pendente'
          and criado_em < now() - interval '1 day'
      ),
      'failed_deliveries_previous_day', (
        select count(*) from public.radar_entregas
        where lower(agente) = 'sol'
          and status = 'falhou'
          and (criado_em at time zone 'America/Sao_Paulo') >=
              date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '1 day'
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

revoke all on function public.sol_governanca_snapshot_operacional_v1() from public, anon, authenticated, service_role;
grant execute on function public.sol_governanca_snapshot_operacional_v1() to sol_acesso_restrito;

do $proof$
declare
  v_mismatch integer;
  v_stale integer;
begin
  select count(*) into v_mismatch
    from public.radar_entregas e
    join public.fila_relatorios_sol_hermes f on e.mensagem = 'fila:' || f.id::text
   where lower(e.agente) = 'sol'
     and f.tipo_relatorio = 'radar_pauta'
     and ((f.status = 'enviada' and e.status <> 'enviado')
       or (f.status = 'erro' and e.status <> 'falhou'));
  select (public.sol_governanca_snapshot_operacional_v1()->'third_floor'->>'stale_pending_deliveries')::int
    into v_stale;
  if v_mismatch <> 0 then
    raise exception 'TERCEIRO_ANDAR_RECIBOS_DIVERGENTES mismatch=%', v_mismatch;
  end if;
  raise notice 'terceiro_andar_oficial ok mismatch=0 stale_pending=%', v_stale;
end
$proof$;
