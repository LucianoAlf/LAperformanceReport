# Auditoria de baseline — relatório gerencial e Emusys

Data: 2026-08-10  
Branch: `feat/relatorio-gerencial-integridade-hibrido`  
Worktree: `.worktrees/relatorio-gerencial-integridade-hibrido`

## Estado local

- `npm test`: 20 testes passaram.
- `node --test tests/relatorioGerencialCanonico.test.mjs`: 4 passaram e 1 falhou pela asserção legada que ainda exige `faturamento_previsto` no renderer; o código vigente usa `faturado_emusys` e `faturamento_realizado`.
- Nenhuma migration, snapshot, função Edge ou dado remoto foi alterado nesta auditoria.

## Estado remoto observado

`supabase functions list --project-ref ouqwbbermlzqqvtqwlul` foi executado em modo somente leitura. O remoto informou, entre outros:

| Função | Versão | Atualização UTC |
|---|---:|---|
| `gemini-relatorio-gerencial` | 85 | 2026-08-08 16:32:02 |
| `relatorio-admin-whatsapp` | 92 | 2026-08-09 22:09:44 |
| `sync-presenca-emusys` | 86 | 2026-08-10 00:47:05 |
| `processar-matricula-emusys` | 81 | 2026-08-10 17:04:32 |
| `sync-matriculas-emusys` | 81 | 2026-08-03 22:22:53 |
| `sync-grade-futura-emusys` | 28 | 2026-08-10 00:47:07 |

`supabase migration list` não pôde ser executado porque este worktree não está linkado pelo CLI (`Cannot find project ref. Have you run supabase link?`). Não foi feito `supabase link`, pois isso alteraria a configuração local sem necessidade para a etapa de implementação.

## Limites da etapa

O relatório mensal consulta a RPC canônica no Supabase; ele não faz um GET direto ao Emusys. Os syncs de matrícula, presença, grade e faturas são os produtores que alimentam a base local. A publicação da migration, backfill, execução com dados reais e deploy continuam bloqueados para um gate posterior de aprovação humana.
