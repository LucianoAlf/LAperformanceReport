# Datas de nascimento — bug no webhook Emusys

**Para: Matheus (Emusys)**
**De: LA Music — auditoria de `data_nascimento`**
**Data: 03/08/2026**

---

## Resumo

Você está certo: a REST API `GET /matriculas` retorna `aluno` e `responsavel` separados e organizados. Confirmamos puxando direto da API. Com a sua OpenAPI (`api_emusys.json` v1.2.2), descobrimos que **o webhook também tem os dois campos separados** — `data_nascimento_aluno` e `data_nascimento_responsavel` (schema `MatriculaWebhook`, linhas 565-566). Nosso código lê o campo certo (`data_nascimento_aluno`).

Mas em pelo menos 3 cadastros confirmados, o campo `data_nascimento_aluno` do webhook veio com a data do responsável, não do aluno. O bug está no momento em que o Emusys popula esse campo — não na estrutura nem no nosso código.

---

## A estrutura do webhook (confirmada pela sua OpenAPI)

O schema `MatriculaWebhook` tem os dois campos separados:

```json
"MatriculaWebhook": {
  "data_nascimento_aluno": "2010-05-15",       // ← campo do ALUNO
  "data_nascimento_responsavel": "1980-10-20",  // ← campo do RESPONSÁVEL
  "nome_aluno": "João Silva",
  "nome_responsavel": "Maria Silva",
  ...
}
```

Nosso código lê o campo certo:

```typescript
// processar-matricula-emusys/index.ts, linha 464
dataNascimento: m.data_nascimento_aluno || null
//                 ^^^^^^^^^^^^^^^^^^^^^^^^
//                 campo do aluno, não do responsável
```

---

## Prova — 3 casos onde `data_nascimento_aluno` veio com a data do responsável

### Caso 1: Heitor Muniz (matrícula 2474, Campo Grande)

| Fonte | `data_nascimento_aluno` | `data_nascimento_responsavel` |
|---|---|---|
| **REST API** (hoje) | `2019-02-09` (correto, 7 anos) | `1983-04-21` (mãe Renata) |
| **Webhook** (quando chegou) | `1983-04-21` ← **data da mãe** | ? |
| **Nosso banco** (antes) | `1983-04-21` ← gravamos o que o webhook mandou | — |
| **Nosso banco** (depois) | `2019-02-09` ← corrigido puxando da REST API | — |

O `audit_log` da correção confirma:
```
aluno:       Heitor Muniz Martis Da Silva
data antiga: 1983-04-21   ← data da mãe Renata
data nova:   2019-02-09   ← data correta (REST API)
```

### Caso 2: Laiane Marins (matrícula 2478, Campo Grande)

| Fonte | `data_nascimento_aluno` | `data_nascimento_responsavel` |
|---|---|---|
| **REST API** (hoje) | `2014-11-03` (correto, 11 anos) | `1980-12-16` (mãe Aline) |
| **Webhook** (quando chegou) | `1980-12-16` ← **data da mãe** | ? |
| **Nosso banco** (antes) | `1980-12-16` ← data da mãe | — |
| **Nosso banco** (depois) | `2014-11-03` ← corrigido | — |

### Caso 3: Milena Americo (matrícula 2552, Campo Grande)

| Fonte | `data_nascimento_aluno` | `data_nascimento_responsavel` |
|---|---|---|
| **REST API** (hoje) | `2016-12-22` (correto, 9 anos) | `1977-04-26` (pai Marcio) |
| **Webhook** (quando chegou) | `1977-07-24` ← **data próxima do pai** | ? |
| **Nosso banco** (antes) | `1977-07-24` ← data do pai | — |
| **Nosso banco** (depois) | `2016-12-22` ← corrigido | — |

---

## A pergunta para você

O webhook tem os campos separados (`data_nascimento_aluno` e `data_nascimento_responsavel`), e nosso código lê o campo certo. Mas em pelo menos 3 cadastros, o campo `data_nascimento_aluno` veio com a data do responsável.

**Em que momento o Emusys popula o campo `data_nascimento_aluno` do webhook?** Pode ser que em algum fluxo de cadastro (especialmente de criança, onde o responsável preenche o formulário), o sistema esteja gravando a data do responsável no campo do aluno.

---

## Segundo ponto: o webhook não envia `aluno_id`

Confirmamos pela sua OpenAPI que o schema `MatriculaWebhook` **não tem `aluno_id`** — só tem `matricula_id` e `lead_id`. A REST API (`Matricula`) tem `aluno.id`, mas o webhook não envia.

Resultado: **171 alunos ativos** estão com `emusys_student_id = null` no nosso banco, mas a REST API tem o `aluno.id` para todos eles. Exemplos confirmados hoje:

| Aluno | REST API `aluno.id` | Nosso `emusys_student_id` |
|---|---|---|
| Beatriz von Glehn (10 anos, Barra) | 1211 | null |
| Samuel Muniz (13 anos, CG) | 3593 | null |
| Luna Balbi (7 anos, Recreio) | 2178 | null |

**Tem como incluir `aluno_id` no schema `MatriculaWebhook`?** Sem ele, não conseguimos cruzar dados do aluno pelo ID — só pelo nome, que é frágil (homônimos, acentuação, etc).

---

## O que já corrigimos

- Migration `20260803204642` corrigiu as 11 datas divergentes, puxando da REST API. Zero divergência restante.
- Cada linha guarda o valor antigo explícito (reversível).

## O que precisamos de você

1. **Investigar o fluxo de cadastro** onde `data_nascimento_aluno` é populado — em que momento a data do responsável pode acabar nesse campo.
2. **Incluir `aluno_id` no schema `MatriculaWebhook`** — sem ele, 171 alunos ficam sem ID no nosso sistema.
