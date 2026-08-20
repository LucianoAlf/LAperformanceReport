-- Saidas lancadas a mao em Campo Grande com `aluno_id` NULL: o autocomplete do formulario aceita
-- nome digitado sem selecionar da lista, e sem `aluno_id` a Pesquisa de Evasao bloqueia em
-- 'sem_aluno' e o trigger de telefone nao tem de onde copiar o contato ("Nao informado" na tela).
--
-- O vinculo NAO foi decidido por nome: foi conferido contra o espelho do Emusys
-- (`emusys_matriculas_estado_atual`), aluno a aluno — `emusys_aluno_id` bate com
-- `alunos.emusys_student_id`, o nome no payload do Emusys e identico, cada pessoa tem UMA linha em
-- `alunos` na unidade (sem multi-curso, sem homonimo) e as 4 matriculas estao
-- `status_emusys='inativa'` com `motivo_inativa='concluida'` — que e exatamente "o contrato acabou
-- e nao renovou", o tipo que foi lancado.
--
--  mov  | aluno | emusys_aluno_id | matricula | ultima aula (contrato) | lancado em
--  3614 |    66 |            3171 |      2254 | 2026-08-05             | 2026-08-14
--  3609 |   277 |            2814 |      1986 | 2026-08-06             | 2026-08-14
--  3613 |   404 |            3170 |      2253 | 2026-08-05             | 2026-08-14
--  3534 |   350 |            3154 |      2234 | 2026-07-02             | 2026-07-05
--
-- FICAM DE FORA, de proposito, os outros dois casos sem vinculo — vincular criaria DUPLA CONTAGEM
-- de saida para a mesma pessoa, e qual anular e decisao da equipe:
--   * Gabriel Abreu da Cruz Carvalho (aluno 124): #3549 criada pelo SISTEMA em 07/08 com data
--     27/06 (a data real da ultima aula, competencia jun/2026) e #3610 lancada a mao em 14/08 com
--     data 14/08 (competencia ago/2026). Mesmo fim de contrato, duas linhas, dois meses — o mesmo
--     padrao ja documentado para renovacao (manual + automatico = competencias diferentes).
--   * Bernardo Xavier Veras Mascarenhas de Castro (aluno 60): #2996 (25/05) e #3535 (05/07), as
--     duas manuais, de operadores diferentes. A ultima aula no Emusys e 04/07, o que aponta a
--     #3535 como a correta — mas anular a outra e decisao humana.

update public.movimentacoes_admin m
set aluno_id = v.aluno_id
from (values (3614, 66), (3609, 277), (3613, 404), (3534, 350)) as v(mov_id, aluno_id)
where m.id = v.mov_id
  and m.aluno_id is null;
