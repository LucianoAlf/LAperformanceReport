# Fechamento de produção — presença, roster e consumidores

Data do fechamento técnico: 2026-08-28 (BRT)

Projeto Supabase: `ouqwbbermlzqqvtqwlul`
Escopo: Emusys, Agenda/Chamada do LA Report, LA Teacher, Fábio, Sol, Lia,
Mila, relatórios, KPIs e Health Score Professor V3.

## Resultado

O incidente que impedia ou tornava instável o registro de presença foi tratado
na cadeia completa. O frontend usa o protocolo durável do backend; o sync do
Emusys não pode disputar a mesma unidade com outro modo nem transformar
ausência bruta em falta; decisões humanas fortes têm precedência; consultas por
período deixaram de extrapolar o timeout; e os agentes leem somente RPCs
governadas.

Não houve escrita artificial de presença em produção para validar o release.
As contraprovas foram feitas com fixtures descartáveis, consultas read-only,
histórico operacional real já existente e navegador autenticado.

O cutover de leitura permanece deliberadamente em `sombra`: 21 de 21 flags,
três unidades por sete superfícies. Isso não reabre o incidente de escrita. A
ativação de `canonico_v2` continua condicionada à janela operacional aprovada de
sete dias e não deve ser antecipada por migration ou alteração direta.

## Causas confirmadas e correções

| Causa | Efeito observado | Correção estrutural |
|---|---|---|
| Backend durável ainda não convergido com os consumidores do frontend | A interface podia aparentar sucesso ou repetir a intenção sem reconciliar o recibo persistido | PR #246 conectou Agenda, Conciliação, agentes e indicadores aos adapters; a carteira de `request_id` reconcilia o recibo antes de liberar intenção oposta |
| Leases separadas por modo, e não pela unidade inteira | Presença e metadados podiam disputar o mesmo roster e deixar execução pendurada | PR #253 serializa qualquer modo pela unidade e mantém unidades diferentes paralelas |
| Backlog monolítico de 14 dias | A Edge ultrapassava sua janela real e deixava a última lease aberta até expirar | PR #257 substituiu o worker por três jobs unitários, com até três dias por execução e ciclo completo em cinco fatias |
| Fotografia vazia sem distinção entre “vazio válido” e “origem incompleta” | Um domingo ou unidade sem aula podia falhar indevidamente | PR #255 só conclui vazio quando a origem e a base local estão vazias; qualquer assimetria falha fechada |
| Views por período expandiam o universo antes de escopar unidade e data | Agenda, métricas mensais e Health Score podiam exceder 30–45 s | PRs #259–#262 adicionaram índices, escopo precoce, materialização diária e helper por unidade/data |
| Default privileges históricos concediam a view métrica aos papéis dos agentes | Sol, Lia, Mila e Fábio poderiam contornar a RPC de finalidade | PR #263 revogou o acesso direto; somente adapters governados ou `service_role` alcançam o kernel |
| Ausência bruta do Emusys era ambígua para consumidores | Um “ausente” da origem podia ser apresentado como falta sem decisão terminal | A ocorrência v2 preserva a evidência bruta, mas só publica falta terminal; falta de linha e sync incompleto permanecem indeterminados |
| A view de saúde juntava confirmações somente por `aula_id` e tratava `sync_ausente_emusys` como origem humana | Reagendamentos corretamente invalidados apareciam como três presenças e dois cancelamentos “revertidos” no Recreio | A migration `20260828095344` casa professor, data e aula da ocorrência atual, ignora limpeza posterior auditada e conta cancelamento humano somente quando a origem é `agenda_secretaria` |

O fluxo convergido entrou em `main` nos PRs #246–#264. O último merge antes
deste relatório foi `a7dad4b0` (PR #264).

## Objetos publicados

Últimas migrations de hardening verificadas no ledger remoto:

- `20260828065936_presenca_sync_serializacao_unidade`;
- `20260828065944_presenca_sync_crons_sem_colisao`;
- `20260828072309_presenca_roster_fotografia_vazia_segura`;
- `20260828075355_presenca_backlog_fatiado_por_unidade`;
- `20260828083539_presenca_ocorrencia_canonica_v2_indices`;
- `20260828083733_presenca_ocorrencia_canonica_v2_otimizada`;
- `20260828084658_presenca_pendencias_view_escopo`;
- `20260828085519_presenca_pendencias_view_materializada`;
- `20260828091909_presenca_consumidores_periodo_materializados`;
- `20260828092831_presenca_metrica_acl_agentes`;
- `20260828095344_presenca_saude_professor_reagendamento`.

Edge Functions ativas:

| Função | Versão | Estado | Autorização preservada |
|---|---:|---|---|
| `sync-presenca-emusys` | 104 | `ACTIVE` | `verify_jwt=false`, token interno validado |
| `sync-grade-futura-emusys` | 36 | `ACTIVE` | `verify_jwt=true` |

## Evidência de produção

### Cobertura e sincronização

Recorte BRT de 14 dias, capturado em 2026-08-28:

| Unidade | Dias concluídos | Páginas | Aulas | Presenças recebidas | Não concluídos |
|---|---:|---:|---:|---:|---:|
| Barra | 14/14 | 17 | 1.125 | 1.150 | 0 |
| Campo Grande | 14/14 | 24 | 1.665 | 1.978 | 0 |
| Recreio | 14/14 | 24 | 1.570 | 1.726 | 0 |

- execuções `iniciada`: 0;
- leases ativas: 0;
- leases expiradas: 0;
- seis invocações mais recentes de `sync-presenca-emusys` v104: seis HTTP
  200, nenhum 4xx/5xx;
- falhas anteriores de Campo Grande e Recreio foram seguidas por conclusão
  posterior nos mesmos pares unidade/modo; `falha_posterior=false` nos seis
  pares de presença/metadados.

O shadow read-only de 2026-08-14 a 2026-08-27 fechou 42 recortes
unidade/dia: 4.319 linhas no universo legado, 2.089 ocorrências v2 e
`sem_explicacao=0`. O delta é integralmente classificado por duplicidade do
Emusys, precedência humana, política temporal, colisão de curso ou roster
fantasma. `sync_incompleto=0`.

A contraprova da proteção de decisões humanas inicialmente encontrou três
contagens de presença e duas de cancelamento no Recreio. A inspeção por
ocorrência mostrou apenas duas aulas locais: ambas tinham confirmação anterior
a uma limpeza auditada por reagendamento; uma também carregava
`cancelada_origem=sync_ausente_emusys`, que não é cancelamento humano. Após a
correção da observabilidade, a janela real de sete dias ficou:

| Unidade | Marcações humanas | Revertidas | Cancelamentos humanos desfeitos | Sem procedência |
|---|---:|---:|---:|---:|
| Barra | 119 | 0 | 0 | 0 |
| Campo Grande | 379 | 0 | 0 | 0 |
| Recreio | 272 | 0 | 0 | 0 |

O índice parcial do evento de limpeza foi criado e a view continua sinalizando
uma sobrescrita genuína: o fixture PostgreSQL mantém deliberadamente um caso
sem evento de reagendamento e exige `revertidas=1`.

### Escritores reais, sem fixture em produção

Nas 24 horas anteriores a 2026-08-28 06:44 BRT, o ledger durável continha:

| Origem | Comandos concluídos | Itens aplicados | Rejeitados |
|---|---:|---:|---:|
| Secretaria/Agenda | 207 | 207 | 0 |
| Professor/LA Teacher | 1 | 1 | 0 |
| Fábio/áudio | 4 | 4 | 0 |

Havia zero comando parado em `recebido` ou `processando` por mais de dois
minutos. Três comandos antigos da Agenda falharam antes do fechamento com os
códigos fechados `ITENS_REJEITADOS`/`SEM_AULAS_ALVO`; nenhum dado sensível foi
registrado no erro. Ainda não há uma escrita humana real posterior ao último
deploy porque a validação terminou antes do início do expediente; esse primeiro
uso deve ser observado, não simulado.

### Agentes e consumidores

Foram executadas 15 leituras canônicas reais: cinco escopos (`sol`, `lia`,
`mila`, `fabio`, `bi`) nas três unidades.

- 15/15 retornaram objeto e todos os campos obrigatórios;
- Sol, Lia e BI retornaram estado `publicavel` no recorte de 2026-08-27;
- Mila retornou seu contrato experimental separado, sem usar presença regular
  como atalho;
- Fábio retornou ocorrências escopadas ao professor: 7 na Barra, 8 em Campo
  Grande e 14 no Recreio;
- `anon` e `authenticated` não leem views/kernel nem executam o adapter de
  agentes;
- Sol, Lia e Mila executam somente o adapter; não leem as views nem o helper;
- Fábio não possui leitura SQL direta; o gateway usa a porta com
  `service_role`;
- somente `service_role` lê as views e executa o helper interno.

As métricas por período que excediam o timeout responderam após o hardening:

| Consumidor | Escopo de contraprova | Tempo observado |
|---|---|---:|
| Ocorrências | três unidades/dia | 2,1 s |
| Métricas mensais | Campo Grande | 3,9 s |
| Health Score mensal | três unidades | 6,4 s |
| Health Score ciclo | três unidades | 10,9 s |
| Health Score consolidado/ciclo | 44 professores | 11,0 s |

O Health Score permanece fail-closed quando o roster do período está em
revisão. Nessa condição os valores observados existem para auditoria, mas
denominador, presença e falta não são publicados como KPI. Isso impede que o
incidente gere números falsos enquanto a qualidade estrutural não estiver
liberada.

### Cron

Oito jobs esperados estão ativos: três fechamentos diários, um catch-up, três
fatias de backlog e o relatório condicionado à cobertura. Os três jobs diários
mais recentes foram enfileirados com status `succeeded`; o ledger da Edge
confirma a conclusão posterior. As três novas fatias de backlog foram instaladas
depois do horário de hoje e terão a primeira execução agendada no ciclo
seguinte; a mesma lógica já concluiu o backfill real de 14 dias e passou nos
fixtures PostgreSQL.

## Interfaces autenticadas

Validação read-only no Chrome, com as sessões reais do usuário:

- LA Report `/app/agenda`: aba `Chamada`, estado `Sincronizado`, controles de
  presença/falta e ações em lote renderizados;
- LA Teacher `/app/agenda`: Agenda e rota de registro renderizadas;
- recarga completa nas duas abas preservou URL, DOM e controles;
- zero erro de console nas duas aplicações;
- o LA Report emite um warning já conhecido porque o `index.html` carrega
  Tailwind via CDN. É uma decisão arquitetural preexistente e não está ligada ao
  fluxo de presença; ocultar o aviso seria maquiagem, e trocar o pipeline CSS
  dentro deste incidente aumentaria o risco do release.

Nenhum botão que grava presença/falta foi acionado durante essa prova.

## Testes finais

| Projeto | Verificação | Resultado |
|---|---|---|
| LA Report | `npm run test:presenca-backend` | 104/104 |
| LA Report | `npm test` | suíte completa verde, incluindo fixtures PostgreSQL |
| LA Report | `npm run build` | verde |
| LA Teacher | `npm run test:unit` | 52 arquivos, 366/366 |
| LA Teacher | `npm run build` | verde |
| LA Teacher | SQL 055 e 094 | verdes e sem divergência de linhas/schema |

Os replays históricos isolados 053, 064, 086, 093 e 095 não são gates do
schema compartilhado atual: eles dependem de estágios intermediários já
superados e não recompõem toda a cadeia evoluída. Não foram apresentados como
verdes. A prova vigente é a suíte do LA Report contra PostgreSQL 17, a suíte
unitária do LA Teacher, os dois replays ainda autossuficientes e a contraprova
read-only no banco compartilhado.

Os dois builds mantêm warnings preexistentes de tamanho de chunks. Não houve
novo pacote, supressão de warning ou atalho de bundling neste release.

## Gate operacional restante

O sistema está publicado e tecnicamente pronto para o expediente. O que resta
é evidência operacional, não implementação:

1. observar a primeira chamada real posterior ao deploy e confirmar recibo
   terminal no ledger;
2. acompanhar por sete dias: leases, cobertura, `sem_explicacao`, erros por
   código e latência dos consumidores;
3. ativar `canonico_v2` por unidade e superfície somente se os critérios do
   runbook permanecerem verdes;
4. reverter pela mesma flag se qualquer gate falhar — sem migration destrutiva
   e sem reescrever presença.

Até esse gate, os consumidores operacionais continuam protegidos pelos
adapters em sombra e a cadeia canônica segue calculada e observável.
