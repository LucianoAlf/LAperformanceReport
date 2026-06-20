-- P02L - Preflight SELECT-only producao
-- Ambiente alvo: producao ouqwbbermlzqqvtqwlul
-- Seguranca: este arquivo nao altera dados.

with lote(experimental_id, lead_id, aluno_id_proposto, data_experimental, unidade_nome, presenca_estrita) as (
  values
    (381, 8427, 1652, date '2026-05-02', 'Barra', true),
    (512, 4020, 1560, date '2026-05-26', 'Barra', true),
    (509, 3976, 1726, date '2026-05-27', 'Barra', true),
    (643, 8763, 1765, date '2026-06-09', 'Barra', true),
    (710, 10154, 1777, date '2026-06-17', 'Barra', true),
    (354, 8383, 1648, date '2026-05-02', 'Campo Grande', true),
    (368, 8511, 1660, date '2026-05-02', 'Campo Grande', false),
    (383, 8548, 1662, date '2026-05-02', 'Campo Grande', false),
    (365, 8507, 1672, date '2026-05-05', 'Campo Grande', false),
    (385, 8716, 1671, date '2026-05-05', 'Campo Grande', false),
    (382, 8584, 1683, date '2026-05-06', 'Campo Grande', false),
    (479, 9146, 1717, date '2026-05-23', 'Campo Grande', true),
    (502, 9260, 1731, date '2026-05-23', 'Campo Grande', false),
    (505, 9396, 1719, date '2026-05-26', 'Campo Grande', true),
    (513, 9399, 1745, date '2026-05-27', 'Campo Grande', false),
    (586, 9597, 1758, date '2026-06-01', 'Campo Grande', false),
    (587, 9613, 1746, date '2026-06-01', 'Campo Grande', true),
    (598, 9594, 1751, date '2026-06-03', 'Campo Grande', true),
    (411, 8842, 1691, date '2026-05-14', 'Recreio', true),
    (474, 9201, 1704, date '2026-05-22', 'Recreio', true),
    (488, 9241, 1734, date '2026-05-28', 'Recreio', true),
    (547, 9525, 1736, date '2026-05-28', 'Recreio', true),
    (553, 9551, 1733, date '2026-05-30', 'Recreio', true),
    (624, 9772, 1755, date '2026-06-05', 'Recreio', true),
    (627, 9568, 1764, date '2026-06-06', 'Recreio', true),
    (668, 141, 1772, date '2026-06-12', 'Recreio', true),
    (673, 10030, 1775, date '2026-06-13', 'Recreio', true),
    (694, 10083, 1778, date '2026-06-17', 'Recreio', true)
),
preview as (
  select
    lote.experimental_id,
    lote.lead_id as lead_id_esperado,
    le.lead_id as lead_id_banco,
    l.emusys_lead_id,
    lote.aluno_id_proposto,
    le.aluno_id as aluno_id_atual,
    l.aluno_id as aluno_id_via_lead,
    a.nome as aluno_nome_proposto,
    a.status as aluno_status,
    le.status as status_experimental_atual,
    le.data_experimental::date as data_experimental_banco,
    lote.data_experimental as data_experimental_esperada,
    lote.unidade_nome,
    lote.presenca_estrita,
    case
      when le.id is null then 'BLOQUEAR: experimental_id inexistente'
      when le.aluno_id is not null then 'BLOQUEAR: experimental ja possui aluno_id'
      when le.lead_id <> lote.lead_id then 'BLOQUEAR: lead_id divergente'
      when l.aluno_id is distinct from lote.aluno_id_proposto then 'BLOQUEAR: leads.aluno_id diverge do aluno proposto'
      when le.data_experimental::date <> lote.data_experimental then 'BLOQUEAR: data_experimental divergente'
      when coalesce(a.status, '') not in ('ativo', 'matriculado') then 'BLOQUEAR: aluno candidato nao esta ativo/matriculado'
      else 'APTO_PREVIEW_PRODUCAO'
    end as validacao_preview
  from lote
  left join public.lead_experimentais le on le.id = lote.experimental_id
  left join public.leads l on l.id = le.lead_id
  left join public.alunos a on a.id = lote.aluno_id_proposto
)
select *
from preview
order by unidade_nome, data_experimental_banco, experimental_id;

-- Resumo esperado:
-- total = 28
-- APTO_PREVIEW_PRODUCAO = 28
-- BLOQUEAR = 0
