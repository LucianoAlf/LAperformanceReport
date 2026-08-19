# Treinamento — Regras de Negócio da LA Music

> **Para quem é:** equipe de ADM, Comercial, Coordenação e Sucesso do Aluno.
> **Para que serve:** todo mundo olhar o mesmo número e entender a mesma coisa.
>
> Este documento é a **versão de treinamento**, em linguagem do dia a dia.
> A versão técnica completa (com fórmulas, tabelas e nomes de sistema) é
> [`docs/REGRAS-DE-NEGOCIO.md`](REGRAS-DE-NEGOCIO.md) — use aquela para
> programar ou auditar; use esta para ensinar e para consultar no corredor.

---

## Índice

1. [A ideia que explica quase tudo](#1-a-ideia-que-explica-quase-tudo)
2. [Alunos: quem conta e quem não conta](#2-alunos-quem-conta-e-quem-não-conta)
3. [Dinheiro: quem paga e quanto](#3-dinheiro-quem-paga-e-quanto)
4. [Retenção: quem sai, quem fica, quem renova](#4-retenção-quem-sai-quem-fica-quem-renova)
5. [Comercial: do lead à matrícula](#5-comercial-do-lead-à-matrícula)
6. [Professores: carteira e desempenho](#6-professores-carteira-e-desempenho)
7. [As 12 pegadinhas que mais geram erro](#7-as-12-pegadinhas-que-mais-geram-erro)
8. [Glossário rápido](#8-glossário-rápido)

---

## 1. A ideia que explica quase tudo

### Pessoa ≠ Matrícula

Esta é **a regra mãe**. Se a equipe entender só isso, já evita metade dos erros.

> No sistema, **cada matrícula é uma linha**. Uma pessoa que faz dois cursos
> aparece **duas vezes**.

A Maria faz Violão e Canto. No sistema:
- São **2 matrículas**
- É **1 aluna**

Por isso existem dois números diferentes, e **os dois estão certos**:

| Número | O que é | Exemplo (Barra, ago/2026) |
|---|---|---|
| **Alunos ativos** | Quantas **pessoas** | 246 |
| **Matrículas ativas** | Quantos **vínculos/contratos** | 271 |

**Matrículas ativas é sempre maior ou igual a alunos ativos.** Se alguém disser
"o sistema está contando aluno a mais", quase sempre é isso: está olhando
matrícula e chamando de aluno.

### Competência: o mês do fato, não o mês do lançamento

Se hoje é agosto e você lança algo que só vale em setembro, aquilo pertence a
**setembro**.

Vale principalmente para:
- **Renovação antecipada** (§4.5)
- **Aviso prévio** (§4.3)

### Fuso horário

Tudo é medido no horário de Brasília. Um relatório rodado depois das 21h que use
o horário "do servidor" já virou o dia seguinte — por isso o sistema sempre
converte para BRT.

---

## 2. Alunos: quem conta e quem não conta

### 2.1 Aluno ativo

> **Aluno ativo = pessoa com pelo menos uma matrícula ativa em curso regular.**

Precisa das duas coisas ao mesmo tempo:
1. A matrícula está **ativa** no Emusys
2. É um **curso acadêmico** (não é banda, não é coral)

**Não contam como aluno ativo:**

| Situação | Conta? | Por quê |
|---|:--:|---|
| Trancado | ❌ | Pausado. Aparece no card "Trancados agora" |
| Faz **só** banda | ❌ | Banda é atividade extra, não é curso |
| Faz **só** coral | ❌ | Mesma regra da banda |
| Faz Violão **e** banda | ✅ | Conta pelo Violão (1 pessoa) |
| Bolsista integral | ✅ | É aluno ativo, só não é **pagante** |
| Inadimplente | ✅ | Está matriculado e estudando |

> ⚠️ **Trancado não é evasão nem aluno ativo.** É um terceiro estado.

### 2.2 Segundo curso

Mesma pessoa, **curso diferente**. Cada linha tem seu professor, sua turma e sua
presença.

- **Não** duplica a pessoa na contagem de alunos ativos
- **Entra** na soma do faturamento (é dinheiro real que ele paga)

### 2.3 Quando é duplicata de verdade

Duas linhas do mesmo curso **não são duplicata automaticamente**.

> **É duplicata só quando as três coisas batem: mesmo curso + mesmo professor +
> mesmo horário.**

Se qualquer uma diferir, são **dois vínculos legítimos**, cobrados separadamente.

Casos reais que **não** são duplicata:

| Aluno | Situação | Veredito |
|---|---|---|
| Vitória (Recreio) | Canto, mesmo professor, Quarta 15h **e** Quinta 16h | ✅ Duas aulas |
| Vicente (Recreio) | Musicalização, Segunda 09h **e** Segunda 10h | ✅ Dois tempos |
| Vinícius (CG) | 3× Power Kids, Terça 17h, **3 professores diferentes** | ✅ Três bandas |

> **Power Kids é banda** — o aluno pode tocar em duas bandas diferentes. Turma e
> professor distintos já bastam para ser legítimo.

⚠️ **Antes de dizer "está duplicado", confira o dia e o horário atualizados.**
Já aconteceu de duas linhas parecerem iguais só porque o horário no nosso
cadastro estava velho — no Emusys eram Terça 14h e Segunda 17h.

### 2.4 Kids e School

Pela **idade**, sobre os alunos ativos:

- **Até 11 anos** → LA Music Kids (LAMK)
- **12 anos ou mais** → LA Music School (EMLA)

**Kids + School + sem data de nascimento = total de alunos ativos.** Se não
fechar, tem aluno sem data de nascimento cadastrada.

---

## 3. Dinheiro: quem paga e quanto

### 3.1 Aluno pagante

> **Pagante é pessoa, não matrícula.** Quem faz 3 cursos é **1 pagante**.

**Não são pagantes:**

| Quem | Conta como pagante? |
|---|:--:|
| Bolsista **integral** | ❌ |
| Bolsista **parcial** | ❌ *(mesmo pagando!)* |
| Matrícula de **banda** | ❌ |
| **Inadimplente** | ✅ |

> ⚠️ **Bolsista parcial paga, mas não conta como pagante nem entra no ticket
> médio.** É a regra que mais causa dúvida. O motivo: ele distorce a média — o
> ticket precisa refletir o preço praticado, não o desconto social.

> ⚠️ **Inadimplente conta como pagante.** "Pagante" quer dizer *quem deveria
> pagar este mês*, não *quem já pagou*.

### 3.2 Valor da parcela

```
valor da parcela = valor cheio − desconto condicional
```

- O **desconto de pontualidade** (desconto fixo) **não** é descontado aqui — ele
  é acompanhado à parte.
- A bolsa do bolsista parcial entra como desconto condicional.

### 3.3 Atividade extra não é cobrada

Banda, Canto Coral, Power Kids, Minha Banda Para Sempre, GarageBand,
Percussion Kids:

- ❌ Não têm mensalidade
- ❌ Não entram em aluno ativo, pagante, ticket, faturamento nem churn
- ✅ Aparecem em cards próprios ("Matrículas em Banda", "Alunos no Coral")

> Se aparecer banda com valor, **está errado** — o aluno paga pelo curso
> regular dele, não pela banda.

### 3.4 Ticket médio

```
ticket médio = faturamento de todos os cursos dos pagantes ÷ nº de pagantes
```

- **Em cima:** soma **todos** os cursos, inclusive o segundo
- **Embaixo:** cada pessoa conta **uma vez**

> **Por isso o segundo curso AUMENTA o ticket médio** — e isso está certo. Ele
> soma dinheiro em cima e não soma pessoa embaixo.

Exemplo: aluno com 4 cursos (R$ 380 + 355 + 367 + 127) entra com **R$ 1.229** em
cima e **1 pessoa** embaixo.

### 3.5 Faturamento

```
faturamento previsto  = soma das mensalidades (MRR)
faturamento realizado = previsto − inadimplência
```

> **Passaporte não entra no faturamento mensal.** É receita à parte, tem métrica
> própria.

### 3.6 Inadimplência

```
inadimplência = quantos alunos devem ÷ alunos pagantes × 100
```

> É percentual de **pessoas (cabeças)**, não de valor.

- **Trancado entra** no radar de cobrança — o contrato mantém a parcela do mês.
- **Ex-aluno não entra.**
- Banda e bolsista integral ficam como "sem parcela".
- A régua oficial é vencer 1 dia. Farmer e Sol usam carência amigável de 2 dias.

---

## 4. Retenção: quem sai, quem fica, quem renova

### 4.1 Os cinco tipos de movimentação

| Tipo | É saída? | Observação |
|---|:--:|---|
| **Evasão** | ✅ | Interrompeu no meio |
| **Não renovação** | ✅ | Contrato acabou e não renovou |
| **Aviso prévio** | ❌ | Avisou, mas ainda estuda |
| **Trancamento** | ❌ | Pausa temporária |
| **Renovação** | ❌ | Continuou |

```
Evasão (para KPI) = evasão + não renovação
```

> **Transferência entre unidades não é evasão.** O aluno continua na LA Music.

### 4.2 Aviso prévio: 2 meses

> Quem avisa **em agosto** estuda **agosto e setembro**. A saída real é no fim
> de setembro.

- ❌ Não é evasão no mês do aviso
- ❌ **Não entra na conta da taxa de renovação**
- ✅ É a janela para tentar segurar o aluno

### 4.3 Taxa de renovação

```
taxa de renovação = renovações ÷ (renovações + não renovações) × 100
```

**Meta: 80% ou mais.**

- Aviso prévio **fora** da conta
- Só renovação **confirmada** conta
- Banda e coral **fora**

### 4.4 Churn

```
churn = evasões ÷ alunos pagantes × 100
```

Faixas de risco por professor: **crítico 15%+ · alto 10%+ · médio 5%+ ·
normal abaixo de 5%**.

### 4.5 Renovação antecipada

Renovação lançada **antes** do ciclo começar.

- ❌ **Não conta** no mês em que foi lançada
- ✅ Conta no mês da **primeira aula do novo ciclo**
- ✅ Aparece em lista separada, "Renovações Antecipadas"

> ⚠️ **Nunca apagar uma renovação antecipada para "limpar" o relatório.** Ela
> está certa onde está.

### 4.6 Tempo de permanência e LTV

```
LTV = ticket médio × tempo de permanência (meses)
```

> **Regra "saiu de tudo":** o tempo só é contado quando o aluno encerra
> **todas** as matrículas. Se largou o Violão mas continua no Canto, ainda é
> aluno — não conta saída.

Permanências abaixo de 4 meses ficam fora da média.

---

## 5. Comercial: do lead à matrícula

### 5.1 O caminho do lead

```
Novo → Experimental agendada → Experimental realizada → Matriculado
                            ↘ Faltou ↗
```

### 5.2 Experimental conta quando é REALIZADA

> ❌ Nunca conte pela data em que foi **agendada**.
> ✅ Conte pela data em que **aconteceu**.

- **Cancelamento sempre prevalece.** Aula futura aparece como "ausente" no
  Emusys por padrão — isso não é falta, é aula que ainda não aconteceu.
- Experimental de aluno que já estuda aqui (2º instrumento) **conta**.

### 5.3 Duplicata de lead

| Situação | O que acontece |
|---|---|
| Mesmo **telefone**, mesma unidade | 🚫 Bloqueia |
| Mesmo **nome**, ambos sem telefone | ⚠️ Avisa |
| Mesmo nome, telefones diferentes | ✅ Não é duplicata |

### 5.4 As taxas do funil

```
show-up            = experimentais realizadas ÷ agendadas
conversão exp→mat  = matrículas novas ÷ experimentais realizadas
lead → experimental = leads que agendaram ÷ total de leads
```

### 5.5 Matrícula nova

Conta a matrícula que **não** é segundo curso, **não** é bolsista, **não** é
banda e **não** é coral.

> A matrícula entra no funil mesmo **sem lead** — irmãos e matrícula direta
> apareceriam de menos se contássemos só lead convertido.

### 5.6 ⚠️ Problema conhecido: irmãos

O sistema identifica lead pelo **telefone do responsável**. Se dois irmãos se
matriculam com o mesmo telefone, **eles colapsam em um único lead** e o segundo
irmão aparece como aluno sem lead.

**Na prática:** ao lançar irmãos, confira se os dois apareceram no funil.

---

## 6. Professores: carteira e desempenho

### 6.1 Carteira do professor

Quantos alunos ativos estão com aquele professor.

- Segundo curso **conta** (é aula que ele dá)
- Banda **não conta**
- Trancado **não conta**

> No ticket da carteira, o aluno com 2 cursos conta para **os dois professores**
> — senão um deles perderia o aluno da conta.

### 6.2 Evasão que pesa no score

> **Só pesa a evasão cujo motivo foi marcado como "conta para o professor".**

Motivo em branco **não** pesa. Motivos como mudança de cidade ou dificuldade
financeira normalmente não são responsabilidade do professor — isso é
configurável na tela de Motivos.

### 6.3 Taxa de conversão do professor

```
conversão = matrículas depois da experimental ÷ experimentais realizadas por ele
```

- Só entram as experimentais **dele**
- Matrícula sem experimental **não** entra
- Taxa acima de 100% é **bug**, não é desempenho

### 6.4 Health Score V3 — os 6 pilares

| Pilar | Peso |
|---|---:|
| Retenção | 25% |
| Permanência com o professor | 25% |
| Conversão Experimental → Matrícula | 15% |
| Média de alunos por turma | 15% |
| Número de alunos | 10% |
| Presença dos alunos | 10% |

> **Pilar sem base suficiente não vira zero — ele sai da conta.** Um professor
> novo, com 2 experimentais, não é punido por falta de amostra.

---

## 7. As 12 pegadinhas que mais geram erro

Esta é a seção para colar na parede.

| # | O erro | O certo |
|---|---|---|
| 1 | Contar linhas e chamar de "alunos" | Aluno = pessoa. Matrícula = linha |
| 2 | Achar que trancado é evasão | Trancado é pausa, é um terceiro estado |
| 3 | Contar aviso prévio como evasão | Ele ainda estuda por 2 meses |
| 4 | Colocar aviso prévio na taxa de renovação | Não entra no denominador |
| 5 | Achar que bolsista parcial é pagante | Paga, mas não conta como pagante |
| 6 | Tirar inadimplente dos pagantes | Inadimplente é pagante |
| 7 | Achar que 2º curso "infla" o ticket | Ele **eleva** o ticket, e está certo |
| 8 | Contar quem só faz banda como aluno | Atividade extra não faz aluno ativo |
| 9 | Contar experimental pelo agendamento | Conta quando é **realizada** |
| 10 | Achar que aula futura "ausente" é falta | É o padrão do Emusys para aula futura |
| 11 | Apagar renovação antecipada | Ela pertence ao mês da 1ª aula do ciclo |
| 12 | Chamar 2 linhas do mesmo curso de duplicata | Só é duplicata com **mesmo professor e horário** |

---

## 8. Glossário rápido

| Termo | Em uma frase |
|---|---|
| **Aluno ativo** | Pessoa com curso regular ativo (não trancado, não só banda) |
| **Matrícula ativa** | Cada vínculo/contrato — quem faz 2 cursos tem 2 |
| **Pagante** | Pessoa que paga mensalidade (sem bolsista, sem banda) |
| **MRR** | Soma das mensalidades do mês |
| **Ticket médio** | Quanto o aluno paga em média, somando todos os cursos dele |
| **Churn** | % de alunos pagantes que saíram no mês |
| **Evasão** | Saiu no meio do contrato |
| **Não renovação** | Contrato acabou e não continuou |
| **Aviso prévio** | Avisou que vai sair — ainda estuda o mês atual + o seguinte |
| **Trancamento** | Pausa temporária com previsão de volta |
| **Competência** | O mês a que o fato pertence |
| **Atividade extra** | Banda, coral, Power Kids — não é cobrada |
| **LTV** | Quanto o aluno gera na vida toda dele na escola |
| **Show-up** | % de experimentais agendadas que aconteceram |

---

## Como manter este documento

- A fonte da verdade é [`docs/REGRAS-DE-NEGOCIO.md`](REGRAS-DE-NEGOCIO.md). Se
  os dois divergirem, **aquele vence** — e este aqui precisa ser corrigido.
- Regra de negócio só muda com validação do **Alf**.
- Ao mudar uma regra lá, atualize aqui **no mesmo dia**, senão o treinamento
  passa a ensinar o que não vale mais.

---

*Versão de treinamento gerada em 19/08/2026, a partir da consolidação canônica
validada contra o banco de produção.*
