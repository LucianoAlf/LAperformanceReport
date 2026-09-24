-- Caches server-side: a GRAVAÇÃO do cache não pode derrubar a leitura.
--
-- Em 23/09 (20h-21h30 BRT) 12 funções ganharam cache que grava na própria chamada
-- (VOLATILE + INSERT em *_cache). O PostgREST roda função STABLE em transação
-- READ ONLY, e três delas têm chamador STABLE:
--   get_kpis_alunos_admin_operacional <- get_situacao_alunos_resumo_v1 (Sol/TOM/Lia/app)
--   get_agenda_dia_v2                 <- get_agenda_semana_v2 (Agenda, visão semana)
--   get_inadimplencia_canonica        <- 4 bases STABLE do financeiro
-- Num cache miss o INSERT levantava 25006 e a chamada inteira falhava. Provado em
-- 24/09: get_situacao_alunos_resumo_v1(Barra, 2026-05-15) em transação read only ->
-- "cannot execute INSERT in a read-only transaction". É a armadilha já anotada no
-- CLAUDE.md ("não pôr o cache no nome original").
--
-- Correção mínima: cada INSERT/DELETE em *_cache vira
--   begin <comando> exception when read_only_sql_transaction then null; end;
-- Em transação que aceita escrita nada muda; em transação só-leitura a função devolve
-- o valor calculado e só não guarda. Nenhum corpo é reescrito à mão: substituição
-- sobre pg_get_functiondef, com a contagem esperada por função declarada (se a
-- definição viva tiver mudado, aborta). CREATE OR REPLACE preserva ACL e os SET.
--
-- Junto: sol_acesso_restrito volta a ter EXECUTE em get_kpis_alunos_canonicos
-- (o wrapper de 20260924236000 concedeu só a authenticated/service_role; a Sol
-- tinha o grant desde 20260905200225).

set local lock_timeout = '10s';

do $migra$
declare
  v_alvo record;
  v_def text;
  v_novo text;
  v_achados int;
  v_padrao constant text :=
    '((?:insert\s+into|delete\s+from)\s+public\.[a-z_]*_cache\M[^;]*;)';
begin
  for v_alvo in
    select * from (values
      ('public.get_agenda_dia_v2(date,uuid)', 1),
      ('public.get_dashboard_professores_resumo_canonico_v1(integer,integer,uuid,date,date)', 2),
      ('public.get_faturas_alunos_financeiro_v1(uuid,integer,integer,text,text,date)', 2),
      ('public.get_financeiro_faturas_emusys(uuid,integer,integer)', 1),
      ('public.get_inadimplencia_canonica(uuid,date)', 1),
      ('public.get_kpis_alunos_admin_operacional_cache_v1(uuid,integer,integer)', 2),
      ('public.get_kpis_alunos_admin_operacional(uuid,integer,integer)', 1),
      ('public.get_kpis_alunos_canonicos_cache_v1(uuid,integer,integer)', 2),
      ('public.get_kpis_alunos_canonicos(uuid,integer,integer)', 1),
      ('public.get_kpis_professores_cadastro_canonicos_v1(integer,integer,uuid,date,date)', 1),
      ('public.get_kpis_turmas_canonicos_v2(integer,integer,uuid,date,date)', 1),
      ('public.get_tempo_permanencia(uuid,integer,integer)', 1)
    ) as t(assinatura, esperado)
  loop
    v_def := pg_get_functiondef(v_alvo.assinatura::regprocedure);

    if v_def ~* 'read_only_sql_transaction' then
      raise exception 'CACHE_RO_JA_TRATADO: % já trata read_only_sql_transaction', v_alvo.assinatura;
    end if;

    select count(*) into v_achados from regexp_matches(v_def, v_padrao, 'gi');
    if v_achados <> v_alvo.esperado then
      raise exception 'CACHE_RO_ANCORA: % esperava % comando(s) de cache, achou %',
        v_alvo.assinatura, v_alvo.esperado, v_achados;
    end if;

    v_novo := regexp_replace(
      v_def, v_padrao,
      E'begin\n    \\1\n  exception when read_only_sql_transaction then\n    null; -- chamador STABLE via PostgREST: devolve o valor sem guardar\n  end;',
      'gi');

    execute v_novo;

    select count(*) into v_achados
    from regexp_matches(pg_get_functiondef(v_alvo.assinatura::regprocedure),
                        'exception when read_only_sql_transaction', 'g');
    if v_achados <> v_alvo.esperado then
      raise exception 'CACHE_RO_VERIFY: % ficou com % blocos protegidos (esperado %)',
        v_alvo.assinatura, v_achados, v_alvo.esperado;
    end if;
  end loop;
end;
$migra$;

grant execute on function public.get_kpis_alunos_canonicos(uuid, integer, integer)
  to sol_acesso_restrito;

do $verify$
begin
  if not has_function_privilege('sol_acesso_restrito',
       'public.get_kpis_alunos_canonicos(uuid,integer,integer)', 'execute') then
    raise exception 'CACHE_RO_VERIFY: sol_acesso_restrito sem EXECUTE em get_kpis_alunos_canonicos';
  end if;
  if has_function_privilege('anon',
       'public.get_kpis_alunos_canonicos(uuid,integer,integer)', 'execute')
     or has_function_privilege('anon',
       'public.get_kpis_alunos_admin_operacional(uuid,integer,integer)', 'execute') then
    raise exception 'CACHE_RO_VERIFY: anon com EXECUTE';
  end if;
end;
$verify$;
