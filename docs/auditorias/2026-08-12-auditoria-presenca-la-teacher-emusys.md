# Auditoria de presença (somente leitura)

**Escopo:** la-teacher ↔ LA Report (Financial Compass) ↔ Emusys  
**Modo:** read-only (sem migration, deploy, backfill, envio ou alteração de presença)  
**Fontes:** código versionado, `pg_get_functiondef` / views no banco vivo, SQL do caso Matheus Felipe, API Emusys v1.4 documentada

---

## 1. Veredito em uma frase

Hoje a integração é **unidirecional Emusys → banco local**, com **presença do professor no la-teacher só local**, **sem API de escrita de presença no Emusys**, e a UI do professor trata `respondido_por = 'emusys'` como **evidência fraca** — por isso dá para ver “presente” e ainda “Sem chamada”.

---

## 2. Diagrama — fluxo **atual**

```text
┌─────────────┐  GET /v1/aulas/ (token unidade)   ┌──────────────────────────┐
│   Emusys    │ ───────────────────────────────► │ edge sync-presenca-emusys │
│ UI secretaria│  alunos[].presenca: presente|    │  modos: presenca /        │
│ / default    │  ausente  (sem autor/timestamp)  │  metadados / agenda / exp │
└─────────────┘                                  └────────────┬─────────────┘
                                                              │ RPC
                                                              ▼
                                                 upsert_presenca_emusys_bruta
                                                 respondido_por='emusys'
                                                 respondido_em=NULL
                                                 emusys_presenca_bruta=...
                                                 sincronizado_emusys_em=now()
                                                              │
                    ┌─────────────────────────────────────────┼────────────────────────┐
                    ▼                                         ▼                        ▼
           aluno_presenca                          aulas_emusys               aula_alunos_emusys
           (espelho bruto)                         (grade)                    (roster)
                    │
     ┌──────────────┼──────────────────────────────┐
     ▼              ▼                              ▼
fn_presenca_e_forte   app_minha_agenda_sessao      get_agenda_dia + chamadaUtils
(FALSE p/ emusys)     (LA Teacher: n_registradas  (LA Report: status_presenca=
                      só fontes FORTES)            'presente' já é destino)
     │
     ▼
┌────────────────┐     app_registrar_presencas_aula
│  la-teacher    │ ──► fn_registrar_presencas_core
│  (chamada)     │     respondido_por=professor_la_teacher|fabio_audio|...
└────────────────┘     + fn_sincronizar_gemeos_presenca (só no banco)
                              │
                              ✖ NÃO existe POST/PATCH de presença no Emusys
```

## 3. Diagrama — fluxo **proposto**

```text
                    ┌──────────────────────────────────────────┐
                    │         aluno_presenca (decisão)         │
                    │  + emusys_presenca_bruta (evidência)     │
                    │  + eventos_presenca (append-only audit)  │
                    └──────────────────────────────────────────┘
                     ▲ FORTES                    ▲ FRACAS
     professor_la_teacher / agenda_secretaria /  emusys_bruto (presente|ausente)
     fabio_audio / manual / whatsapp             nunca fecha pendência sozinho
                     │
                     │  outbox_presenca_emusys (idempotente)
                     │  key: (unidade, aula_emusys_id, aluno_id, versao)
                     ▼
              [BLOQUEADO até API Emusys] ── se existir endpoint de escrita
              senão: reconciliação só pull + badge "não espelhado no Emusys"

Pendência de CHAMADA (aluno):
  fechada se ANY fonte FORTE confirmou presente|falta|falta_justificada
  OR (política explícita) emusys_presente_confirmado_via_metadado_futuro

Pendência de REGISTRO (conteúdo Fábio):
  independente (vw_registro_pendencia / anotacoes_fabio)
```

---

## 4. Artefatos envolvidos

### Tabelas
| Artefato | Papel |
|---|---|
| `aluno_presenca` | Espelho local / decisão + evidência bruta |
| `aulas_emusys` | Grade, âncora de slot, `anotacoes` / `anotacoes_fabio` |
| `aula_alunos_emusys` | Roster canônico aula↔aluno |
| `aluno_presenca_retificacoes` | Trilha de correção administrativa |
| `aluno_presenca_administrativo` | Justificativa |
| `presenca_politicas_confiabilidade` | Política temporal (ex. CG) |
| `emusys_sync_log` | Log de runs do sync |
| `automacao_log` | Alunos não matched no sync |

### Funções / views (vivas no banco)
| Artefato | Papel |
|---|---|
| `upsert_presenca_emusys_bruta` | Escrita Emusys→local; não sobrescreve humano |
| `fn_presenca_e_forte` | Matriz de fontes fortes (**não** inclui `emusys`) |
| `fn_registrar_presencas_core` | Escrita la-teacher; promove linha fraca |
| `fn_sincronizar_gemeos_presenca` | Copia presença entre turma↔individual **no banco** |
| `app_registrar_presencas_aula` | RPC la-teacher |
| `app_registrar_chamada_agenda` | RPC secretaria (Agenda LA Report) → `agenda_secretaria` |
| `app_minha_agenda_sessao` | Agenda professor; **só fortes** contam como registradas |
| `vw_registro_pendencia` | Pendência de **registro/conteúdo** (Fábio), não só chamada |
| `vw_aluno_presenca_semantica_v1` | Semântica pedagógica v1.4 |

### Edge / jobs
| Artefato | Papel |
|---|---|
| `sync-presenca-emusys` | Único path Emusys→presença |
| `sync-grade-futura-emusys` | Grade futura **sem** presença de aluno |
| crons `sync-presenca-cg` `50 23 * * 1-5` UTC (~20:50 BRT) | Pull diário CG |
| crons `sync-metadados-aulas-15m-u*` | Metadados a cada 15 min |

### Frontend
| Artefato | Papel |
|---|---|
| `src/.../Chamada/chamadaUtils.ts` | LA Report: `presente` de qualquer origem **fecha** destino |
| la-teacher (RPC) | `tem_presenca_registrada = fn_presenca_e_forte(...)` |

### Arquivos-chave
- `supabase/functions/sync-presenca-emusys/index.ts`
- `supabase/migrations/20260715162000_sync_presenca_emusys_evidencia_bruta.sql` (+ def viva)
- `docs/CHAMADA-AGENDA.md`, `docs/MAPA-INTEGRACAO-EMUSYS.md`
- `docs/auditorias/2026-07-12-auditoria-timestamps-presenca-anotacoes-emusys.md`

---

## A. Fluxo Emusys → la-teacher (comprovado)

### Caminho
1. **Endpoint:** `GET https://api.emusys.com.br/v1/aulas/?data_hora_inicial=...&data_hora_final=...&limite=100` (+ cursor)  
2. **Auth:** header `token` por unidade  
3. **Edge:** `sync-presenca-emusys`  
4. **Persistência de presença:** `rpc('upsert_presenca_emusys_bruta', …)` com `p_status_origem: aluno.presenca`  
5. **Origem gravada:**
   - `respondido_por = 'emusys'`
   - `respondido_em = NULL` (não há instante real de chamada no payload)
   - `emusys_presenca_bruta = 'presente'|'ausente'`
   - `sincronizado_emusys_em = now()` do sync
6. **Def viva (2026-08-11):**
   - Emusys **presente** → `status_presenca = 'presente'`
   - Emusys **ausente** → `status_presenca = NULL` (neutro na Chamada do Report)
   - Só atualiza se linha atual é `NULL|emusys|sistema` (humano forte **não** é sobrescrito)

### Metadados: dá para distinguir secretaria × default?
**Não, com o payload atual da API.**

Evidência (skill Emusys API v1.4 + código):
- `AlunoNaAula.presenca` ∈ {`presente`,`ausente`} **apenas**
- Não existe `nao_registrada`, autor, perfil, ou “confirmado por secretaria”
- `horario_presenca` existe no schema, mas o sync grava isso em `horario_aula` (slot), **não** como “marcado em”
- Não há webhook de presença (webhooks listados: lead/experimental/matrícula/aula_cancelada — **sem** “presença alterada”)

**Campos/endpoints que faltam no Emusys** (pedido formal à API):
1. `presenca_estado`: `nao_lancada | presente | ausente` (separar default)
2. `presenca_atualizada_em`, `presenca_atualizada_por` (tipo: sistema|usuario + id/nome)
3. Ideal: `POST/PATCH /aulas/{id}/presencas` para escrita de volta  
Sem (1)+(2), **qualquer `presente` via pull é ambíguo** (humano vs automação vs default virado).

### Hipóteses prévias — validadas
| Hipótese | Resultado |
|---|---|
| `aluno_presenca` espelho local | **Sim** |
| `aulas_emusys` + `aula_alunos_emusys` mapeiam aula/alunos | **Sim** |
| `sync-presenca-emusys` só entrada | **Sim** (só GET) |
| Payload só `presenca` sem quem/quando | **Sim** |

---

## B. Fluxo la-teacher → Emusys (saída)

### Resultado: **não existe sincronização de saída comprovada**

Evidências:
1. **API Emusys aulas (v1.4):** só `GET /aulas`, `POST /aulas/cancelar`, `PATCH /aulas/reagendar` — **zero endpoint de marcar presença de aluno**
2. Grep nas edges: único uso de `/aulas/` é **GET** em `sync-presenca-emusys`, `sync-grade-futura-emusys`, `marcos-jornada`, `_shared/emusys-aulas.ts`
3. `fn_registrar_presencas_core` grava só em `aluno_presenca` e chama `fn_sincronizar_gemeos_presenca` (espelho **interno**)
4. `fn_sincronizar_gemeos_presenca` comment/código: replica turma↔individual no **mesmo banco**; sem HTTP

Portanto: professor marca no la-teacher → **visível no LA Report** (mesma tabela) → **não** reflete no Emusys para a secretaria lá. Secretaria só vê no Emusys se marcar **no próprio Emusys** (ou se no futuro existir write-back).

---

## C. Pendência, gêmeos e “Sem chamada”

### Duas “pendências” diferentes (não misturar)

| Conceito | Fonte | Fecha com |
|---|---|---|
| **Chamada de presença** (la-teacher) | `app_minha_agenda_sessao` → `n_registradas` / `tem_presenca_registrada` | só `fn_presenca_e_forte` |
| **Destino na Chamada (Report)** | `chamadaUtils.estadoDoAluno` | `status_presenca='presente'` **qualquer origem**; falta só se origem humana |
| **Registro pedagógico (conteúdo)** | `vw_registro_pendencia` / `anotacoes_fabio` | texto Fábio no alvo individual |

`vw_registro_pendencia` **não** é “falta de chamada”: exige aula passada, roster, **sem** `anotacoes_fabio` no alvo, e exclui falta. Gêmeos entram via âncora turma + alvo individual no mesmo horário.

### Por que `emusys` + presente ainda é “Sem chamada” no professor

`fn_presenca_e_forte` (banco vivo):

```text
professor_la_teacher | fabio_audio | manual | professor_whatsapp | agenda_secretaria
```

**`emusys` e `sistema` = fracos.**

`app_minha_agenda_sessao`:
- `presenca` no JSON pode vir `presente` via `status_presenca`
- `tem_presenca_registrada` / `n_registradas` exigem fonte **forte**
- UI do professor interpreta 0 fortes → **Sem chamada**

Isso é **intencional no código atual**, mas **conflita com a regra de produto** “secretaria no Emusys deve encerrar pendência”, porque o pull **não** consegue marcar `agenda_secretaria` — só `emusys`.

### Assimetria Report × Teacher

| Origem | LA Report Chamada (`chamadaUtils`) | LA Teacher (`fn_presenca_e_forte`) |
|---|---|---|
| `emusys` + presente | **fecha** (presente) | **não fecha** chamada |
| `emusys` + ausente | indeterminado | não conta como forte |
| `agenda_secretaria` | fecha | fecha |
| `professor_la_teacher` | fecha | fecha |

### Gêmeos
- `fn_sincronizar_gemeos_presenca`: copia só origens  
  `professor_la_teacher|fabio_audio|manual|professor_whatsapp`  
  (**falta `agenda_secretaria`**)
- `app_registrar_chamada_agenda` (**secretaria no Report**): grava `agenda_secretaria`, **não** chama gêmeos (`pos_gemeos=0`)
- `fn_registrar_presencas_core` (teacher): **chama** gêmeos

Risco: secretaria marca só em uma linha do par turma/individual; o gêmeo pode ficar divergente.

---

## 5. Caso Matheus Felipe — Campo Grande, 11/08/2026

**Professor:** id `25` Matheus Felipe Lourenço  
**Unidade:** Campo Grande `2ec861f6-023f-4d7b-9927-3960ad8c2a92`

### Grade do dia (pares turma+individual em cada horário)
Slots 14h–19h todos com par turma/individual (padrão Emusys).

### Presenças atuais (pós-evolução do caso)

| Hora | Origem atual | Forte? | `emusys_presenca_bruta` | Observação |
|---|---|---|---|---|
| 14–18h | `professor_la_teacher` | sim | **null** | Professor marcou no Teacher; sync posterior **não** atualiza evidência Emusys (trava humano) |
| 19h (Davi, turma+individual) | `fabio_audio` (agora) | sim | **`presente`** | 1ª escrita foi Emusys |

### Linha do tempo 19h (Davi, aluno_id 1319)

| Evento | Timestamp (UTC) | Evidência |
|---|---|---|
| INSERT presença (turma+indiv.) | `2026-08-11 23:51:15–16` | `created_at`; bate com cron CG `sync-presenca-cg` `50 23 * * 1-5` |
| Sync Emusys | `sincronizado_emusys_em ≈ 23:51:20–21` | bruto `presente` |
| Promoção humana | `respondido_em 2026-08-12 13:16:05` | `respondido_por` → `fabio_audio` |
| Retificações | nenhuma linha | promoção in-place no core, não via `aluno_presenca_retificacoes` |

### Interpretação da origem Emusys na 19h
- **Não foi** `agenda_secretaria` (Report)
- **Foi** pull com `presenca=presente` materializado como `respondido_por='emusys'`
- **Não dá** para provar secretaria vs outro mecanismo Emusys: API não traz autor
- Default Emusys documentado para **futuro** é `ausente` no professor; um `presente` no aluno **sugere** lançamento no Emusys, mas **sem metadado isso não é prova jurídica de secretaria**

### Por que o professor viu presença `emusys` + “Sem chamada”
1. Linha existia com `status_presenca='presente'` e `respondido_por='emusys'`
2. `fn_presenca_e_forte('emusys') = false` → `n_registradas = 0` na âncora → **Sem chamada**
3. Conteúdo: âncoras turma do dia tinham `anotacoes_fabio=false` no momento auditável das âncoras; indivíduos hoje têm Fábio (provavelmente após 12/08) — pendência de **registro** ≠ pendência de **chamada**

### 14h–18h “tinha presença sem conteúdo”
- Presença: **forte** (`professor_la_teacher`) — chamada ok
- Conteúdo: `anotacoes_fabio` nas âncoras turma = false → passivo de registro/Fábio pode continuar aberto em `vw_registro_pendencia`

---

## 6. Gaps vs comportamento obrigatório de produto

| Regra de produto | Estado atual |
|---|---|
| Secretaria no Emusys → la-teacher + fecha pendência | Pull chega; **não fecha** chamada no Teacher (`emusys` fraco); **não** vira `agenda_secretaria` |
| Professor no Teacher → Emusys / secretaria no Emusys | **Só local** (Report sim, Emusys **não**) |
| Fontes não se apagam | Parcial: humano vence emusys; emusys não sobrescreve forte; **mas** promoção emusys→humano **não** append-only |
| Pendência só se NENHUMA fonte confirmou | Teacher exige forte; **presente Emusys não conta** — desalinha produto |
| Default ≠ secretaria | **Impossível** distinguir com API atual |
| Conflito + auditoria + idempotência | Upsert idempotente por `(aluno_id,aula_emusys_id)`; retificação só em caminhos admin/toggle; gêmeos incompletos |
| Gêmeos mesma sessão | Teacher sim; secretaria Report **não** chama gêmeos; fonte `agenda_secretaria` **fora** do sync de gêmeos |

---

## D. Correção mínima e segura (proposta — **não implementada**)

### D1. Modelo de proveniência
| Código | Classe | Fecha chamada? |
|---|---|---|
| `professor_la_teacher` / `professor_whatsapp` / `fabio_audio` / `manual` / `agenda_secretaria` | **forte** | sim |
| `emusys` (pull atual) | **evidência bruta** | **não** (até metadado) |
| futuro `emusys_confirmado` se API mandar autor humano | **forte** | sim |
| `sistema` | fraco | não |

Separar sempre:
- **decisão** (`status_presenca`, `respondido_por`, `respondido_em`)
- **evidência** (`emusys_presenca_bruta`, `sincronizado_emusys_em`, payload opcional)

### D2. Precedência sem sobrescrita destrutiva
1. Forte nunca é rebaixado por pull Emusys  
2. Pull **sempre** atualiza colunas de evidência, **mesmo** com humano (hoje **não** atualiza se humano já escreveu — buraco na auditoria)  
3. Conflito forte × bruto → badge (já esboçado em `temConflito`) + evento de auditoria  
4. Promoção fraco→forte: append em `aluno_presenca_eventos` (novo) ou retificação, não só UPDATE silencioso  

### D3. Bidirecional
- **Curto prazo (sem API):** aceitar que Emusys não recebe Teacher; secretaria opera no Report/Teacher  
- **Médio prazo:** outbox `presenca_outbox` + worker só quando existir endpoint; chave idempotente `(unidade_id, emusys_aula_id, aluno_emusys_id, status, event_id)`  
- **Enquanto API não existir:** declarar gap de produto e não fingir write-back  

### D4. Fechar pendência com secretaria Emusys (sem aceitar default)
Enquanto API não distingue:
- **Não** promover todo `emusys+presente` a forte (risco de default/automação)  
- Opções:
  1. **Melhor:** Emusys entrega metadado → mapear para `agenda_secretaria` / `emusys_confirmado`  
  2. **Operacional:** secretaria marca na Chamada Report (`agenda_secretaria`) — já é forte no Teacher  
  3. **Heurística frágil (evitar):** `presente` + `horario_presenca` ≠ default — **não recomendado** sem validação Emusys  

### D5. Gêmeos
- Incluir `agenda_secretaria` em `fn_sincronizar_gemeos_presenca`  
- Chamar gêmeos no fim de `app_registrar_chamada_agenda`  
- Critério de sessão: `(unidade_id, professor_id, data_hora_inicio)` + aluno no roster  

### D6. UX
- Slot: **Chamada ok** se todos os alunos têm fonte forte **ou** política futura de emusys confirmado  
- Mostrar chip de origem (`ROTULO_ORIGEM` já existe no Report)  
- Se só bruto Emusys presente: “Visto no Emusys (não confirmado)” — **não** pedir reconfirmação se já forte  
- Separar badge **Chamada** vs **Registro de aula**  

### D7. Plano de implementação (quando autorizar)

| Fase | Escopo | Testes |
|---|---|---|
| **M0** | Doc de contrato + alinhar Report/Teacher na mesma matriz de fortes; fix gêmeos+secretaria | unit SQL gêmeos; contrato `fn_presenca_e_forte` |
| **M1** | Pull sempre grava evidência bruta mesmo com humano; evento append-only | regressão P0 “humano vence” + evidência preenchida |
| **M2** | UI Teacher: estados presentes-fracos vs fortes; não “Sem chamada” ambíguo | E2E Teacher mock |
| **M3** | Pedido API Emusys (metadado + write) | contrato OpenAPI |
| **M4** | Outbox write-back se endpoint existir | idempotência / retry / DLQ |

### D8. Riscos e rollback
| Risco | Mitigação |
|---|---|
| Promover todo `emusys presente` a forte | infla “chamada feita” com default | **não fazer** sem metadado |
| Sync passar a sobrescrever evidência e “parecer” mudança de decisão | só colunas brutas; decisão imutável se forte |  
| Gêmeos duplicarem conflito | trava “só sobrescreve fraco” (já no SQL) |  
| Rollback M0–M2 | reverter migration de função/view; dados de presença preservados |  
| Rollback outbox | desligar worker; fila fica |  

### D9. E2E (somente depois do ok)
1. Secretaria Report marca presente → Teacher slot **Chamada ok**, origem Secretaria  
2. Professor marca no Teacher → Report mostra; Emusys **sem** mudança (assert até M4)  
3. Pull Emusys presente sem metadado → evidência sim, pendência Teacher **aberta** (ou estado “visto Emusys”)  
4. Par turma/individual: uma marcação forte fecha os dois  
5. Retry sync não duplica (`unique aluno_id,aula_emusys_id`)  
6. Caso clone Matheus 19h em staging (não produção)

---

## 7. Evidências objetivas (checklist)

| # | Evidência | Status |
|---|---|---|
| E1 | `upsert_presenca_emusys_bruta` só service_role; origem `emusys` | OK (def viva) |
| E2 | `fn_presenca_e_forte` sem `emusys` | OK |
| E3 | `app_minha_agenda_sessao` conta só fortes | OK |
| E4 | API Emusys sem write de presença | OK (skill v1.4) |
| E5 | Edges só GET `/aulas/` | OK (grep) |
| E6 | Gêmeos só DB; secretaria fora da lista | OK |
| E7 | Matheus 19h: created Emusys 23:51 UTC → fabio 12/08 | OK (SQL) |
| E8 | 14–18h Teacher forte, bruto null | OK (SQL) |
| E9 | Nenhuma alteração feita nesta auditoria | OK |

---

## 8. Conclusão e próximos passos

**Causa-raiz do sintoma “presente Emusys + Sem chamada”:**  
matriz de fontes fortes do la-teacher **exclui** `emusys`, enquanto o pull grava presença positiva **como** `emusys` sem metadado de confirmação administrativa.

**Causa-raiz estrutural da parceria incompleta:**  
integração é **pull-only**; **não há** caminho la-teacher→Emusys; secretaria no Emusys e professor no Teacher **não** formam um sistema de verdade única.

**Recomendação:**  
aprovar o desenho (M0–M2 internos + pedido de API Emusys) **antes** de qualquer migration.  
Posso, no próximo passo (com autorização explícita), detalhar o patch SQL mínimo de M0 (gêmeos + evidência bruta sempre + alinhamento de estados UI) **ainda sem deploy**.
