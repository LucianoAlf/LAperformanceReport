# Guia de Implementação N8N - Vincular Professores

## 🎯 Objetivo
Implementar o vínculo de professores nos alunos criados via webhook.

---

## 📋 Passo 1: Modificar nó "info base3"

### **Localização:**
Workflow: `ZzuR9slRx8UqXg9N`  
Nó: `info base3`

### **O que fazer:**
Adicionar 1 novo campo no mapeamento de `assignments` para extrair o nome do professor.

### **JSON para adicionar:**

Abra o nó `info base3` e adicione este assignment na lista:

```json
{
  "id": "professor-nome",
  "name": "aluno.professor_nome",
  "value": "={{ $json.body.matricula.disciplinas[0].nome_professor }}",
  "type": "string"
}
```

### **Resultado esperado:**
O output do nó `info base3` terá:
```json
{
  "aluno": {
    "curso_id": 16,
    "professor_nome": "Renan Amorim Guimarães"
  }
}
```

---

## 📋 Passo 2: Criar nó "Buscar Professor no Banco"

### **Localização:**
Entre o nó `adicionar no dash do rayan` e `Check Existencia3`

### **Configuração Completa:**

**Tipo de nó:** `Postgres` (n8n-nodes-base.postgres)

**Configurações:**
- **Operation:** Execute Query
- **Credentials:** `LA Performance Report Creds` (ID: 4oVVstGl3KixyKpd)
- **Always Output Data:** ✅ Ativado (importante!)

**Query:**
```sql
SELECT id FROM public.professores 
WHERE unaccent(lower(trim(nome))) = unaccent(lower(trim($1)))
LIMIT 1;
```

**Query Replacement:**
```javascript
={{ [$('info base3').item.json.aluno.professor_nome] }}
```

### **JSON Completo do Nó:**

```json
{
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT id FROM public.professores \nWHERE unaccent(lower(trim(nome))) = unaccent(lower(trim($1)))\nLIMIT 1;",
    "options": {
      "queryReplacement": "={{ [$('info base3').item.json.aluno.professor_nome] }}"
    }
  },
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.4,
  "position": [920, 1552],
  "id": "buscar-professor-banco",
  "name": "Buscar Professor no Banco",
  "alwaysOutputData": true,
  "credentials": {
    "postgres": {
      "id": "4oVVstGl3KixyKpd",
      "name": "LA Performance Report Creds"
    }
  }
}
```

### **Conexões:**
- **Input:** `adicionar no dash do rayan`
- **Output:** `Check Existencia3`

---

## 📋 Passo 3: Modificar nó "Inserir Aluno no Supabase3"

### **Localização:**
Nó: `Inserir Aluno no Supabase3` (ID: 72d6ac78-7991-4246-8d7f-0c99e3901784)

### **Query NOVA (substituir completamente):**

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
RETURNING id;
```

### **Query Replacement NOVO:**

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
  $('Buscar Professor no Banco').item.json.id || null,
  $('Buscar Professor no Banco').item.json.id || null
] }}
```

---

## 📋 Passo 4: Modificar nó "Atualizar Aluno Existente3"

### **Localização:**
Nó: `Atualizar Aluno Existente3` (ID: ebd8d9bc-84d6-4648-b533-d1af50b6cead)

### **Query NOVA (substituir completamente):**

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

### **Query Replacement NOVO:**

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
  $('Buscar Professor no Banco').item.json.id || null,
  $('Buscar Professor no Banco').item.json.id || null
] }}
```

---

## ✅ Checklist de Implementação

- [ ] **Passo 1:** Modificar nó "info base3" - Adicionar campo `professor_nome`
- [ ] **Passo 2:** Criar nó "Buscar Professor no Banco"
- [ ] **Passo 3:** Conectar nó "Buscar Professor no Banco" entre `adicionar no dash do rayan` e `Check Existencia3`
- [ ] **Passo 4:** Modificar query do nó "Inserir Aluno no Supabase3"
- [ ] **Passo 5:** Modificar query do nó "Atualizar Aluno Existente3"
- [ ] **Passo 6:** Salvar workflow
- [ ] **Passo 7:** Testar com uma nova matrícula

---

## 🧪 Como Testar

1. **Fazer uma nova matrícula no Emusys**
2. **Verificar execução no N8N:**
   - O nó "Buscar Professor no Banco" deve retornar um `id`
   - O nó "Inserir Aluno" deve executar com sucesso
3. **Verificar no Supabase:**
   ```sql
   SELECT id, nome, professor_atual_id, professor_experimental_id 
   FROM alunos 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```
   - Os campos `professor_atual_id` e `professor_experimental_id` devem estar preenchidos

---

## ⚠️ Troubleshooting

### **Problema:** Nó "Buscar Professor no Banco" retorna vazio
**Solução:** Verificar se o nome do professor no webhook corresponde exatamente ao nome no banco.

### **Problema:** Erro "column does not exist"
**Solução:** Verificar se a query SQL está correta e se os campos existem na tabela `alunos`.

### **Problema:** Erro "cannot reference node"
**Solução:** Verificar se o nome do nó está correto (case-sensitive) e se o nó está conectado corretamente.

---

## 📚 Referências

- [Documentação N8N - Postgres Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/)
- [Documentação PostgreSQL - unaccent](https://www.postgresql.org/docs/current/unaccent.html)
