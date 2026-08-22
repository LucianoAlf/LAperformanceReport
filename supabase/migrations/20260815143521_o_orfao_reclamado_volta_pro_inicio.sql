-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fn_fabio_retry_fila()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  r record;
  n integer := 0;
begin
  for r in
    select f.id
      from public.fabio_fila_audios f
     where (
             f.status in ('pendente', 'erro')
             -- Morreu em voo: o Hermes carimbou o estado intermediário e a
             -- etapa seguinte falhou sem escrever erro. Sem esta linha, fica
             -- órfã pra sempre.
             or (
               f.status in ('transcrevendo', 'transcrito')
               and f.atualizado_em < now() - interval '15 minutes'
             )
           )
       -- A experimental tem worker próprio e usa 'transcrevendo' também.
       -- Mesma fronteira de trg_fabio_fila_dispara.
       and f.vinculo_id is null
       and f.erro_tipo = 'transitorio'
       and f.status <> 'erro_terminal'
       and f.tentativas < 3
       and f.criado_em > now() - interval '3 days'
       and f.atualizado_em < now() - (least(greatest(f.tentativas, 1), 12) * interval '5 minutes')
     order by f.atualizado_em
     limit 10
  loop
    update public.fabio_fila_audios
       set tentativas = tentativas + 1,
           -- Sem isto a edge responde "ignorado" e a tentativa é queimada à
           -- toa: ela só aceita 'pendente' e 'erro'.
           status = case
                      when status in ('transcrevendo', 'transcrito') then 'pendente'
                      else status
                    end,
           atualizado_em = now()
     where id = r.id;
    perform public.fn_fabio_chama_edge(r.id);
    n := n + 1;
  end loop;
  return n;
end
$function$;

comment on function public.fn_fabio_retry_fila() is
  'Reenfileira áudio do Fábio que falhou OU morreu em voo (transcrevendo/transcrito parados >15min), devolvendo o órfão ao estado pendente — a edge só aceita pendente/erro. Só aula comum: a experimental tem worker próprio (vinculo_id).';
