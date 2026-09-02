# Sol Caixa V4 — o agente na frente, o cofre na fronteira

**Estado:** Fase 1 (roteador em shadow) EM PRODUÇÃO desde 31/08 ~23h.
**Go:** Luciano, 31/08 ("trazer o agente para frente… cirúrgico, sem quebrar, sem projeto de um ano").
**Donos:** Luciano (produto) · Alfredo (V3/ledger) · Claude (implementação).
**Referência viva:** a Maria (OpenClaw, VPS do Alfredo) — auditada na fonte em 31/08.

---

## 1. Por que (evidência, não opinião)

**A semana de 24–31/08 mediu as duas arquiteturas em produção:**

| medida | valor |
|---|---|
| raízes corrigidas no diálogo da Sol em UM dia (31/08) | 11 |
| destas, regex mordendo ERRADO (falso positivo) | 5 (`vale`→saída R$633 · `parcela`→destruiu categoria · `sim`→aprovou dinheiro · homônimo · "foi" grudado) |
| eventos observados pela sombra do contrato determinístico (Alfredo, 7 dias) | 504 |
| classificados pelo contrato de regras | **21 (4%)** |
| `coverage_gap` (runtime agiu; contrato sem regra) | 105 |
| roteador LLM (V4) nos 10 casos reais da semana | **9/10** (o "erro" foi recusar aprovar "pode" — que é o comportamento desejado, ver §3) |

Conclusão: regra escrita não escala para diálogo (4% de cobertura, e quando
"acerta" errado ela **sombreia o LLM** — falso positivo é pior que lacuna).
Quem escala é o modelo. A fluidez da Maria não é mágica: é LLM roteando com
contexto e **tools estreitas** executando.

## 2. A Maria, lida na fonte (o que copiamos e o que não)

- **LLM é o roteador**: zero regex no contrato operacional; agents por
  interlocutor (`maria-rose`, `maria-ana`, `maria-owner`…).
- **Cada escrita é uma TOOL nomeada e estreita**: `maria_contas_dar_baixa`,
  `maria_contas_corrigir_valor`, `maria_contas_alterar_vencimento`… — o modelo
  escolhe A ferramenta; a ferramenta é auditada e limitada.
- **Determinismo na fronteira**: "a única coisa que ela não faz é mover
  dinheiro real — esse clique é humano".
- **Modelo rápido** (deepseek-v4-flash primário, fallbacks grok/sonnet) +
  memória com embeddings + compaction com flush para arquivos de memória.
- Ela já tem um cinto de RPCs de **leitura do LA Report** (`maria-lareport-rpc__*`).

O que NÃO copiamos agora: migrar a Sol para OpenClaw (mudança de infra, não de
arquitetura — fica para depois se fizer sentido). A inversão acontece dentro do
runtime atual.

## 3. Arquitetura V4

```
mensagem do grupo
   │
   ├── "pode"/"não" (gate DETERMINÍSTICO — dinheiro só com aprovação explícita)
   │
   └── ROTEADOR LLM (contexto: pendências abertas, últimos lançamentos,
       │             citação, histórico curto)
       │  → {intencao, campos, confianca}
       │
       └── EXECUTORES (os caminhos de hoje, já testados 26/26):
           corrigir_aluno/valor/categoria/forma/competencia · sem_aluno ·
           contestar_fatura · saida_dinheiro · lancamento_por_texto ·
           corrigir/estornar_lancamento · consulta_caixa · conversa/nada
           │
           └── FRONTEIRA V3 (intacta): preview persistido + hash → "pode"
               humano → validador (valor/forma/categoria idênticos) →
               consumo único → RPC auditada
```

Invariantes (não negociáveis):
1. **Números nunca são gerados** — valor/fatura/aluno no card vêm das RPCs
   canônicas (`sol_caixa_parcela_canonica` etc.), o LLM só decide *qual
   caminho*.
2. **`aprovar` nunca vem do LLM** — o roteador tratando "pode" como `nada`
   (medido no teste) é o comportamento certo: o gate determinístico é quem lê
   aprovação.
3. **Toda escrita continua atrás da V3** — preview→pode→validador→consumo.
4. **Fail-safe** — roteador indisponível ⇒ gramática atual segue valendo.

## 4. Fases (cirúrgico, sem big-bang)

- **F1 — SHADOW (no ar desde 31/08):** `rotearMensagemV4` roda em paralelo
  (fire-and-forget no bridge) para toda mensagem de texto do grupo; o log
  `roteador_v4_shadow` guarda `{intencao, campos, confianca, legado, ms}` lado
  a lado. Kill switch: `SOL_CAIXA_V4_SHADOW=0`. Zero impacto, zero escrita.
- **F2 — ANÁLISE + FLIP DO DIÁLOGO (após 2-3 dias úteis de sombra):** comparar
  decisão a decisão. Critério de flip: o roteador concorda com o legado nos
  casos em que o legado acerta E decide certo nos casos em que o legado falhou
  (os "Não entendi"/falsos positivos). O flip em si é PEQUENO: o roteador passa
  a decidir primeiro e as intenções invocam os caminhos existentes (o mecanismo
  já existe — `tratarNaoEntendida` traduz intenção→frase canônica→`handle()`);
  a gramática vira fallback do roteador (inversão exata dos papéis atuais).
- **F3 — VOZ:** as respostas deixam de ser template; o modelo redige (tom
  Maria), com números interpolados de fonte canônica. Os cards de
  preview/lançamento mantêm formato fixo (são contrato com a equipe e com a V3).
- **F4 — TOOLS DE CONSULTA:** `consulta_caixa` ganha executor real (resumo do
  dia, movimentos, fatura de aluno — RPCs de leitura que já existem, padrão
  `maria-lareport-rpc`).

## 5. Latência (decisão de design pendente)

Medido na F1: 12–40 s por chamada via `hermes_cli chat` (CLI boot + loop).
Irrelevante em shadow (assíncrono); **inaceitável no flip** (a equipe espera
resposta). Opções, na ordem de preferência:
1. Chamada direta ao provedor do pool do hermes (`opencode-go` — o mesmo
   deepseek-v4-flash da Maria) via HTTPS do runtime: ~1-3 s esperados.
2. Endpoint do gateway hermes persistente (sem boot de CLI por chamada).
3. Modelo menor no mesmo caminho atual.
Resolver ANTES do flip; a F1 não depende disso.

## 6. O que morre no flip

- O "Não entendi essa 🤔" como primeira resposta (vira último recurso real).
- A necessidade de gramática nova por construção de linguagem inédita
  (**compromisso vigente desde 31/08: nenhuma regex nova de diálogo**).
- Os falsos positivos de palavra-solta (o roteador lê a frase inteira).

## 7. Rede de segurança

- 26 testes e2e (cada incidente real da semana travado) — o flip precisa de
  26/26 com o roteador na frente.
- Suíte roda com `SOL_CAIXA_V3_LEDGER_FAKE=1` (não toca o ledger) e
  `SOL_CAIXA_V4_SHADOW=0` (determinística).
- Ledger V3 + auditorias + reidratação: inalterados.
- Rollback do flip = um env var (roteador volta a ser sombra).

## Placar do shadow (atualizado 01/09 ~23h)

Roteador vs legado nos casos reais (log `roteador_v4_shadow`):

- **6 acertos**: "O aluno está errado"→corrigir_aluno sem nome (.99); "Aluno é
  Luiza Rodrigues é responsável..."→nome limpo; 2× multi do Jhon (17:09/17:51)
  →lancamento_multi_aluno (.99); mídia 18:27→lancamento_multi_aluno (.99, com
  valor 1722 e competência 08/2026 extraídos); "Um instante"→conversa (.99 —
  correto; o legado re-disparou a releitura da legenda por acidente).
- **1 derrota**: "pode" (18:31)→nada (.9). Irrelevante para o flip: `aprovar`
  NUNCA virá do LLM por invariante — mas vai registrado.
- **4 timeouts de 45s** (11-47,6s de latência via hermes_cli). O 4º foi na
  correção da Thyfany 17:53 e o replay das 18:28 mostrou o mesmo problema DENTRO
  do legado: o `interpretarMultiAluno` (30s) estourou e derrubou a divisão
  completa na parede fail-closed. **Latência não é só bloqueante do flip — já
  custa produção hoje.** Mitigação aplicada em 01/09: o formato ensinado
  ("Nome — R$ valor") virou parse determinístico e saiu do caminho da LLM
  (PR do multi-determinístico); o roteador continua precisando do pool
  `opencode-go`/endpoint persistente antes do flip.

## Placar do shadow — dia 02/09 (24 decisões no grupo de CG)

- **13 acertos**, incluindo **2 casos em que o roteador ganhou do legado**:
  `fechar_caixa` .99 às 00:32 (o legado não fez nada e a pessoa teve de repetir
  2 min depois) e `corrigir_forma` .99 às 19:20 (o legado devolveu
  `correcao_forma_sem_alvo`). Também acertou os 4 `lancamento_por_texto` (.98/.99),
  os 3 `lancamento_multi_aluno` (.99) e as 2 saídas (.99).
- **1 erro real**: `Dinheiro` → `conversa` conf 0.2. 🔴 **A causa foi a mesma do
  erro do legado**: não havia pendência aberta (`pendencias:0`), então nem o
  roteador nem a gramática tinham o contexto de que aquilo respondia a uma
  pergunta da própria Sol. Corrigido na raiz (S1, 02/09) — o mesmo fix que
  destrava a gramática **também alimenta o roteador**. Ponto de método para o
  flip: *estado explícito é pré-requisito do agente na frente, não detalhe.*
- **1 inconsistência**: frases equivalentes (`Sol, foi no dinheiro` /
  `Sol, foi dinheiro`) receberam `corrigir_forma` .99 e `nada` .75.
- **7 "pode"** classificados como `conversa`/`nada` — irrelevante por invariante
  (aprovação nunca vem do LLM), mas note que às 19:53 ele devolveu `aprovar`
  .95 para um "pode" idêntico: a inconsistência é dele, não do contexto.
- **1 timeout** em 24 (47,4 s). Latência do dia: 11–47 s.

**Placar acumulado (31/08 → 02/09): 19 acertos · 2 erros · 5 timeouts.** Os dois
erros são de contexto ausente, não de compreensão. Bloqueante do flip continua
sendo latência.
