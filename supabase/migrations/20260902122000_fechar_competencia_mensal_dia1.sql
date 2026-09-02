-- supabase/migrations/20260902122000_fechar_competencia_mensal_dia1.sql
--
-- Orquestrador do fechamento mensal, dia 1o as 09h BRT.
--
-- Ordem obrigatoria por unidade:
--   0. captura dos 7 dominios (fechar_competencia_mensal_automatico, uma vez)
--   1. frescor da fonte financeira
--   2. bloco financeiro no snapshot gerencial   <- ANTES da captura mensal,
--   3. captura dos 2 dominios mensais              porque montar_..._payload_v1
--   4. fechamento da unidade                       le o gerencial por versao desc
--
-- Cada unidade roda em bloco protegido: em agosto/2026 um aluno de Campo Grande
-- deixou Barra e Recreio sem relatorio.
--
-- Fix round 1/5: falha do passo 0 (captura dos 7 dominios) e' etapa, nao
-- unidade -- por isso NAO soma em v_erro (que so conta unidade com falha).
-- Mas precisa reprovar a execucao mesmo assim, senao a funcao devolveria
-- 'ok:true' com os 7 dominios genuinamente nao capturados. v_passo0_ok
-- carrega esse sinal em separado, e o retorno final combina os dois.

create or replace function public.fechar_competencia_mensal_dia1_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'   -- authenticator corta em 8s; o fechamento leva ~60s
as $$
declare
  v_hoje_brt date := (now() at time zone 'America/Sao_Paulo')::date;
  v_competencia date;
  v_ano integer;
  v_mes integer;
  v_execucao_id uuid;
  v_lote_id uuid := gen_random_uuid();
  v_unidade record;
  v_financeiro jsonb;
  v_bloco jsonb;
  v_detalhes jsonb := '[]'::jsonb;
  v_ok integer := 0;
  v_erro integer := 0;
  v_passo0_ok boolean := true;
  v_motivo text;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_FECHAMENTO_DIA1';
  end if;

  v_competencia := (date_trunc('month', v_hoje_brt) - interval '1 month')::date;
  v_ano := extract(year from v_competencia)::integer;
  v_mes := extract(month from v_competencia)::integer;
  v_motivo := format('fechamento automatico %s/%s - cron dia 1o 09h BRT', v_mes, v_ano);

  insert into public.fechamento_mensal_execucoes (ano, mes, origem)
  values (v_ano, v_mes, 'cron_dia1')
  returning id into v_execucao_id;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Passo 0: captura dos 7 dominios. Idempotente (responde ja_fechado).
  -- Falha aqui e' etapa, nao unidade: nao entra em v_erro, mas zera
  -- v_passo0_ok para reprovar a execucao no retorno final.
  begin
    perform public.fechar_competencia_mensal_automatico();
  exception when others then
    v_passo0_ok := false;
    v_detalhes := v_detalhes || jsonb_build_array(jsonb_build_object(
      'etapa', 'captura_7_dominios', 'ok', false,
      'sqlstate', sqlstate, 'erro', sqlerrm
    ));
  end;

  for v_unidade in
    select u.id, u.nome from public.unidades u where u.ativo = true order by u.nome
  loop
    begin
      -- 1. fonte financeira precisa estar disponivel
      v_financeiro := public.get_financeiro_faturas_emusys(v_unidade.id, v_ano, v_mes);
      if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true then
        raise exception 'FONTE_FINANCEIRA_INDISPONIVEL: status %', coalesce(v_financeiro->>'status', 'desconhecido');
      end if;

      -- 2. bloco financeiro no gerencial (antes da captura mensal)
      v_bloco := public.garantir_bloco_financeiro_gerencial_v1(v_ano, v_mes, v_unidade.id);
      if coalesce((v_bloco->>'ok')::boolean, false) is not true then
        raise exception 'BLOCO_FINANCEIRO_NAO_GARANTIDO: % (%)',
          coalesce(v_bloco->>'acao', 'sem acao'), coalesce(v_bloco->>'motivo', 'sem motivo');
      end if;

      -- 3. captura dos 2 dominios mensais
      perform public.capturar_relatorios_mensais_canonicos_v1(v_ano, v_mes, v_unidade.id);

      -- 4. fechamento da unidade
      perform public.fechar_competencia_mensal_canonica_v2(
        v_ano, v_mes, v_motivo, v_unidade.id, v_lote_id
      );

      v_ok := v_ok + 1;
      v_detalhes := v_detalhes || jsonb_build_array(jsonb_build_object(
        'unidade_id', v_unidade.id, 'unidade', v_unidade.nome,
        'ok', true, 'bloco_financeiro', v_bloco->>'acao'
      ));
    exception when others then
      v_erro := v_erro + 1;
      v_detalhes := v_detalhes || jsonb_build_array(jsonb_build_object(
        'unidade_id', v_unidade.id, 'unidade', v_unidade.nome,
        'ok', false, 'sqlstate', sqlstate, 'erro', sqlerrm
      ));
    end;
  end loop;

  update public.fechamento_mensal_execucoes
  set concluido_em = now(),
      unidades_fechadas = v_ok,
      unidades_com_erro = v_erro,
      detalhes = v_detalhes
  where id = v_execucao_id;

  return jsonb_build_object(
    'ok', v_erro = 0 and v_passo0_ok, 'ano', v_ano, 'mes', v_mes,
    'execucao_id', v_execucao_id, 'fechamento_lote_id', v_lote_id,
    'unidades_fechadas', v_ok, 'unidades_com_erro', v_erro,
    'passo0_ok', v_passo0_ok,
    'detalhes', v_detalhes
  );
end;
$$;

revoke all on function public.fechar_competencia_mensal_dia1_v1() from public;
revoke execute on function public.fechar_competencia_mensal_dia1_v1() from anon;
grant execute on function public.fechar_competencia_mensal_dia1_v1() to service_role;

comment on function public.fechar_competencia_mensal_dia1_v1() is
  'Fechamento mensal automatico do dia 1o. Por unidade, em bloco protegido: valida fonte financeira, garante bloco financeiro no gerencial, captura os 2 dominios mensais e fecha. Grava placar em fechamento_mensal_execucoes. ok=false se o passo 0 (captura dos 7 dominios) OU qualquer unidade falhar.';
