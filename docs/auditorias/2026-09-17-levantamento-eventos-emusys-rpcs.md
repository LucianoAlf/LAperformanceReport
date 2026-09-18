# Levantamento — eventos e movimentações Emusys / contratos canônicos

**Data da fotografia:** 17/09/2026, aproximadamente 21:40 BRT  
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`  
**Escopo:** auditoria somente leitura do banco, funções Edge, migrations, documentação e consumidores no repositório.  
**Consumidores considerados:** Lia, Mila, Sol, Fábio e relatórios.  
**Fora do escopo desta auditoria:** criar RPC, migration, índice, webhook, deploy ou alterar dados.

## Conclusão

O banco já tem o domínio canônico e várias RPCs reaproveitáveis para Lia, Mila, Sol, Fábio e relatórios. O que não existe hoje é uma única RPC de eventos/notificações que reúna os 11 tipos com histórico, antes→depois, ID estável, escopo por professor e paginação.

O caminho correto não é a tabela legada `movimentacoes`, nem `webhook_debug_log`, e tampouco uma consulta de feed diretamente em `automacao_log`. As fontes canônicas atuais são:

| Necessidade | Fonte canônica atual |
|---|---|
| Estado operacional de matrícula | `vw_alunos_estado_operacional_v131`, baseada em `emusys_matriculas_estado_atual` |
| Jornada, curso, disciplina, turma e professor | `aluno_jornada_matricula_disciplina` |
| Movimentações de matrícula e aviso prévio | `movimentacoes_admin` |
| Troca de professor | `aluno_professor_transicoes` e `professor_passagem_bastao` |
| Agenda e estado atual da aula | `aulas_emusys` e `aula_alunos_emusys` |
| Diferenças observadas de aula | `emusys_aulas_historico_revisoes_v1` |
| Experimentais | `lead_experimentais` e vínculos derivados |
| Evidência de transporte de webhook | `automacao_log`; não deve ser exposta diretamente aos consumidores |

## Método e limites da evidência

Foram usados consultas somente leitura e inspeção do código/documentação. A fotografia inclui tabelas, índices, funções SQL, funções Edge, jobs e tráfego recente registrado no projeto.

Não houve acesso ao painel administrativo do Emusys. Portanto, o cadastro externo de cada URL não foi certificado pelo painel do fornecedor. Há prova de tráfego recente e do caminho interno de processamento, que é suficiente para afirmar quais eventos chegam e como são tratados; não é prova de que não existam inscrições adicionais fora do que está documentado e observado.

Os números abaixo são a fotografia do banco na data indicada. As contagens de agenda de ±30 dias abrangem as unidades e não somente os 11 professores do teste, portanto não são comparáveis diretamente às estimativas restritas ao piloto.

## Contratos e RPCs já existentes

| Contrato | Uso atual comprovado | O que entrega | Limite para uma central de eventos |
|---|---|---|---|
| `get_situacao_alunos_v1(unidade, referencia, apenas_pendentes)` | Situação canônica por pessoa; documentada para Sol e Lia | Estado atual, inclusive `em_aviso_previo` e mês de saída | Não é linha do tempo |
| `get_situacao_alunos_resumo_v1(unidade, referencia)` | Resumo para agentes responderem contagens | Agregados de situação | Não devolve aluno/evento individual |
| `aviso_previo_pendencias(unidade, data)` | Operação da Sol | IDs Emusys de aluno, matrícula e aviso | Não devolve o motivo |
| `aviso_previo_vencidos(unidade)` | Avisos vencidos com veredito | Motivo e estado operacional | Também expõe valor financeiro; não pode ser reutilizada crua por uma notificação |
| `get_agenda_dia` / `get_agenda_semana` / `get_agenda_dia_v2` | Agenda operacional; `v2` é o roteador governado usado pela UI | Aula, reagendamento, hora original, cancelamento, motivo, experimentais | Fotografia da agenda; não guarda o evento nem o antes→depois |
| `get_trancamentos_atuais_canonicos(unidade)` | Foto operacional de trancamentos | Estado atual de trancamento | Não é histórico de mudança |
| `get_passagens_bastao_pendentes(professor)` | Transferência de professor | Passagem de bastão pendente | Cobre somente essa categoria |
| `get_passagem_bastao_aluno(...)` | Detalhe de transferência, com escopo/autorização | Contexto da troca de professor | Não é feed |
| `get_matriculas_comerciais_resumo_v1(...)` | Fonte única do resumo comercial, relatório diário/mensal/comparativo e Mila | Situação comercial consolidada | É contrato comercial e contém finanças |
| `get_relatorio_gerencial_canonico_v1` e RPCs de coordenação | Relatórios fechados por período | Recortes consolidados | Não são feed operacional |
| `fabio_claim_notificacao*` | Fila e entrega de mensagens do Fábio | Claim, lease e entrega | Transporte; não descobre eventos de negócio |
| `fn_lia_*` | Alertas privados da Lia para Pesquisa de Evasão | Fluxo específico de pesquisa | Não é central de movimentações |

A busca por funções de “notificação”, “evento”, “movimentação”, “agenda” e “aviso”, somada às dependências das tabelas canônicas, não encontrou uma API que entregue os 11 tipos em um único contrato. As funções que contêm “notificação” no nome são, em sua maior parte, de transporte do Fábio, como `fabio_claim_notificacao`; não leem o domínio canônico de eventos.

`app_minhas_pendencias` também não atende a esse fim: ela representa pendências de registro de aula, não notificações de alterações operacionais.

## Caminho de entrada: webhooks e sincronizações

### Topologia observada

Os endereços documentados do Emusys usam o host:

```text
https://webhookla.latecnology.com.br/webhook/<evento>
```

Para matrículas, o fluxo documentado inclui `/webhook/webhook_matricula`. O processamento tem dois trilhos:

1. um webhook chega ao n8n, especialmente nos workflows de matrícula e experimental;
2. a Edge `debug-webhook-emusys-observador` recebe cópia direta de eventos, registra evidência e, para os tipos cabíveis, repassa para a Edge `processar-matricula-emusys`.

Mila, Sol, Lia e Fábio não são receptores diretos de webhook do Emusys. Eles consomem dados ou fluxos derivados do banco.

| Eventos | Entrada / receptor observado | Destino canônico | Frescor observado |
|---|---|---|---|
| `matricula_nova`, `matricula_alterada`, `matricula_trancamento`, `matricula_finalizacao`, renovação | n8n `WF_Matricula_Funcional` → `processar-matricula-emusys`; observador também recebe cópia direta | `alunos`, `aluno_jornada_matricula_disciplina`, `emusys_matriculas_estado_atual`, `movimentacoes_admin` e transições | Webhook→processador: p50 de 1,2–2,4 s; p95 até 3,3 s nos últimos 30 dias |
| `matricula_aviso_previo_*` | Mesmo fluxo; observador repassa a `processar-matricula-emusys` | `movimentacoes_admin` | p50 1,24 s; p95 2,06 s |
| `aula_experimental_criada/reagendada/cancelada` | n8n `Fucq0bQwF4oeuWnv` e observador direto | `leads`, `lead_experimentais` e vínculos de aula experimental | Chegada em tempo real; reconciliação de aula a cada 15 min |
| `lead_*` | n8n `EB0LibpOJCLhKp7M` e observador | `leads` e derivados | Tempo real |
| `aula_cancelada` regular | Observador recebe diretamente | Estado canônico acaba refletido em `aulas_emusys` pelo pull de `/aulas` | Não há escritor canônico direto comprovado; até 15 min |
| Reagendamento, troca de sala e troca de professor em aula | Não há webhook Emusys específico | `aulas_emusys` e histórico de revisões | Pull de agenda a cada 15 min |

As versões ativas vistas na fotografia eram:

| Componente | Versão / configuração observada |
|---|---|
| Edge `processar-matricula-emusys` | v98, JWT habilitado |
| Edge `debug-webhook-emusys-observador` | v47, JWT desabilitado para recepção |
| `sync-matriculas-emusys` | v120 |
| Sync de grade | v42 |
| Sync de presença | v111 |

### Evidência de tráfego recente

Nos 30 dias anteriores à fotografia, houve, entre outros registros:

| Evento / sinal | Evidência observada |
|---|---:|
| Aviso prévio adicionado | 35 passaram por observação, recebimento, repasse e gravação |
| Alteração de matrícula | 222 observadas e processadas |
| Matrículas novas | 85 observadas |
| Experimentais criadas | 192 |
| Cancelamentos regulares de aula | 309 observados diretamente |

Há entregas duplicadas entre observador e processador. Por isso, `automacao_log` é uma prova útil de transporte e investigação, mas não uma base para contar eventos de negócio ou atender agentes.

### Retenção

| Fonte | Retenção encontrada |
|---|---|
| `automacao_log` | Há registros observáveis de 25/02/2026 até a fotografia. Não foi encontrada uma política de retenção autoritativa; esse intervalo é apenas limite inferior observado. |
| `movimentacoes_admin` | Há dados observados desde 07/01/2026. |
| `emusys_aulas_historico_revisoes_v1` | Revisões observadas desde 16/07/2026. |
| `webhook_debug_log` | Legado de WhatsApp/UAZAPI, não de Emusys. A migration do diagnóstico sanitizado posterior define máximo de sete dias para esse diagnóstico, não para eventos Emusys. |

## Cadência dos pulls e atraso

As três unidades têm sync de metadados de aula escalonado a cada 15 minutos:

| Unidade | Minutos do job |
|---|---|
| u0 | 00, 15, 30, 45 |
| u1 | 05, 20, 35, 50 |
| u2 | 10, 25, 40, 55 |

Na janela de quatro dias examinada, os jobs tiveram:

| Unidade | Sucessos / execuções não bem-sucedidas |
|---|---:|
| u0 | 381 / 3 |
| u1 | 383 / 1 |
| u2 | 383 / 1 |

A reconciliação de experimentais roda aos minutos 12, 27, 42 e 57 de cada hora; na mesma janela, houve 381 sucessos e 2 execuções não bem-sucedidas. O sync diário de matrículas é escalonado em 02:00 UTC (Campo Grande), 02:20 UTC (Recreio) e 02:40 UTC (Barra), com quatro sucessos e nenhuma falha na janela de quatro dias.

Para uma central de eventos, mudanças originadas na grade devem expor `detectado_em`. Elas não devem ser apresentadas como tempo real, porque dependem desse ciclo de até 15 minutos e de sua confiabilidade operacional.

## Cobertura dos 11 eventos desejados

| # | Evento | Existe hoje | Fonte e campos | Frescor / lacuna |
|---:|---|---|---|---|
| 1 | Aula reagendada | Sim, como estado e revisão | `aulas_emusys.reagendada`, `data_hora_inicio_original`, novo início; revisões de `emusys_aulas_historico_revisoes_v1` | Pull de 15 min. Na janela de ±30 dias: 445 reagendadas, todas com hora anterior. Falta evento histórico pronto. |
| 2 | Aula cancelada | Sim, como estado | `cancelada`, `cancelada_motivo`, `cancelada_por_usuario_id`, `cancelada_em` em `aulas_emusys` | Webhook é observado; estado canônico é sincronizado. Das 1.987 canceladas, 719 tinham motivo e 21 ID de autor. Falta nome normalizado de quem cancelou. |
| 3 | Troca de professor na aula / aluno | Parcialmente pronta | `aluno_professor_transicoes`, `professor_passagem_bastao` e revisões de aula | Alteração de matrícula é imediata; mudança de aula é detectada pelo pull. Há 34 transições completas origem→destino em 30 dias. Falta projetar participação “saiu/entrou/responsável” no feed. |
| 4 | Troca de sala | Dado atual e revisões existem | `aulas_emusys.sala_nome` e revisões de payload | Pull de 15 min. `sala_nome` pode manter a sala de origem quando aluno muda de horário; sozinha, não prova troca física de sala. |
| 5 | Nova experimental marcada para professor | Sim | `lead_experimentais.data_experimental`, horário, `professor_experimental_id`, IDs Emusys | Webhook imediato e reconciliação. 1.145 de 1.173 registros tinham professor experimental. |
| 6 | Aluno novo na grade do professor | Fonte de estado existe | `matricula_nova` → aluno, jornada e estado | Webhook imediato. A associação deve nascer da jornada/professor, não apenas da matrícula nova. |
| 7 | Aviso prévio | Sim | `movimentacoes_admin`, com matrícula, aviso, motivo e data prevista | Webhook imediato. Há 39 avisos ativos com ID Emusys; todos têm motivo, data e vínculo de matrícula. |
| 8 | Matrícula encerrada ou trancada | Sim | `vw_alunos_estado_operacional_v131`, `emusys_matriculas_estado_atual` e movimentos | Webhook e sync diário de reconciliação. `get_trancamentos_atuais_canonicos` fornece a foto atual. |
| 9 | Curso, disciplina ou turma alterada | Estado atual existe; diff é parcial | Jornada atual e webhook `matricula_alterada` | O payload traz somente `alteracao.descricao`, sem diff estruturado antes→depois. Falta projeção normalizada. |
| 10 | Aniversariante do dia | Sim, derivável | `alunos.data_nascimento` + estado ativo + jornada do professor | Pode ser calculado hoje; não existe RPC dedicada. |
| 11 | Aniversariantes do mês | Sim, derivável | Mesma fonte do aniversário do dia | Pode ser calculado no dia 1º; não existe RPC dedicada. |

### Aviso prévio

O aviso prévio chega ao banco. O handler da Edge `processar-matricula-emusys` trata `matricula_aviso_previo_adicionado/editado/removido` e deduplica por `emusys_aviso_previo_id`, que é a chave adequada para o ciclo de vida do aviso.

O payload observado de `matricula_aviso_previo_adicionado` contém `autor`, `data_aviso`, `data_prevista_cancelamento`, `id`, `motivo`, `motivo_id` e `observacoes`. Assim, motivo e data prevista são disponíveis quando o Emusys os envia.

O campo `origem_registro` de `movimentacoes_admin` não é confiável para identificar a origem do aviso: os 173 avisos vigentes apareciam como `manual`, inclusive os 39 que já tinham ID Emusys.

`aviso_previo_veredito` não é o aterrissamento do webhook. Na fotografia havia 123 linhas; a tabela é uma camada posterior, preenchida pelo cron da Sol após consulta ao vivo ao Emusys, para classificar o aviso como passível de cobrança, resolvido, divergente ou cancelado.

## Aniversários: fonte, deduplicação e arquivamento

A fonte canônica local é `alunos.data_nascimento`, combinada com:

- `vw_alunos_estado_operacional_v131` para manter apenas matrícula operacional ativa;
- `aluno_jornada_matricula_disciplina` para associar a pessoa ao professor;
- chave de pessoa por unidade + `emusys_student_id`, com fallback para o ID local quando o externo faltar;
- exclusão de `alunos.arquivado_em is not null`.

Na fotografia, havia 1.009 pessoas ativas distintas, todas com data de nascimento. Cento e quarenta e cinco pessoas tinham mais de uma linha local por segunda matrícula ou curso, sem conflito de data de nascimento depois da deduplicação pela chave correta. Havia 27 linhas arquivadas, que devem ficar fora da conta. Três linhas ativas não possuíam `emusys_student_id`, justificando o fallback local.

## Volumes que ajudam a dimensionar

| Fonte / recorte | Volume observado |
|---|---:|
| `aulas_emusys` | 66.200 aulas |
| `emusys_aulas_historico_revisoes_v1` | 459.604 revisões de 444.237 aulas distintas; 29.700 aulas reobservadas |
| Reagendamentos na janela de ±30 dias | 445 |
| Cancelamentos na janela de ±30 dias | 1.987 |
| `lead_experimentais` | 1.173 registros |
| `lead_experimentais` com professor experimental | 1.145 |
| Transições completas de professor em 30 dias | 34 |

Esses dados reforçam que a API de leitura não deve recalcular diferenças a partir de toda a história de revisões a cada abertura de tela.

## Proposta de contrato para uma central comum

Não é recomendável criar uma RPC centrada no Fábio ou no app. A proposta é uma projeção operacional comum, com portas de leitura adequadas a cada consumidor.

```sql
fn_eventos_operacionais_professor_v1(
  p_professor_id integer,
  p_desde timestamptz,
  p_ate timestamptz default now(),
  p_cursor_ocorreu_em timestamptz default null,
  p_cursor_evento_id text default null,
  p_limite integer default 50,
  p_tipos text[] default null
)
```

Retorno sugerido:

```text
evento_id
ocorreu_em
detectado_em
tipo
origem
unidade
aluno { id, nome }
curso
aula { emusys_id, inicio, fim, turma, sala }
mudanca { antes, depois }
motivo
autor
participacao_professor  -- entrou, saiu, responsável, agenda
urgencia                -- hoje, amanhã, normal
confianca_fonte
proximo_cursor
```

A porta do aplicativo pode ser `app_minhas_notificacoes_v1(...)`, resolvendo o professor pelo usuário autenticado. Lia, Mila, Sol e relatórios devem usar portas de serviço ou unidade com tipos permitidos e regras próprias; não a mesma porta aberta ao professor.

### Estabilidade e idempotência

O identificador precisa derivar da entidade canônica e da versão da mudança:

| Tipo | Base sugerida para `evento_id` |
|---|---|
| Aula | unidade + `emusys_aula_id` + tipo + hash da revisão anterior/nova |
| Aviso prévio | unidade + `emusys_aviso_previo_id` + tipo + hash da versão |
| Matrícula | unidade + matrícula externa + tipo de mudança + hash |
| Troca de professor | UUID de `aluno_professor_transicoes` |
| Aniversário | unidade + pessoa + ano + tipo |

O `id` do envelope de webhook não deve ser usado: ele identifica a entrega, não o fato de negócio. A ordenação deve ser por `(ocorreu_em desc, evento_id desc)`, e o cursor deve carregar ambos os valores para evitar repetição ou salto entre páginas.

### Segurança e escopo

O contrato de professor deve devolver somente eventos em que ele participou ou é responsável. A projeção deve carregar o papel da participação para que uma troca de professor informe corretamente quem entrou e quem saiu.

O payload não deve expor:

- dados financeiros;
- dados de saúde;
- payload bruto de webhook;
- presença ou falta de aluno de outro professor;
- informação de aluno fora do escopo do professor.

Em especial, `aviso_previo_vencidos` não pode ser exposta como está porque contém valor de parcela.

## Desempenho e índices

Existem bons índices para:

- agenda por unidade/data;
- reagendamento;
- slot de professor;
- jornada por unidade/professor;
- transições por professor/data;
- aviso prévio por ID Emusys.

Uma implementação por `UNION` ao vivo ainda teria custos e riscos:

| Fonte | Limitação atual |
|---|---|
| `emusys_aulas_historico_revisoes_v1` | 459.604 revisões e índice direto apenas por aula/coleta; não há caminho seletivo por unidade/professor/data para um feed |
| `automacao_log` | Sem índice por evento + professor + instante; contém payload bruto e semântica de entrega duplicada |
| `movimentacoes_admin` | Não há índice composto ideal por professor + instante de evento |
| `lead_experimentais` | Não há índice composto por unidade + professor experimental + data |
| Nascimento | Não há índice por mês/dia; na escala atual não é preocupação principal |

Por isso, a recomendação é uma projeção de eventos durável e append-only, em vez de varrer dados brutos a cada leitura. Ela precisa de:

```sql
unique (evento_id)
index  (professor_id, ocorreu_em desc, evento_id desc)
```

Se houver relação muitos-para-muitos entre evento e professor, a alternativa adequada é uma tabela de audiência/participação indexada por `(professor_id, ocorreu_em desc, evento_id desc)`.

Caso a decisão seja consulta ao vivo, os índices ausentes nas revisões, movimentações e experimentais precisam entrar antes da liberação.

## Estado de leitura e entrega

O estado de leitura de uma notificação não conflita com nenhum domínio existente. Ele deve ser propriedade do consumidor, indexado por usuário ou professor + `evento_id`, e ficar separado da projeção canônica.

As filas do Fábio continuam sendo responsabilidade de transporte e lease. A projeção deve fornecer o evento idempotente; a fila registra se e quando uma mensagem foi enviada. Essa separação também permite que Lia, Mila, Sol e relatórios consultem o mesmo fato de negócio sem herdar estado de entrega do WhatsApp.

## Recomendações de desenho

1. Criar uma projeção canônica de eventos operacionais, alimentada pelos handlers de webhook e pelos sincronizadores que detectam mudanças de agenda.
2. Registrar `ocorreu_em` e `detectado_em` separadamente.
3. Usar chaves de negócio estáveis e versão/hash da alteração, nunca o ID da entrega de webhook.
4. Guardar antes→depois normalizado para reagendamento, sala, professor, curso, disciplina e turma.
5. Criar wrappers por consumidor: professor autenticado, serviço/unidade para Lia/Mila/Sol e contrato explícito para relatórios.
6. Manter leitura e entrega de WhatsApp fora da projeção canônica.
7. Fazer a projeção e seus índices antes de expor uma tela ou rotina de polling frequente.

## Referências de código e documentação

- [Mapa de integração Emusys](../MAPA-INTEGRACAO-EMUSYS.md)
- [Handler de matrícula e aviso prévio](../../supabase/functions/processar-matricula-emusys/index.ts)
- [Observador paralelo de webhook](../../supabase/functions/debug-webhook-emusys-observador/index.ts)
- [Regra de negócio sobre sala da grade](../REGRAS-DE-NEGOCIO.md)
- [Operação de aviso prévio da Sol](../operacao/aviso-previo-sol.md)
- [Plano operacional em quatro camadas da Sol](../handoffs/2026-09-07-plano-sol-operacional-4-camadas.md)
- [Migration de retenção do diagnóstico sanitizado](../../supabase/migrations/20260801220000_webhook_inbound_secrets_debug_retention.sql)
