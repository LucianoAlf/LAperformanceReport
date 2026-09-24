-- O cache de get_kpis_alunos_admin_operacional (20260925020000) só expirava por TEMPO:
-- chave = unidade + ano + mês + data BRT + escopo, TTL de 15 min. Matrícula, saída ou
-- trancamento lançados nesse intervalo não apareciam na tela até o TTL vencer — contra a
-- regra combinada na LAPE-42: dado que não pode estar velho só usa cache por VERSÃO.
--
-- Aqui a chave passa a incluir kpis_alunos_cache_impressao_v1() — a mesma impressão
-- digital das 17 tabelas lidas pela árvore que o nome público get_kpis_alunos_canonicos
-- já usa (contadores de insert/update/delete de pg_stat_user_tables, ~1 ms). Qualquer
-- escrita nessas tabelas troca a chave; o TTL de 15 min fica como rede para insumo fora
-- da impressão. Nada mais muda: mesmo leitor interno, mesma tabela, mesmo single-flight.

set local lock_timeout = '10s';

do $migra$
declare
  v_fn constant regprocedure := 'public.get_kpis_alunos_admin_operacional(uuid,integer,integer)';
  v_def text := pg_get_functiondef(v_fn);
  v_ancora constant text := 'public.paginas_rpc_cache_escopo_v1()';
  v_n int;
begin
  if v_def ~ 'kpis_alunos_cache_impressao_v1' then
    raise exception 'ADMIN_IMPRESSAO_JA_APLICADA';
  end if;

  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_n <> 1 then
    raise exception 'ADMIN_IMPRESSAO_ANCORA: esperava 1 ocorrência de %, achou %', v_ancora, v_n;
  end if;

  execute replace(v_def, v_ancora,
    v_ancora || E',\n    public.kpis_alunos_cache_impressao_v1()');

  v_def := pg_get_functiondef(v_fn);
  if v_def !~ 'kpis_alunos_cache_impressao_v1\(\)'
     or v_def !~ 'exception when read_only_sql_transaction' then
    raise exception 'ADMIN_IMPRESSAO_VERIFY: impressão ou guarda de só-leitura ausente';
  end if;
  if has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('sol_acesso_restrito', v_fn, 'execute') then
    raise exception 'ADMIN_IMPRESSAO_VERIFY: ACL mudou';
  end if;
end;
$migra$;
