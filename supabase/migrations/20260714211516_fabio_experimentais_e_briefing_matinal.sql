-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 1) Aula experimental do dia — pra Fábio avisar sem esperar ser chamado
create or replace function public.fabio_experimentais_do_dia(p_professor_id integer, p_data date default current_date)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'hora', to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI'),
    'curso', ae.curso_nome,
    'aluno', (select a.nome from public.aula_alunos_emusys r join public.alunos a on a.id=r.aluno_id
               where r.aula_emusys_id = ae.id limit 1),
    'sala', ae.sala_nome
  ) order by ae.data_hora_inicio), '[]'::jsonb)
  from public.aulas_emusys ae
  where ae.professor_id = p_professor_id and ae.data_aula = p_data
    and ae.categoria = 'experimental' and coalesce(ae.cancelada,false) = false;
$$;
revoke all on function public.fabio_experimentais_do_dia(integer,date) from public, anon, authenticated;
grant execute on function public.fabio_experimentais_do_dia(integer,date) to service_role, fabio_agent;

-- 2) Briefing matinal: agenda do dia + resumo de 1 linha da ULTIMA aula de cada aluno
-- (o item que o Alf pediu explicitamente: "professora, suas aulas do dia, e um resuminho
-- do que foi na ultima aula — passou musica tal, ficou de praticar tal em casa")
create or replace function public.fabio_briefing_matinal(p_professor_id integer, p_data date default current_date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_nome text;
  v_res  jsonb;
begin
  select nome into v_nome from public.professores where id = p_professor_id and coalesce(ativo,true);
  if v_nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'professor_nao_encontrado');
  end if;

  select jsonb_build_object(
    'ok', true,
    'professor_id', p_professor_id,
    'primeiro_nome', split_part(btrim(v_nome), ' ', 1),
    'data', p_data,
    'aulas', coalesce((
      with slots as (
        select data_hora_inicio, data_hora_fim,
               (array_agg(id order by case when tipo='turma' then 0 else 1 end, id))[1] as aula_ancora
        from public.aulas_emusys
        where professor_id = p_professor_id and data_aula = p_data
          and coalesce(cancelada,false) = false
        group by 1,2
      )
      select jsonb_agg(jsonb_build_object(
               'hora', to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI'),
               'curso', ae.curso_nome,
               'alunos', (
                 select jsonb_agg(jsonb_build_object(
                          'nome', a.nome,
                          'primeiro_nome', split_part(btrim(a.nome),' ',1),
                          -- resumo: prioriza o progresso INDIVIDUAL da ultima aula desse aluno
                          -- com esse professor; cai pro que a turma trabalhou se nao houver
                          'resumo_ultima_aula', (
                            select left(regexp_replace(coalesce(
                                     nullif(btrim(fat.campos->>'progresso'),''),
                                     nullif(btrim(reg.campos->>'atividades'),'')
                                   ), '\s+', ' ', 'g'), 110)
                            from public.aulas_emusys ae2
                            left join public.fabio_registros_aula reg
                                   on reg.aula_id = ae2.id and reg.parent_id is null
                            left join public.fabio_registros_aula fat
                                   on fat.parent_id = reg.id and fat.aluno_id = a.id
                            where ae2.professor_id = p_professor_id
                              and ae2.data_aula < p_data
                              and coalesce(ae2.cancelada,false) = false
                              and public.fn_curso_base(ae2.curso_nome) = public.fn_curso_base(ae.curso_nome)
                              and exists (select 1 from public.aula_alunos_emusys rr
                                           where rr.aula_emusys_id = ae2.id and rr.aluno_id = a.id)
                              and (reg.id is not null)
                            order by ae2.data_aula desc
                            limit 1
                          )
                        ) order by a.nome)
                 from public.aula_alunos_emusys r join public.alunos a on a.id = r.aluno_id
                 where r.aula_emusys_id = ae.id
               )
             ) order by ae.data_hora_inicio)
      from slots s join public.aulas_emusys ae on ae.id = s.aula_ancora
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end
$function$;
revoke all on function public.fabio_briefing_matinal(integer,date) from public, anon, authenticated;
grant execute on function public.fabio_briefing_matinal(integer,date) to service_role, fabio_agent;
