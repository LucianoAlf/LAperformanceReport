# Desempenho do banco — criar sem explodir o processamento

> Criado em 25/09/2026 depois da queda de 17h10–17h27 BRT (LAPE-45). Criar função, cron,
> gatilho ou cache é fácil; o difícil é que ele caiba na máquina **24 horas por dia**, somado a
> tudo o que já roda. Esta regra vale para qualquer objeto novo no banco do LA Report.

## A máquina é pequena — e isso é o orçamento

> **Desde 26/09/2026 09h17 BRT o compute é Small** (1,9 GB de RAM, **90 conexões**,
> `shared_buffers` 512 MB, `work_mem` 5 MB), e o banco caiu de 22 GB para **9 GB** depois do
> expurgo + `VACUUM FULL` do `sync_run_items` (13 GB → 592 MB). Continua *burstable* e com cota
> de IO: as regras abaixo valem igual. O texto seguinte descreve o Micro, onde tudo começou.

`t4g.micro`: **1 GB de RAM**, 2 vCPU *burstable*, cota de IO pequena, **60 conexões**,
`work_mem` 3,4 MB, paralelismo ~1. Banco com ~22 GB. Consequência: quase nada cabe em
memória, então **toda varredura vira leitura de disco**, e o disco tem cota.

- **Espaço em disco ≠ Disk IO.** Pode sobrar espaço e o disco estar travado: a porta é estreita.
- **Espera por disco aparece como CPU alta** no painel.
- **Consulta lenta segura conexão.** Com 60 no total, poucas consultas de 60–90 s esgotam o
  pool e o app inteiro para (login incluso). Foi o que aconteceu em 22/09 e em 25/09.

## O que derrubou o banco (para não repetir)

| Data | Causa | Custo medido |
|---|---|---|
| 22/09 | 3 `refresh-situacao-snapshot-*` no **mesmo segundo**, a cada 5 min | 87–96 s cada, pool esgotado |
| 23→25/09 | `dashboard-aquecer-caches` a cada 4 min recalculando ~70 RPCs, com o cache por versão invalidado ~500×/h | **9.420 s de banco/dia**; Disk IO 100% por 3 dias; queda |
| contínuo | tabela que só cresce, sem retenção (`sync_run_items` 13 GB, `cron.job_run_details` 680 MB) | empurra o dado útil para fora da RAM |

## Checklist obrigatório antes de criar (cron, gatilho, cache, RPC pesada, tabela)

1. **Custo por dia, não por execução.** `custo = duração × frequência`. 25 s parece pouco; a
   cada 4 min são 2h37/dia. Escrever o número no cabeçalho da migration.
2. **Medir antes de ligar**, com `EXPLAIN (ANALYZE, BUFFERS)` **a frio e sob carga**, olhando
   `shared read` (disco) e `temp written` (spill), não só o tempo com cache quente.
3. **Por que essa frequência?** A frequência tem de sair de quem lê o dado, não do "quanto mais
   fresco melhor". Se ninguém olha às 3h, o job não roda às 3h.
4. **Trabalho sob demanda > trabalho especulativo.** Pré-calcular (aquecer, snapshot) só se paga
   quando o resultado é **lido mais vezes do que é recalculado**. Cache que invalida mais rápido
   do que o aquecedor roda é recálculo puro.
5. **Nunca no mesmo segundo.** Jobs pesados escalonados (minutos diferentes) e fora do pico da
   equipe (tarde BRT). Pesado de verdade: janela da madrugada.
6. **Leitura incremental.** Ler só o que mudou desde a última vez (por chave/`id > último`),
   nunca varrer a tabela inteira a cada execução.
7. **Toda tabela que cresce nasce com retenção** (cron de limpeza + prazo declarado). `DELETE`
   não devolve disco — planejar `VACUUM FULL`/`pg_repack` quando o volume for grande.
8. **Gatilho em tabela quente** custa em **cada escrita**. Conferir quantas escritas/hora a tabela
   recebe antes de pendurar trabalho nela.
9. **Teto próprio** (`statement_timeout` na função) e trava de reentrada
   (`pg_try_advisory_xact_lock`) em todo job agendado.
10. **Se proteger quando o banco está no vermelho:** job não essencial deve pular a rodada se
    houver pressão (conexões altas), em vez de somar peso.
11. **Função que GRAVA cache contamina quem a chama.** O PostgREST roda RPC `STABLE`/`IMMUTABLE`
    em transação **read-only**: se ela chega (direta ou indiretamente) numa função que grava
    cache, falha com `25006 cannot execute INSERT in a read-only transaction` — **só quando o
    cache está vazio**, então passa em teste com cache quente e quebra em produção. Os caches de
    23–25/09 deixaram **41** funções assim; a Mila ficou sem `numeros_do_mes` de 26 a 29/09 e
    respondeu com número velho. Ao criar cache: marcar `VOLATILE` todo o fecho de chamadores
    (query pronta na migration `20260930130000_funcoes_que_alcancam_cache_viram_volatile.sql`)
    e testar **pela API com o cache vazio** — `set transaction_read_only` na mão não serve, ele
    força read-only mesmo em função `VOLATILE`.

## Como ficar de olho sempre

- **Depois de ligar algo novo, medir de novo em 24h e em 7 dias**: `cron.job_run_details`
  (duração média e máxima subindo?) e `pg_stat_statements` (quem lidera tempo e `shared_blks_read`).
  Registrar como 👁️ OBSERVAR com a query pronta.
- **Tendência > valor pontual.** Um job que dobra de duração em 2 dias (17 s → 34 s) é aviso,
  mesmo que 34 s pareça aceitável.
- **Monitor contínuo (LAPE-46):** CPU, RAM, swap, Disk IO, conexões e disco persistidos por
  minuto, ranking de consumidores a cada 5 min e alerta no Telegram. O primeiro lugar para olhar
  depois de qualquer mudança é o ranking.
- **Diagnóstico não pode pesar:** consultar `cron.job_run_details` inteiro custa ~660 MB de
  leitura por consulta. Filtrar por `jobid` e janela, e fazer uma varredura só.
