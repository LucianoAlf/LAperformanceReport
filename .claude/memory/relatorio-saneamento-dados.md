# Relatório de Saneamento de Dados — LA Performance Report

## Data: 2026-06-06
## Status: SELECT-only, aguardando aprovação para UPDATEs
## Patch de view/frontend: FECHADO ✅

---

## Resumo Executivo

Após correção do bug do ticket médio (por pessoa) e do frontend (preservar bolsista ao criar 2º curso), identificamos **13 registros de passaporte** (`sem_parcela`) com `conta_como_pagante = true` no banco. A view os exclui corretamente, mas os dados estão sujos.

O caso **Pedro Faria Frazão de Souza/Recreio** (banda marcada como 2º curso) **já foi corrigido**.

Nenhuma outra banda está com `is_segundo_curso = true`.

---

## Item 1: Passaportes com conta_como_pagante = true

### Análise

Registros de alunos com `status_pagamento = 'sem_parcela'` (passaporte) mas marcados como `conta_como_pagante = true`. A view os exclui corretamente do MRR via filtro `status_pagamento <> 'sem_parcela'`, mas o cadastro está inconsistente.

### Lista completa (13 registros)

#### Campo Grande (5 registros)

| # | Aluno | Curso | Matrícula | Valor | Data Matrícula |
|---|-------|-------|-----------|-------|----------------|
| 1 | João Miguel da Cunha Alves Ferreira | Violino | 191 | R$ 399,00 | 2020-11-27 |
| 2 | Laura Andrade da Silveira | Teclado | 220 | R$ 347,00 | 2024-02-06 |
| 3 | Manuela Lourenço Ribeiro | Teclado | 269 | R$ 347,00 | 2025-05-22 |
| 4 | Olavo Pereira Wood | Bateria | 337 | R$ 337,00 | 2024-09-28 |
| 5 | Priscila Amaro da Silva | Contrabaixo | 358 | R$ 347,00 | 2023-01-25 |

#### Recreio (8 registros)

| # | Aluno | Curso | Matrícula | Valor | Data Matrícula |
|---|-------|-------|-----------|-------|----------------|
| 1 | Agatha Sampaio Mendes dos Santos | Canto | 422 | R$ 423,50 | 2025-03-31 |
| 2 | Beatriz Souto Machado | Teclado | 445 | R$ 445,50 | 2018-06-23 |
| 3 | Bento Vieira Sindeaux | Musicalização Infantil | 450 | R$ 460,00 | 2025-04-05 |
| 4 | Davi do nascimento alexandre da gama mello | Musicalização Preparatória | 483 | R$ 459,00 | 2024-03-16 |
| 5 | Giane Apoliana Albino de Oliveira | Teclado | 1723 | R$ 357,00 | 2026-05-28 |
| 6 | Isabela Ferreira Moura | Canto | 549 | R$ 365,15 | 2023-12-09 |
| 7 | Luciana Lima de Moura | Canto | 1676 | R$ 385,00 | 2026-05-09 |
| 8 | Sofia Lima de Castro | Canto | 684 | R$ 385,00 | 2024-04-11 |

### Impacto

| Unidade | Passaportes com conta_como_pagante | Valor Total | Impacto no MRR se a view não excluísse |
|---------|-----------------------------------|-------------|----------------------------------------|
| Campo Grande | 5 | R$ 1.777,00 | +R$ 1.777,00 |
| Recreio | 8 | R$ 3.280,15 | +R$ 3.280,15 |
| **Total** | **13** | **R$ 5.057,15** | **+R$ 5.057,15** |

### Correção proposta

```sql
-- Opção A: Mudar tipo_matricula para NÃO PAGANTE (mais seguro)
UPDATE alunos
SET tipo_matricula_id = (
  SELECT id FROM tipos_matricula WHERE codigo = 'NAO_PAGANTE'
)
WHERE status_pagamento = 'sem_parcela'
  AND tipo_matricula_id = 1  -- Regular
  AND status = 'ativo';

-- Opção B: Apenas ajustar conta_como_pagante (se o tipo NÃO PAGANTE não existir)
-- Não recomendado — tipo_matricula e tipo_aluno devem estar alinhados
```

**Nota:** A view atual já exclui corretamente (`status_pagamento <> 'sem_parcela'`). Correção é para alinhamento conceitual dos dados, não para mudar o MRR.

---

## Item 2: Banda marcada como segundo curso

### Status

**Já corrigido** a pedido do Alfredo em 2026-06-06.

### Caso

| Aluno | Unidade | Curso | Antes | Depois |
|-------|---------|-------|-------|--------|
| Pedro Faria Frazão de Souza | Recreio | Power Kids | tipo=2 (Segundo Curso), is_segundo_curso=true | **tipo=5 (Banda), is_segundo_curso=false** |

### Verificação pós-correção

```sql
SELECT id, nome, curso, tipo_matricula_id, is_segundo_curso, is_projeto_banda
FROM alunos WHERE nome = 'Pedro Faria Frazão de Souza';
```

**Resultado:**
- Teclado (id 662): tipo=1 (Regular), is_segundo_curso=false ✅
- Power Kids (id 1741): tipo=5 (Banda), is_segundo_curso=false, is_projeto_banda=true ✅

### Verificação de outros casos

```sql
SELECT * FROM alunos a
LEFT JOIN cursos c ON c.id = a.curso_id
WHERE a.status = 'ativo'
  AND c.is_projeto_banda = true
  AND a.is_segundo_curso = true;
```

**Resultado:** Empty set (zero casos restantes) ✅

---

## Recomendação

1. **Patch de view/frontend:** Fechado, não requer mais ação.
2. **Saneamento de dados:** Aprovar e executar Item 1 (13 passaportes) se desejado para alinhamento conceitual. Item 2 já está resolvido.

---

## SQLs usados na validação

```sql
-- Listar passaportes com conta_como_pagante = true
SELECT u.nome AS unidade, a.nome AS aluno, c.nome AS curso,
       a.id AS matricula_id, a.valor_parcela, a.status_pagamento,
       tm.nome AS tipo_matricula, a.data_matricula
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN unidades u ON u.id = a.unidade_id
WHERE a.status = 'ativo'
  AND a.status_pagamento = 'sem_parcela'
  AND tm.conta_como_pagante = true
ORDER BY u.nome, a.nome;

-- Verificar bandas marcadas como segundo curso
SELECT a.id, a.nome, u.nome AS unidade, c.nome AS curso,
       a.tipo_matricula_id, tm.nome AS tipo_matricula,
       a.is_segundo_curso, c.is_projeto_banda
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN unidades u ON u.id = a.unidade_id
WHERE a.status = 'ativo'
  AND c.is_projeto_banda = true
  AND a.is_segundo_curso = true;
```
