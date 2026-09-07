-- FATIA 1 — as outras 8 portas da Sol (07/09/2026).
--
-- Completa o 1o andar do operacional. Todas seguem o padrao provado na
-- migration anterior: resolve o escopo PELO TELEFONE (`sol_resolver_escopo_v1`)
-- e delega para a fonte que ja existe. Nenhuma aceita `unidade_id` do chamador.
--
-- ⚠️ QUATRO DELAS LEEM VIEW, NAO RPC — `vw_contratos_vencendo`,
--    `vw_renovacao_ciclos`, `vw_alunos_sem_fatura_mes`. Isso e de proposito e
--    e o que torna a porta necessaria: os tres papeis da Fatia 0 **nao leem
--    view nenhuma** (invariante provada: 0 objetos por SELECT). A porta e
--    `SECURITY DEFINER` e atravessa; o papel, sozinho, nao alcanca.
--
-- ⚠️ AS TRES VIEWS JA TEM PREDICADO DE UNIDADE POR DENTRO (desde 15/08), com
--    `current_user in ('service_role','postgres') or is_admin() or unidade_id
--    in get_user_unidade_ids()`. Como a porta roda como DONO (definer), ela cai
--    no ramo `postgres` e ve tudo — por isso o `where unidade_id = ...` aqui
--    NAO e redundante: e ele que recorta. Sem ele a porta furaria o escopo
--    exatamente onde a view parecia proteger.
--
-- ⚠️ TETO DE LINHAS em toda porta de lista. A Sol responde em WhatsApp; 400
--    linhas nao viram mensagem, viram timeout e token queimado. Quem precisa
--    de tudo abre a tela.

-- 1. situacao do aluno (resumo da unidade) ─────────────────────────────────
create or replace function public.sol_porta_situacao_alunos_v1(
  p_solicitante_telefone text, p_unidade text default null, p_referencia date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  if e->>'unidade_id' is null then
    return jsonb_build_object('ok', false, 'motivo', 'e_por_unidade',
      'recado', 'Isso é por unidade — me diga qual.');
  end if;
  return jsonb_build_object('ok', true, 'escopo', e,
    'situacao', get_situacao_alunos_resumo_v1((e->>'unidade_id')::uuid,
                  coalesce(p_referencia, (now() at time zone 'America/Sao_Paulo')::date)));
end; $function$;

-- 2. presenca pendente do dia ──────────────────────────────────────────────
create or replace function public.sol_porta_presenca_pendente_v1(
  p_solicitante_telefone text, p_unidade text default null, p_data date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb; v_d date;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  if e->>'unidade_id' is null then
    return jsonb_build_object('ok', false, 'motivo', 'e_por_unidade',
      'recado', 'Chamada é por unidade — me diga qual.');
  end if;
  -- ⚠️ ONTEM por padrao, nao hoje: a chamada de hoje ainda esta acontecendo, e
  --    cobrar aula que nem terminou e o ruido que quebra a confianca no canal.
  v_d := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date - 1);
  return jsonb_build_object('ok', true, 'escopo', e, 'data', v_d,
    'pendencias', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                     from (select * from fn_presenca_pendencias_do_dia((e->>'unidade_id')::uuid, v_d)
                            limit 60) t));
end; $function$;

-- 3. pendencias de cadastro ────────────────────────────────────────────────
create or replace function public.sol_porta_pendencias_cadastro_v1(
  p_solicitante_telefone text, p_amostra int default 3)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, null);
  if not (e->>'ok')::bool then return e; end if;
  -- ⚠️ Esta RPC ja gateia por telefone sozinha (a unica das 9 que gateava).
  --    Passamos o telefone adiante em vez de a unidade — nao ha o que recortar
  --    aqui, e recortar duas vezes daria numero diferente do que ela responde
  --    quando perguntam direto.
  return jsonb_build_object('ok', true, 'escopo', e,
    'pendencias', radar_pendencias_comerciais_v1(p_solicitante_telefone, least(greatest(p_amostra,1),8)));
end; $function$;

-- 4. alunos em aviso previo ────────────────────────────────────────────────
create or replace function public.sol_porta_aviso_previo_v1(
  p_solicitante_telefone text, p_unidade text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb; v_u uuid;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  v_u := nullif(e->>'unidade_id','')::uuid;
  return jsonb_build_object('ok', true, 'escopo', e,
    -- ⚠️ As colunas sao `data`, `competencia_referencia` e `data_prevista_saida`
    --    — nao `data_movimento` nem `competencia`. Conferido no catalogo antes
    --    de escrever; chutar nome de coluna aqui daria erro so em producao.
    --    E `aluno_nome` vem da propria movimentacao (snapshot), nao do join.
    'avisos', (select coalesce(jsonb_agg(jsonb_build_object(
                 'aluno', m.aluno_nome, 'curso', m.curso_nome,
                 'competencia', m.competencia_referencia, 'motivo', m.motivo,
                 'registrado_em', m.data, 'saida_prevista', m.data_prevista_saida)
                 order by m.data desc), '[]'::jsonb)
               from (select mv.aluno_nome, c.nome curso_nome, mv.competencia_referencia,
                            mv.motivo, mv.data, mv.data_prevista_saida
                     from movimentacoes_admin_vigentes mv
                     left join cursos c on c.id = mv.curso_id
                     where mv.tipo = 'aviso_previo'
                       and (v_u is null or mv.unidade_id = v_u)
                       and mv.data >= current_date - 90
                     order by mv.data desc limit 40) m));
end; $function$;

-- 5. renovacoes do mes ─────────────────────────────────────────────────────
create or replace function public.sol_porta_renovacoes_v1(
  p_solicitante_telefone text, p_unidade text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb; v_u uuid;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  v_u := nullif(e->>'unidade_id','')::uuid;
  -- ⚠️ `atividade_extra` fora: banda e coral nao contam em retencao (regra
  --    canonica desta casa, e o filtro fica no consumidor porque a view serve
  --    as duas janelas da tela).
  return jsonb_build_object('ok', true, 'escopo', e,
    'renovacoes', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
        select aluno_nome, curso_nome, professor_nome, data_ultima_aula,
               renovou, competencia_aula, valor_parcela, inadimplente
        from vw_renovacao_ciclos
        where (v_u is null or unidade_id = v_u)
          and not coalesce(atividade_extra, false)
          and competencia_aula = date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date
        order by renovou nulls first, data_ultima_aula limit 60) r));
end; $function$;

-- 6. contratos vencendo ────────────────────────────────────────────────────
create or replace function public.sol_porta_contratos_vencendo_v1(
  p_solicitante_telefone text, p_unidade text default null, p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb; v_u uuid; v_d int;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  v_u := nullif(e->>'unidade_id','')::uuid;
  v_d := least(greatest(coalesce(p_dias, 30), 1), 90);
  return jsonb_build_object('ok', true, 'escopo', e, 'janela_dias', v_d,
    'contratos', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from (
        select aluno_nome, curso_nome, professor_nome, data_ultima_aula,
               dias_ate_vencimento, nr_aulas_futuras, valor_parcela,
               inadimplente, faturas_vencidas_abertas
        from vw_contratos_vencendo
        where (v_u is null or unidade_id = v_u)
          and dias_ate_vencimento between 0 and v_d
        order by dias_ate_vencimento limit 60) c));
end; $function$;

-- 7. alunos com aula e sem fatura ──────────────────────────────────────────
create or replace function public.sol_porta_alunos_sem_fatura_v1(
  p_solicitante_telefone text, p_unidade text default null, p_competencia date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb; v_u uuid; v_c date;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  v_u := nullif(e->>'unidade_id','')::uuid;
  v_c := date_trunc('month', coalesce(p_competencia, (now() at time zone 'America/Sao_Paulo')::date))::date;
  return jsonb_build_object('ok', true, 'escopo', e, 'competencia', v_c,
    'sem_fatura', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (
        -- ⚠️ ordenado pelo vencimento MAIS ANTIGO: a pergunta e "ha quanto
        --    tempo esse contrato esta sem cobranca", pedido do Arthur em 27/08.
        select aluno_nome, curso_nome, status_matricula, data_ultima_aula,
               valor_parcela, nr_faturas, venc_ultima_fatura, dias_ate_venc_fatura
        from vw_alunos_sem_fatura_mes
        where (v_u is null or unidade_id = v_u) and competencia = v_c
        order by venc_ultima_fatura nulls last limit 60) s));
end; $function$;

-- 8. ocupacao / agenda do dia ──────────────────────────────────────────────
create or replace function public.sol_porta_agenda_do_dia_v1(
  p_solicitante_telefone text, p_unidade text default null, p_data date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare e jsonb; v_d date;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  v_d := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  return jsonb_build_object('ok', true, 'escopo', e, 'data', v_d,
    'agenda', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                 from (select * from get_agenda_dia(v_d, nullif(e->>'unidade_id','')::uuid)
                        limit 120) a));
end; $function$;

-- ── permissoes ─────────────────────────────────────────────────────────────
do $grants$
declare f text; a text;
begin
  foreach f in array array[
    'sol_porta_situacao_alunos_v1','sol_porta_presenca_pendente_v1',
    'sol_porta_pendencias_cadastro_v1','sol_porta_aviso_previo_v1',
    'sol_porta_renovacoes_v1','sol_porta_contratos_vencendo_v1',
    'sol_porta_alunos_sem_fatura_v1','sol_porta_agenda_do_dia_v1'] loop
    select pg_get_function_identity_arguments(oid) into a
      from pg_proc where proname=f and pronamespace='public'::regnamespace limit 1;
    execute format('revoke all on function public.%I(%s) from public, anon', f, a);
    execute format('grant execute on function public.%I(%s) to service_role, sol_operacional, sol_tatico, sol_estrategico', f, a);
  end loop;
end $grants$;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare
  t_op text; t_dir text; t_outra text; v_u uuid; v jsonb; f text;
  PORTAS constant text[] := array[
    'sol_porta_situacao_alunos_v1','sol_porta_presenca_pendente_v1',
    'sol_porta_pendencias_cadastro_v1','sol_porta_aviso_previo_v1',
    'sol_porta_renovacoes_v1','sol_porta_contratos_vencendo_v1',
    'sol_porta_alunos_sem_fatura_v1','sol_porta_agenda_do_dia_v1'];
  v_ok int := 0;
begin
  select telefone, unidade_id into t_op, v_u from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;
  select telefone into t_dir from governanca.agente_usuarios
   where lower(nivel)='diretoria' and coalesce(ativo,true) limit 1;
  select nome into t_outra from unidades where id <> v_u limit 1;

  -- 1. todas respondem ok para o operacional na propria unidade
  foreach f in array PORTAS loop
    execute format('select public.%I($1)', f) into v using t_op;
    if not (v->>'ok')::bool then
      raise exception '% falhou para o operacional: %', f, v;
    end if;
    v_ok := v_ok + 1;
  end loop;

  -- 2. 🔴 nenhuma entrega OUTRA unidade ao operacional
  foreach f in array PORTAS loop
    if f = 'sol_porta_pendencias_cadastro_v1' then continue; end if;  -- nao aceita unidade
    execute format('select public.%I($1, $2)', f) into v using t_op, t_outra;
    if (v->>'ok')::bool then
      raise exception '% entregou OUTRA unidade ao operacional — gate furado', f;
    end if;
  end loop;

  -- 3. a diretoria alcanca a rede nas que sao de rede
  v := sol_porta_contratos_vencendo_v1(t_dir);
  if not (v->>'ok')::bool or v->'escopo'->>'escopo' <> 'rede' then
    raise exception 'diretoria nao alcancou a rede em contratos_vencendo: %', v;
  end if;

  raise notice '8 portas provadas: % responderam ao operacional · 7 RECUSARAM outra unidade · diretoria na rede', v_ok;
end $prova$;
