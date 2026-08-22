-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- PEDIDO DO MATHEUS (13/07, audios): ele quer, saindo da AGENDA, ver "o que eu dei nessa turma"
-- sem ter que ir aluno por aluno. A separacao que ele descreveu ja existe no schema:
--   TRONCO (turma toda)  -> objetivo, atividades, dever_casa, repertorio, materiais, obs_gerais
--   FATIA (por aluno)    -> progresso, proximo_passo, observacao
-- Hoje so a fatia (dentro de cada aula individual do aluno) fica navegavel. O tronco nunca
-- vira historico proprio por turma ao longo do tempo. Esta RPC resolve isso.
--
-- Chave de agrupamento: turma_nome e ESTAVEL semana a semana (confirmado: T_Qui_18 tem uma
-- sessao por semana, mesmo codigo, ha 2+ meses).
create or replace function public.app_historico_turma(p_turma_nome text, p_limite integer default 15)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_res  jsonb;
begin
  if v_prof is null then raise exception 'sem_professor_vinculado' using errcode='42501'; end if;

  -- so turmas DO PROPRIO professor (nunca vazar turma de outro)
  if not exists (select 1 from public.aulas_emusys ae
                  where ae.turma_nome = p_turma_nome and ae.professor_id = v_prof) then
    raise exception 'turma_nao_encontrada_ou_nao_e_sua' using errcode='42501';
  end if;

  select jsonb_build_object(
    'turma_nome', p_turma_nome,
    'curso', (select ae.curso_nome from public.aulas_emusys ae
               where ae.turma_nome=p_turma_nome and ae.professor_id=v_prof
               order by ae.data_aula desc limit 1),
    'alunos_atuais', coalesce((
      select jsonb_agg(distinct a.nome order by a.nome)
      from public.aulas_emusys ae
      join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
      join public.alunos a on a.id = r.aluno_id
      where ae.turma_nome = p_turma_nome and ae.professor_id = v_prof
        and ae.data_aula >= now()::date - 14
    ), '[]'::jsonb),
    'sessoes', coalesce((
      select jsonb_agg(t.x order by t.data_aula desc)
      from (
        select jsonb_build_object(
                 'data', ae.data_aula,
                 'objetivo',    nullif(btrim(coalesce(reg.campos->>'objetivo','')),''),
                 'conteudo',    nullif(btrim(coalesce(reg.campos->>'atividades','')),''),
                 'repertorio',  nullif(btrim(coalesce(reg.campos->>'repertorio','')),''),
                 'dever_casa',  nullif(btrim(coalesce(reg.campos->>'dever_casa','')),''),
                 'origem',      case when reg.id is not null then 'fabio' else 'emusys' end,
                 -- fallback pro legado do Emusys quando nao ha registro estruturado do Fabio
                 'texto_legado', case when reg.id is null
                                      then nullif(btrim(coalesce(ae.anotacoes,'')),'') end
               ) as x,
               ae.data_aula
        from public.aulas_emusys ae
        left join public.fabio_registros_aula reg
               on reg.aula_id = ae.id and reg.parent_id is null
        where ae.turma_nome = p_turma_nome and ae.professor_id = v_prof
          and coalesce(ae.cancelada,false) = false
          and (reg.id is not null or nullif(btrim(coalesce(ae.anotacoes,'')),'') is not null)
        order by ae.data_aula desc
        limit greatest(coalesce(p_limite,15),1)
      ) t
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end
$function$;

revoke all on function public.app_historico_turma(text,integer) from public, anon;
grant execute on function public.app_historico_turma(text,integer) to authenticated;
