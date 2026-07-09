-- get_saude_syncs_emusys ganha 4 sync_tipo novos, todos evidencia-real (nao fire-and-forget):
--
-- - alerta_diario / alerta_tarefa_atrasada / resumo_semanal: os crons alertas-diarios,
--   alertas-tarefas-atrasadas e resumo-semanal disparam a mesma edge
--   projeto-alertas-whatsapp, que grava por destinatario em notificacao_log
--   (status 'enviado'/'erro', sem retry - erro e imediato e definitivo).
-- - meta_ads: o cron enriquecer-meta-ads-diario grava em meta_ads_cache, que ja tem
--   erro/enriquecido_em por linha (upsert grava null no sucesso, mensagem no erro).
CREATE OR REPLACE FUNCTION public.get_saude_syncs_emusys()
 RETURNS TABLE(sync_tipo text, unidade_id uuid, unidade_codigo text, unidade_nome text, ultima_execucao timestamp with time zone, idade_horas numeric, tolerancia_horas numeric, status_real text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cfg as (
    select * from (values
      ('matriculas', 30::numeric),
      ('presenca',   50::numeric),
      ('professores',192::numeric),
      ('faturas',    30::numeric)
    ) as t(sync_tipo, tol)
  ),
  cod as (
    select id, nome,
      case id
        when '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid then 'cg'
        when '95553e96-971b-4590-a6eb-0201d013c14d'::uuid then 'recreio'
        when '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid then 'barra'
      end as codigo
    from public.unidades
  ),
  matriculas as (
    select 'matriculas'::text as sync_tipo, j.unidade_id, max(j.ultima_sincronizacao_emusys) as ultima, null::text as forcar_status
    from public.aluno_jornada_matricula_disciplina j
    where j.fonte_ultima_atualizacao = 'sync-matriculas-emusys'
    group by j.unidade_id
  ),
  presenca as (
    select 'presenca'::text as sync_tipo, l.unidade_id, max(l.executado_em) as ultima, null::text as forcar_status
    from public.emusys_sync_log l
    group by l.unidade_id
  ),
  professores as (
    select 'professores'::text as sync_tipo, null::uuid as unidade_id, max(created_at) as ultima, null::text as forcar_status
    from public.professores_sync_log
  ),
  faturas as (
    select 'faturas'::text as sync_tipo, null::uuid as unidade_id, max(synced_at) as ultima, null::text as forcar_status
    from public.emusys_faturas
  ),
  -- Fila de relatorios diarios (WhatsApp): status REAL vem da evidencia de envio em
  -- fila_relatorios_whatsapp.status, nao do disparo fire-and-forget do pg_cron.
  relatorio_stats as (
    select
      count(*) filter (where status = 'falhou' and created_at >= now() - interval '3 days') as falhas,
      count(*) filter (
        where status in ('pendente','erro')
        and created_at >= now() - interval '3 days'
        and (tentativas >= 8 or agendada_para < now() - interval '3 hours')
      ) as presos,
      max(enviada_em) filter (where status = 'enviada') as ultima
    from public.fila_relatorios_whatsapp
  ),
  relatorio_diario as (
    select
      'relatorio_diario'::text as sync_tipo,
      null::uuid as unidade_id,
      ultima,
      case
        when falhas > 0 or presos > 0 then 'falhou'
        when ultima is not null then 'ok'
        else null
      end as forcar_status
    from relatorio_stats
  ),
  alerta_diario_stats as (
    select
      count(*) filter (where status = 'erro' and tipo in ('tarefa_atrasada','tarefa_vencendo','projeto_parado') and enviado_at >= now() - interval '2 days') as falhas,
      max(enviado_at) filter (where status = 'enviado' and tipo in ('tarefa_atrasada','tarefa_vencendo','projeto_parado')) as ultima
    from public.notificacao_log
  ),
  alerta_diario as (
    select 'alerta_diario'::text as sync_tipo, null::uuid as unidade_id, ultima,
      case when falhas > 0 then 'falhou' when ultima is not null then 'ok' else null end as forcar_status
    from alerta_diario_stats
  ),
  alerta_tarefa_atrasada_stats as (
    select
      count(*) filter (where status = 'erro' and tipo = 'tarefa_atrasada' and enviado_at >= now() - interval '2 days') as falhas,
      max(enviado_at) filter (where status = 'enviado' and tipo = 'tarefa_atrasada') as ultima
    from public.notificacao_log
  ),
  alerta_tarefa_atrasada as (
    select 'alerta_tarefa_atrasada'::text as sync_tipo, null::uuid as unidade_id, ultima,
      case when falhas > 0 then 'falhou' when ultima is not null then 'ok' else null end as forcar_status
    from alerta_tarefa_atrasada_stats
  ),
  resumo_semanal_stats as (
    select
      count(*) filter (where status = 'erro' and tipo = 'resumo_semanal' and enviado_at >= now() - interval '9 days') as falhas,
      max(enviado_at) filter (where status = 'enviado' and tipo = 'resumo_semanal') as ultima
    from public.notificacao_log
  ),
  resumo_semanal as (
    select 'resumo_semanal'::text as sync_tipo, null::uuid as unidade_id, ultima,
      case when falhas > 0 then 'falhou' when ultima is not null then 'ok' else null end as forcar_status
    from resumo_semanal_stats
  ),
  meta_ads_stats as (
    select
      count(*) filter (where erro is not null and enriquecido_em >= now() - interval '2 days') as falhas,
      max(enriquecido_em) as ultima
    from public.meta_ads_cache
  ),
  meta_ads as (
    select 'meta_ads'::text as sync_tipo, null::uuid as unidade_id, ultima,
      case when falhas > 0 then 'falhou' when ultima is not null then 'ok' else null end as forcar_status
    from meta_ads_stats
  ),
  base as (
    select sync_tipo, unidade_id, ultima, forcar_status from matriculas
    union all select sync_tipo, unidade_id, ultima, forcar_status from presenca
    union all select sync_tipo, unidade_id, ultima, forcar_status from professores
    union all select sync_tipo, unidade_id, ultima, forcar_status from faturas
    union all select sync_tipo, unidade_id, ultima, forcar_status from relatorio_diario
    union all select sync_tipo, unidade_id, ultima, forcar_status from alerta_diario
    union all select sync_tipo, unidade_id, ultima, forcar_status from alerta_tarefa_atrasada
    union all select sync_tipo, unidade_id, ultima, forcar_status from resumo_semanal
    union all select sync_tipo, unidade_id, ultima, forcar_status from meta_ads
  )
  select
    b.sync_tipo,
    b.unidade_id,
    c.codigo as unidade_codigo,
    coalesce(c.nome, 'Global') as unidade_nome,
    b.ultima as ultima_execucao,
    case when b.ultima is null then null
         else round(extract(epoch from (now() - b.ultima))/3600.0, 1) end as idade_horas,
    cfg.tol as tolerancia_horas,
    coalesce(
      b.forcar_status,
      case
        when b.sync_tipo = 'faturas' then 'sem_cron'
        when b.ultima is null then 'nunca'
        when extract(epoch from (now() - b.ultima))/3600.0 <= cfg.tol then 'ok'
        else 'atrasado'
      end
    ) as status_real
  from base b
  left join cfg on cfg.sync_tipo = b.sync_tipo
  left join cod c on c.id = b.unidade_id;
$function$;
