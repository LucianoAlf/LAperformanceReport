-- Classifica o tipo do lancamento sem alterar status ou valores financeiros.
-- numero_parcela preenchido e a unica evidencia de parcela contratual regular.

create or replace function public.financeiro_classificar_tipo_fatura_v1(
  p_numero_parcela integer,
  p_descricao text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when p_numero_parcela is not null then 'parcela'
    when lower(coalesce(p_descricao, '')) like '%passaporte%'
      or lower(coalesce(p_descricao, '')) like '%taxa de matr%' then 'passaporte_taxa_matricula'
    when lower(coalesce(p_descricao, '')) like '%venda no controle de estoque%'
      or lower(coalesce(p_descricao, '')) like '%instrumento%'
      or lower(coalesce(p_descricao, '')) like '%acessor%'
      or lower(coalesce(p_descricao, '')) like '%livro%'
      or lower(coalesce(p_descricao, '')) like '%apostila%'
      or lower(coalesce(p_descricao, '')) like '%caderno%'
      or lower(coalesce(p_descricao, '')) like '%palheta%' then 'lojinha_produto'
    when lower(coalesce(p_descricao, '')) like '%ingresso%'
      or lower(coalesce(p_descricao, '')) like '%session%'
      or lower(coalesce(p_descricao, '')) like '%evento%' then 'venda_ingressos'
    else 'avulsa_outro'
  end;
$function$;

comment on function public.financeiro_classificar_tipo_fatura_v1(integer, text) is
  'Classificacao canonica de faturas: parcela, passaporte/taxa, produto, ingressos ou avulsa.';

create or replace function public.financeiro_enriquecer_tipo_fatura_v1(p_item jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_canonical_id uuid := nullif(p_item->>'canonical_fatura_id', '')::uuid;
  v_unidade_id uuid := nullif(p_item->>'unidade_id', '')::uuid;
  v_fatura_id bigint := nullif(p_item->>'emusys_fatura_id', '')::bigint;
  v_payload jsonb;
  v_numero_parcela integer;
  v_total_parcelas integer;
  v_descricao text;
begin
  select i.payload
    into v_payload
  from public.sync_run_items i
  where (v_canonical_id is not null and i.canonical_fatura_id = v_canonical_id)
     or (v_unidade_id is not null and v_fatura_id is not null
       and i.unidade_id = v_unidade_id and i.emusys_fatura_id = v_fatura_id)
  order by i.created_at desc, i.id desc
  limit 1;

  v_numero_parcela := case
    when coalesce(v_payload->>'numero_parcela', p_item->>'numero_parcela') ~ '^[0-9]+$'
      then (coalesce(v_payload->>'numero_parcela', p_item->>'numero_parcela'))::integer
    else null
  end;
  v_total_parcelas := case
    when coalesce(v_payload->>'total_parcelas_contrato', p_item->>'total_parcelas_contrato') ~ '^[0-9]+$'
      then (coalesce(v_payload->>'total_parcelas_contrato', p_item->>'total_parcelas_contrato'))::integer
    else null
  end;
  v_descricao := coalesce(v_payload->>'descricao', p_item->>'descricao');

  return p_item || jsonb_build_object(
    'tipo_fatura', public.financeiro_classificar_tipo_fatura_v1(v_numero_parcela, v_descricao),
    'numero_parcela', v_numero_parcela,
    'total_parcelas_contrato', v_total_parcelas
  );
end;
$function$;

revoke all on function public.financeiro_classificar_tipo_fatura_v1(integer, text) from public, anon, authenticated;
revoke all on function public.financeiro_enriquecer_tipo_fatura_v1(jsonb) from public, anon, authenticated;

-- Encapsula o contrato anterior e adiciona os metadados semanticos nos dois
-- caminhos consumidos pela pagina: itens normais e reconciliacao.
alter function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) rename to get_faturas_alunos_financeiro_v1_contrato_tipo_20260817;

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
  v_items jsonb;
  v_reconciliation_items jsonb;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(
    p_unidade_id,
    p_ano,
    p_mes,
    p_modo_periodo,
    p_status,
    p_as_of_date
  );

  select coalesce(jsonb_agg(public.financeiro_enriquecer_tipo_fatura_v1(value) order by ord), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) with ordinality as rows(value, ord);
  v_payload := jsonb_set(v_payload, '{items}', v_items, true);

  select coalesce(jsonb_agg(public.financeiro_enriquecer_tipo_fatura_v1(value) order by ord), '[]'::jsonb)
    into v_reconciliation_items
  from jsonb_array_elements(coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)) with ordinality as rows(value, ord);
  v_payload := jsonb_set(v_payload, '{reconciliation,items}', v_reconciliation_items, true);

  return v_payload;
end;
$function$;

revoke all on function public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(
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
  'Leitura canonica de faturas com tipo semantico derivado do payload do Emusys.';
