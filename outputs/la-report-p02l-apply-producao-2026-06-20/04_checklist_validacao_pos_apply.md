# P02L - Checklist de validacao pos-apply

Status: checklist. Nenhum apply executado.

## Antes de qualquer COMMIT

- Confirmar MCP/SQL em producao:
  - `https://ouqwbbermlzqqvtqwlul.supabase.co`
- Rodar `01_preflight_select_only_producao.sql`.
- Exigir:
  - total = 28
  - `APTO_PREVIEW_PRODUCAO = 28`
  - `BLOQUEAR = 0`
- Rodar `02_apply_producao_PROPOSTA_NAO_EXECUTAR.sql` com `ROLLBACK` primeiro.
- Conferir `RETURNING`:
  - 28 linhas
  - `total_guarded = 28`
  - `aluno_id_before = null`
  - `aluno_id_after` preenchido.
- So trocar `ROLLBACK` por `COMMIT` com aprovacao explicita.

## Depois do apply com COMMIT

Rodar SELECT de conferencia:

```sql
with lote(experimental_id, aluno_id_proposto) as (
  values
    (381, 1652), (512, 1560), (509, 1726), (643, 1765), (710, 1777),
    (354, 1648), (368, 1660), (383, 1662), (365, 1672), (385, 1671),
    (382, 1683), (479, 1717), (502, 1731), (505, 1719), (513, 1745),
    (586, 1758), (587, 1746), (598, 1751), (411, 1691), (474, 1704),
    (488, 1734), (547, 1736), (553, 1733), (624, 1755), (627, 1764),
    (668, 1772), (673, 1775), (694, 1778)
)
select
  count(*) filter (where le.aluno_id = lote.aluno_id_proposto)::int as preenchidos_corretos,
  count(*) filter (where le.aluno_id is null)::int as ainda_nulos,
  count(*) filter (where le.aluno_id is not null and le.aluno_id <> lote.aluno_id_proposto)::int as divergentes
from lote
join public.lead_experimentais le on le.id = lote.experimental_id;
```

Esperado:

- `preenchidos_corretos = 28`
- `ainda_nulos = 0`
- `divergentes = 0`

## O que NAO sera alterado

- `lead_experimentais.status`
- `lead_experimentais.data_experimental`
- `lead_experimentais.horario_experimental`
- `lead_experimentais.professor_experimental_id`
- `aluno_presenca`
- `aulas_emusys`
- `leads`
- `alunos`
- `dados_mensais`
- `dados_comerciais`
- `origem_leads`
- UI
- KPI
- relatorios
- taxa experimental -> matricula

## Status de KPI

Mesmo apos o apply P02L:

- taxa experimental -> matricula continua bloqueada;
- conversao oficial continua bloqueada;
- P02L apenas melhora o vinculo `lead_experimentais.aluno_id` nos 28 casos certos.
