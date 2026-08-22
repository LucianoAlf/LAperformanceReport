-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fabio_prontuario_aluno(
  p_aluno_id integer,
  p_professor_id integer,
  p_limite integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_base jsonb;
  v_cadastro jsonb;
begin
  if p_professor_id is null then
    raise exception 'professor_id_obrigatorio: o Fabio fala com professor e so pode ler os cursos DELE com este aluno.'
      using errcode = '42501';
  end if;

  v_base := public.fn_prontuario_aluno_interno(p_aluno_id, p_professor_id, p_limite);

  select jsonb_build_object(
           'nome',                 k.aluno_nome,
           'primeiro_nome',        split_part(btrim(k.aluno_nome), ' ', 1),
           'curso',                k.curso_nome,
           'dia_aula',             k.dia_aula,
           'horario_aula',         k.horario_aula,
           'idade',                a.idade_atual,
           'responsavel_nome',     k.responsavel_nome,
           'data_matricula',       k.data_matricula,
           'dias_desde_matricula', k.dias_desde_matricula,
           'e_aluno_novo',         k.e_aluno_novo,
           'aulas_registradas',    k.aulas_registradas
         )
    into v_cadastro
    from vw_fabio_carteira_professor k
    join alunos a on a.id = k.aluno_id
   where k.aluno_id = p_aluno_id
     and k.professor_id = p_professor_id
   limit 1;

  return v_base || jsonb_build_object('cadastro', coalesce(v_cadastro, '{}'::jsonb));
end
$function$;

comment on function public.fabio_prontuario_aluno(integer, integer, integer) is
'Prontuario do aluno para o professor. Desde a 026 inclui o bloco `cadastro` (quem e, desde quando, quantas aulas registradas) alem da linha do tempo.';
