# P02L - Pacote final para apply controlado em producao

Data: 2026-06-20

Status: proposta final. Nada executado.

## Contexto

O preview P02L em producao foi rodado em modo SELECT-only e retornou:

- `APTO`: 28
- `BLOQUEAR`: 0

Este pacote prepara o apply controlado em producao, mas mantem `ROLLBACK` por padrao.

## Arquivos

- `01_preflight_select_only_producao.sql`
- `02_apply_producao_PROPOSTA_NAO_EXECUTAR.sql`
- `03_rollback_producao_PROPOSTA_NAO_EXECUTAR.sql`
- `04_checklist_validacao_pos_apply.md`

## Travas

- Nao executar `COMMIT` sem aprovacao explicita.
- Nao alterar status.
- Nao alterar presenca.
- Nao alterar `leads`.
- Nao alterar `alunos`.
- Nao alterar UI/KPI.
- Nao publicar taxa experimental -> matricula.
