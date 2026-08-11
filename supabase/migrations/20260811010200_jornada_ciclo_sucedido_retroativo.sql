-- Retroativo: marca os ciclos ja substituidos que existiam antes do trigger.
--
-- Mesmo predicado do trigger (fn_jornada_marca_ciclo_sucedido), aplicado de uma vez.
-- UPDATE direto na linha velha em vez de "tocar a sucessora para o trigger rodar":
-- tocar a sucessora dispararia tambem trg_resolver_jornada_curso_grade_atual_v1, que
-- pode reescrever curso_id -- efeito colateral indesejado num backfill.
--
-- Esperado em 2026-08-10: 59 linhas (Recreio 39, Barra 8, CG 8).
-- Efeito visivel: aba Administrativo -> Contratos (janela 30d) sai de
--   Barra 16 -> 11 | CG 30 -> 22 | Recreio 43 -> 15
-- que e exatamente o que GET /matriculas devolve para as mesmas janelas.
--
-- Reversivel: update ... set sucedida_por = null, sucedida_em = null.

update public.aluno_jornada_matricula_disciplina velha
   set sucedida_por = nova.emusys_matricula_disciplina_id,
       sucedida_em  = now()
  from public.aluno_jornada_matricula_disciplina nova
 where nova.unidade_id            = velha.unidade_id
   and nova.emusys_matricula_id   = velha.emusys_matricula_id
   and nova.emusys_disciplina_id  = velha.emusys_disciplina_id
   and nova.emusys_matricula_disciplina_id > velha.emusys_matricula_disciplina_id
   and nova.data_ultima_aula               > velha.data_ultima_aula
   -- aceita sucessora 'ativa' E 'desconhecido' (linha criada por webhook)
   and coalesce(nova.status_matricula, '') <> 'finalizada'
   and velha.status_matricula = 'ativa'
   and velha.sucedida_por is null;
