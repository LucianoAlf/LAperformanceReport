-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_coordenacao_em_aberto(
  p_dias       int  default 7,
  p_unidade_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_saida jsonb;
begin
  if not public.fn_e_coordenacao_la_teacher() then
    raise exception 'apenas_admin';
  end if;

  with pend as (
    select professor_id, professor_nome, unidade_nome, curso_nome,
           aula_id, aluno_id, data_aula, dias_em_atraso
      from public.vw_presenca_pendencia
     where data_aula >= current_date - p_dias
       and data_aula <  current_date
       and (p_unidade_id is null or unidade_id = p_unidade_id)
  ),
  por_professor as (
    select professor_id,
           min(professor_nome)            as professor_nome,
           count(distinct aula_id)::int   as aulas,
           count(distinct aluno_id)::int  as alunos,
           max(dias_em_atraso)::int       as pior_atraso,
           (select string_agg(distinct u.unidade_nome, ', ' order by u.unidade_nome)
              from pend u where u.professor_id = p.professor_id) as unidades,
           (select string_agg(distinct c.curso_nome, ', ' order by c.curso_nome)
              from pend c where c.professor_id = p.professor_id
                            and c.curso_nome is not null) as cursos
      from pend p
     group by professor_id
  )
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'sem_lancamento',     (select count(distinct aula_id) from pend),
      'professores',        (select count(distinct professor_id) from pend),
      'ontem',              (select count(distinct aula_id) from pend
                              where data_aula = current_date - 1),
      'professores_ativos', (select count(*) from public.professores where ativo)
    ),
    'professores', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'professor_id',   p.professor_id,
                 'professor_nome', p.professor_nome,
                 'foto_url',       pr.foto_url,
                 'unidades',       p.unidades,
                 'cursos',         p.cursos,
                 'aulas',          p.aulas,
                 'alunos',         p.alunos,
                 'pior_atraso',    p.pior_atraso)
               order by p.aulas desc, p.pior_atraso desc, p.professor_nome)
        from por_professor p
        join public.professores pr on pr.id = p.professor_id
    ), '[]'::jsonb)
  ) into v_saida;

  return v_saida;
end;
$function$;

revoke all on function public.app_coordenacao_em_aberto(int, uuid) from public;
revoke all on function public.app_coordenacao_em_aberto(int, uuid) from anon;
grant execute on function public.app_coordenacao_em_aberto(int, uuid) to authenticated;

comment on function public.app_coordenacao_em_aberto(int, uuid) is
  'Bloco 1 do painel da coordenacao: quem esta com lancamento em aberto, '
  'UMA linha por professor, contando AULAS (nao pares aluno-aula). '
  'Fonte unica: vw_presenca_pendencia (013). Supera a 067.';

create or replace function public.app_coordenacao_professor_detalhe(
  p_professor_id int,
  p_dias         int default 7
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_saida jsonb;
begin
  if not public.fn_e_coordenacao_la_teacher() then
    raise exception 'apenas_admin';
  end if;

  with pend as (
    select aula_id, data_aula, hora, curso_nome, turma_nome, unidade_nome,
           aluno_id, aluno_primeiro_nome, dias_em_atraso, professor_nome
      from public.vw_presenca_pendencia
     where professor_id = p_professor_id
       and data_aula >= current_date - p_dias
       and data_aula <  current_date
  ),
  por_aula as (
    select aula_id,
           min(data_aula)            as data_aula,
           min(hora::text)           as hora,
           min(curso_nome)           as curso_nome,
           min(turma_nome)           as turma_nome,
           min(unidade_nome)         as unidade_nome,
           max(dias_em_atraso)::int  as dias_em_atraso,
           count(distinct aluno_id)::int as alunos,
           string_agg(distinct aluno_primeiro_nome, ', '
                      order by aluno_primeiro_nome) as alunos_nomes
      from pend
     group by aula_id
  ),
  por_dia as (
    select data_aula,
           max(dias_em_atraso)::int as dias_em_atraso,
           count(*)::int            as aulas,
           jsonb_agg(jsonb_build_object(
             'aula_id',      aula_id,
             'hora',         hora,
             'curso_nome',   curso_nome,
             'turma_nome',   turma_nome,
             'unidade_nome', unidade_nome,
             'alunos',       alunos,
             'alunos_nomes', alunos_nomes)
             order by hora, curso_nome) as itens
      from por_aula
     group by data_aula
  )
  select jsonb_build_object(
    'professor_id',   p_professor_id,
    'professor_nome', (select min(professor_nome) from pend),
    'aulas',          (select count(*) from por_aula),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data_aula',      data_aula,
               'dias_em_atraso', dias_em_atraso,
               'aulas',          aulas,
               'itens',          itens)
             order by data_aula)
        from por_dia
    ), '[]'::jsonb)
  ) into v_saida;

  return v_saida;
end;
$function$;

revoke all on function public.app_coordenacao_professor_detalhe(int, int) from public;
revoke all on function public.app_coordenacao_professor_detalhe(int, int) from anon;
grant execute on function public.app_coordenacao_professor_detalhe(int, int) to authenticated;

comment on function public.app_coordenacao_professor_detalhe(int, int) is
  'Detalhe da linha do painel: quais aulas do professor estao sem lancamento, '
  'agrupadas por dia (mais antigo primeiro). Fonte: vw_presenca_pendencia.';
