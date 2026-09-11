-- Corrige a porta de localização contra o schema real da auditoria.
-- `sol_caixa_lancamento_auditoria` usa `criado_em`, não `created_at`.

create or replace function public.sol_porta_caixa_localizar_lancamento_v1(
  p_cracha text,
  p_chat_id text,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_valor numeric default null,
  p_categoria text default null,
  p_forma text default null,
  p_texto text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_ctx jsonb;
  v_resultado jsonb;
  v_items jsonb;
begin
  v_ctx := public.sol_porta_caixa_contexto_v1(p_cracha, p_chat_id);
  if not coalesce((v_ctx->>'ok')::boolean, false) then
    return v_ctx;
  end if;

  v_resultado := public.sol_caixa_buscar_movimentos_v1(jsonb_strip_nulls(jsonb_build_object(
    'unidade_id', v_ctx->>'unidade_id',
    'ator_numero', v_ctx->>'_ator_numero',
    'ator_papel', v_ctx->>'nivel',
    'chat_id', p_chat_id,
    'grupo_jid', p_chat_id,
    'data_inicio', p_data_inicio,
    'data_fim', p_data_fim,
    'valor', p_valor,
    'categoria', nullif(lower(btrim(p_categoria)), ''),
    'forma', nullif(lower(btrim(p_forma)), ''),
    'texto', nullif(btrim(p_texto), '')
  )));

  if not coalesce((v_resultado->>'ok')::boolean, false) then
    return v_resultado || jsonb_build_object('escopo', v_ctx - '_ator_numero');
  end if;

  select coalesce(jsonb_agg(
    (i.item - 'criado_por') || jsonb_build_object(
      'recibo_persistido', exists (
        select 1
          from public.sol_caixa_lancamento_auditoria a
         where a.movimentacao_id = nullif(i.item->>'movimentacao_id', '')::uuid
           and a.resultado in ('lancado', 'lancado_lote', 'saida_lancada',
                               'movimento_corrigido', 'movimento_estornado')
      ),
      'resultado_auditado', (
        select a.resultado
          from public.sol_caixa_lancamento_auditoria a
         where a.movimentacao_id = nullif(i.item->>'movimentacao_id', '')::uuid
         order by a.criado_em desc
         limit 1
      )
    )
    order by i.ord
  ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_resultado->'items', '[]'::jsonb))
         with ordinality as i(item, ord);

  return jsonb_build_object(
    'ok', true,
    'escopo', v_ctx - '_ator_numero' - 'grupo_jid',
    'count', jsonb_array_length(v_items),
    'items', v_items,
    'orientacao', case when jsonb_array_length(v_items) > 0
      then 'Já existe lançamento compatível. Não lance novamente sem uma correção ou estorno explícito.'
      else 'Nenhum lançamento compatível foi localizado neste filtro.' end
  );
end;
$function$;

revoke all on function public.sol_porta_caixa_localizar_lancamento_v1(
  text, text, date, date, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.sol_porta_caixa_localizar_lancamento_v1(
  text, text, date, date, numeric, text, text, text
) to service_role, sol_acesso_restrito;

do $prova$
begin
  if position('order by a.criado_em desc' in lower(pg_get_functiondef(
       'public.sol_porta_caixa_localizar_lancamento_v1(text,text,date,date,numeric,text,text,text)'::regprocedure
     ))) = 0 then
    raise exception 'porta localizar ainda nao usa criado_em';
  end if;
  if has_function_privilege('anon',
       'public.sol_porta_caixa_localizar_lancamento_v1(text,text,date,date,numeric,text,text,text)',
       'execute')
     or has_function_privilege('authenticated',
       'public.sol_porta_caixa_localizar_lancamento_v1(text,text,date,date,numeric,text,text,text)',
       'execute') then
    raise exception 'porta localizar ficou exposta a cliente';
  end if;
end;
$prova$;
