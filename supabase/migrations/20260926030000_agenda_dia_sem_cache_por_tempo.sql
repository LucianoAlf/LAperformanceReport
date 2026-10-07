-- A Agenda (e a Chamada, que le por ela) guardava o dia por 5 MINUTOS POR TEMPO em
-- paginas_rpc_cache (20260924). Nada invalidava a foto quando alguem marcava presenca: a
-- escrita gravava, a Chamada relia e recebia a foto velha -- "a presenca nao aparece".
-- Relatado pelo Arthur em 24/09 ~19h40. Viola a regra da LAPE-42: presenca so usa cache
-- por VERSAO, ou nenhum.
--
-- Socorro: a funcao publica volta a ler direto do leitor interno (medido: 0,4 s quente,
-- 1,8 s frio, Consolidado) e as fotos guardadas sao apagadas. Mesma assinatura, mesma
-- guarda de papel, mesmos SET, mesma ACL (create or replace preserva). Cache por versao
-- (invalidado pela propria escrita) e frente separada.

set local lock_timeout = '10s';

create or replace function public.get_agenda_dia_v2(p_data date, p_unidade_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
 set statement_timeout to '60s'
as $function$
begin
  -- Guarda minima: bloqueia so PostgREST-anon (igual a versao com cache).
  if session_user::text in ('anon', 'authenticated')
     and coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel nao autorizado' using errcode = '42501';
  end if;

  return public.get_agenda_dia_v2_sem_cache_20260924(p_data, p_unidade_id);
end;
$function$;

delete from public.paginas_rpc_cache where funcao = 'agenda_dia_v2';

do $verifica$
declare
  v_fn constant regprocedure := 'public.get_agenda_dia_v2(date,uuid)';
  v_def text := pg_get_functiondef(v_fn);
begin
  if v_def ~ 'paginas_rpc_cache' then
    raise exception 'AGENDA_SEM_CACHE_VERIFY: ainda le cache';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'AGENDA_SEM_CACHE_VERIFY: anon ganhou execute';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'AGENDA_SEM_CACHE_VERIFY: authenticated perdeu execute';
  end if;
end;
$verifica$;
