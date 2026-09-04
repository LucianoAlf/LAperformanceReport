# Mila de gestão — plano completo (04/09/2026)

A Mila SDR fica onde está. Este plano é a **segunda Mila**: a que fala com o time
comercial, com os gerentes e com o Luciano — e que **escreve no cadastro**, não
só lê.

Régua declarada pelo Luciano e que vale para tudo aqui:

> **Número vem de RPC. Contexto vem de skill + LLM.** O LLM interpreta e redige;
> ele nunca calcula, nunca inventa e nunca decide dinheiro.

---

## O que a auditoria dos 6 blocos encontrou

| bloco | pronto | trava |
|---|---|---|
| 1 · SDR | **11/11** | — (não tocar) |
| 2 · Reports | 12/16 | consultor e meta por pessoa |
| 3 · Pendências | 7/8 | a volta |
| 4 · Apoio ao time | 0/7 | falta a ficha do lead |
| 5 · Tráfego | **14/16** | status/budget do Meta; série curta |
| 6 · Crescimento | 8/16 | motivo de perda, curso, calendário |

**Três dados travam metade da lista** — e os três têm a mesma raiz: ninguém
registra o que aconteceu.

| dado | cobertura | consequência |
|---|---|---|
| `leads.consultor_id` | **0 de 9.799** | sem ranking, sem meta por pessoa |
| `leads.motivo_nao_matricula_id` | **0 de 9.799** | bloco 6 sem insumo |
| `leads.curso_interesse_id` | 45% (5.407 em branco) | demanda por instrumento cega |

### As três chaves que o Luciano deu, e o que cada uma recupera

**1. Consultor = responsável comercial da unidade.** Já existe a tabela
`unidade_contato_comercial`, preenchida e ativa: Vitória (CG), Kailane (Barra),
Daiana (Recreio). **Recupera 100%, retroativamente**, sem depender de conversa
nem de inbox. ⚠️ A Vitória está com DDD 31 (`553171422022`) — conferir.

**2. Curso de interesse auto-preenchido pela experimental.** Retroativo recupera
**só 65** (60 por experimental + 5 por matrícula) — a maioria dos 5.407 nunca
chegou a agendar. **Mas para a frente vale**: quem agenda bateria passa a ter
"bateria" no interesse, sem ninguém digitar.

**3. Motivo de perda.** Vasculhei: **não existe em lugar nenhum.**
`motivos_saida` (24) e `movimentacoes_admin.motivo` (403) são de **aluno que
sai**, não de **lead que não fecha** — coisas diferentes. O Emusys não manda.
**Este só nasce da conversa** — e é por isso que a Mila escrevendo resolve.

---

## A decisão nova: a Mila ESCREVE

> *"O time entra pouco no sistema. Se a escrita estiver na mão deles pela Mila,
> ela não vai ser só ler."* — Luciano

O padrão já foi provado pela Sol no caixa. Copiamos a arquitetura, não o código.

### O que vale a Mila escrever

| # | escrita | por que | risco |
|---|---|---|---|
| **W1** | `curso_interesse_id` | 5.407 em branco; o time sabe e não digita | baixo — rótulo |
| **W2** | `motivo_nao_matricula` | 0 preenchidos; só nasce de conversa | baixo — rótulo |
| **W3** | `canal_origem_id` | 40% das matrículas sem canal | baixo — rótulo |
| **W4** | fechar sinal do radar | é a **volta**; resolve a dor da Vitória | baixo — reversível |
| **W5** | `consultor_id` | derivado da unidade, com override | baixo |
| **W6** | remarcar experimental | o time já faz isso na mão | **médio** — mexe em agenda |
| **W7** | observação no lead | contexto que hoje se perde | baixo |

### O que a Mila NÃO escreve

| nunca | por quê |
|---|---|
| valor, mensalidade, desconto | é dinheiro — é da Sol, com aprovação |
| `converteu = true` | matrícula nasce do Emusys; escrever aqui inventaria aluno |
| status de matrícula | vem do Emusys; escrever cria divergência silenciosa |
| **DELETE de qualquer coisa** | lixeira sim, apagar não |

### Como ela escreve — 5 invariantes

1. **Toda escrita atrás de RPC `SECURITY DEFINER`**, nunca SQL livre. O LLM
   escolhe a intenção; a RPC valida e grava.
2. **Preview + confirmação** para W6. Rótulo (W1–W3, W5, W7) grava direto — o
   custo de errar é reversível e a fricção mataria a adoção.
3. **Trilha sempre**: quem pediu, quando, valor antes e depois.
4. **Nunca deleta.** Correção é nova versão.
5. **Ambiguidade vira recusa, não sorteio.** Dois leads com o mesmo nome → ela
   pergunta. É a lição do `word_similarity` da Sol.

---

## O plano, em 6 passos

### Passo 1 — Destravar o que já existe *(hoje)*

A Mila tem `SELECT` em 465 tabelas e **lê zero**: conecta sem JWT e a RLS
devolve vazio em tudo. Não vou dar `bypassrls` — a saída é RPC.

- `GRANT EXECUTE` no conjunto de tráfego → **bloco 5 no ar**
- RPC de pendências (`radar_pendencias_comerciais_v1`) → **bloco 3 no ar**,
  com 875 alunos sem anamnese e 135 experimentais sem ficha esperando
- `get_situacao_lead_v1` → **bloco 4 no ar**

### Passo 2 — Fechar as portas de dado *(hoje)*

- Trigger: experimental agendada preenche `curso_interesse_id` se vazio
- Backfill do consultor por `unidade_contato_comercial` → **0% vira 100%**
- Backfill de curso pelos 65 recuperáveis

### Passo 3 — As ferramentas de escrita *(W1–W5, W7)*

Uma RPC por intenção, com trilha. A Mila passa a fechar os buracos **falando**
com o time, em vez de reclamar deles.

### Passo 4 — Teste no privado do Luciano

Antes de qualquer consultora. Acesso total, todas as RPCs. É onde a régua é
exercitada: ela erra na sua DM, não na da Vitória.

### Passo 5 — A volta e a DM da consultora

W4 ligado + as 5 situações já aprovadas. Só depois do passo 4 passar.

### Passo 6 — O que depende de tempo

- Status e budget na captura do Meta (o Google já tem) → 2 alertas do bloco 5
- Alerta de queda de desempenho → precisa de ~2 semanas de série
- Bloco 6 completo → depende de motivo de perda começar a existir

---

## Oportunidades que o Luciano não listou

Achei na auditoria e não estavam na lista:

- **Lead que fala com a Mila e nunca chega a humano** — já medido: 50% das
  conversas comerciais. Vira R18, já no ar.
- **Divergência de nome cadastro × conversa** — a Mila vê o nome real na conversa
  e o cadastro tem outro (caso Lucas Nunes de Salles/Souza).
- **Consultora sem resposta há X horas** — o espelho já sabe; ninguém vigia.
- **Lead que voltou depois de frio** — hoje quem esfria não é reavaliado.
- **Anúncio que gera pergunta repetida** — os leads perguntam a mesma coisa; isso
  é briefing de criativo pronto, e ninguém lê.

---

## O que muda de fato

Hoje a Mila reclama de buraco de cadastro. Depois disso, **ela fecha o buraco
conversando** — e os blocos 2 e 6, que estão em zero, passam a ter insumo sem
ninguém abrir o app.
