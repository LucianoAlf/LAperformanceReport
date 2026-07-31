-- A tela de carteira do professor e gateada pela permissao dedicada
-- `professores.carteira`, nao por `professores.editar` (que e de escrita).
-- Correcao semantica; sozinha nao muda comportamento, porque `usuario_perfis`
-- esta vazia e nenhum perfil possui qualquer das duas permissoes.
CREATE OR REPLACE FUNCTION public.get_jornada_professor(p_professor_id integer)
 RETURNS SETOF vw_jornada_professor_atual
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select j.*
  from public.vw_jornada_professor_atual j
  where j.professor_id = p_professor_id
    and (
      coalesce(auth.role(), '') = 'service_role'
      or public.fn_professor_do_usuario() = p_professor_id
      or public.fn_usuario_atual_tem_permissao('professores.carteira', j.unidade_id)
    )
  order by j.aluno_nome, j.curso_nome;
$function$;
