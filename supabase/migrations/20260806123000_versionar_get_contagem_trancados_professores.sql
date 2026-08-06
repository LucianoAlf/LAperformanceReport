-- Versiona a RPC complementar usada pela aba Carteira de Professores.
--
-- O corpo e a assinatura reproduzem a funcao vigente no projeto oficial
-- ouqwbbermlzqqvtqwlul, auditada em 2026-08-06. A migration elimina o drift
-- banco x repositorio sem alterar a regra de contagem.

create or replace function public.get_contagem_trancados_professores(
  p_unidade_id uuid default null
)
returns table(
  professor_id integer,
  total_trancados integer
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select
    j.professor_id,
    count(*)::integer as total_trancados
  from public.vw_jornada_professor_trancado j
  where p_unidade_id is null
     or j.unidade_id = p_unidade_id
  group by j.professor_id;
$function$;

revoke all on function public.get_contagem_trancados_professores(uuid) from public;
revoke all on function public.get_contagem_trancados_professores(uuid) from anon;
grant execute on function public.get_contagem_trancados_professores(uuid) to authenticated;
grant execute on function public.get_contagem_trancados_professores(uuid) to service_role;

comment on function public.get_contagem_trancados_professores(uuid) is
  'Contagem complementar de vinculos trancados por professor e unidade; acesso autenticado.';
