-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- BUG PEGO NO TESTE AO VIVO (14/07): o Fabio, no chat, perguntou "qual seu nome/unidade?"
-- pro proprio Matheus — sendo que professor_id ja esta na linha da mensagem que ele leu.
-- Causa: app_minha_agenda_sessao/app_minha_carteira dependem de fn_professor_do_usuario()
-- (auth.uid()), que so existe com sessao real. O Fabio roda como service_role, sem sessao —
-- por isso nao conseguia se situar sozinho.
--
-- Esta RPC e o PAR service_role dessas duas: mesmo dado, mas parametrizado direto por
-- professor_id (nunca por auth.uid()). NUNCA conceder a authenticated/anon — um professor
-- poderia ler a agenda de outro so trocando o id.
create or replace function public.fabio_contexto_professor(
  p_professor_id integer,
  p_data date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
    'nome', v_nome,
    'primeiro_nome', split_part(btrim(v_nome), ' ', 1),
    'unidades', coalesce((
      select jsonb_agg(distinct u.nome)
      from public.vw_jornada_professor_atual v
      join public.aulas_emusys ae on ae.professor_id = v.professor_id
      join public.unidades u on u.id = ae.unidade_id
      where v.professor_id = p_professor_id
    ), '[]'::jsonb),
    'total_alunos_carteira', (
      select count(distinct v.aluno_id)
      from public.vw_jornada_professor_atual v
      where v.professor_id = p_professor_id
    ),
    'hoje', jsonb_build_object(
      'data', p_data,
      'total_aulas', (
        select count(distinct (ae.data_hora_inicio, ae.data_hora_fim))
        from public.aulas_emusys ae
        where ae.professor_id = p_professor_id and ae.data_aula = p_data
          and coalesce(ae.cancelada,false) = false
      ),
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
                 'alunos', (select jsonb_agg(a.nome order by a.nome)
                              from public.aula_alunos_emusys r
                              join public.alunos a on a.id = r.aluno_id
                             where r.aula_emusys_id = ae.id),
                 'chamada_feita', exists(select 1 from public.aluno_presenca ap where ap.aula_emusys_id = ae.id)
               ) order by ae.data_hora_inicio)
        from slots s join public.aulas_emusys ae on ae.id = s.aula_ancora
      ), '[]'::jsonb)
    ),
    'pendencias_cobraveis', (
      select coalesce((public.fn_pendencias_do_professor(p_professor_id, false))->>'total_alunos','0')::int
    )
  ) into v_res;

  return v_res;
end
$function$;

-- SO service_role. Isto e identidade sem sessao — nunca pode chegar num professor comum.
revoke all on function public.fabio_contexto_professor(integer,date) from public, anon, authenticated;
grant execute on function public.fabio_contexto_professor(integer,date) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname='fabio_agent') then
    execute 'grant execute on function public.fabio_contexto_professor(integer,date) to fabio_agent';
  end if;
end $$;

comment on function public.fabio_contexto_professor(integer,date) is
  'Identidade + agenda do professor, resolvida DIRETO por professor_id (sem sessao). E o par do fn_professor_do_usuario() para quando quem chama e o Fabio via service_role, nao o proprio professor logado. NUNCA expor a authenticated.';
