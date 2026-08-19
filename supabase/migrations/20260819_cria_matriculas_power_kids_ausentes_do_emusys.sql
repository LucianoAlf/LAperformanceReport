-- "Se existe no Emusys e não existe aqui, tem que salvar aqui." (Alf, 2026-08-19)
--
-- Alexandre Ayres Filho (matrícula 1765, turma PK_Qui_15, prof Rodrigo Pinheiro) e
-- Gabriel Gomes Chaves (2128, PK_Sex_15, prof Kaio Felipe) têm uma SEGUNDA matrícula
-- de Power Kids ativa no Emusys que nunca teve linha aqui.
--
-- ⚠️ Isto NÃO é duplicata, e a regra é do Alf (2026-08-19): "Power Kids é a banda e ele
-- pode tocar em duas bandas diferentes". As duas matrículas de cada um têm TURMA e
-- PROFESSOR diferentes — bandas distintas, vínculos legítimos.
--
-- Power Kids é `cursos.is_projeto_banda = true`: atividade extra, valor 0, tipo BANDA
-- (nr_faturas = 0 no Emusys confirma que não cobra). Não entra em aluno ativo nem em
-- pagante (REGRAS-DE-NEGOCIO §3.5).
insert into alunos (
  nome, unidade_id, curso_id, professor_atual_id, tipo_matricula_id,
  emusys_matricula_id, emusys_student_id, status, is_segundo_curso,
  valor_parcela, valor_cheio, dia_aula, horario_aula,
  data_matricula, created_at, updated_at
)
select
  base.nome, base.unidade_id,
  (select id from cursos where nome = 'Power Kids'),
  base.professor_id,
  (select id from tipos_matricula where codigo = 'BANDA'),
  base.emusys_matricula_id, base.emusys_student_id,
  'ativo', true, 0, 0, base.dia_aula, base.horario_aula,
  current_date, now(), now()
from (
  values
    ('Alexandre Ayres Filho', '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, '1765', '1489', 'Quinta', '15:00:00'::time, 45),
    ('Gabriel Gomes Chaves',  '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, '2128', '419',  'Sexta',  '15:00:00'::time, 1962)
) as v(nome, unidade_id, emusys_matricula_id, emusys_student_id, dia_aula, horario_aula, prof_emusys)
cross join lateral (
  select v.nome, v.unidade_id, v.emusys_matricula_id, v.emusys_student_id,
         v.dia_aula, v.horario_aula,
         (select pu.professor_id from professores_unidades pu
           where pu.emusys_id = v.prof_emusys and pu.unidade_id = v.unidade_id limit 1) as professor_id
) base
where not exists (
  select 1 from alunos a
   where a.emusys_matricula_id = base.emusys_matricula_id and a.unidade_id = base.unidade_id
);

update matriculas_divergencias md
   set resolvido = true, updated_at = now(),
       analise_sol = 'Resolvida: matricula criada a partir do Emusys (segunda banda de Power Kids, turma e professor proprios).'
 where md.resolvido = false
   and md.tipo_divergencia = 'ausente_nosso_sistema'
   and exists (
     select 1 from alunos a
      where a.unidade_id = md.unidade_id
        and btrim(a.emusys_matricula_id) = btrim(md.valor_api->>'emusys_id')
   );
