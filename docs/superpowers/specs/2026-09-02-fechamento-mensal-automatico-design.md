# Fechamento mensal automático com alarme de falha — design

- **Task:** LAPE-14
- **Data:** 2026-09-02
- **Decisões aprovadas por:** Hugo (02/09/2026)
- **Status:** design aprovado, implementação pendente

## O problema

O fechamento mensal dos dois domínios que a tela consome — `relatorio_admin_mensal` e
`relatorio_comercial_mensal` — é **100% manual**, e a ausência dele é **silenciosa**.

Cronologia de agosto/2026:

| Quando | O quê |
|---|---|
| 31/08 22h BRT | cron jobid 83 roda, responde `succeeded`, captura 7 domínios como `aprovado` |
| 01/09 manhã | Arthur (ADM Barra) clica em *Gerar Relatório* e nada acontece |
| 01/09 ~13h | Arthur reclama — **primeira notícia de que o mês não fechou** |
| 01/09 tarde | fechamento feito à mão, depois de três camadas de investigação |

Julho teve o mesmo padrão (fechado à mão em 01/08). **Junho nunca foi fechado** — segue
`aprovado` até hoje. O cron 83 **nunca fechou nada, em domínio nenhum**: ele só captura.

O requisito central não é a automação em si — é o **alarme**. Automatizar sem aviso apenas
troca "o mês não fecha em silêncio" por "o mês não fecha em silêncio, automaticamente".

## O que já existe (medido em 02/09/2026)

### Cron atual

`cron.job` jobid **83**, `fechamento-mensal-automatico`, schedule `0 1 1 * *`
(01:00 UTC = **22h BRT do último dia do mês**), chama `fechar_competencia_mensal_automatico()`.

Essa função tem guarda `if v_hoje_brt <> v_ultimo_dia then return ignorado` e executa:

1. `gravar_snapshot_fechamento_mensal(ano, mes, null, motivo, true)` — 7 domínios, status `aprovado`
2. `atualizar_dados_mensais_por_snapshot(...)`
3. `capturar_carteira_professores_mensal(...)` — em bloco protegido

Os 7 domínios: `alunos_admin`, `alunos_executivo`, `comercial`, `relatorio_gerencial`,
`relatorio_coordenacao`, `programa_matriculador`, `programa_fideliza`.

**Não estão nessa lista** `relatorio_admin_mensal` nem `relatorio_comercial_mensal`.

### Funções que hoje são chamadas à mão

- `capturar_relatorios_mensais_canonicos_v1(p_ano, p_mes, p_unidade_id)` — grava os 2 domínios
  mensais como `aprovado`. Já itera por unidade ativa, já aceita `p_unidade_id`, já pula unidade
  que tem os 2 domínios (`continue`) e já lança `SNAPSHOT_MENSAL_PARCIAL` quando encontra 1 só.
  Exige `auth.role() = 'service_role'` **ou** `session_user in ('postgres','supabase_admin')`.
- `fechar_competencia_mensal_canonica_v1(p_ano, p_mes, p_motivo)` — promove `aprovado` → `fechado`.

### A cadeia que quebra o relatório

`get_relatorio_admin_mensal_rico_base_v1` exige **9 indicadores** não-nulos e levanta
`RELATORIO_ADMIN_MENSAL_INDICADORES_AUSENTES` se faltar um. Três deles saem do bloco financeiro:

```sql
v_financeiro := coalesce(
    v_gerencial.payload#>'{financeiro_faturas_emusys,totais}',
    v_gerencial.payload#>'{kpis_gestao,0,financeiro_faturas_emusys}',
    v_gerencial.payload#>'{dados_mes_atual,0,financeiro_faturas_emusys}',
    '{}'::jsonb
);
...
v_ticket_medio         := nullif(v_financeiro->>'ticket_medio', '')::numeric;
v_faturamento_previsto := nullif(v_financeiro->>'faturamento_previsto', '')::numeric;
v_mrr_atual            := nullif(v_financeiro->>'mrr_atual', '')::numeric;
```

⚠️ **A leitura aceita três formas do bloco.** Julho usa a chave de topo com `.totais`; o v2 de
agosto (feito à mão em 01/09) usa `kpis_gestao[0]`. As duas funcionam — o conserto precisa
gravar em **uma** delas, não em nenhuma.

O snapshot `relatorio_gerencial` é montado por `get_dados_relatorio_gerencial`, que produz
`ticket_medio`/`faturamento_previsto`/`mrr` a partir do **cadastro local** (`fonte: "vivo"`) e
**não busca as faturas do Emusys** — não menciona `financeiro_faturas_emusys` em lugar nenhum.
Das 12 assinaturas da família, só a legacy `..._rankings_p24_20260719` menciona.

Diff medido entre as duas versões de agosto (Recreio, unidade `95553e96`):

| campo em `kpis_gestao[0]` | v1 (cron 31/08) | v2 (à mão 01/09) |
|---|---|---|
| `financeiro_faturas_emusys` | **ausente** | presente |
| `faturamento_previsto` | 146.539,05 | 144.786,97 |
| `faturamento_realizado` | 146.134,05 | 143.346,97 |
| `inadimplentes` | 1 | 3 |
| `inadimplencia_valor` | R$ 405 | R$ 1.440 |

⚠️ **O passo 3 escrito na LAPE-14 não resolve.** `aplicar_retificacao_relatorio_gerencial_financeiro_v1`
grava em `fechamento_mensal_retificacoes`, e `get_relatorio_admin_mensal_rico_base_v1` lê
`v_gerencial.payload` — o payload **cru** do snapshot. Isso foi provado em 01/09: as três
retificações aplicadas ficaram corretas e **inertes**. O que destravou agosto foi regravar o
snapshot (cascata de v2), não retificar.

### Fonte financeira desbloqueada, mas não consumida

A migration `20260901192821_financeiro_faturas_bloqueio_proporcional` fez
`get_financeiro_faturas_emusys` parar de bloquear por `matricula_id/contrato_id = 0` (cobrança
avulsa legítima) e por `source_missing`. Os 6 pares (mês × unidade) passaram a devolver
`ok`/`tem_dados=true`. **A fonte está boa; ninguém a chama na captura.**

## Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Escopo | Consertar a origem do bloco financeiro **junto** com a automação | Sem isso a automação roda, falha em `INDICADORES_AUSENTES` e alarma todo mês — entregaria alarme funcionando sobre um fechamento que nunca fecha |
| Onde executa | **pg_cron** (banco), dia 1º às 9h BRT | O trabalho é SQL puro; não depende da VPS |
| Onde alarma | **la-hq**, job separado, 11h BRT | Executor e alarme falham de forma independente |
| Trava numa unidade | **Fecha as que passam**, avisa a que travou | Em agosto, Barra e Recreio estavam prontas e só CG travava por causa de um aluno |
| Aviso de sucesso | **Sim**, uma linha por mês | Sem ela, "nenhuma mensagem" é indistinguível de "a tarefa morreu e nem rodou" — o caso de 27/08 |
| Captura das 22h | **Move para o dia 1º** | Hoje fotografa o mês com 2h ainda por correr |

### Fora de escopo (explícito)

- 🚫 **Não enviar relatório para ninguém.** Os usuários continuam gerando manualmente pelo botão
  em Administrativo → Gerar Relatório. O único disparo automático é o alerta de falha, para a
  equipe técnica.
- 🚫 **Não automatizar correção de dado que exige julgamento humano** — transferência de unidade,
  passaporte lançado avulso, classificação de bolsista. As travas existem para parar quando o
  dado não fecha; passar por cima seria pior que o problema.
- 🚫 **Não fechar junho retroativamente.** Decisão separada (segue `aprovado` desde 30/06).

## Arquitetura

Três componentes, com falha independente.

```
pg_cron (dia 1º, 09:00 BRT)
   └─> fechar_competencia_mensal_dia1_v1()
         ├─ por unidade, em bloco protegido:
         │   1. valida frescor da fonte financeira
         │   2. garante bloco financeiro no snapshot gerencial
         │   3. captura os 2 domínios mensais
         │   4. fecha a competência DAQUELA unidade
         └─> grava placar em fechamento_mensal_execucoes

crontab la-hq (dia 1º, 11:00 BRT)
   └─> flock + cron-alerta.py fechamento-mensal-check
         └─> verifica-fechamento-mensal.py
               ├─ tudo fechado -> imprime resumo, exit 0 -> posta linha de sucesso
               └─ faltando     -> imprime unidade + trava + aluno, exit 1 -> alarme 🔴
```

### Componente 1 — bloco financeiro na captura

Uma função `garantir_bloco_financeiro_gerencial_v1(p_ano, p_mes, p_unidade_id)` que:

1. lê o snapshot `relatorio_gerencial` vigente da unidade (maior `versao`);
2. se já tem o bloco em qualquer das três formas aceitas, retorna `ja_presente` sem escrever;
3. senão, calcula o bloco a partir de `get_financeiro_faturas_emusys` e grava **nova versão** do
   snapshot com o bloco em `kpis_gestao[0].financeiro_faturas_emusys`, além dos campos
   derivados (`faturamento_previsto`, `faturamento_realizado`, `inadimplentes`,
   `inadimplencia_valor`, `inadimplencia_pct`);
4. se a fonte financeira responder `tem_dados = false`, **não grava** e devolve o motivo —
   fail-closed, para o alarme dizer "fonte financeira indisponível" em vez de fechar o mês com
   número errado.

**Forma canônica escolhida:** `kpis_gestao[0].financeiro_faturas_emusys`, que é a do v2 de agosto
e já foi validada de ponta a ponta (o relatório abriu nas 3 unidades).

⚠️ `capturado_em` é **preservado** da versão anterior — ele é o corte
(`a.created_at <= capturado_em`) que a lista do relatório usa.

⚠️ A ordem importa: `montar_relatorio_admin_mensal_payload_v1` busca o gerencial com
`order by s.versao desc`, então o bloco tem de existir **antes** da captura dos 2 domínios
mensais. Foi exatamente essa ordem que funcionou em 01/09.

### Componente 2 — orquestrador do dia 1º

Função `fechar_competencia_mensal_dia1_v1()`, chamada por pg_cron novo, `0 12 1 * *`
(12:00 UTC = **09:00 BRT**).

Competência alvo = **mês anterior** ao dia corrente BRT.

Para cada unidade ativa, dentro de `begin ... exception when others`:

1. **Frescor da fonte financeira** — `financeiro_sync_queue` da competência com `succeeded` e
   `get_financeiro_faturas_emusys` com `tem_dados = true`. Se não, registra e passa para a
   próxima unidade.
2. `garantir_bloco_financeiro_gerencial_v1(ano, mes, unidade)`
3. `capturar_relatorios_mensais_canonicos_v1(ano, mes, unidade)`
4. `fechar_competencia_mensal_canonica_v2(ano, mes, motivo, unidade)`

O bloco `exception` em PL/pgSQL abre uma subtransação: **falha numa unidade não desfaz as
outras**. Cada erro é capturado com `sqlstate`, `sqlerrm` e a unidade, e vai para o placar.

Ao final, grava uma linha em `fechamento_mensal_execucoes` (tabela nova) com o placar completo,
e devolve o mesmo jsonb.

#### `fechar_competencia_mensal_canonica_v2` — por que uma função nova

A v1 é **tudo-ou-nada por construção**: varre todas as unidades ativas, exige os 6 domínios em
cada uma e lança `FECHAMENTO_RELATORIO_MENSAL_INCOMPLETO` se faltar. Não aceita unidade.

A v2 recebe `p_unidade_id`, valida os 6 domínios **daquela** unidade, chama
`fechar_competencia(unidade, ano, mes, origem, motivo, lote)` — a peça granular que já existe —
e faz o UPDATE de `aprovado` → `fechado` **filtrando por unidade**.

⚠️ O UPDATE da v1 é global (`where ano = ... and mes = ... and status = 'aprovado'`), **sem
filtro de escopo**, e há **11 snapshots de escopo `consolidado`** em 2026. A v2 precisa filtrar
`escopo = 'unidade' and unidade_id = p_unidade_id`, senão fechar uma unidade carimbaria o
consolidado junto.

⚠️ **Criar como função nova, não `CREATE OR REPLACE` da v1 com parâmetro a mais.** Assinatura
diferente cria overload, e overload com `DEFAULT` produz `function is not unique` para quem
chama posicionalmente — foi o incidente de 11/08 com `upsert_lead` (22 leads perdidos em 21h).
A v1 fica intacta, com seus consumidores atuais.

#### Item 4 — mover a captura das 22h

A captura dos 7 domínios precisa acontecer **antes** do orquestrador, e com o mês já encerrado.

**Escolhido:** o orquestrador chama `fechar_competencia_mensal_automatico()` como **passo 0**, e o
jobid 83 é **desativado** (`cron.alter_job(83, active => false)` — desativado, não deletado, para
o rollback ser uma linha). Uma sequência só, ordem garantida, um ponto de falha a observar.

Isso exige trocar a guarda de `fechar_competencia_mensal_automatico()`, que hoje é
`if v_hoje_brt <> v_ultimo_dia then return ignorado` — ela recusaria rodar no dia 1º. A guarda
nova: **executa no dia 1º, competência = mês anterior**.

⚠️ Essa função também chama `atualizar_dados_mensais_por_snapshot` e
`capturar_carteira_professores_mensal`, que passam a rodar com o mês fechado de verdade. É o
efeito desejado, mas muda os números de `dados_mensais` em relação ao que a foto das 22h produzia
— conferir no ensaio de setembro se a diferença aparece e se é a esperada (movimentação lançada
entre 22h e a virada).

**Descartada:** dois crons em horários escalonados (09:00 e 09:15). A ordem passaria a depender de
o primeiro terminar a tempo, e ele levou 58s em agosto sem teto conhecido.

### Componente 3 — vigia na la-hq

Script `verifica-fechamento-mensal.py` em `/home/sol/.openclaw/workspace/scripts/`, versionado em
`fiscal mila/agents/sol/scripts/`. Crontab do user `sol`:

```cron
0 14 1 * * /usr/bin/flock -n /home/sol/.openclaw/workspace/locks/fechamento-mensal.lock \
  /home/sol/.openclaw/workspace/scripts/cron-alerta.py fechamento-mensal \
  /home/sol/.openclaw/workspace/scripts/verifica-fechamento-mensal.py \
  >> /home/sol/.openclaw/workspace/logs/fechamento-mensal.log 2>&1
```

(14:00 UTC = 11:00 BRT, 2h depois do orquestrador.)

O script consulta `fechamento_mensal_snapshots` da competência anterior e pergunta: os domínios
`relatorio_admin_mensal` e `relatorio_comercial_mensal` estão `fechado` nas 3 unidades ativas?

- **Sim** → imprime `setembro/2026 fechado — 3 unidades` e sai com **0**. Como o `cron-alerta.py`
  não posta nada em caso de sucesso (é a regra de ruído dele, e não deve ser alterada — 29 jobs
  dependem dela), o aviso mensal de sucesso é enviado **pelo próprio script**, uma vez, direto ao
  tópico Logs. Ele reaproveita o mesmo canal e o mesmo token do wrapper: `TELEGRAM_BOT_TOKEN` lido
  de `/home/sol/.openclaw/gateway.systemd.env`, `chat_id` `-1003443031930`,
  `message_thread_id` `727`. Falha no envio **não** altera o código de saída — o script já cumpriu
  o papel dele ao confirmar que o mês fechou.
- **Não** → imprime a lista de unidades pendentes com o erro registrado em
  `fechamento_mensal_execucoes` (que carrega `sqlerrm`, e portanto o nome do aluno quando a trava
  diz) e sai com **1** → o `cron-alerta.py` publica 🔴 com o trecho.

⚠️ O wrapper vai **dentro** do `flock`, nunca antes: `flock -n` sai com código 1 quando o lock
está ocupado, que é situação normal e viraria alarme falso.

⚠️ O lock fica em `/home/sol/.openclaw/workspace/locks/`, **não em `/tmp`** — o incidente de
27/08 (modo 755) provou que `/tmp` não é confiável para isso.

## Riscos e armadilhas conhecidas

| Risco | Mitigação |
|---|---|
| `statement_timeout` de 8s herdado do papel `authenticator` atinge até `service_role`; o fechamento levou 58s em agosto | `ALTER FUNCTION fechar_competencia_mensal_dia1_v1 SET statement_timeout = '300s'` — por função, nunca no papel. Mesmo padrão de `publish_financeiro_sync_run` (migration `20260828210500`) |
| pg_cron marca `succeeded` mesmo quando a função falha (só avalia o enfileiramento) | É a razão de existir o componente 3. **Nunca** validar o fechamento por `cron.job_run_details` |
| Recriar função reabre `EXECUTE` para `anon` (`ALTER DEFAULT PRIVILEGES` no schema `public`) | `revoke execute ... from anon` nominal e conferir `proacl` depois de cada `CREATE OR REPLACE`. Esperado: `{postgres=X, authenticated=X, service_role=X}` |
| Um disparo de cron pode virar 2-4 execuções da mesma função (documentado, causa fora do nosso alcance) | O orquestrador é idempotente por construção: `capturar_relatorios_mensais_canonicos_v1` faz `continue` quando os 2 domínios já existem, e a v2 de fechamento só promove `status = 'aprovado'`. Uma segunda execução não duplica nem reescreve |
| Fonte financeira indisponível no dia 1º | Passo 1 valida antes; sem `tem_dados` a unidade não fecha e o alarme diz o motivo. Melhor não fechar que fechar errado |
| VPS fora do ar no dia 1º | O fechamento acontece de qualquer forma (é no banco). Perde-se só o aviso — e o mês seguinte denuncia a competência aberta |
| Nova versão do snapshot gerencial muda número já publicado | O componente 1 só age quando o bloco está **ausente**; nunca sobrescreve bloco existente. Versão anterior é preservada (`aprovado`), o histórico continua auditável |

## Testes

1. **Ensaio em seco de setembro/2026 antes de ligar o cron** — rodar o orquestrador à mão para as
   3 unidades e conferir que os 2 domínios ficam `fechado` e que
   `get_relatorio_admin_mensal_rico_v1` abre nas 3.
   ⚠️ Lição de 01/09: o dry-run tem de cobrir a **leitura**, não só a captura. O teste daquele dia
   validou `montar_relatorio_*_payload_v1` (passou) e não `get_relatorio_admin_mensal_rico_v1`
   (que era onde estava o problema).
2. **Reprodução do caso de agosto** — simular unidade travada e provar que as outras duas fecham e
   que o placar registra a que falhou com o `sqlerrm` completo.
3. **Idempotência** — rodar o orquestrador duas vezes seguidas e provar que a segunda não cria
   versão nova nem altera `fechado_em`.
4. **Alarme** — forçar exit 1 no vigia e conferir a mensagem no tópico Logs; depois forçar o
   caminho de sucesso e conferir a linha única.
5. **ACL** — `select proacl from pg_proc` nas funções novas e recriadas, conferindo ausência de
   `anon`.

## Rollback

- `select cron.alter_job(<jobid do cron novo>, active => false);` desliga o fechamento automático.
- `select cron.alter_job(83, active => true);` devolve o cron antigo ao ar. ⚠️ Se a guarda de
  `fechar_competencia_mensal_automatico()` já tiver sido trocada para "dia 1º", o rollback
  completo exige restaurar também a guarda de último dia — por isso a migration que a altera deve
  trazer o corpo anterior comentado no cabeçalho.
- Comentar a linha do vigia no crontab da la-hq.
- As funções novas são aditivas: `fechar_competencia_mensal_canonica_v1` fica intacta, e o
  fechamento manual continua disponível exatamente como é hoje.

## Pendências relacionadas (não resolvidas aqui)

- **LAPE-15** — Campo Grande não gera relatório mensal de julho (`RENOVACOES_MENSAL_DIVERGENTE`).
  Independente: julho está fechado e o payload congelado; a falha é na leitura.
- **LAPE-16** — `tipo_aluno` × `tipo_matricula_id` (19 registros discordantes). Foi essa
  contradição que travou a captura de agosto em CG.
- A trava `SNAPSHOT_COMERCIAL_DIVERGENTE` compara um número **congelado** com um cálculo **vivo**
  sobre o cadastro, que muda depois do fechamento. Ela vai voltar a disparar em outros meses, por
  outras razões — o alarme torna isso visível, mas não elimina a causa.
