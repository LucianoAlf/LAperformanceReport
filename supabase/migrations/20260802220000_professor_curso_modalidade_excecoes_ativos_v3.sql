begin;

create or replace function public.get_professor_curso_modalidade_excecoes_v3(
  p_unidade_id uuid default null,
  p_professor_id integer default null,
  p_incluir_auditoria boolean default false
)
returns table (
  excecao_id text,
  tipo text,
  acionavel boolean,
  unidade_id uuid,
  unidade_nome text,
  professor_id integer,
  professor_nome text,
  emusys_professor_id integer,
  curso_id integer,
  curso_nome text,
  emusys_disciplina_id integer,
  disciplina_nome text,
  modalidade text,
  motivo text,
  sugestao text,
  estado text,
  evidencias jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    excecao.excecao_id,
    excecao.tipo,
    excecao.acionavel,
    excecao.unidade_id,
    excecao.unidade_nome,
    excecao.professor_id,
    excecao.professor_nome,
    excecao.emusys_professor_id,
    excecao.curso_id,
    excecao.curso_nome,
    excecao.emusys_disciplina_id,
    excecao.disciplina_nome,
    excecao.modalidade,
    excecao.motivo,
    excecao.sugestao,
    excecao.estado,
    excecao.evidencias
  from public.get_professor_curso_modalidade_excecoes_v2(
    p_unidade_id,
    p_professor_id,
    p_incluir_auditoria
  ) excecao
  left join public.professores professor
    on professor.id = excecao.professor_id
  where excecao.professor_id is null
     or professor.ativo is true;
$function$;

revoke all on function public.get_professor_curso_modalidade_excecoes_v3(
  uuid,
  integer,
  boolean
) from public, anon;

grant execute on function public.get_professor_curso_modalidade_excecoes_v3(
  uuid,
  integer,
  boolean
) to authenticated, service_role;

comment on function public.get_professor_curso_modalidade_excecoes_v3(uuid, integer, boolean) is
  'Fila operacional canonica V3. Preserva as validacoes da V2 e remove identidades de professores globalmente inativos.';

commit;
