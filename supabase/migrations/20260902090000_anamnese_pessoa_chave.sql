-- LAPE-19 — a anamnese passa a pertencer a PESSOA, nao a matricula.
-- Spec:  docs/superpowers/specs/2026-09-01-anamnese-por-pessoa-design.md
-- Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 1)
--
-- POR QUE: `anamneses.aluno_id` referencia `alunos.id`, que e MATRICULA (uma linha
-- por curso). Quem faz 2+ cursos aparece como "Anamnese nao preenchida" nos demais
-- e seria levado a responder o mesmo formulario de novo. Medido em 01/09/2026:
-- 145 pessoas com 2+ matriculas ativas, 18 delas ja preencheram e aparecem sem
-- anamnese em outra linha.
--
-- O formulario, alias, nao pergunta NADA por curso: "Nivel de habilidade no
-- instrumento" nunca diz qual instrumento, e o app do convite nem sabe de qual
-- matricula se trata. O que e por curso e so o vinculo no banco.
--
-- IDENTIDADE: o par (unidade_id, pessoa_chave). `emusys_student_id` SOZINHO nao
-- identifica pessoa -- medido: 91 ids aparecem em 2+ unidades e os 91 tem NOMES
-- DIFERENTES. E colisao entre bases separadas do Emusys, nao a mesma pessoa.

create or replace view public.vw_aluno_pessoa_chave as
select
  a.id as aluno_id,
  a.unidade_id,
  case
    when nullif(btrim(a.emusys_student_id), '') is not null
      then 'emusys:' || btrim(a.emusys_student_id)
    else 'local:' || a.id::text
  end as pessoa_chave
from public.alunos a;

-- ALTER DEFAULT PRIVILEGES deste schema da authenticated=arwdDxtm a toda relacao
-- nova, e view simples e auto-atualizavel: sem o revoke, qualquer autenticado
-- escreveria em `alunos` por aqui.
revoke all on public.vw_aluno_pessoa_chave from public, anon, authenticated;
grant select on public.vw_aluno_pessoa_chave to authenticated, service_role;

comment on view public.vw_aluno_pessoa_chave is
  'Fonte unica da identidade de pessoa. Comparar SEMPRE junto com unidade_id: '
  '91 emusys_student_id se repetem entre unidades com nomes diferentes.';

create or replace function public.fn_pessoa_chave_aluno(p_aluno_id integer)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.pessoa_chave from public.vw_aluno_pessoa_chave v where v.aluno_id = p_aluno_id;
$function$;

revoke execute on function public.fn_pessoa_chave_aluno(integer) from public;
revoke execute on function public.fn_pessoa_chave_aluno(integer) from anon;
grant execute on function public.fn_pessoa_chave_aluno(integer) to authenticated, service_role;

alter table public.anamneses add column if not exists pessoa_chave text;

comment on column public.anamneses.aluno_id is
  'Matricula onde a anamnese foi respondida (PROCEDENCIA). Nao e o dono do dado: '
  'a anamnese pertence a pessoa, identificada por (unidade_id, pessoa_chave).';

comment on column public.anamneses.pessoa_chave is
  'Derivada de aluno_id pelo trigger trg_anamnese_pessoa_chave. Nunca escrever a mao.';

create or replace function public.fn_anamnese_define_pessoa_chave()
returns trigger
language plpgsql
as $function$
begin
  new.pessoa_chave := case
    when new.aluno_id is null then null
    else public.fn_pessoa_chave_aluno(new.aluno_id)
  end;
  return new;
end;
$function$;

drop trigger if exists trg_anamnese_pessoa_chave on public.anamneses;
create trigger trg_anamnese_pessoa_chave
  before insert or update of aluno_id on public.anamneses
  for each row execute function public.fn_anamnese_define_pessoa_chave();

-- Backfill das 219 linhas existentes. As 6 com vinculo_status='pendente' nao tem
-- aluno_id e ficam com pessoa_chave nula de proposito -- ainda esperam alguem
-- dizer de quem sao.
update public.anamneses an
   set pessoa_chave = v.pessoa_chave
  from public.vw_aluno_pessoa_chave v
 where v.aluno_id = an.aluno_id
   and an.pessoa_chave is distinct from v.pessoa_chave;

create index if not exists idx_anamneses_pessoa
  on public.anamneses (unidade_id, pessoa_chave)
  where pessoa_chave is not null;
