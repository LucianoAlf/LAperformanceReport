# Presenca canonica - aplicacao das migrations em producao

Data: 2026-08-27
Projeto Supabase: `ouqwbbermlzqqvtqwlul`

## Resultado

As 22 migrations autorizadas foram aplicadas em ordem, de
`20260827030000` a `20260827032100`. Depois da validacao remota, os dois
hotfixes autorizados `20260827032200` e `20260827032300` tambem foram
aplicados. O ledger remoto passou de 1771 para 1795 migrations.

As oito Edge Functions do pacote foram publicadas com `verify_jwt` preservado.
Nao houve reparo de roster nem ativacao de consumidor canonico.

O dry-run imediatamente anterior listou exatamente as 22 migrations, sem
`--include-all`, repair, seed ou roles. O `db push` terminou com codigo 0.
Os dois avisos recebidos eram `DROP ... IF EXISTS` de constraint/trigger ainda
inexistentes.

## Integridade antes e depois

Janela: 2026-07-28 a 2026-08-26.

| Unidade | Decisoes humanas | Hash antes/depois |
|---|---:|---|
| Barra | 1076 | `ba54f55842b563f55adc2d7e8120368a` |
| Campo Grande | 2438 | `c7ed1da50e8390d7c31254f5d0c7101f` |
| Recreio | 2045 | `557dab42ccb41fea386565a9ebadbe0a` |

Os tres snapshots fechados verificados tambem permaneceram byte-identicos:

- segmentos: 67954, hash `547c530c5bd5baa64feeca2c7d45d591`;
- metricas: 53070, hash `da1bc661e732111a3f9f9400772aad7a`;
- snapshots: 8845, hash `139ad60937a8b33e4287c2572b1793c3`.

## Rollout e contratos

- 21 flags: 7 superficies por Barra, Campo Grande e Recreio;
- 21 em `sombra`, 0 em `legado` forcado e 0 em `canonico_v2`;
- tabelas novas com RLS ativo e sem CRUD direto para `anon`/`authenticated`;
- views nominais com `security_invoker=true`; kernel metrico com
  `security_barrier=true` e acesso service-only;
- funcoes internas sem EXECUTE publico e SECURITY DEFINER com `search_path`
  fixo;
- oito Edge Functions foram publicadas nas novas versoes e mantiveram o
  `verify_jwt` anterior.

Os advisors retornaram 760 itens de seguranca e 1158 de performance. Nos
objetos novos, os nove avisos `RLS Enabled No Policy` sao o deny-by-default
intencional. Em performance, seis indices ainda constam como nao usados porque
as tabelas nasceram sem trafego e uma FK de `presenca_sync_cobertura.run_id`
foi sinalizada sem indice cobridor; este ultimo e hardening, nao alteracao de
correcao ou integridade.

## Shadow e previa real

Em 30 dias e 90 recortes unidade/dia, `sem_explicacao=0`. Todos os dias ainda
aparecem como `sync_incompleto` porque a Edge com ledger nao foi publicada.

| Unidade | v1 | v2 | Delta | Duplicidade Emusys | Precedencia humana | Politica temporal |
|---|---:|---:|---:|---:|---:|---:|
| Barra | 1698 | 866 | -832 | 850 | 155 | 39 |
| Campo Grande | 2994 | 1393 | -1601 | 1659 | 363 | 4 |
| Recreio | 2781 | 1457 | -1324 | 1342 | 323 | 9 |

A previa de reparo foi somente leitura, sem backfill e com integridade humana
identica. Ela classificou 849 gemeas na Barra, 1655 em Campo Grande e 1339 no
Recreio; nao previu soft-inativacao de roster nem correcao de snapshot, pois o
novo ledger ainda esta vazio.

## Defeitos encontrados no pos-release

1. `get_saude_cobertura_presenca_v1` declarava `unidade_nome text`, mas
   retornava `unidades.nome varchar(100)`. A RPC falha em runtime no schema real.
2. A fila de relatorio registrava `presenca-v2` mesmo quando o wrapper de `sol`
   entregava conteudo legado em sombra. O consolidado precisava de uma porta
   explicita para impedir origem mista durante rollout parcial.

Quatro itens do cron das 09:00 BRT foram identificados antes do envio. Eles
foram contidos de forma reversivel, o corpo remoto foi comprovado como legado e
os mesmos IDs 107-110 foram restaurados para `sol_pendente` com metadata
`presenca-legado-v1`. Nenhum tinha `message_id` ou `enviada_em` durante a
correcao.

## Hotfixes aplicados

- `20260827032200_presenca_sync_saude_tipo_nome_hotfix.sql`;
- `20260827032300_presenca_relatorio_rollout_proveniencia_hotfix.sql`.

TDD: o teste PostgreSQL reproduziu o erro exato de `varchar(100) versus text` e
passou depois do cast. O teste de rollout provou consolidado legado em sombra,
consolidado v2 somente apos ativacao e metadata coerente nos dois modos. A
suite integral passou com 371/371. O staging remoto listou exatamente esses
dois hotfixes no novo dry-run.

Depois da autorizacao independente, os dois foram aplicados com codigo 0. A RPC
`get_saude_cobertura_presenca_v1('2026-08-26')` passou a executar no schema real
e retornou `sem_cobertura`, `publicavel=false` e `relatorio_bloqueado=true` para
as tres unidades, que e o comportamento fail-closed esperado enquanto o ledger
de presenca ainda esta vazio. Os itens 107-110 continuavam `sol_pendente`, sem
`message_id`/`enviada_em`, e com proveniencia `presenca-legado-v1` na verificacao
posterior.

## Edge Functions publicadas

Antes do deploy, os oito entrypoints passaram em
`deno check --node-modules-dir=auto`. Depois do deploy, o estado remoto ficou:

| Function | Versao | verify_jwt | SHA-256 remoto |
|---|---:|---|---|
| `sync-presenca-emusys` | 102 | false | `578dd5232f3d0e927158f5e9ca16bcaaa7ed592916e4768d4c495b2c1dad7736` |
| `sync-grade-futura-emusys` | 34 | true | `643081aafae9a08a28bbd2a776888ff921c6eeec47272ebed5ccf7e726c08037` |
| `previsualizar-reconciliacao-grade-emusys` | 5 | false | `3957da9fd890b10e4a984409933edf20e4edff06bff3d18ed8bb4d80fefeb20f` |
| `relatorio-admin-whatsapp` | 112 | false | `97463bd2783d77804133e6aacadeac8ba223788538c6ea1dde8ba452cf8950dd` |
| `processar-alertas-lia` | 13 | true | `9c687575abdbc2b3965ccb4ec660061d9ee104a2a2425b14b438ce3cf6ffad5e` |
| `bi-agent-lamusic` | 49 | false | `045baedb9c45d8d9fa87cda16eedde70d7c727b560b8c8e92c99891f4bce0d7d` |
| `gerar-plano-aluno` | 39 | false | `ca6c8ce819bebc3003c3a14b678b0b777e53b5779e13404ab55d4bee5ba9d44f` |
| `gerar-relatorio-aluno` | 40 | false | `7b6d794afae81ff57dbe523f77f38e2314e4bae2566e1886c5fab7ee2a3d9c22` |

Testes negativos reais, sem payload operacional, retornaram 401 em
`sync-presenca-emusys`, `sync-grade-futura-emusys`,
`previsualizar-reconciliacao-grade-emusys` e `processar-alertas-lia`. A versao
13 de Lia tambem recebeu trafego agendado real e respondeu 200 repetidamente.

A versao 102 de `sync-presenca-emusys` respondeu 200 aos crons reais de
`modo=metadados` depois do deploy. Esses requests nao fecham chamada nem geram
cobertura de presenca, portanto o ledger permaneceu corretamente em zero.

Tambem houve um 500 isolado em uma chamada externa concorrente de metadados as
09:30:46 BRT. O request do cron de Campo Grande concluiu 200 no mesmo minuto,
com snapshot `completo`, e os dois requests seguintes de Barra retornaram 200
as 09:35. Os logs de acesso nao expuseram corpo/origem da chamada que falhou;
portanto a causa desse 500 nao foi inventada nem considerada resolvida. Ele
fica como sinal residual para monitoramento, sem impacto observado no ledger
de presenca e sem justificar cutover.

Os jobs de fechamento de presenca estao ativos e o primeiro ciclo natural da
nova versao ocorre as 00:10, 00:25 e 00:40 BRT, seguido do catch-up das 07:30
BRT. Nenhum sync de presenca foi disparado manualmente, pois isso anteciparia
uma escrita operacional fora do gate independente de roster.

## Integridade e gates remanescentes

A previa read-only posterior ao deploy repetiu os mesmos hashes humanos nas
tres unidades e manteve `alteracao_prevista=false`, sem backfill, sem
soft-inativacao de roster e sem correcao de snapshot. As 21 flags continuam em
`sombra`; nao ha evento de rollout nem superficie em `canonico_v2`.

Permanecem independentes e nao executados:

1. observar o primeiro fechamento natural e comprovar cobertura terminal no
   ledger;
2. revisar e, se necessario, autorizar reparo de roster;
3. autorizar cada onda de consumidores;
4. validar o fluxo autenticado real e monitorar sete dias operacionais.
