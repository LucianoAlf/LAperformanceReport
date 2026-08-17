-- O primeiro enriquecimento semantico consultava sync_run_items uma vez por
-- item. Esta versao faz a leitura em lote e conserva a mesma regra canonica.

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
      nullif(btrim(value->>'emusys_fatura_id'), '')::bigint as emusys_fatura_id
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as rows(value, ord)
  ),
  correspondencias as (
    select itens.ord, i.payload, i.created_at, i.id
    from itens
    join public.sync_run_items i
      on i.canonical_fatura_id = itens.canonical_id
    where itens.canonical_id is not null

    union all

    select itens.ord, i.payload, i.created_at, i.id
    from itens
    join public.sync_run_items i
      on i.unidade_id = itens.unidade_id
     and i.emusys_fatura_id = itens.emusys_fatura_id
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

-- Ignora o wrapper anterior, que fazia uma consulta por fatura, e publica a
-- mesma assinatura apontando para o contrato enriquecido em lote.
alter function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) rename to get_faturas_alunos_financeiro_v1_contrato_tipo_lento_20260817;

create function public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default extract(month from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(
    p_unidade_id,
    p_ano,
    p_mes,
    p_modo_periodo,
    p_status,
    p_as_of_date
  );
  v_payload := jsonb_set(
    v_payload,
    '{items}',
    public.financeiro_enriquecer_tipos_fatura_v1(coalesce(v_payload->'items', '[]'::jsonb)),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{reconciliation,items}',
    public.financeiro_enriquecer_tipos_fatura_v1(coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)),
    true
  );
  return v_payload;
end;
$function$;

revoke all on function public.get_faturas_alunos_financeiro_v1_contrato_tipo_lento_20260817(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) from public, anon, authenticated;

grant execute on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) to authenticated, service_role;

comment on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) is
  'Leitura canonica de faturas com classificacao semantica set-based.';
