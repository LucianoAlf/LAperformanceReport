# 🔍 AUDITORIA COMPLETA DOS 75 KPIs
## LA Music Performance Report 2026

> **Data:** 18/01/2026 (Revisão Completa)  
> **Total KPIs:** 75 (44 entrada manual + 31 calculados)

---

## 📊 RESUMO EXECUTIVO

| Categoria | Entrada | Calculado | Total | BD ✅ | BD ❌ | FE ✅ | FE ❌ |
|-----------|:-------:|:---------:|:-----:|:-----:|:-----:|:-----:|:-----:|
| **Gestão/Retenção** | 18 | 12 | 30 | 22 | 8 | 8 | 22 |
| **Comercial** | 16 | 8 | 24 | 14 | 10 | 6 | 18 |
| **Professor** | 10 | 11 | 21 | 8 | 13 | 5 | 16 |
| **TOTAL** | **44** | **31** | **75** | **44** | **31** | **19** | **56** |

**Conclusão:** 
- **Banco:** 59% implementado (44/75)
- **Frontend:** 25% implementado (19/75)
- **Gap total:** 56 KPIs faltando no frontend

---

## 2. AUDITORIA DO BANCO DE DADOS

### 2.1 Tabelas Mestras

| Tabela | Existe | Registros | Campos Faltantes |
|--------|:------:|:---------:|------------------|
| `unidades` | ✅ | 3 | - |
| `professores` | ✅ | 44 | - |
| `cursos` | ✅ | 16 | - |
| `canais_origem` | ✅ | 9 | - |
| `motivos_saida` | ✅ | 12 | - |
| `tipos_saida` | ✅ | 3 | 🔴 Falta `TRANSFERENCIA` |
| `tipos_matricula` | ✅ | 5 | 🔴 Falta `entra_ltv`, `entra_churn` |
| `formas_pagamento` | ✅ | 5 | - |
| `motivos_arquivamento` | ❌ | - | 🔴 **CRIAR TABELA** |
| `horarios` | ❌ | - | 🔴 **CRIAR TABELA** |

### 2.2 Tabelas Principais

| Tabela | Existe | Registros | Status |
|--------|:------:|:---------:|:------:|
| `alunos` | ✅ | 911 | ✅ Completa (40 campos) |
| `evasoes_v2` | ✅ | 0 | 🔴 Falta `curso_id` |
| `renovacoes` | ✅ | 0 | 🔴 Falta `professor_id` |
| `leads_diarios` | ✅ | 0 | 🔴 Falta campos de arquivamento |
| `relatorios_diarios` | ✅ | 0 | 🟡 Falta alguns campos |
| `metas` | ✅ | 7 | ✅ Completa |
| `dados_mensais` | ✅ | 108 | ✅ Dados históricos |

### 2.3 Views Existentes (33 views)

✅ `vw_kpis_mensais`, `vw_dashboard_unidade`, `vw_alertas`, `vw_metas_vs_realizado`, 
`vw_projecao_metas`, `vw_ranking_unidades`, `vw_ranking_professores_evasoes`, 
`vw_ranking_professores_retencao`, `vw_performance_professor_experimental`, 
`vw_funil_conversao_mensal`, `vw_leads_por_canal`, `vw_matriculas_por_canal`, 
`vw_evasoes_motivos`, `vw_evasoes_professores`, `vw_ltv_por_unidade`, `vw_sazonalidade`, 
`vw_alunos_ativos`, `vw_consolidado_anual`, `vw_contagem_alunos`, `vw_distribuicao_permanencia`,
`vw_evasao_por_motivo`, `vw_evasao_por_tipo`, `vw_evasoes_resumo`, `vw_evolucao_alunos`,
`vw_ltv_por_categoria`, `vw_ltv_rede`, `vw_ltv_unidade`, `vw_motivos_nao_matricula`,
`vw_movimentacoes_mensal`, `vw_movimentacoes_recentes`, `vw_renovacoes_mensal`,
`vw_totais_unidade_performance`, `vw_unidade_anual`

---

## 3. AUDITORIA DOS 75 KPIs

### 3.1 KPIs DE GESTÃO/RETENÇÃO (30 KPIs)

#### Campos de Entrada (18 campos)

| # | Campo | Tabela BD | Existe BD | Existe FE | Status |
|:-:|-------|-----------|:---------:|:---------:|:------:|
| 1 | `competencia_mes` | `relatorios_diarios.data_referencia` | ✅ | ✅ | ✅ OK |
| 2 | `unidade_id` | `relatorios_diarios.unidade_id` | ✅ | ✅ | ✅ OK |
| 3 | `total_alunos_ativos` | `relatorios_diarios.total_alunos_ativos` | ✅ | ✅ | ✅ OK |
| 4 | `total_alunos_pagantes` | `relatorios_diarios.total_alunos_pagantes` | ✅ | ✅ | ✅ OK |
| 5 | `total_alunos_bolsistas` | `relatorios_diarios.total_bolsistas_*` | ✅ | ❌ | 🟡 Separado |
| 6 | `novas_matriculas` | `relatorios_diarios.matriculas_acumulado_mes` | ✅ | ✅ | ✅ OK |
| 7 | `cursos_novas_matriculas` | `leads_diarios.curso_id` | ✅ | ❌ | 🔴 Falta agregar |
| 8 | `professor_nova_matricula` | `leads_diarios.professor_fixo_id` | ✅ | ❌ | 🔴 Falta agregar |
| 9 | `evasoes_alunos` | `relatorios_diarios.evasoes_acumulado_mes` | ✅ | ✅ | ✅ OK |
| 10 | `professor_churn` | `evasoes_v2.professor_id` | ✅ | ❌ | 🔴 Falta agregar |
| 11 | `curso_churn` | `evasoes_v2` | ❌ | ❌ | 🔴 **CRIAR** `curso_id` |
| 12 | `renovacoes_alunos` | `relatorios_diarios.renovacoes_acumulado_mes` | ✅ | ❌ | 🔴 Falta exibir |
| 13 | `nao_renovacoes_alunos` | `relatorios_diarios.nao_renovacoes_acumulado_mes` | ✅ | ❌ | 🔴 Falta exibir |
| 14 | `motivos_nao_renovacoes` | `renovacoes.motivo_nao_renovacao_id` | ✅ | ❌ | 🔴 Falta agregar |
| 15 | `cancelamento_matriculas` | `evasoes_v2` (tipo INTERROMPIDO) | ✅ | ❌ | 🔴 Falta filtrar |
| 16 | `motivos_cancelamentos` | `evasoes_v2.motivo_saida_id` | ✅ | ❌ | 🔴 Falta agregar |
| 17 | `reajustes_parcelas_pct` | `renovacoes.percentual_reajuste` | ✅ | ❌ | 🔴 Falta média |
| 18 | `ticket_medio_passaporte` | `leads_diarios.valor_passaporte` | ✅ | ❌ | 🔴 Falta média |
| 19 | `faturamento_parcelas_realizado` | `relatorios_diarios.faturamento_realizado_mes` | ✅ | ❌ | 🔴 Falta exibir |
| 20 | `alunos_aviso_previo` | `relatorios_diarios.avisos_previos_mes` | ✅ | ❌ | 🔴 Falta exibir |
| 21 | `nps_evasoes` | `alunos.nps_saida` | ✅ | ❌ | 🔴 Falta média |

#### Campos Calculados (12 campos)

| # | Campo | Fórmula | View Existe | Existe FE | Status |
|:-:|-------|---------|:-----------:|:---------:|:------:|
| 1 | `churn_pct` | (evasoes / ativos) × 100 | ✅ `vw_kpis_mensais` | ✅ | ✅ OK |
| 2 | `renovacoes_pct` | (renov / (renov + não_renov)) × 100 | ✅ `vw_renovacoes_mensal` | ❌ | 🔴 Falta FE |
| 3 | `cancelamento_pct` | (cancel / ativos) × 100 | ❌ | ❌ | 🔴 **CRIAR** |
| 4 | `tempo_permanencia_meses` | AVG(meses) WHERE >= 4 | ✅ `vw_ltv_por_unidade` | ❌ | 🔴 Falta FE |
| 5 | `ticket_medio_parcelas` | faturamento / pagantes | ✅ `vw_dashboard_unidade` | ✅ | ✅ OK |
| 6 | `ltv` | ticket × permanência | ✅ `vw_ltv_por_unidade` | ❌ | 🔴 Falta FE |
| 7 | `faturamento_parcelas_previsto` | pagantes × ticket | ✅ `relatorios_diarios` | ❌ | 🔴 Falta FE |
| 8 | `inadimplencia` | previsto - realizado | ✅ `relatorios_diarios` | ❌ | 🔴 Falta FE |
| 9 | `inadimplencia_pct` | (inadimp / previsto) × 100 | ✅ `relatorios_diarios` | ❌ | 🔴 Falta FE |
| 10 | `total_evasoes` | interrompidos + não_renovações | ✅ `vw_evasoes_resumo` | ✅ | ✅ OK |
| 11 | `mrr_perdido` | SUM(parcelas evadidos) | ✅ `vw_evasoes_resumo` | ✅ | ✅ OK |
| 12 | `renovacoes_pendentes` | previstas - realizadas - não_renov | ❌ | ❌ | 🔴 **CRIAR** |

---

### 3.2 KPIs COMERCIAIS (24 KPIs)

#### Campos de Entrada (16 campos)

| # | Campo | Tabela BD | Existe BD | Existe FE | Status |
|:-:|-------|-----------|:---------:|:---------:|:------:|
| 1 | `competencia_mes` | `leads_diarios.data` | ✅ | ✅ | ✅ OK |
| 2 | `unidade_id` | `leads_diarios.unidade_id` | ✅ | ✅ | ✅ OK |
| 3 | `total_leads` | `leads_diarios` (tipo='lead') | ✅ | ✅ | ✅ OK |
| 4 | `curso_interesse_lead` | `leads_diarios.curso_id` | ✅ | ❌ | 🔴 Falta agregar |
| 5 | `canal_lead` | `leads_diarios.canal_origem_id` | ✅ | ✅ | ✅ OK |
| 6 | `leads_nao_responderam` | `leads_diarios` | ❌ | ❌ | 🔴 **CRIAR** campo |
| 7 | `motivo_arquivamento_leads` | - | ❌ | ❌ | 🔴 **CRIAR** tabela + campo |
| 8 | `aulas_experimentais_marcadas` | `relatorios_diarios.experimentais_agendadas_*` | ✅ | ✅ | ✅ OK |
| 9 | `aulas_experimentais_realizadas` | `relatorios_diarios.experimentais_realizadas_*` | ✅ | ✅ | ✅ OK |
| 10 | `professor_experimental` | `leads_diarios.professor_experimental_id` | ✅ | ❌ | 🔴 Falta agregar |
| 11 | `canal_novas_matriculas` | `leads_diarios.canal_origem_id` (matricula) | ✅ | ❌ | 🔴 Falta agregar |
| 12 | `motivo_nao_matricula_experimental` | - | ❌ | ❌ | 🔴 **CRIAR** campo |
| 13 | `novas_matriculas` | `leads_diarios` (tipo='matricula') | ✅ | ✅ | ✅ OK |
| 14 | `curso_novas_matriculas` | `leads_diarios.curso_id` (matricula) | ✅ | ❌ | 🔴 Falta agregar |
| 15 | `professor_novas_matriculas` | `leads_diarios.professor_fixo_id` | ✅ | ❌ | 🔴 Falta agregar |
| 16 | `horario_novas_matriculas` | `alunos.horario_aula` | ✅ | ❌ | 🔴 Falta agregar |
| 17 | `ticket_medio_passaporte_novas` | `leads_diarios.valor_passaporte` | ✅ | ❌ | 🔴 Falta média |

#### Campos Calculados (8 campos)

| # | Campo | Fórmula | View Existe | Existe FE | Status |
|:-:|-------|---------|:-----------:|:---------:|:------:|
| 1 | `faltaram_experimental` | marcadas - realizadas | ✅ `relatorios_diarios` | ❌ | 🔴 Falta FE |
| 2 | `taxa_conversao_lead_exp` | (exp / leads) × 100 | ✅ `vw_funil_conversao_mensal` | ✅ | ✅ OK |
| 3 | `taxa_conversao_exp_mat` | (mat / exp) × 100 | ✅ `vw_funil_conversao_mensal` | ✅ | ✅ OK |
| 4 | `taxa_conversao_experimental_professor` | Por professor | ✅ `vw_performance_professor_experimental` | ❌ | 🔴 Falta FE |
| 5 | `taxa_conversao_matricula_canal` | Por canal | ✅ `vw_matriculas_por_canal` | ❌ | 🔴 Falta FE |
| 6 | `ticket_medio_parcela_novas` | AVG(parcelas novas) | ❌ | ❌ | 🔴 **CRIAR** |
| 7 | `faturamento_novas_parcelas` | matriculas × ticket | ❌ | ❌ | 🔴 **CRIAR** |
| 8 | `faturamento_passaporte` | SUM(passaportes) | ✅ `leads_diarios` | ❌ | 🔴 Falta FE |

---

### 3.3 KPIs DE PROFESSOR (21 KPIs)

#### Campos de Entrada (10 campos)

| # | Campo | Tabela BD | Existe BD | Existe FE | Status |
|:-:|-------|-----------|:---------:|:---------:|:------:|
| 1 | `competencia_mes` | - | ✅ | ✅ | ✅ OK |
| 2 | `unidade_id` | `professores.unidade_id` | ✅ | ✅ | ✅ OK |
| 3 | `professor_id` | `professores.id` | ✅ | ✅ | ✅ OK |
| 4 | `qtd_alunos_professor` | COUNT(alunos) | ✅ | ✅ | ✅ OK |
| 5 | `experimentais_professor` | `leads_diarios.professor_experimental_id` | ✅ | ✅ | ✅ OK |
| 6 | `churn_por_professor` | `evasoes_v2.professor_id` | ✅ | ✅ | ✅ OK |
| 7 | `motivo_churn_professor` | `evasoes_v2.motivo_saida_id` | ✅ | ❌ | 🔴 Falta agregar |
| 8 | `taxa_presencas_aluno` | `alunos.percentual_presenca` | ✅ | ❌ | 🔴 Falta exibir |
| 9 | `nps_professor` | - | ❌ | ❌ | 🔴 **CRIAR** campo |
| 10 | `media_alunos_turma_professor` | - | ❌ | ❌ | 🔴 **CRIAR** campo |

#### Campos Calculados (11 campos)

| # | Campo | Fórmula | View Existe | Existe FE | Status |
|:-:|-------|---------|:-----------:|:---------:|:------:|
| 1 | `matriculas_professor` | COUNT(matriculas) | ✅ `vw_performance_professor_experimental` | ✅ | ✅ OK |
| 2 | `taxa_conversao_professor` | (mat / exp) × 100 | ✅ `vw_performance_professor_experimental` | ✅ | ✅ OK |
| 3 | `ranking_professor_matriculador` | RANK() | ❌ | ❌ | 🔴 **CRIAR** |
| 4 | `renovacoes_professor` | COUNT(renovações) | ✅ `vw_ranking_professores_retencao` | ❌ | 🔴 Falta FE |
| 5 | `taxa_renovacao_professor` | % renovação | ✅ `vw_ranking_professores_retencao` | ❌ | 🔴 Falta FE |
| 6 | `taxa_nao_renovacao_professor` | 100 - taxa_renovacao | ❌ | ❌ | 🔴 **CRIAR** |
| 7 | `ranking_professor_renovador` | RANK() | ❌ | ❌ | 🔴 **CRIAR** |
| 8 | `taxa_cancelamento_professor` | (churn / carteira) × 100 | ✅ `vw_ranking_professores_evasoes` | ❌ | 🔴 Falta FE |
| 9 | `ranking_professor_churn` | RANK() invertido | ❌ | ❌ | 🔴 **CRIAR** |
| 10 | `ticket_medio_professor` | AVG(parcelas) | ❌ | ❌ | 🔴 **CRIAR** |
| 11 | `mrr_perdido_professor` | SUM(parcelas evadidos) | ❌ | ❌ | 🔴 **CRIAR** |
| 12 | `taxa_faltas_aluno` | 100 - presencas | ❌ | ❌ | 🔴 **CRIAR** |
| 13 | `media_alunos_turma_geral` | AVG(turmas) | ❌ | ❌ | 🔴 **CRIAR** |

---

## 4. GAP ANALYSIS DETALHADO

### 4.1 Campos a CRIAR no Banco de Dados

#### Tabelas Novas (2)
```sql
-- 1. Tabela motivos_arquivamento
CREATE TABLE motivos_arquivamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO motivos_arquivamento (nome) VALUES
  ('Não respondeu'), ('Desistiu'), ('Fora do perfil'),
  ('Preço'), ('Horário incompatível'), ('Distância'), ('Outro');

-- 2. Tabela horarios
CREATE TABLE horarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(20) NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO horarios (nome, hora_inicio, hora_fim) VALUES
  ('Manhã', '08:00', '12:00'),
  ('Tarde', '12:00', '18:00'),
  ('Noite', '18:00', '22:00');
```

#### Campos Novos em Tabelas Existentes
```sql
-- tipos_saida: adicionar TRANSFERENCIA
INSERT INTO tipos_saida (codigo, nome, descricao) 
VALUES ('TRANSFERENCIA', 'Transferência', 'Mudou de unidade');

-- tipos_matricula: adicionar campos de controle
ALTER TABLE tipos_matricula 
ADD COLUMN entra_ltv BOOLEAN DEFAULT true,
ADD COLUMN entra_churn BOOLEAN DEFAULT true;

UPDATE tipos_matricula SET entra_ltv = false, entra_churn = false 
WHERE codigo IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA');

-- evasoes_v2: adicionar curso_id
ALTER TABLE evasoes_v2 
ADD COLUMN curso_id INTEGER REFERENCES cursos(id);

-- renovacoes: adicionar professor_id
ALTER TABLE renovacoes 
ADD COLUMN professor_id INTEGER REFERENCES professores(id);

-- leads_diarios: adicionar campos de arquivamento
ALTER TABLE leads_diarios 
ADD COLUMN arquivado BOOLEAN DEFAULT false,
ADD COLUMN motivo_arquivamento_id INTEGER REFERENCES motivos_arquivamento(id),
ADD COLUMN motivo_nao_matricula_id INTEGER REFERENCES motivos_saida(id);

-- professores: adicionar NPS e média turma
ALTER TABLE professores 
ADD COLUMN nps_medio DECIMAL(3,1),
ADD COLUMN media_alunos_turma DECIMAL(4,1);
```

### 4.2 Views a CRIAR

```sql
-- View completa de KPIs por Professor com Rankings
CREATE OR REPLACE VIEW vw_kpis_professor_completo AS
WITH carteira AS (
  SELECT professor_atual_id, 
    COUNT(*) as qtd_alunos, 
    AVG(valor_parcela) as ticket_medio,
    AVG(percentual_presenca) as media_presenca
  FROM alunos WHERE status = 'ativo' 
  GROUP BY professor_atual_id
),
experimentais AS (
  SELECT professor_experimental_id, COUNT(*) as total
  FROM leads_diarios WHERE tipo = 'experimental_realizada'
  GROUP BY professor_experimental_id
),
matriculas AS (
  SELECT professor_experimental_id, COUNT(*) as total
  FROM leads_diarios WHERE tipo = 'matricula'
  GROUP BY professor_experimental_id
),
evasoes AS (
  SELECT professor_id, COUNT(*) as total, SUM(valor_parcela) as mrr_perdido
  FROM evasoes_v2 GROUP BY professor_id
),
renovacoes AS (
  SELECT professor_id, 
    COUNT(*) FILTER (WHERE status = 'realizada') as realizadas,
    COUNT(*) FILTER (WHERE status = 'nao_renovada') as nao_renovadas
  FROM renovacoes GROUP BY professor_id
)
SELECT 
  p.id, p.nome, p.unidade_id,
  COALESCE(c.qtd_alunos, 0) as carteira_alunos,
  COALESCE(c.ticket_medio, 0) as ticket_medio,
  COALESCE(c.media_presenca, 0) as media_presenca,
  100 - COALESCE(c.media_presenca, 0) as taxa_faltas,
  COALESCE(e.total, 0) as experimentais,
  COALESCE(m.total, 0) as matriculas,
  CASE WHEN e.total > 0 THEN ROUND((m.total::decimal / e.total) * 100, 2) ELSE 0 END as taxa_conversao,
  COALESCE(ev.total, 0) as evasoes,
  COALESCE(ev.mrr_perdido, 0) as mrr_perdido,
  COALESCE(r.realizadas, 0) as renovacoes,
  COALESCE(r.nao_renovadas, 0) as nao_renovacoes,
  CASE WHEN r.realizadas + r.nao_renovadas > 0 
    THEN ROUND((r.realizadas::decimal / (r.realizadas + r.nao_renovadas)) * 100, 2) 
    ELSE 0 END as taxa_renovacao,
  CASE WHEN c.qtd_alunos > 0 
    THEN ROUND((ev.total::decimal / c.qtd_alunos) * 100, 2) 
    ELSE 0 END as taxa_cancelamento,
  RANK() OVER (ORDER BY CASE WHEN e.total > 0 THEN (m.total::decimal / e.total) ELSE 0 END DESC) as ranking_matriculador,
  RANK() OVER (ORDER BY CASE WHEN r.realizadas + r.nao_renovadas > 0 THEN (r.realizadas::decimal / (r.realizadas + r.nao_renovadas)) ELSE 0 END DESC) as ranking_renovador,
  RANK() OVER (ORDER BY COALESCE(ev.total, 0) ASC) as ranking_churn
FROM professores p
LEFT JOIN carteira c ON p.id = c.professor_atual_id
LEFT JOIN experimentais e ON p.id = e.professor_experimental_id
LEFT JOIN matriculas m ON p.id = m.professor_experimental_id
LEFT JOIN evasoes ev ON p.id = ev.professor_id
LEFT JOIN renovacoes r ON p.id = r.professor_id
WHERE p.ativo = true;

-- View de renovações pendentes
CREATE OR REPLACE VIEW vw_renovacoes_pendentes AS
SELECT 
  a.unidade_id,
  DATE_TRUNC('month', a.data_fim_contrato) as mes_vencimento,
  COUNT(*) as total_vencendo,
  COUNT(*) FILTER (WHERE r.status = 'realizada') as renovadas,
  COUNT(*) FILTER (WHERE r.status = 'nao_renovada') as nao_renovadas,
  COUNT(*) FILTER (WHERE r.id IS NULL) as pendentes
FROM alunos a
LEFT JOIN renovacoes r ON a.id = r.aluno_id
WHERE a.status = 'ativo'
AND a.data_fim_contrato >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.unidade_id, DATE_TRUNC('month', a.data_fim_contrato);
```

### 4.3 KPIs Faltando no Frontend (56 KPIs)

#### Gestão/Retenção (22 faltando)
1. `total_alunos_bolsistas` - Card separado
2. `cursos_novas_matriculas` - Gráfico pizza
3. `professor_nova_matricula` - Tabela ranking
4. `professor_churn` - Tabela ranking
5. `curso_churn` - Gráfico pizza
6. `renovacoes_alunos` - Card KPI
7. `nao_renovacoes_alunos` - Card KPI
8. `motivos_nao_renovacoes` - Gráfico pizza
9. `cancelamento_matriculas` - Card KPI
10. `motivos_cancelamentos` - Gráfico pizza
11. `reajustes_parcelas_pct` - Card KPI
12. `ticket_medio_passaporte` - Card KPI
13. `faturamento_parcelas_realizado` - Card KPI
14. `alunos_aviso_previo` - Card alerta
15. `nps_evasoes` - Card KPI
16. `renovacoes_pct` - Card KPI
17. `cancelamento_pct` - Card KPI
18. `tempo_permanencia_meses` - Card KPI
19. `ltv` - Card KPI
20. `faturamento_parcelas_previsto` - Card KPI
21. `inadimplencia` / `inadimplencia_pct` - Card KPI
22. `renovacoes_pendentes` - Card alerta

#### Comercial (18 faltando)
1. `curso_interesse_lead` - Gráfico pizza
2. `leads_nao_responderam` - Card KPI
3. `motivo_arquivamento_leads` - Gráfico pizza
4. `professor_experimental` - Tabela ranking
5. `canal_novas_matriculas` - Gráfico pizza
6. `motivo_nao_matricula_experimental` - Gráfico pizza
7. `curso_novas_matriculas` - Gráfico pizza
8. `professor_novas_matriculas` - Tabela ranking
9. `horario_novas_matriculas` - Gráfico barras
10. `ticket_medio_passaporte_novas` - Card KPI
11. `faltaram_experimental` - Card KPI
12. `taxa_conversao_experimental_professor` - Tabela ranking
13. `taxa_conversao_matricula_canal` - Gráfico barras
14. `ticket_medio_parcela_novas` - Card KPI
15. `faturamento_novas_parcelas` - Card KPI
16. `faturamento_passaporte` - Card KPI

#### Professor (16 faltando)
1. `motivo_churn_professor` - Gráfico pizza
2. `taxa_presencas_aluno` - Card KPI
3. `nps_professor` - Card KPI
4. `media_alunos_turma_professor` - Card KPI
5. `ranking_professor_matriculador` - Tabela ranking
6. `renovacoes_professor` - Card KPI
7. `taxa_renovacao_professor` - Card KPI
8. `taxa_nao_renovacao_professor` - Card KPI
9. `ranking_professor_renovador` - Tabela ranking
10. `taxa_cancelamento_professor` - Card KPI
11. `ranking_professor_churn` - Tabela ranking
12. `ticket_medio_professor` - Card KPI
13. `mrr_perdido_professor` - Card KPI
14. `taxa_faltas_aluno` - Card KPI
15. `media_alunos_turma_geral` - Card KPI

---

## 5. PLANO DE EXPANSÃO EM FASES

### FASE 1: FUNDAÇÃO DO BANCO (1 semana)
**Objetivo:** Criar todas as estruturas faltantes no banco

**Tarefas:**
1. ✅ Criar tabela `motivos_arquivamento`
2. ✅ Criar tabela `horarios`
3. ✅ Adicionar `TRANSFERENCIA` em `tipos_saida`
4. ✅ Adicionar campos em `tipos_matricula`
5. ✅ Adicionar `curso_id` em `evasoes_v2`
6. ✅ Adicionar `professor_id` em `renovacoes`
7. ✅ Adicionar campos de arquivamento em `leads_diarios`
8. ✅ Adicionar campos em `professores`
9. ✅ Criar view `vw_kpis_professor_completo`
10. ✅ Criar view `vw_renovacoes_pendentes`

### FASE 2: COMPONENTES BASE (1 semana)
**Objetivo:** Criar componentes reutilizáveis de UI

**Componentes:**
1. `KPICard.tsx` - Card com valor, tendência, meta
2. `KPIGrid.tsx` - Grid responsivo de cards
3. `MetaProgress.tsx` - Barra de progresso com meta
4. `TrendIndicator.tsx` - Indicador ▲/▼ com cor
5. `RankingTable.tsx` - Tabela com posição e medalhas
6. `PieChartCard.tsx` - Gráfico pizza com legenda
7. `BarChartCard.tsx` - Gráfico barras horizontal
8. `AlertBanner.tsx` - Banner de alertas

### FASE 3: DASHBOARD GESTÃO (1 semana)
**Objetivo:** Implementar os 30 KPIs de Gestão/Retenção

**Seções:**
1. **Cards Principais:** Alunos, Pagantes, Bolsistas, Ticket, LTV
2. **Cards Financeiros:** Faturamento Previsto/Realizado, Inadimplência
3. **Cards Retenção:** Churn, Renovações, Cancelamentos, Avisos Prévios
4. **Gráficos:** Motivos Evasão, Motivos Não Renovação, Cursos Churn
5. **Rankings:** Professores por Churn, Cursos por Evasão
6. **Alertas:** Renovações Pendentes, Avisos Prévios

### FASE 4: DASHBOARD COMERCIAL (1 semana)
**Objetivo:** Implementar os 24 KPIs Comerciais

**Seções:**
1. **Cards Funil:** Leads, Experimentais, Matrículas, Taxas Conversão
2. **Cards Financeiros:** Ticket Passaporte, Faturamento Passaportes
3. **Gráficos:** Leads por Canal, Matrículas por Canal, Cursos Interesse
4. **Rankings:** Professores Matriculadores, Canais por Conversão
5. **Análises:** Motivos Arquivamento, Motivos Não Matrícula

### FASE 5: DASHBOARD PROFESSOR (1 semana)
**Objetivo:** Implementar os 21 KPIs de Professor

**Seções:**
1. **Cards Individuais:** Carteira, Ticket, Presença, NPS
2. **Cards Performance:** Experimentais, Matrículas, Taxa Conversão
3. **Cards Retenção:** Renovações, Evasões, MRR Perdido
4. **Rankings:** Matriculador, Renovador, Churn (invertido)
5. **Comparativo:** Professor vs Média da Unidade

### FASE 6: METAS E OKRs (1 semana)
**Objetivo:** Sistema completo de gestão de metas

**Funcionalidades:**
1. CRUD de metas por período
2. Dashboard de OKRs com progresso
3. Projeção automática de metas
4. Alertas de tendência (verde/amarelo/vermelho)

### FASE 7: RELATÓRIOS E EXPORTAÇÃO (1 semana)
**Objetivo:** Relatórios profissionais

**Funcionalidades:**
1. Relatório Mensal Consolidado (PDF)
2. Relatório por Unidade (PDF)
3. Relatório de Professor (PDF)
4. Exportação Excel
5. Relatório WhatsApp automático

---

## 6. CRONOGRAMA SUGERIDO

```
JANEIRO 2026
├── Semana 4 (20-24): FASE 1 - Banco de Dados
├── Semana 5 (27-31): FASE 2 - Componentes Base

FEVEREIRO 2026
├── Semana 1 (03-07): FASE 3 - Dashboard Gestão
├── Semana 2 (10-14): FASE 4 - Dashboard Comercial
├── Semana 3 (17-21): FASE 5 - Dashboard Professor
├── Semana 4 (24-28): FASE 6 - Metas e OKRs

MARÇO 2026
├── Semana 1 (03-07): FASE 7 - Relatórios
├── Semana 2 (10-14): Testes e Ajustes
├── Semana 3 (17-21): Deploy e Treinamento
```

---

## 7. PRÓXIMOS PASSOS IMEDIATOS

1. ⬜ **Aprovar plano** com stakeholders
2. ⬜ **Executar scripts SQL** da Fase 1
3. ⬜ **Criar branch** `feature/kpis-completos`
4. ⬜ **Implementar componentes base** de UI
5. ⬜ **Criar hooks** para cada categoria de KPI

---

*Documento gerado em 18/01/2026 - Auditoria Completa dos 75 KPIs*
