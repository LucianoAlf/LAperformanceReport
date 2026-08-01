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
        GET /v1/faturas      → sync-faturas-emusys      (cron atual+anterior / refresh interno)

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
| 9 | ➡ sai | `GET /v1/faturas` | sync-faturas-emusys (atual+anterior / sob demanda) | Espelho atual + snapshot financeiro auditável |
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

`refresh-contas-receber` recebe uma competência explícita (`YYYY-MM-01`), executa o sync completo das 3 unidades e devolve `sync_run_id`. Para o cron, a mesma Edge resolve `atual` e `anterior` em BRT e executa os dois em sequência. O segredo dedicado vem do Vault e não expõe credenciais do banco.

`sync-faturas-emusys` cria o run `running` antes da coleta, usa mutex global no banco, limita chamadas a 50/min e só publica depois de validar paginação, IDs, datas e completude das 3 unidades. A publicação atômica atualiza `emusys_faturas` como espelho canônico atual e grava `sync_run_items` imutáveis, eventos e tombstones por competência. Baseline legado compara ausências, mas não prova frescor.

`export-contas-receber` lê somente snapshots live completos. Com `sync_run_id`, exporta o run exato; com `require_latest=true`, também exige que ele seja o último completo. Sem ID, seleciona o último completo da competência para o fallback read-only. O manifesto informa `sync_run_id` e `latest_complete_sync_run_id`. O exportador cruza aluno/curso por `(unidade_id, emusys_matricula_id)` e usa o UUID estável de `emusys_faturas` como `la_report_fatura_id`. `row_source_hash` e `manifest_hash` excluem IDs técnicos de run/item e timestamps operacionais.

O plano de contas e a auditoria da classificação continuam no projeto Super Folha.
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
