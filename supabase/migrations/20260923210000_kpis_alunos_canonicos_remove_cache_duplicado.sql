-- Um cache só para os KPIs de alunos (LAPE-42).
--
-- Em 23/09/2026 19h34 BRT uma sessão paralela, pelo MCP, sem migration, renomeou a
-- get_kpis_alunos_canonicos para kpis_alunos_sem_cache_20260923 e pôs no nome original
-- um cache próprio (VOLATILE, chave = count + max(updated_at) de 7 tabelas, TTL 30 min).
-- Isso empilhava com o cache por versão de 20260923200000 e o anulava:
--   * UPDATE sem updated_at, ou em tabela fora das 7 (jornada, dados_mensais,
--     competencias_mensais, banda, permissões), não invalidava — número velho por até 30 min,
--     e o cache por versão, que chama esta função, gravava esse número velho sob a chave nova;
--   * a chave não tinha usuário: acerto de cache pulava a fachada que confere escopo de unidade;
--   * sol_acesso_restrito ficou sem EXECUTE no nome público (a ACL foi com o rename).
--
-- Aqui: dropa o wrapper, devolve o nome à função original (corpo idêntico ao de
-- 20260905195222, conferido por md5), restaura ACL e comentário, apaga a tabela de cache
-- dele e esvazia o cache por versão, que pode ter guardado valor servido pelo cache dele.

set local lock_timeout = '10s';

do $guard$
declare
  v_md5 text;
begin
  select md5(prosrc) into v_md5
  from pg_proc
  where oid = 'public.kpis_alunos_sem_cache_20260923(uuid,integer,integer)'::regprocedure;

  if v_md5 is distinct from '6a48731cb509ee0a7e2afdde7aa431d0' then
    raise exception 'KPIS_CACHE_DUP_ORIGINAL_MUDOU: md5 % (esperado 6a48731c...)', v_md5;
  end if;

  if (select md5(prosrc) from pg_proc
      where oid = 'public.get_kpis_alunos_canonicos(uuid,integer,integer)'::regprocedure)
     is distinct from 'cf80bbc8919e384a4e60f14fc09a58c7' then
    raise exception 'KPIS_CACHE_DUP_WRAPPER_MUDOU: o wrapper foi alterado desde a auditoria';
  end if;
end;
$guard$;

drop function public.get_kpis_alunos_canonicos(uuid, integer, integer);

alter function public.kpis_alunos_sem_cache_20260923(uuid, integer, integer)
  rename to get_kpis_alunos_canonicos;

revoke all on function public.get_kpis_alunos_canonicos(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_kpis_alunos_canonicos(uuid, integer, integer)
  to authenticated, service_role, sol_acesso_restrito;

comment on function public.get_kpis_alunos_canonicos(uuid, integer, integer) is
  'Fonte canonica de alunos: alunos_pagantes permanece administrativo; ticket_denominador_pagantes publica separadamente o universo financeiro do ticket. SEM cache aqui: o cache por versao mora em get_kpis_alunos_canonicos_cache_v1 (20260923200000).';

drop table public.kpis_alunos_canonicos_cache;

truncate public.kpis_alunos_cache;

do $verify$
declare
  v_fn regprocedure := 'public.get_kpis_alunos_canonicos(uuid,integer,integer)'::regprocedure;
begin
  if (select provolatile from pg_proc where oid = v_fn) <> 's' then
    raise exception 'KPIS_CACHE_DUP_VERIFY: get_kpis_alunos_canonicos deveria ser STABLE';
  end if;
  if (select prosrc from pg_proc where oid = v_fn) ~* 'cache' then
    raise exception 'KPIS_CACHE_DUP_VERIFY: corpo ainda menciona cache';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute')
     or not has_function_privilege('sol_acesso_restrito', v_fn, 'execute') then
    raise exception 'KPIS_CACHE_DUP_VERIFY: ACL incompleta';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'KPIS_CACHE_DUP_VERIFY: anon com EXECUTE';
  end if;
  if exists (select 1 from pg_proc where proname = 'kpis_alunos_sem_cache_20260923') then
    raise exception 'KPIS_CACHE_DUP_VERIFY: nome temporario sobrou';
  end if;
  if to_regclass('public.kpis_alunos_canonicos_cache') is not null then
    raise exception 'KPIS_CACHE_DUP_VERIFY: tabela de cache duplicado sobrou';
  end if;
end;
$verify$;
