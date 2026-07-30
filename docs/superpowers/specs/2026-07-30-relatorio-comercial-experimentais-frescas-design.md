# Relatório Comercial com Experimentais Frescas e Conciliação Não Bloqueante

## Objetivo

Garantir que os relatórios comerciais manual e automático publiquem a quantidade
de experimentais presente no Emusys no momento da geração, sem depender de uma
carga diária posterior ao relatório, e que a taxa Experimental → Matrícula seja
publicada com pendências auditáveis em vez do texto `BLOQUEADA`.

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

Antes de consultar as RPCs, os dois geradores canônicos solicitarão o modo
`experimentais` para a unidade e para o mês corrente:

- `ComercialPage.tsx`, no relatório manual;
- `relatorio-admin-whatsapp`, no dry-run e no cron comercial.

O relatório será gerado somente depois do retorno bem-sucedido. Falha de API,
paginação ou atualização produzirá erro explícito; nunca haverá fallback para
zero nem publicação silenciosa de retrato antigo.

O produtor automático legado da Sol/Hermes será desligado somente depois de um
dry-run das três unidades demonstrar paridade com o gerador canônico. O cron
canônico não será ativado enquanto o legado estiver enviando, evitando
mensagens duplicadas.

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
- pendências geram taxa com alerta, nunca `BLOQUEADA`;
- falha do refresh impede geração/envio;
- manual, dry-run e cron usam o mesmo formatador.

### Verificação operacional

- testes direcionados Node em ciclo vermelho → verde;
- teste da migration em PostgreSQL real ou Supabase branch;
- build Vite;
- dry-run das três unidades sem envio;
- comparação agregada com GET `/aulas`;
- confirmação de apenas um produtor automático ativo antes do corte.

## Implantação

1. Aplicar a migration aditiva.
2. Implantar `sync-presenca-emusys` com o modo `experimentais`.
3. Executar backfill e refresh das três unidades.
4. Confirmar contagens e pendências sem enviar mensagem.
5. Implantar frontend e `relatorio-admin-whatsapp`.
6. Executar dry-run manual, dry-run da edge e preview do produtor automático.
7. Desligar o produtor legado e só então ativar o cron canônico.
8. Observar a primeira execução e registrar horário do snapshot no log.

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
