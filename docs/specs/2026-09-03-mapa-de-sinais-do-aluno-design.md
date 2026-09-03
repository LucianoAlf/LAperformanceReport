# Mapa de Sinais do Aluno — documento vivo de retomada

> **Status:** brainstorm consolidado + MVP definido (03/09/2026). Fonte de verdade
> desta frente. Atualizar A CADA avanço, no mesmo commit da mudança — mesmo
> padrão do checkpoint vivo da frente Professores.
>
> **Dono:** Luciano. **Contexto de origem:** conversas de 02-03/09/2026 (sessão
> Sol/atendimento → monitoramento WhatsApp → Health Score v2 → mapa de sinais).
> Memória permanente espelhada em `memory/monitoramento-atendimento-whatsapp.md`.

## 1. A visão (nas palavras do Luciano)

Construir uma **inteligência de cruzamento de sinais** para parar de "correr
atrás do rabo": hoje as informações existem **soltas** (presença, conversa,
motivo de saída, anamnese, professor, pagamento) e ninguém consegue acompanhar
— são muitos alunos. O sistema deve:

- **Cruzar** aluno que falta + comportamento do responsável na conversa +
  atendimento (promessa não cumprida, vácuo) + expectativa (anamnese) + aula
  (professor) → **antecipar** a evasão e a renovação fria.
- **Alertar** a pessoa certa na hora certa (Sol como memória externa da equipe:
  "a cliente que você ficou de dar retorno ainda aguarda").
- **Aprender**: sinal → desfecho → padrão → regra nova/peso — "aprendizados,
  memórias, regras novas". Com 1 ano de sinais acumulados, os pesos deixam de
  ser opinião.
- **Exemplo canônico (renovação):** aluno desanimado e faltando recebe a mesma
  mensagem padrão de renovação com reajuste de 10% → evade. A mensagem de
  renovação tem de ser **consequência do estado do aluno** (dossiê), não
  template.
- Dashboard bonito sem virar **alerta, estratégia e plano de ação** não vale
  nada. CG perdeu ~40 alunos/mês "de graça" — a pergunta "por quê" tem de ter
  resposta de dado.

## 2. Regra de ouro (do doc Health Score v2 do Luciano)

Os sinais **não recebem peso no chute** — o score manual antigo provou que
chute erra ("Atenção" evadia mais que "Crítico"). Quem aprende os pesos é o
modelo, com desfecho real (ficou/saiu). O painel mostra as dimensões para
guiar a conversa HUMANA. *"Os humanos cuidam de gente. O sistema aponta onde
olhar."*

Validação empírica desta regra (03/09): o atendente mais "seco" da rede
(Arthur, 51% respostas <25 chars) está na unidade com MENOS saídas (Barra).
Secura não previu evasão. Não chutar.

## 3. Os 14 sinais do Health Score v2 × inventário real (03/09/2026)

| # | Sinal | Fonte hoje | Estado | MVP? |
|---|-------|-----------|--------|------|
| 1 | Conversas ADM WhatsApp | espelho `sol_chatwoot_mensagens` (DB da Sol, 23,8k msgs, 3 secretarias) + `admin_mensagens` (UAZAPI, 1,7k) | vivo, falta extração | **SIM** |
| 2 | Semáforo do professor | `aluno_feedback_professor` (218 respostas, 185 alunos, ago+set) | vivo, **cobertura parcial** (~16% da base) | observacional* |
| 3 | NPS / pesquisas | `pesquisas_whatsapp` (161, só 1ª aula) + `pesquisa_evasao` (5) | vivo, parcial | observacional* |
| 4 | Pratica em casa | coluna `pratica_em_casa` no semáforo (não=35, às_vezes=100, sim=83) | vivo, parcial | observacional* |
| 5 | Evolução na jornada | `fabio_registros_aula.checkpoint_sugerido` + marcos | vivo, parcial | observacional* |
| 6 | Absenteísmo (crônico) | `vw_presenca_slot_canonica_v1` — **na unha desde ago/26** | **FATO** | **SIM** |
| 7 | Adimplência | `inadimplente_emusys` + `emusys_faturas` | FATO | **SIM** |
| 8 | Projetos (banda/coral) | `cursos.is_projeto_banda` via matrículas | FATO | **SIM** (sinal positivo) |
| 9 | Dias desde última aula (agudo) | presença canônica / features_churn | FATO | **SIM** |
| 10 | Anamnese × expectativa | `anamneses` (235) + `anamnese_respostas_perfil` (2.475) | vivo, parcial | observacional* |
| 11 | Ciclo contratual + lealdade | jornada / `vw_contratos_vencendo` / `vw_renovacao_ciclos` | FATO | **SIM** |
| 12 | Perfil da matrícula | tipo, bolsista, "sem parcela" | FATO | **SIM** |
| 13 | Engajamento do responsável | só existe DENTRO das conversas | **não é dado ainda** | via extração (parcial) |
| 14 | Sinal contínuo do Fábio | `fabio_registros_aula` (1.106 registros, 271 alunos, desde 13/07) | vivo, parcial | observacional* |

\* **Observacional** = aparece no dossiê/painel quando existe, mas **não pontua
nem dispara alerta** enquanto a cobertura for parcial — padrão já validado na
casa (Health Score do professor: "número de alunos aparece para o gestor, mas
nota NULL e peso zero"). Motivo (decisão do Luciano, 03/09): LA Teacher é novo,
nem todo professor lança; pegar tudo agora = falso positivo e resultado inflado.
**Incremental e certeiro.**

## 4. O que já foi MEDIDO (números de produção, 02-03/09/2026)

### Atendimento (30 dias, espelho das 3 secretarias)
- Mediana de resposta **6-9 min** (a equipe é rápida) — o problema é a CAUDA:
  **260 msgs de cliente sem NENHUMA resposta**, 320 respondidas >24h, p90 de
  23h a 1,7 dia.
- **Promessa sem retorno: ~20%** por atendente (regra v2 honesta; a v1 com
  janela de 3min dava falso positivo — detector definitivo tem de ser LLM).
- **46% das mensagens longas de agente são broadcast** (mesmo texto em 5+
  conversas) — mascara abandono; extração tem de filtrar por hash.
- "WhatsApp Device": 1.916 msgs em CG fora da ferramenta (provável Mayra/Ana).
- Sinais morrendo na conversa (30d): **42 avisos de doença** (32 conversas),
  **74 pedidos de reposição** (56), 12 viagens, 3 cancelamentos declarados.
- Reclamação explícita: **zero** — a insatisfação é silenciosa.
- Depois das 19h a espera explode (39% >1h às 19h, 73% às 20h, 100% às 21h+).

### Caso-prova retroativo (Théo Arruda, aluno 689/Recreio)
Mãe declarou **"Não continuaremos"** no WhatsApp em **15/08** → resposta: 🙏 →
`nao_renovacao` lançada só em **26/08** (11 dias depois) → pesquisa de evasão:
**zero**. O motivo estava por escrito 11 dias antes, de graça, e morreu. Depois
do cancelamento a cliente seguiu recebendo broadcast de marketing.

### O padrão-mestre: evasão em câmera lenta (MEDIDO)
Nos 60 dias antes da saída (saídas ago-set/26, regra canônica de KPI):
- Frequência de quem saiu: **40,4%**. Frequência dos ativos: **79,0%**.
- **60% de quem saiu** estava com frequência <50% — contra **7%** dos ativos.
- → frequência <50% ≈ **9× mais chance** de estar a caminho da porta. Primeira
  regra APRENDIDA do próprio dado (não chutada).

### Necropsia CG/agosto (39 alunos que saíram)
- **30 de 39 (77%)** com frequência <50% nos 60d antes; **8 com frequência 0**.
- Tempo de casa médio: **13 meses** — não eram calouros, eram veteranos
  escapando devagar. Estavam VISÍVEIS meses antes; faltava a lista.
- Motivos marcados (ago-set, 98 saídas): horário 16, mudança 13, financeiro 12,
  concluído-sem-renovar 10, falta de tempo 10, saúde 10, desistência 6,
  inadimplência 4... **84 de 98 com motivo real da equipe** — a marcação
  administrativa funciona; a pesquisa de evasão é a CONTRAPROVA (e o sistema
  deve medir quando pergunta/coleta não funciona e sugerir variante — infra de
  A/B já existe: templates + desfechos da repescagem).

### Hipótese das bandas (do Luciano) — CONFIRMADA
- Ativos com projeto de banda: **35 meses de casa** vs **15 meses** sem banda.
- Saídas jun-set: banda **8/133 (6%)** vs sem banda **174/1.039 (16,7%)** —
  ~2,8× menos. ⚠️ Correlação com viés de sobrevivência (veterano tende a entrar
  em banda); mesmo assim, "colocar aluno em risco numa banda" vira **ação de
  retenção testável** — e o desfecho dela alimenta o aprendizado. "Criar mais
  bandas" tem lastro de dado.

### A antecipação (renovações, foto de 03/09)
- **64 contratos vencem em 45 dias; 17 (27%) já com sinal aceso** (freq<50% em
  30d: 15 · risco IA ≥50%: 7 · semáforo não-verde: 2).
- Exemplos: Beatriz Barata (Barra, vence em 2 dias, freq 0%); Nathan William
  (CG, 7d, freq 0%, risco 63%, semáforo vermelho, MAS pratica em casa — vínculo
  a resgatar); Levi Barbosa (Barra, 20d, freq 0%, risco 83%); **Wanessa e
  Arthur Caporali (mãe e filho, ambos freq 0%, vencendo juntos — sinal de
  FAMÍLIA, risco de perder 2 matrículas de uma vez)**; contraponto Antonio
  Thales (CG, freq 100% e risco IA 60% — o modelo vê o que a frequência não
  mostra; peso chutado erraria).
- Hoje os 64 recebem a MESMA mensagem padrão de renovação com reajuste.

## 5. Decisões de arquitetura (brainstorm 03/09)

1. **Sinal é EVENTO; score é resumo.** Tabela `sinais_aluno`: fonte, aluno_id,
   tipo_sinal, severidade, evidência (frase real/registro), detectado_em,
   tratado_por/tratado_em, desfecho. O Health Score v2 (tela já existente em
   Sucesso do Aluno) é o agregado; o histórico de sinais é o filme que acumula
   aprendizado.
2. **Todo sinal tem DESFECHO.** Sem desfecho não há "onde estamos errando" —
   há só dashboard. Desfecho é o rótulo de treino: "alertou → ligou → ficou" vs
   "alertou → ninguém tratou → saiu".
3. **Extração agent-first** (padrão V4 da Sol): LLM interpreta conversa em
   batch diário e emite sinais estruturados; SQL conta os determinísticos
   (frequência, espera, sem-resposta, renovação chegando); tudo vira linha no
   banco; número canônico nunca vem do LLM.
4. **Sol como memória externa da equipe** (destinatários propostos, pendente OK
   formal): DM ao atendente = lembrete de promessa/vácuo; grupo da unidade = só
   urgente (cancelamento declarado, cliente >1h no vácuo em horário comercial);
   gestor = relatório semanal de padrões (coaching, NUNCA exposição no grupo).
5. **Dossiê de renovação**: todo dia 1º (e D-30/15/7 por contrato), a lista de
   quem vence com o estado de cada um e a abordagem recomendada — quem renova
   no automático, quem precisa de ligação antes de proposta, quem NÃO pode
   receber reajuste sem conversa.
6. **Comparativo mensal automático**: fechamento do mês responde "o que
   precedeu as saídas" (quantas tinham sinal X antes) — reunião de achismo vira
   query.
7. **Padrão recorrente vira regra nova** (loop de aprendizado); pesos futuros
   via re-treino do modelo de risco com features de sinal + desfecho.
8. **Cobertura parcial não pontua** (regra do incremental — §3).

## 6. MVP — escopo fechado (decisão Luciano 03/09)

**Entram (fatos de hoje):** presença/faltas canônica (sinal agudo dias-sem-aula
+ crônico freq 30/60d) · conversas das secretarias via espelho (promessa,
sem-resposta, cancelamento declarado, doença, viagem, reposição
pedida/perdida) · renovação chegando (jornada) · inadimplência · perfil da
matrícula · banda (positivo) · tempo de casa/lealdade · **motivo de saída como
DESFECHO/rótulo**.

**Ficam observacionais (aparecem, não pontuam):** semáforo, prática em casa,
Fábio, NPS, anamnese — entram no dossiê quando existem para o aluno.

**Fases:**
- **F0 — Estudo retroativo de AGOSTO (primeira entrega, "necropsia"):** para
  cada saída de ago (foco CG/39), o cartão retroativo de sinais — o que estava
  visível e quando. Valida a régua com o passado antes de alertar o futuro.
  Parcialmente feito (números acima); falta o cartão por aluno + doc.
- **F1 — Fundação:** tabela `sinais_aluno` + match telefone→aluno (⚠️ espelho
  não tem telefone na coluna — verificar `raw` jsonb; é o item técnico nº 1) +
  extrator LLM diário do espelho + sinais SQL diários + backfill 30d.
- **F2 — Alertas:** os 3 fluxos da Sol (§5.4) + dossiê de renovação D-30/15/7.
- **F3 — Painel:** sinais como coluna/aba no Health Score v2 existente +
  comparativo mensal.
- **F4 — Aprendizado:** desfechos obrigatórios, análise mensal automática,
  re-treino do risco com features de conversa.

**Fora do MVP (registrado para não perder):** ampliar espelho para caixas
Mila/ADM/Instagram; áudio/imagem (espelho é 100% texto); engajamento do
responsável como coleta própria (evento/presença de pais); CSAT nativo
Chatwoot (desligado nas 8 caixas); políticas de SLA nativas (zero
configuradas); metas de atendimento (indicadores: zero-sem-resposta no dia, %
≤15min em horário comercial, p90); Sol no pré-atendimento (só pós-flip V4);
inteligência de pergunta da pesquisa de evasão (comparar marcado × declarado ×
conversa; sugerir variante quando não performa).

## 7. Perguntas em aberto

1. Destinatários dos alertas (§5.4) — desenho proposto, falta OK formal.
2. Quem LIGA para os 17 da lista de renovação em risco (o resgate é humano).
3. ~~Acesso ao banco do TOM~~ **RESOLVIDO 03/09** (credencial recebida;
   contrato de integração definido acima). `sinais_aluno` mora no **LA Report**
   (decisão: junto de aluno, risco, jornada e painel), extrator lê o espelho da
   Sol, tarefas nascem no banco do TOM.
4. Retenção ativa de quem declara cancelamento: qual o playbook humano quando
   o alerta disparar? (proprietário: Luciano + gerentes)

## 8. Conectores e credenciais (registrado em 02/09)

`.mcp.json` do repo (gitignored) com: `supabase` (LA Report), `supabase-sol`
(projeto da Sol/espelho, ref `bvltexmlmydsncfjstbr`), `chatwoot` (MCP
mcp-hugo, 424 tools — ⚠️ token de bot que a REST recusa mas o MCP aceita, com
ESCRITA; tratar como credencial sensível), `n8n` (119 workflows). Nunca
commitar credencial; o arquivo está no `.gitignore` (linha 37).

## 9. A camada de AÇÃO e o ecossistema de agentes (brainstorm 03/09, parte 2)

**Princípio do Luciano:** "a gente tem um monte de sinal mas o time não age
porque não sabe ler". Dashboard sem tarefa com dono é enfeite. E **zero ruído**:
alerta falso mata a confiança — só sinal canônico dispara ação; sinal
observacional NUNCA gera tarefa.

### O ciclo completo

SINAL (mapa) → TRIAGEM (Lia + guardiãs do sucesso do aluno) → TAREFA (LA
Organizer, com dono e prazo) → COBRANÇA (TOM, diária, até fazer) → GOVERNANÇA
(não fez → escala gerente; gerente não fez → escala Luciano) → **DESFECHO
(volta pro mapa como rótulo de aprendizado)**. O fechamento da tarefa no
Organizer É o dado de tratamento que o aprendizado precisa — o loop se fecha
sozinho, sem coleta extra.

### Papéis dos agentes (quem faz o quê)

| Agente | Papel no mapa |
|--------|---------------|
| **Mila** (SDR, n8n) | Entrada: expectativa inicial do lead, origem, contexto comercial |
| **Sol** (caixa/grupos, la-hq) | Operação do dia a dia: financeiro, presença, relatórios de grupo; futura camada de resposta rápida no atendimento (pós-flip V4) |
| **Lia** (sucesso do aluno) | Alertas rápidos do dia a dia (cliente no vácuo, follow-up) + **alimenta as guardiãs** com os sinais consolidados |
| **Guardiãs** (Gabi, Jéssica, Fabi — home office, bastidores) | Olham DE FORA; triam sinais e **criam as tarefas** para gerentes/times agirem |
| **TOM** (LA Organizer) | Execução: recebe as tarefas, lembra diariamente, cobra até cumprir; governança escala |
| **Fábio** (LA Teacher) | Jornada pedagógica (ainda amadurecendo; observacional por ora) |

### Achados da investigação (03/09)

- **Lia hoje — confirmado o "fajuto":** a infra de alerta privado existe
  (`lia_alertas_privados` + edge `processar-alertas-lia` + fila) mas está
  **vazia** (2 alertas na vida, 5 resumos de follow-up, config zerada). O Hugo
  montou o esqueleto e parou. Reconstruir EM CIMA do mapa de sinais canônico —
  não recriar heurística solta.
- **Health Score do aluno na tela — raiz do ruído:** `config_health_score_aluno`
  e `alunos_health_score_historico` têm **0 linhas** — a tela mostra aluno com
  Health 0 e badge "Saudável" ao mesmo tempo. O score exibido não tem motor
  atrás. Substituir pelo agregado do mapa (F3), não remendar.
- **Anamnese — o ouro conferido:** 235 anamneses, **210 desde agosto** (o pico
  de comprometimento da equipe é real). Campos ESTRUTURADOS: `objetivos`
  (tocar/banda/composição/carreira/hobby/recomendação médica),
  **`interesse_bandas` (sim/talvez/não)**, **`tempo_para_metas`** (a expectativa
  de prazo — base do sinal 10: descompasso expectativa × jornada),
  `temperamento`, saúde/diagnósticos/medicação, exposição a telas, sono (Kids).
- 🔥 **Cruzamento pronto para virar campanha: 111 alunos ativos declararam
  interesse em banda na anamnese — 97 NÃO estão em nenhuma banda.** Com banda
  valendo 35 vs 15 meses de casa e ~2,8× menos saída, é a lista de convites de
  retenção/expansão mais barata que existe. "Criar mais bandas" com fila
  nominal de demanda.
- **LA Organizer/TOM — banco INSPECIONADO (03/09, credencial recebida do
  Luciano; `.mcp.json` como `supabase-tom`, projeto `cesnbnrynvxvgdhfmaua`).**
  Sistema de tarefas grande e vivo: `tasks` 3.436 (90d: 1.654 done, 527
  cancelled, 460 pending — **100% `source='manual'`**), `task_reminders` 2.393,
  `tasks_audit` 11k, `collaborators` 37 ativos com **phone, unit,
  supervisor_id e is_ceo** (a cadeia de escalonamento já é nativa).
  **A equipe JÁ cria à mão as tarefas que o mapa geraria** — amostra real de
  hoje: "Arthur — falar com a Thaís (mãe do Ithan) sobre reposição", "Lead
  esperando resposta!" (dono Vitoria/campo_grande). O mapa só automatiza o que
  eles já fazem no braço.

  **Contrato de integração mapa→tarefa (definido):** INSERT direto em `tasks`
  com `source='mapa_sinais'` (valor novo; distingue e permite medir), `title`
  acionável ("Ligar p/ {aluno} — freq 0% e renova em {N}d"), `notes` =
  evidência do sinal, `assigned_to` resolvido por `collaborators`
  (unit+função), `governance_owner_id` = `supervisor_id` do dono, `due_date`
  pela severidade, `priority` mapeada. Dedup do NOSSO lado:
  `sinais_aluno.tarefa_id` guarda o uuid criado — sinal aberto do mesmo
  aluno+tipo nunca duplica. Lembrete/cobrança/escalonamento: **zero código
  novo** — o motor do TOM (`task_reminders` + governança) pega a tarefa como
  qualquer outra. A taxa de `cancelled` das tasks `source='mapa_sinais'` é o
  termômetro anti-ruído (regra dos 20%).

### Regra anti-ruído (doutrina)

1. Só sinal **canônico** (fonte na unha) dispara tarefa. Observacional aparece
   no dossiê, nunca vira cobrança.
2. Todo alerta nasce com **dono, prazo e ação sugerida** — nunca "fica de olho".
3. Dedup: mesmo aluno + mesmo tipo de sinal em aberto = NÃO duplica tarefa.
4. Se a taxa de "tarefa dispensada como improcedente" passar de X% (calibrar,
   sugestão 20%), o sinal volta para observação — o sistema se auto-policia
   contra virar a Lia fajuta de novo.
