# Mapa de Integração Emusys ↔ LA Music Report

> Ciclo das automações **Emusys ↔ nosso sistema (Supabase Performance Report)**: webhooks que entram, endpoints que o sistema chama, e a finalidade de cada um.
> Escopo: o que o **Performance Report** chama/recebe. O agente **Mila SDR** é um produto separado (upstream) — aparece só como contexto.
> Última verificação na fonte (n8n + código): **2026-06-08** (varredura exaustiva).
> Referências: `emusys-api.md` (API), `pendencias-emusys.md` (limitações), `integracao-infra.md` (infra geral).

---

## Visão geral

```
                ┌───────────────────────────────────────────────┐
   ENTRADA      │  EMUSYS dispara webhook → nós gravamos no DB   │
   (push)       └───────────────────────────────────────────────┘
        leads        → n8n  EB0LibpOJCLhKp7M       → upsert_lead (Supabase)
        experimental → n8n  Fucq0bQwF4oeuWnv       → UPDATE leads (Supabase) + WhatsApp
        matrícula    → n8n  WF_Matricula_Funcional → edge processar-matricula-emusys → alunos

                ┌───────────────────────────────────────────────┐
   SAÍDA        │  O NOSSO sistema chama a API do Emusys         │
   (pull)       └───────────────────────────────────────────────┘
        GET /v1/aulas/       → sync-presenca-emusys    (presença diária + metadados a cada 15 min)
        GET /v1/professores  → sync-professores-emusys (cron semanal)
        GET /v1/faturas      → financeiro_sync_queue → sync-faturas-emusys

                ┌───────────────────────────────────────────────┐
   UPSTREAM     │  Mila SDR (produto SEPARADO) alimenta o Emusys │
   (contexto)   └───────────────────────────────────────────────┘
        Mila cadastra lead / agenda experimental NO EMUSYS
        → é isso que faz o Emusys disparar os webhooks de entrada acima.
        A Mila NUNCA grava no nosso Supabase — quem grava é o webhook.
```

- **Quem grava no Supabase é sempre o webhook** (EB0 / Fucq0 / edge), nunca a Mila.
- **Pulls operacionais documentados aqui:** `/aulas`, `/professores` e `/faturas`.
- Webhooks chegam no host n8n `https://webhookla.latecnology.com.br/webhook/<evento>`.
- **Escola_id → unidade:** `39` = Campo Grande, `40` = Recreio, `316` = Barra.

---

## 1. ENTRADA — Webhooks que o Emusys dispara (gravam no Supabase)

### 1.1 Leads → n8n `EB0LibpOJCLhKp7M`
**Webhook:** `POST .../webhook/lead_criado`. Switch separa 3 eventos. **Grava só no Supabase** (credencial "LA Performance Report Creds"):

| Evento | O que faz no Supabase |
|---|---|
| `lead_criado` | `upsert_lead(nome, telefone, email, unidade, instrumento, como_conheceu, emusys_id, 'emusys', FALSE, data_contato)` — cria/atualiza o lead (estágio "Novos Leads"). Porta de entrada de **todo lead**. |
| `lead_editado` | Mesma `upsert_lead(...)` — atualiza dados do lead. |
| `lead_arquivado` | `UPDATE leads SET arquivado=true, status='arquivado', etapa_pipeline_id=11` (preserva `convertido`/`matriculado`). |

- Telefone chega `(21) 99999-9999` → normalizado para `5521...`.
- ⚠️ `upsert_lead` **não recebe o estágio do funil** → `lead_editado` não marca experimental realizada/faltou (ver 1.2).
- ⚠️ Os nós NocoDB deste workflow estão **desconectados** — não gravam no NocoDB.
- ⚠️ O nó `Gravar Raw Lead` (INSERT em `leads_automacao_log`, evento `webhook_lead_raw`) tem
  `continueOnFail` e **está falhando calado**: zero eventos `webhook_lead_raw` nos últimos 10 dias.
  O log bruto real hoje é o do observador, em `automacao_log`.
- ⚠️ **Este workflow está em vias de ser desligado** — ver 1.1.b.

#### 1.1.a ⚠️ Incidente 11–12/08/2026 — 21h sem captar lead

A migration `20260811160000` fez `CREATE OR REPLACE FUNCTION upsert_lead(..., p_data_nascimento
date DEFAULT NULL)`. **Lista de parâmetros diferente não substitui — cria overload.** Ficaram duas
funções e, como a nova tem `DEFAULT` no 11º argumento, a chamada de 10 args do nó `Upsert Lead1`
passou a casar nas duas: `function upsert_lead(...) is not unique`.

- 100% das execuções em erro de **11/08 15:01** a **12/08 14:03 BRT**; **22 leads** não entraram.
- Atingiu também o `agente-webhook` (campanhas), que chama a mesma RPC com 10 args nomeados **e não
  checa o `error`** — parou de criar lead no funil sem nenhum sinal.
- Resolvido pelo `drop` do overload (`20260812135824`). **21 leads recuperados** do `payload_bruto`
  do observador, sem tocar na API do Emusys; 3 ficaram de fora por colisão de telefone (família).
- ⚠️ A função nova também trocou `v_action` de `inserted` para `created`, o que sumiria com o lead
  novo do badge "Novos" em `TabAutomacaoLeads.tsx`. Realinhado em `20260812133837`.

#### 1.1.b Virada em curso: o observador assume o lead

O `debug-webhook-emusys-observador` **recebe os mesmos eventos em paralelo** (o Emusys tem os dois
endereços cadastrados nas 3 unidades) e já reimplementa os 3 eventos de lead chamando **as mesmas
RPCs**. Está em **sombra** (`OBSERVADOR_ESCREVE` só libera experimental hoje).

Ele não caiu no incidente acima porque chama a RPC pelo PostgREST com as **11 chaves nomeadas** —
sem ambiguidade. Registrou os 40 leads do período com unidade e argumentos corretos: teria absorvido
a queda inteira se a escrita estivesse ligada.

O que ele **adiciona** sobre o n8n: `data_nascimento`, `agente_comercial`, `motivo_arquivamento`,
etapa do pipeline derivada do estágio (que nunca regride), `?token=` na URL, arquivamento
parametrizado (o do n8n monta SQL por interpolação de string) e o "como conheceu" aceitando o campo
como string **ou** objeto — o n8n exige objeto e devolve vazio no outro formato.

⚠️ **Ordem da virada:** ligar a escrita no observador **primeiro**, confirmar em evento real, e só
então desligar o ramo de lead no n8n. O inverso abre janela sem ninguém escrevendo, e **o Emusys não
reenvia** — foi exatamente assim que os 22 leads se perderam. Com os dois ligados não há duplicata:
a RPC casa por `emusys_lead_id`+unidade e o segundo vira UPDATE.

### 1.2 Aula experimental → n8n `Fucq0bQwF4oeuWnv` (+ sub `j41tPbyjGXUQUxrN`)
**Webhook** (ativo). Switch separa **Criada / Reagendada / Cancelada**. Grava direto em `leads` (Postgres):

| Evento | O que faz |
|---|---|
| `aula_experimental_criada` | UPDATE `leads` (`experimental_agendada=true`, `data_experimental`, `horario_experimental`, `professor_experimental_id`) + **notifica consultor e professor via WhatsApp (WAHA)**. |
| `aula_experimental_reagendada` | Atualiza data/horário + notifica. |
| `aula_experimental_cancelada` | UPDATE `leads` (cancela) + notifica. |

**Comparecimento/falta — vem do Emusys (sync de aulas), fallback manual:**
1. **Automático:** o `sync-presenca-emusys` (ver 2.1) cruza as aulas `categoria=experimental` do `GET /aulas/` (`presenca: presente/ausente`) com as agendadas → marca `experimental_realizada` (etapa 7) ou `faltou_experimental` (etapa 9). Auto-marca `faltou` após +7 dias sem confirmação.
2. **Manual:** consultor pode marcar na aba **Agenda do Pré-Atendimento** (`AgendaTab.tsx`).

**Propagação do professor da experimental para a matrícula (trigger, desde 2026-08-10):**

`alunos.professor_experimental_id` é uma **cópia derivada** de `lead_experimentais`, preenchida em dois momentos:

1. **Na matrícula** — `processar-matricula-emusys` v33+, função `resolverProfessorExperimental`. Só grava quando a resposta é inequívoca: professor único, `status in ('experimental_realizada','convertido')`, `data_experimental <= data_matricula`.
2. **Na promoção** — trigger `trg_propagar_professor_experimental` em `lead_experimentais` (`AFTER INSERT OR UPDATE OF status`) → RPC `propagar_professor_experimental(p_emusys_lead_id)`.

⚠️ **Por que o passo 2 existe:** a matrícula frequentemente chega **antes** de a experimental ser promovida — **55% das matrículas acontecem no mesmo dia da experimental** (40 de 72 desde junho). A promoção depende do sync de presença, e a janela medida entre a aula acontecer e a linha ser promovida vai de **0,0h a 25,2h**. Matrícula que cai nessa janela recebia `null` **para sempre**, porque o `sync-presenca-emusys` só **lê** `alunos` (dois `.select('id')`) e nunca escreve. Caso que originou: Amelie #1925 — aula 08/08 11:00, matrícula 12:24, promoção 14:45, campo vazio por 46h.

⚠️ **Por que trigger e não dentro da edge:** **cinco** caminhos promovem o status — a reconciliação do `sync-presenca-emusys` (~linha 845), o `confirmarExperimentais` da mesma edge (~1351), `fn_reconciliar_experimental_aulas`, `registrar_experimental` e a edição manual pela tela. A regra é invariante da relação `lead_experimentais ↔ alunos`, não passo do sync; dentro de um dos cinco escritores ficaria furada nos outros quatro. Mesmo padrão de `fn_experimental_recebe_id_da_aula` e `trg_usuarios_sincroniza_rbac`.

**As 4 travas da RPC** (nenhuma é opcional): só grava onde `professor_experimental_id IS NULL` (repetida no UPDATE como guarda de corrida) · exige lastro de **professor único** · `data_experimental <= data_matricula` · recusa linha com edição humana no campo (`audit_log` com `origem='manual'` — foi o que preservou a Manuela #1759, cujo campo a Dai esvaziou de propósito em 08/06).

O trigger **nunca bloqueia a promoção**: erro vira `warning`. Deixa rastro em `leads_automacao_log` (`workflow_id='trg_propagar_professor_experimental'`) **só quando preenche**. Custo medido: **7,9 ms** por lead (a varredura sem argumento custa 823 ms — usada só no backfill).

✅ **A GRADE (`GET /aulas` → `aulas_emusys`) É A FONTE BOA para "quem deu a experimental".** Ela traz `categoria='experimental'`, `professores[].id`, `cancelada`, e — decisivo — `reagendada` + `data_hora_inicio_original`, que permitem reconstruir reagendamento **e** reatribuição de professor. Onde a nossa base diverge dela, a suspeita padrão é da **nossa** base.

⚠️ **Ao comparar, casar por AULA, nunca por aluno ou por data isolada.** Um lead pode ter mais de uma experimental, e nossa base costuma ter linhas a mais que a realidade (fantasma de reagendamento — ver §1.2 acima).

**Caso-escola (Júlia Barroso, lead 7829, apurado 10/08/2026):** a grade tem **2** experimentais — `815546` em 16/07 com **Lohana** (`data_hora_inicio_original` = 15/07 14:30) e `823968` em 29/07 com **Leticia**. Nossa base tinha **3** linhas: 1126 (15/07, Erick), 1132 (16/07, Leticia, `emusys_aula_id` órfão 60160) e 1216 (16/07, Lohana). O `data_hora_inicio_original` prova que a 1126 é o **fantasma pré-reagendamento** da própria 815546 — a aula mudou de dia **e de professor** (Erick → Lohana). A 1132 não corresponde a aula nenhuma.

⚠️ **Erro de análise a não repetir:** ao ver "grade diz Lohana, curadoria diz Leticia", é tentador concluir que a grade é pouco confiável. **Eram aulas diferentes** — Lohana deu a de 16/07, Leticia a de 29/07, e a anotação do CRM que embasou a curadoria é de 02/08, posterior a ambas. As fontes **concordam**. Antes de declarar a grade errada, confira `data_hora_inicio_original` e verifique se as linhas comparadas são da mesma aula.

ℹ️ O histórico de estágio do lead no CRM do Emusys (anotações do tipo *"Experimental efetivada por Fulano"*) **não é exposto por nenhum endpoint da API** — não existe GET de histórico de lead (ver §8). É útil como conferência humana na tela, mas a grade já resolve os casos automatizáveis.

### 1.3 Matrículas → n8n `WF_Matricula_Funcional` → edge `processar-matricula-emusys`
**Webhook:** `POST .../webhook/webhook_matricula`. O n8n:
1. **Reencaminha o body cru pra edge** `processar-matricula-emusys` (com retry).
2. `matricula_nova`/`renovacao` → etiqueta aluno ativo (Chatwoot) + mensagem de boas-vindas.
3. Se a edge falhar → alerta de erro via UAZAPI (`5521964171223`).

A edge faz `switch(evento)`:

| Evento | Finalidade |
|---|---|
| `matricula_nova` | Insere aluno em `alunos`, resolve professor/curso/pagamento, converte o lead (`leads.aluno_id` + `alunos.lead_origem_id`). |
| `matricula_renovacao` | Atualiza contrato/valor + `movimentacoes_admin` (renovação). |
| `matricula_trancamento` | Trancamento + `movimentacoes_admin`. |
| `matricula_finalizacao` | Resolve o motivo: `inativa` + `interrompida` gera evasão; `inativa` + `concluida` gera não renovação/contrato concluído. Valor ausente ou ambíguo vai para auditoria e não altera o estado local automaticamente. |

- A pesquisa pós-saída consome o `movimentacoes_admin.id` criado nesse ciclo; não volta a depender de `evasoes_v2`.

- Idempotência por evento; saúde via `_shared/invariantes.ts` (`automacao_log`/`automacao_invariantes`). `verify_jwt: false` é comportamento preexistente do webhook e a proteção por segredo/assinatura permanece pendência de segurança separada, atribuída ao responsável pela integração Emusys.

### 1.4 Webhook NÃO consumido
`aula_cancelada` (aula regular) — sem receptor dedicado; o estado da aula é reconciliado pelo sync de `/aulas/`.

---

## 2. SAÍDA — Endpoints que o NOSSO sistema chama

### 2.1 `GET /v1/aulas/` → `sync-presenca-emusys` — presença, roster e agenda
- **Presença completa:** continua em horários fixos por unidade.
- **Metadados operacionais:** cron a cada 15 minutos por unidade, em minutos intercalados, modo `metadados`, janela passada de 2 dias e futura de 35 dias. A agenda diária de sete dias continua pré-carregada em jobs espaçados.
- **Paginação transacional:** o adaptador compartilhado `_shared/experimental-snapshot.ts` percorre `/aulas` com `limite=100` até `tem_mais=false`. Cursor ausente/repetido, HTTP não OK ou JSON inválido rejeitam o lote inteiro antes de qualquer aplicação.
- **Reconciliação regular da grade (15/08/2026):** `_shared/emusys-aulas.ts` também exige paginação íntegra antes de comparar a fotografia regular. ID de aula inválido, roster ausente ou participante sem identidade fazem a fotografia falhar fechada. `reconciliar_grade_snapshot_emusys_v1` recebe apenas IDs de aula e chaves técnicas de participante, atua somente de hoje a D+60 e não faz DELETE de aula, presença, justificativa ou retificação. Evento ausente recebe cancelamento lógico `sync_ausente_emusys`; vínculo ausente só é removido quando a identidade local+Emusys é inequívoca e não existe presença que fecha a chamada. Erro de upsert/roster também pula a reconciliação da unidade; a reconciliação individual do webhook mantém a janela de ontem.
- **Snapshot de experimentais:** o modo `experimentais` exige `unidade_id`, `data_inicio` e `data_fim`, aceita uma única unidade conhecida por UUID e limita o intervalo a 45 dias. Somente o bearer interno pode usar `experimentais`, `agenda` ou `metadados`; JWT de usuário fica restrito a `presenca`, uma unidade exata e ao guard `pode_sincronizar_presenca_emusys_v1`. Corpo, modo e alvo são resolvidos antes do cliente administrativo e antes de carregar qualquer token Emusys. Para a competência mensal, o chamador usa mês até D+7. O adaptador produz uma linha por aula + participante; a identidade prefere `id_lead`, depois `id_aluno`, sempre escopada pela unidade. O curso local vem exclusivamente de `curso_emusys_depara(unidade_id, emusys_disciplina_id)`; nome textual não cria vínculo. O horário Emusys com ou sem segundos é normalizado para `HH:mm` e chega às chaves do banco como `HH:mm:ss`, sem sufixo duplicado. O fallback textual é apenas uma chave raw determinística e não autoriza conciliação canônica.
- **Preflight do relatório diário:** antes de ler qualquer KPI, `relatorio-admin-whatsapp` chama `admitir_refresh_snapshot_experimentais_v1`. A chave de single-flight é unidade + intervalo + origem + bucket de cinco minutos; prévia e cron têm origens distintas. Uma chamada recebe `atualizar`; equivalentes recebem `aguardar` ou `reutilizar` com o mesmo UUID, sem outro GET/versão. Depois de atualizar ou reutilizar, `proteger_leitura_snapshot_experimentais_v1` adquire o mesmo advisory lock do writer e compara a execução com `emusys_experimentais_snapshot_publicacoes_vigentes`. Se outra publicação venceu a corrida, o reuso é promovido atomicamente a uma nova execução; se ainda é vigente, a leitura fica protegida por sessenta segundos. Writers admitidos sobrepostos, inclusive prévia versus cron, obedecem essa proteção; o segundo aguarda com o lote já coletado e não repete o GET no Emusys. Falha registrada bloqueia retry no provedor até o lease vencer. Lease expirado é recuperável e uma aplicação completa sobrevivente a crash é reconhecida e reutilizada. Somente o admitido chama `sync-presenca-emusys` em modo `experimentais`, com credencial `service_role`, execução explícita, uma unidade e mês até D+7; depois finaliza a admissão. Enquanto a admissão está em andamento, no bucket vigente, na tolerância curta após a conclusão ou no lease de leitura protegido, a publicação raw do cron de metadados é adiada; o upsert de `aulas_emusys` permanece ativo. O relatório só prossegue quando HTTP, JSON, unidade, intervalo, status completo e ID de execução são válidos, e quando as leituras operacionais mensal e diária confirmam essa mesma execução completa; não converte falha em zero. A fase paralela de leitura tem limite de 45 segundos e a confirmação final, dez segundos, ambos menores que o lease protegido. A agenda raw filtra `unidade_id`, `snapshot_ativo=true` e exatamente o `snapshot_execucao_id` retornado pelo preflight; depois da leitura, uma nova confirmação operacional precisa apontar a mesma execução, ou a geração falha fechada por concorrência. Buscas auxiliares por IDs de aluno, lead e experimental também carregam `unidade_id` antes do filtro por ID, pois `service_role` não depende de RLS. O navegador nunca recebe token Emusys, credencial de serviço ou payload bruto. A prévia exige JWT autenticado mais `pode_gerar_relatorio_comercial_v1`; o cron exige `service_role` e usa a fila canônica `fila_relatorios_whatsapp`, separada da fila manual Sol/Hermes.
- **Orçamento do refresh:** o chamador envia deadline absoluto de 160 segundos e só aborta a chamada em 180 segundos. Dentro desse orçamento, toda a paginação Emusys é cancelada após no máximo 60 segundos, o writer protegido repete por até 70 segundos com o mesmo lote e 30 segundos ficam reservados ao de-para e à reconciliação. RPCs e consultas Supabase do worker usam o mesmo sinal total; timeout falha fechado e não deixa o worker continuar além do chamador.
- **Chamada do navegador:** `ComercialPage.tsx` invoca somente `relatorio-admin-whatsapp` com `{ modo: 'dry_run_comercial', unidade, data_referencia }` para o documento diário e exige unidade específica. `data_referencia` é obrigatória e aceita somente uma data de calendário real em `YYYY-MM-DD`; a edge preserva essa string como data civil e responde `400` a timestamp, offset, ausência ou calendário inválido. A data escolhida define o cabeçalho, o dia consultado e o snapshot do primeiro dia do mês até D+7. Separadamente, o instante real do servidor em `America/Sao_Paulo` define a hora, o rodapé e o corte estritamente futuro das próximas experimentais; esse relógio pode ser injetado apenas internamente para teste e não existe no payload. O cron, que não recebe data externa, deriva data e hora do instante atual. Limites de `created_at` são convertidos para UTC pelo fuso IANA, sem assumir `-03` em datas históricas. O refresh Emusys e as leituras canônicas ficam integralmente servidor-servidor; a UI apenas valida `error`, `success` e `texto`, protege contra resposta atrasada em troca de unidade e reutiliza o mesmo texto para prévia, cópia e fila manual.
- **Aplicação atômica e falha fechada:** `aplicar_snapshot_experimentais_emusys_v1` valida execução, unidade, intervalo de até 45 dias, identidades e duplicidades antes de escrever. Um advisory lock transacional, namespaced pela RPC e chaveado pela unidade, serializa lotes concorrentes da mesma escola sem bloquear escolas diferentes nem a linha real de `unidades`. Na mesma transação, a RPC inativa a versão vigente de cada chave recebida, insere a nova fotografia, inativa apenas ausentes da unidade/intervalo e registra `emusys_experimentais_snapshot_execucoes` por último. Payload inválido, paginação incompleta ou erro de banco revertem o lote inteiro; a execução não ganha status `completo` e o snapshot vigente anterior permanece publicável. O payload de cada linha é uma allowlist versionada com data, horário, cancelamento, ID da aula e IDs externos do participante; o objeto extensível, contatos, responsáveis, professor e anotações do Emusys não são persistidos no JSON.
- **Histórico e frescor:** versões recebidas não são sobrescritas: `raw_key` e execução anteriores permanecem auditáveis, e a nova versão herda os enriquecimentos locais conhecidos. O payload legado foi saneado para o mesmo schema mínimo. `linhas_inativadas` conta apenas ausências; `linhas_versionadas` identifica chaves atualizadas. A leitura operacional conta somente vigentes autorizadas. `authenticated` tem SELECT apenas sobre as cinco colunas usadas pela agenda (`id`, aluno, data, horário e situação); payload e PII materializada ficam privados ao `service_role`. No agregado, o frescor só é `completo` se todas as unidades incluídas estiverem cobertas; múltiplas execuções produzem ID nulo, timestamp igual à cobertura mais antiga e soma das linhas inativadas. Para o mensal, D+7 usa a data de referência limitada ao último dia da competência: 30/07 exige 06/08 e consultas posteriores a julho exigem no máximo 07/08.
- **Conciliação P24:** `get_conciliacao_experimentais_snapshot_v1` é privada e consulta `emusys_experimentais_raw` somente com `snapshot_ativo=true`. O vínculo lê `emusys_lead_id`/`emusys_aluno_id` materializados e, para aluno interno, `alunos.emusys_student_id`; o payload técnico repete apenas esses IDs para auditoria de integridade e não é fonte de identidade, sem fallback por nome/telefone. `ausente` só confirma falta quando a situação normalizada é `faltou`, sem transformar aula futura ou cancelada em falta. Reagendamentos são ordenados por data e horário, inclusive no mesmo dia, e reconhecem estados agendado, realizado, convertido/matriculado, falta e cancelamento. Presença ou falta raw vigente prevalece sobre a heurística; histórico inativo não entra no denominador nem multiplica pendências. `get_conciliacao_experimentais_v2` preserva P21/P22/P23 e publica a fonte `snapshot_ativo_p24`.
- **Rollout e acesso:** durante a transição, o writer legado pode continuar inserindo sem `participante_chave`; o default `snapshot_ativo=false` mantém essas linhas fora da leitura. A policy authenticated libera somente versões ativas da unidade aprovada por `comercial.ver`, e o grant por coluna impede acesso a payload/PII mesmo dentro da unidade. Com unidade explícita, a RPC exige esse guard; com unidade nula, agrega somente as unidades autorizadas, enquanto `service_role` pode agregar todas.
- **Reuso da coleta:** `metadados` faz uma paginação por unidade e reaproveita exatamente essa resposta para o upsert de `aulas_emusys` e para o snapshot; não abre um segundo GET. Cada unidade mantém sua própria execução e intervalo. Se houver leitura admitida sobreposta, a tentativa raw retorna `adiado_admissao` e não reconcilia aquele lote; isso não desfaz o upsert de `aulas_emusys`. Falhas reais continuam encerrando a chamada sem resposta parcial de sucesso.
- **Resposta e erros:** `experimentais` devolve somente ID/nome da unidade, intervalo, execução e contagens agregadas, sem nomes de alunos, telefones, nascimento, raw ou payload. HTTP/JSON/paginação incompleta do Emusys retorna `502`; falha de aplicação ou reconciliação retorna `500`. O modo leve não executa o fluxo regular de presença nem `atualizar_percentual_presenca`.
- **Para quê:** (1) aulas regulares → `aulas_emusys`, `aula_alunos_emusys` e `aluno_presenca`; (2) confirmar experimentais → `experimental_realizada`/`faltou_experimental`; (3) refletir reagendamento, justificativa e presença informada do professor.
- **Professor:** a API fornece `professores[0].id`. O sync grava `emusys_professor_id` e resolve `professor_id` por `(unidade_id, emusys_id)` em `professores_unidades`; nome não é identidade. `prof_id = 0` vira `sem_acompanhamento=true` e `professor_id=null`.
- **Campos de agenda:** `reagendada`, `data_hora_inicio_original`, `justificada`, `professor_presenca` e `matricula_disciplina_id`. Datas sem fuso são interpretadas como `America/Sao_Paulo` antes de persistir em `timestamptz`.
- **Semântica temporal das experimentais:** `presenca='ausente'` em aula futura significa `agendada`, não falta. Cancelamento sempre prevalece; após o início, `presente`/`matriculado` viram presença, `faltou`/`ausente` viram falta e valores desconhecidos ficam `sem_status`.
- **Anotações:** `aulas_emusys.anotacoes` pertence ao Emusys. `aulas_emusys.anotacoes_fabio` pertence exclusivamente à RPC do Fábio e não aparece no payload do upsert do sync. A leitura pedagógica pode preferir Fábio e cair no Emusys, mas uma fonte nunca sobrescreve a outra.
- **Limite semântico:** `professor_presenca='ausente'` não prova falta funcional do professor; pode representar aula sem ocorrência/chamada. Não usar isoladamente em Health Score ou RH.

### 2.2 `GET /v1/professores` → `sync-professores-emusys` (cron semanal)
- **Quando:** pg_cron Domingo 04:00 BRT.
- **Para quê:** sincronizar professores — auto-cura `emusys_id` por nome, cria novos, vincula a `professores_unidades`.
- ⚠️ `emusys_id` é por unidade.

### 2.3 `GET /v1/matriculas` → `sync-matriculas-emusys`
- **Identidade:** sempre `unidade_id + emusys_matricula_id`; ID Emusys isolado não é global.
- **Materialização bruta:** todas as páginas e todos os estados entram em
  `emusys_matriculas_estado_atual`, com o payload privado e o resultado do
  resolvedor v1.3.1.
- **Projeção viva:** `vw_alunos_estado_operacional_v131` publica `ativa`,
  `trancada`, `inativa/interrompida`, `inativa/concluida` e ambiguidades sem
  misturar os denominadores.
- **Segurança temporal:** o GET reconcilia estado atual e jornada, mas não
  inventa a data histórica de evasão, conclusão ou trancamento. Movimentos
  históricos só nascem de evento com data real.
- **Cadastro e grade:** pelo mesmo par de identidade, o sync atualiza
  diretamente telefone, e-mail, responsável, telefone do responsável, foto e
  Instagram no cadastro canônico, respeitando `matriculas_campos_fixados`.
  `auto_preview` é emitido somente para curso, professor, dia e horário; forma
  e status de pagamento vão para atributos financeiros e valores/contrato para
  divergências próprias. Uma forma de pagamento decidida no LA Report fica
  fixada e não é reaberta por ausência ou metadado incompleto no Emusys.
  O payload anterior reclassificado permanece auditável.
- **Escopo operacional:** como essa coleta recebe somente matrículas ativas ou
  trancadas, uma matrícula local vinculada que não veio no payload não é
  tratada como ausente. O sync continua a produzir apenas a fila canônica de
  grade para os registros presentes; inferência de ausência fica restrita ao
  escopo completo. Assim telefone, foto, pagamento, valores ou status jamais
  voltam a aparecer como “Sync grade”.

#### Identidade e reconciliação usadas pelo relatório gerencial

- O payload de matrícula lê `mat.aluno.lead_id` e o materializa em
  `alunos.emusys_lead_id`. O ID externo sempre é interpretado no escopo da
  unidade; a atualização é nula-somente, idempotente e protegida por
  `unidade_id`.
- Conflito entre valor local e Emusys não é sobrescrito: entra em
  `matriculas_divergencias` como `lead_id_divergente`, preservando os dois
  valores para decisão humana. Segundo curso e homônimo não são critérios de
  escolha.
- Para experimentais, `sync-presenca-emusys` prioriza
  `(unidade_id, emusys_aula_id)`. A hora, a data, o curso e o nome não vetam
  um ID exato; sem ID de aula, a conciliação exige identidade de Lead/Aluno,
  data e tolerância de horário de até 30 minutos.
- A fotografia atual do `/aulas` não é tombstone histórico. Ausência corrente
  só pode produzir estado de auditoria (`ausente_no_snapshot_corrente`);
  aulas, roster e presença já capturados permanecem nas tabelas históricas.

---

## 3. UPSTREAM — Mila SDR (produto separado, fora do sistema)

> A Mila é o **agente de atendimento** (WhatsApp/n8n), não o Performance Report. Ela escreve **no Emusys**, e é isso que dispara os webhooks da seção 1. **Não grava no nosso Supabase.** Documentado aqui só para explicar a origem dos leads/experimentais.

Quem é: os 3 agentes Mila SDR (CG `aHD4kJdzByLwFXA1`, Recreio `gSHJHYMOYDQZqleW`, Barra `yko5HstPTze0gsIM`) + a edge `mila-processar-mensagem`. O que fazem no Emusys:

| Ação da Mila | Endpoint Emusys | Resultado no nosso sistema |
|---|---|---|
| Cadastrar lead | `POST sys.emusys.com.br/w2bh99k_/api/criar_lead.php` (legado) | Emusys dispara `lead_criado` → EB0 grava |
| Agendar experimental (sub-workflow "Agendar experimental") | `GET /v1/disciplinas`, `PATCH /v1/crm/leads/por_telefone`, `POST /v1/crm/aula_experimental` | Emusys dispara `aula_experimental_criada` → Fucq0 grava |
| Atualizar origem ("Definir Origem e Etiqueta", `5lRs2`) | `PATCH /v1/crm/leads/por_telefone` | reflete no Emusys; chega via `lead_editado` |

⚠️ **Falha silenciosa:** o nó "Cadastrar no Emusys" tem `neverError: true`. Se o Emusys rejeita (telefone duplicado), segue como sucesso, nenhum webhook dispara, e o lead **não chega ao Supabase**.

---

## 4. Tabela-resumo

| # | Direção | Gatilho / Endpoint | Caminho | Finalidade |
|---|---|---|---|---|
| 1 | ⬅ entra | `lead_criado` | n8n EB0 → `upsert_lead` | Cria lead |
| 2 | ⬅ entra | `lead_editado` | n8n EB0 → `upsert_lead` | Atualiza lead |
| 3 | ⬅ entra | `lead_arquivado` | n8n EB0 → `UPDATE` | Arquiva lead |
| 4 | ⬅ entra | `aula_experimental_criada/reagendada/cancelada` | n8n Fucq0 → `j41` | Agenda/reagenda/cancela experimental + notifica |
| 5 | ⬅ entra | `matricula_nova/renovacao/trancamento/finalizacao` | n8n WF_Matricula → edge | Cria aluno / renovação / trancamento / interrupção ou conclusão conforme motivo |
| 6 | ➡ sai | `GET /v1/aulas/` | sync-presenca-emusys (presença fixa + metadados 15 min) | Aulas, roster, presença, agenda e confirmação de experimentais |
| 7 | ➡ sai | `GET /v1/professores` | sync-professores-emusys (semanal) | Sync professores |
| 8 | ➡ sai | `GET /v1/matriculas` | sync-matriculas-emusys | Estado atual completo e jornada canônica |
| 9 | ➡ sai | `GET /v1/faturas` | fila única → sync-faturas-emusys | Espelho atual + snapshot financeiro auditável, inclusive competências antigas ainda abertas |
| — | upstream | Mila → Emusys (cadastro/experimental) | fora do sistema | Origina os webhooks (ver seção 3) |

---

## 5. Ciclo de vida do lead (ponta a ponta)

```
1. [UPSTREAM] WhatsApp → Mila cadastra no Emusys (criar_lead.php)
2. Emusys dispara lead_criado → EB0 → upsert_lead (Supabase, "Novos Leads")
3. [UPSTREAM] Mila agenda experimental no Emusys (POST /crm/aula_experimental)
4. Emusys dispara aula_experimental_criada → Fucq0 → UPDATE leads (agendada) + avisa consultor/professor
5. [APÓS A AULA] sync de /aulas/ confirma presença → experimental_realizada/faltou (etapa 7/9)
6. Se matricula → Emusys dispara matricula_nova → WF_Matricula → edge → cria aluno + converte lead
```

> Passos 1 e 3 são da Mila (upstream). O resto é o nosso sistema reagindo aos webhooks do Emusys.

---

## 6. Workflows Emusys legados (NÃO em uso)
Inativos no n8n, fora do ciclo: `Update no crm do emusys` (`6a2VDVkzzs3Avj39`), `Verificar disponibilidade no emusys` (`rPEHbiR5AQrEzglh`), `[ Emusys ] - Gerenciar Lead` (`NfDoy9o2QCQdMJjC`), versões antigas arquivadas do webhook de experimental.

> O sub-workflow "Agendar experimental" (`Zyw5jatATcstbTx0`) aparece `active:false` mas roda em produção — é chamado como tool pelos Mila (sub-workflow não precisa estar ativo).

---

## 7. Prova de exaustividade (varredura 2026-06-08)
Lidos na fonte **todos os ~30 workflows n8n ativos** + edge functions. **Tocam Emusys:** EB0, Fucq0+j41, WF_Matricula (nosso sistema, via webhook); sync-presenca, sync-professores (nosso sistema, saída); Mila SDR + "Agendar experimental" + "Definir Origem" 5lRs2 + edge mila-processar-mensagem (**upstream**, seção 3).

**Workflows ativos verificados que NÃO tocam Emusys** (Chatwoot/WhatsApp/NocoDB/financeiro/interno): Lembretes de experimental (1d/2h), Follow Lista de Espera, Fluxo de Follow Ups-v2, Retornar/Pausar/Abertura FollowUPS, Aviso Diário de Visitas, Etiquetar, criação de etiquetas, Controle de Estagio, Envio de Relatórios, WF1-Webhook-Receiver, Importar Contatos, TypeBot IG, Agente Fiscal Auditoria Mila, [chwt] Gerenciar CRM NocoDB, [Nocodb] Criação/Atualização (Upsert `disabled`), Chatwoot Supervisor, Lembrete Financeiro, Disparador Meta, Monitoramento Servidor, Transcrição de Áudio, LA Band Pilot.

**Teste (não-produção):** "teste hugo" (`k66EcPwAtT0E2taH`) invoca sub-workflow Emusys via trigger manual.

---

## 8. Limitações conhecidas (lado Emusys)
Detalhes em `pendencias-emusys.md`. Resumo atualizado:
- `emusys_id` de professor e demais identidades externas são escopados por unidade, não globais.
- `horario_presenca` espelha o início da aula e não representa o instante real em que a chamada foi lançada.
- O payload não permite distinguir retroativamente, com segurança técnica, toda chamada não feita de uma falta real; a camada semântica aplica política de negócio versionada por unidade.
- `professor_presenca='ausente'` não pode ser interpretado sozinho como falta do professor.

---

## 9. Fora de escopo (tocam Emusys, mas outros sistemas)
- **NocoDB** — CRM paralelo dos agentes Mila. Recebe dados direto dos agentes, mas **não alimenta o Performance Report** (ramos NocoDB nos webhooks de lead desconectados; sync NocoDB→Supabase desativado desde ~28/03/2026).

## 10. Exportação de faturas para o Super Folha

`refresh-contas-receber` é o orquestrador da fila única `financeiro_sync_queue`. Ele enfileira mês atual, anterior, seguinte e toda competência cujo último snapshot ainda tenha fatura `aberta` ou `source_missing`. O worker faz claim com lease e processa uma competência por vez; nenhum caminho paralelo deve disputar o mesmo rate limit do Emusys.

`sync-faturas-emusys` cria o run `running` antes da coleta, limita chamadas a 50/min e só publica depois de validar paginação, IDs, datas e completude das 3 unidades. HTTP 429 respeita `Retry-After` e grava backoff exponencial na fila, sem rajada de tentativas dentro da mesma invocação. `matricula_id`, contrato e aluno são identidades opcionais: valor inválido não derruba a fatura; fica em `payload._la_report.validation_issues` e põe os consumidores em quarentena `incomplete`. A publicação atômica mantém o dual-write (`emusys_faturas` mutável + `sync_run_items` imutável), eventos e tombstones por competência. Baseline e `source_missing` ajudam a reconciliar ausência, mas nenhum dos dois prova pagamento.

`export-contas-receber` tem dois contratos. `modo='inadimplencia'` chama `get_inadimplencia_canonica` e só exporta com `status='ok'`, já com `valor_atualizado` (multa 2% + mora 1%/mês pro rata) e `fresh_until`. O modo `snapshot` lê runs live completos; `require_fresh` é `true` por padrão e stale retorna conflito. Uso histórico exige `require_fresh=false` explícito e o manifesto continua com `is_fresh=false`, `stale_after`, `sync_run_id` e `latest_complete_sync_run_id`. O cruzamento local é sempre `(unidade_id, emusys_matricula_id)`.

`get_financeiro_faturas_emusys` também lê o último `sync_run_items` completo, nunca o espelho mutável. Stale, `source_missing`, identidade inválida, status desconhecido ou fatura canônica duplicada retornam `tem_dados=false`. O período aberto pode consumir esse bloco; competências fechadas preservam o snapshot mensal. A fila existe sem cron de cobrança: qualquer automação externa permanece bloqueada até o probe controlado de uma unidade/competência ser comparado item a item com a tela do Emusys.

O plano de contas e a auditoria da classificação continuam no projeto Super Folha.

## 11. Histórico do professor (backfill + reconstrução de períodos)

Pipeline de duas etapas que alimenta a **retenção do professor** (`vw_professor_periodos_*_v3_sombra` →
`get_professor_retencao_v3_governada`):

1. `backfill-historico-professor-emusys` — `GET /aulas` por unidade, caminha **mês a mês**, checkpointado
   (máx. 10 páginas por chamada), popula `emusys_aulas_historico_staging_v1` + `..._aula_alunos_...`.
   Exige `execucao_id` de uma linha em `emusys_historico_backfill_execucoes_v1`.
2. `reconstruir-periodos-professor` — lê o staging e monta os períodos professor↔aluno em
   `professor_matricula_disciplina_periodos_v1`. **Particionada em 32 por unidade**; a finalização
   materializa quando as 32 fecham e a reconstrução **publica sozinha** (vira baseline).

**Nenhuma das duas roda por `pg_cron` direto** (uma exige `execucao_id`, a outra `particao_indice`). Quem as
dirige é a edge **`orquestrar-historico-professor`** (re-entrante, ~95 s por tick), chamada pelo cron
**jobid 129** (`7,37 * * * *`). Cadência real dentro da edge: **backfill diário, reconstrução a cada 7 dias**.
Kill switch em `automacoes_config(slug='auto_historico_professor')`; trava em `orquestracao_locks_v1`.

⚠️ **A curadoria (`professor_periodos_revisoes_v1`) só sobrevive à reconstrução por causa da chave natural**
ancorada no `emusys_aula_id` da 1ª aula do período (`fn_chave_natural_periodo_professor_v1`). Antes disso,
reconstruir orfanizava 100% das revisões — era o motivo de nunca ter havido cron. Ver
`docs/handoffs/2026-08-09-frente-professores-checkpoint-vivo.md`.

⚠️ O `execucaoCobreRecorte` (`_shared/checkpoint-historico-professor.mjs`) exige que a execução de backfill
**declare** cobertura ≥ o recorte da reconstrução. O staging é **cumulativo** entre execuções, então o
incremental diário declara `2018-01-01 → hoje` e só varre a janela recente — mas só depois de confirmar que
existe execução `concluido` anterior com essa cobertura. **Não inferir cobertura do formato do dado**: a
Barra abriu em 09/10/2021 e não tem aula antiga por não existir, não por falta de carga.

- **Dash do rayan** (`emusys-webhook` no projeto `aexacbmirdlcssmjjbzx`) — recebe cópia dos webhooks, projeto separado.
- **emusys-agent** (chat) — repositório separado.

---

## 10. Onde fica cada coisa
| Componente | Caminho |
|---|---|
| Webhook leads (n8n) | `EB0LibpOJCLhKp7M` |
| Webhook experimental (n8n) | `Fucq0bQwF4oeuWnv` + sub `j41tPbyjGXUQUxrN` |
| Webhook matrícula (n8n) | `WF_Matricula_Funcional` (`ZzuR9slRx8UqXg9N`) |
| Edge matrícula | `supabase/functions/processar-matricula-emusys/index.ts` |
| Sync presença | `supabase/functions/sync-presenca-emusys/index.ts` |
| Sync professores | `supabase/functions/sync-professores-emusys/index.ts` |
| Sync faturas | `supabase/functions/sync-faturas-emusys/index.ts` |
| Refresh interno de faturas | `supabase/functions/refresh-contas-receber/index.ts` |
| Export financeiro por run | `supabase/functions/export-contas-receber/index.ts` |
| Marcação compareceu/faltou (manual) | `src/components/App/PreAtendimento/tabs/AgendaTab.tsx` |
| Mila SDR (upstream) | `aHD4kJdzByLwFXA1` / `gSHJHYMOYDQZqleW` / `yko5HstPTze0gsIM` |

### Health Score Professor V3 mensal e por ciclo

Presença, carteira, grade e vínculos continuam vindo das fontes canônicas já sincronizadas do Emusys. As leituras de Health Score e dos relatórios da Coordenação não chamam a API Emusys diretamente, não mudam a identidade canônica e não criam snapshot operacional no Emusys.

Na competencia aberta, a carteira usada pelo Health Score V3 e
`get_carteira_professor_periodo_canonica`, baseada na jornada ativa por
professor/unidade; `get_carteira_professores` e legado de contrato/ticket e nao
participa desse retrato. Isso evita que uma atribuicao antiga em
`alunos.professor_atual_id` faca Performance e Carteira mostrarem universos
distintos.

O recorte mensal usa somente os fatos da competência selecionada. O recorte de ciclo resolve os intervalos fixos Mar-Abr-Mai, Jun-Jul-Ago, Set-Out-Nov e Dez-Jan-Fev; este último atravessa o ano civil. Conversão e presença somam numeradores e denominadores brutos antes da divisão. Carteira e média/turma usam a fotografia do último mês alcançado no recorte. O ciclo nunca é calculado pela média de percentuais ou scores mensais.

Para presença, `data_aula` identifica a ocorrência em conjunto com professor, unidade, aula e pessoa. `respondido_em`/`evidencia_registrada_em` podem ser posteriores: chamadas lançadas tardiamente continuam válidas. A data da aula serve para impedir que o mesmo ID externo reutilizado em outra data contamine a taxa.

Quando presença ou outro pilar ainda não têm evento na competência atual, a última competência disponível pode aparecer somente como referência identificada, com peso zero. A pontuação contratual de presença começa em 03/08/2026; evidência anterior continua auditável e contextual. Assim que um evento canônico chega ao banco, a próxima leitura mensal ou de ciclo o incorpora conforme seu período.

Essa separação de recorte e publicação não altera o pipeline Emusys: o mensal acompanha evidências do mês, o ciclo aberto publica `Ciclo em acompanhamento` e somente um snapshot oficial fechado pode liberar ranking de professores comparáveis.

### Evento bruto versus aula operacional (12/08/2026)

`sync-grade-futura-emusys` continua persistindo todos os eventos devolvidos
pela API; ausência no snapshot, cancelamento e duplicidade não autorizam DELETE.
Desde 15/08/2026, a ausência confirmada numa fotografia completa pode apenas
marcar aula normal de hoje/futuro como `sync_ausente_emusys`; a remoção de um
roster exige identidade resolvida e ausência de presença terminal. Fatos de
presença, justificativa, retificação e a própria aula permanecem auditáveis.
Quando o Emusys devolve uma turma vazia antiga e outro evento com roster para o
mesmo professor/unidade/curso/intervalo, `fn_aula_operacional_id` seleciona o
evento utilizável para agenda, pendências e áudio. O evento descartado da UI
permanece auditável em `aulas_emusys` e pode reaparecer como alerta se deixar de
existir uma concorrente válida.
