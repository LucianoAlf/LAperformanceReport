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

## 🔴 AUDITORIA DO BANCO (03/09) — GRANDE PARTE DISSO JÁ EXISTE

O Luciano mandou auditar antes de construir (regra DRY da casa). **Achado: ~60%
do motor já foi construído — e está abandonado.** O plano muda de "construir"
para "ligar, completar e alimentar".

### O que existe e está VIVO

| Artefato | Estado | O que já faz |
|---|---|---|
| **`vw_radar_aluno_sinais_canonica_v2`** (`radar-aluno-sinais-v2.1`) | **305 alunos, viva** | É o detector SQL que eu ia escrever — e melhor: coorte de professores com login, janela das últimas 10 aulas, absenteísmo %, **faltas consecutivas**, semáforo + prática + evolução + ânimo + observação, **avisou_que_sai** (aviso prévio), e **guarda de frescor** (`estado_publicacao`: só publica número se a presença está sincronizada) — a proteção anti-ruído que eu ia "inventar". Tem `regra_versao` e RLS correta. |
| **`vw_farmer_renovacoes_proximas`** | 56 linhas | Renovação com dias para vencer + **urgência** + whatsapp + professor. Eu refiz isso na mão ontem. |
| `vw_farmer_inadimplentes` / `_novos_matriculados` / `_aniversariantes_hoje` / `_resumo_alertas` | 17 / 21 / vivo / 3 | Alertas por unidade já agregados |
| **`farmer_tarefas`** | tabela **VAZIA** | Colunas: `colaborador_id, unidade_id, descricao, data_prazo, prioridade, aluno_id, contexto, sla_em, **desfecho**, **origem_alerta**, concluida...` — **é exatamente a camada de ação que eu especifiquei**, com desfecho e origem do alerta |
| **Painel Farmer** (`src/components/App/Administrativo/PainelFarmer/`) | **roteado e no ar** | Dashboard + `useAlertas` + `useTarefas` (CRUD em farmer_tarefas) + `useChecklists` |
| `app_coordenacao_radar`, `fn_radar_nota(sinais, config)`, `app_radar_config` | funções vivas | Radar com **pesos configuráveis** e nota |
| `calcular_health_score_aluno` + `_v2_sombra` + `_batch` | funções vivas | Score do aluno |
| `vw_alertas_inteligentes` | 17 linhas | Alertas de gestão |
| `lia_alertas_privados` + edge + claim atômico | infra viva, **2 linhas** | Canal de alerta privado |

### Por que não funciona hoje (o gap REAL)

1. **`farmer_tarefas` está vazia** — o painel existe, ninguém usa. Alerta que
   depende de alguém ABRIR a tela não vira ação. Falta **entrega proativa**.
2. **O radar não está no front do LA Report** (só no `database.types.ts`) — é
   motor sem tela e sem consumidor.
3. **Nada persiste como evento**: o radar é VIEW = foto de agora. Sem histórico,
   sem desfecho, sem acumular aprendizado. É a peça que falta de verdade.
4. **Zero sinal de CONVERSA** — nenhum dos artefatos lê WhatsApp. Cancelamento
   declarado, promessa não cumprida, vácuo, doença e reposição continuam
   invisíveis (o caso Théo passaria batido por TODO o sistema atual).
5. **`config_health_score_aluno` e `alunos_health_score_historico` vazias** — o
   score na tela sai sem motor (Health 0 + badge "Saudável").
6. **A view canônica do radar estoura o `statement_timeout` de 8s** — não
   aguenta ser consumida por tela nem por cron sem otimização.

### O plano corrigido (reusar > construir)

- **D1 (detector SQL) ≈ PRONTO**: usar `vw_radar_aluno_sinais_canonica_v2` como
  fonte, **não** escrever detector novo. Falta: performance + estender para
  renovação/inadimplência/risco (que já estão nas views farmer).
- **Camada de ação ≈ PRONTA**: `farmer_tarefas` já tem `desfecho` e
  `origem_alerta`. **Não criar tabela de tarefa.** O TOM continua sendo M7 para
  a cobrança, mas o registro do trabalho das guardiãs é aqui.
- **Tela ≈ PRONTA**: estender o Painel Farmer, não criar outro.
- **O que é REALMENTE novo:** (a) `sinais` como **evento persistido** com
  desfecho — o "filme" que o radar (foto) não tem; (b) o **extrator LLM de
  conversas**; (c) a **entrega proativa** (Sol/Lia empurrando, em vez de tela
  passiva); (d) o **loop de aprendizado** ligando desfecho → regra.

⚠️ **Lição registrada:** eu ia reescrever detector, tabela de tarefa e view de
renovação que já existiam. A auditoria do Luciano economizou as três.

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

### Decisão de identidade (corrigida em 03/09 após questionamento do Luciano)

**A identidade canônica é sempre o ID da entidade — nunca o telefone.** O
telefone é do ADULTO, não do menor, e é ambíguo por natureza. Medido:

- **14% dos telefones apontam para 2+ alunos** (93 telefones com 2 pessoas, 21
  com 3+) — mãe com dois filhos matriculados. Telefone identifica FAMÍLIA, não
  aluno.
- No espelho de conversas, o telefone só está disponível em **18%** dos
  contatos ativos (`raw→sender→phone_number` nem sempre vem).
- **O nome do contato do Chatwoot resolve muito melhor: 67%** dos contatos
  ativos seguem o padrão que a equipe já usa — `"Adalberto RESP Lucas Cseko"`,
  `"Alberto Aluno Barra"` — ou seja, **o aluno está escrito ali**. Testado
  contra a base: **97% casam** e **91% com sobrenome confirmado** (similaridade
  média 0,92), usando `sol_nome_mesma_pessoa_v1` (guarda de primeiro nome).
- Bônus: o padrão captura FAMÍLIA explicitamente — `"Arthur, Lucas e Daniel
  Siqueira"`, `"Amanda e Miguel Holanda"` — o que alimenta a regra R5 de graça.

### Tabela `sinais` (polimórfica — sinal não é só de aluno)

A pergunta do Luciano expôs uma limitação: existe sinal de **lead** (comercial),
de **professor** (Akeem parado desde 21/08) e de **família/responsável**
(engajamento), não só de aluno. Então:

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `entidade_tipo` | text | `aluno` \| `lead` \| `professor` \| `familia` |
| `entidade_id` | bigint | **FK lógica para a tabela do tipo** — a chave é sempre o ID |
| `unidade_id` | uuid | rota do alerta |
| `tipo_sinal` | text | catálogo abaixo |
| `severidade` | text | `info` \| `atencao` \| `alto` \| `critico` |
| `origem` | text | `sql_presenca` \| `sql_renovacao` \| `sql_financeiro` \| `llm_conversa` \| `semaforo` \| `fabio` |
| `canonico` | bool | false = observacional (não alerta, não pontua) |
| `evidencia` | text | a frase real / o número |
| `evidencia_ref` | jsonb | `{conversa_id, mensagem_id, data_aula, fatura_id, contato_id...}` |
| `identificacao` | jsonb | **como chegamos na entidade** — `{metodo, confianca, nome_bruto}`; auditoria do match |
| `detectado_em` / `competencia` | | |
| `chave_dedup` | text unique | `tipo\|entidade_tipo\|entidade_id\|janela` |
| `status` | text | `aberto` \| `triado` \| `em_acao` \| `resolvido` \| `improcedente` \| `expirado` |
| `triado_por` / `triado_em` | | guardiã |
| `tarefa_externa_id` | uuid | id no TOM (M7) |
| `desfecho` / `desfecho_em` | | `reteve` \| `saiu` \| `sem_acao` \| `falso_positivo` |
| `regra_codigo` / `regra_versao` | | auditoria do aprendizado |

⚠️ **Sinal sem entidade resolvida NÃO é gravado como aluno**: vira
`entidade_tipo='familia'` com o `contato_id` do Chatwoot em `evidencia_ref`.
Melhor um sinal de família honesto que um sinal no aluno errado.

### `sinais_identidade` (resolução em CASCATA, com o ID como destino)

Cache de `contato_id` (Chatwoot) → entidade. Preenchido pela cascata, do mais
forte ao mais fraco — e **para no primeiro que resolve**:

1. **Vínculo já conhecido** (`admin_conversas.aluno_id`, `leads.chatwoot_*`) —
   confiança 1.0.
2. **Nome do contato com padrão RESP/Aluno** + `sol_nome_mesma_pessoa_v1` +
   **sobrenome confirmado** — confiança 0.9 (medido: 91%).
3. **Telefone → aluno único** (só quando o telefone aponta para 1 pessoa) —
   confiança 0.8.
4. **Telefone → 2+ pessoas** → `entidade_tipo='familia'`, com os alunos
   candidatos listados. **Nunca escolhe um.** — confiança 0.5.
5. Nada resolve → sinal fica sem entidade, agregado, fora de tarefa.

Colunas: `contato_id` pk, `entidade_tipo`, `entidade_id`, `confianca`,
`metodo`, `nome_bruto`, `candidatos jsonb`, `revisado_por` (humano pode
corrigir e a correção é definitiva), `atualizado_em`.

### `sinais_regras`

`codigo` (R1..R12), `descricao`, `origem`, `entidade_tipo`,
`severidade_padrao`, `canonico`, `ativo`, `params jsonb` (limiares), `lastro`,
`versao`, `taxa_improcedencia` (calculada do desfecho).
**Semente = as 12 regras do documento vivo.** Mudar limiar é UPDATE, não deploy.

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
| **M1** | `sinais` (polimórfica) + `sinais_regras` (12 sementes) + `sinais_identidade` + RPC da cascata | ≥90% dos contatos ativos resolvidos com sobrenome confirmado; **zero** contato ambíguo resolvido como aluno único; RLS e grants (`proacl` sem `anon`) |
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

## ✅ M1 + M2 ENTREGUES (03/09/2026) — o motor está rodando

**GO do Luciano:** *"foi eu mesmo que comecei, só que não terminei... vamos
terminar de construir, já que a fundação tá pronta, vamos construir o prédio."*

Aplicado em produção:
- **`radar_sinais`** — a memória que faltava. Evento com `contexto`,
  `interpretacao`, `orientacao`, `evidencia` (jsonb), `identificacao`,
  `chave_dedup` única, ciclo de vida (`aberto → triado → em_acao → resolvido /
  improcedente / expirado`) e **`desfecho`** (`reteve|saiu|sem_acao|
  falso_positivo`). Polimórfica: `aluno | lead | professor | familia`.
- **`radar_regras`** — 12 regras com `lastro` (a medição que fundamentou) e
  `orientacao_padrao` (o que fazer). Limiar em `params jsonb`: **mudar régua é
  UPDATE, não deploy.**
- **`radar_identidade`** — cascata de resolução (vínculo > nome RESP com
  sobrenome > telefone único > família com candidatos). Sem acesso a `anon`.
- **`radar_detectar_sinais_sql_v1(date)`** — o detector. Lê as fontes canônicas
  E **o radar do Luciano** (R12 usa `vw_radar_aluno_sinais_canonica_v2` — não
  reescrevi a regra pedagógica dele).
- **Cron `radar-detectar-sinais-diario`** — 06:00 BRT, SQL direto (sem edge, que
  já morreu em 401 silencioso neste projeto).

**Primeira execução real:** 133 sinais — R1 frequência baixa **83**, R3
renovação em risco **17**, R5 família **6**, R6 presente-mas-em-risco **18**,
R12 semáforo **9**. **Segunda execução: 0 inserções** (idempotência provada).

⚠️ Achado da primeira rodada: o motor encontrou famílias em risco que a
apuração manual não tinha visto (ex.: Luiza e Pedro Frazão de Souza) — a
regra R5 cruzando sozinha o que ninguém cruzava.
⚠️ `professores` não tem `unidade_id` (professor atende várias) — a unidade do
sinal de professor vem da **carteira** (onde ele tem mais alunos ativos).

### Próximo (M3): a RPC canônica de leitura
`radar_ficha_v1(p_unidade_id, p_severidade, p_limite)` devolvendo o cruzamento
por aluno — contexto + interpretação + orientação prontos para virar mensagem
das guardiãs e tarefa em `farmer_tarefas`.
