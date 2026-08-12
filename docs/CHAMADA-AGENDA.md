# Chamada & Agenda — Documentação Completa

> **Versão:** 1.0 — 12/08/2026
> **Status:** Em produção, estável
> **Próximo passo:** Integrar alertas na página de Alunos e Administrativo

---

## 1. Objetivo

A Chamada é a **fonte de verdade operacional** para presença de alunos e professores na LA Music. Resolve a dor real de depender do Emusys para saber quem veio, quem faltou e quem precisa de atenção.

### Por que existe

- O Emusys marca "ausente" por padrão em 100% das aulas futuras — não é fato, é default.
- A equipe precisa de um lugar para confirmar, corrigir e agir sobre presenças.
- O Emusys não limpa alunos removidos da turma — alunos evadidos apareciam como "sem destino".
- A equipe mora na página de **Alunos** e **Administrativo**, não na Agenda. A Agenda é o motor; a equipe pilota o carro nas outras páginas.

### Princípio central

> **Evidência ≠ Decisão.** O Emusys traz evidência bruta (presente/ausente). A decisão final é humana. O sistema registra ambos e mostra o conflito quando divergem.

### Regra canônica entre Emusys, LA Report, LA Teacher e Fábio

Desde 12/08/2026, `aluno_presenca` é a única decisão operacional local para os
quatro canais. A função `fn_presenca_fecha_chamada(status_presenca,
respondido_por)` responde à pergunta operacional **"a chamada está resolvida?"**:

- decisão humana terminal (`presente`, `falta` ou `falta_justificada`) fecha;
- `Emusys + presente` também fecha, com badge **Emusys**;
- `Emusys + ausente` continua como pendência humana — não vira falta automática;
- origem desconhecida, estado nulo e estados não terminais não fecham a chamada.

`fn_presenca_e_forte` continua existindo para identificar autoria humana; ele não
substitui o resolvedor. Fila de pendência, sessão do Teacher e candidatos do
Fábio usam o resolvedor canônico. Não há escrita de volta no Emusys enquanto a
API externa não oferecer endpoint autenticado e idempotente para isso.

---

## 2. Arquitetura

```
Emusys API ──→ sync-presenca-emusys (edge) ──→ aulas_emusys + aluno_presenca
                                                      │
                                                      ▼
                                              get_agenda_dia (RPC)
                                                      │
                                                      ▼
                                              ChamadaDia / ChamadaSemana / ChamadaLista
                                                      │
                                                      ▼
                                              AlertaPendencias (hoje/ontem)
```

### Tabelas principais

| Tabela | O que guarda | Quem escreve |
|--------|-------------|--------------|
| `aulas_emusys` | Aulas do dia (horário, professor, sala, curso) | sync-presenca-emusys |
| `aula_alunos_emusys` | Roster: quem está em cada aula | sync-presenca-emusys |
| `aluno_presenca` | Presença individual (evidência + decisão) | sync + humano |
| `professor_ponto_confirmacoes` | Presença do professor (dia e por aula) | Agenda + LA Teacher (futuro) |
| `lead_experimentais` | Aulas experimentais | sync + webhook |
| `aluno_reposicoes` | Créditos de reposição | app_cancelar_aula |

### RPCs

| RPC | O que faz |
|-----|-----------|
| `get_agenda_dia` | Retorna todas as aulas do dia com alunos, presença, evidência Emusys |
| `get_agenda_semana` | Retorna 6 dias em 1 chamada (performance) |
| `app_registrar_chamada_agenda` | Grava presença/falta/justificativa de um aluno |
| `app_registrar_presenca_professor_dia` | Marca professor presente/ausente em TODAS as aulas do dia |
| `app_remover_presenca_professor_dia` | Remove marcação de presença do professor |
| `app_falta_professor_cancelar_aulas` | Cancela aulas do professor quando ele falta |
| `app_cancelar_aula` | Cancela aula individual (gera crédito de reposição) |
| `app_reagendar_aula` | Reagenda aula para outro dia/horário |
| `upsert_presenca_emusys_bruta` | Grava evidência bruta do Emusys sem sobrescrever humano |
| `fn_presenca_fecha_chamada` | Resolve, de modo puro e status-aware, se aquela presença fecha a chamada |
| `fabio_confirmar_chamada_acao` | Confirma a chamada do WhatsApp pela ação, shortlist e idempotência já existentes |

---

## 3. Como funciona

### 3.1 Views

**Professores** — Grade do dia por professor. Cada coluna é um professor, cada linha é um horário. Clique na aula abre drawer.

**Salas** — Grade do dia por sala. Mesma lógica, agrupado por sala física.

**Chamada** — Foco em presença. Três sub-views:

| Sub-view | Para quê |
|----------|----------|
| **Dia** | Operação diária. Alerta de pendências + presença de professores + lista de aulas |
| **Semana** | Visão semanal. Cards por dia, clicáveis. Uma RPC só (performance) |
| **Lista** | Lista plana de todas as aulas do dia com status de presença |

### 3.2 Estados do aluno

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  indeterminado  │────→│   presente   │     │    falta    │
│  (ninguém marcou)│     │ (confirmado) │     │ (confirmado)│
└─────────────────┘     └──────────────┘     └─────────────┘
         │                                            ▲
         │              ┌──────────────────┐          │
         └─────────────→│ falta_justificada │──────────┘
                        │ (com motivo)      │
                        └──────────────────┘
```

**Regras:**

- `status_presenca = NULL` → **indeterminado** (ninguém marcou)
- `status_presenca = 'presente'` → **presente**
- `status_presenca = 'falta'` + `respondido_por` humano → **falta** (final)
- `status_presenca = 'falta'` + `respondido_por = 'emusys'` → **indeterminado** (Emusys é neutro)
- `status_presenca = 'falta_justificada'` → **falta justificada**

**Origens humanas válidas:** `professor_la_teacher`, `professor_whatsapp`, `manual`, `fabio_audio`, `agenda_secretaria`

### 3.3 Evidência bruta do Emusys

`emusys_presenca_bruta` guarda o que o Emusys retornou:
- `'presente'` — Emusys marcou presente
- `'ausente'` — Emusys marcou ausente
- `NULL` — Emusys não retornou o aluno

Quando a evidência diverge da decisão humana, a UI mostra badge de conflito.

O sync nunca apaga o último raw: uma troca automática `presente → ausente`
reabre a pendência se não houver decisão humana. Se contradiz uma decisão humana,
abre conflito revisável; não inventa falta nem substitui a decisão silenciosamente.
Em aulas gêmeas de turma/individual, a decisão humana pode ser espelhada com
referência à linha de origem, mas o raw Emusys fica na própria aula de origem.

### 3.4 Toggle de presença

Clicar em um estado ativo **remove** a marcação e volta para `indeterminado`. Isso permite corrigir erros sem criar um novo registro.

### 3.5 Presença do professor

**Por dia (bulk):**
- Botão "Todos presentes" / "Todos ausentes" no topo
- Marca TODAS as aulas do professor naquele dia
- Se o professor falta, pode cancelar as aulas automaticamente

**Por aula (fino):**
- Cada aula tem toggle individual
- Útil para professor que saiu mais cedo

**Regras:**
- Se um aluno foi marcado presente, o professor é automaticamente considerado presente (evidência)
- `professor_presenca = 'ausente'` do Emusys é DEFAULT — só tem significado depois que a aula ocorreu

### 3.6 Alerta de pendências

Separado em dois grupos:

| Grupo | O que significa | Ação |
|-------|----------------|------|
| **Ausente no Emusys** | Emusys marcou ausente, ninguém confirmou | Confirmar se é falta ou erro |
| **Sem destino** | Ninguém marcou nada | Marcar presença/falta/justificar |

**Separação temporal:**
- **Hoje** — aulas que já terminaram hoje
- **Ontem** — aulas de ontem que ficaram em aberto (o digest do WhatsApp cobre isso)

**Cores:**
- 0 pendências: verde (parabéns)
- 1-5: amarelo
- 6+: vermelho

### 3.7 Leads experimentais

Visualmente distintos:
- Badge violeta "lead"
- Estado "Aguardando" quando ainda não aconteceu
- Filtro separado
- Não mistura com alunos regulares

### 3.8 Filtro de evadidos/trancados

A RPC `get_agenda_dia` filtra alunos evadidos/trancados da agenda atual. Mas:
- Presenças históricas permanecem visíveis
- A RPC mostra a aula passada mesmo se o aluno evadiu depois

### 3.9 Limpeza de roster

O sync `sync-presenca-emusys` limpa vínculos obsoletos:
- Coleta todas as chaves retornadas pela API
- Remove vínculos locais que não estão na resposta
- Se a API retorna 0 alunos, remove todos os vínculos

Isso resolve o caso de alunos removidos da turma no Emusys que ainda apareciam na chamada.

---

## 4. Performance

| Métrica | Antes | Depois |
|---------|-------|--------|
| Semana (6 dias) | 6 RPCs, ~800ms | 1 RPC, ~640ms |
| Cache | Por dia | Por semana |
| Requisições | 6 HTTP | 1 HTTP |

**Cache:** `useAgendaDia` e `useAgendaSemana` mantêm cache em memória. Navegar entre dias é instantâneo.

---

## 5. O que falta

### 5.1 Integração com página de Alunos (próximo passo)

A equipe mora na página de Alunos. Precisa aparecer lá:

- **Alerta de alunos novos:** matrículas que caíram via webhook e precisam de atenção
- **Alerta de presença pendente:** "X alunos sem destino na chamada de hoje"
- **Alerta de risco:** alunos com alta probabilidade de evasão

**Onde implementar:** `src/components/App/Alunos/` — provavelmente um card de alerta no topo da lista.

### 5.2 Integração com página Administrativa

- **Alerta de pendências de chamada:** quantas aulas de ontem ficaram em aberto
- **Alerta de professores sem presença confirmada**
- **Resumo diário:** "Hoje: X aulas, Y presentes, Z faltas, W pendentes"

### 5.3 LA Teacher → professor_ponto_confirmacoes

Quando o professor lança a aula no LA Teacher, isso deveria automaticamente marcar presença na Agenda. Hoje é manual.

### 5.4 Horários de chegada/saída

O professor pode chegar atrasado ou sair mais cedo. Precisa de:
- `hora_chegada` e `hora_saida` em `professor_ponto_confirmacoes`
- Ajuste automático das aulas afetadas

### 5.5 Notificações

- WhatsApp para equipe quando há pendências críticas
- Notificação in-app quando a chamada está incompleta

---

## 6. Arquivos principais

| Arquivo | O que é |
|---------|---------|
| `src/components/App/Agenda/Chamada/ChamadaDia.tsx` | View do dia |
| `src/components/App/Agenda/Chamada/ChamadaSemana.tsx` | View da semana |
| `src/components/App/Agenda/Chamada/ChamadaLista.tsx` | View em lista |
| `src/components/App/Agenda/Chamada/AlertaPendencias.tsx` | Alerta de pendências |
| `src/components/App/Agenda/Chamada/ChamadaAlunoCard.tsx` | Card do aluno |
| `src/components/App/Agenda/Chamada/ChamadaLeadCard.tsx` | Card do lead experimental |
| `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx` | Toggle do professor |
| `src/components/App/Agenda/Chamada/chamadaUtils.ts` | Lógica de estados |
| `src/hooks/useAgendaDia.ts` | Hook do dia |
| `src/hooks/useAgendaSemana.ts` | Hook da semana |
| `supabase/functions/sync-presenca-emusys/index.ts` | Sync do Emusys |

---

## 7. Commits relevantes

| Commit | O que fez |
|--------|-----------|
| `143dd42f` | Semana em 1 RPC |
| `dc2802fe` | Remove maturidade 24h |
| `5dd8cd67` | Separa ausente Emusys de sem destino |
| `cef9d8c3` | Toggle professor por dia |
| `922f6362` | Card professor com foto |
| `1da1c140` | Ajuste fino por aula |
| `0b797bfb` | Fix constraint origem |
| `ac3394dc` | Filtra evadidos da agenda |
| `e9c190f3` | Limpa roster obsoleto |
| `65e10fb3` | Lead sem telefone não é descartado |
| migrations `20260812172432` e `20260812172556` | Resolvedor canônico, conflito/proveniência e ACL privada da trilha de conflitos |

## 8. Checkpoint de implantação — 12/08/2026

- As migrations canônicas foram aplicadas diretamente no projeto principal
  `ouqwbbermlzqqvtqwlul`, sem branch Supabase e sem dados sintéticos.
- `aluno_presenca_conflitos` tem RLS ativo, sem policy de navegador; `anon` e
  `authenticated` não têm `SELECT`, enquanto `service_role` mantém a porta de
  serviço. As leituras do app seguem pelas RPCs autorizadas.
- Foi detectada no histórico remoto a migration concorrente
  `20260812171943_chamada_retroativa_fallback_emusys`, ainda ausente do Git
  remoto. Ela antecede esta entrega e deve ser reconciliada com seu autor antes
  de um próximo deploy de schema; não foi reaplicada, alterada nem recriada aqui.
- O bridge do Fábio foi publicado com confirmação atômica por ação, shortlist e
  `wa_message_id`; não houve mensagem nem presença de teste. O próximo passo de
  produto é consumir `origem_presenca` e `tem_conflito_presenca` nos badges do
  LA Teacher/Report. O formulário manual continua uma frente separada:
  rascunho por professor+aula+aluno, autosave, versão e cópia apenas dentro do
  roster, nunca da presença.
