-- FATIA 1 — o resolvedor de escopo e as primeiras portas da Sol (07/09/2026).
--
-- 🔴 A DESCOBERTA QUE REDEFINIU ESTA FATIA. Eu ia "embrulhar as RPCs que ja
--    existem". Medido: das 9 RPCs candidatas, **apenas 1 gateia por telefone**
--    (`radar_pendencias_comerciais_v1`). As outras 8 recebem `p_unidade_id`
--    **como ARGUMENTO** — quem chama escolhe a unidade.
--
--    Expor essas como porta seria repetir a armadilha ja documentada nesta
--    casa: 213 das 246 funcoes que recebem `p_unidade_id` sao SECURITY DEFINER
--    e **confiam no argumento**. O modelo pediria o Recreio e receberia.
--
--    E e exatamente o que a Maria evita, verificado hoje: *"o escopo nao e
--    argumento da ferramenta — o perfil e resolvido pelo remetente"*.
--
-- Entao a porta nao embrulha: ela **resolve a unidade pelo telefone** e delega.
-- Camada fina, mas e ela que faz o desenho ser o da Maria.
--
-- ⚠️ DUAS PERGUNTAS DIFERENTES, e a Fatia 0 ja separou:
--      GRANT ....... esta porta existe para voce?      (o papel)
--      resolvedor .. destas linhas, quais sao suas?    (esta camada)
--
-- ⚠️ SEM UNIDADE = RECUSA, nunca a rede. Medido hoje: **2 dos 9 do
--    administrativo/colaborador estao sem unidade**. Se o resolvedor tratasse
--    NULL como "todas", essas duas pessoas veriam a rede inteira por um vazio
--    de cadastro. Vazio de cadastro nao pode virar permissao.
--
-- ⚠️ O nome da unidade e aceito em TEXTO ("Barra", "recreio") porque e o que
--    uma pessoa escreve, mas quem casa e o banco — o modelo nunca manda uuid.

create or replace function public.sol_resolver_escopo_v1(
  p_solicitante_telefone text,
  p_unidade_pedida       text default null
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare v_quem record; v_publico text; v_uid uuid; v_unome text; v_pedida uuid;
begin
  select * into v_quem
  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''), '\D', '', 'g'));
  if v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido',
      'recado', 'Não consegui identificar quem está perguntando — sem carimbo eu não entrego dado.');
  end if;

  v_publico := case
    when lower(coalesce(v_quem.nivel,'')) = 'diretoria' then 'estrategico'
    when lower(coalesce(v_quem.departamento,'')) = 'administrativo'
     and lower(coalesce(v_quem.nivel,'')) = 'lider' then 'tatico'
    when lower(coalesce(v_quem.departamento,'')) = 'administrativo' then 'operacional'
    else null end;

  if v_publico is null then
    return jsonb_build_object('ok', false, 'motivo', 'fora_do_publico',
      'quem', v_quem.nome, 'departamento', v_quem.departamento,
      'recado', 'Essas portas são do time administrativo.');
  end if;

  -- a unidade que a pessoa pediu, se pediu
  if coalesce(btrim(p_unidade_pedida),'') <> '' then
    select u.id, u.nome into v_pedida, v_unome
    from unidades u
    where unaccent(lower(u.nome)) like '%' || unaccent(lower(btrim(p_unidade_pedida))) || '%'
    limit 2;
    if v_pedida is null then
      return jsonb_build_object('ok', false, 'motivo', 'unidade_nao_encontrada',
        'pedida', p_unidade_pedida);
    end if;
  end if;

  if v_publico = 'estrategico' then
    -- diretoria: a unidade pedida, ou a REDE quando nao pede nenhuma
    v_uid := v_pedida;
    if v_uid is null then v_unome := 'Rede (3 unidades)'; end if;
  else
    -- ⚠️ FALHA FECHADA: sem unidade no cadastro, nao entrega nada. 2 dos 9 do
    --    operacional estao assim hoje — vazio de cadastro nao vira permissao.
    if v_quem.unidade_id is null then
      return jsonb_build_object('ok', false, 'motivo', 'sem_unidade_no_cadastro',
        'quem', v_quem.nome,
        'recado', 'Seu cadastro está sem unidade — peça para incluírem antes de eu puxar número.');
    end if;
    -- pediu outra unidade? recusa, e diz qual e a dela
    if v_pedida is not null and v_pedida <> v_quem.unidade_id then
      return jsonb_build_object('ok', false, 'motivo', 'fora_do_escopo',
        'recado', 'Essa unidade não é a sua — eu não vejo as outras.');
    end if;
    v_uid := v_quem.unidade_id;
    select nome into v_unome from unidades where id = v_uid;
  end if;

  return jsonb_build_object('ok', true, 'publico', v_publico,
    'quem', v_quem.nome, 'nivel', v_quem.nivel, 'departamento', v_quem.departamento,
    'unidade_id', v_uid, 'unidade_nome', coalesce(v_unome, 'Rede'),
    'escopo', case when v_uid is null then 'rede' else 'unidade' end);
end; $function$;

comment on function public.sol_resolver_escopo_v1(text, text) is
  'Resolve QUEM esta perguntando e QUAL unidade ele pode ver, pelo telefone. Toda porta da Sol '
  'passa por aqui — o escopo nunca e argumento que o modelo escolhe. Sem unidade no cadastro '
  'RECUSA (falha fechada): vazio de cadastro nao vira permissao.';

-- ── as primeiras portas ────────────────────────────────────────────────────
-- Cada uma: resolve o escopo, delega para a RPC que ja existe, devolve com
-- quem/unidade explicitos para a Sol poder dizer de quem e o numero.

create or replace function public.sol_porta_caixa_do_dia_v1(
  p_solicitante_telefone text, p_unidade text default null, p_data date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb; d jsonb;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  if e->>'unidade_id' is null then
    return jsonb_build_object('ok', false, 'motivo', 'caixa_e_por_unidade',
      'recado', 'Caixa é por unidade — me diga qual.');
  end if;
  d := sol_caixa_resumo_do_dia((e->>'unidade_id')::uuid,
                               coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date));
  return jsonb_build_object('ok', true, 'escopo', e, 'caixa', d);
end; $function$;

create or replace function public.sol_porta_inadimplencia_v1(
  p_solicitante_telefone text, p_unidade text default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $function$
declare e jsonb; d jsonb;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  d := sol_inadimplencia_v1(nullif(e->>'unidade_id','')::uuid,
                            (now() at time zone 'America/Sao_Paulo')::date);
  return jsonb_build_object('ok', true, 'escopo', e, 'inadimplencia', d);
end; $function$;

create or replace function public.sol_porta_faturas_do_mes_v1(
  p_solicitante_telefone text, p_unidade text default null,
  p_ano int default null, p_mes int default null, p_status text default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $function$
declare e jsonb; d jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  d := sol_faturas_alunos_v1(nullif(e->>'unidade_id','')::uuid,
        coalesce(p_ano, extract(year from v_hoje)::int),
        coalesce(p_mes, extract(month from v_hoje)::int),
        'competencia', p_status, v_hoje);
  return jsonb_build_object('ok', true, 'escopo', e, 'faturas', d);
end; $function$;

create or replace function public.sol_porta_numeros_da_unidade_v1(
  p_solicitante_telefone text, p_unidade text default null,
  p_ano int default null, p_mes int default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $function$
declare e jsonb; d jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  -- ⚠️ numeros de unidade sao TATICOS: colaborador ve o dia (caixa, faturas),
  --    nao o placar da unidade. Sem isto, a porta contornaria o proprio GRANT.
  if e->>'publico' = 'operacional' then
    return jsonb_build_object('ok', false, 'motivo', 'acima_do_seu_papel',
      'recado', 'O placar da unidade é com a gerência — eu te mostro o dia a dia.');
  end if;
  d := sol_kpis_alunos_v1(nullif(e->>'unidade_id','')::uuid,
        coalesce(p_ano, extract(year from v_hoje)::int),
        coalesce(p_mes, extract(month from v_hoje)::int));
  return jsonb_build_object('ok', true, 'escopo', e, 'numeros', d);
end; $function$;

-- ── permissoes: a porta e do papel, a RPC de dentro nao ────────────────────
do $grants$
declare f text; a text;
begin
  foreach f in array array['sol_resolver_escopo_v1','sol_porta_caixa_do_dia_v1',
                           'sol_porta_inadimplencia_v1','sol_porta_faturas_do_mes_v1',
                           'sol_porta_numeros_da_unidade_v1'] loop
    select pg_get_function_identity_arguments(oid) into a
      from pg_proc where proname=f and pronamespace='public'::regnamespace limit 1;
    -- ⚠️ revoke nominal de anon: recriar funcao reabre EXECUTE pelo
    --    ALTER DEFAULT PRIVILEGES do schema public — armadilha ja documentada.
    execute format('revoke all on function public.%I(%s) from public, anon', f, a);
    execute format('grant execute on function public.%I(%s) to service_role', f, a);
    if f like 'sol!_porta!_numeros%' escape '!' then
      execute format('grant execute on function public.%I(%s) to sol_tatico, sol_estrategico', f, a);
    else
      execute format('grant execute on function public.%I(%s) to sol_operacional, sol_tatico, sol_estrategico', f, a);
    end if;
  end loop;
end $grants$;

-- ── prova: o gate segura nos quatro cenarios ───────────────────────────────
do $prova$
declare v jsonb; t_op text; t_dir text; t_outra text; v_u uuid;
begin
  select telefone into t_op from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;
  select telefone into t_dir from governanca.agente_usuarios
   where lower(nivel)='diretoria' and coalesce(ativo,true) limit 1;

  -- 1. operacional resolve para a PROPRIA unidade
  v := sol_resolver_escopo_v1(t_op, null);
  if not (v->>'ok')::bool or v->>'publico' <> 'operacional' or v->>'unidade_id' is null then
    raise exception 'operacional nao resolveu: %', v;
  end if;
  v_u := (v->>'unidade_id')::uuid;

  -- 2. operacional pedindo OUTRA unidade e RECUSADO
  select nome into t_outra from unidades where id <> v_u limit 1;
  v := sol_resolver_escopo_v1(t_op, t_outra);
  if (v->>'ok')::bool then
    raise exception 'operacional conseguiu outra unidade — gate furado: %', v;
  end if;

  -- 3. diretoria sem pedir unidade resolve para a REDE
  v := sol_resolver_escopo_v1(t_dir, null);
  if not (v->>'ok')::bool or v->>'escopo' <> 'rede' then
    raise exception 'diretoria nao resolveu para rede: %', v;
  end if;

  -- 4. o placar da unidade NAO e do operacional
  v := sol_porta_numeros_da_unidade_v1(t_op, null);
  if (v->>'ok')::bool then
    raise exception 'operacional viu o placar da unidade — deveria ser barrado';
  end if;

  -- 5. a porta do caixa funciona para o operacional
  v := sol_porta_caixa_do_dia_v1(t_op, null);
  if not (v->>'ok')::bool then
    raise exception 'a porta do caixa falhou para o operacional: %', v;
  end if;

  raise notice 'portas provadas: operacional na propria unidade · outra unidade RECUSADA · diretoria na rede · placar barrado no operacional · caixa do dia ok';
end $prova$;
