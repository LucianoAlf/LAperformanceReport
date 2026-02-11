# Plano: Vincular Professores no N8N

## ✅ Confirmação: O Professor VEM no Webhook

Analisando a execução 290662, confirmei que o webhook **ENVIA** os dados do professor:

```json
{
  "disciplinas": [{
    "id_professor": 32,
    "nome_professor": "Renan Amorim Guimarães",
    "email_professor": "rudes257@gmail.com",
    "telefone_professor": "(21) 96573-6779"
  }]
}
```

## ❌ Problema Atual

O nó **"info base3"** NÃO está mapeando os dados do professor. Ele apenas extrai:
- ✅ `curso_id` (linha 138)
- ❌ `id_professor` **NÃO está sendo extraído**
- ❌ `nome_professor` **NÃO está sendo extraído**

Por isso, quando o aluno é inserido, os campos `professor_atual_id` e `professor_experimental_id` ficam NULL.

---

## 🎯 Plano de Alteração no N8N

### **Passo 1: Atualizar o nó "info base3"**

**Localização:** Workflow `ZzuR9slRx8UqXg9N`, nó `info base3` (ID: `e3c3528b-6286-44ea-82d5-5dbd1f017cd4`)

**O que fazer:**
Adicionar 2 novos campos no mapeamento de `assignments`:

```javascript
{
  "id": "professor-id",
  "name": "aluno.professor_id",
  "value": "={{ $json.body.matricula.disciplinas[0].id_professor }}",
  "type": "number"
},
{
  "id": "professor-nome",
  "name": "aluno.professor_nome",
  "value": "={{ $json.body.matricula.disciplinas[0].nome_professor }}",
  "type": "string"
}
```

**Resultado esperado:**
O output do nó `info base3` passará a ter:
```json
{
  "aluno": {
    "curso_id": 16,
    "professor_id": 32,
    "professor_nome": "Renan Amorim Guimarães"
  }
}
```

---

### **Passo 2: Criar nó "Buscar Professor no Banco"**

**Localização:** Entre `info base3` e `Check Existencia3`

**Tipo de nó:** `n8n-nodes-base.postgres`

**Configuração:**
- **Operation:** Execute Query
- **Query:**
```sql
SELECT id FROM public.professores 
WHERE unaccent(lower(trim(nome))) = unaccent(lower(trim($1)))
LIMIT 1;
```
- **Query Replacement:**
```javascript
={{ [$('info base3').item.json.aluno.professor_nome] }}
```

**Credenciais:** `LA Performance Report Creds` (ID: `4oVVstGl3KixyKpd`)

**Resultado esperado:**
Retorna o `id` do professor encontrado na base, ou vazio se não encontrar.

---

### **Passo 3: Atualizar nó "Inserir Aluno no Supabase3"**

**Localização:** Nó `Inserir Aluno no Supabase3` (ID: `72d6ac78-7991-4246-8d7f-0c99e3901784`)

**O que fazer:**
Modificar a query SQL para incluir os campos de professor:

**Query atual:**
```sql
INSERT INTO public.alunos (
  nome, unidade_id, status, telefone, email, data_matricula,
  valor_parcela, tipo_aluno, data_nascimento, idade_atual,
  classificacao, data_inicio_contrato, data_fim_contrato,
  dia_aula, horario_aula, curso_id, created_at, updated_at
)
VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
)
returning id;
```

**Query NOVA:**
```sql
INSERT INTO public.alunos (
  nome, unidade_id, status, telefone, email, data_matricula,
  valor_parcela, tipo_aluno, data_nascimento, idade_atual,
  classificacao, data_inicio_contrato, data_fim_contrato,
  dia_aula, horario_aula, curso_id, 
  professor_atual_id, professor_experimental_id,
  created_at, updated_at
)
VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
)
returning id;
```

**Query Replacement NOVO:**
```javascript
={{ [
  $('info base3').item.json.aluno.nome_aluno,
  $('info base3').item.json.unidade_uuid || ( $('info base3').item.json.aluno.unidade === 'Recreio' ? '95553e96-971b-4590-a6eb-0201d013c14d' : ($('info base3').item.json.aluno.unidade === 'Barra' ? '368d47f5-2d88-4475-bc14-ba084a9a348e' : '2ec861f6-023f-4d7b-9927-3960ad8c2a92') ),
  'ativo', 
  $('info base3').item.json.aluno.telefone_aluno || $('info base3').item.json.responsavel.telefone_responsavel,
  $('info base3').item.json.aluno.email_aluno || $('info base3').item.json.responsavel.email_responsavel,
  $('info base3').item.json.aluno.data_matricula,
  $('info base3').item.json.aluno.valor_mensalidade || 0,
  'pagante',
  $('info base3').item.json.aluno.data_nascimento,
  $('info base3').item.json.aluno.idade,
  $('info base3').item.json.aluno.classificacao,
  $('info base3').item.json.aluno.data_inicio_contrato,
  $('info base3').item.json.aluno.data_fim_contrato,
  $('info base3').item.json.aluno.dia_aula,
  $('info base3').item.json.aluno.horario_aula,
  $('info base3').item.json.aluno.curso_id,
  $('Buscar Professor no Banco').item.json.id || null,  // ← NOVO: professor_atual_id
  $('Buscar Professor no Banco').item.json.id || null   // ← NOVO: professor_experimental_id
] }}
```

---

### **Passo 4: Atualizar nó "Atualizar Aluno Existente3"**

**Localização:** Nó `Atualizar Aluno Existente3` (ID: `ebd8d9bc-84d6-4648-b533-d1af50b6cead`)

**Query atual:**
```sql
UPDATE public.alunos
SET 
  status = 'ativo',
  telefone = $3,
  email = $4,
  data_nascimento = $5,
  idade_atual = $6,
  classificacao = $7,
  data_matricula = $8,
  data_inicio_contrato = $9,
  dia_aula = $10,
  horario_aula = $11,
  curso_id = $12,
  updated_at = NOW()
WHERE 
  nome = $1 AND
  unidade_id = $2;
```

**Query NOVA:**
```sql
UPDATE public.alunos
SET 
  status = 'ativo',
  telefone = $3,
  email = $4,
  data_nascimento = $5,
  idade_atual = $6,
  classificacao = $7,
  data_matricula = $8,
  data_inicio_contrato = $9,
  dia_aula = $10,
  horario_aula = $11,
  curso_id = $12,
  professor_atual_id = $13,
  professor_experimental_id = $14,
  updated_at = NOW()
WHERE 
  nome = $1 AND
  unidade_id = $2;
```

**Query Replacement NOVO:**
```javascript
={{ [
  $('info base3').item.json.aluno.nome_aluno,
  $('info base3').item.json.unidade_uuid || ( $('info base3').item.json.aluno.unidade === 'Recreio' ? '95553e96-971b-4590-a6eb-0201d013c14d' : ($('info base3').item.json.aluno.unidade === 'Barra' ? '368d47f5-2d88-4475-bc14-ba084a9a348e' : '2ec861f6-023f-4d7b-9927-3960ad8c2a92') ),
  $('info base3').item.json.aluno.telefone_aluno || $('info base3').item.json.responsavel.telefone_responsavel,
  $('info base3').item.json.aluno.email_aluno || $('info base3').item.json.responsavel.email_responsavel,
  $('info base3').item.json.aluno.data_nascimento,
  $('info base3').item.json.aluno.idade,
  $('info base3').item.json.aluno.classificacao,
  $('info base3').item.json.aluno.data_matricula,
  $('info base3').item.json.aluno.data_inicio_contrato,
  $('info base3').item.json.aluno.dia_aula,
  $('info base3').item.json.aluno.horario_aula,
  $('info base3').item.json.aluno.curso_id,
  $('Buscar Professor no Banco').item.json.id || null,  // ← NOVO
  $('Buscar Professor no Banco').item.json.id || null   // ← NOVO
] }}
```

---

## 📊 Resumo das Alterações

| Nó | Ação | Campos Adicionados |
|----|------|-------------------|
| **info base3** | Modificar | `aluno.professor_id`, `aluno.professor_nome` |
| **Buscar Professor no Banco** | Criar NOVO | - |
| **Inserir Aluno no Supabase3** | Modificar | `professor_atual_id`, `professor_experimental_id` |
| **Atualizar Aluno Existente3** | Modificar | `professor_atual_id`, `professor_experimental_id` |

---

## ✅ **Atualização: Nomes dos Professores Corrigidos**

**Data:** 2026-02-10

Os nomes dos professores no Supabase foram atualizados para corresponder aos nomes completos do Emusys:
- ✅ **Renam Amorim** → **Renan Amorim Guimarães** (ID 34)

Agora o matching por nome funcionará perfeitamente!

## ⚠️ Observações Importantes

1. **Nome do Professor:** O webhook envia "Renan Amorim Guimarães" e agora o banco também tem "Renan Amorim Guimarães". ✅ **Match perfeito!**

2. **Query de Busca:** A query usa `unaccent()` e `lower()` para ignorar diferenças de acentuação e maiúsculas, garantindo matching robusto.

3. **Fallback:** Se o professor não for encontrado, o campo ficará `NULL` (não vai quebrar a inserção).

4. **Professor Atual vs Experimental:** Estou usando o mesmo ID para ambos os campos. Se precisar diferenciar, será necessário lógica adicional.

5. **Conexões do Workflow:** O novo nó "Buscar Professor no Banco" deve ser inserido entre `adicionar no dash do rayan` e `Check Existencia3`.

---

## 🔧 Próximos Passos

Após implementar essas alterações no N8N:

1. Testar com uma nova matrícula
2. Verificar se o `professor_atual_id` está sendo preenchido
3. Se necessário, criar script de correção retroativa para os 948 alunos sem professor
