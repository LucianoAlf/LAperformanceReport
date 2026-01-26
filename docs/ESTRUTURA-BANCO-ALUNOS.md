# 📊 ESTRUTURA DA TABELA ALUNOS - DESCOBERTA

## ✅ Campos Existentes na Tabela `alunos`

### **Campos Básicos:**
- `id` (SERIAL PRIMARY KEY)
- `nome` (VARCHAR 200)
- `nome_normalizado` (GENERATED - UPPER/TRIM)
- `data_nascimento` (DATE)

### **Campos Calculados (via Trigger):**
- `idade_atual` (INTEGER)
- `classificacao` (VARCHAR 4) - "EMLA" ou "LAMK"
- `tempo_permanencia_meses` (INTEGER)

### **Relacionamentos:**
- `unidade_id` (UUID) - FK para unidades
- `professor_atual_id` (INTEGER) - FK para professores
- `curso_id` (INTEGER) - FK para cursos
- `tipo_matricula_id` (INTEGER) - FK para tipos_matricula

### **Status e Flags:**
- `status` (VARCHAR 20) - 'ativo', 'inativo', 'aviso_previo', 'trancado', 'evadido'
- `is_ex_aluno` (BOOLEAN)
- `is_segundo_curso` (BOOLEAN) ✅ **EXISTE!**

### **Valores:**
- `valor_parcela` (DECIMAL 10,2)
- `valor_passaporte` (DECIMAL 10,2)

---

## 🎯 COMO CALCULAR OS CAMPOS NECESSÁRIOS

### 1. **Matrículas Ativas**
```sql
-- Contar total de alunos ativos (cada aluno = 1 matrícula)
SELECT COUNT(*) as matriculas_ativas
FROM alunos
WHERE status = 'ativo'
  AND unidade_id = 'uuid-da-unidade';
```

### 2. **Matrículas em Banda**
```sql
-- Opção 1: Se houver campo específico (PRECISA VERIFICAR)
SELECT COUNT(*) as matriculas_banda
FROM alunos
WHERE status = 'ativo'
  AND unidade_id = 'uuid-da-unidade'
  AND toca_banda = true; -- ❓ CAMPO NÃO ENCONTRADO

-- Opção 2: Verificar por curso com nome "banda"
SELECT COUNT(*) as matriculas_banda
FROM alunos a
JOIN cursos c ON a.curso_id = c.id
WHERE a.status = 'ativo'
  AND a.unidade_id = 'uuid-da-unidade'
  AND c.nome ILIKE '%banda%';
```

### 3. **Matrículas de 2º Curso** ✅
```sql
-- Usar flag is_segundo_curso que JÁ EXISTE!
SELECT COUNT(*) as matriculas_2_curso
FROM alunos
WHERE status = 'ativo'
  AND unidade_id = 'uuid-da-unidade'
  AND is_segundo_curso = true;
```

---

## 🚨 CAMPOS QUE FALTAM

### **Campo `toca_banda`**
**Status:** ❌ NÃO ENCONTRADO na estrutura atual

**Opções:**
1. **Adicionar campo na tabela alunos:**
   ```sql
   ALTER TABLE alunos
   ADD COLUMN toca_banda BOOLEAN DEFAULT false;
   ```

2. **OU identificar por curso:**
   - Verificar se existe curso com nome "Banda" ou similar
   - Contar alunos matriculados nesse curso

**Recomendação:** Usar Opção 2 (identificar por curso) por enquanto, pois é menos invasivo.

---

## 📝 QUERIES PRONTAS PARA USAR

### **Query Completa para Resumo Administrativo:**
```sql
SELECT 
  -- Alunos
  COUNT(*) FILTER (WHERE status = 'ativo') as alunos_ativos,
  COUNT(*) FILTER (WHERE status = 'ativo' AND tm.conta_como_pagante = true) as alunos_pagantes,
  COUNT(*) FILTER (WHERE status = 'ativo' AND tm.conta_como_pagante = false) as alunos_nao_pagantes,
  COUNT(*) FILTER (WHERE status = 'trancado') as alunos_trancados,
  COUNT(*) FILTER (WHERE status = 'ativo' AND tm.codigo = 'bolsista_integral') as bolsistas_integrais,
  COUNT(*) FILTER (WHERE status = 'ativo' AND tm.codigo = 'bolsista_parcial') as bolsistas_parciais,
  
  -- Matrículas
  COUNT(*) FILTER (WHERE status = 'ativo') as matriculas_ativas,
  COUNT(*) FILTER (WHERE status = 'ativo' AND c.nome ILIKE '%banda%') as matriculas_banda,
  COUNT(*) FILTER (WHERE status = 'ativo' AND is_segundo_curso = true) as matriculas_2_curso,
  
  -- Valores
  ROUND(AVG(valor_parcela) FILTER (WHERE status = 'ativo' AND tm.entra_ticket_medio = true), 2) as ticket_medio,
  ROUND(AVG(tempo_permanencia_meses), 1) as ltv_meses
  
FROM alunos a
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.unidade_id = 'uuid-da-unidade'
  AND EXTRACT(YEAR FROM a.data_matricula) = 2026
  AND EXTRACT(MONTH FROM a.data_matricula) = 1;
```

---

## ✅ PRÓXIMOS PASSOS

1. **Aplicar migração de farmers/hunter** ✅ Criada
2. **Verificar se existe curso "Banda"** ⏳ Pendente
3. **Atualizar código do AdministrativoPage.tsx** ⏳ Pendente
4. **Testar queries no banco real** ⏳ Pendente

---

## 🔍 VERIFICAÇÕES NECESSÁRIAS

Execute estas queries no banco para confirmar:

```sql
-- 1. Verificar cursos disponíveis
SELECT id, nome FROM cursos WHERE ativo = true ORDER BY nome;

-- 2. Verificar tipos de matrícula
SELECT id, nome, codigo, conta_como_pagante, entra_ticket_medio 
FROM tipos_matricula 
WHERE ativo = true;

-- 3. Testar query de matrículas banda
SELECT COUNT(*) as total_banda
FROM alunos a
JOIN cursos c ON a.curso_id = c.id
WHERE a.status = 'ativo'
  AND c.nome ILIKE '%banda%';

-- 4. Verificar alunos com 2º curso
SELECT COUNT(*) as total_segundo_curso
FROM alunos
WHERE status = 'ativo'
  AND is_segundo_curso = true;
```
