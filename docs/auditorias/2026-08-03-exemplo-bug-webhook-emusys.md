# Datas de nascimento — exemplo do bug no webhook

**Para: Matheus (Emusys)**
**De: LA Music — auditoria de `data_nascimento`**
**Data: 03/08/2026**

---

## Resumo

Você está certo: o endpoint `GET /matriculas` retorna `aluno` e `responsavel` separados e organizados. Confirmamos isso puxando direto da API. O problema **não é a REST API** — é o **webhook (push)**, que aparentemente usa uma estrutura diferente e em alguns cadastros está enviando a data do responsável no campo do aluno.

---

## Prova — caso Heitor Muniz (matrícula 2474, Campo Grande)

### O que a REST API `GET /matriculas` retorna (confirmado hoje)

```json
{
  "id": 2474,
  "aluno": {
    "id": 3426,
    "nome": "Heitor Muniz Martis Da Silva",
    "data_nascimento": "2019-02-09",
    "cpf": ""
  },
  "responsavel": {
    "id": 3433,
    "nome": "Renata Muniz C. M. Da Silva",
    "data_nascimento": "1983-04-21"
  }
}
```

Separadinho e correto — exatamente como você disse.

### O que estava gravado no nosso banco (antes da correção)

```
alunos.data_nascimento = 1983-04-21
```

**Era a data da mãe** (Renata, 1983-04-21) no campo do filho (Heitor, que nasceu em 2019-02-09).

Temos o log de auditoria da correção:

```
aluno:     Heitor Muniz Martis Da Silva
data antiga: 1983-04-21   ← data da mãe
data nova:   2019-02-09   ← data correta (puxada da REST API)
```

### O que nosso código lê do webhook

```typescript
// processar-matricula-emusys/index.ts, linha 464
dataNascimento: m.data_nascimento_aluno || null
```

Nosso código lê `m.data_nascimento_aluno` — um campo **flat** no payload do webhook, não a estrutura aninhada `aluno.data_nascimento` que a REST API retorna.

---

## Segundo caso — Laiane Marins (matrícula 2478, Campo Grande)

| Campo | REST API | Banco (antes) | Banco (depois) |
|---|---|---|---|
| `aluno.data_nascimento` | `2014-11-03` (11 anos) | — | `2014-11-03` |
| `responsavel.data_nascimento` | `1980-12-16` (mãe Aline) | — | — |
| `alunos.data_nascimento` | — | `1980-12-16` ← **data da mãe** | `2014-11-03` |

Mesmo padrão: a data da mãe estava no campo da filha.

---

## Terceiro caso — Milena Americo (matrícula 2552, Campo Grande)

| Campo | REST API | Banco (antes) | Banco (depois) |
|---|---|---|---|
| `aluno.data_nascimento` | `2016-12-22` (9 anos) | — | `2016-12-22` |
| `responsavel.data_nascimento` | `1977-04-26` (pai Marcio) | — | — |
| `alunos.data_nascimento` | — | `1977-07-24` ← **data do pai** | `2016-12-22` |

---

## A pergunta

O webhook (push) e a REST API (pull) usam **estruturas diferentes**?

- **REST API** retorna `aluno.data_nascimento` + `responsavel.data_nascimento` (aninhado, separado, correto).
- **Webhook** envia `data_nascimento_aluno` como campo **flat**?

Se o webhook envia a mesma estrutura aninhada da REST API (`aluno.data_nascimento` + `responsavel.data_nascimento`), então o bug é nosso — estamos lendo o campo errado e precisamos mudar o código.

Se o webhook envia `data_nascimento_aluno` como campo flat, então em algum momento o Emusys está colocando a data do responsável nesse campo — e aí o bug é do lado de vocês.

Conseguindo nos mandar um **exemplo de payload real do webhook** (um print de um POST recebido), a gente descobre de que lado está o problema.

---

## Outro ponto: `aluno_id` não vem no webhook para 171 alunos

Verificamos também que **171 alunos ativos** estão com `emusys_student_id = null` no nosso banco, mas a REST API tem o `aluno.id` preenchido para todos eles. Exemplos confirmados hoje:

| Aluno | REST API `aluno.id` | Nosso `emusys_student_id` |
|---|---|---|
| Beatriz von Glehn (10 anos, Barra) | 1211 | null |
| Samuel Muniz (13 anos, CG) | 3593 | null |
| Luna Balbi (7 anos, Recreio) | 2178 | null |

O webhook não está enviando `aluno_id` para esses cadastros. A REST API tem o ID. Isso impede o cruzamento de dados pelo `emusys_student_id`.

---

## O que já corrigimos

- Migration `20260803204642` corrigiu as 11 datas divergentes, puxando da REST API. Zero divergência restante.
- Cada linha guarda o valor antigo explícito (reversível).

## O que precisamos de você

1. Um **exemplo de payload real do webhook** (print de um POST de `matricula_nova` ou `matricula_alterada`) — para ver se a estrutura é flat ou aninhada.
2. Confirmar se o webhook envia `aluno_id` para crianças, ou se só envia para adultos.
