# Normalização das versões curtas de migrations

## Escopo e decisão

Em 04/08/2026, as duas únicas versões remotas fora do formato de 14 dígitos
foram normalizadas no projeto `ouqwbbermlzqqvtqwlul`:

| Versão anterior | Versão normalizada | Nome |
| --- | --- | --- |
| `20260626` | `20260626000000` | `admin_operacional_kpis_alunos` |
| `20260627` | `20260627000000` | `fila_relatorios_data_dia_default_brt` |

O sufixo `000000` é uma normalização determinística para uma versão que tinha
somente a data. **Não representa o horário real de execução** da migration.

## Integridade da alteração

- Somente a chave `version` de `supabase_migrations.schema_migrations` foi
  alterada. Nenhuma DDL de aplicação foi executada.
- As duas linhas mantiveram nome e hash dos statements:
  - `admin_operacional_kpis_alunos`: `fabf3320956d08cc36bf7bafde48d52d`
  - `fila_relatorios_data_dia_default_brt`: `e6e9a706a3160b6e363a5095fc6448ae`
- Preflight e postflight exigiram duas linhas afetadas e zero versões fora de
  `YYYYMMDDHHMMSS`.

## Rollback direcionado

O rollback local, também protegido por nome e hash, está em:

`$REPO/.local/rollbacks/2026-08-04-normalizar-versoes-migrations-curtas.rollback.sql`

SHA-256: `692E4B52F441A2A1A51B9954620C9E2B99916974FAD90438A3B949F4B9FE3CF3`.

Ele restaura exclusivamente as duas chaves curtas; não executa DDL nem toca
dados de negócio.

## Próxima verificação obrigatória

Executar `supabase migration fetch` em checkout descartável e validar com
`supabase db push --dry-run`. Para o Gate A do Subprojeto C, o dry-run deve
listar exatamente as duas migrations daquele gate. Qualquer item adicional
interrompe o rollout.
