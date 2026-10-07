-- 24/09/2026 — fn_novidades_na_hora: 511 chamadas/dia, media ~1s, picos de
-- 29,7s e 149 timeouts (57014) no papel authenticated. A causa e'
-- fn_novidades_limpa: para CADA item do array jsonb rodava NOT EXISTS
-- correlacionado em aulas_emusys com cast ::text no LADO DA TABELA
-- (ae.unidade_id::text = jsonb) — que anula a unique
-- aulas_emusys_emusys_id_unidade_id_key — e dentro ainda consultava
-- vw_aula_roster_operacional_v2 (join de 4 tabelas + subplanos
-- correlacionados) por item.
--
-- Reescrita set-based, mesma semantica:
--   1) extrai os pares (unidade_id, emusys_id) dos itens uma unica vez,
--      castando o lado JSON para uuid/int (indice volta a valer);
--   2) resolve o conjunto de aulas "apagadas" (cancelada + 0 alunos + sem
--      roster) num unico join — a view e' avaliada so' para candidatas;
--   3) filtra o array por membership no conjunto.

create or replace function public.fn_novidades_limpa(p_itens jsonb)
 returns jsonb
 language sql
 STABLE
 SECURITY DEFINER
 set search_path to 'public'
as $function$
  with itens as (
    select e.value, e.ordinality
      from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) with ordinality e
  ),
  alvo as (
    select distinct
           (i.value->'unidade'->>'id')::uuid as unidade_id,
           (i.value->'aula'->>'emusys_id')::integer as emusys_id
      from itens i
     where jsonb_typeof(i.value->'aula') = 'object'
       and coalesce(i.value->'aula'->>'emusys_id', '') ~ '^\d+$'
       and coalesce(i.value->'unidade'->>'id', '') ~ '^[0-9a-fA-F-]{36}$'
  ),
  apagadas as (
    select ae.unidade_id, ae.emusys_id
      from public.aulas_emusys ae
      join alvo a
        on a.unidade_id = ae.unidade_id
       and a.emusys_id = ae.emusys_id
     where coalesce(ae.cancelada, false)
       and coalesce(ae.qtd_alunos, 0) = 0
       and not exists (select 1 from public.vw_aula_roster_operacional_v2 r
                        where r.aula_emusys_id = ae.id)
  )
  select coalesce(jsonb_agg(
           case when i.value->>'motivo' ilike 'Aula ausente no Emusys%'
                then i.value || jsonb_build_object('motivo', 'A aula foi apagada no Emusys')
                else i.value end
           order by i.ordinality), '[]'::jsonb)
    from itens i
   where not exists (
           select 1 from apagadas ap
            where ap.unidade_id::text = i.value->'unidade'->>'id'
              and ap.emusys_id::text = i.value->'aula'->>'emusys_id');
$function$;

do $$
begin
  if pg_get_functiondef('public.fn_novidades_limpa(jsonb)'::regprocedure)
     ~ 'ae\.unidade_id::text = e\.value' then
    raise exception 'versao per-item ainda presente em fn_novidades_limpa';
  end if;
  raise notice 'fn_novidades_limpa set-based ok';
end $$;
