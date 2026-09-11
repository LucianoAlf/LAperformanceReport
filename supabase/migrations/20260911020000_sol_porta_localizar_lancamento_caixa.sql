-- Primeira porta agent-first do Caixa: localizar lançamento/recibo sem SQL largo.
--
-- A identidade é um crachá assinado pelo bridge e vinculado ao chat oficial.
-- Telefone cru é recusado nesta superfície: leitura de Caixa também precisa ter
-- o mesmo escopo forte que as futuras escritas.

create or replace function public.sol_porta_caixa_contexto_v1(
  p_cracha text,
  p_chat_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog', 'public', 'governanca'
as $function$
declare
  v_cr jsonb;
  v_quem record;
  v_publico text;
  v_grupo record;
  v_tel text;
begin
  if coalesce(p_cracha, '') not like 'SOL1.%' then
    return jsonb_build_object('ok', false, 'motivo', 'cracha_assinado_obrigatorio');
  end if;
  if coalesce(p_chat_id, '') not like '%@g.us' then
    return jsonb_build_object('ok', false, 'motivo', 'chat_oficial_obrigatorio');
  end if;

  v_cr := public.sol_cracha_verificar_v1(p_cracha, p_chat_id);
  if not coalesce((v_cr->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'cracha_invalido',
                              'detalhe', v_cr->>'motivo');
  end if;
  v_tel := v_cr->>'telefone';

  select g.unidade_id, g.nome_grupo, g.grupo_jid
    into v_grupo
    from public.caixa_financeiro_grupos_whatsapp g
   where g.grupo_jid = p_chat_id
     and coalesce(g.ativo, false)
   limit 1;
  if v_grupo.unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'grupo_financeiro_nao_oficial');
  end if;

  select * into v_quem from governanca.quem_eh(v_tel);
  if v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido');
  end if;
  v_publico := case
    when lower(coalesce(v_quem.nivel, '')) = 'diretoria' then 'estrategico'
    when lower(coalesce(v_quem.departamento, '')) = 'administrativo'
     and lower(coalesce(v_quem.nivel, '')) = 'lider' then 'tatico'
    when lower(coalesce(v_quem.departamento, '')) = 'administrativo' then 'operacional'
    else null end;
  if v_publico is null then
    return jsonb_build_object('ok', false, 'motivo', 'fora_do_publico');
  end if;

  if v_publico <> 'estrategico'
     and v_quem.unidade_id is distinct from v_grupo.unidade_id then
    return jsonb_build_object('ok', false, 'motivo', 'grupo_fora_do_escopo',
                              'quem', v_quem.nome);
  end if;

  begin
    insert into public.automacao_log(evento, acao, status, aluno_nome, detalhes)
    values ('sol_portas', 'sol_porta_caixa_contexto_v1', 'ok', 'portas da Sol',
            jsonb_build_object('via', 'cracha_chat_bound',
                               'ator_hash', md5(v_tel),
                               'ator_tail', right(v_tel, 4),
                               'unidade', v_grupo.nome_grupo));
  exception when others then
    raise warning 'sol_porta_caixa_contexto_v1: auditoria falhou (%): %', sqlstate, sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'quem', v_quem.nome,
    'publico', v_publico,
    'nivel', v_quem.nivel,
    'unidade_id', v_grupo.unidade_id,
    'unidade_nome', v_grupo.nome_grupo,
    'grupo_jid', v_grupo.grupo_jid,
    -- Campo interno para a porta montar o payload auditado. A porta chamadora
    -- remove este valor da resposta antes de devolvê-la ao modelo.
    '_ator_numero', v_tel
  );
end;
$function$;

create or replace function public.sol_porta_caixa_do_dia_assinado_v1(
  p_cracha text,
  p_chat_id text,
  p_data date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_ctx jsonb;
  v_dados jsonb;
begin
  v_ctx := public.sol_porta_caixa_contexto_v1(p_cracha, p_chat_id);
  if not coalesce((v_ctx->>'ok')::boolean, false) then
    return v_ctx;
  end if;
  v_dados := public.sol_caixa_resumo_do_dia(
    (v_ctx->>'unidade_id')::uuid,
    coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date)
  );
  return jsonb_build_object(
    'ok', true,
    'escopo', v_ctx - '_ator_numero' - 'grupo_jid',
    'caixa', v_dados
  );
end;
$function$;

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
         order by a.created_at desc
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

revoke all on function public.sol_porta_caixa_contexto_v1(text, text)
  from public, anon, authenticated;
revoke all on function public.sol_porta_caixa_do_dia_assinado_v1(text, text, date)
  from public, anon, authenticated;
revoke all on function public.sol_porta_caixa_localizar_lancamento_v1(
  text, text, date, date, numeric, text, text, text
) from public, anon, authenticated;

grant execute on function public.sol_porta_caixa_contexto_v1(text, text)
  to service_role, sol_acesso_restrito;
grant execute on function public.sol_porta_caixa_do_dia_assinado_v1(text, text, date)
  to service_role, sol_acesso_restrito;
grant execute on function public.sol_porta_caixa_localizar_lancamento_v1(
  text, text, date, date, numeric, text, text, text
) to service_role, sol_acesso_restrito;

comment on function public.sol_porta_caixa_localizar_lancamento_v1(
  text, text, date, date, numeric, text, text, text
) is 'Localiza lançamento e trilha de recibo no Caixa pelo contexto chat-bound; não aceita telefone cru nem unidade escolhida pelo modelo.';

do $prova$
begin
  if has_function_privilege('anon',
       'public.sol_porta_caixa_localizar_lancamento_v1(text,text,date,date,numeric,text,text,text)',
       'execute')
     or has_function_privilege('authenticated',
       'public.sol_porta_caixa_localizar_lancamento_v1(text,text,date,date,numeric,text,text,text)',
       'execute') then
    raise exception 'porta de Caixa ficou exposta a cliente';
  end if;
  if not has_function_privilege('service_role',
       'public.sol_porta_caixa_localizar_lancamento_v1(text,text,date,date,numeric,text,text,text)',
       'execute') then
    raise exception 'service_role perdeu a porta de Caixa';
  end if;
  if coalesce((public.sol_porta_caixa_contexto_v1('5521999999999', 'teste@g.us')->>'ok')::boolean, false) then
    raise exception 'telefone cru atravessou a porta assinada';
  end if;
end;
$prova$;
