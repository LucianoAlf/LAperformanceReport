# 🗄️ INTEGRAÇÃO BANCO DE DADOS - RELATÓRIOS ADMINISTRATIVOS

## 📋 Status Atual da Integração

### ✅ **O que JÁ EXISTE no banco:**

1. **Tabela `movimentacoes_admin`** ✅
   - Campos: id, unidade_id, data, tipo, aluno_nome, professor_id, curso_id
   - Campos: valor_parcela_anterior, valor_parcela_novo, forma_pagamento_id
   - Campos: mes_saida, tipo_evasao, motivo, observacoes, agente_comercial
   - Campos: tempo_permanencia_meses, valor_parcela_evasao, previsao_retorno

2. **Tabela `unidades`** ✅
   - Campos básicos: id, codigo, nome, ativo, created_at, updated_at
   - Campo: horario_funcionamento (JSONB)

3. **View `vw_kpis_gestao_mensal`** ✅
   - Fornece: alunos_ativos, alunos_pagantes, bolsistas, ticket_medio, faturamento, churn_rate, ltv_meses

### ❌ **O que FALTA adicionar:**

1. **Tabela `unidades`** - Campos novos:
   - `hunter_nome` VARCHAR(100) - Nome do Hunter (relatórios comerciais)
   - `farmers_nomes` TEXT[] - Array com nomes dos Farmers (relatórios administrativos)

2. **Cálculos dinâmicos necessários:**
   - `matriculas_ativas` - Total de matrículas ativas (não alunos)
   - `matriculas_banda` - Matrículas em banda
   - `matriculas_2_curso` - Matrículas de segundo curso

---

## 🔧 MIGRAÇÃO CRIADA

**Arquivo:** `20260126_add_farmers_e_matriculas_campos.sql`

**O que faz:**
1. Adiciona `hunter_nome` na tabela `unidades`
2. Adiciona `farmers_nomes` (array) na tabela `unidades`
3. Popula dados iniciais para as 3 unidades (Recreio, Campo Grande, Barra)

**Como aplicar:**
```bash
# Aplicar via Supabase MCP
supabase db push
```

---

## 📊 COMO OS DADOS DEVEM SER CALCULADOS

### 1. **Matrículas Ativas**
```sql
-- Contar total de matrículas ativas (não alunos)
SELECT COUNT(*) as matriculas_ativas
FROM alunos
WHERE status = 'ativo';

-- OU se houver tabela matriculas separada:
SELECT COUNT(*) as matriculas_ativas
FROM matriculas
WHERE ativa = true;
```

### 2. **Matrículas em Banda**
```sql
-- Contar alunos que tocam em banda
SELECT COUNT(*) as matriculas_banda
FROM alunos
WHERE status = 'ativo' 
  AND toca_banda = true;

-- OU verificar por curso específico:
SELECT COUNT(*) as matriculas_banda
FROM alunos a
JOIN cursos c ON a.curso_id = c.id
WHERE a.status = 'ativo' 
  AND c.nome ILIKE '%banda%';
```

### 3. **Matrículas de 2º Curso**
```sql
-- Contar alunos com mais de uma matrícula ativa
SELECT COUNT(DISTINCT aluno_id) as matriculas_2_curso
FROM (
  SELECT aluno_id, COUNT(*) as total_matriculas
  FROM alunos
  WHERE status = 'ativo'
  GROUP BY aluno_id
  HAVING COUNT(*) > 1
) sub;
```

### 4. **Buscar Farmers da Unidade**
```sql
-- Buscar farmers de uma unidade específica
SELECT 
  nome,
  farmers_nomes,
  hunter_nome
FROM unidades
WHERE id = 'uuid-da-unidade';

-- Resultado esperado:
-- nome: "Recreio"
-- farmers_nomes: ["Fernanda", "Dayana"]
-- hunter_nome: "Clayton"
```

---

## 🔄 ATUALIZAÇÃO DO CÓDIGO FRONTEND

### **AdministrativoPage.tsx - Função `carregarDados()`**

**ANTES (linha ~258):**
```typescript
matriculas_ativas: kpis.alunos_ativos || 0, // ❌ ERRADO - usa alunos ao invés de matrículas
```

**DEPOIS (deve buscar do banco):**
```typescript
// Buscar matrículas ativas do banco
const { data: matriculasData } = await supabase
  .from('alunos')
  .select('id, toca_banda')
  .eq('status', 'ativo')
  .eq('unidade_id', unidadeId);

const matriculasAtivas = matriculasData?.length || 0;
const matriculasBanda = matriculasData?.filter(a => a.toca_banda).length || 0;

// Contar alunos com 2º curso
const { data: segundoCursoData } = await supabase
  .from('alunos')
  .select('aluno_id')
  .eq('status', 'ativo')
  .eq('unidade_id', unidadeId);

const alunosComSegundoCurso = segundoCursoData
  ? Object.values(
      segundoCursoData.reduce((acc, curr) => {
        acc[curr.aluno_id] = (acc[curr.aluno_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).filter(count => count > 1).length
  : 0;

// Atualizar resumo
setResumo({
  ...resumoCalculado,
  matriculas_ativas: matriculasAtivas,
  matriculas_banda: matriculasBanda,
  matriculas_2_curso: alunosComSegundoCurso,
});
```

---

## 📝 CHECKLIST DE INTEGRAÇÃO

### **Passo 1: Aplicar Migração** ✅
- [x] Criar arquivo de migração
- [ ] Aplicar migração no Supabase
- [ ] Verificar se campos foram criados

### **Passo 2: Popular Dados Iniciais**
- [ ] Atualizar `hunter_nome` para cada unidade
- [ ] Atualizar `farmers_nomes` para cada unidade
- [ ] Validar dados via query SQL

### **Passo 3: Atualizar Código Frontend**
- [ ] Modificar `AdministrativoPage.tsx` para buscar matrículas do banco
- [ ] Modificar `ModalRelatorio.tsx` para buscar farmers_nomes
- [ ] Remover valores hardcoded/mockados

### **Passo 4: Testar Integração**
- [ ] Testar relatório diário com dados reais
- [ ] Verificar se farmers aparecem corretamente
- [ ] Verificar se matrículas são calculadas corretamente
- [ ] Testar com diferentes unidades

---

## 🚨 IMPORTANTE

**Os dados DEVEM vir do banco de dados, NÃO podem ser hardcoded no frontend!**

Todos os valores mostrados nos relatórios devem ser:
1. ✅ Buscados via queries SQL do Supabase
2. ✅ Calculados dinamicamente baseado em dados reais
3. ✅ Atualizados automaticamente quando houver mudanças no banco

**Próximos passos:**
1. Aplicar a migração criada
2. Atualizar o código do `AdministrativoPage.tsx` para buscar matrículas corretamente
3. Atualizar o código do `ModalRelatorio.tsx` para buscar farmers_nomes
4. Testar tudo com dados reais

---

## 📞 CONTATO COM BANCO

**Estrutura esperada da tabela `alunos`:**
```sql
-- Verificar se estes campos existem:
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'alunos'
  AND column_name IN ('status', 'toca_banda', 'aluno_id', 'unidade_id');
```

**Se campos não existirem, precisamos:**
1. Verificar estrutura real da tabela `alunos`
2. Adaptar queries para usar campos corretos
3. Criar campos faltantes se necessário
