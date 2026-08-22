-- Sol Caixa V3 — composto canônico + abertura/fechamento com snapshot.
--
-- Base: 20260822230000_sol_caixa_abrir_trava_fechamento_pendente.sql.
-- Esta migration NÃO substitui sol_caixa_abertura_pendente. A pendência antiga continua
-- a orientar o fechamento obrigatório de dia anterior; approval e consumo são V3.
--
-- Segurança: nenhum preview/snapshot recusado consome approval. O consumo acontece
-- somente depois de revalidar o snapshot, dentro da mesma transação protegida por lock.

create table if not exists public.sol_caixa_v3_caixa_operacoes_v1 (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  data_caixa date not null,
  operacao text not null check (operacao in ('abrir_caixa', 'fechar_caixa')),
  caixa_diario_id uuid references public.caixas_diarios(id) on delete restrict,
  preview_id uuid not null references public.sol_caixa_shadow_previews_v1(id) on delete restrict,
  approval_id uuid not null references public.sol_caixa_shadow_approvals_v1(id) on delete restrict,
  idempotency_key text not null,
  snapshot_hash text not null,
  resultado jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  unique (idempotency_key),
  unique (unidade_id, data_caixa, operacao)
);

alter table public.sol_caixa_v3_caixa_operacoes_v1 enable row level security;
revoke all on table public.sol_caixa_v3_caixa_operacoes_v1 from public, anon, authenticated, sol_acesso_restrito, sol_caixa_readonly;

-- Permite persistir preview de abrir/fechar pelo mesmo ledger V3, exigindo os campos
-- financeiros tabelados (categoria/forma/valor) sem abrir uma segunda tabela de preview.
do $patch$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'sol_caixa_shadow_registrar'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if strpos(v_def, $$'abrir_caixa'$$) = 0 then
    v_new := replace(
      v_def,
      $$array['entrada','saida','correcao_forma','correcao_movimento','estorno']$$,
      $$array['entrada','saida','correcao_forma','correcao_movimento','estorno','abrir_caixa','fechar_caixa']$$
    );
    if v_new = v_def then
      raise exception 'ancora do ledger de preview V3 nao encontrada';
    end if;
    execute v_new;
  end if;
end
$patch$;

create or replace function public.sol_caixa_resolver_composto_aluno_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_nome text := nullif(btrim(p_payload->>'aluno_nome'),'');
  v_competencia text := nullif(btrim(p_payload->>'competencia'),'');
  v_total numeric := nullif(p_payload->>'valor_total','')::numeric;
  v_as_of date := coalesce(nullif(p_payload->>'as_of','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_env jsonb;
  v_status text;
  v_aluno jsonb;
  v_aluno_count integer;
  v_aluno_id integer;
  v_aluno_nome text;
  v_responsavel jsonb;
  v_candidatos jsonb;
  v_match_count integer;
  v_match jsonb;
  v_itens jsonb;
begin
  if v_unidade is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  elsif v_nome is null or length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'aluno_obrigatorio');
  elsif v_total is null or v_total <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor_total_invalido');
  end if;

  -- Fonte canônica. Esta RPC não lê alunos/emusys_faturas por tabela e o bridge não
  -- recebe permissão para fazê-lo: resolve tudo pelo envelope publicado do LA Report.
  v_env := public.sol_faturas_alunos_v1(
    v_unidade,
    extract(year from v_as_of)::int,
    extract(month from v_as_of)::int,
    'janela_3',
    'todas',
    v_as_of
  );
  v_status := v_env->>'status';
  if v_status not in ('ok', 'partial') then
    return jsonb_build_object('ok', false, 'motivo', 'fonte_indisponivel', 'status_fonte', v_status);
  end if;

  -- Nome não é chave: aceita apenas um aluno com a melhor similaridade inequívoca.
  with nomes as (
    select distinct
      nullif(x->'aluno'->>'id','')::integer as aluno_id,
      nullif(x->'aluno'->>'nome','') as aluno_nome,
      word_similarity(unaccent(lower(v_nome)), unaccent(lower(coalesce(x->'aluno'->>'nome',''))))::numeric as sim
    from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) x
    where nullif(x->'aluno'->>'id','') is not null
      and nullif(x->'aluno'->>'nome','') is not null
  ), melhores as (
    select * from nomes where sim >= 0.72
  ), topo as (
    select * from melhores
    where sim = (select max(sim) from melhores)
  )
  select count(*), (jsonb_agg(jsonb_build_object('aluno_id',aluno_id,'aluno_nome',aluno_nome) order by aluno_id)->0)
    into v_aluno_count, v_aluno
  from topo;

  if coalesce(v_aluno_count, 0) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'aluno_nao_encontrado');
  elsif v_aluno_count <> 1 then
    return jsonb_build_object('ok', false, 'motivo', 'aluno_ambiguo');
  end if;

  v_aluno_id := (v_aluno->>'aluno_id')::integer;
  v_aluno_nome := v_aluno->>'aluno_nome';
  v_responsavel := public.sol_caixa_responsavel_aluno(v_unidade, v_aluno_nome);

  -- Limite deliberado: composição é para 2+ faturas; acima de 12 candidatas a busca
  -- exponencial vira risco operacional e deve ir para conferência humana, não heurística.
  with candidatos as (
    select x
    from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) x
    where nullif(x->'aluno'->>'id','')::integer = v_aluno_id
      and coalesce(x->>'status','') <> 'cancelada'
      and (v_competencia is null or to_char((x->>'competencia')::date, 'MM/YYYY') = v_competencia)
      and coalesce(
        case when x->>'status' = 'paga' then nullif(x->'valores'->>'valor_pago','')::numeric end,
        nullif(x->'valores'->>'valor_hoje','')::numeric,
        nullif(x->'valores'->>'valor_com_desconto','')::numeric
      ) > 0
    order by (x->>'data_vencimento')::date, x->>'canonical_fatura_id'
    limit 13
  )
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_candidatos from candidatos;

  if jsonb_array_length(v_candidatos) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'composicao_exige_duas_faturas');
  elsif jsonb_array_length(v_candidatos) > 12 then
    return jsonb_build_object('ok', false, 'motivo', 'composicao_complexa_revisao_manual');
  end if;

  with recursive cand as (
    select row_number() over (order by (x->>'data_vencimento')::date, x->>'canonical_fatura_id')::int as ord,
           x,
           coalesce(
             case when x->>'status' = 'paga' then nullif(x->'valores'->>'valor_pago','')::numeric end,
             nullif(x->'valores'->>'valor_hoje','')::numeric,
             nullif(x->'valores'->>'valor_com_desconto','')::numeric
           ) as valor
    from jsonb_array_elements(v_candidatos) x
  ), combinacoes as (
    select array[ord]::int[] as ordens, valor as soma
    from cand
    union all
    select c0.ordens || c.ord, c0.soma + c.valor
    from combinacoes c0
    join cand c on c.ord > c0.ordens[array_length(c0.ordens, 1)]
    where array_length(c0.ordens, 1) < 12
      and c0.soma + c.valor <= v_total + 0.01
  ), matches as (
    select ordens from combinacoes
    where array_length(ordens, 1) >= 2
      and abs(soma - v_total) < 0.01
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(ordens)), '[]'::jsonb)
    into v_match_count, v_match
  from matches;

  if v_match_count = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'composicao_sem_match_exato', 'valor_total', v_total);
  elsif v_match_count > 1 then
    return jsonb_build_object('ok', false, 'motivo', 'composicao_ambigua', 'matches', v_match_count);
  end if;

  with cand as (
    select row_number() over (order by (x->>'data_vencimento')::date, x->>'canonical_fatura_id')::int as ord, x
    from jsonb_array_elements(v_candidatos) x
  ), escolhidas as (
    select c.ord, c.x
    from cand c
    where c.ord = any(array(select jsonb_array_elements_text(v_match->0)::int))
    order by c.ord
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ordem', ord,
    'aluno_id', v_aluno_id,
    'aluno_nome', v_aluno_nome,
    'responsavel_financeiro', nullif(v_responsavel->>'responsavel_nome',''),
    'competencia', to_char((x->>'competencia')::date, 'MM/YYYY'),
    'categoria', case when coalesce(x->>'tipo_fatura','') in ('passaporte_taxa_matricula','matricula') then 'passaporte' else 'parcela' end,
    'valor', coalesce(
      case when x->>'status' = 'paga' then nullif(x->'valores'->>'valor_pago','')::numeric end,
      nullif(x->'valores'->>'valor_hoje','')::numeric,
      nullif(x->'valores'->>'valor_com_desconto','')::numeric
    ),
    'canonical_fatura_id', x->>'canonical_fatura_id',
    'descricao', x->>'descricao',
    'fatura', jsonb_build_object(
      'canonical_fatura_id', x->>'canonical_fatura_id',
      'descricao', x->>'descricao',
      'tipo_fatura', x->>'tipo_fatura',
      'competencia', x->>'competencia',
      'status', x->>'status',
      'data_pagamento', x->>'data_pagamento',
      'forma_pagamento', x->'forma_pagamento',
      'valor_pago', x->'valores'->>'valor_pago',
      'valor_hoje', x->'valores'->>'valor_hoje'
    )
  ) order by ord), '[]'::jsonb)
  into v_itens
  from escolhidas;

  return jsonb_build_object('ok', true, 'itens', v_itens, 'soma_itens', v_total, 'valor_total', v_total);
end;
$function$;

create or replace function public.sol_caixa_snapshot_abertura_fechamento_v3(
  p_unidade_id uuid,
  p_data_caixa date,
  p_operacao text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_op text := lower(coalesce(p_operacao,''));
  v_caixa public.caixas_diarios%rowtype;
  v_anterior public.caixas_diarios%rowtype;
  v_pendente public.caixas_diarios%rowtype;
  v_entradas numeric := 0;
  v_saidas numeric := 0;
  v_contagens jsonb := '{}'::jsonb;
  v_saldo numeric := 0;
begin
  if p_unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  elsif p_data_caixa is null then
    return jsonb_build_object('ok', false, 'motivo', 'data_caixa_invalida');
  elsif v_op not in ('abrir_caixa','fechar_caixa') then
    return jsonb_build_object('ok', false, 'motivo', 'operacao_invalida');
  end if;

  if v_op = 'abrir_caixa' then
    select * into v_caixa from public.caixas_diarios
    where unidade_id = p_unidade_id and data_caixa = p_data_caixa;
    if v_caixa.id is not null then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_caixa_ja_existe', 'caixa_diario_id', v_caixa.id);
    end if;

    select * into v_pendente from public.caixas_diarios
    where unidade_id = p_unidade_id and data_caixa < p_data_caixa and status = 'aberto'
    order by data_caixa desc limit 1;
    if v_pendente.id is not null then
      select coalesce(v_pendente.saldo_inicial_cofre,0)
           + coalesce(sum(m.valor) filter (where m.ambiente='cofre' and m.tipo='entrada'),0)
           - coalesce(sum(m.valor) filter (where m.ambiente='cofre' and m.tipo='saida'),0)
        into v_saldo
      from public.caixa_movimentacoes m where m.caixa_diario_id = v_pendente.id;
      return jsonb_build_object('ok', false, 'motivo', 'fechamento_pendente_dia_anterior',
        'pendencia', jsonb_build_object('caixa_diario_id',v_pendente.id,'data_caixa',v_pendente.data_caixa,'saldo_final_calculado',v_saldo));
    end if;

    select * into v_anterior from public.caixas_diarios
    where unidade_id = p_unidade_id and data_caixa < p_data_caixa and status = 'fechado'
    order by data_caixa desc limit 1;
    v_saldo := coalesce(v_anterior.saldo_final_conferido, v_anterior.saldo_final_calculado, 0);
    return jsonb_build_object('ok', true, 'snapshot', jsonb_build_object(
      'operacao','abrir_caixa','unidade_id',p_unidade_id,'data_caixa',p_data_caixa,
      'caixa_hoje',null,'caixa_anterior_aberto',null,
      'ultimo_fechado_id',v_anterior.id,'ultimo_fechado_data',v_anterior.data_caixa,
      'saldo_inicial_proposto',v_saldo
    ));
  end if;

  select * into v_caixa from public.caixas_diarios
  where unidade_id = p_unidade_id and data_caixa = p_data_caixa and status = 'aberto'
  order by aberto_em desc limit 1;
  if v_caixa.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'snapshot_caixa_nao_aberto');
  end if;

  -- Valores do cofre e contagem por ambiente são ambos parte do snapshot. A contagem
  -- fecha a brecha de uma venda Pix/cartão que não muda o saldo físico do cofre.
  select coalesce(sum(valor) filter (where ambiente='cofre' and tipo='entrada'),0),
         coalesce(sum(valor) filter (where ambiente='cofre' and tipo='saida'),0)
    into v_entradas, v_saidas
  from public.caixa_movimentacoes where caixa_diario_id = v_caixa.id;
  select coalesce(jsonb_object_agg(ambiente, quantidade), '{}'::jsonb) into v_contagens
  from (select ambiente, count(*)::int as quantidade from public.caixa_movimentacoes where caixa_diario_id=v_caixa.id group by ambiente) q;
  v_saldo := coalesce(v_caixa.saldo_inicial_cofre,0) + v_entradas - v_saidas;
  return jsonb_build_object('ok', true, 'snapshot', jsonb_build_object(
    'operacao','fechar_caixa','unidade_id',p_unidade_id,'data_caixa',p_data_caixa,
    'caixa_diario_id',v_caixa.id,'status',v_caixa.status,
    'saldo_inicial_cofre',v_caixa.saldo_inicial_cofre,'cofre_entradas',v_entradas,
    'cofre_saidas',v_saidas,'saldo_final_calculado',v_saldo,
    'movimentos_por_ambiente',v_contagens
  ));
end;
$function$;

create or replace function public.sol_caixa_resolver_abertura_v3(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $function$
declare v_res jsonb; v_snapshot jsonb;
begin
  v_res := public.sol_caixa_snapshot_abertura_fechamento_v3(nullif(p_payload->>'unidade_id','')::uuid, coalesce(nullif(p_payload->>'data_caixa','')::date,(now() at time zone 'America/Sao_Paulo')::date), 'abrir_caixa');
  if not coalesce((v_res->>'ok')::boolean,false) then return v_res; end if;
  v_snapshot := v_res->'snapshot';
  return v_res || jsonb_build_object('snapshot_hash', encode(digest(v_snapshot::text,'sha256'),'hex'));
end $function$;

create or replace function public.sol_caixa_resolver_fechamento_v3(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $function$
declare v_res jsonb; v_snapshot jsonb;
begin
  v_res := public.sol_caixa_snapshot_abertura_fechamento_v3(nullif(p_payload->>'unidade_id','')::uuid, coalesce(nullif(p_payload->>'data_caixa','')::date,(now() at time zone 'America/Sao_Paulo')::date), 'fechar_caixa');
  if not coalesce((v_res->>'ok')::boolean,false) then return v_res; end if;
  v_snapshot := v_res->'snapshot';
  return v_res || jsonb_build_object('snapshot_hash', encode(digest(v_snapshot::text,'sha256'),'hex'));
end $function$;

-- Valida tudo, mas NÃO consome approval. Os executores somente consomem depois do
-- snapshot atual bater. Assim uma venda Pix/cartão entre preview e "pode" não queima o pode.
create or replace function public.sol_caixa_validar_abertura_fechamento_v1(p_payload jsonb, p_operacao text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $function$
declare
  v_op text := lower(coalesce(p_operacao,''));
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := nullif(p_payload->>'data_caixa','')::date;
  v_preview_hash text := nullif(p_payload->>'v3_preview_hash','');
  v_snapshot_hash text := nullif(p_payload->>'snapshot_hash','');
  v_preview public.sol_caixa_shadow_previews_v1%rowtype;
  v_approval public.sol_caixa_shadow_approvals_v1%rowtype;
  v_event public.sol_caixa_shadow_eventos_v1%rowtype;
  v_auth jsonb;
  v_expires timestamptz;
  v_snapshot jsonb;
begin
  if v_op not in ('abrir_caixa','fechar_caixa') then return jsonb_build_object('ok',false,'motivo','operacao_invalida'); end if;
  if v_unidade is null then return jsonb_build_object('ok',false,'motivo','unidade_invalida'); end if;
  if v_data is null then return jsonb_build_object('ok',false,'motivo','data_caixa_invalida'); end if;
  if nullif(p_payload->>'idempotency_key','') is null then return jsonb_build_object('ok',false,'motivo','idempotency_key_obrigatoria'); end if;
  if nullif(p_payload->>'v3_preview_id','') is null or nullif(p_payload->>'v3_approval_id','') is null then return jsonb_build_object('ok',false,'motivo','preview_approval_obrigatorios'); end if;
  if v_preview_hash is null or v_snapshot_hash is null then return jsonb_build_object('ok',false,'motivo','hashes_v3_obrigatorios'); end if;

  v_auth := public.sol_caixa_autorizar_payload_v1(v_unidade,p_payload,v_op);
  if not coalesce((v_auth->>'autorizado')::boolean,false) then return jsonb_build_object('ok',false,'motivo','ator_nao_autorizado_v3','auth',v_auth); end if;

  select * into v_preview from public.sol_caixa_shadow_previews_v1 where id=(p_payload->>'v3_preview_id')::uuid for update;
  if v_preview.id is null then return jsonb_build_object('ok',false,'motivo','preview_v3_nao_encontrado'); end if;
  select * into v_approval from public.sol_caixa_shadow_approvals_v1 where id=(p_payload->>'v3_approval_id')::uuid and preview_id=v_preview.id for update;
  if v_approval.id is null then return jsonb_build_object('ok',false,'motivo','approval_v3_nao_encontrado'); end if;
  select * into v_event from public.sol_caixa_shadow_eventos_v1 where id=v_preview.evento_id;
  if v_event.id is null then return jsonb_build_object('ok',false,'motivo','evento_v3_nao_encontrado'); end if;

  v_expires := least(v_preview.criado_em + interval '4 hours', ((v_data + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second');
  if v_approval.decision <> 'approved' then return jsonb_build_object('ok',false,'motivo','approval_nao_aprovado'); end if;
  if v_approval.criado_em > v_expires or now() > v_expires then return jsonb_build_object('ok',false,'motivo','approval_expirado'); end if;
  if v_preview.unidade_id is distinct from v_unidade or v_event.unidade_id is distinct from v_unidade then return jsonb_build_object('ok',false,'motivo','unidade_divergente_v3'); end if;
  if v_event.chat_id_hash <> md5(coalesce(nullif(p_payload->>'grupo_jid',''),nullif(p_payload->>'chat_id',''))) then return jsonb_build_object('ok',false,'motivo','grupo_divergente_v3'); end if;
  if v_approval.actor_id_hash is distinct from nullif(p_payload->>'v3_actor_id_hash','') then return jsonb_build_object('ok',false,'motivo','ator_divergente_v3'); end if;
  if nullif(p_payload->>'v3_approval_event_hash','') is not null and v_approval.approval_event_hash is distinct from p_payload->>'v3_approval_event_hash' then return jsonb_build_object('ok',false,'motivo','approval_evento_divergente_v3'); end if;
  if v_preview.preview_hash is distinct from v_preview_hash or lower(v_preview.operacao) is distinct from v_op then return jsonb_build_object('ok',false,'motivo','preview_divergente_v3'); end if;
  if lower(coalesce(v_preview.forma,'')) <> 'nao_aplicavel' then return jsonb_build_object('ok',false,'motivo','preview_forma_invalida_v3'); end if;

  v_snapshot := v_preview.preview_json->'snapshot';
  if v_snapshot is null or encode(digest(v_snapshot::text,'sha256'),'hex') is distinct from v_snapshot_hash then return jsonb_build_object('ok',false,'motivo','snapshot_hash_divergente_v3'); end if;
  return jsonb_build_object('ok',true,'preview_id',v_preview.id,'approval_id',v_approval.id,'snapshot',v_snapshot,'snapshot_hash',v_snapshot_hash);
end $function$;

create or replace function public.sol_caixa_executar_abertura_fechamento_v3(p_payload jsonb, p_operacao text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $function$
declare
  v_op text := lower(coalesce(p_operacao,''));
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := nullif(p_payload->>'data_caixa','')::date;
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_valid jsonb;
  v_atual jsonb;
  v_snapshot jsonb;
  v_caixa uuid;
  v_result jsonb;
  v_exist public.sol_caixa_v3_caixa_operacoes_v1%rowtype;
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
begin
  if v_op not in ('abrir_caixa','fechar_caixa') then return jsonb_build_object('ok',false,'motivo','operacao_invalida'); end if;
  if v_unidade is null or v_data is null or v_key is null then return jsonb_build_object('ok',false,'motivo','payload_v3_incompleto'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_unidade::text || ':' || v_data::text || ':' || v_op, 0));
  select * into v_exist from public.sol_caixa_v3_caixa_operacoes_v1 where idempotency_key=v_key or (unidade_id=v_unidade and data_caixa=v_data and operacao=v_op) limit 1;
  if v_exist.id is not null then return v_exist.resultado || jsonb_build_object('ja_processado',true); end if;

  v_valid := public.sol_caixa_validar_abertura_fechamento_v1(p_payload,v_op);
  if not coalesce((v_valid->>'ok')::boolean,false) then
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,idempotency_key,unidade_id,data_caixa,payload,resultado,motivo)
    values(v_num,p_payload->>'ator_papel',coalesce(p_payload->>'grupo_jid',p_payload->>'chat_id'),v_key,v_unidade,v_data,p_payload,'recusado',v_valid->>'motivo');
    return v_valid;
  end if;

  v_snapshot := v_valid->'snapshot';
  v_atual := public.sol_caixa_snapshot_abertura_fechamento_v3(v_unidade,v_data,v_op);
  if not coalesce((v_atual->>'ok')::boolean,false) or (v_atual->'snapshot') is distinct from v_snapshot then
    return jsonb_build_object('ok',false,'motivo',coalesce(v_atual->>'motivo',case when v_op='abrir_caixa' then 'snapshot_saldo_inicial_mudou' else 'snapshot_caixa_divergente' end));
  end if;

  insert into public.sol_caixa_v3_approval_consumos_v1(approval_id,preview_id,unidade_id,operacao,idempotency_key,payload_hash)
  values((v_valid->>'approval_id')::uuid,(v_valid->>'preview_id')::uuid,v_unidade,v_op,v_key,md5(p_payload::text));

  if v_op='abrir_caixa' then
    insert into public.caixas_diarios(unidade_id,data_caixa,status,saldo_inicial_cofre,saldo_final_calculado,aberto_por)
    values(v_unidade,v_data,'aberto',(v_snapshot->>'saldo_inicial_proposto')::numeric,(v_snapshot->>'saldo_inicial_proposto')::numeric,coalesce(nullif(p_payload->>'conferido_por',''),'Sol')) returning id into v_caixa;
    v_result := jsonb_build_object('ok',true,'operacao',v_op,'caixa_diario_id',v_caixa,'saldo_inicial',(v_snapshot->>'saldo_inicial_proposto')::numeric);
  else
    v_caixa := (v_snapshot->>'caixa_diario_id')::uuid;
    update public.caixas_diarios set status='fechado',saldo_final_calculado=(v_snapshot->>'saldo_final_calculado')::numeric,saldo_final_conferido=(v_snapshot->>'saldo_final_calculado')::numeric,fechado_por=coalesce(nullif(p_payload->>'conferido_por',''),'Sol'),fechado_em=now(),updated_at=now() where id=v_caixa and status='aberto';
    if not found then return jsonb_build_object('ok',false,'motivo','snapshot_caixa_nao_aberto'); end if;
    v_result := jsonb_build_object('ok',true,'operacao',v_op,'caixa_diario_id',v_caixa,'saldo_final',(v_snapshot->>'saldo_final_calculado')::numeric);
  end if;

  insert into public.sol_caixa_v3_caixa_operacoes_v1(unidade_id,data_caixa,operacao,caixa_diario_id,preview_id,approval_id,idempotency_key,snapshot_hash,resultado)
  values(v_unidade,v_data,v_op,v_caixa,(v_valid->>'preview_id')::uuid,(v_valid->>'approval_id')::uuid,v_key,v_valid->>'snapshot_hash',v_result);
  insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,idempotency_key,unidade_id,data_caixa,payload,resultado,caixa_diario_id)
  values(v_num,p_payload->>'ator_papel',coalesce(p_payload->>'grupo_jid',p_payload->>'chat_id'),v_key,v_unidade,v_data,p_payload,v_op,v_caixa);
  return v_result;
exception when unique_violation then
  select * into v_exist from public.sol_caixa_v3_caixa_operacoes_v1 where unidade_id=v_unidade and data_caixa=v_data and operacao=v_op limit 1;
  if v_exist.id is not null then return v_exist.resultado || jsonb_build_object('ja_processado',true); end if;
  return jsonb_build_object('ok',false,'motivo','approval_v3_ja_consumido');
end $function$;

create or replace function public.sol_caixa_abrir_v3(p_payload jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
  select public.sol_caixa_executar_abertura_fechamento_v3(p_payload, 'abrir_caixa');
$$;

create or replace function public.sol_caixa_fechar_v3(p_payload jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
  select public.sol_caixa_executar_abertura_fechamento_v3(p_payload, 'fechar_caixa');
$$;

create or replace function public.sol_caixa_v3_cancelar_preview_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $function$
declare v_preview public.sol_caixa_shadow_previews_v1%rowtype; v_op text := lower(coalesce(p_payload->>'operacao',''));
begin
  if v_op not in ('abrir_caixa','fechar_caixa') then return jsonb_build_object('ok',false,'motivo','operacao_invalida'); end if;
  select * into v_preview from public.sol_caixa_shadow_previews_v1 where id=nullif(p_payload->>'v3_preview_id','')::uuid for update;
  if v_preview.id is null then return jsonb_build_object('ok',false,'motivo','preview_v3_nao_encontrado'); end if;
  if lower(v_preview.operacao) is distinct from v_op then return jsonb_build_object('ok',false,'motivo','preview_operacao_divergente'); end if;
  if exists(select 1 from public.sol_caixa_v3_approval_consumos_v1 where preview_id=v_preview.id) then return jsonb_build_object('ok',false,'motivo','preview_ja_consumido'); end if;
  update public.sol_caixa_shadow_previews_v1 set status='cancelled' where id=v_preview.id;
  return jsonb_build_object('ok',true,'preview_id',v_preview.id,'cancelado',true);
end $function$;

revoke all on function public.sol_caixa_resolver_composto_aluno_v1(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_resolver_abertura_v3(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_resolver_fechamento_v3(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_abrir_v3(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_fechar_v3(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_v3_cancelar_preview_v1(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_validar_abertura_fechamento_v1(jsonb,text) from public, anon, authenticated;
grant execute on function public.sol_caixa_resolver_composto_aluno_v1(jsonb) to service_role, sol_acesso_restrito;
grant execute on function public.sol_caixa_resolver_abertura_v3(jsonb) to service_role, sol_acesso_restrito;
grant execute on function public.sol_caixa_resolver_fechamento_v3(jsonb) to service_role, sol_acesso_restrito;
grant execute on function public.sol_caixa_abrir_v3(jsonb) to service_role, sol_acesso_restrito;
grant execute on function public.sol_caixa_fechar_v3(jsonb) to service_role, sol_acesso_restrito;
grant execute on function public.sol_caixa_v3_cancelar_preview_v1(jsonb) to service_role, sol_acesso_restrito;

comment on table public.sol_caixa_v3_caixa_operacoes_v1 is 'Ledger V3 de abrir/fechar. Reabertura fica explicitamente fora deste contrato; fluxo humano usa caixa_reaberturas_log.';
