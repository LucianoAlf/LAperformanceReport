# Presença canônica — preflight do pacote Edge

Data: 26/08/2026

Escopo: delimitar e compilar as Edge Functions que precisam acompanhar a presença v2. Nenhuma função foi publicada e nenhum `verify_jwt` foi alterado.

## Pacote fechado

O diff e as dependências compartilhadas exigem exatamente oito deploys. `previsualizar-reconciliacao-grade-emusys` entra no pacote mesmo sem mudança no seu `index.ts`, porque importa os módulos compartilhados alterados.

| Função | Versão remota | `verify_jwt` a preservar | SHA-256 remoto antes do deploy |
|---|---:|---|---|
| `sync-presenca-emusys` | 101 | `false` | `b51c3cb9ddae5fd48750e982a8674c9e1b2292065b2fe1617c89823482e0217a` |
| `sync-grade-futura-emusys` | 33 | `true` | `2435b2e059581bbf32c4146c4a4761dd6f4e7a0950f95c2a8d034f3c785ffba0` |
| `previsualizar-reconciliacao-grade-emusys` | 4 | `false` | `7462c94433f3629bbd550e4dd9500e355205bbc2699a315fcd813a0abbfdb4f4` |
| `relatorio-admin-whatsapp` | 111 | `false` | `8e4b037aa3850abbd2172977d026999ff50b11e86b8e49932834876f0c35521a` |
| `processar-alertas-lia` | 12 | `true` | `42e2758377bf923dc828a352fbecf5d3efdccce181bd774b817a83cb6a01d432` |
| `bi-agent-lamusic` | 48 | `false` | `3f467472f09d4f45c0d90f42f1c9eb0fe0bc3248e47c8d5857594f26976d750e` |
| `gerar-plano-aluno` | 38 | `false` | `809cbb6033b5fdc02247657ac73c155c4620cd9cd04e45b5d54f117bff30833e` |
| `gerar-relatorio-aluno` | 39 | `false` | `aa0f9d151605d151220c12a214bdea76f324c5aab23447e0d483b8698fac31b5` |

Todas estavam `ACTIVE` no momento da leitura.

## Prova local

Os oito entrypoints foram verificados juntos:

```powershell
deno check --node-modules-dir=auto `
  supabase/functions/sync-presenca-emusys/index.ts `
  supabase/functions/sync-grade-futura-emusys/index.ts `
  supabase/functions/previsualizar-reconciliacao-grade-emusys/index.ts `
  supabase/functions/relatorio-admin-whatsapp/index.ts `
  supabase/functions/processar-alertas-lia/index.ts `
  supabase/functions/bi-agent-lamusic/index.ts `
  supabase/functions/gerar-plano-aluno/index.ts `
  supabase/functions/gerar-relatorio-aluno/index.ts
```

Resultado: código 0. O modo automático foi usado somente para resolver dependências no ambiente de checagem; a alteração gerada em `deno.lock` foi descartada e o arquivo versionado permaneceu byte-identical.

## Ordem e rollback

As migrations autorizadas devem existir antes do primeiro deploy, pois os syncs e consumidores chamam as novas RPCs. Ordem operacional:

1. sync/roster: `sync-grade-futura-emusys`, `previsualizar-reconciliacao-grade-emusys`, `sync-presenca-emusys`;
2. pendência operacional: `relatorio-admin-whatsapp`;
3. consumidores analíticos: Lia, BI, plano e relatório do aluno.

Antes de publicar, reler versões/hashes e guardar os bundles remotos atuais como artefato de rollback. Rollback de Edge significa republicar o bundle anterior com o mesmo `verify_jwt`; a versão numérica avançará, mas o hash funcional deve voltar ao baseline registrado. A autorização de deploy não autoriza mudança de flags dos consumidores.
