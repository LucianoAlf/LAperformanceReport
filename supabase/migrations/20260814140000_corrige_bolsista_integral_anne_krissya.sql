-- 2026-08-14 — Corrige classificação da Anne Krissya Cordeiro da Silva Noé (Campo Grande)
-- Auditoria a pedido do Alf: ambos os contratos ativos no Emusys (1328 Piano e 1758
-- Minha Banda Para Sempre) têm bolsa=true, valor_mensalidade=0, nr_faturas=0, valor_total=0
-- e sem cobrança automática — sinal canônico de bolsista INTEGRAL. Estavam rotuladas
-- BOLSISTA_PARC (tipo 4) pela fórmula antiga do webhook (valor_mensalidade - desconto_condicional).
--
-- Correção defensiva: só reclassifica se o snapshot ATIVO do Emusys confirmar bolsa=true
-- e nr_faturas=0.

update alunos a
set tipo_matricula_id = 3
where a.id in (31, 1412)
  and a.tipo_matricula_id = 4
  and exists (
    select 1
    from emusys_matriculas_estado_atual e
    where e.unidade_id = a.unidade_id
      and e.aluno_id = a.id
      and e.status_emusys = 'ativa'
      and e.payload_snapshot->'contrato_atual'->>'bolsa' = 'true'
      and coalesce((e.payload_snapshot->'contrato_atual'->>'nr_faturas')::int, 99) = 0
  );
