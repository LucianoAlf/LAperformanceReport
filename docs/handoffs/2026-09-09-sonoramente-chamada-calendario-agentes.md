# Handoff LA → SonoraMente (chamada, calendário, agentes)

> **Data:** 2026-09-09 · **Escopo:** inteligência operacional (regras, RPCs, tabelas, eventos) — **não** UI nem código.
> **SonoraMente:** clínica, 1 paciente por sessão (sem turma), pacote típico 20 sessões / 6 parcelas, Rio de Janeiro.
> **Cérebro conversacional do SonoraMente:** **Aurora** (um agente só) — absorve o que na LA fazem Mila, Sol e Lia.
> **Fontes:** `docs/CHAMADA-AGENDA.md`, `docs/CALENDARIO-INTELIGENTE.md`, migrations `20260811*`–`20260827*` (chamada) e `20260812*` (motor), edge `sync-feriados`, e **dados de produção consultados em 09/09/2026** (motivos reais de justificativa, feriados 2026, crons, constraints atuais).

**Os 3 princípios que valem ouro portar:**

1. **Evidência ≠ Decisão.** O sistema integrado (na LA, o Emusys) traz evidência bruta; a decisão final é humana. Os dois são gravados em campos separados e a divergência vira alerta, nunca sobreposição silenciosa.
2. **O calendário é o motor, não o destino.** Feriado/recesso configurado uma vez alimenta: projeção das N sessões, watchlist de pacotes acabando e semáforo de novo paciente.
3. **Falta justificada e cancelamento viram crédito; falta seca vira cobrança.** O crédito tem ciclo de vida próprio (`pendente → agendada → realizada/expirada/cancelada`).

---

## A — Chamada (aluno → paciente)

### A.1 Estados canônicos

Fonte: `aluno_presenca.status_presenca` (constraint real) + resolvedor `fn_presenca_fecha_chamada`. Estado **`cancelada` não é estado do aluno — é estado da aula** (`aulas_emusys.cancelada` + `cancelada_origem/motivo/em`). Estado **`experimental` não é presença — é tipo de compromisso** (ver seção B).

| Estado | Como existe no banco | Consome sessão do pacote? | Gera crédito de reposição? | Quem pode marcar | Clicou de novo no mesmo estado |
|---|---|---|---|---|---|
| **indeterminado** | Sem linha em `aluno_presenca` **ou** `status_presenca = NULL` | — (nada decidido) | Não | É o estado inicial; ninguém "marca" indeterminado | — |
| **presente** | `'presente'` | **Sim** (desconta 1 do pacote) | Não | Secretaria (Agenda), professor (app), professor por WhatsApp/áudio | **Toggle:** apaga o registro, volta a indeterminado, grava retificação de auditoria |
| **falta** (seca) | `'falta'` com `respondido_por` humano | **Sim** (desconta; pacote anda) | Não | Idem | Toggle idem (apaga → indeterminado) |
| **falta_justificada** | `'falta_justificada'` + motivo obrigatório (≥3 chars) + evidência opcional | **Não consome** | **Sim** — `aluno_reposicoes.origem='falta_justificada'`, status `pendente` | Idem | Toggle idem — e **cancela o crédito pendente** junto |
| *(aula)* **cancelada** | `aulas_emusys.cancelada=true` | **Não consome** | **Sim** — 1 crédito `origem='cancelamento'` **por paciente do roster** | Secretaria (motivo obrigatório); origem também pode ser o sistema externo | Não é toggle — cancelar exige modal com motivo; descancelar = operação separada |

⚠️ **A evidência do sistema externo NUNCA é estado.** `emusys_presenca_bruta='ausente'` sem decisão humana = **indeterminado** e entra na fila de pendências; só `emusys + presente` fecha a chamada sozinho (com badge "Emusys"). No SonoraMente o equivalente é: confirmação automática (ex.: lembrete respondido) pode fechar "presente", mas "não respondeu" nunca vira falta sozinho.

**Quem escreve (coluna `respondido_por`, valores reais):** `professor_la_teacher`, `professor_whatsapp`, `fabio_audio`, `agenda_secretaria`, `manual` → decisões humanas; `sistema`, `emusys` → evidência. O responsável pelo paciente **não marca** presença — ele **avisa**, e a recepção/secretaria lança (com o motivo dele como texto da justificativa).

**Regras duras do motor de chamada (vale copiar):**

- Raspar uma decisão humana por cima de outra **exige motivo** e gera linha em `aluno_presenca_retificacoes` (status anterior, status novo, quem, quando) — a primeira escrita é preservada.
- Descer de `falta_justificada` para `falta` **mata o crédito pendente** automaticamente.
- Toda escrita leva `request_id` e devolve **recibo** (`app_status_comando_presenca_v1`) — idempotência ponta a ponta; retry do usuário não duplica lançamento.
- Chamada recusa item em aula cancelada, aluno fora do roster e status inválido — com erro **por item**, nunca rejeição em bloco silenciosa.

### A.2 Cancelamento vs falta vs falta justificada

**Cancelamento (da sessão):** a sessão deixa de existir por decisão da casa ou força maior (profissional doente, falta de luz, vendaval). Motivo é **obrigatório** e auditado (`cancelada_origem`, `cancelada_motivo`, `cancelada_por_usuario_id`, `cancelada_em`). **Não desconta do pacote** e gera crédito de reposição para cada paciente da sessão. Existe escopo em massa (`unidade_dia` — ex.: vendaval fecha a unidade) restrito a admin.

**Falta justificada:** o paciente não veio **e avisou** (ou a recepção sabe o porquê). Motivo livre obrigatório (mín. 3 caracteres) + evidência opcional (atestado sobe para bucket **privado** `presenca-evidencias`). **Não desconta do pacote** e gera crédito de reposição. Na prática da LA, é também o caminho usado quando a culpa é da casa — os motivos reais incluem "professor não estava na escola".

**Falta sem aviso (seca):** o paciente não veio e não avisou. Não pede motivo. **Desconta do pacote** (a sessão conta como consumida — é a posição comercial da LA e a praxe de clínica com hora reservada), não gera crédito e é o gatilho de follow-up/retenção.

**Motivos de falta justificada cadastrados hoje (texto livre, produção, 09/09/2026 — frequência entre parênteses):**

| Grupo | Motivos reais |
|---|---|
| Força maior / casa | "CANCELAMENTO DEVIDO PREVISÃO DE VENTANIA NO RJ" (25), "Acabou a luz" (7), "Professor não estava na escola" (11), "prof cancelou" / "Professor não veio..." (3) |
| Saúde | "Atestado"/"atestado" (5), "Está doente", "ALuno doente, responsável enviou atestado", "aluna quebrou o braço" |
| Benefício contratual | "Irá utilizar o benefício do passaporte..." (3 — aviso prévio com direito, não gera cobrança) |
| Vida | "trabalho" (2), "Declaração de trabalho", "viagem de trabalho", "compromisso pessoal" |
| Operacional | "Reposição fora contrato", "refez a aula em outro dia" |

⚠️ Aprendizado para a clínica: **texto livre degenera** ("atestado" ≠ "Atestado"). O SonoraMente deveria nascer com **catálogo de motivos + texto complementar opcional**, não texto livre puro.

### A.3 RPCs e Edge Functions (o que o motor usa de verdade)

| Nome | 1 linha |
|---|---|
| `app_registrar_chamada_agenda(p_itens jsonb, p_request_id uuid)` | Lança presença/falta/justificada/indeterminado em lote, com permissão `agenda.chamada` por unidade, recibo e idempotência |
| `app_justificar_falta(id, motivo, evidencia)` | Atalho de 1 paciente; delega para a RPC acima (caminho único) |
| `app_cancelar_aula(aula_id, motivo, evidencia, escopo)` | Cancela sessão (ou o dia inteiro da unidade, admin-only) e gera créditos para todo o roster |
| `casar_reposicoes()` (service_role) | Casa créditos pendentes com a reposição real: elo direto (mesma sessão reagendada) ou rede (outra sessão, mesmo paciente+serviço); marca realizada quando o paciente consta presente |
| `app_registrar_presenca_professor_dia` / `app_remover_presenca_professor_dia` / `app_marcar_presenca_professor_aula` | Ponto do profissional (bulk por dia / fino por sessão) |
| `app_registrar_presenca_experimental(id, status)` | Presença de lead experimental (`experimental_realizada`/`experimental_faltou`) |
| `get_agenda_dia` / `get_agenda_semana` | Leitura da operação (aulas + roster + presença + evidência) |
| `fn_presenca_fecha_chamada(status, respondido_por)` | Resolvedor puro: "a chamada está resolvida?" |
| `get_presenca_contexto_agente_v1(..., escopo)` | **Contrato único** que alimenta os agentes (mila/sol/lia/fabio) — cada escopo recebe um recorte diferente |
| `upsert_presenca_emusys_bruta` | Grava evidência externa **sem sobrescrever** decisão humana; divergência vira conflito revisável |
| Edge `sync-presenca-emusys` | Pipeline de evidência (no SonoraMente não existe — a agenda é nativa) |
| ⚠️ `app_reagendar_aula` | **Constante no doc antigo mas NÃO EXISTE no banco.** Reagendar na LA é feito no sistema externo e absorvido pelo `casar_reposicoes`. No SonoraMente, implementar `app_reagendar_sessao` de verdade |

### A.4 Campos que o SonoraMente deve espelhar

Da `aluno_presenca` + `aluno_presenca_administrativo` + `aluno_reposicoes` (schema real):

```
sessao_presenca:  sessao_id, paciente_id, profissional_id?, unidade_id, data, horario,
                  status ('presente'|'falta'|'falta_justificada'|null=indeterminado),
                  motivo (≥3 chars se justificada), evidencia_path (bucket privado),
                  respondido_por ('recepcao'|'profissional_app'|'profissional_whatsapp'|'sistema'),
                  respondido_em, autor_usuario_id,
                  presenca_bruta_origem_externa (se houver integração — senão, omitir)
sessao:           ..., cancelada bool, cancelada_origem, cancelada_motivo, cancelada_por, cancelada_em,
                  reagendada bool, data_hora_inicio_original
credito_sessao:   paciente_id, sessao_origem_id, origem ('falta_justificada'|'cancelamento'),
                  status ('pendente'|'agendada'|'realizada'|'expirada'|'cancelada'),
                  motivo, sessao_reposicao_id, casamento ('elo_direto'|'rede'|'manual'),
                  agendada_em, realizada_em, expira_em, UNIQUE(paciente, sessao_origem, origem)
presenca_retificacoes: presenca_id, status_anterior, status_novo, motivo, autor, created_at
```

- **NÃO copiar:** roster multi-aluno/turma (1 paciente por sessão torna `aula_alunos_emusys` inteiro desnecessário), camada de evidência Emusys (`emusys_presenca_bruta`, gêmeas, políticas de confiabilidade — só existem porque a fonte é terceira), ponto do professor como módulo separado (na clínica 1×1, presença do profissional = sessão cancelada por ele), lead experimental na mesma agenda (ver B), permissão multi-unidade pesada.
- **Copiar sem pensar duas vezes:** separação evidência/decisão (mesmo sem Emusys — vale para confirmação automática de WhatsApp), os 4 estados + toggle, motivo obrigatório em justificada/cancelamento, retificações com trilha, crédito com ciclo de vida e casamento elo direto/rede, recibo idempotente nas escritas.

---

## B — Tipos de compromisso e motivos

### B.1 Tipos de sessão/compromisso no banco LA

| Onde mora | Tipo | Significado |
|---|---|---|
| `aulas_emusys.categoria` | `normal` | Sessão regular do pacote |
| `aulas_emusys.categoria` | `experimental` | Aula experimental de lead (não é aluno; presença própria: `realizada`/`faltou`/`aguardando`) |
| `aulas_emusys.cancelada` (+origem/motivo) | cancelada | Cancelada na origem ou pela equipe |
| `aulas_emusys.reagendada` + `data_hora_inicio_original` | reagendada | Mesma linha movida de data; elo direto do crédito |
| `aluno_reposicoes.aula_reposicao_id` | reposição | Sessão real que "paga" um crédito |
| `projecao_aulas.status` | `projetada`, `realizada`, `falta`, `falta_justificada`, `reposta`, `debitada_evento`, `cancelada` | Ciclo de vida da sessão projetada |

**Equivalente SonoraMente sugerido:** `tipo_sessao in ('regular', 'avaliacao_inicial', 'reposicao')` — a "experimental" da LA é a **avaliação inicial**, e merece presença própria porque o desfecho dela (virou paciente?) é o KPI comercial.

### B.2 Motivos — hoje (texto livre) e o que a clínica deveria catalogar

Hoje é texto livre (reais na A.2). Para criança **neurodivergente**, catálogo sugerido (manter `outro` com texto):

| Motivo catalógico | Pertinência clínica |
|---|---|
| `crise_desregulacao` | Crise/meltdown no horário — padrão clássico de faltas de última hora |
| `fadiga_sensorial` | Dia de sobrecarga; família opta por preservar |
| `consulta_saude` | Médico/exame/terapia não postergável (com atestado opcional) |
| `intercorrencia_familiar` | Responsável não consegue trazer (trabalho, transporte, irmão doente) |
| `evento_escolar` | Passeio, prova, adaptação escolar |
| `viagem_ferias_familia` | Ausência programada (análogo ao "passaporte" da LA — pode ser benefício contratual) |
| `condicao_climatica` | Chuva forte/ventania afetando deslocamento (top motivo real da LA!) |
| `clinica_cancelou` | Profissional ausente / sala indisponível — **não é falta do paciente** |
| `outro` | Texto livre obrigatório |

⚠️ Regra de ouro: `clinica_cancelou` e feriado **nunca descontam**; `crise_*`/`consulta_saude`/`clima` geram crédito; `sem_aviso` desconta.

---

## C — Calendário e projeção de pacote

### C.1 Feriados — fonte exata

| Item | Valor real em produção |
|---|---|
| API | **BrasilAPI**: `GET https://brasilapi.com.br/api/feriados/v1/{ano}?uf=RJ` |
| Payload | `[{ "date": "2026-04-21", "name": "Tiradentes", "type": "national" }, { "date": "2026-01-20", "name": "São Sebastião", "type": "state", "state": "RJ" }, ...]` |
| Cobertura automática | **Nacional + estadual (UF=RJ)** |
| Municipal | **Manual** (BrasilAPI não cobre município) — ex.: São Jorge 23/04 com `cidade='Rio de Janeiro'` |
| Quem puxa | Edge `sync-feriados` (service_role): body `{ano?, uf='RJ'}`; upsert `on conflict (data)`; **nunca reativa** feriado desativado manualmente (`ativo=false`) |
| Cron real | `sync-feriados-anual` → `0 6 2 1 *` (1×/ano, madrugada de 02/jan UTC) **+ botão manual** "Importar feriados" na UI |
| Tabela | `feriados(id, data UNIQUE, nome, tipo 'nacional'|'estadual'|'municipal', uf, cidade, ativo)` |

Ano corrente em produção (2026): 16 feriados — ex.: 16–17/02 Carnaval (2 dias!), 03/04 Sexta Santa, 20/01 São Sebastião (RJ), 23/04 São Jorge (município RJ), 20/11 Consciência Negra. **O que é manual:** municipal, pontos facultativos, e desativar feriado que a operação decide trabalhar.

### C.2 `calendario_escolar` → `calendario_clinica`

Constraint **atual em produção** (foi ampliada depois da v1): `tipo in ('recesso','emenda','feriado','evento','day_off')`; schema: `id, unidade_id, ano, tipo, data_inicio, data_fim, nome, status ('simulado'|'confirmado'), observacoes`.

| Tipo | Efeito no motor | Equivalente na clínica |
|---|---|---|
| `recesso` | **Pula** o período | Férias coletivas / fim de ano |
| `emenda` | Pula o dia | Ponto facultativo decidido pela direção |
| `feriado` | Pula o dia | (geralmente já vem da tabela `feriados`) |
| `day_off` | Pula o dia | Fechamento pontual (manutenção, treinamento) |
| `evento` | **Conta como sessão**, marcado diferente | Raro na clínica; talvez "dia de avaliação em grupo" |

⚠️ Sinceridade técnica: o `materializar_projecao_contrato` vigente consome **feriados (tabela) + recesso/emenda confirmados**; `evento`/`day_off` existem no catálogo/UI (o `recalcular_projecao` em produção já menciona `evento`). No SonoraMente, decida desde o dia 1 quais tipos pulam — e teste.

⚠️ Distinção operacional validada com dados reais (função `escola_agenda_v1`): **feriado ≠ recesso para o comercial**. Feriado (bloco curto) = clínica fechada (matrícula/dia medida: 0). Recesso (bloco ≥3 dias) = sessões regulares param, **mas recepção/comercial trabalham** (1,6–6,1 matrículas/dia medidas na LA). A Aurora deve calar lembretes de sessão nos dois, mas **só calar o comercial em feriado**.

### C.3 Motor de projeção (adaptado: pacote de 20)

Entrada: **dia da semana fixo + data da 1ª sessão + N sessões** (+ data alvo de fim opcional; sem ela, início + 18 meses de horizonte).

Algoritmo real (`materializar_projecao_contrato`):
1. Avança da data de início até cair no weekday certo.
2. Loop de 7 em 7 dias: **se o dia está em feriado/recesso/emenda → não conta e segue** (o dia pulado **não consome sessão** — ele some e empurra o pacote).
3. Cada dia válido vira linha `sequencia++, data_projetada` até completar N.
4. Data final = data da enésima linha. Semáforo vs. data de fim planejada: **|Δ| ≤ 21d verde · ≤ 35d amarelo · além vermelho**.

**Exemplo com datas reais** (pacote 20, toda **quinta**, início 10/09/2026):
sem obstáculo → 20ª sessão em **21/01/2027**. Cadastrando recesso **22/12/2026–05/01/2027** (pula 24/12 e 31/12) → a 20ª desliza para **04/02/2027**. Cada semana de recesso empurra o fim do pacote em exatamente 1 semana.

Banco de segurança (LA, 40 aulas/ano): cada weekday comporta N aulas possíveis no ano (segunda 48 … sábado 40); o excedente sobre o vendido é o "banco". Na clínica com pacotes de 20 rolling, o equivalente é o **semáforo de Δ** acima + watchlist.

### C.4 Recesso cadastrado NO MEIO do contrato

É o caminho normal, não exceção:
1. Insert/update em `calendario_escolar` com `status='confirmado'` dispara trigger.
2. O trigger **marca** todos os contratos ativos da unidade com aula projetada caindo no período (`versao+1`) e loga `recesso_confirmado`/`emenda_confirmada` em `projecao_recaculo_log` (quem, qual período, versão anterior/nova).
3. `recalcular_projecao(aluno, contrato, trigger, detalhes)` refaz **só o futuro**: sessões já passadas casam com a presença e viram `realizada/falta/falta_justificada`; as restantes são redesenhadas a partir de hoje pulando o novo obstáculo. **Nada reescreve o passado.**

### C.5 RPCs/triggers do calendário

| Nome | Gatilho | 1 linha |
|---|---|---|
| `materializar_projecao_contrato` | Nova matrícula (via trigger de jornada) / botão | Gera as N datas do pacote |
| `recalcular_projecao` | Mudança de calendário, reposição, troca de dia | Refaz o futuro, versiona, loga |
| `prever_projecao` | Antes de materializar | Preview sem gravar (o semáforo do cadastro) |
| `simular_emenda` | Antes de confirmar emenda | Quantos pacotes afetados, quantas sessões deslocadas |
| `get_watchlist_projecao` | Leitura | `estourando` / `sem_margem` / `janela_renovacao` / `concluido` |
| `get_radar_renovacoes` | Leitura | Pacotes terminando por mês (base do alerta "pacote 20 perto do fim") |
| Triggers | `trg_jornada_projecao`, `trg_presenca_projecao`, `trg_reposicao_projecao`, `trg_calendario_projecao` | Materializar / reconciliar realizadas / casar reposição / marcar recálculo |
| Edge `sync-feriados` | cron anual + botão | BrasilAPI → `feriados` |
| Contrato rolling sem ano seguinte | `get_calendario_resumo_ano(ano)` | Se o ano seguinte não tem calendário, usa **calendário provisório** = padrão do ano anterior (`fonte='padrao_ano_anterior'`, `projecao_aulas.is_provisional=true`) |

---

## D — Agentes (Mila, Sol, Lia) e o que a Aurora absorve

⚠️ **Correção de premissa:** "Fábio" na LA **não é o professor humano** — é o **sistema/agente** que opera o WhatsApp dos professores (chamada por comando/áudio, fila de pendências, diário). Mila/Sol/Lia/Fábio são 4 sistemas; os professores humanos são usuários do LA Teacher. Os quatro leem o **mesmo contrato**: `get_presenca_contexto_agente_v1(..., escopo)` sobre a view canônica de ocorrências — cada escopo recebe um recorte (nominal vs agregado), nunca a tabela crua.

### D.1 Mila — Comercial

- **Missão:** primeiro contato com lead no WhatsApp (SDR) + copiloto do time comercial (pauta do dia, retomadas, motivo de perda).
- **Chamada que lê:** **só experimental/visita** (faltou na experimental? foi reagendada?) — escopo `mila` recebe `contrato_experimental`.
- **Evolução que lê:** nenhuma.
- **Destino:** WhatsApp das consultoras por unidade + liderança (via Chatwoot/WAHA); log em `automacao_log`.
- **Jobs:** briefing 08:30 e fechamento 18:30 (seg–sáb, cron no VPS), "cutucada" horária; RPCs `mila_briefing_manha_v1`, `mila_fechamento_dia_v1`, `mila_cutucada_v1`.
- **Exemplo real (resumido):** "☀️ BOM DIA — UNIDADE · 🎯 HOJE · 3 experimentais · 10:00 *Luci* — Canto 👩‍🏫 Daiana · 📌 DE ONTEM · 2 sem desfecho · Luis Arthur — Violão…"

### D.2 Sol — Operação/admin-financeiro

- **Missão:** operação do dia e retaguarda: pendências de chamada, aviso prévio de fim de contrato, inadimplência, caixa.
- **Chamada que lê:** **pendências nominais e conflitos** (escopo `sol`) — "sessão de ontem sem ninguém ter lançado nada", "sistema disse ausente e professor disse presente".
- **Evolução que lê:** não lê evolução; lê agenda/faturas/movimentações.
- **Destino:** grupos WhatsApp da unidade (fila `fila_relatorios_sol_hermes` + pump), digest de presença 09:00 (`relatorio-presenca-pendencias-9h`, cron `0 12 * * *`).
- **Jobs:** crons de relatório (ex.: aviso prévio 08:05/09:05/10:05 seg–sex), watchdog 5min.
- **Exemplo real:** "🔔 Avisos Prévios de Finalização — Encerrou ontem · 2 …Encerra hoje · 1 … ➡️ Concluir no sistema".

### D.3 Lia — Sucesso do Aluno (retenção)

- **Missão:** pós-evasão e saúde da base: pesquisa de evasão, follow-up 72h, alertas privados para operadores.
- **Chamada que lê:** **apenas agregados** (escopo `lia`: contadores, sem nomes) + alertas com gatilho de presença/frequência.
- **Evolução que lê:** não lê o lançamento da aula; lê eventos de pesquisa.
- **Destino:** WhatsApp privado do operador (caixa dedicada "Lia — Sucesso do Aluno", dispatcher edge `processar-alertas-lia`, cron **a cada minuto** + expurgo diário).
- **Exemplo real (pós-pesquisa):** "{{nome}}, muito obrigada! 🙏 Que bom receber seu retorno… As portas da LA seguem abertas 🎵"

### D.4 Tabela: evento SonoraMente → quem faz hoje na LA → o que a Aurora faz

| Evento SonoraMente | Quem faz hoje na LA | Ação da Aurora no grupo admin da clínica |
|---|---|---|
| Sessão terminou sem presença lançada | Sol (digest 09h + pendências nominais) | Digest no grupo admin: "Ontem: 3 sessões sem registro — [pacientes]" + cobrar em D+1 |
| Presente sem evolução/registro clínico | **Fábio** (fila `pendencia_registro`, diário 06:00) | Lembrete **privado ao profissional** ("evolução da sessão de [paciente] pendente"); escala ao grupo após 24–48h |
| Falta sem aviso | Chamada marca `falta`; Lia cuida da retenção | Aviso no grupo admin + sugerir mensagem ao responsável; contar faltas-secas no período (gatilho de risco) |
| Profissional cancelou | `app_falta_professor_cancelar_aulas` + créditos automáticos | Confirmar geração dos créditos e postar lista "reagendar: [pacientes]" — Aurora **informa**, humano reagenda |
| Pacote de 20 perto do fim | Watchlist `janela_renovacao` + radar de renovações (Sol) | Alerta no grupo: "[Paciente] faz a 18ª de 20 em [data] — agendar conversa de renovação" |
| Falta na avaliação inicial | Mila (experimental faltou) | "Avaliação de [paciente] não aconteceu — retomar contato hoje" |
| Feriado/recesso se aproximando | Calendário → projeção (`simular_emenda`, `escola_agenda_v1`) | Aviso proativo: "Semana do feriado: N sessões serão puladas e pacotes esticam até [datas]" (não calar comercial em recesso) |

**Lição de design para a Aurora:** um agente, **dois modos de fala** — (1) grupo admin: nominais e acionáveis (Sol/Fábio); (2) contato com responsável: só o daquele paciente (Mila/Lia). Nunca o contrário.

---

## E — Ordem de implantação recomendada (A→D)

1. **A1 — Núcleo da chamada sem IA:** `sessoes` + `sessao_presenca` com os 4 estados, toggle, motivo obrigatório em justificada/cancelamento, retificações com trilha e **catálogo de motivos** (não texto livre). Nenhum agente nesta fase.
2. **A2 — Crédito de reposição:** `credito_sessao` com ciclo `pendente→agendada→realizada/expirada/cancelada`, nascimento em justificada/cancelamento, morte automática ao rebaixar para falta seca, e `app_reagendar_sessao` nativo (a LA nunca implementou — o SonoraMente já nasce com ele, fazendo elo direto).
3. **C — Calendário + motor:** tabela `feriados` alimentada pela BrasilAPI (`?uf=RJ`, cron anual 02/jan + botão) e municipal manual; `calendario_clinica` (recesso/emenda/day_off); `materializar_projecao_pacote(20, weekday, início)` + `recalcular` versionado + semáforo no cadastro; recesso no meio = recálculo automático via trigger.
4. **D-light — Digest operacional antes da IA:** job diário 09h "sessões de ontem sem presença" + "evoluções pendentes" + "pacotes chegando na 18/20" no grupo admin por texto fixo. Só quando os dados estiverem limpos…
5. **D-full — Aurora como leitora:** contrato único `get_contexto_operacao(escopo)` (nominal para grupo admin, agregado para análise, extrato do paciente para contato com responsável); ela **lê e alerta**, nunca escreve estado de presença — escrita continua humana via RPC com recibo idempotente.

---

### Apêndice — crons reais observados em produção (09/09/2026)

| Job | Schedule | Leitura BRT |
|---|---|---|
| `sync-feriados-anual` | `0 6 2 1 *` | 02/jan, madrugada |
| `relatorio-presenca-pendencias-9h` | `0 12 * * *` | diário 09:00 |
| `sync-presenca-dia-*` (3 unidades) | `10,25,43 3 * * 0,2-6` | madrugada pós-dia |
| `sync-presenca-catchup-manha` | `33 10 * * *` | 07:33 |
| `lia-alertas-privados-dispatcher-minuto` | `* * * * *` | contínuo |
| `fabio-diario-coletar/fechar/laudo` | `0,5,15 6 * * *` | 03:00–03:15 |
| `sol-hermes-report-watchdog-5min` | `*/5 * * * *` | contínuo |

*Sem secrets, tokens ou payload pessoal neste documento. Nomes de pacientes em exemplos dos agentes foram truncados/anonimizados.*
