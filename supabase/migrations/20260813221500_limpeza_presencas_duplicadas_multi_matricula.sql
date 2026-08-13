-- Limpeza das presencas duplicadas por multi-matricula (2026-08-13).
--
-- O sync de presenca antigo resolvia a pessoa para um aluno_id instavel entre
-- execucoes (fallback por nome, "ultimo vence"). Como o unique de
-- aluno_presenca e (aluno_id, aula_emusys_id), cada resolucao diferente
-- ADICIONAVA uma linha: a mesma pessoa ficou com 2-3 presencas na mesma aula
-- (medido: 4.990 grupos, 10.269 linhas). A Agenda (Chamadas) deduplica por
-- aluno_id, entao o mesmo aluno aparecia 2-3x no mesmo card de turma.
--
-- Esta migration deduplica mantendo UMA linha por (aula, pessoa), no
-- aluno_id CANONICO, resolvido em 3 camadas:
--   1. contrato da aula (matricula_disciplina_id -> jornada);
--   2. dia/horario da aula contra a grade da jornada (linhas container);
--   3. regra deterministica antiga (curso -> ativo -> menor id).
--
-- Preserva resposta humana: a linha sobrevivente prioriza respondido_por <>
-- 'emusys' e, quando o sobrevivente e evidencia pura do sync, herda o status
-- da linha humana antes da exclusao (nenhum grupo tinha 2 linhas humanas).
-- FKs para aluno_presenca sao ON DELETE SET NULL; linhas com retificacao sao
-- priorizadas como sobreviventes, mantendo a retificacao vinculada.

begin;

-- (1) grupos duplicados: mesma aula + mesma pessoa (emusys_student_id) com
--     mais de um aluno_id em aluno_presenca.
create temp table tmp_grupos on commit drop as
select ap.aula_emusys_id, ae.unidade_id, a.emusys_student_id,
       array_agg(distinct ap.aluno_id) as aluno_ids
from aluno_presenca ap
join aulas_emusys ae on ae.id = ap.aula_emusys_id
join alunos a on a.id = ap.aluno_id
where a.emusys_student_id is not null
group by 1,2,3
having count(distinct ap.aluno_id) > 1;

-- (2) camada 1: contrato da aula.
create temp table tmp_canonico_contrato on commit drop as
select g.aula_emusys_id, g.emusys_student_id, j.aluno_id as aluno_id_canonico
from tmp_grupos g
join aulas_emusys ae on ae.id = g.aula_emusys_id
join aluno_jornada_matricula_disciplina j
  on j.unidade_id = ae.unidade_id
 and j.emusys_matricula_disciplina_id = ae.matricula_disciplina_id
where ae.matricula_disciplina_id > 0
  and j.status_matricula is distinct from 'finalizada';

-- (3) camada 2: dia/horario da aula contra a grade da jornada (so grupos sem
--     resolucao por contrato; exige exatamente 1 candidato). Busca entre
--     TODAS as matriculas da pessoa (mesma regra da edge/trigger), porque o
--     aluno canonico pode nao ter presenca na linha container (a presenca
--     dele foi gravada na linha do contrato, nao no container).
create temp table tmp_canonico_horario on commit drop as
select g.aula_emusys_id, g.emusys_student_id,
       min(c.aluno_id) as aluno_id_canonico
from tmp_grupos g
left join tmp_canonico_contrato cc
  on cc.aula_emusys_id = g.aula_emusys_id and cc.emusys_student_id = g.emusys_student_id
join aulas_emusys ae on ae.id = g.aula_emusys_id
join lateral (
  select a.id as aluno_id
  from alunos a
  join aluno_jornada_matricula_disciplina j
    on j.aluno_id = a.id and j.unidade_id = g.unidade_id
   and j.status_matricula is distinct from 'finalizada'
  where a.emusys_student_id = g.emusys_student_id
    and a.unidade_id = g.unidade_id
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
group by g.aula_emusys_id, g.emusys_student_id
having count(distinct c.aluno_id) = 1;

-- (4) camada 3: regra deterministica antiga (curso da aula -> ativo ->
--     nao-segundo-curso -> menor id). Cobre aulas antigas cuja jornada ja
--     esta finalizada (contratos encerrados) ou sem dia/horario na jornada.
create temp table tmp_canonico_fraco on commit drop as
select distinct on (g.aula_emusys_id, g.emusys_student_id)
       g.aula_emusys_id, g.emusys_student_id, a.id as aluno_id_canonico
from tmp_grupos g
join aulas_emusys ae on ae.id = g.aula_emusys_id
join alunos a on a.id = any(g.aluno_ids)
left join cursos c on c.id = a.curso_id
order by g.aula_emusys_id, g.emusys_student_id,
         (ae.curso_emusys_id is not null and c.emusys_ids @> array[ae.curso_emusys_id]) desc,
         (a.status = 'ativo') desc,
         coalesce(a.is_segundo_curso, false) asc,
         a.id;

-- (5) canonico final por grupo.
create temp table tmp_canonico on commit drop as
select g.aula_emusys_id, g.emusys_student_id,
       coalesce(cc.aluno_id_canonico, ch.aluno_id_canonico, cf.aluno_id_canonico) as aluno_id_canonico
from tmp_grupos g
left join tmp_canonico_contrato cc
  on cc.aula_emusys_id = g.aula_emusys_id and cc.emusys_student_id = g.emusys_student_id
left join tmp_canonico_horario ch
  on ch.aula_emusys_id = g.aula_emusys_id and ch.emusys_student_id = g.emusys_student_id
left join tmp_canonico_fraco cf
  on cf.aula_emusys_id = g.aula_emusys_id and cf.emusys_student_id = g.emusys_student_id;

-- (6) linha sobrevivente por grupo: resposta humana > tem retificacao > e
--     espelhada por outra linha > criada por ultimo > maior id.
create temp table tmp_sobreviventes on commit drop as
select distinct on (ap.aula_emusys_id, a.emusys_student_id)
       ap.id as presenca_id,
       ap.aula_emusys_id,
       a.emusys_student_id
from aluno_presenca ap
join alunos a on a.id = ap.aluno_id
join tmp_grupos g
  on g.aula_emusys_id = ap.aula_emusys_id and g.emusys_student_id = a.emusys_student_id
order by ap.aula_emusys_id, a.emusys_student_id,
         (ap.respondido_por is distinct from 'emusys') desc,
         exists (select 1 from aluno_presenca_retificacoes r where r.aluno_presenca_id = ap.id) desc,
         exists (select 1 from aluno_presenca e where e.espelhado_de_presenca_id = ap.id) desc,
         ap.created_at desc nulls last,
         ap.id desc;

-- (7) herda a resposta humana quando o sobrevivente e evidencia pura do sync.
update aluno_presenca ap
set status_presenca = h.status_presenca,
    respondido_por = h.respondido_por
from tmp_sobreviventes s
join lateral (
  select hp.status_presenca, hp.respondido_por
  from aluno_presenca hp
  join alunos ha on ha.id = hp.aluno_id
  where hp.aula_emusys_id = s.aula_emusys_id
    and ha.emusys_student_id = s.emusys_student_id
    and hp.respondido_por is distinct from 'emusys'
  order by hp.created_at desc nulls last, hp.id desc
  limit 1
) h on true
where ap.id = s.presenca_id
  and ap.respondido_por = 'emusys';

-- (8) remove as linhas nao-sobreviventes do grupo (ANTES de re-parentar o
--     sobrevivente, para nao violar o unique (aluno_id, aula_emusys_id)).
delete from aluno_presenca ap
using tmp_sobreviventes s, alunos a
where a.id = ap.aluno_id
  and s.aula_emusys_id = ap.aula_emusys_id
  and s.emusys_student_id = a.emusys_student_id
  and ap.id <> s.presenca_id;

-- (9) re-parenta o sobrevivente para o aluno canonico do grupo.
update aluno_presenca ap
set aluno_id = c.aluno_id_canonico
from tmp_sobreviventes s
join tmp_canonico c
  on c.aula_emusys_id = s.aula_emusys_id and c.emusys_student_id = s.emusys_student_id
where ap.id = s.presenca_id
  and ap.aluno_id <> c.aluno_id_canonico;

-- (10) aluno_presenca_administrativo: mesma deduplicacao (justificada
--      herdada antes da exclusao).
create temp table tmp_adm_dup on commit drop as
select adm.aula_emusys_id, a.emusys_student_id
from aluno_presenca_administrativo adm
join alunos a on a.id = adm.aluno_id
join tmp_canonico c
  on c.aula_emusys_id = adm.aula_emusys_id and c.emusys_student_id = a.emusys_student_id
where a.emusys_student_id is not null
group by 1,2
having count(distinct adm.aluno_id) > 1;

update aluno_presenca_administrativo adm
set justificada = true
from tmp_adm_dup d
join tmp_canonico c
  on c.aula_emusys_id = d.aula_emusys_id and c.emusys_student_id = d.emusys_student_id
where adm.aula_emusys_id = d.aula_emusys_id
  and adm.aluno_id = c.aluno_id_canonico
  and exists (
    select 1
    from aluno_presenca_administrativo adm2
    join alunos a2 on a2.id = adm2.aluno_id
    where adm2.aula_emusys_id = d.aula_emusys_id
      and a2.emusys_student_id = d.emusys_student_id
      and adm2.aluno_id <> c.aluno_id_canonico
      and adm2.justificada = true
  );

-- Re-parenta UMA linha por grupo (a mais recente) quando nao existe linha com
-- o aluno canonico. Re-parentar todas ao mesmo tempo violaria o unique
-- (aluno_id, aula_emusys_id).
with re_pai as (
  select distinct on (adm.aula_emusys_id, a.emusys_student_id)
         adm.id as adm_id,
         c.aluno_id_canonico
  from aluno_presenca_administrativo adm
  join alunos a on a.id = adm.aluno_id
  join tmp_canonico c
    on c.aula_emusys_id = adm.aula_emusys_id and c.emusys_student_id = a.emusys_student_id
  where adm.aluno_id <> c.aluno_id_canonico
    and not exists (
      select 1 from aluno_presenca_administrativo adm2
      where adm2.aula_emusys_id = adm.aula_emusys_id
        and adm2.aluno_id = c.aluno_id_canonico
    )
  order by adm.aula_emusys_id, a.emusys_student_id,
           adm.created_at desc nulls last,
           adm.id desc
)
update aluno_presenca_administrativo adm
set aluno_id = re.aluno_id_canonico,
    updated_at = now()
from re_pai re
where adm.id = re.adm_id;

delete from aluno_presenca_administrativo adm
using tmp_canonico c
where adm.aula_emusys_id = c.aula_emusys_id
  and adm.aluno_id <> c.aluno_id_canonico
  and exists (
    select 1 from alunos a
    where a.id = adm.aluno_id and a.emusys_student_id = c.emusys_student_id
  );

commit;
