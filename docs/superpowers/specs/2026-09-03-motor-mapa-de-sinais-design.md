# Motor do Mapa de Sinais — design de implementação

> **Escopo:** o MOTOR. Como o sinal é detectado, gravado, cruzado e entregue.
> Contexto, medições e regras-semente estão em
> [`docs/specs/2026-09-03-mapa-de-sinais-do-aluno-design.md`](../../specs/2026-09-03-mapa-de-sinais-do-aluno-design.md)
> (documento vivo da frente). Esta spec é o **plano de construção**.
>
> **Ordem inegociável:** motor primeiro, entrega depois. O TOM é a ÚLTIMA
> camada — hoje o piloto das 16 tarefas foi criado à mão justamente porque o
> motor não existe; ele não é o produto, é a prova de que a última milha
> funciona.

## Problema

Os sinais existem, vivos, em 4 bancos e 6 fontes — e **nenhum se encontra com o
outro**. Ninguém consegue perguntar "quem está em risco e por quê" sem um
humano rodar query. Medido: o motivo de uma saída estava escrito no WhatsApp 11
dias antes do lançamento (caso Théo) e morreu; 77% de quem saiu em CG/agosto
estava com frequência <50% e visível; 260 clientes ficaram sem resposta em 30
dias. **Falta o órgão que lê tudo isso todo dia e transforma em fato
registrado, com evidência e desfecho.**

## Objetivo

Um motor que, diariamente e sem humano no meio:
1. **detecta** sinais das fontes canônicas (SQL) e das conversas (LLM);
2. **grava** cada sinal como evento com evidência, severidade e rastro;
3. **cruza** sinais com aluno/risco/renovação/pagamento numa leitura única;
4. **entrega** alerta rápido (dia a dia) e dossiê (renovação) às guardiãs;
5. **aprende**: todo sinal tem desfecho, e o desfecho promove ou rebaixa regra.

## Não-objetivos (decisões conscientes)

- **Não** criar tela nova nesta fase (F3 estende a de Sucesso do Aluno).
- **Não** alertar gerente/grupo direto — tudo passa pelas guardiãs (decisão do
  Luciano). O TOM só entra na F5.
- **Não** pontuar sinal de cobertura parcial fora da coorte LA Teacher.
- **Não** re-treinar modelo de risco agora (F6, quando houver desfecho).
- **Não** mexer no schema do TOM por fora — migration é no repo dele.

## Arquitetura em uma frase

`fontes → detectores (SQL diário + LLM diário) → sinais_aluno (LA Report) →
vw_mapa_sinais_aluno → entregas (Sol/DM, dossiê, painel) → desfecho → regras`

⚠️ **`sinais_aluno` mora no LA Report** (junto de aluno, risco, jornada,
presença — onde o cruzamento acontece). O espelho de conversas fica onde está
(banco da Sol); quem atravessa é a edge do extrator.

## Modelo de dados

### `sinais_aluno` (tabela-fato, append-only)

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `aluno_id` | int fk alunos | **nullable** — sinal de conversa sem match fica com `pessoa_telefone` |
| `pessoa_telefone` | text | só dígitos, últimos 8 para casar |
| `unidade_id` | uuid | sempre preenchido (rota do alerta) |
| `tipo_sinal` | text | ver catálogo abaixo |
| `severidade` | text | `info` \| `atencao` \| `alto` \| `critico` |
| `origem` | text | `sql_presenca` \| `sql_renovacao` \| `sql_financeiro` \| `llm_conversa` \| `semaforo` \| `fabio` |
| `canonico` | bool | **false = observacional** (não alerta, não pontua) |
| `evidencia` | text | a frase real / o número que originou |
| `evidencia_ref` | jsonb | `{conversa_id, mensagem_id, data_aula, fatura_id...}` |
| `detectado_em` | timestamptz | |
| `competencia` | date | mês de referência |
| `chave_dedup` | text | **unique** — `tipo\|aluno\|janela` |
| `status` | text | `aberto` \| `triado` \| `em_acao` \| `resolvido` \| `improcedente` \| `expirado` |
| `triado_por` / `triado_em` | | guardiã |
| `tarefa_externa_id` | uuid | id no TOM (F5) |
| `desfecho` | text | `reteve` \| `saiu` \| `sem_acao` \| `falso_positivo` |
| `desfecho_em` | timestamptz | |
| `regra_versao` | text | qual versão da regra gerou (auditoria do aprendizado) |

Índices: `(aluno_id, status)`, `(unidade_id, detectado_em)`, `(tipo_sinal,
detectado_em)`, unique em `chave_dedup`.

### `sinais_regras` (o motor é configurável, não hardcoded)

`codigo` (R1..R12), `descricao`, `origem`, `severidade_padrao`, `canonico`,
`ativo`, `params jsonb` (limiares), `lastro` (o dado que a fundamentou),
`criada_em`, `promovida_em`, `taxa_improcedencia` (calculada), `versao`.

**Semente = as 12 regras do documento vivo.** Alterar limiar é UPDATE, não
deploy.

### `sinais_pessoa_match` (cache do casamento telefone→aluno)

`telefone8` (pk), `aluno_id`, `pessoa_nome`, `confianca`, `metodo`
(`telefone_aluno` \| `telefone_responsavel` \| `nome_fuzzy`), `atualizado_em`.
⚠️ O match por nome usa **`sol_nome_mesma_pessoa_v1`** (guarda de primeiro
nome) — nunca `word_similarity` cru.

## Catálogo de sinais (v0)

**Determinísticos (SQL, canônicos):**
`freq_baixa_30d`, `freq_zero_30d`, `ausencia_prolongada` (dias desde última
aula), `renovacao_proxima_com_risco`, `inadimplente_com_risco`,
`familia_multipla_em_risco`, `quer_banda_sem_banda`, `risco_ia_alto`.

**Conversa (LLM, canônicos após validação):**
`cancelamento_declarado`, `promessa_sem_retorno`, `cliente_sem_resposta`,
`insatisfacao_expressa`, `doenca_avisada`, `viagem_avisada`,
`reposicao_pedida`, `reposicao_perdida`, `responsavel_desengajado`.

**Coorte LA Teacher (canônicos só para os alunos dos professores da coorte):**
`semaforo_amarelo`, `semaforo_vermelho`, `nao_pratica_em_casa`,
`jornada_estagnada`.

## Os detectores

### D1 — Detector SQL (RPC `detectar_sinais_sql_v1(p_competencia date)`)

Uma RPC `SECURITY DEFINER` no LA Report que roda os sinais determinísticos
lendo as fontes canônicas (`vw_presenca_slot_canonica_v1`,
`vw_contratos_vencendo`, `vw_risco_evasao_atual`, `emusys_faturas`,
`aluno_feedback_professor`, `anamneses`) e faz **upsert por `chave_dedup`**.
Idempotente: rodar 10× no dia produz o mesmo resultado.
Cron: `pg_cron` diário 06:00 BRT (09:00 UTC), SQL direto — **sem edge**
(cron com edge já morreu em 401 silencioso neste projeto).

### D2 — Extrator LLM de conversas (edge `extrair-sinais-conversa`)

- Lê o espelho `sol_chatwoot_mensagens` **via PostgREST do projeto da Sol**
  (token em `integracao_tokens`, mesmo padrão da `base-conhecimento`).
- Janela: conversas com mensagem nas últimas 24h (+ modo `backfill` com
  intervalo).
- **Filtra broadcast por hash do texto** (R8) antes de mandar ao LLM.
- Agrupa por conversa, monta transcrição, envia ao LLM com **saída
  estruturada** (`{sinais:[{tipo, severidade, evidencia, mensagem_id}]}`) —
  padrão do `classificar-desinteresse`.
- Resolve `aluno_id` pelo `sinais_pessoa_match`; sem match, grava com telefone.
- Grava via RPC `registrar_sinais_conversa_v1(jsonb)` (validação no banco: tipo
  no catálogo, evidência obrigatória, dedup).
- ⚠️ **O LLM nunca inventa número nem decide severidade final** — ele extrai
  fato + evidência; a severidade vem de `sinais_regras`.
- Cron: diário 07:00 BRT. Guarda de concorrência atômica (`23505`), porque
  1 disparo de cron vira 2-4 execuções neste projeto.

### D3 — Detector de atendimento (SQL sobre o espelho, dentro da D2)

`cliente_sem_resposta` e `promessa_sem_retorno` precisam do espelho: rodam na
mesma edge, mas a contagem é SQL (não LLM) exceto a detecção semântica da
promessa (R7).

## A leitura canônica

`vw_mapa_sinais_aluno` — uma linha por aluno ativo com: sinais abertos
(array), maior severidade, contadores por tipo, risco IA, frequência 30/60d,
dias desde última aula, renovação (dias), inadimplência, semáforo/prática (se
coorte), banda, tempo de casa, e `precisa_atencao` (bool derivado das regras
canônicas ativas).

**É a fonte única** de painel, dossiê e alertas. Ninguém reimplementa o
cruzamento (a lição das duplicatas de renovação).

## As entregas

### E1 — Alerta do dia a dia (Sol → guardiãs)
Cron 09:00 e 16:00 BRT: sinais `alto`/`critico` abertos desde o último envio →
mensagem para Fabi (Barra+CG) e Jessy (Recreio), agrupada por unidade, com
nome, sinal, evidência e link. Reusa `fila_relatorios_sol_hermes`.

### E2 — Dossiê de renovação
Cron diário: contratos vencendo em 30/15/7 dias → dossiê por aluno com estado
e abordagem recomendada. Entra na mesma mensagem das guardiãs.

### E3 — DM de promessa (Sol → atendente)
Sinal `promessa_sem_retorno` com >4h → DM privada ao atendente. **Só depois de
E1/E2 validados** (é o único que fala com quem não é guardiã).

### E4 — Fechamento mensal
RPC `analise_mensal_sinais_v1(competencia)`: para cada saída do mês, quais
sinais precederam e com quanta antecedência. Responde "por que agosto teve 41
em CG".

## Ordem de construção (fases pequenas, cada uma com PR e teste)

| Fase | Entrega | Aceite |
|---|---|---|
| **M1** | `sinais_aluno` + `sinais_regras` (12 sementes) + `sinais_pessoa_match` + RPC de match | match ≥90% dos telefones do espelho resolvidos; RLS e grants conferidos (`proacl` sem `anon`) |
| **M2** | D1 (detector SQL) + cron | roda idempotente; **backfill de agosto reproduz a necropsia** (30 de 39 em CG com freq<50%) |
| **M3** | `vw_mapa_sinais_aluno` | os 16 alunos do piloto aparecem com os mesmos sinais que apurei à mão |
| **M4** | D2 (extrator LLM) + backfill 30d | encontra o caso Théo (cancelamento declarado 15/08) e ≥80% dos 42 avisos de doença |
| **M5** | E1 + E2 (guardiãs) | Fabi e Jessy recebem e confirmam que a lista faz sentido; taxa de improcedência medida |
| **M6** | E4 + desfecho | fechamento de setembro sai automático |
| **M7** | TOM (tarefa automática) + E3 | `source='mapa_sinais'` na check do TOM (migration no repo dele) |

## Riscos

1. **Ruído mata a confiança** — mitigação: só canônico alerta; guardiãs são o
   filtro; `taxa_improcedencia` rebaixa regra automaticamente.
2. **Match errado de pessoa** — mitigação: guarda de primeiro nome; sem match
   confiável o sinal fica sem `aluno_id` (aparece agregado, não vira tarefa).
3. **Custo/latência de LLM** — mitigação: filtro de broadcast + só conversas
   com movimento + saída estruturada curta.
4. **Cron duplicado** (2-4 execuções) — mitigação: dedup por `chave_dedup` e
   tomada de vez atômica.
5. **Espelho incompleto** (só 3 secretarias, só texto) — declarado; Mila/ADM e
   áudio entram depois, sem mudar o modelo.

## Critérios de aceite do motor (o que faz dele "pronto")

1. Rodando sozinho todo dia, sem humano.
2. Backfill de agosto **reproduz** os achados desta investigação (auditável).
3. Todo sinal tem evidência clicável até a mensagem/aula/fatura de origem.
4. Guardiãs recebem lista útil 2×/dia e conseguem marcar improcedente.
5. Desfecho fecha o ciclo e alimenta `taxa_improcedencia` por regra.
6. Zero número no alerta que não venha de fonte canônica.
