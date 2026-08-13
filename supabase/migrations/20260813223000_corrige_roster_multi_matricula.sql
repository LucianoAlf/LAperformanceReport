-- Correcao do roster (aula_alunos_emusys) para multi-matricula (2026-08-13).
--
-- O aluno_id do roster era gravado pelo mesmo matcher instavel do sync de
-- presenca (fallback por nome). Para dias PASSADOS o sync nao reprocessa, e o
-- roster continuava apontando para a matricula errada da pessoa — a Chamada
-- da Agenda ainda mostrava 2 cards (presenca ja corrigida num aluno_id +
-- roster apontando para outro). Ex.: Vinicius Lopa (3 Power Kids) com roster
-- da aula de Contrabaixo apontando para a matricula de Power Kids.
--
-- Re-aponta o aluno_id quando UMA das camadas fortes resolve (mesma regra da
-- edge/trigger e da limpeza de presencas):
--   1. contrato da aula (matricula_disciplina_id -> jornada);
--   2. dia/horario da aula contra a grade da jornada (linha container).
-- Sem resolucao forte, o vinculo fica como esta (o sync/trigger corrigem as
-- aulas recentes daqui em diante).

begin;

create temp table tmp_roster on commit drop as
select aa.aula_emusys_id, aa.unidade_id, aa.aluno_emusys_id as emusys_student_id, aa.aluno_id as aluno_atual
from aula_alunos_emusys aa
where aa.aluno_emusys_id is not null and aa.aluno_id is not null;

create temp table tmp_roster_contrato on commit drop as
select r.aula_emusys_id, r.emusys_student_id, j.aluno_id as aluno_id_canonico
from tmp_roster r
join aulas_emusys ae on ae.id = r.aula_emusys_id
join aluno_jornada_matricula_disciplina j
  on j.unidade_id = ae.unidade_id
 and j.emusys_matricula_disciplina_id = ae.matricula_disciplina_id
where ae.matricula_disciplina_id > 0
  and j.status_matricula is distinct from 'finalizada';

create temp table tmp_roster_horario on commit drop as
select r.aula_emusys_id, r.emusys_student_id, min(c.aluno_id) as aluno_id_canonico
from tmp_roster r
left join tmp_roster_contrato cc
  on cc.aula_emusys_id = r.aula_emusys_id and cc.emusys_student_id = r.emusys_student_id
join aulas_emusys ae on ae.id = r.aula_emusys_id
join lateral (
  select a.id as aluno_id
  from alunos a
  join aluno_jornada_matricula_disciplina j
    on j.aluno_id = a.id and j.unidade_id = r.unidade_id
   and j.status_matricula is distinct from 'finalizada'
  where a.emusys_student_id = r.emusys_student_id::text
    and a.unidade_id = r.unidade_id
    and j.dia_semana is not null and j.horario is not null
    and lower(unaccent(split_part(j.dia_semana, '-', 1))) =
        (case extract(isodow from (coalesce(ae.data_hora_inicio_original, ae.data_hora_inicio) at time zone 'America/Sao_Paulo'))
           when 1 then 'segunda' when 2 then 'terca' when 3 then 'quarta'
           when 4 then 'quinta' when 5 then 'sexta' when 6 then 'sabado'
           else 'domingo' end)
    and left(j.horario::text, 5) =
        to_char((coalesce(ae.data_hora_inicio_original, ae.data_hora_inicio) at time zone 'America/Sao_Paulo'), 'HH24:MI')
  group by a.id
) c on true
where cc.aula_emusys_id is null
group by r.aula_emusys_id, r.emusys_student_id
having count(distinct c.aluno_id) = 1;

update aula_alunos_emusys aa
set aluno_id = coalesce(cc.aluno_id_canonico, ch.aluno_id_canonico),
    sincronizado_em = now()
from tmp_roster r
left join tmp_roster_contrato cc
  on cc.aula_emusys_id = r.aula_emusys_id and cc.emusys_student_id = r.emusys_student_id
left join tmp_roster_horario ch
  on ch.aula_emusys_id = r.aula_emusys_id and ch.emusys_student_id = r.emusys_student_id
where aa.aula_emusys_id = r.aula_emusys_id
  and aa.aluno_emusys_id = r.emusys_student_id
  and coalesce(cc.aluno_id_canonico, ch.aluno_id_canonico) is not null
  and aa.aluno_id is distinct from coalesce(cc.aluno_id_canonico, ch.aluno_id_canonico);

commit;
