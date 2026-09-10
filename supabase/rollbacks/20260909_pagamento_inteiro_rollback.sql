-- ROLLBACK EXECUTÁVEL das três migrations do pagamento inteiro (09/09/2026).
--
--   cd <raiz do repo>
--   psql "$DSN" -v ON_ERROR_STOP=1 -f supabase/rollbacks/20260909_pagamento_inteiro_rollback.sql
--   echo $?      # 0 = revertido e conferido
--
-- Desfaz, nesta ordem:
--   20260909210000  envelope construído uma vez  (_env_v1 + cascas)
--   20260909193500  sol_caixa_resolver_pagamento_itens_v1
--   20260909193000  ambiguidade recusa + valor declarado + statement_timeout
--
-- 🔴 POR QUE ISTO É UM ARQUIVO E NÃO UM COMENTÁRIO. A versão anterior dizia
--    "reaplicar as migrations anteriores, nesta ordem" no rodapé de cada uma.
--    Rollback que precisa ser interpretado às 3 da manhã não é rollback — o
--    Alfredo recusou o gate por isso, com razão.
--
-- ⚠️ A reconstrução das originais é a TRANSFORMAÇÃO INVERSA da migration, feita
--    sobre a definição viva da variante `_env_v1`: tira o `coalesce(p_env_in, …)`
--    e o parâmetro. Não há corpo transcrito à mão aqui — é o mesmo método que
--    restaurou `sol_caixa_parcela_canonica` no incidente de 09/09, então já foi
--    exercitado contra o caso real.
--
-- ⚠️ GUARDA DE SAÍDA em cada passo: recusa executar se o rename não aconteceu ou
--    se ainda sobrou `p_env_in`. Foi exatamente a ausência disso que quebrou
--    produção naquele incidente.
--
-- ⚠️ IDEMPOTENTE NO QUE IMPORTA: se as `_env_v1` já não existirem, o passo 1 é
--    pulado com aviso em vez de estourar — reverter duas vezes não pode piorar.

\set ON_ERROR_STOP on

------------------------------- 1) originais reconstruídas a partir das _env_v1
do $rb$
declare
  v_def text;
begin
  ------------------------------------------------------------------- composta
  if to_regprocedure('public.sol_caixa_resolver_composto_aluno_env_v1(jsonb,jsonb)') is null then
    raise notice 'composta: _env_v1 nao existe — nada a reverter aqui';
  else
    v_def := pg_get_functiondef(
      'public.sol_caixa_resolver_composto_aluno_env_v1(jsonb,jsonb)'::regprocedure);
    v_def := regexp_replace(v_def,
      'v_env := coalesce\(p_env_in, (public\.sol_faturas_alunos_v1\([^;]+\))\);',
      'v_env := \1;');
    v_def := regexp_replace(v_def,
      'FUNCTION public\.sol_caixa_resolver_composto_aluno_env_v1\(p_env_in jsonb, ',
      'FUNCTION public.sol_caixa_resolver_composto_aluno_v1(');

    if v_def like '%p_env_in%' then
      raise exception 'composta: ainda restou p_env_in na definicao revertida — abortado';
    end if;
    if v_def not like '%FUNCTION public.sol_caixa_resolver_composto_aluno_v1(p_payload jsonb)%' then
      raise exception 'composta: o rename inverso NAO produziu a assinatura original — abortado';
    end if;
    execute v_def;
    drop function public.sol_caixa_resolver_composto_aluno_env_v1(jsonb, jsonb);
    raise notice 'composta revertida';
  end if;

  ------------------------------------------------------------------- canônica
  if to_regprocedure('public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)') is null then
    raise notice 'canonica: _env_v1 nao existe — nada a reverter aqui';
  else
    v_def := pg_get_functiondef(
      'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)'::regprocedure);
    v_def := regexp_replace(v_def,
      'v_env := coalesce\(p_env_in, (public\.sol_faturas_alunos_v1\([^;]+\))\);',
      'v_env := \1;');
    v_def := regexp_replace(v_def,
      'FUNCTION public\.sol_caixa_parcela_canonica_env_v1\(p_env_in jsonb, ',
      'FUNCTION public.sol_caixa_parcela_canonica(');

    if v_def like '%p_env_in%' then
      raise exception 'canonica: ainda restou p_env_in na definicao revertida — abortado';
    end if;
    if v_def not like '%FUNCTION public.sol_caixa_parcela_canonica(p_unidade_id uuid%' then
      raise exception 'canonica: o rename inverso NAO produziu a assinatura original — abortado';
    end if;
    execute v_def;
    drop function public.sol_caixa_parcela_canonica_env_v1(jsonb, uuid, text, numeric, date);
    raise notice 'canonica revertida';
  end if;
end $rb$;

--------------------------------------------- 2) a lista plana deixa de existir
drop function if exists public.sol_caixa_resolver_pagamento_itens_v1(uuid, jsonb, numeric, date);

------------------------- 3) o resolver volta ao estado anterior às 3 migrations
-- `20260909163318` é um `create or replace` COMPLETO (não é patch sobre o vivo),
-- então reaplicá-la restaura a base; `20260909170500` é o patch da canônica, que
-- casa a âncora da base recém-restaurada. Nesta ordem, e só nesta.
\i supabase/migrations/20260909163318_uma_ferramenta_para_o_pagamento_inteiro.sql
\i supabase/migrations/20260909170500_pagamento_inteiro_consulta_a_canonica_antes.sql

alter function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  reset statement_timeout;

revoke execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  from public, anon;
grant execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  to service_role, sol_acesso_restrito;

----------------------------------------------------- 4) o rollback se confere
do $conf$
declare v_falhas text[] := '{}';
begin
  if to_regprocedure('public.sol_caixa_resolver_pagamento_itens_v1(uuid,jsonb,numeric,date)') is not null then
    v_falhas := v_falhas || 'sol_caixa_resolver_pagamento_itens_v1 ainda existe';
  end if;
  if to_regprocedure('public.sol_caixa_resolver_composto_aluno_env_v1(jsonb,jsonb)') is not null then
    v_falhas := v_falhas || 'composta _env_v1 ainda existe';
  end if;
  if to_regprocedure('public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)') is not null then
    v_falhas := v_falhas || 'canonica _env_v1 ainda existe';
  end if;
  -- as originais voltaram a montar o envelope por conta própria
  if pg_get_functiondef('public.sol_caixa_parcela_canonica(uuid,text,numeric,date)'::regprocedure)
       not like '%sol_faturas_alunos_v1%' then
    v_falhas := v_falhas || 'canonica nao voltou a montar o proprio envelope';
  end if;
  if pg_get_functiondef('public.sol_caixa_resolver_composto_aluno_v1(jsonb)'::regprocedure)
       not like '%sol_faturas_alunos_v1%' then
    v_falhas := v_falhas || 'composta nao voltou a montar o proprio envelope';
  end if;
  -- e o resolver perdeu o que as 3 migrations tinham acrescentado
  if pg_get_functiondef('public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)'::regprocedure)
       like '%nome_ambiguo%' then
    v_falhas := v_falhas || 'resolver ainda tem o ramo de ambiguidade (193000 nao revertida)';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='sol_caixa_resolver_pagamento_v1'
                and array_to_string(p.proconfig,',') like '%statement_timeout%') then
    v_falhas := v_falhas || 'statement_timeout por funcao nao foi resetado';
  end if;
  if has_function_privilege('anon',
       'public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)', 'EXECUTE') then
    v_falhas := v_falhas || 'resolver ficou executavel por anon';
  end if;

  if array_length(v_falhas,1) > 0 then
    raise exception E'ROLLBACK INCOMPLETO:\n  %', array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'ROLLBACK OK — 8 verificacoes, estado anterior restaurado';
end $conf$;
