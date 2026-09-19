# Financeiro Emusys: frescor por dia e fila durável

## Objetivo

Corrigir o espelho de lançamentos financeiros para que um dia só seja considerado concluído depois de encerrado no fuso de São Paulo, seja revalidado enquanto ainda pode receber lançamentos tardios e nunca desapareça silenciosamente quando a API Emusys devolver HTTP 429.

O formato das tabelas `financeiro_emusys_*`, o formato do export e a granularidade item a item permanecem iguais. A fila operacional nova fica em `sync_financeiro_emusys_queue`.

## Regras de frescor

- A rotina diária varre sempre os dez dias encerrados mais recentes, inclusive os que já estejam com `status='completo'`.
- O limite superior é ontem no fuso `America/Sao_Paulo`. Uma chamada explícita também não pode concluir hoje ou uma data futura.
- Cada passada bem-sucedida substitui `concluido_em` pela hora dessa última varredura e atualiza `itens`.
- Um erro mantém o dia pendente, grava `ultimo_erro` e impede o avanço de `ultima_varredura_completa_em`.
- Execuções sem catálogos preservam `catalogos_erro`; não apagam a última evidência disponível.
- A revarredura semanal cobre o primeiro dia do mês anterior até ontem, aos domingos às 04:00 UTC.

## Fila e erros HTTP

- Todo trabalho de lançamentos passa por uma fila serial com claim atômico, lease e no máximo três novas tentativas além da tentativa inicial.
- O worker renova o lease antes de cada escrita; um lease vencido não pode mais gravar itens, `sumiu_em`, status ou resumo. Cada chamada HTTP tem timeout de 30 segundos e o lease inicial é de 600 segundos.
- HTTP 429 vira `EMUSYS_HTTP_429`, é persistido imediatamente em `financeiro_emusys_varredura_resumo.ultimo_erro` e reagendado para 30 minutos depois.
- HTTP 5xx usa `EMUSYS_HTTP_5XX`. Não há sleep longo dentro da Edge Function.
- Um job em execução ou aguardando retry do espelho bloqueia o claim da fila de faturas. O claim das duas filas usa o mesmo mutex transacional para impedir corrida.
- A janela diária do financeiro fica reservada entre 09:00 e 10:59 UTC. Novos claims de faturas param às 08:45 UTC, antes de um lease de 15 minutos poder atravessar a janela.
- `faturas_pagas_no_mes` usa uma fila durável própria. O cron das 05:00 UTC sempre persiste o pedido; o worker pode drenar essa fila às 05:00 e a retoma depois se a fila de lançamentos ainda estiver ativa. Os outros produtores de faturas ficam pausados nessa hora.
- Cada competência de `faturas_pagas_no_mes` vira três jobs, um por unidade. Cada worker usa orçamento de 100 segundos e processa no máximo 25 páginas por claim. Cursor e contadores são gravados a cada página; quando ainda há páginas, o job libera o lease e continua do cursor no worker seguinte, limitado a 200 páginas.

## Recuperações de 20/09

- Às 01:00 UTC, enfileirar julho até 18/09 em blocos de até dez dias, nas três unidades.
- Às 03:05 UTC, já depois da virada do dia em São Paulo, enfileirar a janela diária 10–19/09. Assim 19/09 só poderá receber `completo` depois de encerrado.
- Às 03:30 UTC, enfileirar as competências de faturas de janeiro a maio de 2026. O processamento espera a fila de lançamentos terminar e continua serialmente.
- Os jobs extraordinários se removem do `pg_cron` depois do disparo.
- O script legado de backfill agora enfileira somente dias encerrados e acompanha os IDs até todos chegarem a `succeeded`; resposta `202` não é tratada como conclusão.
- No rollout, as duas Edges toleram temporariamente a ausência das novas RPCs. `sync-faturas-emusys` continua drenando a fila atual e `sync-financeiro-emusys` atende o cron antigo pelo caminho direto até a migration instalar filas e crons de forma atômica.

## Aceite e evidência

Baseline de itens ativos em `financeiro_emusys_lancamentos`, capturado em 19/09:

| Unidade | 14/09 | 15/09 | 16/09 | 17/09 | 18/09 | 19/09 |
|---|---:|---:|---:|---:|---:|---:|
| Barra | 12 | 0 | 7 | 26 | 14 | 0 |
| Campo Grande | 10 | 2 | 18 | 5 | 0 | 0 |
| Recreio | 30 | 0 | 18 | 2 | 0 | 8 |

Depois da recuperação serão registrados, por unidade e dia, itens ativos, itens marcados com `sumiu_em`, `status`, `itens`, `iniciado_em`, `concluido_em`, `ultima_tentativa_em` e erro. A aceitação final compara esse quadro com o extrato bancário sem agregar ou alterar os itens exportados.

## Verificação

- Testes puros cobrem a janela de dez dias, a exclusão de hoje, a janela semanal, a divisão em blocos e a classificação 429/5xx.
- Testes de contrato cobrem fila, claim/lease, três retries de 30 minutos, horários, bloqueio entre filas e jobs extraordinários.
- Depois do deploy, validar versão e `verify_jwt`, migration aplicada, crons, invalidação dos registros prematuros de 19/09 e estado inicial das duas filas.
- Depois dos jobs noturnos, capturar o quadro antes × depois de 14–19/09 e a cobertura de `emusys_faturas` de janeiro a maio por unidade.
