# Presença canônica — dry-run do lote de migrations

Data: 26/08/2026

Escopo: validar o lote exato que a Supabase CLI enviaria ao projeto `ouqwbbermlzqqvtqwlul`. Nenhuma migration, seed, role, secret ou alteração de ledger foi aplicada.

## Problema encontrado

O primeiro `db push --dry-run` executado diretamente no checkout foi recusado com `LegacyDbPushMissingLocalError`: o ledger remoto contém migrations de outras frentes que não existem nesta branch. Não foi usado `--include-all`, `migration repair` ou `db pull` contra o checkout.

Um staging temporário e isolado foi então criado com `supabase migration fetch --project-ref ouqwbbermlzqqvtqwlul`. Após sobrepor o lote candidato original, o segundo dry-run foi recusado com `LegacyDbPushMissingRemoteError`: onze migrations de presença tinham versões anteriores à última migration remota, `20260826193535_indice_experimentais_raw_lookup_versao_anterior.sql`.

Como essas onze migrations nunca foram publicadas, somente seus nomes foram reversionados para `20260826194000`–`20260826195000`. O conteúdo SQL permaneceu inalterado e a ordem causal do lote foi preservada.

## Dry-run aprovado tecnicamente

Com um novo staging limpo, formado pelo ledger remoto real mais o lote candidato reversionado, foi executado:

```powershell
supabase db push --dry-run `
  --project-ref ouqwbbermlzqqvtqwlul `
  --skip-vault
```

Resultado: código 0, `dryRun=true`, nenhum seed, nenhuma role e exatamente as 22 migrations abaixo:

```text
20260826194000_presenca_funcoes_vivas_baseline.sql
20260826194100_presenca_ocorrencia_canonica_v2.sql
20260826194200_presenca_sync_cobertura_idempotente.sql
20260826194300_presenca_sync_crons_operacional_e_backlog.sql
20260826194400_presenca_sync_saude_operacional.sql
20260826194500_presenca_roster_operacional.sql
20260826194600_presenca_comando_auditoria.sql
20260826194700_presenca_comando_porta_professor.sql
20260826194800_presenca_comando_portas_fabio.sql
20260826194900_presenca_comando_overloads_compatibilidade.sql
20260826195000_presenca_pendencias_canonicas_v2.sql
20260826200000_la_teacher_presenca_canonica_v2.sql
20260826203000_presenca_contexto_agentes_v1.sql
20260826210000_presenca_consumidores_numericos_v2.sql
20260826211000_presenca_interfaces_consulta_v2.sql
20260826214500_presenca_shadow_comparacao_v2.sql
20260826220000_presenca_rollout_config.sql
20260826223000_presenca_rollout_adapters.sql
20260826224000_presenca_rollout_kpis.sql
20260826224836_presenca_hardening_funcoes_internas.sql
20260826225000_presenca_rollout_detalhes.sql
20260826225900_presenca_rollout_fabio_periodo.sql
```

`tests/presencaMigrationReleaseOrder.test.mjs` mantém a lista fechada, exige unicidade, ordem estrita posterior ao baseline remoto e calcula SHA-256 reproduzível de cada arquivo.

## Condição antes de aplicar

Este dry-run não autoriza produção. Imediatamente antes de uma publicação autorizada, é obrigatório repetir `migration fetch` em staging vazio e o `db push --dry-run`. Se o ledger remoto tiver avançado além da última versão candidata, o lote inédito deve ser reversionado novamente; nunca usar `--include-all` ou reparar o histórico como atalho.
