# Plano de Migração: Unificar `leads_diarios` → `leads`

**Objetivo**: Eliminar a tabela `leads_diarios`, mantendo apenas `leads` como fonte única de verdade para o funil comercial.

**Princípio**: Zero triggers de sincronização entre tabelas. Zero redundância de dados.

---

## Estado Atual

### Dados

| Tabela | Registros | Período | Origem dos dados |
|--------|-----------|---------|-----------------|
| `leads` | 131 | fev/2026 (5 dias) | Frontend (branch refactor) |
| `leads_diarios` | 100 | jan/2023 + fev/2026 | Frontend (main) + trigger de alunos |
| `dados_comerciais` | 43 | jan/2023 a fev/2026 | **Importação manual de planilha** (2023-2025) + triggers (2026) |
| `origem_leads` | 533 | jan/2025 a fev/2026 | Triggers de leads_diarios |
| `experimentais_professor_mensal` | 284 | 2025-2026 | Triggers de leads_diarios |
| `experimentais_mensal_unidade` | 40 | 2023-2026 | Triggers de leads_diarios |

### Descoberta Crítica

`dados_comerciais` contém **42 registros de jan/2023 a dez/2025** que foram **importados de planilha** — NÃO vieram de `leads_diarios` (que só tem 1 registro de 2023). Esses dados históricos são valiosos e **não podem ser recalculados** de `leads`.

**Decisão**: `dados_comerciais` deve ser mantida como tabela (não pode virar view). As demais tabelas auxiliares (`origem_leads`, `experimentais_professor_mensal`, `experimentais_mensal_unidade`) podem virar views de `leads` pois seus dados começam em 2025 e podem ser recalculados.

---

## Fases da Migração

### FASE 1 — Adicionar colunas faltantes em `leads`

Colunas que existem em `leads_diarios` mas não em `leads`:

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS valor_passaporte NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS valor_parcela NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS forma_pagamento_id INTEGER REFERENCES formas_pagamento(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS forma_pagamento_passaporte_id INTEGER REFERENCES formas_pagamento(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS professor_fixo_id INTEGER REFERENCES professores(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tipo_matricula VARCHAR;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tipo_aluno VARCHAR DEFAULT 'pagante';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS aluno_novo_retorno VARCHAR;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sabia_preco BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_arquivamento_id INTEGER REFERENCES motivos_arquivamento(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_nao_matricula_id INTEGER REFERENCES motivos_nao_matricula(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_arquivamento DATE;
```

**Mapeamento de campos equivalentes** (já existem em `leads` com nome diferente):
- `leads_diarios.aluno_nome` → `leads.nome`
- `leads_diarios.aluno_idade` → `leads.idade`
- `leads_diarios.curso_id` → `leads.curso_interesse_id`
- `leads_diarios.data` → `leads.data_contato`
- `leads_diarios.canal_origem_id` → `leads.canal_origem_id` (mesmo nome)
- `leads_diarios.professor_experimental_id` → `leads.professor_experimental_id` (mesmo nome)
- `leads_diarios.tipo` → Derivável de `leads.status`:
  - status IN ('novo','agendado') → tipo 'lead'
  - status = 'experimental_agendada' → tipo 'experimental_agendada'
  - status IN ('experimental_realizada','compareceu') → tipo 'experimental_realizada'
  - status IN ('matriculado','convertido') → tipo 'matricula'
  - status = 'experimental_faltou' → tipo 'experimental_faltou'

---

### FASE 2 — Migrar dados de `leads_diarios` para `leads`

#### 2a. Atualizar os 85 registros que já existem em `leads` (preencher campos extras)

```sql
UPDATE leads l
SET 
  valor_passaporte = ld.valor_passaporte,
  valor_parcela = ld.valor_parcela,
  forma_pagamento_id = ld.forma_pagamento_id,
  forma_pagamento_passaporte_id = ld.forma_pagamento_passaporte_id,
  professor_fixo_id = ld.professor_fixo_id,
  tipo_matricula = ld.tipo_matricula,
  tipo_aluno = ld.tipo_aluno,
  aluno_novo_retorno = ld.aluno_novo_retorno,
  dia_vencimento = ld.dia_vencimento,
  sabia_preco = ld.sabia_preco,
  motivo_arquivamento_id = ld.motivo_arquivamento_id,
  motivo_nao_matricula_id = ld.motivo_nao_matricula_id
FROM leads_diarios ld
WHERE LOWER(TRIM(l.nome)) = LOWER(TRIM(ld.aluno_nome))
  AND l.unidade_id = ld.unidade_id
  AND l.data_contato = ld.data;
```

#### 2b. Inserir os 15 registros que só existem em `leads_diarios` (matrículas via trigger de alunos)

```sql
INSERT INTO leads (
  unidade_id, data_contato, nome, curso_interesse_id, canal_origem_id,
  professor_experimental_id, professor_fixo_id, valor_passaporte, valor_parcela,
  forma_pagamento_id, tipo_matricula, tipo_aluno, observacoes,
  status, converteu, data_conversao, created_at
)
SELECT 
  ld.unidade_id, ld.data, ld.aluno_nome, ld.curso_id, ld.canal_origem_id,
  ld.professor_experimental_id, ld.professor_fixo_id, ld.valor_passaporte, ld.valor_parcela,
  ld.forma_pagamento_id, ld.tipo_matricula, ld.tipo_aluno, ld.observacoes,
  'convertido', true, ld.data, ld.created_at
FROM leads_diarios ld
LEFT JOIN leads l ON LOWER(TRIM(l.nome)) = LOWER(TRIM(ld.aluno_nome))
  AND l.unidade_id = ld.unidade_id
  AND l.data_contato = ld.data
WHERE l.id IS NULL;
```

---

### FASE 3 — Criar view `vw_leads_diarios` (compatibilidade)

View que simula a estrutura de `leads_diarios` a partir de `leads`, para que views e functions existentes continuem funcionando durante a transição:

```sql
CREATE OR REPLACE VIEW vw_leads_diarios AS
SELECT 
  l.id,
  l.unidade_id,
  l.data_contato AS data,
  CASE 
    WHEN l.status IN ('novo','agendado') THEN 'lead'
    WHEN l.status = 'experimental_agendada' THEN 'experimental_agendada'
    WHEN l.status IN ('experimental_realizada','compareceu') THEN 'experimental_realizada'
    WHEN l.status = 'experimental_faltou' THEN 'experimental_faltou'
    WHEN l.status IN ('matriculado','convertido') THEN 'matricula'
    WHEN l.status = 'arquivado' THEN 'lead'
    ELSE 'lead'
  END AS tipo,
  l.canal_origem_id,
  l.curso_interesse_id AS curso_id,
  COALESCE(l.quantidade, 1) AS quantidade,
  l.observacoes,
  l.nome AS aluno_nome,
  l.idade AS aluno_idade,
  l.professor_experimental_id,
  l.professor_fixo_id,
  l.agente_comercial,
  l.valor_passaporte,
  l.valor_parcela,
  l.forma_pagamento_id,
  l.tipo_matricula,
  l.aluno_novo_retorno,
  l.created_at,
  l.updated_at,
  l.created_by,
  CASE WHEN l.status = 'arquivado' THEN true ELSE false END AS arquivado,
  l.data_arquivamento,
  l.motivo_arquivamento_id,
  l.motivo_nao_matricula_id,
  l.forma_pagamento_passaporte_id,
  l.dia_vencimento,
  l.tipo_aluno,
  l.sabia_preco
FROM leads l;
```

---

### FASE 4 — Reescrever views que leem de `leads_diarios`

As 5 views abaixo precisam trocar `leads_diarios` por `vw_leads_diarios` (ou diretamente por `leads`):

1. **`vw_kpis_gestao_mensal`** — KPIs gerais de gestão
2. **`vw_kpis_comercial_mensal`** — KPIs comerciais mensais
3. **`vw_kpis_professor_mensal`** — KPIs por professor
4. **`vw_kpis_professor_completo`** — Performance completa do professor
5. **`vw_professores_performance_atual`** — Performance atual (matrículas por professor_fixo_id)

**Abordagem**: Substituir `FROM leads_diarios` por `FROM vw_leads_diarios` em cada view. Isso é um find-and-replace simples pois a view de compatibilidade expõe os mesmos campos.

---

### FASE 5 — Reescrever functions SQL que referenciam `leads_diarios`

6 functions precisam ser atualizadas:

1. **`consolidar_dados_comerciais_mes`** — Recalcula `dados_comerciais` a partir de `leads_diarios` → trocar por `vw_leads_diarios`
2. **`consolidar_origem_leads_mes`** — Recalcula `origem_leads` → trocar por `vw_leads_diarios`
3. **`get_dados_comercial_ia`** — Dados para IA comercial → trocar referências
4. **`get_historico_mensal_matriculador`** — Histórico do programa matriculador → trocar referências
5. **`get_programa_matriculador_dados`** — Dados do programa matriculador → trocar referências
6. **`snapshot_dados_mensais`** — Snapshot mensal → trocar referências

**Abordagem**: Substituir `leads_diarios` por `vw_leads_diarios` no corpo de cada function.

---

### FASE 6 — Atualizar trigger `sync_aluno_to_leads_diarios`

Atualmente: quando um aluno é inserido/atualizado em `alunos`, insere em `leads_diarios`.

**Novo comportamento**: inserir em `leads` ao invés de `leads_diarios`.

```sql
CREATE OR REPLACE FUNCTION sync_aluno_to_leads()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id INTEGER;
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'ativo' AND OLD.status != 'ativo') THEN
        
        SELECT id INTO v_existing_id
        FROM leads
        WHERE observacoes LIKE 'aluno_id:' || NEW.id::TEXT || '%'
        LIMIT 1;

        IF v_existing_id IS NULL THEN
            INSERT INTO leads (
                unidade_id, data_contato, status, converteu, data_conversao,
                nome, curso_interesse_id, professor_experimental_id,
                valor_passaporte, valor_parcela, observacoes, created_at
            ) VALUES (
                NEW.unidade_id, NEW.data_matricula::DATE, 'convertido', true, NEW.data_matricula::DATE,
                NEW.nome, NEW.curso_id, NEW.professor_experimental_id,
                NEW.valor_passaporte, NEW.valor_parcela,
                'aluno_id:' || NEW.id::TEXT || ' - Sincronizado do RP-EMUSES',
                NOW()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar o trigger apontando para a nova function
DROP TRIGGER IF EXISTS trigger_sync_aluno_to_leads_diarios ON alunos;
CREATE TRIGGER trigger_sync_aluno_to_leads
  AFTER INSERT OR UPDATE ON alunos
  FOR EACH ROW EXECUTE FUNCTION sync_aluno_to_leads();
```

---

### FASE 7 — Transformar tabelas auxiliares em views (exceto `dados_comerciais`)

#### `origem_leads` → view

```sql
-- Backup da tabela
-- ALTER TABLE origem_leads RENAME TO origem_leads_backup;

CREATE OR REPLACE VIEW vw_origem_leads AS
SELECT 
  DATE_TRUNC('month', l.data_contato)::DATE AS competencia,
  u.nome AS unidade,
  COALESCE(co.nome, 'Não informado') AS canal,
  CASE 
    WHEN l.status IN ('novo','agendado') THEN 'lead'
    WHEN l.status = 'experimental_agendada' THEN 'experimental_agendada'
    WHEN l.status IN ('experimental_realizada','compareceu') THEN 'experimental_realizada'
    WHEN l.status IN ('matriculado','convertido') THEN 'matricula'
    ELSE 'lead'
  END AS tipo,
  COUNT(*) AS quantidade
FROM leads l
JOIN unidades u ON u.id = l.unidade_id
LEFT JOIN canais_origem co ON co.id = l.canal_origem_id
GROUP BY competencia, u.nome, co.nome, tipo;
```

#### `experimentais_professor_mensal` → view

```sql
CREATE OR REPLACE VIEW vw_experimentais_professor_mensal AS
SELECT 
  l.professor_experimental_id AS professor_id,
  l.unidade_id,
  EXTRACT(YEAR FROM l.data_contato)::INTEGER AS ano,
  EXTRACT(MONTH FROM l.data_contato)::INTEGER AS mes,
  COUNT(*) FILTER (WHERE l.status IN ('experimental_realizada','compareceu')) AS experimentais
FROM leads l
WHERE l.professor_experimental_id IS NOT NULL
GROUP BY l.professor_experimental_id, l.unidade_id, ano, mes;
```

#### `experimentais_mensal_unidade` → view

```sql
CREATE OR REPLACE VIEW vw_experimentais_mensal_unidade AS
SELECT 
  l.unidade_id,
  EXTRACT(YEAR FROM l.data_contato)::INTEGER AS ano,
  EXTRACT(MONTH FROM l.data_contato)::INTEGER AS mes,
  COUNT(*) FILTER (WHERE l.status IN ('experimental_realizada','compareceu')) AS total_experimentais,
  COUNT(*) FILTER (WHERE l.status IN ('matriculado','convertido')) AS total_matriculas
FROM leads l
GROUP BY l.unidade_id, ano, mes;
```

#### `dados_comerciais` — MANTER como tabela

Contém dados históricos importados de planilha (2023-2025) que não podem ser recalculados.

**Opção futura**: Criar uma function `consolidar_dados_comerciais_mes` que recalcula a partir de `leads` para meses de 2026+, mantendo os dados históricos intactos.

---

### FASE 8 — Remover triggers antigos de `leads_diarios`

```sql
DROP TRIGGER IF EXISTS set_updated_at_leads_diarios ON leads_diarios;
DROP TRIGGER IF EXISTS tr_sync_leads_comerciais ON leads_diarios;
DROP TRIGGER IF EXISTS tr_sync_leads_origem ON leads_diarios;
DROP TRIGGER IF EXISTS tr_sync_experimentais_professor ON leads_diarios;
DROP TRIGGER IF EXISTS tr_sync_experimentais_unidade ON leads_diarios;
```

---

### FASE 9 — Atualizar frontend

5 arquivos com 27 referências a `leads_diarios`:

| Arquivo | Refs | Ação |
|---------|------|------|
| `ComercialPage.tsx` | 19 | Trocar `from('leads_diarios')` por `from('leads')` + adaptar campos |
| `PlanilhaComercial.tsx` | 4 | Trocar referências |
| `TabComercialNew.tsx` | 2 | Trocar `from('dados_comerciais')` se necessário |
| `SnapshotDiario.tsx` | 1 | Trocar referência |
| `TabComercial.tsx` | 1 | Trocar referência |

7 arquivos com 21 referências a tabelas auxiliares:

| Arquivo | Refs | Ação |
|---------|------|------|
| `TabComercialNew.tsx` | 6 | Manter `from('dados_comerciais')` (tabela permanece) |
| `TabProfessoresNew.tsx` | 6 | Trocar `from('experimentais_mensal_unidade')` por view |
| `DashboardPage.tsx` | 3 | Manter `from('dados_comerciais')` |
| `TabPerformanceProfessores.tsx` | 2 | Trocar `from('experimentais_professor_mensal')` por view |
| `useComercialData.ts` | 2 | Manter `from('dados_comerciais')` |
| `ComercialCursos.tsx` | 1 | Manter `from('dados_comerciais')` |
| `useOrigemData.ts` | 1 | Trocar `from('origem_leads')` por view |

---

### FASE 10 — Dropar `leads_diarios`

```sql
-- Somente após validação completa
-- Fazer backup antes
CREATE TABLE leads_diarios_backup AS SELECT * FROM leads_diarios;

-- Dropar a tabela
DROP TABLE leads_diarios CASCADE;
```

---

### FASE 11 — Remover functions obsoletas

```sql
DROP FUNCTION IF EXISTS sync_leads_to_dados_comerciais();
DROP FUNCTION IF EXISTS sync_leads_to_origem_leads();
DROP FUNCTION IF EXISTS sync_experimentais_professor();
DROP FUNCTION IF EXISTS sync_experimentais_unidade();
DROP FUNCTION IF EXISTS sync_aluno_to_leads_diarios();
DROP FUNCTION IF EXISTS sync_lead_to_leads_diarios();
```

---

## Ordem de Execução (Segura)

1. ✅ **FASE 1** — Adicionar colunas em `leads` (não quebra nada)
2. ✅ **FASE 2** — Migrar dados (não quebra nada, apenas preenche)
3. ✅ **FASE 3** — Criar `vw_leads_diarios` (não quebra nada, é uma view nova)
4. ✅ **FASE 4** — Reescrever views (substituição atômica via CREATE OR REPLACE)
5. ✅ **FASE 5** — Reescrever functions (substituição atômica)
6. ✅ **FASE 6** — Atualizar trigger de alunos (substituição atômica)
7. ✅ **FASE 7** — Criar views para tabelas auxiliares (não quebra nada, são views novas)
8. ✅ **FASE 9** — Atualizar frontend (deploy junto com as mudanças de banco)
9. ⚠️ **FASE 8** — Remover triggers antigos (só após frontend atualizado)
10. ⚠️ **FASE 10** — Dropar `leads_diarios` (só após validação completa)
11. ⚠️ **FASE 11** — Remover functions obsoletas (limpeza final)

---

## Checklist de Validação

- [ ] `leads` contém todos os dados que estavam em `leads_diarios`
- [ ] `vw_leads_diarios` retorna os mesmos dados que `leads_diarios` retornava
- [ ] Views de KPIs retornam os mesmos valores
- [ ] `dados_comerciais` mantém dados históricos intactos
- [ ] Frontend ComercialPage funciona (CRUD de leads)
- [ ] Dashboard funciona (leitura de dados_comerciais)
- [ ] Gestão Mensal funciona (TabComercialNew, TabProfessoresNew)
- [ ] Performance Professores funciona
- [ ] Trigger de alunos insere em `leads` ao invés de `leads_diarios`
- [ ] Nenhum erro no console do frontend
- [ ] Nenhum erro nos logs do Supabase

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Perda de dados históricos | Backup de `leads_diarios` antes de dropar |
| Views quebradas | `vw_leads_diarios` garante compatibilidade |
| Frontend quebrado | Testar localmente antes de deploy |
| `dados_comerciais` corrompida | Não alterar — manter como tabela |
| Trigger de alunos falha | Testar com INSERT em alunos antes de remover o antigo |
