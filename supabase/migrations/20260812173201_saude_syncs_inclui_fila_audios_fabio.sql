-- Acrescenta a fila de áudios do Fábio à saúde das automações.
--
-- Motivo (12/08/2026): 7 itens com erro NÃO transitório ficaram em retry infinito por 2 dias
-- (até 49 tentativas), gerando HTTP 500 a cada 5 min — e a tela mostrava `fabio-retry-fila`
-- como ✅ ok, porque o cron de fato rodava. O que falhava era a edge que ele aciona, e esse
-- resultado não era medido em lugar nenhum (o pg_cron só confirma que enfileirou o POST).
--
-- Pior: 4 áudios de professores foram transcritos e NUNCA viraram prontuário, presos em
-- 'transcrito'/'transcrevendo'. O `fn_fabio_retry_fila` só pega 'pendente' e 'erro', então
-- item travado em estado intermediário fica órfão para sempre, em silêncio.
--
-- Estende `get_saude_syncs_emusys` (MESMA assinatura) em vez de criar objeto novo: a tela
-- TabSaudeCrons já sabe renderizar `status_real`, então nada muda no front.
create or replace function public.get_saude_syncs_emusys()
 returns table(sync_tipo text, unidade_id uuid, unidade_codigo text, unidade_nome text,
               ultima_execucao timestamp with time zone, idade_horas numeric,
               tolerancia_horas numeric, status_real text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cfg as (
    select * from (values
      ('matriculas', 30::numeric),
      ('presenca',   50::numeric),
      ('professores',192::numeric),
      ('faturas',    30::numeric),
      ('relatorio_diario', 26::numeric),
      ('fabio_audios', 6::numeric)
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
  relatorio_rows as (
    select status, created_at, agendada_para, enviada_em, tentativas
    from public.fila_relatorios_whatsapp
    union all
    select
      case
        when status = 'sol_pendente' then 'pendente'
        when status = 'sol_enviando' then 'enviando'
        else status
      end as status,
      created_at, agendada_para, enviada_em, tentativas
    from public.fila_relatorios_sol_hermes
  ),
  relatorio_last as (
    select max(enviada_em) filter (where status = 'enviada') as ultima
    from relatorio_rows
  ),
  relatorio_stats as (
    select
      count(*) filter (
        where status = 'falhou'
          and created_at >= greatest(coalesce((select ultima from relatorio_last), now() - interval '3 days'), now() - interval '3 days')
      ) as falhas,
      count(*) filter (
        where status in ('pendente','erro','enviando')
          and created_at >= greatest(coalesce((select ultima from relatorio_last), now() - interval '3 days'), now() - interval '3 days')
          and (tentativas >= 8 or agendada_para < now() - interval '3 hours')
      ) as presos,
      (select ultima from relatorio_last) as ultima
    from relatorio_rows
  ),
  relatorio_diario as (
    select 'relatorio_diario'::text as sync_tipo, null::uuid as unidade_id, ultima,
      case when falhas > 0 or presos > 0 then 'falhou'
           when ultima is not null then 'ok'
           else null end as forcar_status
    from relatorio_stats
  ),
  -- Fila de áudios do Fábio (LA Teacher). Dois modos de falha, ambos invisíveis até 12/08:
  --   1. retry infinito: erro não transitório que o fn_fabio_retry_fila insiste em repetir;
  --   2. órfão: preso em 'transcrito'/'transcrevendo', que o retry NEM ALCANÇA.
  fabio_stats as (
    select
      count(*) filter (
        where status in ('pendente','erro') and erro_tipo = 'transitorio' and tentativas >= 10
      ) as em_retry_excessivo,
      count(*) filter (
        where status in ('transcrito','transcrevendo')
          and atualizado_em < now() - interval '2 hours'
      ) as presos_no_meio,
      max(atualizado_em) filter (where status = 'normalizado') as ultimo_sucesso
    from public.fabio_fila_audios
    where criado_em > now() - interval '7 days'
  ),
  fabio_audios as (
    select 'fabio_audios'::text as sync_tipo, null::uuid as unidade_id, ultimo_sucesso as ultima,
      case when em_retry_excessivo > 0 or presos_no_meio > 0 then 'falhou'
           when ultimo_sucesso is not null then 'ok'
           else null end as forcar_status
    from fabio_stats
  ),
  base as (
    select sync_tipo, unidade_id, ultima, forcar_status from matriculas
    union all select sync_tipo, unidade_id, ultima, forcar_status from presenca
    union all select sync_tipo, unidade_id, ultima, forcar_status from professores
    union all select sync_tipo, unidade_id, ultima, forcar_status from faturas
    union all select sync_tipo, unidade_id, ultima, forcar_status from relatorio_diario
    union all select sync_tipo, unidade_id, ultima, forcar_status from fabio_audios
  )
  select
    b.sync_tipo, b.unidade_id, c.codigo as unidade_codigo,
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
