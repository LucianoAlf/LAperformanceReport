-- P02L - PROPOSTA DE APPLY CONTROLADO EM PRODUCAO
-- NAO EXECUTAR SEM APROVACAO EXPLICITA.
-- Este arquivo termina com ROLLBACK por padrao.
--
-- Alteracao permitida neste apply:
-- - somente public.lead_experimentais.aluno_id nos 28 casos CERTO.
--
-- Nao altera:
-- - status de experimental
-- - presenca
-- - leads
-- - alunos
-- - UI/KPI
-- - taxa experimental -> matricula

begin;

with lote(experimental_id, lead_id, aluno_id_proposto, data_experimental) as (
  values
    (381, 8427, 1652, date '2026-05-02'),
    (512, 4020, 1560, date '2026-05-26'),
    (509, 3976, 1726, date '2026-05-27'),
    (643, 8763, 1765, date '2026-06-09'),
    (710, 10154, 1777, date '2026-06-17'),
    (354, 8383, 1648, date '2026-05-02'),
    (368, 8511, 1660, date '2026-05-02'),
    (383, 8548, 1662, date '2026-05-02'),
    (365, 8507, 1672, date '2026-05-05'),
    (385, 8716, 1671, date '2026-05-05'),
    (382, 8584, 1683, date '2026-05-06'),
    (479, 9146, 1717, date '2026-05-23'),
    (502, 9260, 1731, date '2026-05-23'),
    (505, 9396, 1719, date '2026-05-26'),
    (513, 9399, 1745, date '2026-05-27'),
    (586, 9597, 1758, date '2026-06-01'),
    (587, 9613, 1746, date '2026-06-01'),
    (598, 9594, 1751, date '2026-06-03'),
    (411, 8842, 1691, date '2026-05-14'),
    (474, 9201, 1704, date '2026-05-22'),
    (488, 9241, 1734, date '2026-05-28'),
    (547, 9525, 1736, date '2026-05-28'),
    (553, 9551, 1733, date '2026-05-30'),
    (624, 9772, 1755, date '2026-06-05'),
    (627, 9568, 1764, date '2026-06-06'),
    (668, 141, 1772, date '2026-06-12'),
    (673, 10030, 1775, date '2026-06-13'),
    (694, 10083, 1778, date '2026-06-17')
),
guarded as (
  select
    le.id as experimental_id,
    le.aluno_id as aluno_id_before,
    lote.aluno_id_proposto
  from lote
  join public.lead_experimentais le on le.id = lote.experimental_id
  join public.leads l on l.id = le.lead_id
  join public.alunos a on a.id = lote.aluno_id_proposto
  where le.aluno_id is null
    and le.lead_id = lote.lead_id
    and l.aluno_id = lote.aluno_id_proposto
    and le.data_experimental::date = lote.data_experimental
    and coalesce(a.status, '') in ('ativo', 'matriculado')
),
guard_count as (
  select count(*)::int as total_guarded
  from guarded
),
applied as (
  update public.lead_experimentais le
  set aluno_id = guarded.aluno_id_proposto
  from guarded
  cross join guard_count
  where le.id = guarded.experimental_id
    and guard_count.total_guarded = 28
  returning
    le.id as experimental_id,
    le.lead_id,
    guarded.aluno_id_before,
    le.aluno_id as aluno_id_after,
    guard_count.total_guarded
)
select *
from applied
order by experimental_id;

-- Esperado antes de trocar ROLLBACK por COMMIT:
-- 28 linhas retornadas
-- total_guarded = 28 em todas
-- aluno_id_before = null
-- aluno_id_after preenchido
--
-- Se retornar 0 linhas, guard_count != 28 ou algum guard falhou.
-- Nesse caso, manter ROLLBACK e investigar.

rollback;
