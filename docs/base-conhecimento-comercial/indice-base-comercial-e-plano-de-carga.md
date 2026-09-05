# Base de conhecimento comercial da Mila — índice e plano de carga
**v1.0 · 05/09/2026** · 11 blocos aprovados pelo Alf em 05/09/2026 · revisão da Krissya pendente antes de `aprovado` em produção

---

## Índice

| # | bloco | público | gatilhos principais | estado | versão | fontes |
|---|---|---|---|---|---|---|
| 1 | Atendimento Bumerangue (+ régua de preço) | comercial · SDR | conversa com lead, pediu preço, sumiu | aprovado (Alf) | 0.4 | Alf; Playbook; roteiro Mila SDR; *O Conselho*; pesquisa 05/09 |
| 2 | Indicação: LA Talent + pedido na hora + VPI | comercial · liderança | matrícula fechada, programa de indicação, cashback | aprovado (Alf) | 0.2 | LA Talent; Playbook; Exame/Flávio Augusto; Noll (livro + podcasts); Gershon 2019; medição |
| 3 | A Experiência: antes, durante, depois | comercial · professor | experimental marcada, Tour, pitch, devolutiva, 1ª aula | aprovado (Alf) | 0.2 | Playbook 03/04/05; Alf; Casos 1 e 4; medição; Dani Martins; *O Conselho* |
| 4 | Objeções | comercial · SDR | as 10 objeções | aprovado (Alf) | 0.2 | Playbook; motor de perda; Casos 1/3/4; *O Conselho* |
| 5 | Retomada com data | comercial | lead quente com data; gatilho sazonal | aprovado (Alf) | 0.1 | Alf; brainstorm; régua automática |
| 6 | Campanha e corridinha | liderança | dia 1, gargalo, gatilho, fim de mês | aprovado (Alf) | 0.1 | Alf; brainstorm; Matriculador+LA; regras travadas |
| 7 | Mídia paga | liderança (gate tráfego) | leitura semanal, alerta, realocação, Ryan | aprovado (Alf) | 0.1 | Alf; PC5; capacidades Mila estratégica; checkpoint |
| 8 | Liderança comercial | liderança (gate gestão) | sinal em alguém, ritual, contratação | aprovado (Alf) | 0.1 | Alf; CCL/SBI; *O Conselho*; Dani Martins; Ficha Técnica |
| 9 | Calendário comercial | liderança | dia 1, 30 dias antes de gatilho | aprovado (Alf) | 0.1 | Playbook; Alf; Matriculador+LA; agenda 2026 |
| 10 | Ex-aluno | comercial · liderança | ex-aluno voltou/vai ser convidado | aprovado (Alf) | 0.1 | Playbook; PC3; Alf |
| 11 | Pré-atendimento Mila SDR | liderança · diretoria | bot, repasse, conversas que morrem | aprovado (Alf) | 0.1 | pesquisa 05/09; cortes SEM-PII; roteiro SDR |

**Estratégia candidata (fora da base, na lista de estratégias):** Experiência Musical paga — piloto em 1 unidade, decisor Krissya com Alf.

## Pendências marcadas ⚠️ dentro dos blocos (fila do Alf/Krissya)
1. Como os consultores passam preço hoje (raspagem do Devin) → texto do item 2 da régua (bloco 1).
2. Até quando vale o valor de fechamento na hora (bloco 3).
3. Quem escreve a devolutiva pós-experimental: consultora com a fala do professor, ou o professor (bloco 3).
4. Corridinha de agosto: 30 matrículas era por unidade ou do time (bloco 6).
5. Janela de maturação da coorte de mídia — 30 dias provisório (bloco 7).
6. Datas de recital, Piquenique Musical e LA Sunset (bloco 9); campanha adulto em maio nunca testada.
7. LA Talent: em vigor sim/não; campo `indicado_por` (bloco 2).
8. Krissya: líder das 3 unidades (governança) ou gerente da Barra (como o Alf fala)? — cadastro.
9. Cruzar as 194 conversas de uma mensagem com canal e texto da 1ª mensagem antes de mexer no bot (bloco 11).

## Regras transversais (valem em todos os blocos)
- Dado medido diz **se**; método diz **como**; regra vigente diz **o que pode**. Sem nenhum dos três: opinião rotulada.
- Toda ação nasce com desfecho previsto; resultado rotulado **observado / atribuído / incremental**; comparador = mesmo mês do ano anterior ou unidades que não fizeram.
- Fala do lead ≠ fato ≠ inferência da Mila.
- Nunca desconto sem contrapartida; nunca fonte inventada; nunca conteúdo nominal fora do gate.
- Bumerangue não se mede contando perguntas.

## Plano de carga (sequência; cada passo é um PR do Devin)

**Passo 0 — Krissya lê os 11.** Ela é decisora "com Alf": sem o veto/ok dela, nada sai de `candidato`. Formato: um bloco por dia no WhatsApp com a Mila? Ou sessão de 1h com o Alf. ⚠️ decidir.

**Passo 1 — Migração em `base_conhecimento_blocos`** (decisão de produto, já sinalizada e aprovada em princípio em 05/09):
- `publico text check in ('lead','comercial','lideranca')` — default `lead` pros 4 blocos atuais da SDR.
- `estado text check in ('candidato','em_revisao','aprovado','substituido')` — default `aprovado` pros 4 atuais.
- `versao text`, `revisar_em date`, `aprovado_por text`, `aprovado_em date`, `substitui_id`.
- `get_base_conhecimento(p_publico, p_unidade_id)`: filtra `estado='aprovado'`, `publico` pedido, unidade (NULL global + exceção). **Preview e uso saem da mesma função.**

**Passo 2 — Carga dos 11 blocos** como `estado='candidato'`, `publico` conforme índice, `conteudo` = o markdown de cada arquivo `bloco-XX-*.md` (arquivo consolidado em `base-comercial-v1.md`). Não tocar nos 4 blocos da SDR.

**Passo 3 — Tool MCP `consultar_base_comercial`** no `mila-gestao-tools`: recebe a situação, resolve o gate pelo carimbo no servidor, devolve 1–3 blocos aprovados com id, título, versão e `revisar_em`. Sem SQL cru pro modelo.

**Passo 4 — SKILL:** a seção `skill-mila-conhecimento-comercial.md` entra na SKILL atual da mila-gestao (não substitui). Cenários novos no `mila-shadow`. Validar no caminho real.

**Passo 5 — Promoção:** Krissya aprova → `estado='aprovado'`, `aprovado_por`, `aprovado_em`, `revisar_em = +90 dias`. A partir daí a Mila usa em produção.

**Passo 6 — Ciclo:** lacunas registradas viram fila de escrita; aprendizado medido (`evidencia_eficacia`) vira proposta de bloco novo ou revisão; nada se sobrescreve — versão nova, anterior `substituido`.

## Alicerce que os blocos assumem e ainda não existe
| item | blocos que dependem | quem |
|---|---|---|
| campo `indicado_por` no lead + pergunta no cadastro | 2 | Devin |
| `lead_retomada` (frase original, data, precisão, estado) | 5 | Devin (em construção) |
| evento "devolutiva enviada" no LA Report | 3 | Devin |
| marcação de leads sintéticos (`origem_registro`) | 11, 7, 6 | Devin |
| SLA próprio pro indicado (15 min) e pro "quero falar com gente" | 2, 11 | Devin |
| remedir os padrões PC1–PC5 (hoje 03/09, sem cron) | todos que citam | Devin |
| leitor de conversa de lead (qualidade, não tempo) | 1, 11 | futuro |
