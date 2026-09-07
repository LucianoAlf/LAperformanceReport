# Inventário da Sol — o que existe, o que está desligado, e o que falta

**Data:** 07/09/2026 (feriado, tudo leitura) · **Frente 2, etapa 2.1**

---

## A correção que muda o plano

Eu vinha dizendo *"hoje a Sol só tem o caixa"*. **Errado.** Medido:

| | Sol | Mila |
|---|---|---|
| ferramentas MCP na mão do agente | **466** | 31 |
| servidores MCP | **6** | 1 |
| RPCs próprias no banco | **64** (`sol_*`) | 38 (`mila_*`) |
| escrita direta no banco | ✅ `execute_sql`, `apply_migration`, `deploy` | ❌ |
| filtro de ferramentas | **nenhum** (`disabled_toolsets: []`) | por telefone, no servidor |
| descrição dizendo *quando usar* | ❌ | ✅ em cada tool |

**A Sol não tem falta de capacidade. Tem falta de curadoria.**

## Os seis servidores

| servidor | n | o que é |
|---|---|---|
| `mcp-hugo` | **424** | **o Chatwoot inteiro**, remoto — captain 52, kanban 48, chat 35, conversations 23, reports 23, help 22. Leitura **e escrita** (`conversation_message_send`, `account_update`) |
| `supabase-governance` | 18 | leitura de organizações/projetos |
| `sol-brain` | 13 | **Supabase com `execute_sql`, `apply_migration`, `deploy_edge_function`** |
| `n8n` | 7 | leitura de workflows |
| `sol-acesso-restrito` | 3 | `query`, `list_resources`, `read_resource` |
| `registrar-pedido` | 1 | escrita |

⚠️ O `mcp-hugo` é do **Hugo, coordenador de tecnologia** — a caixa de ferramentas dele para corrigir as coisas. Está no config da Sol, então **ela também as enxerga**. 424 ferramentas de Chatwoot sem régua de uso.

⚠️ **`sol-brain` dá `apply_migration` e `execute_sql` no banco de produção.** É bem mais poder do que a Mila tem, e sem a curadoria que a Mila tem.

## As 64 RPCs `sol_*`

| | n |
|---|---|
| **leitura** (`stable`/`immutable`) | 24 |
| **escrita** (grava) | 22 |
| volátil sem escrita aparente | 18 |

⚠️ As 18 "voláteis sem escrita" incluem `sol_inadimplencia_v1`, `sol_kpis_alunos_v1`, `sol_faturas_alunos_v1`, `sol_caixa_inadimplentes` — são leituras que **não foram marcadas `STABLE`**. Higiene, não defeito, mas atrapalha o planner e confunde quem lê.

### 🔑 O achado que destrava a Frente 2

Entre as 64 há **`sol_inadimplencia_v1`, `sol_kpis_alunos_v1`, `sol_faturas_alunos_v1`**. Isso **não é caixa** — é domínio administrativo. O alicerce do 1º andar **já existe**.

E elas **são alcançáveis**: o papel `sol_acesso_restrito` tem `EXECUTE` nas três.

🔴 **Mas o servidor que usa esse papel expõe TRÊS ferramentas: `query`, `list_resources`, `read_resource`.** A capacidade existe e só chega por **SQL cru**. Não há uma ferramenta chamada *"inadimplência da unidade"* com uma descrição dizendo quando usar.

**É por isso que ela chuta SQL e o número não bate.** Não é falha do modelo: é o desenho pedindo que ele adivinhe a função, a assinatura e os parâmetros.

## O que está desligado ou morto

| | |
|---|---|
| **5 crons do Hermes** travados desde 03/09 pela guarda de drift | ✅ corrigidos hoje |
| `sol_caixa_ingestao_recebimentos` | ligada **um dia** (15/08, 213 msgs) e desligada |
| `sol_caixa_operacoes_auditoria_v1` | **0 linhas** — criada, nunca escrita |
| `sol_caixa_v3_caixa_operacoes_v1` | **0 linhas** |
| `whatsapp_caixas_credenciais_auditoria` | **0 linhas** |
| `agent.log` com dono `root` | ✅ corrigido — ela não subiria em nenhum restart |

⚠️ Duas tabelas de **auditoria de operações do caixa** estão vazias. `sol_caixa_lancamento_auditoria` (343 linhas) está viva e cobre o lançamento, mas operação de caixa (abrir, fechar, reabrir, estornar) não tem a trilha que alguém desenhou.

## O que isso significa para a arquitetura

O gargalo da Mila era **adoção** — capacidade existia e ninguém pedia. Por isso construímos convite, briefing, proatividade.

O gargalo da Sol é o **oposto**: capacidade demais, sem direção. 466 ferramentas cruas, `execute_sql` em produção, e nenhuma régua de quando usar o quê.

É a mesma forma do problema que o agente do Fábio descreveu na Maria — *"30 skills e zero habilitadas: o gate existe e está vazio"*.

**Consequência prática, e é boa notícia:** a Frente 2 é mais barata do que eu estimei. Não é construir o 1º andar do zero — é **curar o que já existe em ferramentas nomeadas**, no molde do `mila-gestao-tools-mcp.mjs`: uma tool por trabalho, com descrição dizendo o gatilho, e gate por telefone no servidor.

## Próximo passo

O benchmark da **Maria**, agora com a pergunta afiada em vez de passeio:

> A Maria tem ~80 ferramentas e conversa fluida. A Sol tem 466 e não conversa. **A diferença não está na quantidade** — está em como as ferramentas são declaradas, agrupadas e gateadas. É isso que eu quero ler lá.

E duas perguntas de governança que o inventário levanta e eu não vou responder sozinho:

1. A Sol deve continuar com `apply_migration` e `execute_sql` em produção?
2. O `mcp-hugo` (424 ferramentas de Chatwoot, com escrita) deve continuar no config dela, ou é ferramenta do coordenador que acabou herdada?
