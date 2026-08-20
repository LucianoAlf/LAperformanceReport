-- Rafael Alves de Souza (Campo Grande, Bateria) reclassificado como BOLSISTA INTEGRAL.
-- Confirmado pela equipe de CG em 2026-08-20, respondendo à auditoria das 4 pendências de
-- forma de pagamento: "É bolsista".
--
-- Estava como REGULAR com valor_parcela 0,00 e nr_faturas 0 no Emusys — a combinação que a
-- régua de classificação já sinalizava. Como bolsista integral, ele:
--   - sai dos alunos pagantes, do ticket médio, do MRR, do LTV e do churn (REGRAS §3.6/3.7);
--   - deixa de ser cobrado por forma de pagamento, porque bolsista não emite fatura.
--
-- ⚠️ Sem essa classificação ele ficaria eternamente na fila financeira como "forma de
-- pagamento ausente" — uma pergunta que não tem resposta possível, já que ele não paga.
--
-- ⚠️ O campo é FIXADO em matriculas_campos_fixados: sem isso o sync devolveria REGULAR na
-- rodada seguinte, porque `bolsa` no payload do Emusys vem false para este contrato (o flag
-- não é confiável — ver REGRAS §3.6). A decisão humana precisa de trava para sobreviver.

update alunos a
   set tipo_matricula_id = (select id from tipos_matricula where codigo = 'BOLSISTA_INT'),
       status_pagamento = 'sem_parcela',
       updated_at = now()
 where a.nome = 'Rafael Alves de Souza'
   and a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
   and a.status = 'ativo'
   and coalesce(a.valor_parcela, 0) = 0
   and not exists (select 1 from matriculas_campos_fixados f
                    where f.aluno_id = a.id and f.campo = 'tipo_matricula_id');

insert into matriculas_campos_fixados (aluno_id, campo, valor, fixado_por, fixado_em)
select a.id, 'tipo_matricula_id',
       to_jsonb((select id from tipos_matricula where codigo = 'BOLSISTA_INT')),
       'equipe_cg_via_alf_20260820', now()
from alunos a
where a.nome = 'Rafael Alves de Souza'
  and a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  and a.status = 'ativo'
on conflict (aluno_id, campo) do update
  set valor = excluded.valor, fixado_por = excluded.fixado_por, fixado_em = excluded.fixado_em;
