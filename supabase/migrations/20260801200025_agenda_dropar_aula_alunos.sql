-- Derruba a tabela aula_alunos, criada por engano nas Tasks 3-7 do modulo
-- Agenda: duplicava aula_alunos_emusys (canonica, 18 consumidores) com chave
-- pior (nome, colapsa homonimos). O vinculo aula-aluno foi consolidado em
-- aula_alunos_emusys pela migration agenda_consolidar_aula_alunos_emusys.
-- Verificado antes do drop: nenhuma funcao e nenhuma view referenciam mais
-- aula_alunos; get_agenda_dia ja le de aula_alunos_emusys.
drop trigger if exists trg_aula_alunos_casar_aluno on public.aula_alunos;
drop function if exists public.fn_aula_alunos_casar_aluno();
drop table if exists public.aula_alunos;
