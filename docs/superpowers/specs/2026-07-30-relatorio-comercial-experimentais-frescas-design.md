# Relatório Comercial com Experimentais Frescas e Conciliação Não Bloqueante

## Objetivo

Garantir que os relatórios comerciais manual e automático publiquem a quantidade
de experimentais presente no Emusys no momento da geração, sem depender de uma
carga diária posterior ao relatório, e que a taxa Experimental → Matrícula seja
publicada com pendências auditáveis em vez do texto `BLOQUEADA`.

O relatório final será único: preservará os blocos operacionais ricos do
automático e a precisão, o funil e a lista detalhada do manual. Todos os
consumidores receberão o mesmo texto do mesmo gerador canônico.

O contrato vale igualmente para Barra, Campo Grande e Recreio. Não haverá regra
especial por nome de unidade.

## Diagnóstico confirmado em produção

Há dois problemas independentes:

1. O relatório automático legado `RELATÓRIO DIÁRIO COMERCIAL` usa
   `get_dados_comercial_ia.kpis_atual.experimentais_agendadas`. Esse campo mede
   status atual de leads, não presenças em aulas experimentais. Foi a origem do
   número 8 publicado para a Barra em 29/07/2026.
2. O relatório detalhado manual usa as RPCs
   `get_experimentais_emusys_operacional_v1` e
   `get_conciliacao_experimentais_v2`, mas ambas leem
   `emusys_experimentais_raw`. Essa tabela é atualizada somente pelo modo
   completo de `sync-presenca-emusys`, executado depois de alguns relatórios.

Em 30/07/2026, o relatório da Barra foi gerado às 19h35 com 29 realizadas. A
carga agendada rodou às 19h50 e, sem alteração manual, a mesma RPC passou a
retornar 32 realizadas, 5 faltas e 5 cancelamentos, iguais ao GET `/aulas` do
Emusys naquele momento.

A tabela bruta também é acumulativa. Seu `raw_key` incorpora nome e telefone,
que são mutáveis, e o sync apenas faz upsert. Isso preservou:

- duas linhas ativas para a mesma aula do Recreio quando a identidade mudou;
- aulas removidas ou reagendadas que já não aparecem no GET `/aulas`;
- estados antigos de presença até a próxima carga completa.

As pendências que mantêm a taxa bloqueada são consequência do mesmo histórico:
registros antigos do webhook permanecem como `experimental_realizada`, embora a
aula vigente no Emusys seja falta, cancelamento ou reagendamento.

Há ainda um segundo produtor fora do repositório:
`/home/sol/.openclaw/workspace/scripts/send-lareport-comercial-hermes.py`. Ele
mistura `get_kpis_comercial_canonicos_v2` com `get_dados_comercial_ia`, corta
listas e publica pelo Hermes. Em 30/07/2026, a Barra recebeu esse formato misto
às 20h05. O Recreio não recebeu o automático: o envio manual das 18h38 ocupou a
mesma chave diária e suprimiu o cron. Portanto, a aparente diferença entre
unidades era uma diferença de produtor, não uma regra comercial da unidade.

No automático da Barra em 30/07/2026:

- os `214` leads e as `7` experimentais vieram da view mensal legada;
- os `251` leads, `32` experimentais realizadas e `5` faltas são os valores
  canônicos;
- o ticket médio de parcelas de `R$ 426,19` coincide com
  `R$ 6.819,00 / 16` matrículas detalhadas;
- o ticket médio de passaportes é uma métrica distinta:
  `R$ 7.142,00 / 16 = R$ 446,38`;
- Bento Brasil e Olivia Delduque apareceram como “próximas” depois de terem
  realizado porque o legado filtra `experimental_agendada=true` e data entre
  hoje e D+7, sem verificar horário, cancelamento ou estado vigente.

## Abordagens consideradas

### 1. Apenas antecipar os crons

Rejeitada. Corrige somente relatórios automáticos em horário fixo. Relatórios
manuais continuariam sujeitos a retratos antigos e o acúmulo de registros
obsoletos permaneceria.

### 2. Consultar o Emusys diretamente em cada consumidor

Rejeitada. Entregaria frescor, mas duplicaria autenticação, paginação, rate
limit e classificação em frontend, edge de relatório e worker automático.
Também transformaria cada consumidor em uma integração independente.

### 3. Atualização leve sob demanda e snapshot canônico

Escolhida. Estende `sync-presenca-emusys`, que já é o único adaptador do GET
`/aulas`, para manter um snapshot vigente das participações experimentais. Todo
gerador solicita essa atualização e espera sua conclusão antes de ler as RPCs.
Os consumidores continuam sem conhecer tokens ou payloads do Emusys.

## Arquitetura

### 1. Identidade estável e vigência na tabela bruta

`emusys_experimentais_raw` receberá colunas aditivas e inicialmente nullable:

- `emusys_lead_id integer`;
- `emusys_aluno_id integer`;
- `participante_chave text`;
- `snapshot_ativo boolean`;
- `snapshot_execucao_id uuid`;
- `snapshot_visto_em timestamptz`;
- `snapshot_inativado_em timestamptz`.

`participante_chave` será calculada nesta ordem:

1. `lead:<id_lead>` quando `id_lead > 0`;
2. `aluno:<id_aluno>` quando `id_aluno > 0`;
3. fallback determinístico com nome normalizado e telefone ou nascimento.

A chave de negócio vigente será:

```text
unidade_id + emusys_aula_id + participante_chave
```

Um índice único parcial impedirá duas linhas ativas para essa chave. Linhas
históricas não serão apagadas: serão marcadas `snapshot_ativo=false`, mantendo
auditoria e evitando cascatas sobre evidências já referenciadas.

O backfill preencherá os IDs externos a partir do payload já armazenado,
escolherá a linha mais recente de cada chave como ativa e inativará as demais.
Ele será executado em migration nova e não alterará migrations aplicadas.

### 2. Atualização leve de experimentais

`sync-presenca-emusys` ganhará o modo `experimentais`, aceitando `unidade_id`,
`data_inicio` e `data_fim`. Os parâmetros existentes continuarão compatíveis.

Para cada unidade e intervalo:

1. buscar todas as páginas do GET `/aulas`;
2. abortar sem inativar nada se a paginação falhar ou ficar incompleta;
3. selecionar aulas `categoria=experimental`;
4. fazer upsert de cada participante pela chave estável, marcando a execução;
5. somente após o GET completo, inativar linhas vigentes do mesmo
   unidade/intervalo que não foram vistas nessa execução;
6. executar a reconciliação de `lead_experimentais` com o retrato obtido;
7. retornar contagens recebidas, ativadas, atualizadas e inativadas.

O modo `metadados` reutilizará o mesmo helper com as aulas que já buscou, sem uma
segunda chamada ao Emusys. Assim o snapshot continuará sendo renovado a cada
15 minutos, além da atualização obrigatória antes do relatório.

O refresh obrigatório do relatório cobrirá duas necessidades na mesma execução
completa:

1. primeiro dia do mês até o instante de geração, para os KPIs realizados;
2. instante de geração até D+7, para a agenda futura, inclusive quando a janela
   atravessar a virada do mês.

Uma participação futura com `presenca="ausente"` no payload do Emusys será
classificada como `agendada` enquanto a aula ainda não tiver começado. Esse
valor bruto não poderá gerar falta antecipada.

### 3. Leitura canônica

`get_experimentais_emusys_operacional_v1` será preservada por compatibilidade,
mas passará a considerar somente `snapshot_ativo=true`. O JSON ganhará, sem
remover campos existentes:

- `snapshot_atualizado_em`;
- `snapshot_ativo`;
- `snapshot_linhas_inativas`;
- `snapshot_status`.

`get_conciliacao_experimentais_v2` também filtrará apenas evidências brutas
ativas.

O detector de reagendamento comparará data e horário. Uma linha sem presença ou
falta bruta será considerada substituída quando houver, para o mesmo lead, uma
experimental posterior com estado operacional conhecido, mesmo que a posterior
já esteja realizada, tenha falta ou esteja cancelada. Uma presença bruta real
sempre prevalece, preservando casos legítimos com mais de uma experimental.

### 4. Geração manual e automática

Antes de consultar as RPCs, o gerador canônico solicitará o modo
`experimentais` para a unidade, o mês corrente e a janela futura D+7.

`relatorio-admin-whatsapp` será o único montador do relatório. O
`ComercialPage.tsx`, o dry-run e o cron apenas solicitarão o mesmo documento.

O relatório será gerado somente depois do retorno bem-sucedido. Falha de API,
paginação ou atualização produzirá erro explícito; nunca haverá fallback para
zero nem publicação silenciosa de retrato antigo.

O texto unificado terá, nesta ordem:

1. cabeçalho com unidade, data e hunter;
2. resumo do dia;
3. mês até agora e metas;
4. funil mensal;
5. registros criados hoje;
6. top canais e cursos do dia;
7. próximas experimentais;
8. alertas reais de frescor e conciliação;
9. lista detalhada das matrículas;
10. fontes e horário do snapshot.

Os blocos usarão estas fontes:

| Informação | Fonte canônica e granularidade |
|---|---|
| Leads do dia e do mês | `get_kpis_comercial_canonicos_v2`, coorte por `data_contato` |
| Experimentais realizadas, faltas e cancelamentos | snapshot vigente do GET `/aulas`, por unidade + aula + participante |
| Agendamentos registrados hoje | `lead_experimentais.created_at` em BRT, sem inferência por status mutável |
| Visitas | KPI comercial diário, separado de experimentais |
| Matrículas e passaportes | mesma coorte comercial agrupada usada na lista detalhada |
| Metas | `metas_kpi` da unidade, ano, mês e tipo |
| Top canais e cursos | arrays diários do KPI comercial v2 |
| Alertas | frescor do snapshot, gaps do KPI e pendências da conciliação |

Os rótulos distinguirão conceitos hoje misturados:
`Experimentais previstas no dia`, `Experimentais realizadas hoje`,
`Faltas hoje`, `Canceladas hoje`, `Agendamentos registrados hoje` e `Visitas`.
O bloco legado “Lançamentos de hoje”, que repartia a coorte pelo status atual,
não será reutilizado.

#### 4.1 Dois tickets médios

O mês exibirá duas métricas independentes, ambas reproduzíveis pela lista
detalhada de matrículas comerciais:

```text
Ticket médio das parcelas =
  soma das parcelas mensais consolidadas / matrículas comerciais elegíveis com parcela

Ticket médio dos passaportes =
  soma dos passaportes / matrículas comerciais elegíveis com passaporte
```

Segundo curso, banda, bolsista, transferência, retorno e duplicatas não podem
alterar um ticket sem também aparecer corretamente na coorte detalhada. A meta
`metas_kpi.tipo='ticket_medio'` será comparada somente ao ticket médio das
parcelas; não existe meta canônica de ticket de passaporte neste contrato.

Para a Barra em julho/2026, o teste de referência é:

```text
Ticket médio das parcelas: R$ 426,19 / meta R$ 444,00
Ticket médio dos passaportes: R$ 446,38
```

#### 4.2 Próximas experimentais

A lista será construída do snapshot Emusys vigente:

```text
data_hora_inicio > instante_de_geracao_em_BRT
data_hora_inicio <= instante_de_geracao_em_BRT + 7 dias
snapshot_ativo = true
cancelada = false
```

Eventos sem horário só poderão entrar quando forem de uma data posterior; um
evento do mesmo dia sem horário ficará fora porque não é possível provar que
ainda ocorrerá. A ordenação será por data, horário e nome. A lista mostrará até
10 participações e, quando houver mais, informará `… e mais N`.

O curso/instrumento será enriquecido pelo vínculo do lead/experimental. O valor
genérico `Aula Experimental` do Emusys não substituirá um curso de interesse
mais específico. Nenhum nome será fixado em código: Pedro/Miguel, Alexandre e
Luíza são casos de aceite, não regra.

O produtor automático legado da Sol/Hermes será desligado somente depois de um
dry-run das três unidades demonstrar paridade com o gerador canônico. O cron
canônico não será ativado enquanto o legado estiver enviando, evitando
mensagens duplicadas.

Envio manual e automático terão chaves idempotentes distintas. Um manual não
poderá mais suprimir silenciosamente o cron, enquanto novas tentativas do mesmo
automático continuarão deduplicadas.

### 5. Taxa Experimental → Matrícula

A governança interna continuará expondo:

- `taxa_exp_mat_liberada`;
- `pendencias_taxa_exp_mat`;
- a fila de conciliação.

O relatório diário, porém, não usará mais a palavra `BLOQUEADA`. Quando houver
denominador, publicará a taxa calculada pela RPC e acrescentará o alerta:

```text
Experimental → Matrícula: 40,6% (13/32) — ⚠️ 2 pendências em auditoria
```

Sem denominador, publicará `SEM BASE`. Pendências continuam visíveis e
acionáveis, mas não impedem o KPI diário.

## Segurança e escopo

- Tokens do Emusys permanecem somente na edge.
- O modo sob demanda valida `unidade_id` contra as três unidades conhecidas.
- Chamadas do navegador exigem JWT autenticado e escopo da unidade antes de
  iniciar o refresh.
- Cron e chamadas entre edges usam a autenticação servidor-servidor existente.
- Nenhum payload com telefone, nascimento ou nome será devolvido pelo refresh.
- A migration é aditiva e preserva histórico.

## Tratamento de falhas

- Página incompleta ou cursor repetido: falhar fechado, sem inativação.
- Timeout do refresh: não gerar nem enviar o relatório.
- Ausência de token da unidade: erro explícito e sem escrita parcial.
- Falha após upserts e antes da inativação: a execução não vira snapshot
  completo; consumidores continuam lendo a última execução completa.
- Falha no envio de WhatsApp: mantém o comportamento idempotente da fila e não
  refaz o snapshot.

## Testes

### Snapshot

- identidade alterada da mesma pessoa não cria segunda linha ativa;
- aula removida do GET fica inativa somente após paginação completa;
- paginação incompleta não inativa registros;
- mudança `faltou → presente` atualiza a linha vigente;
- duas pessoas na mesma aula continuam duas participações;
- backfill mantém exatamente uma linha ativa por chave.

### Conciliação

- realizada antiga seguida de falta/cancelamento vigente não cria pendência;
- duplicatas antigas do mesmo slot não multiplicam pendências;
- duas experimentais reais com presença continuam válidas;
- somente raw ativo entra no denominador.

### Relatórios

- refresh ocorre antes das RPCs;
- Barra publica 32 quando o payload vigente possui 32;
- Barra publica os dois tickets: parcelas `R$ 426,19` e passaportes
  `R$ 446,38`;
- a meta `R$ 444,00` aparece somente ao lado do ticket das parcelas;
- pendências geram taxa com alerta, nunca `BLOQUEADA`;
- Bento e Olivia ficam fora das próximas experimentais às 20h05;
- uma aula futura no mesmo dia continua elegível;
- aula cancelada, evento sem horário no mesmo dia e duplicata vigente ficam
  fora;
- a janela futura atravessa a virada do mês;
- listas truncadas informam `… e mais N`;
- os blocos ricos do automático e a lista detalhada do manual coexistem;
- falha do refresh impede geração/envio;
- manual, dry-run e cron usam o mesmo formatador.

### Verificação operacional

- testes direcionados Node em ciclo vermelho → verde;
- teste da migration em PostgreSQL real ou Supabase branch;
- build Vite;
- dry-run das três unidades sem envio;
- comparação agregada com GET `/aulas`;
- reconciliação dos dois tickets com a soma e os denominadores da lista
  detalhada;
- confirmação de apenas um produtor automático ativo antes do corte.

## Implantação

1. Aplicar a migration aditiva.
2. Implantar `sync-presenca-emusys` com o modo `experimentais`.
3. Executar backfill e refresh das três unidades.
4. Confirmar contagens e pendências sem enviar mensagem.
5. Implantar frontend e `relatorio-admin-whatsapp`.
6. Executar dry-run manual, dry-run da edge e preview do produtor automático.
7. Confirmar que envios manuais não suprimem o dry-run/cron canônico.
8. Desligar o produtor legado e só então ativar o cron canônico.
9. Observar a primeira execução e registrar horário do snapshot no log.

## Rollback

- Reativar o produtor legado apenas se o canônico for desligado primeiro.
- Reverter consumidores para leitura de todas as linhas sem remover as colunas
  novas.
- Manter linhas inativas e histórico; não executar DELETE.
- Fazer rollback da edge para a versão anterior se o refresh falhar, preservando
  a tabela aditiva para diagnóstico.

## Fora de escopo

- alterar presença dentro do Emusys;
- reescrever snapshots mensais já fechados;
- mudar metas comerciais;
- apagar fisicamente histórico bruto;
- resolver as seis falhas preexistentes da suíte completa, que não pertencem a
  este fluxo.

## Baseline local

Antes desta especificação, a suíte completa no worktree registrou 620 testes:
614 passaram e 6 falharam em áreas preexistentes de Health Score, passagem de
bastão, matrícula e carteira de professores. A implementação será validada por
testes direcionados novos, build completo e comparação operacional, mantendo
essas seis falhas registradas separadamente.
