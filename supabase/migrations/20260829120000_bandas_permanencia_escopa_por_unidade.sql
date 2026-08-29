-- =============================================================================
-- banda_permanencia_meses passa a escopar a pessoa por (unidade_id, emusys_student_id).
--
-- CAUSA
-- `emusys_student_id` é numerado POR UNIDADE e não é único na rede. Medido em 29/08/2026:
-- 91 ids são compartilhados por pessoas diferentes e **zero** deles tem o mesmo nome —
-- ou seja, 100% são colisão, não transferência (a base inteira tem 3 transferências
-- registradas, nenhuma nesses casos). A função agrupava só pelo id, então fundia pessoas
-- distintas e dava a todas a matrícula mais antiga.
--
-- EFEITO (7 dos 106 alunos em banda herdavam tempo de um estranho)
--   Helena de Souza Lima da Silva (REC)  62 -> 5   (herdava de Miguel Silva Roca / CG)
--   Miguel Bolais de Salles (REC)        67 -> 27  (herdava de Alexandre Ayres Filho / CG)
--   Caio Vinicius Vieira de Castro (REC) 66 -> 26
--   Luca Pessurno R. Torres (REC)        63 -> 25
--   Clara Paes Leme Ghanem (Barra)       48 -> 9
-- Média da rede: 37,2 -> 35,0. Barra 30,9 -> 27,3 · CG 39,8 (sem colisão) · REC 37,2 -> 34,0.
-- O número certo é o mais baixo.
--
-- ESCOPO VERIFICADO ANTES DE APLICAR — por que isto é fix de uma linha e não assunto sério:
--   1. Esta é a ÚNICA função do banco que usa a chave de pessoa SEM unidade. As outras 5
--      que usam `emusys_student_id` já filtram por unidade.
--   2. A carteira do professor foi testada nos 2 únicos casos reais que a alcançam
--      (Israel Rocha / id 1489 e Larissa Bheattriz / id 915, ambos com alunos de unidades
--      diferentes sob o mesmo id) e PRESERVA os dois alunos — não funde. Israel: 27 na
--      carteira canônica contra 27 linhas cruas.
--   3. O pilar "permanência" do Health Score v3 do professor NÃO usa tempo de casa
--      (`get_health_score_professor_v3_permanencia_periodo_v2` mede retenção). Nenhuma das
--      ~100 funções `health_score_professor_v3` lê `tempo_permanencia_meses`.
--   Conclusão: a colisão não chega ao Professor+LA.
--
-- ⚠️ Chave certa = (unidade_id, emusys_student_id), como manda a skill do domínio do aluno:
-- id Emusys só é válido junto com unidade_id.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.banda_permanencia_meses(p_aluno_id integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with alvo as (
    select al.unidade_id,
           coalesce(nullif(al.emusys_student_id,''),'id:'||al.id::text) as chave
    from public.alunos al
    where al.id = p_aluno_id
  )
  select round((current_date - min(a2.data_matricula))::numeric / 30.44)::int
  from public.alunos a2
  join alvo on a2.unidade_id = alvo.unidade_id
  where a2.data_matricula is not null
    and coalesce(nullif(a2.emusys_student_id,''),'id:'||a2.id::text) = alvo.chave
$function$;

-- Recriar função reabre EXECUTE para anon neste schema (ALTER DEFAULT PRIVILEGES).
revoke execute on function public.banda_permanencia_meses(integer) from public;
revoke execute on function public.banda_permanencia_meses(integer) from anon;
grant execute on function public.banda_permanencia_meses(integer) to authenticated;
grant execute on function public.banda_permanencia_meses(integer) to service_role;

do $$
declare v_acl text;
begin
  select array_to_string(coalesce(proacl,'{}'),',') into v_acl
  from pg_proc where pronamespace='public'::regnamespace and proname='banda_permanencia_meses';
  if v_acl ~ '(^|,)(anon|)=' then
    raise exception 'ACL de banda_permanencia_meses com anon/PUBLIC: %', v_acl;
  end if;
end $$;
