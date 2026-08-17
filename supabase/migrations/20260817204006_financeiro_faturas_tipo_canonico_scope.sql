-- O primeiro indice eliminou o Seq Scan, mas ainda permitia que cada fatura
-- encontrasse dezenas de snapshots antigos da mesma identidade. O item ja
-- carrega unidade e competencia; usa-los no casamento preserva a regra de
-- escolher o snapshot mais recente do mesmo recorte e reduz o fan-out.
create index if not exists sync_run_items_canonical_fatura_scope_idx
  on public.sync_run_items (
    canonical_fatura_id,
    unidade_id,
    competencia,
    created_at desc,
    id desc
  )
  where canonical_fatura_id is not null;

create index if not exists sync_run_items_unidade_fatura_scope_idx
  on public.sync_run_items (
    unidade_id,
    emusys_fatura_id,
    competencia,
    created_at desc,
    id desc
  )
  where emusys_fatura_id is not null;

drop index if exists public.sync_run_items_canonical_fatura_idx;
drop index if exists public.sync_run_items_unidade_fatura_idx;

create or replace function public.financeiro_enriquecer_tipos_fatura_v1(p_items jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with itens as (
    select
      value as item,
      ord,
      nullif(btrim(value->>'canonical_fatura_id'), '')::uuid as canonical_id,
      nullif(btrim(value->>'unidade_id'), '')::uuid as unidade_id,
      nullif(btrim(value->>'emusys_fatura_id'), '')::bigint as emusys_fatura_id,
      nullif(btrim(value->>'competencia'), '')::date as competencia
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as rows(value, ord)
  ),
  correspondencias as (
    select itens.ord, i.payload, i.created_at, i.id
    from itens
    join public.sync_run_items i
      on i.canonical_fatura_id = itens.canonical_id
     and i.unidade_id = itens.unidade_id
     and i.competencia = itens.competencia
    where itens.canonical_id is not null

    union all

    select itens.ord, i.payload, i.created_at, i.id
    from itens
    join public.sync_run_items i
      on i.unidade_id = itens.unidade_id
     and i.emusys_fatura_id = itens.emusys_fatura_id
     and i.competencia = itens.competencia
    where itens.canonical_id is null
      and itens.unidade_id is not null
      and itens.emusys_fatura_id is not null
  ),
  melhor_correspondencia as (
    select ord, payload
    from (
      select
        correspondencias.*,
        row_number() over (partition by ord order by created_at desc, id desc) as rn
      from correspondencias
    ) ranked
    where rn = 1
  ),
  origem as (
    select
      itens.*,
      melhor_correspondencia.payload
    from itens
    left join melhor_correspondencia on melhor_correspondencia.ord = itens.ord
  ),
  campos as (
    select
      origem.*,
      coalesce(origem.payload->>'numero_parcela', origem.item->>'numero_parcela') as numero_parcela_raw,
      coalesce(origem.payload->>'total_parcelas_contrato', origem.item->>'total_parcelas_contrato') as total_parcelas_raw,
      coalesce(origem.payload->>'descricao', origem.item->>'descricao') as descricao_origem
    from origem
  ),
  normalizados as (
    select
      campos.*,
      case when numero_parcela_raw ~ '^[0-9]+$' then numero_parcela_raw::integer else null end as numero_parcela,
      case when total_parcelas_raw ~ '^[0-9]+$' then total_parcelas_raw::integer else null end as total_parcelas_contrato
    from campos
  )
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'tipo_fatura', public.financeiro_classificar_tipo_fatura_v1(numero_parcela, descricao_origem),
      'numero_parcela', numero_parcela,
      'total_parcelas_contrato', total_parcelas_contrato
    ) order by ord
  ), '[]'::jsonb)
  from normalizados;
$function$;

revoke all on function public.financeiro_enriquecer_tipos_fatura_v1(jsonb) from public, anon, authenticated;
