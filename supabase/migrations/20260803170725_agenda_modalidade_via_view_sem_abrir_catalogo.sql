-- Corrige o "permission denied for table emusys_disciplinas_catalogo" que a
-- migration 20260803165346 introduziu na Agenda.
--
-- Causa: get_agenda_dia e SECURITY INVOKER, entao adicionar um join passou a
-- exigir que o USUARIO tenha acesso proprio ao catalogo. O catalogo tem RLS
-- ligado, ZERO policies e nenhum grant para authenticated — de proposito.
-- A mudanca foi validada como service_role, que ignora RLS, e por isso passou.
-- E exatamente a armadilha ja registrada no CLAUDE.md para aula_alunos_emusys.
--
-- Correcao SEM destrancar o catalogo: uma view com security_invoker OFF (padrao)
-- roda com os direitos do dono e expoe apenas o par disciplina->modalidade.
-- Nao ha dado pessoal aqui: id da disciplina, unidade, nome e modalidade.

create or replace view public.vw_disciplinas_modalidade
with (security_invoker = false) as
  select
    c.unidade_id,
    c.emusys_disciplina_id,
    c.nome_emusys,
    c.modalidade
  from public.emusys_disciplinas_catalogo c;

comment on view public.vw_disciplinas_modalidade is
  'Somente disciplina -> modalidade (individual|turma), para consumo por RPC SECURITY INVOKER. security_invoker=false de proposito: evita abrir emusys_disciplinas_catalogo, que tem RLS sem policy.';

revoke all on public.vw_disciplinas_modalidade from public, anon;
grant select on public.vw_disciplinas_modalidade to authenticated, service_role;

-- Troca o join da RPC para a view. Cirurgia sobre o corpo REALMENTE deployado.
do $mig$
declare
  v_def text;
  v_ancora text;
begin
  select pg_get_functiondef('public.get_agenda_dia(date, uuid)'::regprocedure) into v_def;

  v_ancora := 'left join emusys_disciplinas_catalogo dc';
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'ancora do join nao bateu exatamente 1x';
  end if;

  execute replace(v_def, v_ancora, 'left join vw_disciplinas_modalidade dc');
end $mig$;
