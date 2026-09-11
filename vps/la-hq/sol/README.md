# Sol na LAHQ — custódia executável

Este diretório é a fonte canônica do código da Sol que pertence ao LA Report.
O profile conversacional, a constituição e as skills pertencem ao repositório
privado `sol-openclaw-backup`, em `canonical/profile`.

## Artefatos carregados

O arquivo `runtime/deploy-manifest.json` fixa SHA-256, tamanho, modo e destino de:

- bridge final do WhatsApp;
- módulo de engajamento;
- runtime financeiro;
- abertura/fechamento determinístico;
- MCP `sol-portas`.

A bridge final agora é versionada diretamente em `runtime/bridge.js`. Os patches
históricos continuam como auditoria, mas não são mais necessários para descobrir
quais bytes devem estar carregados.

## Verificação

```bash
python3 vps/la-hq/sol/scripts/sol-runtime-custody.py verify-local
python3 vps/la-hq/sol/scripts/sol-runtime-custody.py readback --ssh-host lahq
```

O readback é somente leitura e falha se SHA, tamanho ou modo divergirem. Este
utilitário não faz deploy, restart, DDL/DML nem envia mensagem. Uma promoção
produtiva continua exigindo backup, gate explícito, aplicação atômica e readback.

No baseline de 2026-09-11, os cinco conteúdos coincidiram com a VPS. O readback
apontou três drifts apenas de modo de arquivo contra a política canônica `0644`.
Nenhuma permissão viva foi alterada neste gate.

## Origem da bridge baseline

A primeira versão direta de `runtime/bridge.js` foi adotada do runtime legítimo
do Gate 0 em 2026-09-11. Base Hermes observada na VPS:
`a9a4a040705f0c312488e81dbdd96bf0b951feb7`; hash final carregado:
`e4784fb1e93780281bff80bac0ff9808cbec0c43efc4da49796ed330933d80d2`.
O arquivo passou por varredura de segredo antes de entrar no Git.
