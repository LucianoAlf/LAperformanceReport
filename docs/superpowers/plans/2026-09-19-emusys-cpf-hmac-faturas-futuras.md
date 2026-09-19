# Emusys CPF HMAC e faturas futuras - plano de implementacao

**Objetivo:** guardar somente HMAC-SHA256 dos CPFs retornados por `/matriculas`, expor consulta segura ao Super Folha e sincronizar faturas abertas dos tres meses seguintes.

**Arquitetura:** uma migration cria armazenamento privado, RPCs `service_role`, backfill atomico, limpeza recursiva e triggers. As Edges sanitizam os JSONs e o sync de matriculas entrega CPFs apenas a RPC que usa a chave do Vault. A fila financeira existente ganha as competencias +2 e +3.

### 1. Contratos de privacidade

- [x] Criar testes puros para normalizacao, extracao dos dois papeis e remocao recursiva sem mutar o payload.
- [x] Criar teste de contrato para Vault, HMAC-SHA256, ACL, backfill antes da limpeza, triggers e endpoint sem eco do hash.
- [x] Confirmar a falha inicial.

### 2. Migration e Edges

- [x] Criar a migration pela CLI do Supabase.
- [x] Implementar tabela privada, RPCs, backfill/limpeza e triggers.
- [x] Sanitizar `sync-matriculas-emusys`, `processar-matricula-emusys` e o helper comum de logs.
- [x] Criar `resolver-emusys-cpf-hash` com autenticacao servidor-servidor.
- [x] Acrescentar +2 e +3 meses ao backlog de faturas.

### 3. Verificacao e rollout

- [x] Rodar testes focados, `deno check`, build e `git diff --check`.
- [x] Instalar a mesma chave aleatoria nos dois Vaults sem exibir o valor.
- [x] Aplicar a migration, publicar as Edges e executar o sync das tres unidades.
- [x] Enfileirar e drenar os tres meses futuros; verificar cobertura por unidade/competencia.
- [x] Confirmar zero CPF em claro, ACLs e consulta por hash.
- [x] Commitar, publicar a branch, abrir PR e registrar as evidencias de producao.
