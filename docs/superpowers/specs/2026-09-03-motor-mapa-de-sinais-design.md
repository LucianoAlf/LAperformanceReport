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

## A estrutura (corrigida pelo Luciano em 03/09)

```
ALICERCE   Mapa de Sinais = MOTOR DE DADOS
           (as fontes: presença, conversas, renovação, financeiro, semáforo,
            anamnese, aviso prévio — tudo que o negócio produz)

1º ANDAR   CONTEXTO → INTERPRETAÇÃO → ORIENTAÇÃO
           sobre o ALUNO. ⚠️ O extrator de conversas é CONTEXTO — pertence a
           este andar, não é andar novo. E contexto não é só raspar: é raspar,
           interpretar e orientar — das conversas, das faltas, de todos os sinais.

2º ANDAR   PADRÕES → APRENDIZADOS → ESTRATÉGIA
           sobre a REDE. O que ela ensina e o que fazer a respeito, com
           viabilidade real.
```

⚠️ **Erro meu corrigido:** eu havia chamado o extrator de conversas de "próximo
andar". Ele é fonte de contexto do 1º andar — que está INCOMPLETO sem ele.

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

## ✅ SEGUNDO ANDAR ENTREGUE (03/09/2026) — padrão → aprendizado → estratégia

O 1º andar responde sobre **o aluno**; o 2º sobre **a rede**. Ambos no ar.

### Padrões medidos (nenhum chutado)

| Cód | Aprendizado | Números | Confiança |
|---|---|---|---|
| **P1** | **Evasão em câmera lenta** — o sinal não é sentença, é JANELA | 440 acenderam, 89 saíram (20%); **mediana de 48 dias** entre acender e sair; 80% ficam | alta |
| **P2** | Banda é âncora | 35 vs 15 meses de casa; saída 6% vs 16,7% (2,8× menos) | média |
| **P3** | O olhar do professor antecipa | vermelho 25% × verde 1,3% = **~19×** | baixa (n=8) |
| **P4** | Quem toca em casa não vai embora | **0 de 73** que praticam saíram; 3 de 26 que não praticam | baixa |
| **P5** | O motivo já estava escrito | 11 dias entre a declaração no WhatsApp e o lançamento | baixa (n=1) |

⚠️ **A confiança é declarada e vem do tamanho da amostra.** P3 e P4 apontam
direção forte mas com n pequeno — servem para priorizar conversa, não para
cravar risco. É a regra de ouro aplicada: o número exato virá com o desfecho.

### Estratégias com VIABILIDADE (a pergunta "tenho vaga pra todos?")

7 estratégias catalogadas (E1 ligação de resgate, E2 convite para banda,
E3 conversa do professor, E4 missão de prática, E5 renovação ajustada,
E6 leitura da conversa, E7 reposição de verdade), cada uma com responsável,
custo e **viabilidade**.

🔴 **Achado operacional que a pergunta do Luciano revelou:**
`cursos.capacidade_maxima` é **NULL em todos os projetos de banda**. A E2 tem
**97 candidatos** e capacidade desconhecida (hoje: Recreio 52, CG 43, Barra 13
alunos em projetos). Por isso ela nasce com `viabilidade='desconhecida'` e um
alerta operacional que viaja junto com a recomendação: *antes de virar campanha,
alguém precisa informar quantas vagas existem*. **Estratégia sem capacidade é
desejo, não plano** — e agora o sistema diz isso em voz alta em vez de mandar a
equipe prometer o que não pode cumprir.

### `radar_ficha_v1(unidade, severidade_min, limite)` — a leitura canônica

Junta os dois andares por entidade e devolve, num JSON só: os sinais (com
contexto/interpretação/orientação), os **padrões** que os sustentam (com a
janela de ação) e as **estratégias** aplicáveis com viabilidade. Fonte única
para Sol, Lia, painel e TOM. É RPC porque a view do radar já estoura o timeout
de 8s e porque a leitura precisa de parâmetro.

**Exemplo real de saída (Nathan William, CG):** contexto *"0 de 3 aulas em 60
dias"* → orientação *"ligar antes de qualquer cobrança"* → aprendizado *"20%
saem, mediana de 48 dias — você tem ~7 semanas"* → estratégias *E1 ligação
(disponível), E2 banda (⚠️ capacidade não cadastrada), E5 renovação ajustada,
E7 reposição*.

⚠️ Dois bugs achados no primeiro teste e corrigidos: famílias colapsavam num
item único (entidade_id é NULL para família → chave passou a usar telefone8) e
`min(uuid)` não existe no Postgres.

## 🔴 R13 — aviso prévio (furo achado pelo Luciano, 03/09)

**O motor estava errando dos dois lados:**
1. Mandava *"ligar para entender a ausência"* para **5 alunos que já estavam em
   aviso prévio** — quem já avisou que sai não pode receber cobrança de falta.
   Orientação errada queima a confiança da equipe no primeiro dia.
2. Estava **cego para 35 dos 40** em aviso prévio: a janela mais curta (mês
   vigente + seguinte) e mais valiosa não gerava sinal nenhum.

**P6 medido:** de 55 avisos prévios, **49 confirmaram a saída e só 3 reverteram
(5%)**. A oportunidade que o Luciano descreveu — *"aviso prévio é justamente uma
oportunidade de reverter, a família ainda está aqui"* — está sendo desperdiçada
quase inteira, porque ninguém tenta de forma sistemática.

**Corrigido:** R13 (sinal crítico com orientação de REVERSÃO, não de cobrança),
E8 (estratégia de reversão com janela dura), e **supressão**: os demais sinais
do aluno em aviso prévio viram observacionais e ganham a nota explicando por
quê. Primeira execução: **40 detectados, 5 suprimidos**.

**Lição de método:** um sinal certo com a orientação errada é pior que não ter
sinal. Antes de qualquer entrega à equipe, todo sinal precisa passar pela
pergunta *"esta pessoa já não está em outra situação que muda a conversa?"*.

## ✅ CAMADA DE ENTREGA (03/09) — a saída da inércia

**Divisão por agente (definida pelo Luciano):**

| Agente | Camada | Fala com | Leva |
|---|---|---|---|
| **Sol** | operacional | secretarias / ADM | cliente sem resposta, doença avisada, reposição pendente, promessa não cumprida — o dia a dia |
| **Lia** | estratégica | guardiãs (Fabi, Jessy) | risco, renovação, família, aviso prévio — o que exige decisão |
| **Mila** | comercial | consultoras | lead esperando (depende do extrator) |

`radar_destinatarios` (quem recebe o quê, canal DM ou grupo, teto por turno) +
`radar_entregas` (log com idempotência por destinatário+sinal+turno) +
`radar_pauta_v1(agente)` que monta a mensagem pronta no tom de cada camada.

⚠️ **Nasce tudo `ativo=false`** — nenhum alerta sai sem o Luciano aprovar o texto.

### 🔴 O erro que o primeiro teste pegou

A pauta saiu com **142 casos numa mensagem só** para a Fabi. Isso não é pauta,
é despejo — e é exatamente o ruído que mata a confiança no primeiro dia (o mesmo
erro que deixou o Painel Farmer vazio). Corrigido: **teto de 8 por turno**,
prioridade por severidade → **urgência real em dias** → mais antigo, e rodapé
dizendo *"mais 134 na fila"*. **Nunca truncar em silêncio.**

### P7 — O benchmark da Barra (aprender com quem acerta)

Churn de 3 meses: **Barra 7,1% · Recreio 14,2% · CG 18,0%**. O Arthur, sozinho,
perde metade do Recreio. E o atendimento explica parte: ele fez **2 promessas de
retorno em 30 dias e cumpriu as 2**; a Vitoria fez 38 e deixou 8 sem retorno.
**Hipótese: resolver no primeiro contato vale mais que prometer voltar depois** —
e "resposta seca" pode ser eficiência, não frieza. Virou a estratégia E9 (levar
a prática ao Recreio e CG com os números na mesa).

Isso responde ao pedido do Luciano: o 2º andar também aprende com o ACERTO, não
só com o erro.

## 🔴 O motor roda POR CIMA das regras de negócio (correção de raiz, 03/09)

Exigência do Luciano: *"esse motor tem que rodar por cima das regras de negócio,
senão a gente comete erros graves e tira a confiança das informações"*. Ele
estava certo — e eu já tinha cometido o erro.

**O que eu errei:** publiquei churn com **numerador filtrado** (saídas canônicas,
sem banda/bolsista) e **denominador não filtrado** (1.162 ativos). É o pecado que
o próprio CLAUDE.md documenta. E o motor herdou o defeito: **24 sinais indevidos**
de GarageBand, Power Kids, Minha Banda Para Sempre, bolsistas e de um **professor
matriculado** (Willer Arruda).

**Churn correto** (denominador = pagantes canônicos):

| Unidade | Pagantes | Saídas 3m | Churn 3m | Mensal |
|---|---|---|---|---|
| Barra | 264 | 20 | **7,6%** | 2,53% |
| Recreio | 350 | 59 | **16,9%** | 5,62% |
| Campo Grande | 393 | 84 | **21,4%** | 7,12% |

A conclusão do benchmark não muda — a magnitude sim: **CG perde quase 3× a
Barra**, não 2,5×.

**A correção, na raiz:** `radar_aluno_elegivel_v1()` — predicado **único**,
delegando ao canônico `movimentacao_conta_nos_kpis_v1` (sem reimplementar a
regra) — mais um **trigger** que descarta no INSERT qualquer sinal de aluno
inelegível. Assim **regra nova nasce protegida** sem depender de alguém lembrar.
Os 24 sinais viraram `improcedente`/`falso_positivo` **com nota** (não apagados:
fica o rastro). Prova após redetectar: **vazamento = 0**.

⚠️ **Lição:** guarda em cada consumidor é contenção; guarda no ponto de entrada
é raiz. Foi a mesma lição do `sol_nome_mesma_pessoa_v1` no caixa.

## 3º ANDAR — Ações pró-ativas e execução idempotente (plano operacional)

Conceito trazido pelo Luciano: na camada de execução o sistema deixa de ser
reflexivo e passa a **disparar efeitos reais**. O risco clássico é o disparo
repetido (cron rodando 2x, retentativa de rede, reavaliação da mesma condição).
A **idempotência é a trava arquitetural** desse andar.

### O plano: quando, onde, para quem

| Horário (BRT) | Job | Agente | Canal | Conteúdo | Idempotência |
|---|---|---|---|---|---|
| **06:00** | `radar-detectar-sinais-diario` | — | — | detector SQL + aviso prévio | `chave_dedup` única por (regra, entidade, janela) |
| **07:00** | *(F4)* extrator de conversas | — | — | contexto do WhatsApp | mesma chave + hash da mensagem |
| **09:00** | `radar-pauta-lia-manha` | **Lia** | DM | até 8 casos estratégicos p/ Fabi e Jessy | `radar_entregas.chave_idem` = destinatário+sinal+turno |
| **09:30** | *(existente)* presença pendente | **Sol** | grupo | chamada não fechada de ontem | fila `fila_relatorios_sol_hermes` |
| **11:00** | `radar-pauta-sol-operacional` | **Sol** | grupo | cliente sem resposta, doença, reposição | mesma chave, turno "manhã" |
| **16:00** | `radar-pauta-lia-tarde` | **Lia** | DM | fila que sobrou + novos críticos | turno "tarde" |
| **17:00** | `radar-pauta-mila` | **Mila** | DM | lead esperando resposta | turno "tarde" |
| **1º do mês** | `radar-fechamento-mensal` | **Lia** | DM | o que precedeu as saídas do mês | 1x por competência |

**Três camadas de idempotência (defesa em profundidade):**
1. **Detecção** — `radar_sinais.chave_dedup` UNIQUE: o mesmo sinal não nasce
   duas vezes na mesma janela. Provado: 2ª execução do detector = 0 inserções.
2. **Entrega** — `radar_entregas.chave_idem` = `destinatário|sinal|turno`:
   ninguém é cobrado do mesmo caso duas vezes no mesmo turno.
3. **Ação** — quando virar tarefa no TOM, `radar_sinais.tarefa_id` guarda o id:
   sinal com tarefa aberta não gera outra.

⚠️ Isso importa mais aqui do que em outros projetos: **1 disparo de cron vira
2-4 execuções** neste ambiente (documentado no CLAUDE.md). Sem as três camadas,
a Fabi receberia a mesma lista 3x às 9h.

### Rollout — nada sai de uma vez

**Fase 0 (agora, dias 1-3):** tudo `ativo=false`. O detector roda, os sinais
acumulam, e eu leio a pauta que SERIA enviada. Mede volume real e ruído sem
tocar em ninguém.
**Fase 1 (dia 4):** liga só a **Lia para a Fabi**, 1x/dia às 9h, teto 5.
Observa 3 dias: o que ela trata, o que dispensa.
**Fase 2:** entra a Jessy, e a Lia passa a 2x/dia.
**Fase 3:** entra a **Sol operacional** nos grupos — só depois que a taxa de
improcedência da Lia estiver medida.
**Fase 4:** Mila comercial e tarefa automática no TOM.

⚠️ A Fase 0 é o que o Luciano pediu: *"não pode sair soltando de uma vez"*.

## 🔴 Os crons da Lia que falhavam há dias (03/09)

Diagnóstico dos erros que chegavam no Telegram e ninguém lia:

| Cron | Erro | Causa real | Status |
|---|---|---|---|
| `checkin-15-dias-diario` | `Permission denied` no `.tmp` | diretório de output pertencia ao **root** (criado em 26/06 rodando como root) | ✅ `chown lia:lia` |
| `health-score-risco-diario` | idem | idem | ✅ corrigido |
| `alerta-falta-consecutiva-diario` | `permission denied for table aluno_presenca` | a role `lia_acesso_restrito` **nunca recebeu grant de presença** — Sol, Mila e Fábio tinham, a Lia não | ✅ grant na **view canônica** + tabela |
| `aniversario-matricula-diario` | — | funcionando (Fase 0) | ok |
| `checkin-7-dias-diario` | — | funcionando (Fase 0) | ok |

⚠️ **Dei acesso à `vw_presenca_slot_canonica_v1`, não só à tabela crua:** o
Emusys emite cada aula 2x (turma + individual) e 85-91% da grade é duplicada —
a Lia contando falta na tabela crua alertaria o dobro. Ruído com cara de dado.

⚠️ **Lição de operação:** os 5 crons da Lia estão em **Fase 0 desde junho** e 3
falhavam em silêncio há meses. Alerta de erro que chega em canal que ninguém lê
é o mesmo que não existir — vale para a Lia e vale para o mapa de sinais.

## 🔴🔴 Churn: errei DUAS vezes por não ler a fonte canônica (03/09)

O Luciano corrigiu duas vezes seguidas, e a segunda lição é maior que a primeira.

**Erro 1** — numerador filtrado (saídas canônicas) sobre denominador não
filtrado (1.162 ativos com bolsista e banda).
**Erro 2** — corrigi o filtro mas mantive a conta errada: **somei 3 meses de
saídas sobre a base de UM mês**. Isso infla a taxa em ~3×. Churn é **taxa
mensal**: evasões do mês sobre a base pagante **daquele mês**; para comparar
períodos, tira-se a **média dos meses**.

**E a raiz dos dois erros é a mesma: eu inventei a conta em vez de ler a fonte
que já existia.** `dados_mensais` já tem `churn_rate`, `evasoes` e
`alunos_pagantes` por unidade e por competência — é a fonte canônica da casa,
e o CLAUDE.md até define a fórmula (`churn = evasoes / alunos_pagantes`).

### Números corretos (fonte canônica, jun-ago/2026)

| Unidade | jun | jul | ago | **média mensal** |
|---|---|---|---|---|
| **Barra** | 1,81% | 4,62% | 2,32% | **2,92%** |
| Campo Grande | 5,32% | 4,43% | 8,14% | **5,96%** |
| Recreio | 5,26% | 2,14% | **11,01%** | **6,14%** |

**A conclusão do benchmark sobrevive** — a Barra perde ~metade das outras duas.
Mas o dado mês a mês conta uma história melhor: **o Recreio varia 5× entre meses
consecutivos** (2,14% em julho → 11,01% em agosto), enquanto a Barra fica entre
1,81% e 4,62%. **O Recreio não tem um problema constante: tem meses de colapso.**
Volatilidade é sinal em si — e é exatamente o que o mapa precisa antecipar. E
agosto foi ruim para Recreio e CG, mas a Barra até melhorou.

⚠️ **Regra que passa a valer no motor: métrica de negócio NUNCA é recalculada à
mão.** Antes de medir qualquer indicador, procurar em `dados_mensais`, nas RPCs
canônicas e no `docs/METRICAS.md`. Recalcular é como reimplementar regra em dois
lugares — foi a causa-raiz das duplicatas de renovação, e agora quase virou
número errado num painel de retenção.

## ✅ FASE 0 CONCLUÍDA — o retrato do que o motor produz

129 sinais abertos, com tudo desligado:

| Regra | Sinais | Críticos | Leitura |
|---|---|---|---|
| R1 frequência despencando | 66 | 7 | volume alto — **fica fora do piloto** |
| R13 aviso prévio | 20 | 20 | janela de reversão, o mais urgente |
| R3 renovação em risco | 15 | 4 | prazo duro |
| R6 presente mas em risco | 15 | 0 | observar |
| R12 semáforo não-verde | 7 | 0 | coorte |
| R5 família em risco | 6 | 6 | crítico por natureza |
| **R2, R7, R8, R9, R10** | **0** | 0 | **dependem do extrator de conversas** |
| R4, R11 | 0 | 0 | revisar regra (deveriam ter casos) |

⚠️ **Cinco regras em zero provam o que já sabíamos: o 1º andar está incompleto
sem o extrator de conversas.** Cancelamento declarado, promessa não cumprida,
cliente no vácuo, doença e reposição — nada disso existe no banco, só no chat.

## ✅ FASE 1 PRONTA (aguardando OK) — e o canal mudou pelo que a investigação achou

**Três descobertas mudaram o plano:**
1. **A Lia nunca enviou nada** — `daLia=0` em todos os grupos; a bridge roda em
   `--mode self-chat`. Ela só escuta. Mexer nisso agora é risco sem ganho.
2. **O grupo "Sucesso do aluno" está vivo** (Fabi 88 msgs/90d · Jessica 93 ·
   Anne 62 · Luciano 94) — e o Luciano acompanha o piloto em tempo real ali.
3. **O TOM já entrega dado nesse grupo**, com formato consolidado. Chegar em
   formato diferente do que elas já leem é atrito desnecessário.

→ **Fase 1 entrega NO GRUPO, no tom que elas conhecem.** DM fica para a Fase 3
(alerta individual de promessa não cumprida ao atendente).

**Recorte anti-ruído:** só **crítico**, só **3 regras** (aviso prévio, renovação,
família), **teto 5**, **1×/dia às 9h**. As 66 de frequência ficam de fora da
estreia — viraria enxurrada e queimaria a confiança.

**A mensagem real que sai** (gerada por `radar_mensagem_guardias_v1`):

> **🎯 Mapa de Sinais — 03/09**
> *Os casos mais urgentes de hoje, em ordem de prazo:*
>
> • 📄 **Theo Modesti (Recreio)** — renova em 1 dia. Frequência 33%.
>   ➜ NÃO enviar proposta padrão com reajuste. Ligar antes.
>
> • 👨‍👩‍👧 **Flor, Marcela e Mel Gianni (Barra)** — 3 alunos da mesma família em risco.
>   ➜ Tratar como UMA conversa de família.
>
> *Há mais 25 casos críticos na fila — chegam amanhã.*
> *Me diga o que não fizer sentido: o que vocês dispensarem ajusta o sistema.*

⚠️ O rodapé é deliberado: **pede o feedback que alimenta a taxa de
improcedência** — a triagem delas é o que calibra as regras.
