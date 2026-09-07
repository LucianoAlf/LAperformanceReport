# Plano da Sol operacional — as 4 camadas, por portas

**Data:** 07/09/2026 · **Público desta fatia:** o time **operacional** (ADM e secretaria, no grupo e no privado)
**Método:** as quatro camadas — Alicerce · 1º · 2º · 3º andar — para cada público, um público por vez.

---

## A premissa que o inventário derrubou

O plano que eu ia escrever era *"construir o 1º e o 2º andar do administrativo"*. **Errado.** Medido hoje:

| | verificado |
|---|---|
| regras do radar no domínio **`aluno`** | **8, todas ativas** — R1 frequência despencando · R13 aviso prévio em janela de reversão · R11 professor parou de alimentar · R12 semáforo · R14 dificuldade financeira · R10 reposição sem desfecho |
| **sinais `aluno` ABERTOS agora** | **272** |
| funções que os entregam | **zero** — nenhuma filtra `dominio = 'aluno'` |
| scripts/crons que chamam `radar_pauta_v1` | **nenhum** |

🔴 **O 2º andar administrativo já existe e está cheio. Falta a correia para o 3º.** São 272 sinais detectados todo dia que ninguém entrega. Isso é o oposto da Mila, onde a gente construiu o motor; aqui o motor está rodando no vazio.

E a Sol tem **466 ferramentas** — mas **nenhuma nomeada por trabalho** no administrativo: só `query`, `list_resources`, `read_resource`. **Por isso ela chuta SQL.**

**Então o plano é ligar e cercar, não construir.** Isso o torna muito mais barato do que eu tinha estimado.

---

## A régua que vale para as quatro fatias

Três coisas verificadas na Maria e uma medida na Mila, que governam todo o resto:

1. **Tudo visível E cabe.** 12–18 portas, todas no prompt de todo turno. Nunca um roteador escolhendo qual competência a Sol pode saber — foi o `max 1` que produziu a variância do TOM.
2. **Contenção no `GRANT`, não na lista.** A lista esconde; o `GRANT` recusa. Duas travas, e a de fora não substitui a de dentro.
3. **Descrição com caso** — data, pessoa, a frase dela, o número do erro, e o nome da irmã. Não especificação.
4. **Ruído com pessoa correta destrói o canal** (lição da Daiana, 06/09). Todo alerta desta fatia nasce com a pergunta *"quem trabalha certo recebe isto à toa?"*.

---

## 🧱 FATIA 0 — Alicerce: cercar e dar as chaves

**Objetivo:** que a Sol pare de poder tudo e passe a poder o certo.

| passo | o quê | por quê |
|---|---|---|
| 0.1 | **Cercar o `query`** a `vw_sol_*` e RPCs `sol_*`, recusando tabela crua | é o conserto de maior efeito e não exige escrever ferramenta nenhuma. Molde: `maria-db-mcp.mjs` L310 |
| 0.2 | **Três papéis de banco** — `sol_operacional`, `sol_tatico`, `sol_estrategico` — com `GRANT` distinto | o público vira papel, não argumento. É o desenho `leitura`/`rose`/`owner` da Maria |
| 0.3 | **Perfil pelo remetente**, resolvido antes do modelo, com `governanca.quem_eh` (já existe) | o modelo nunca escolhe com que poder está falando |
| 0.4 | Marcar como `STABLE` as **18 RPCs de leitura** hoje declaradas voláteis | higiene; hoje confunde quem lê e atrapalha o planner |
| 0.5 | **Ligar a trilha das 3 tabelas de auditoria vazias** (`sol_caixa_operacoes_auditoria_v1`, `sol_caixa_v3_caixa_operacoes_v1`, `whatsapp_caixas_credenciais_auditoria`) | abrir, fechar, reabrir e estornar não têm rastro hoje |

⚠️ **Não mexer no `mcp-hugo`.** É a caixa de ferramentas do Hugo como coordenador; ele trabalha nela. A cerca é do lado do **papel de banco**, que não depende de tocar no MCP dele.

**Entregável:** a Sol operacional só enxerga o que o papel dela permite, e toda operação de caixa deixa rastro.

---

## 1️⃣ FATIA 1 — Primeiro andar: as portas do operacional

**Objetivo:** contexto → interpretação → orientação, por porta nomeada.

**12 portas de leitura**, todas visíveis em todo turno, ~250 caracteres de descrição cada, com caso. Quase todas **já têm a RPC pronta**:

| porta | fonte | existe? |
|---|---|---|
| `inadimplencia_da_unidade` | `sol_inadimplencia_v1` | ✅ RPC pronta |
| `faturas_do_aluno` | `sol_faturas_alunos_v1` | ✅ |
| `numeros_da_unidade` | `sol_kpis_alunos_v1` | ✅ |
| `situacao_do_aluno` | `get_situacao_alunos_v1` (canônica TOM/Sol/Lia) | ✅ |
| `alunos_em_aviso_previo` | `movimentacoes_admin` + R13 | ✅ dado, falta porta |
| `renovacoes_do_mes` | `vw_renovacao_ciclos` | ✅ |
| `contratos_vencendo` | `vw_contratos_vencendo` | ✅ |
| `alunos_sem_fatura` | `vw_alunos_sem_fatura_mes` | ✅ |
| `anamneses_pendentes` | `radar_pendencias_comerciais_v1` | ✅ |
| `presenca_pendente_do_dia` | `fn_presenca_pendencias_do_dia` | ✅ |
| `ocupacao_das_salas` | `get_agenda_dia` | ✅ |
| `caixa_do_dia` | `sol_caixa_resumo_do_dia` | ✅ |

**5 portas de escrita**, cada uma com `p_texto_original` (a frase humana que causou a gravação) e ator:

`registrar_motivo_saida` · `anotar_aluno` · `registrar_contato_feito` · `marcar_pendencia_resolvida` · `agendar_lembrete`

⚠️ **Nenhuma porta nova de negócio nesta fatia.** É embrulhar o que existe com nome, descrição e gate. Se aparecer necessidade de RPC nova, ela vira item explícito — não passa de contrabando.

**Entregável:** a Sol responde "como está a inadimplência do Recreio?" por porta, não por SQL chutado.

---

## 2️⃣ FATIA 2 — Segundo andar: ligar a correia que já existe

**Objetivo:** que os 272 sinais parem de morrer no banco.

| passo | o quê |
|---|---|
| 2.1 | **`sol_pauta_operacional_v1`** — o análogo de `mila_cutucada_v1` para `dominio = 'aluno'`, escopado por unidade e por papel |
| 2.2 | **Curar as 8 regras contra a régua da Daiana** — cada uma responde: *quem trabalha certo recebe isto à toa?* R13 (aviso prévio) e R14 (dificuldade financeira) são as que mais precisam |
| 2.3 | **Ligar `radar_padroes` ao administrativo** — hoje os padrões são comerciais (PC1–PC5). O "porquê" do operacional ainda não existe: é a única coisa desta fatia que é construção, não ligação |
| 2.4 | **`fechar_sinal` para o operacional** — como a Mila tem. Sinal que a pessoa resolve sai da lista, com motivo |

⚠️ **Antes de entregar qualquer um dos 272, medir quantos são ruído.** A lição de 06/09 custou caro: 21% da pauta comercial eram falsos, e quem mais recebia era quem trabalhava certo. Aqui são 272 de uma vez — despejar sem curar queima o canal no primeiro dia.

**Entregável:** a pauta operacional existe, curada, com o "porquê" atrás.

---

## 3️⃣ FATIA 3 — Terceiro andar: entrega, no grupo e no privado

**Objetivo:** a Sol deixa de só responder e passa a **procurar**. É onde a arquitetura da Mila entra inteira.

| canal | o quê | molde |
|---|---|---|
| **grupo** | bloco diário da unidade — o que exige ação hoje, 5 itens no máximo | `radar_bloco_comercial_grupo_v1` |
| **privado** | cutucada de hora em hora quando algo muda (aviso prévio novo, inadimplente que pagou, aluno sumido) | `mila-cutucada.py` |
| **privado** | briefing da manhã e fechamento do dia, por pessoa | `mila-proativa.py` |
| **grupo/privado** | escrita a pedido — "pode registrar", "anota aí", "fecha essa" | `resolver_conversa` da Mila |

**Três guardas que nascem junto, não depois:**

- **Agenda da escola** — feriado e domingo calam; recesso **não**. Já existe (`escola_agenda_v1`), é só usar.
- **Convite do dia** — uma capacidade por dia, ancorada no dado, para o time descobrir o que ela sabe. Sem isso a adoção não acontece: a Mila entregou por três dias e recebeu *"obrigada"*, uma pergunta de verdade.
- **Conferência afirmação × efeito** — se ela disse que registrou, registrou. É a camada que a Maria disse que copiaria de nós e o TOM disse que não pode morrer. A Sol já tem para lote; estender para toda escrita desta fatia.

---

## As conversas do time — insumo, não fatia

Você pediu: *"as conversas, o contexto do time — onde está acertando, onde está errando, onde pode melhorar."* Isso **atravessa as quatro camadas** em vez de ser uma delas:

- **Alicerce:** o espelho do Chatwoot já existe — `varrer-conversas-chatwoot.py`, de 30 em 30 min, com status e quem falou por último. Feito ontem para a Mila; serve igual.
- **1º andar:** `fn_lead_estado_pauta_v1` traduz o estado da conversa em pedido (`cobrar` / `pedir_motivo` / `oferecer_fechar`). O análogo para aluno é a porta a criar.
- **2º andar:** os padrões de atendimento — quem responde rápido, onde o cliente some, que promessa não voltou.
- **3º andar:** o alerta e a oferta de fechar.

⚠️ E a lição que veio da Daiana vale dobrado aqui: **um relatório que lê só o próprio sistema acusa errado quem trabalha certo.**

---

## Ordem, e o que decide cada corte

**Fatia 0 → 1 → 2 → 3**, e cada uma entrega sozinha:

| fatia | pronta quando | risco se pular |
|---|---|---|
| 0 | a Sol operacional não alcança tabela crua e tem papel próprio | tudo depois herda poder demais |
| 1 | ela responde 12 perguntas por porta, sem SQL | continua chutando |
| 2 | a pauta existe curada e com "porquê" | 272 sinais viram ruído no dia 1 |
| 3 | ela procura o time, no grupo e no privado | capacidade sem adoção — o erro que a Mila cometeu |

**Minha recomendação de sequência dentro do dia útil:** a **Fatia 0** é a única que mexe em permissão, e mexer em permissão de produção pede janela calma. Amanhã é terça, primeiro dia útil, com a sombra do V4 estreando — **não é o dia**. Fatia 0 na quarta; até lá, a Fatia 1 é toda escrita de descrição e não toca em nada vivo.

---

## O que este plano NÃO faz, de propósito

- **Não toca no `mcp-hugo`** — é do Hugo e ele trabalha nela.
- **Não mexe no runtime do caixa** — a Frente 1 está no meio de uma decisão de flip, e mexer nos dois ao mesmo tempo mistura as causas.
- **Não cria roteador** que escolhe competência antes do modelo. É a lição do TOM: `max 1` é o que produz variância.
- **Não constrói RPC nova de negócio na Fatia 1.** Se aparecer, vira item explícito.
