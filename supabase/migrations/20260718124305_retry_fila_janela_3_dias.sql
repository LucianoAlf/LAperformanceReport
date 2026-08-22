-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fn_fabio_retry_fila()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare r record; n integer := 0;
begin
  for r in
    select id from public.fabio_fila_audios
    where status in ('pendente','erro')
      and criado_em     > now() - interval '3 days'
      and atualizado_em < now() - (least(greatest(tentativas,1),12) * interval '5 minutes')
    order by atualizado_em
    limit 10
  loop
    update public.fabio_fila_audios
       set tentativas = tentativas + 1, atualizado_em = now()
     where id = r.id;
    perform public.fn_fabio_chama_edge(r.id);
    n := n + 1;
  end loop;
  return n;
end $function$;
