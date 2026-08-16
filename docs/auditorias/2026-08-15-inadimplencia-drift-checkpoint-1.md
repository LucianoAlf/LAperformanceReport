# Inadimplência — checkpoint 1: migrations e drift

Data: 15/08/2026
Projeto: `ouqwbbermlzqqvtqwlul`
Branch: `fix/inadimplencia-canonica-frescor`

## Resultado

As quatro migrations aplicadas no banco estavam ausentes do `origin/main`. Elas
foram restauradas byte a byte no mesmo diretório e na mesma ordem de versão:

- `20260815222313_sol_caixa_inadimplentes.sql`
- `20260815222416_sol_caixa_inadimplentes_v2_dedupe.sql`
- `20260815224037_sol_caixa_inadimplentes_v3_juros_faixas.sql`
- `20260815231546_sol_caixa_inadimplentes_v4_sync_run_items.sql`

Conferência independente: o MD5 dos `statements` armazenados em
`supabase_migrations.schema_migrations` coincide com o MD5 do arquivo local em
todas as quatro versões:

| Versão | MD5 |
| --- | --- |
| 20260815222313 | `d7cc9edd77b3db7f36dc4273163d556f` |
| 20260815222416 | `8e164ec0456c7dc83e03505ad7a256af` |
| 20260815224037 | `44a3d63f74636ad34a2bfd18bab0e26d` |
| 20260815231546 | `097a166e5f7be979e91791d6a27ebc14` |

A implementação histórica atualmente registrada no banco é a v4. A leitura
parte do último run `live` concluído por competência, exige
`snapshot_complete = true` e `unidades_concluidas = 3`, filtra
`status = 'aberta'` e exclui `source_missing = true`. Esse último filtro é
apenas uma confirmação de origem: ausência no payload não é tratada como
pagamento.

Este checkpoint restaura o histórico; ele não declara a v4 como a leitura
canônica final. A leitura canônica do próximo checkpoint acrescentará o gate
de frescor, a seleção estrita de `source_missing IS FALSE` e a manifestação
explícita de competências sem snapshot atual.

## Evidência remota consultada

- `public.sol_caixa_inadimplentes(uuid, integer, numeric, numeric, integer, integer)`
  existe no banco e lê `sync_run_items`.
- `EXECUTE` está concedido a `service_role`; `anon` e `authenticated` não têm
  privilégio de execução.
- A função calcula o valor contratual com multa e mora pro rata e mantém a
  compatibilidade do nome usado pelo consumidor da Sol.

## Fronteira preservada

Este checkpoint não altera nenhuma RPC operacional da Sol:

- lançamento de recebimento;
- abertura/fechamento de caixa;
- casamento de parcela.

Também não aplica migration nem faz escrita no banco remoto. A aplicação em
produção de novas mudanças fica para o checkpoint de publicação, depois da
revisão do diff e do gate de sync controlado.

## Limite de reexecução

As quatro versões são restaurações históricas byte a byte. A sequência é
reproduzível em um banco vazio, mas não deve ser reaplicada sobre um banco que
já tenha a v4: as versões anteriores recriam assinaturas intermediárias por
design. Qualquer endurecimento futuro deve ser uma nova migration, preservando
estes arquivos e seus hashes.

## Teste de drift

`tests/inadimplenciaMigrationDrift.test.mjs` falha se qualquer uma das quatro
versões desaparecer, se a v4 deixar de usar o snapshot completo / origem
confirmada, ou se uma RPC operacional da Sol for tocada por acidente.
