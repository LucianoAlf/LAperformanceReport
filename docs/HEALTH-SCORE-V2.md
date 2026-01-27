# 🏥 HEALTH SCORE v2 - ESPECIFICAÇÃO TÉCNICA

> **Sistema:** LA Performance Report  
> **Data:** 26/01/2026  
> **Para:** Windsurf (Implementação)

---

## 📋 SUMÁRIO

1. [Estrutura do Health Score](#1-estrutura-do-health-score)
2. [Fator de Demanda por Curso](#2-fator-de-demanda-por-curso)
3. [Fórmulas de Cálculo](#3-fórmulas-de-cálculo)
4. [Alterações no Banco de Dados](#4-alterações-no-banco-de-dados)
5. [Alterações no Frontend](#5-alterações-no-frontend)
6. [Exemplos de Cálculo](#6-exemplos-de-cálculo)
7. [Checklist de Implementação](#7-checklist-de-implementação)

---

## 1. ESTRUTURA DO HEALTH SCORE

### 1.1 Fatores e Pesos

| Fator | Peso | Descrição |
|-------|------|-----------|
| 📈 **Taxa de Crescimento** | 15% | Crescimento da carteira com fator de demanda |
| 👥 **Média/Turma** | 20% | Densidade das turmas |
| 🔄 **Retenção** | 25% | Taxa de renovações |
| 🎯 **Conversão** | 15% | Experimental → Matrícula |
| 📅 **Presença** | 15% | Taxa de presença dos alunos |
| 🚪 **Evasões** | 10% | Inverso (menos = melhor) |
| **TOTAL** | **100%** | |

### 1.2 Classificação

| Status | Score | Cor |
|--------|-------|-----|
| 🟢 **Saudável** | ≥ 70 | Verde |
| 🟡 **Atenção** | 50 - 69 | Amarelo |
| 🔴 **Crítico** | < 50 | Vermelho |

---

## 2. FATOR DE DEMANDA POR CURSO

### 2.1 Conceito

O Fator de Demanda equilibra cursos de diferentes tamanhos, dando boost para cursos menores.

### 2.2 Tabela de Faixas

| % do Total de Alunos | Classificação | Fator |
|----------------------|---------------|-------|
| ≥ 15% | Curso Grande | **1.0** |
| 10% a 14.99% | Curso Médio-Grande | **1.5** |
| 5% a 9.99% | Curso Médio | **2.0** |
| 2% a 4.99% | Curso Pequeno | **2.5** |
| < 2% | Curso Muito Pequeno | **3.0** |

### 2.3 Valores Permitidos

O fator só pode ser: **1.0**, **1.5**, **2.0**, **2.5** ou **3.0**

### 2.4 Configuração

- Definido **anualmente** pelo admin
- Configurável via dropdown na tela de configurações
- Valor padrão: 1.0

---

## 3. FÓRMULAS DE CÁLCULO

### 3.1 Taxa de Crescimento (15%)

```javascript
// Fórmula
taxa_crescimento = ((matriculas - evasoes - nao_renovacoes) / alunos_iniciais) * 100
taxa_ajustada = taxa_crescimento * fator_demanda_do_curso

// Normalização para pontos (0-100)
// -10% → 0 pontos | +20% → 100 pontos
pontos = Math.max(0, Math.min(100, ((taxa_ajustada + 10) / 30) * 100))
```

### 3.2 Média/Turma (20%)

```javascript
META_MEDIA_TURMA = 3.0 // configurável

pontos = Math.min(100, (media_alunos_turma / META_MEDIA_TURMA) * 100)
```

### 3.3 Retenção (25%)

```javascript
taxa_renovacao = (renovacoes_realizadas / contratos_a_vencer) * 100
pontos = taxa_renovacao // já é 0-100
```

### 3.4 Conversão (15%)

```javascript
taxa_conversao = (matriculas / experimentais_realizadas) * 100
pontos = Math.min(100, taxa_conversao)
```

### 3.5 Presença (15%)

```javascript
pontos = taxa_presenca // já é 0-100
```

### 3.6 Evasões - Inverso (10%)

```javascript
taxa_evasao = (evasoes / carteira_alunos) * 100
pontos = Math.max(0, 100 - (taxa_evasao * 10))
```

### 3.7 Health Score Final

```javascript
health_score = 
    pontos_crescimento * 0.15 +
    pontos_media_turma * 0.20 +
    pontos_retencao * 0.25 +
    pontos_conversao * 0.15 +
    pontos_presenca * 0.15 +
    pontos_evasoes * 0.10
```

---

## 4. ALTERAÇÕES NO BANCO DE DADOS

### 4.1 Adicionar Coluna na Tabela `cursos`

```sql
ALTER TABLE cursos 
ADD COLUMN IF NOT EXISTS fator_demanda DECIMAL(2,1) DEFAULT 1.0 
CHECK (fator_demanda IN (1.0, 1.5, 2.0, 2.5, 3.0));

COMMENT ON COLUMN cursos.fator_demanda IS 'Fator de demanda para Health Score (1.0 a 3.0)';
```

### 4.2 Criar Tabela de Configuração

```sql
CREATE TABLE IF NOT EXISTS config_health_score (
    id SERIAL PRIMARY KEY,
    unidade_id UUID REFERENCES unidades(id),
    
    -- Pesos dos fatores (devem somar 100)
    peso_taxa_crescimento INTEGER DEFAULT 15,
    peso_media_turma INTEGER DEFAULT 20,
    peso_retencao INTEGER DEFAULT 25,
    peso_conversao INTEGER DEFAULT 15,
    peso_presenca INTEGER DEFAULT 15,
    peso_evasoes INTEGER DEFAULT 10,
    
    -- Parâmetros
    meta_media_turma DECIMAL(3,1) DEFAULT 3.0,
    
    -- Faixas de classificação
    limite_saudavel INTEGER DEFAULT 70,
    limite_atencao INTEGER DEFAULT 50,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT pesos_somam_100 CHECK (
        peso_taxa_crescimento + peso_media_turma + peso_retencao + 
        peso_conversao + peso_presenca + peso_evasoes = 100
    )
);

-- Inserir configuração padrão
INSERT INTO config_health_score (unidade_id) VALUES (NULL)
ON CONFLICT DO NOTHING;
```

### 4.3 Popular Fator de Demanda (Valores Iniciais)

```sql
-- Ajustar conforme dados reais da escola
UPDATE cursos SET fator_demanda = 1.0 WHERE nome IN ('Violão', 'Bateria');
UPDATE cursos SET fator_demanda = 1.5 WHERE nome IN ('Teclado', 'Guitarra');
UPDATE cursos SET fator_demanda = 2.0 WHERE nome IN ('Canto', 'Piano', 'Musicalização');
UPDATE cursos SET fator_demanda = 2.5 WHERE nome IN ('Baixo', 'Ukulele', 'Violino');
UPDATE cursos SET fator_demanda = 3.0 WHERE nome IN ('Saxofone', 'Cavaquinho', 'Flauta');
```

### 4.4 Nova View: Taxa de Crescimento por Professor

```sql
CREATE OR REPLACE VIEW vw_taxa_crescimento_professor AS
SELECT 
    p.id AS professor_id,
    p.nome AS professor_nome,
    p.unidade_id,
    c.id AS curso_id,
    c.nome AS curso_nome,
    c.fator_demanda,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AS ano,
    EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER AS mes,
    
    -- Alunos iniciais do mês
    (SELECT COUNT(*) FROM alunos a 
     WHERE a.professor_atual_id = p.id 
     AND a.status = 'ativo'
     AND a.data_matricula < DATE_TRUNC('month', CURRENT_DATE))::INTEGER AS alunos_iniciais,
    
    -- Matrículas do mês
    (SELECT COUNT(*) FROM alunos a 
     WHERE a.professor_atual_id = p.id 
     AND DATE_TRUNC('month', a.data_matricula) = DATE_TRUNC('month', CURRENT_DATE))::INTEGER AS matriculas_mes,
    
    -- Evasões do mês (tipo 1=interrompido, 3=aviso prévio)
    (SELECT COUNT(*) FROM evasoes_v2 e 
     WHERE e.professor_id = p.id 
     AND DATE_TRUNC('month', e.data_evasao) = DATE_TRUNC('month', CURRENT_DATE)
     AND e.tipo_saida_id IN (1, 3))::INTEGER AS evasoes_mes,
    
    -- Não renovações do mês (tipo 2)
    (SELECT COUNT(*) FROM evasoes_v2 e 
     WHERE e.professor_id = p.id 
     AND DATE_TRUNC('month', e.data_evasao) = DATE_TRUNC('month', CURRENT_DATE)
     AND e.tipo_saida_id = 2)::INTEGER AS nao_renovacoes_mes,
    
    -- Taxa bruta
    CASE 
        WHEN (SELECT COUNT(*) FROM alunos a 
              WHERE a.professor_atual_id = p.id 
              AND a.status = 'ativo'
              AND a.data_matricula < DATE_TRUNC('month', CURRENT_DATE)) > 0 
        THEN (
            (
                (SELECT COUNT(*) FROM alunos a 
                 WHERE a.professor_atual_id = p.id 
                 AND DATE_TRUNC('month', a.data_matricula) = DATE_TRUNC('month', CURRENT_DATE))
                -
                (SELECT COUNT(*) FROM evasoes_v2 e 
                 WHERE e.professor_id = p.id 
                 AND DATE_TRUNC('month', e.data_evasao) = DATE_TRUNC('month', CURRENT_DATE))
            )::DECIMAL 
            / 
            NULLIF((SELECT COUNT(*) FROM alunos a 
                    WHERE a.professor_atual_id = p.id 
                    AND a.status = 'ativo'
                    AND a.data_matricula < DATE_TRUNC('month', CURRENT_DATE)), 0)
        ) * 100
        ELSE 0
    END AS taxa_crescimento_bruta,
    
    -- Taxa ajustada (com fator)
    CASE 
        WHEN (SELECT COUNT(*) FROM alunos a 
              WHERE a.professor_atual_id = p.id 
              AND a.status = 'ativo'
              AND a.data_matricula < DATE_TRUNC('month', CURRENT_DATE)) > 0 
        THEN (
            (
                (SELECT COUNT(*) FROM alunos a 
                 WHERE a.professor_atual_id = p.id 
                 AND DATE_TRUNC('month', a.data_matricula) = DATE_TRUNC('month', CURRENT_DATE))
                -
                (SELECT COUNT(*) FROM evasoes_v2 e 
                 WHERE e.professor_id = p.id 
                 AND DATE_TRUNC('month', e.data_evasao) = DATE_TRUNC('month', CURRENT_DATE))
            )::DECIMAL 
            / 
            NULLIF((SELECT COUNT(*) FROM alunos a 
                    WHERE a.professor_atual_id = p.id 
                    AND a.status = 'ativo'
                    AND a.data_matricula < DATE_TRUNC('month', CURRENT_DATE)), 0)
        ) * 100 * COALESCE(c.fator_demanda, 1.0)
        ELSE 0
    END AS taxa_crescimento_ajustada

FROM professores p
LEFT JOIN cursos c ON p.curso_principal_id = c.id
WHERE p.ativo = true;
```

---

## 5. ALTERAÇÕES NO FRONTEND

### 5.1 Tela de Configurações - Sliders de Pesos

**Estrutura atual dos sliders:**
- ❌ REMOVER: Slider "NPS"
- ✅ MANTER: Média/Turma (20%), Retenção (25%), Conversão (15%), Presença (15%), Evasões (10%)
- 🆕 ADICIONAR: Slider "Taxa de Crescimento" (15%)

**Wireframe dos Sliders:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 🏥 Health Score - Pesos dos Fatores                    100% ✓   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📈 Taxa de Crescimento                                          │
│    Crescimento da carteira com fator de demanda                 │
│ ●━━━━━━━━━━━━━━━━━━━━━━━○───────────────────────────────  15%   │
│                                                                 │
│ 👥 Média/Turma                                                  │
│ ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○───────────────────────  20%   │
│                                                                 │
│ 🔄 Retenção                                                     │
│ ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○───────────────  25%   │
│                                                                 │
│ 🎯 Conversão                                                    │
│ ●━━━━━━━━━━━━━━━━━━━━━━━○───────────────────────────────  15%   │
│                                                                 │
│ 📅 Presença                                                     │
│ ●━━━━━━━━━━━━━━━━━━━━━━━○───────────────────────────────  15%   │
│                                                                 │
│ 🚪 Evasões (menos = melhor)                                     │
│ ●━━━━━━━━━━━━━━━━━○─────────────────────────────────────  10%   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Nova Seção: Fator de Demanda por Curso

**Criar nova seção colapsável abaixo dos sliders:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 🎵 Fator de Demanda por Curso                            ▼      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────┬─────────┬────────┬─────────────────────────┐   │
│ │ Curso       │ Alunos  │ %      │ Fator                   │   │
│ ├─────────────┼─────────┼────────┼─────────────────────────┤   │
│ │ 🎸 Violão   │ 180     │ 20%    │ [1.0 ▼]                 │   │
│ │ 🥁 Bateria  │ 150     │ 17%    │ [1.0 ▼]                 │   │
│ │ 🎹 Teclado  │ 100     │ 11%    │ [1.5 ▼]                 │   │
│ │ 🎤 Canto    │ 80      │ 9%     │ [2.0 ▼]                 │   │
│ │ 🎸 Guitarra │ 70      │ 8%     │ [2.0 ▼]                 │   │
│ │ 🎹 Piano    │ 60      │ 7%     │ [2.0 ▼]                 │   │
│ │ 🎸 Baixo    │ 40      │ 4%     │ [2.5 ▼]                 │   │
│ │ 🎻 Violino  │ 20      │ 2%     │ [2.5 ▼]                 │   │
│ └─────────────┴─────────┴────────┴─────────────────────────┘   │
│                                                                 │
│ Dropdown options: [1.0] [1.5] [2.0] [2.5] [3.0]                │
│                                                                 │
│ ⓘ Cursos grandes (≥15%) = 1.0 | Cursos pequenos (<2%) = 3.0    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Componente:**
- Tabela com todos os cursos
- Coluna "Alunos" = COUNT de alunos ativos por curso
- Coluna "%" = (alunos do curso / total) * 100
- Coluna "Fator" = Dropdown com opções: 1.0, 1.5, 2.0, 2.5, 3.0
- Ao mudar o dropdown, salva no banco (tabela `cursos.fator_demanda`)

### 5.3 Tabela de Professores

**Adicionar coluna mostrando o fator do curso:**

```
│ Professor      │ Health │ Curso (Fator) │ Alunos │ ... │
│ João Silva     │  78    │ Violão (1.0)  │   25   │ ... │
│ Maria Santos   │  72    │ Canto (2.0)   │   18   │ ... │
│ Pedro Costa    │  58    │ Violino (2.5) │   12   │ ... │
```

---

## 6. EXEMPLOS DE CÁLCULO

### 6.1 Professor de Violão (Fator 1.0)

```
Dados:
- Alunos iniciais: 25
- Matrículas: 3, Evasões: 1, Não Renovações: 1
- Média/Turma: 2.1, Retenção: 90%, Conversão: 60%, Presença: 92%

Cálculos:
1. Crescimento: ((3-1-1)/25)*100 = 4% × 1.0 = 4%
   Pontos: ((4+10)/30)*100 = 46.7

2. Média/Turma: (2.1/3.0)*100 = 70.0

3. Retenção: 90.0

4. Conversão: 60.0

5. Presença: 92.0

6. Evasões: 100 - ((1/25)*100*10) = 60.0

Health Score:
= 46.7×0.15 + 70×0.20 + 90×0.25 + 60×0.15 + 92×0.15 + 60×0.10
= 7.0 + 14.0 + 22.5 + 9.0 + 13.8 + 6.0
= 72.3 → 🟢 Saudável
```

### 6.2 Professor de Violino (Fator 2.5)

```
Dados:
- Alunos iniciais: 8
- Matrículas: 1, Evasões: 0, Não Renovações: 0
- Média/Turma: 1.3, Retenção: 100%, Conversão: 50%, Presença: 85%

Cálculos:
1. Crescimento: ((1-0-0)/8)*100 = 12.5% × 2.5 = 31.25%
   Pontos: ((31.25+10)/30)*100 = 100 (cap)

2. Média/Turma: (1.3/3.0)*100 = 43.3

3. Retenção: 100.0

4. Conversão: 50.0

5. Presença: 85.0

6. Evasões: 100 (0 evasões)

Health Score:
= 100×0.15 + 43.3×0.20 + 100×0.25 + 50×0.15 + 85×0.15 + 100×0.10
= 15.0 + 8.7 + 25.0 + 7.5 + 12.75 + 10.0
= 78.95 → 🟢 Saudável
```

---

## 7. CHECKLIST DE IMPLEMENTAÇÃO

### 7.1 Backend (Supabase)

- [ ] Adicionar coluna `fator_demanda` na tabela `cursos`
- [ ] Criar tabela `config_health_score`
- [ ] Popular valores iniciais de fator por curso
- [ ] Criar view `vw_taxa_crescimento_professor`
- [ ] Atualizar cálculo do Health Score nas views existentes

### 7.2 Frontend (React)

- [ ] Remover slider de NPS (se existir)
- [ ] Adicionar slider "Taxa de Crescimento" (15%)
- [ ] Definir valores default: Crescimento 15%, Média 20%, Retenção 25%, Conversão 15%, Presença 15%, Evasões 10%
- [ ] Criar seção colapsável "Fator de Demanda por Curso"
- [ ] Criar tabela de cursos com dropdown de fator (1.0 a 3.0)
- [ ] Mostrar fator do curso na tabela de professores
- [ ] Implementar cálculo do Health Score com as fórmulas

### 7.3 Testes

- [ ] Testar cálculo com professor de curso grande (fator 1.0)
- [ ] Testar cálculo com professor de curso pequeno (fator 2.5 ou 3.0)
- [ ] Testar mudança de pesos via sliders
- [ ] Testar mudança de fator via dropdown
- [ ] Verificar classificação (Saudável ≥70, Atenção 50-69, Crítico <50)

---

## RESUMO RÁPIDO

| O que fazer | Descrição |
|-------------|-----------|
| ❌ Remover | Slider NPS |
| 🆕 Adicionar | Slider "Taxa de Crescimento" (15%) |
| 🆕 Adicionar | Seção "Fator de Demanda por Curso" |
| 🆕 Adicionar | Coluna `cursos.fator_demanda` |
| 🔄 Ajustar | Pesos: Retenção 25%, Presença 15% |
| 🔄 Atualizar | Fórmula do Health Score |

---

*Documento técnico para implementação - LA Performance Report*