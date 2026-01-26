# 🚀 APLICAR MIGRAÇÃO MANUALMENTE

## Passo a Passo para Aplicar no Supabase Dashboard

### 1. Acesse o Supabase Dashboard
- URL: https://supabase.com/dashboard/project/kzomrglafxhqkzuqtjmh
- Vá em **SQL Editor**

### 2. Execute o SQL abaixo:

```sql
-- ============================================================================
-- MIGRAÇÃO: Adicionar campos para Farmers e Matrículas Detalhadas
-- Data: 26/01/2026
-- ============================================================================

-- 1. ADICIONAR CAMPOS NA TABELA UNIDADES
ALTER TABLE unidades
ADD COLUMN IF NOT EXISTS hunter_nome VARCHAR(100);

ALTER TABLE unidades
ADD COLUMN IF NOT EXISTS farmers_nomes TEXT[];

-- Comentários
COMMENT ON COLUMN unidades.hunter_nome IS 'Nome do Hunter responsável pela unidade';
COMMENT ON COLUMN unidades.farmers_nomes IS 'Array com nomes dos Farmers responsáveis pela retenção';

-- 2. POPULAR DADOS DAS UNIDADES

-- Campo Grande
UPDATE unidades 
SET hunter_nome = 'Vitória',
    farmers_nomes = ARRAY['Gabriela', 'Jhonatan']
WHERE codigo = 'CG';

-- Recreio
UPDATE unidades 
SET hunter_nome = 'Clayton',
    farmers_nomes = ARRAY['Fernanda', 'Daiana']
WHERE codigo = 'REC';

-- Barra
UPDATE unidades 
SET hunter_nome = 'Kailane',
    farmers_nomes = ARRAY['Eduarda', 'Arthur']
WHERE codigo = 'BAR';

-- 3. VERIFICAR SE FUNCIONOU
SELECT id, codigo, nome, hunter_nome, farmers_nomes FROM unidades;
```

### 3. Verificar Resultado

Após executar, você deve ver:

| codigo | nome | hunter_nome | farmers_nomes |
|--------|------|-------------|---------------|
| CG | Campo Grande | Vitória | {Gabriela,Jhonatan} |
| REC | Recreio | Clayton | {Fernanda,Daiana} |
| BAR | Barra | Kailane | {Eduarda,Arthur} |

---

## ✅ Checklist Pós-Migração

- [ ] Campos `hunter_nome` e `farmers_nomes` criados na tabela `unidades`
- [ ] Dados populados para as 3 unidades
- [ ] Testar relatório diário administrativo
- [ ] Verificar se farmers aparecem corretamente

---

## 🔧 Caso Precise Reverter

```sql
-- Remover campos (se necessário)
ALTER TABLE unidades DROP COLUMN IF EXISTS hunter_nome;
ALTER TABLE unidades DROP COLUMN IF EXISTS farmers_nomes;
```
