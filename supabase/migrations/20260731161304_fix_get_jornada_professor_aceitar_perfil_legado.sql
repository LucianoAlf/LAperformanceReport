-- A carteira do professor voltava vazia para todo usuario de perfil legado
-- ('unidade'/'professor'), porque o gate so aceitava o RBAC granular e a tabela
-- `usuario_perfis` nunca foi populada (0 linhas). Somente 'admin' passava, pelo
-- bypass legado dentro de `usuario_tem_permissao`. Falha silenciosa: a RPC
-- devolvia lista vazia, sem erro e sem 403.
--
-- Soma o caminho legado, com escopo por unidade, sem remover o RBAC -- que segue
-- valendo assim que `usuario_perfis` for populada.
--
-- Validado por simulacao de JWT: usuario de perfil 'unidade' da Barra passa a ver
-- os 42 alunos do professor da propria unidade e continua sem ver Campo Grande
-- (0) e Recreio (0).
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
      or exists (
        select 1
        from public.usuarios u
        where u.auth_user_id = auth.uid()
          and coalesce(u.ativo, true)
          and (
            u.perfil = 'admin'
            or (u.perfil = 'unidade' and u.unidade_id = j.unidade_id)
          )
      )
    )
  order by j.aluno_nome, j.curso_nome;
$function$;
