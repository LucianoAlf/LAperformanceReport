-- 2026-08-14 — Daniel Eustáquio de Jesus (id 1011, Recreio) é bolsista parcial.
-- Confirmado pelo Alf: perfil idêntico aos 3 parciais ativos (parcela ~204, desconto
-- condicional ~276/57%, 12 faturas, sem cobrança automática), mas classificado REGULAR.
-- Reclassifica para BOLSISTA_PARC. Guarda: só o id 1011, tipo atual REGULAR, ativo,
-- e contrato Emusys ativo com desconto_condicional alto (>=250) e 12 faturas.

update alunos a
set tipo_matricula_id = 4
where a.id = 1011
  and a.unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
  and a.tipo_matricula_id = 1
  and a.status = 'ativo'
  and exists (
    select 1
    from emusys_matriculas_estado_atual e
    where e.unidade_id = a.unidade_id
      and e.aluno_id = a.id
      and e.status_emusys = 'ativa'
      and coalesce((e.payload_snapshot->'contrato_atual'->>'desconto_condicional')::numeric, 0) >= 250
      and coalesce((e.payload_snapshot->'contrato_atual'->>'nr_faturas')::int, 0) = 12
  );
