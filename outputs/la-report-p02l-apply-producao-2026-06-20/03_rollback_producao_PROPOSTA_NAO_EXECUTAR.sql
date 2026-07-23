-- P02L - PROPOSTA DE ROLLBACK EM PRODUCAO
-- NAO EXECUTAR SEM APROVACAO EXPLICITA.
-- Usar apenas se o apply P02L tiver sido aplicado com COMMIT e precisar ser revertido.
-- Este arquivo termina com ROLLBACK por padrao.

begin;

with lote(experimental_id, aluno_id_proposto) as (
  values
    (381, 1652),
    (512, 1560),
    (509, 1726),
    (643, 1765),
    (710, 1777),
    (354, 1648),
    (368, 1660),
    (383, 1662),
    (365, 1672),
    (385, 1671),
    (382, 1683),
    (479, 1717),
    (502, 1731),
    (505, 1719),
    (513, 1745),
    (586, 1758),
    (587, 1746),
    (598, 1751),
    (411, 1691),
    (474, 1704),
    (488, 1734),
    (547, 1736),
    (553, 1733),
    (624, 1755),
    (627, 1764),
    (668, 1772),
    (673, 1775),
    (694, 1778)
),
guarded as (
  select
    le.id as experimental_id,
    le.aluno_id as aluno_id_before_rollback,
    lote.aluno_id_proposto
  from lote
  join public.lead_experimentais le on le.id = lote.experimental_id
  where le.aluno_id = lote.aluno_id_proposto
),
guard_count as (
  select count(*)::int as total_guarded
  from guarded
),
reverted as (
  update public.lead_experimentais le
  set aluno_id = null
  from guarded
  cross join guard_count
  where le.id = guarded.experimental_id
    and guard_count.total_guarded = 28
  returning
    le.id as experimental_id,
    guarded.aluno_id_before_rollback,
    le.aluno_id as aluno_id_after_rollback,
    guard_count.total_guarded
)
select *
from reverted
order by experimental_id;

-- Esperado antes de trocar ROLLBACK por COMMIT:
-- 28 linhas retornadas
-- total_guarded = 28 em todas
-- aluno_id_after_rollback = null
--
-- Se retornar 0 linhas, rollback nao esta apto para os 28 casos.
-- Manter ROLLBACK e investigar.

rollback;
