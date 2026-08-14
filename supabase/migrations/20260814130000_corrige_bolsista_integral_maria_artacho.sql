-- 2026-08-14 — Corrige classificação da Maria Eduarda Quinteiro Artacho (Recreio)
--
-- Fernanda (ADM Recreio): o relatório diário trazia 5 bolsistas integrais, mas são 6 —
-- faltava a Maria Eduarda Artacho. Ela foi rotulada BOLSISTA_PARC (tipo_matricula_id 4),
-- mas é bolsista INTEGRAL: no Emusys o contrato 677 tem bolsa=true, nr_faturas=0,
-- valor_total=0 e sem cobrança automática — exatamente igual aos irmãos Arthur (676) e
-- Noah (675), que estão corretos como BOLSISTA_INT. Os R$15 do payload são simbólicos
-- (chaveiro/item), não parcela.
--
-- Causa raiz (corrigida em processar-matricula-emusys): o webhook decidia integral vs
-- parcial por `valor_mensalidade - desconto_condicional`; a Maria tem desconto_condicional=0
-- (15-0=15>0 → PARC) enquanto o irmão tinha desconto_condicional=15 (15-15=0 → INT).
-- O desconto_condicional varia independente da bolsa e não deve decidir isso.
--
-- Correção de dados defensiva: só reclassifica se o snapshot Emusys confirmar bolsa=true
-- e nr_faturas=0 (sinal canônico de bolsista integral, igual ao irmão).

update alunos a
set tipo_matricula_id = 3
where a.id = 1015
  and a.tipo_matricula_id = 4
  and exists (
    select 1
    from emusys_matriculas_estado_atual e
    where e.unidade_id = a.unidade_id
      and e.aluno_id = a.id
      and e.emusys_matricula_id = a.emusys_matricula_id::bigint
      and e.payload_snapshot->'contrato_atual'->>'bolsa' = 'true'
      and coalesce((e.payload_snapshot->'contrato_atual'->>'nr_faturas')::int, 99) = 0
  );
