-- A Media/Turma morria com 57014 e a tela escrevia "Indisponivel" (fail-closed correto).
-- Medido em 22/09/2026 com o banco livre: a funcao custa 327 ms e devolve 74 linhas.
-- Pelo PostgREST, porem, `pg_stat_statements` acusa media de 3.484 ms e maximo de 7.981 ms
-- contra o teto de 8s do papel `authenticated` -- ou seja, ela morre por CONCORRENCIA, a
-- 19 ms do limite, nao por custo proprio.
--
-- ⚠️ `statement_timeout` NAO altera uma linha do corpo da funcao: ele so diz por quanto
--    tempo o Postgres a deixa rodar antes de cancelar. Mesmo SQL, mesmo resultado, mesmos
--    74 grupos -- o que muda e' a funcao conseguir TERMINAR o que ja fazia.
--
-- Mesmo padrao das 4 funcoes financeiras (20260914234500) e de
-- publish_financeiro_sync_run (20260828210500): teto por FUNCAO, nunca no papel inteiro --
-- o 8s global e' guard-rail, nao defeito.
--
-- As internas (get_kpis_turmas_canonicos_v1, get_carteira_professor_periodo_*) nao levam
-- teto: nao sao alcancaveis de fora e herdam o de quem as chamou.
--
-- ⚠️ NAO validar com `set local statement_timeout` na mesma transacao: o teto do statement
--    e' armado ANTES de a funcao entrar e trocar o GUC, entao a query morre assim mesmo e
--    o fix certo e' reprovado (aconteceu em 14/09). A prova valida e' por HTTP; o
--    mecanismo ja foi provado assim naquela data.
--
-- ROLLBACK:
--   alter function public.get_kpis_turmas_canonicos_v2(integer,integer,uuid,date,date)
--     reset statement_timeout;
do $$
declare v_cfg text[];
begin
  -- guarda: a funcao tem de existir com ESTA assinatura (a que o front chama)
  select proconfig into v_cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_kpis_turmas_canonicos_v2'
     and pg_get_function_identity_arguments(p.oid)
         = 'p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date';
  if not found then
    raise exception 'get_kpis_turmas_canonicos_v2 nao encontrada com a assinatura esperada';
  end if;
  if not ('search_path=public, pg_temp' = any(v_cfg)) then
    raise exception 'search_path inesperado antes da alteracao: %', v_cfg;
  end if;
end $$;

alter function public.get_kpis_turmas_canonicos_v2(integer, integer, uuid, date, date)
  set statement_timeout = '30s';

do $$
declare v_cfg text[];
begin
  select proconfig into v_cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_kpis_turmas_canonicos_v2'
     and pg_get_function_identity_arguments(p.oid)
         = 'p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date';
  -- o search_path NAO pode ter sido perdido: funcao SECURITY DEFINER sem ele e' furo
  if not ('search_path=public, pg_temp' = any(v_cfg)) then
    raise exception 'search_path sumiu na alteracao: %', v_cfg;
  end if;
  if not ('statement_timeout=30s' = any(v_cfg)) then
    raise exception 'o teto nao foi aplicado: %', v_cfg;
  end if;
end $$;
