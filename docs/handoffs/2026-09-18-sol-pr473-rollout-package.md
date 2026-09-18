# Sol — pacote de rollout isolado do PR #473

Estado: preparado, sem aplicação produtiva.

## Objetivo

Promover a correção fail-closed que impede colisão de `emusys_student_id`
entre unidades, preservando os hotfixes posteriores de competência e baixa
antecipada já ativos no runtime financeiro.

## Escopo proposto para o futuro gate

1. aplicar somente
   `supabase/migrations/20260915213600_sol_caixa_casar_parcela_isola_unidade.sql`;
2. promover somente
   `vps/la-hq/sol/runtime/caixa-financeiro.cjs`;
3. reiniciar somente `hermes-gateway-sol.service` no user bus de `sol`;
4. validar a RPC, ACL, health, fila, crachá e custódia;
5. manter o rollback SQL e o backup do arquivo anterior até o fim do soak.

Ficam fora: bridge, MCP, ledger, Auditor, switches, destinatários, mensagens de
teste, replay, aprovação antiga e qualquer escrita financeira.

## Pré-condições

- soak do CP3 encerrado e aceito;
- Sol `active/running`, `NRestarts=0`, bridge conectada e fila zero;
- migration ainda ausente no catálogo produtivo;
- backup restaurável do runtime financeiro vivo;
- hash do artefato alvo igual ao manifesto do commit aprovado;
- suíte e ensaio PostgreSQL verdes no mesmo commit.

## Provas obrigatórias

- consulta escopada pela unidade nas três leituras de fatura;
- caso cross-unit não escolhe fatura de outra unidade;
- competência explicitamente informada não é substituída;
- baixa antecipada única continua selecionável;
- duas baixas equivalentes continuam falhando fechadas;
- card bloqueado não pede aprovação;
- `anon` e `authenticated` continuam sem acesso direto indevido;
- nenhum lançamento, aprovação ou mensagem é provocado pelo smoke.

## Rollback

- restaurar o backup exato de `caixa-financeiro.cjs`;
- aplicar o rollback versionado
  `supabase/rollbacks/20260915213600_sol_caixa_casar_parcela_isola_unidade_ROLLBACK.sql`;
- reiniciar somente a Sol;
- repetir health, hash, ACL e readback antes de encerrar o incidente.

Este documento não autoriza produção. Migration, promoção e restart continuam
sujeitos ao gate explícito do Alf depois das provas e do fechamento do CP3.
