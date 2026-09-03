# Auditoria — canal de origem da matrícula (03/09/2026)

Diagnóstico. Nada foi alterado, nenhuma migration rodada, nenhum dado escrito.
Todos os números são medidos; onde não há resposta, está escrito "não sei".

---

## 1. EMUSYS — o campo existe, e 41,5% vêm vazios

**O campo existe e já é sincronizado.** `upsert_lead(p_canal …)` recebe o rótulo
do Emusys e traduz por um `case` de 28 valores (`AMIGO`→Indicação, `PLACA DA
FACHADA`→Visita/Placa, `SITE DA ESCOLA`→Google, `DIGITAL INFLUENCER`→Instagram…).
O valor recebido fica gravado em `leads_automacao_log.detalhes->>'canal'`, o que
permite medir exatamente o que chega.

**180 dias, 20.851 eventos `emusys`:**

| canal recebido | eventos | % | casa em `canais_origem` |
|---|---|---|---|
| **(vazio/null)** | **8.663** | **41,5%** | — |
| INSTAGRAM | 7.099 | 34,0% | ✅ |
| GOOGLE | 3.018 | 14,5% | ✅ |
| Indicação | 738 | 3,5% | ✅ |
| Visita/Placa | 619 | 3,0% | ✅ |
| Instagram (minúsculo) | 450 | 2,2% | ✅ |
| Ex-aluno · Google · INDICAÇÃO · OUTROS · FACEBOOK · Convênios | 264 | 1,3% | ✅ |

**Todo rótulo não-vazio casa.** O mapeamento não é o gargalo — **o gargalo é que
41,5% chegam vazios da origem**, e 5.188 deles viraram lead novo.

**Dá para recuperar retroativo?** Para os 41,5% vazios, **não**: o Emusys não tem
o valor. Não é falta de sincronismo, é falta de preenchimento no cadastro.

---

## 2. VÍNCULO LEAD → ALUNO — o link existe, mas na direção contrária

O `alunos.lead_origem_id` não é o caminho principal. Medido sobre as 1.700 linhas
de `alunos`:

| caminho | alunos casados | cobertura |
|---|---|---|
| `alunos.lead_origem_id` | 166 | 9,8% |
| `alunos.canal_origem_id` (direto) | 69 | 4,1% |
| **`leads.aluno_id` → `alunos.id`** | **627** | **36,9%** |
| telefone normalizado (aluno × lead com canal) | 390 | 22,9% |

**`leads.aluno_id` cobre 3,8× mais que `alunos.lead_origem_id`.** O vínculo mora
do lado do lead, não do lado do aluno.

**Combinando os caminhos** (`leads.aluno_id` → `lead_origem_id` →
`alunos.canal_origem_id`), sem usar telefone:

- **468 de 1.700 alunos com canal — 27,5%**
- **371 de 1.159 alunos ATIVOS — 32,0%**

Ou seja, os ~12% do enunciado sobem para **32% nos ativos** só usando o vínculo
que já existe. Não sei por que `alunos.lead_origem_id` ficou em 9,8% — não
investiguei se é bug de sync ou funcionalidade que nasceu depois.

---

## 3. FONTE CANÔNICA — não havia uma; hoje há

**`vw_matriculas_por_canal` é código morto.** Aparece apenas em
`src/types/database.types.ts` (arquivo gerado). Zero consumidores em `src/` e nas
edge functions.

**Desde 03/09 a fonte é `radar_trafego_canal_v1(p_dias, p_maturidade_dias)`** —
leads por canal, agendamento, experimental, matrícula, custo e retorno em LTV,
com coorte madura. Ela mede pelo lado do **lead** (`leads.canal_origem_id` +
`leads.converteu`), que tem **67%** de cobertura, e não pelo lado do aluno, que
tem 4%.

⚠️ **Ressalva medida:** na coorte madura são **423 matrículas** e **168 (39,7%)
sem canal**. O ranking entre canais conhecidos se sustenta, mas dois quintos do
resultado são invisíveis.

⚠️ `vw_jornada_lead_v1` (03/09) descreve a jornada do lead; **não** é fonte de
matrícula por canal.

---

## 4. VALOR — está em `alunos`, não em `leads`

| fonte | cobertura |
|---|---|
| `leads.valor_parcela` | ~40% das matrículas |
| **`alunos.valor_parcela`** | **1.018 de 1.159 ativos — 87,8%** |

**`alunos.valor_parcela` é o líquido** (`valor_mensalidade − desconto_condicional`)
e é o que a régua financeira já usa. Ticket mediano hoje: **R$ 400,00**.

⚠️ Os 12,2% sem valor não são todos erro: bolsista integral tem mensalidade 0 ou
15 por definição.

⚠️ `emusys_faturas` só cobre **jun–set/2026** (o sync busca competência atual +
anterior) — serve para conferir, **não** como base de MRR histórico.

**MRR novo por canal é calculável hoje** cruzando `leads.canal_origem_id` →
`leads.aluno_id` → `alunos.valor_parcela`, **com a cobertura de 32%** do item 2.
Somar sobre 32% da base e chamar de MRR total seria errado; a leitura honesta é
*"MRR novo entre as matrículas com canal conhecido"*.

---

## 5. DAQUI PRA FRENTE — três pontos de escrita, um deles é o problema

**Onde `leads.canal_origem_id` é escrito hoje:**

1. **`upsert_lead`** (webhook Emusys) — a via principal. Escreve
   `coalesce(v_canal_id, canal_origem_id)`: só grava quando o Emusys **manda**
   canal, e **nunca sobrescreve** o que já existe.
2. **`varrer-atribuicao-meta-ads`** (de hora em hora) — recupera Instagram e
   Facebook pela conversa do Chatwoot. **First-touch**, só escreve em campo
   vazio. Funciona bem: em 180 dias, apenas **13 de 2.866** leads sem origem têm
   anúncio Meta identificado — um vazamento de **0,45%**.
3. **`mila-processar-mensagem`** — **parada desde 02/07/2026**, não conta.

**O que falha:** o item 1 — 41,5% chegam vazios do Emusys.

**E isso não é uniforme entre unidades.** Janela 04/08–03/09:

| unidade | leads | sem origem | % |
|---|---|---|---|
| **Recreio** | 273 | **7** | **2,6%** |
| Campo Grande | 506 | 139 | 27,5% |
| **Barra** | 178 | **63** | **35,4%** |

Mesmo sistema, mesmo período, mesmo webhook. **A diferença é de processo, não de
software** — e o Recreio prova que 2,6% é alcançável.

**O que precisa mudar para 100%:** tornar o campo de origem **obrigatório no
cadastro do Emusys**. Não há correção do lado do LA Report que produza um dado
que nunca foi digitado.

---

## ❌ A hipótese "sem origem = Google" não se sustenta

> *"Se ele não veio do Instagram, ele veio do Google. Não tem outro lugar."*
> — Hugo, 03/09

**A primeira metade está certa e foi medida:** a varredura do Meta é boa — só
**13 de 2.866** leads sem origem têm anúncio Meta (0,45% de vazamento). Instagram
está, de fato, bem mapeado.

**A segunda metade cai porque os "sem origem" não se parecem com tráfego pago.**
Coorte madura (180d até −35d):

| | Google | Instagram | **SEM ORIGEM** |
|---|---|---|---|
| agendou experimental | 9,1% | 7,9% | **0,6%** |
| tem `emusys_lead_id` | 98,5% | 97,0% | **19,3%** |
| conversão | 3,8% | 2,7% | **6,4%** |

E o dado que fecha: **dos 168 "sem origem" que converteram, 122 (73%) têm
`data_conversao` ANTERIOR à criação da própria linha de lead.** A mediana é
**−215 dias**. São registros criados **para trás**, a partir de aluno já
matriculado — não são leads que chegaram por lugar nenhum.

Marcá-los como Google inventaria **2.132 leads falsos** e destruiria a métrica
construída hoje: o custo por lead do Google cairia de **R$ 20,75 para ~R$ 2,00**
e ele viraria o melhor canal do mundo **por construção**. Perderíamos justamente
a régua que a decisão de investimento precisa.

**Além disso, os canais offline existem e são grandes:** Indicação (171 leads,
35,7% de conversão) e Visita/Placa (143, 30,1%) na mesma janela. Quem entra pela
porta não clicou em anúncio nenhum.

### O que fazer no lugar

1. **Tornar a origem obrigatória no cadastro do Emusys.** É a raiz dos 41,5%, e o
   Recreio já mostra que dá (2,6% × 35,4% da Barra).
2. **Usar `leads.aluno_id`** como caminho de casamento — leva a cobertura de
   ~12% para **32% nos ativos**, sem escrever nada.
3. **Não retroagir palpite.** Se um dia se quiser preencher retroativamente, que
   seja com marca explícita (`canal_inferido = true`) para o número real e o
   estimado nunca se misturarem.
