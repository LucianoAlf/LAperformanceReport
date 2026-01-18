# 📊 KPIs LA MUSIC - DOCUMENTAÇÃO COMPLETA

> **Versão:** 1.0  
> **Data:** 18/01/2026  
> **Projeto:** LA Music Performance Report 2026

---

## 📋 ÍNDICE

1. [Visão Geral](#1-visão-geral)
2. [Regras de Negócio](#2-regras-de-negócio)
3. [KPIs de Gestão/Retenção](#3-kpis-de-gestãoretenção)
4. [KPIs Comerciais](#4-kpis-comerciais)
5. [KPIs de Professor](#5-kpis-de-professor)
6. [Estrutura do Banco de Dados](#6-estrutura-do-banco-de-dados)
7. [Views e Funções](#7-views-e-funções)
8. [Resumo Consolidado](#8-resumo-consolidado)

---

## 1. VISÃO GERAL

### 1.1 Resumo Quantitativo

| Seção | Entrada Manual | Cálculo Automático | Total |
|-------|:--------------:|:------------------:|:-----:|
| Gestão/Retenção | 18 | 12 | **30** |
| Comercial | 16 | 8 | **24** |
| Professor | 10 | 11 | **21** |
| **TOTAL** | **44** | **31** | **75** |

### 1.2 Unidades

| Código | Nome | Status |
|--------|------|--------|
| CG | Campo Grande | ✅ Ativa |
| REC | Recreio | ✅ Ativa |
| BAR | Barra | ✅ Ativa |

---

## 2. REGRAS DE NEGÓCIO

### 2.1 Contrato e Permanência

| Regra | Valor |
|-------|-------|
| Duração do contrato | 12 meses |
| Aviso prévio | Paga mês atual + próximo |
| Renovação | Ao final dos 12 meses |
| LTV mínimo | Só alunos com 4+ meses |

### 2.2 Quem Entra nos Cálculos Financeiros

| Tipo de Aluno | Ticket Médio | LTV | Churn | Conta como Pagante |
|---------------|:------------:|:---:|:-----:|:------------------:|
| Regular (EMLA/LAMK) | ✅ | ✅ | ✅ | ✅ |
| Segundo Curso | ✅ (eleva) | ✅ | ✅ | ✅ (conta como 1) |
| Bolsista Integral | ❌ | ❌ | ❌ | ❌ |
| Bolsista Parcial | ❌ | ❌ | ❌ | ❌ |
| Matrícula em Banda | ❌ | ❌ | ❌ | ❌ |

### 2.3 Tipos de Saída

| Tipo | Código | Descrição |
|------|--------|-----------|
| Interrompido | `INTERROMPIDO` | Cancelou no meio do contrato de 12 meses |
| Não Renovou | `NAO_RENOVOU` | Contrato venceu e não renovou |
| Aviso Prévio | `AVISO_PREVIO` | Avisou que vai sair (paga mês atual + próximo) |
| Transferência | `TRANSFERENCIA` | Mudou de unidade |

### 2.4 Professores

| Contexto | Campo | Descrição |
|----------|-------|-----------|
| Matrícula | `professor_experimental_id` | Professor que deu a aula experimental |
| Matrícula | `professor_atual_id` | Professor que vai dar aulas (pode ser diferente) |
| Evasão | `professor_id` | Professor que dava aula (o fixo, não o experimental) |

---

## 3. KPIs DE GESTÃO/RETENÇÃO

### 3.1 Campos de Entrada (18 campos)

| # | Campo | Tipo | Descrição | Fonte |
|---|-------|------|-----------|-------|
| 1 | `competencia_mes` | DATE | Mês/Ano de referência | Snapshot |
| 2 | `unidade_id` | UUID | FK → tabela unidades | Snapshot |
| 3 | `total_alunos_ativos` | INTEGER | Quantidade total matriculados | Snapshot |
| 4 | `total_alunos_pagantes` | INTEGER | Preenchido manualmente | Snapshot |
| 5 | `total_alunos_bolsistas` | INTEGER | Integral + Parcial | Snapshot |
| 6 | `novas_matriculas` | INTEGER | Quantidade no mês | Planilha Comercial |
| 7 | `cursos_novas_matriculas` | INTEGER[] | FK → tabela cursos (múltiplos) | Planilha Comercial |
| 8 | `professor_nova_matricula` | INTEGER[] | FK → tabela professores (múltiplos) | Planilha Comercial |
| 9 | `evasoes_alunos` | INTEGER | Quantidade no mês | Planilha Retenção |
| 10 | `professor_churn` | INTEGER[] | FK → tabela professores | Planilha Retenção |
| 11 | `curso_churn` | INTEGER[] | FK → tabela cursos | Planilha Retenção |
| 12 | `renovacoes_alunos` | INTEGER | Quantidade no mês | Planilha Retenção |
| 13 | `nao_renovacoes_alunos` | INTEGER | Quantidade no mês | Planilha Retenção |
| 14 | `motivos_nao_renovacoes` | INTEGER[] | FK → tabela motivos | Planilha Retenção |
| 15 | `cancelamento_matriculas` | INTEGER | Interrupções no mês | Planilha Retenção |
| 16 | `motivos_cancelamentos` | INTEGER[] | FK → tabela motivos | Planilha Retenção |
| 17 | `reajustes_parcelas_pct` | DECIMAL | % médio de reajuste aplicado | Planilha Retenção |
| 18 | `ticket_medio_passaporte` | DECIMAL | Valor médio do passaporte | Planilha Comercial |
| 19 | `faturamento_parcelas_realizado` | DECIMAL | Valor real recebido | Financeiro |
| 20 | `alunos_aviso_previo` | INTEGER | Quantidade em aviso | Planilha Retenção |
| 21 | `nps_evasoes` | DECIMAL | Nota NPS médio das evasões | Pesquisa |

### 3.2 Campos Calculados (12 campos)

| # | Campo | Fórmula | SQL/Lógica |
|---|-------|---------|------------|
| 1 | `churn_pct` | `(evasoes / total_alunos_ativos) × 100` | `ROUND((evasoes_alunos::DECIMAL / NULLIF(total_alunos_ativos, 0)) * 100, 2)` |
| 2 | `renovacoes_pct` | `(renovacoes / (renovacoes + nao_renovacoes)) × 100` | `ROUND((renovacoes_alunos::DECIMAL / NULLIF(renovacoes_alunos + nao_renovacoes_alunos, 0)) * 100, 2)` |
| 3 | `cancelamento_pct` | `(cancelamentos / total_alunos) × 100` | `ROUND((cancelamento_matriculas::DECIMAL / NULLIF(total_alunos_ativos, 0)) * 100, 2)` |
| 4 | `tempo_permanencia_meses` | Média de meses (só 4+) | `AVG(meses) WHERE meses >= 4` |
| 5 | `ticket_medio_parcelas` | `faturamento / alunos_pagantes` | `ROUND(faturamento_parcelas_realizado / NULLIF(total_alunos_pagantes, 0), 2)` |
| 6 | `ltv` | `ticket_medio × tempo_permanencia` | `ticket_medio_parcelas * tempo_permanencia_meses` |
| 7 | `faturamento_parcelas_previsto` | `alunos_pagantes × ticket_medio` | `total_alunos_pagantes * ticket_medio_parcelas` |
| 8 | `inadimplencia` | `previsto - realizado` | `faturamento_parcelas_previsto - faturamento_parcelas_realizado` |
| 9 | `inadimplencia_pct` | `(inadimplencia / previsto) × 100` | `ROUND((inadimplencia / NULLIF(faturamento_parcelas_previsto, 0)) * 100, 2)` |
| 10 | `total_evasoes` | `interrompidos + nao_renovacoes` | `cancelamento_matriculas + nao_renovacoes_alunos` |
| 11 | `mrr_perdido` | Soma parcelas dos evadidos | `SUM(valor_parcela) FROM evasoes_v2 WHERE mes = competencia` |
| 12 | `renovacoes_pendentes` | `previstas - realizadas - nao_renovacoes` | `renovacoes_previstas - renovacoes_alunos - nao_renovacoes_alunos` |

---

## 4. KPIs COMERCIAIS

### 4.1 Campos de Entrada (16 campos)

| # | Campo | Tipo | Descrição | Fonte |
|---|-------|------|-----------|-------|
| 1 | `competencia_mes` | DATE | Mês/Ano | Automático |
| 2 | `unidade_id` | UUID | FK → unidades | Automático |
| 3 | `total_leads` | INTEGER | Quantidade de leads no mês | Planilha Comercial |
| 4 | `curso_interesse_lead` | INTEGER[] | FK → cursos (múltiplos) | Planilha Comercial |
| 5 | `canal_lead` | INTEGER[] | FK → canais (Instagram, Google, etc) | Planilha Comercial |
| 6 | `leads_nao_responderam` | INTEGER | Leads arquivados sem resposta | Planilha Comercial |
| 7 | `motivo_arquivamento_leads` | INTEGER[] | FK → motivos_arquivamento | Planilha Comercial |
| 8 | `aulas_experimentais_marcadas` | INTEGER | Aulas agendadas | Planilha Comercial |
| 9 | `aulas_experimentais_realizadas` | INTEGER | Aulas que aconteceram | Planilha Comercial |
| 10 | `professor_experimental` | INTEGER[] | FK → professores | Planilha Comercial |
| 11 | `canal_novas_matriculas` | INTEGER[] | FK → canais | Planilha Comercial |
| 12 | `motivo_nao_matricula_experimental` | INTEGER[] | FK → motivos | Planilha Comercial |
| 13 | `novas_matriculas` | INTEGER | Quantidade de passaportes | Planilha Comercial |
| 14 | `curso_novas_matriculas` | INTEGER[] | FK → cursos | Planilha Comercial |
| 15 | `professor_novas_matriculas` | INTEGER[] | FK → professores | Planilha Comercial |
| 16 | `horario_novas_matriculas` | VARCHAR[] | Faixa de horário | Planilha Comercial |
| 17 | `ticket_medio_passaporte_novas` | DECIMAL | Valor médio passaporte | Planilha Comercial |

### 4.2 Campos Calculados (8 campos)

| # | Campo | Fórmula | SQL/Lógica |
|---|-------|---------|------------|
| 1 | `faltaram_experimental` | `marcadas - realizadas` | `aulas_experimentais_marcadas - aulas_experimentais_realizadas` |
| 2 | `taxa_conversao_lead_exp` | `(experimentais / leads) × 100` | `ROUND((aulas_experimentais_realizadas::DECIMAL / NULLIF(total_leads, 0)) * 100, 2)` |
| 3 | `taxa_conversao_exp_mat` | `(matriculas / experimentais) × 100` | `ROUND((novas_matriculas::DECIMAL / NULLIF(aulas_experimentais_realizadas, 0)) * 100, 2)` |
| 4 | `taxa_conversao_experimental_professor` | Por professor | Agregado por professor_experimental |
| 5 | `taxa_conversao_matricula_canal` | Por canal | Agregado por canal_novas_matriculas |
| 6 | `ticket_medio_parcela_novas` | Média das parcelas novas | `AVG(valor_parcela) FROM alunos WHERE data_matricula IN mes` |
| 7 | `faturamento_novas_parcelas` | `matriculas × ticket` | `novas_matriculas * ticket_medio_parcela_novas` |
| 8 | `faturamento_passaporte` | Total passaportes | `SUM(valor_passaporte) FROM alunos WHERE data_matricula IN mes` |

---

## 5. KPIs DE PROFESSOR

### 5.1 Campos de Entrada (10 campos)

| # | Campo | Tipo | Descrição | Fonte |
|---|-------|------|-----------|-------|
| 1 | `competencia_mes` | DATE | Mês/Ano | Automático |
| 2 | `unidade_id` | UUID | FK → unidades | Automático |
| 3 | `professor_id` | INTEGER | FK → professores | Seleção |
| 4 | `qtd_alunos_professor` | INTEGER | Carteira do professor | Calculado de alunos |
| 5 | `experimentais_professor` | INTEGER | Quantidade de experimentais | Planilha Comercial |
| 6 | `churn_por_professor` | INTEGER | Quantidade evasões | Planilha Retenção |
| 7 | `motivo_churn_professor` | INTEGER[] | FK → motivos | Planilha Retenção |
| 8 | `taxa_presencas_aluno` | DECIMAL | % presenças | Sistema externo |
| 9 | `nps_professor` | DECIMAL | Nota NPS | Pesquisa |
| 10 | `media_alunos_turma_professor` | DECIMAL | Quantidade média por turma | Calculado |

### 5.2 Campos Calculados (11 campos)

| # | Campo | Fórmula | SQL/Lógica |
|---|-------|---------|------------|
| 1 | `matriculas_professor` | Contagem de matrículas | `COUNT(*) FROM alunos WHERE professor_experimental_id = X AND mes` |
| 2 | `taxa_conversao_professor` | `(matriculas / experimentais) × 100` | `ROUND((matriculas_professor::DECIMAL / NULLIF(experimentais_professor, 0)) * 100, 2)` |
| 3 | `ranking_professor_matriculador` | Posição no ranking | `RANK() OVER (ORDER BY taxa_conversao_professor DESC)` |
| 4 | `renovacoes_professor` | Contagem renovações | `COUNT(*) FROM renovacoes WHERE professor_id = X AND mes` |
| 5 | `taxa_renovacao_professor` | % renovação | `ROUND((renovacoes / NULLIF(contratos_vencendo, 0)) * 100, 2)` |
| 6 | `taxa_nao_renovacao_professor` | `100 - taxa_renovacao` | `100 - taxa_renovacao_professor` |
| 7 | `ranking_professor_renovador` | Posição no ranking | `RANK() OVER (ORDER BY taxa_renovacao_professor DESC)` |
| 8 | `taxa_cancelamento_professor` | % cancelamentos | `ROUND((churn_por_professor::DECIMAL / NULLIF(qtd_alunos_professor, 0)) * 100, 2)` |
| 9 | `ranking_professor_churn` | Posição (invertido - menor é melhor) | `RANK() OVER (ORDER BY taxa_cancelamento_professor ASC)` |
| 10 | `ticket_medio_professor` | Média dos alunos | `AVG(valor_parcela) FROM alunos WHERE professor_atual_id = X` |
| 11 | `mrr_perdido_professor` | `evasoes × ticket_medio` | `SUM(valor_parcela) FROM evasoes_v2 WHERE professor_id = X AND mes` |
| 12 | `taxa_faltas_aluno` | `100 - presencas` | `100 - taxa_presencas_aluno` |
| 13 | `media_alunos_turma_geral` | Média da unidade | `AVG(media_alunos_turma_professor) WHERE unidade_id = X` |

---

## 6. ESTRUTURA DO BANCO DE DADOS

### 6.1 Tabelas Mestras (Dropdowns)

#### 6.1.1 `unidades`
```sql
CREATE TABLE unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(10) NOT NULL UNIQUE,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO unidades (codigo, nome) VALUES
  ('CG', 'Campo Grande'),
  ('REC', 'Recreio'),
  ('BAR', 'Barra');
```

#### 6.1.2 `professores`
```sql
CREATE TABLE professores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  unidade_id UUID REFERENCES unidades(id),
  email VARCHAR(255),
  telefone VARCHAR(20),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_professores_unidade ON professores(unidade_id);
CREATE INDEX idx_professores_ativo ON professores(ativo);
```

#### 6.1.3 `cursos`
```sql
CREATE TABLE cursos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  categoria VARCHAR(50), -- 'EMLA' ou 'LAMK'
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO cursos (nome, categoria) VALUES
  ('Violão', 'EMLA'),
  ('Guitarra', 'EMLA'),
  ('Bateria', 'EMLA'),
  ('Teclado', 'EMLA'),
  ('Piano', 'EMLA'),
  ('Canto', 'EMLA'),
  ('Violino', 'EMLA'),
  ('Baixo', 'EMLA'),
  ('Ukulele', 'EMLA'),
  ('Saxofone', 'EMLA'),
  ('Flauta', 'EMLA'),
  ('Musicalização', 'LAMK'),
  ('Musicalização Preparatória', 'LAMK'),
  ('Baby Class', 'LAMK'),
  ('Kids Band', 'LAMK'),
  ('Teen Band', 'LAMK');
```

#### 6.1.4 `canais_origem`
```sql
CREATE TABLE canais_origem (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO canais_origem (nome) VALUES
  ('Instagram'),
  ('Facebook'),
  ('Google'),
  ('Site'),
  ('Ligação'),
  ('Visita/Placa'),
  ('Indicação'),
  ('Ex-aluno'),
  ('Convênios');
```

#### 6.1.5 `motivos_saida`
```sql
CREATE TABLE motivos_saida (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  categoria VARCHAR(50), -- 'FINANCEIRO', 'PESSOAL', 'INSATISFACAO', 'OUTRO'
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO motivos_saida (nome, categoria) VALUES
  ('Dificuldade financeira', 'FINANCEIRO'),
  ('Falta de tempo', 'PESSOAL'),
  ('Mudança de endereço', 'PESSOAL'),
  ('Desistência', 'PESSOAL'),
  ('Saúde', 'PESSOAL'),
  ('Incompatibilidade de horário', 'PESSOAL'),
  ('Priorizar estudos regulares', 'PESSOAL'),
  ('Inadimplente', 'FINANCEIRO'),
  ('Nova atividade', 'PESSOAL'),
  ('Problemas pessoais/família', 'PESSOAL'),
  ('Insatisfação com professor', 'INSATISFACAO'),
  ('Insatisfação com escola', 'INSATISFACAO'),
  ('Outro', 'OUTRO');
```

#### 6.1.6 `motivos_arquivamento`
```sql
CREATE TABLE motivos_arquivamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO motivos_arquivamento (nome) VALUES
  ('Não respondeu'),
  ('Desistiu'),
  ('Fora do perfil'),
  ('Preço'),
  ('Horário incompatível'),
  ('Distância'),
  ('Outro');
```

#### 6.1.7 `tipos_saida`
```sql
CREATE TABLE tipos_saida (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(50) NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO tipos_saida (codigo, nome, descricao) VALUES
  ('INTERROMPIDO', 'Interrompido', 'Cancelou no meio do contrato de 12 meses'),
  ('NAO_RENOVOU', 'Não Renovou', 'Contrato venceu e não renovou'),
  ('AVISO_PREVIO', 'Aviso Prévio', 'Avisou que vai sair (paga mês atual + próximo)'),
  ('TRANSFERENCIA', 'Transferência', 'Mudou de unidade');
```

#### 6.1.8 `tipos_matricula`
```sql
CREATE TABLE tipos_matricula (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(50) NOT NULL,
  entra_ticket_medio BOOLEAN DEFAULT true,
  entra_ltv BOOLEAN DEFAULT true,
  entra_churn BOOLEAN DEFAULT true,
  conta_como_pagante BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO tipos_matricula (codigo, nome, entra_ticket_medio, entra_ltv, entra_churn, conta_como_pagante) VALUES
  ('REGULAR', 'Regular (EMLA/LAMK)', true, true, true, true),
  ('SEGUNDO_CURSO', 'Segundo Curso', true, true, true, true),
  ('BOLSISTA_INT', 'Bolsista Integral', false, false, false, false),
  ('BOLSISTA_PARC', 'Bolsista Parcial', false, false, false, false),
  ('BANDA', 'Matrícula em Banda', false, false, false, false);
```

#### 6.1.9 `formas_pagamento`
```sql
CREATE TABLE formas_pagamento (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(50) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO formas_pagamento (codigo, nome) VALUES
  ('CR', 'Crédito Recorrente'),
  ('CHEQUE', 'Cheque'),
  ('PIX', 'Pix'),
  ('DINHEIRO', 'Dinheiro'),
  ('LINK', 'Link de Pagamento');
```

#### 6.1.10 `horarios`
```sql
CREATE TABLE horarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(20) NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO horarios (nome, hora_inicio, hora_fim) VALUES
  ('Manhã', '08:00', '12:00'),
  ('Tarde', '12:00', '18:00'),
  ('Noite', '18:00', '22:00');
```

---

### 6.2 Tabelas Principais

#### 6.2.1 `alunos`
```sql
CREATE TABLE alunos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  idade INTEGER,
  email VARCHAR(255),
  telefone VARCHAR(20),
  whatsapp VARCHAR(20),
  
  -- Relacionamentos
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  curso_id INTEGER REFERENCES cursos(id),
  professor_atual_id INTEGER REFERENCES professores(id),
  professor_experimental_id INTEGER REFERENCES professores(id),
  tipo_matricula_id INTEGER REFERENCES tipos_matricula(id),
  canal_origem_id INTEGER REFERENCES canais_origem(id),
  forma_pagamento_id INTEGER REFERENCES formas_pagamento(id),
  
  -- Valores
  valor_parcela DECIMAL(10,2),
  valor_passaporte DECIMAL(10,2),
  
  -- Datas
  data_matricula DATE NOT NULL,
  data_saida DATE,
  data_vencimento_contrato DATE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'ativo', -- 'ativo', 'inativo', 'aviso_previo', 'trancado'
  is_aluno_retorno BOOLEAN DEFAULT false,
  is_segundo_curso BOOLEAN DEFAULT false,
  
  -- Metadados
  agente_comercial VARCHAR(100),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER
);

-- Índices
CREATE INDEX idx_alunos_unidade ON alunos(unidade_id);
CREATE INDEX idx_alunos_professor_atual ON alunos(professor_atual_id);
CREATE INDEX idx_alunos_professor_exp ON alunos(professor_experimental_id);
CREATE INDEX idx_alunos_status ON alunos(status);
CREATE INDEX idx_alunos_data_matricula ON alunos(data_matricula);
CREATE INDEX idx_alunos_tipo_matricula ON alunos(tipo_matricula_id);
```

#### 6.2.2 `evasoes_v2`
```sql
CREATE TABLE evasoes_v2 (
  id SERIAL PRIMARY KEY,
  
  -- Relacionamentos
  aluno_id INTEGER REFERENCES alunos(id),
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  tipo_saida_id INTEGER REFERENCES tipos_saida(id) NOT NULL,
  motivo_saida_id INTEGER REFERENCES motivos_saida(id),
  professor_id INTEGER REFERENCES professores(id),
  curso_id INTEGER REFERENCES cursos(id),
  
  -- Dados
  data_evasao DATE NOT NULL DEFAULT CURRENT_DATE,
  valor_parcela DECIMAL(10,2),
  situacao_pagamento VARCHAR(20) DEFAULT 'em_dia', -- 'em_dia', 'inadimplente'
  data_prevista_saida DATE, -- Para avisos prévios
  nps_saida DECIMAL(3,1), -- Nota de 0 a 10
  
  -- Metadados
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER
);

-- Índices
CREATE INDEX idx_evasoes_unidade ON evasoes_v2(unidade_id);
CREATE INDEX idx_evasoes_data ON evasoes_v2(data_evasao);
CREATE INDEX idx_evasoes_tipo ON evasoes_v2(tipo_saida_id);
CREATE INDEX idx_evasoes_motivo ON evasoes_v2(motivo_saida_id);
CREATE INDEX idx_evasoes_professor ON evasoes_v2(professor_id);
CREATE INDEX idx_evasoes_mes ON evasoes_v2(DATE_TRUNC('month', data_evasao));
```

#### 6.2.3 `renovacoes`
```sql
CREATE TABLE renovacoes (
  id SERIAL PRIMARY KEY,
  
  -- Relacionamentos
  aluno_id INTEGER REFERENCES alunos(id) NOT NULL,
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  professor_id INTEGER REFERENCES professores(id),
  
  -- Dados
  data_renovacao DATE NOT NULL DEFAULT CURRENT_DATE,
  valor_anterior DECIMAL(10,2),
  valor_novo DECIMAL(10,2),
  percentual_reajuste DECIMAL(5,2), -- Calculado: ((novo - anterior) / anterior) * 100
  
  -- Status
  status VARCHAR(20) DEFAULT 'realizada', -- 'realizada', 'nao_renovada', 'pendente'
  motivo_nao_renovacao_id INTEGER REFERENCES motivos_saida(id),
  
  -- Metadados
  agente VARCHAR(100),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER
);

-- Índices
CREATE INDEX idx_renovacoes_unidade ON renovacoes(unidade_id);
CREATE INDEX idx_renovacoes_data ON renovacoes(data_renovacao);
CREATE INDEX idx_renovacoes_status ON renovacoes(status);
CREATE INDEX idx_renovacoes_mes ON renovacoes(DATE_TRUNC('month', data_renovacao));

-- Trigger para calcular percentual
CREATE OR REPLACE FUNCTION calc_percentual_reajuste()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.valor_anterior > 0 THEN
    NEW.percentual_reajuste := ROUND(((NEW.valor_novo - NEW.valor_anterior) / NEW.valor_anterior) * 100, 2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_reajuste
  BEFORE INSERT OR UPDATE ON renovacoes
  FOR EACH ROW EXECUTE FUNCTION calc_percentual_reajuste();
```

#### 6.2.4 `leads_diarios`
```sql
CREATE TABLE leads_diarios (
  id SERIAL PRIMARY KEY,
  
  -- Identificação
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Tipo do registro
  tipo VARCHAR(50) NOT NULL, -- 'LEAD', 'EXP_AGENDADA', 'EXP_REALIZADA', 'EXP_FALTOU', 'VISITA', 'MATRICULA'
  
  -- Relacionamentos opcionais
  canal_origem_id INTEGER REFERENCES canais_origem(id),
  curso_id INTEGER REFERENCES cursos(id),
  professor_id INTEGER REFERENCES professores(id), -- Professor da experimental
  
  -- Dados
  quantidade INTEGER NOT NULL DEFAULT 1,
  
  -- Metadados
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER
);

-- Índices
CREATE INDEX idx_leads_unidade ON leads_diarios(unidade_id);
CREATE INDEX idx_leads_data ON leads_diarios(data);
CREATE INDEX idx_leads_tipo ON leads_diarios(tipo);
CREATE INDEX idx_leads_mes ON leads_diarios(DATE_TRUNC('month', data));
CREATE INDEX idx_leads_canal ON leads_diarios(canal_origem_id);

-- Índice composto para queries frequentes
CREATE INDEX idx_leads_unidade_mes_tipo ON leads_diarios(unidade_id, DATE_TRUNC('month', data), tipo);
```

#### 6.2.5 `relatorios_diarios` (Snapshots)
```sql
CREATE TABLE relatorios_diarios (
  id SERIAL PRIMARY KEY,
  
  -- Identificação
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Dados de entrada
  alunos_ativos INTEGER NOT NULL DEFAULT 0,
  bolsistas_integral INTEGER DEFAULT 0,
  bolsistas_parcial INTEGER DEFAULT 0,
  matriculas_banda INTEGER DEFAULT 0,
  matriculas_segundo_curso INTEGER DEFAULT 0,
  trancados INTEGER DEFAULT 0,
  em_atraso INTEGER DEFAULT 0,
  faturamento_realizado DECIMAL(12,2) DEFAULT 0,
  
  -- Renovações
  renovacoes_previstas INTEGER DEFAULT 0,
  
  -- Calculados (serão preenchidos por trigger/view)
  alunos_pagantes INTEGER GENERATED ALWAYS AS (
    alunos_ativos - bolsistas_integral - bolsistas_parcial - matriculas_banda
  ) STORED,
  
  -- Metadados
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER,
  
  -- Constraint única
  UNIQUE(unidade_id, data)
);

-- Índices
CREATE INDEX idx_snapshots_unidade ON relatorios_diarios(unidade_id);
CREATE INDEX idx_snapshots_data ON relatorios_diarios(data);
CREATE INDEX idx_snapshots_mes ON relatorios_diarios(DATE_TRUNC('month', data));
```

#### 6.2.6 `metas`
```sql
CREATE TABLE metas (
  id SERIAL PRIMARY KEY,
  
  -- Identificação
  unidade_id UUID REFERENCES unidades(id), -- NULL = consolidado
  periodo_tipo VARCHAR(20) NOT NULL, -- 'MENSAL', 'TRIMESTRAL', 'ANUAL'
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER, -- Para metas mensais
  trimestre INTEGER, -- Para metas trimestrais (1-4)
  
  -- KPIs com meta
  meta_novas_matriculas INTEGER,
  meta_taxa_conversao_exp DECIMAL(5,2),
  meta_taxa_renovacao DECIMAL(5,2),
  meta_churn_max DECIMAL(5,2), -- Meta máxima (quanto menor, melhor)
  meta_faturamento DECIMAL(12,2),
  meta_ltv DECIMAL(10,2),
  meta_ticket_medio DECIMAL(10,2),
  meta_alunos_ativos INTEGER,
  
  -- Metadados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER,
  
  -- Constraints
  UNIQUE(unidade_id, periodo_tipo, ano, mes, trimestre)
);

-- Índices
CREATE INDEX idx_metas_unidade ON metas(unidade_id);
CREATE INDEX idx_metas_periodo ON metas(periodo_tipo, ano);
```

#### 6.2.7 `audit_log`
```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  tabela VARCHAR(50) NOT NULL,
  registro_id INTEGER NOT NULL,
  acao VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  dados_anteriores JSONB,
  dados_novos JSONB,
  usuario_id INTEGER,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_audit_tabela ON audit_log(tabela);
CREATE INDEX idx_audit_registro ON audit_log(registro_id);
CREATE INDEX idx_audit_data ON audit_log(created_at);
```

---

### 6.3 Row Level Security (RLS)

```sql
-- Habilitar RLS
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE evasoes_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorios_diarios ENABLE ROW LEVEL SECURITY;

-- Políticas para perfil UNIDADE (vê só a própria)
CREATE POLICY "unidade_select_alunos" ON alunos
  FOR SELECT USING (
    unidade_id = (SELECT unidade_id FROM usuarios WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil = 'admin')
  );

CREATE POLICY "unidade_select_evasoes" ON evasoes_v2
  FOR SELECT USING (
    unidade_id = (SELECT unidade_id FROM usuarios WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil = 'admin')
  );

-- Repetir para outras tabelas...

-- Políticas de INSERT/UPDATE/DELETE
CREATE POLICY "unidade_insert_alunos" ON alunos
  FOR INSERT WITH CHECK (
    unidade_id = (SELECT unidade_id FROM usuarios WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil = 'admin')
  );
```

---

## 7. VIEWS E FUNÇÕES

### 7.1 View: KPIs Mensais por Unidade

```sql
CREATE OR REPLACE VIEW vw_kpis_mensais AS
WITH 
-- Snapshot do último dia do mês
snapshots AS (
  SELECT DISTINCT ON (unidade_id, DATE_TRUNC('month', data))
    unidade_id,
    DATE_TRUNC('month', data) AS mes,
    alunos_ativos,
    alunos_pagantes,
    bolsistas_integral,
    bolsistas_parcial,
    matriculas_banda,
    matriculas_segundo_curso,
    faturamento_realizado,
    renovacoes_previstas
  FROM relatorios_diarios
  ORDER BY unidade_id, DATE_TRUNC('month', data), data DESC
),

-- Agregados comerciais
comercial AS (
  SELECT
    unidade_id,
    DATE_TRUNC('month', data) AS mes,
    SUM(CASE WHEN tipo = 'LEAD' THEN quantidade ELSE 0 END) AS total_leads,
    SUM(CASE WHEN tipo = 'EXP_AGENDADA' THEN quantidade ELSE 0 END) AS exp_marcadas,
    SUM(CASE WHEN tipo = 'EXP_REALIZADA' THEN quantidade ELSE 0 END) AS exp_realizadas,
    SUM(CASE WHEN tipo = 'EXP_FALTOU' THEN quantidade ELSE 0 END) AS exp_faltaram,
    SUM(CASE WHEN tipo = 'MATRICULA' THEN quantidade ELSE 0 END) AS matriculas
  FROM leads_diarios
  GROUP BY unidade_id, DATE_TRUNC('month', data)
),

-- Agregados de evasão
evasoes AS (
  SELECT
    unidade_id,
    DATE_TRUNC('month', data_evasao) AS mes,
    COUNT(*) AS total_evasoes,
    COUNT(*) FILTER (WHERE tipo_saida_id = 1) AS interrompidos, -- INTERROMPIDO
    COUNT(*) FILTER (WHERE tipo_saida_id = 2) AS nao_renovacoes, -- NAO_RENOVOU
    COUNT(*) FILTER (WHERE tipo_saida_id = 3) AS avisos_previos, -- AVISO_PREVIO
    SUM(valor_parcela) AS mrr_perdido,
    AVG(nps_saida) AS nps_medio_evasoes
  FROM evasoes_v2
  GROUP BY unidade_id, DATE_TRUNC('month', data_evasao)
),

-- Agregados de renovação
renovacoes_agg AS (
  SELECT
    unidade_id,
    DATE_TRUNC('month', data_renovacao) AS mes,
    COUNT(*) FILTER (WHERE status = 'realizada') AS renovacoes_realizadas,
    COUNT(*) FILTER (WHERE status = 'nao_renovada') AS nao_renovadas,
    AVG(percentual_reajuste) FILTER (WHERE status = 'realizada') AS reajuste_medio
  FROM renovacoes
  GROUP BY unidade_id, DATE_TRUNC('month', data_renovacao)
),

-- Dados de alunos
alunos_stats AS (
  SELECT
    unidade_id,
    DATE_TRUNC('month', data_matricula) AS mes,
    COUNT(*) AS novas_matriculas,
    AVG(valor_parcela) AS ticket_medio_novas,
    SUM(valor_passaporte) AS faturamento_passaportes,
    AVG(valor_passaporte) AS ticket_medio_passaporte
  FROM alunos
  WHERE status = 'ativo'
  GROUP BY unidade_id, DATE_TRUNC('month', data_matricula)
),

-- LTV (alunos com 4+ meses)
ltv_calc AS (
  SELECT
    unidade_id,
    AVG(
      EXTRACT(MONTH FROM AGE(COALESCE(data_saida, CURRENT_DATE), data_matricula))
    ) AS tempo_permanencia_medio
  FROM alunos
  WHERE EXTRACT(MONTH FROM AGE(COALESCE(data_saida, CURRENT_DATE), data_matricula)) >= 4
  GROUP BY unidade_id
)

SELECT
  s.unidade_id,
  u.nome AS unidade_nome,
  s.mes,
  
  -- KPIs de Gestão
  s.alunos_ativos,
  s.alunos_pagantes,
  s.bolsistas_integral + s.bolsistas_parcial AS total_bolsistas,
  s.matriculas_banda,
  s.matriculas_segundo_curso,
  s.faturamento_realizado,
  
  -- Ticket Médio
  CASE WHEN s.alunos_pagantes > 0 
    THEN ROUND(s.faturamento_realizado / s.alunos_pagantes, 2)
    ELSE 0 
  END AS ticket_medio,
  
  -- Faturamento Previsto
  CASE WHEN s.alunos_pagantes > 0 
    THEN s.alunos_pagantes * ROUND(s.faturamento_realizado / s.alunos_pagantes, 2)
    ELSE 0 
  END AS faturamento_previsto,
  
  -- Inadimplência
  CASE WHEN s.alunos_pagantes > 0 
    THEN (s.alunos_pagantes * ROUND(s.faturamento_realizado / s.alunos_pagantes, 2)) - s.faturamento_realizado
    ELSE 0 
  END AS inadimplencia,
  
  -- LTV
  COALESCE(l.tempo_permanencia_medio, 0) AS tempo_permanencia_medio,
  CASE WHEN s.alunos_pagantes > 0 AND l.tempo_permanencia_medio > 0
    THEN ROUND((s.faturamento_realizado / s.alunos_pagantes) * l.tempo_permanencia_medio, 2)
    ELSE 0
  END AS ltv,
  
  -- KPIs Comerciais
  COALESCE(c.total_leads, 0) AS total_leads,
  COALESCE(c.exp_marcadas, 0) AS experimentais_marcadas,
  COALESCE(c.exp_realizadas, 0) AS experimentais_realizadas,
  COALESCE(c.exp_faltaram, 0) AS faltaram_experimental,
  COALESCE(c.matriculas, 0) AS novas_matriculas,
  
  -- Taxas de Conversão
  CASE WHEN c.total_leads > 0 
    THEN ROUND((c.exp_realizadas::DECIMAL / c.total_leads) * 100, 2)
    ELSE 0 
  END AS taxa_conversao_lead_exp,
  
  CASE WHEN c.exp_realizadas > 0 
    THEN ROUND((c.matriculas::DECIMAL / c.exp_realizadas) * 100, 2)
    ELSE 0 
  END AS taxa_conversao_exp_mat,
  
  -- Passaportes
  COALESCE(a.faturamento_passaportes, 0) AS faturamento_passaportes,
  COALESCE(a.ticket_medio_passaporte, 0) AS ticket_medio_passaporte,
  
  -- KPIs de Retenção
  s.renovacoes_previstas,
  COALESCE(r.renovacoes_realizadas, 0) AS renovacoes_realizadas,
  s.renovacoes_previstas - COALESCE(r.renovacoes_realizadas, 0) - COALESCE(r.nao_renovadas, 0) AS renovacoes_pendentes,
  COALESCE(r.nao_renovadas, 0) AS nao_renovacoes,
  
  -- Taxa de Renovação
  CASE WHEN s.renovacoes_previstas > 0 
    THEN ROUND((COALESCE(r.renovacoes_realizadas, 0)::DECIMAL / s.renovacoes_previstas) * 100, 2)
    ELSE 0 
  END AS taxa_renovacao,
  
  -- Reajuste Médio
  COALESCE(r.reajuste_medio, 0) AS reajuste_medio_pct,
  
  -- Evasões
  COALESCE(e.total_evasoes, 0) AS evasoes_total,
  COALESCE(e.interrompidos, 0) AS evasoes_interrompidos,
  COALESCE(e.nao_renovacoes, 0) AS evasoes_nao_renovacoes,
  COALESCE(e.avisos_previos, 0) AS avisos_previos,
  
  -- Churn Rate
  CASE WHEN s.alunos_ativos > 0 
    THEN ROUND((COALESCE(e.total_evasoes, 0)::DECIMAL / s.alunos_ativos) * 100, 2)
    ELSE 0 
  END AS churn_rate,
  
  -- MRR Perdido
  COALESCE(e.mrr_perdido, 0) AS mrr_perdido,
  
  -- NPS
  COALESCE(e.nps_medio_evasoes, 0) AS nps_evasoes

FROM snapshots s
LEFT JOIN unidades u ON s.unidade_id = u.id
LEFT JOIN comercial c ON s.unidade_id = c.unidade_id AND s.mes = c.mes
LEFT JOIN evasoes e ON s.unidade_id = e.unidade_id AND s.mes = e.mes
LEFT JOIN renovacoes_agg r ON s.unidade_id = r.unidade_id AND s.mes = r.mes
LEFT JOIN alunos_stats a ON s.unidade_id = a.unidade_id AND s.mes = a.mes
LEFT JOIN ltv_calc l ON s.unidade_id = l.unidade_id;
```

### 7.2 View: KPIs por Professor

```sql
CREATE OR REPLACE VIEW vw_kpis_professor AS
WITH 
professor_matriculas AS (
  SELECT
    professor_experimental_id AS professor_id,
    unidade_id,
    DATE_TRUNC('month', data_matricula) AS mes,
    COUNT(*) AS matriculas
  FROM alunos
  WHERE data_matricula IS NOT NULL
  GROUP BY professor_experimental_id, unidade_id, DATE_TRUNC('month', data_matricula)
),

professor_experimentais AS (
  SELECT
    professor_id,
    unidade_id,
    DATE_TRUNC('month', data) AS mes,
    SUM(quantidade) AS experimentais
  FROM leads_diarios
  WHERE tipo IN ('EXP_REALIZADA') AND professor_id IS NOT NULL
  GROUP BY professor_id, unidade_id, DATE_TRUNC('month', data)
),

professor_evasoes AS (
  SELECT
    professor_id,
    unidade_id,
    DATE_TRUNC('month', data_evasao) AS mes,
    COUNT(*) AS evasoes,
    SUM(valor_parcela) AS mrr_perdido
  FROM evasoes_v2
  WHERE professor_id IS NOT NULL
  GROUP BY professor_id, unidade_id, DATE_TRUNC('month', data_evasao)
),

professor_renovacoes AS (
  SELECT
    professor_id,
    unidade_id,
    DATE_TRUNC('month', data_renovacao) AS mes,
    COUNT(*) FILTER (WHERE status = 'realizada') AS renovacoes,
    COUNT(*) FILTER (WHERE status = 'nao_renovada') AS nao_renovacoes
  FROM renovacoes
  WHERE professor_id IS NOT NULL
  GROUP BY professor_id, unidade_id, DATE_TRUNC('month', data_renovacao)
),

professor_carteira AS (
  SELECT
    professor_atual_id AS professor_id,
    unidade_id,
    COUNT(*) AS qtd_alunos,
    AVG(valor_parcela) AS ticket_medio
  FROM alunos
  WHERE status = 'ativo' AND professor_atual_id IS NOT NULL
  GROUP BY professor_atual_id, unidade_id
)

SELECT
  p.id AS professor_id,
  p.nome AS professor_nome,
  p.unidade_id,
  u.nome AS unidade_nome,
  COALESCE(c.qtd_alunos, 0) AS carteira_alunos,
  COALESCE(c.ticket_medio, 0) AS ticket_medio_professor,
  
  -- Por mês (agregado dos últimos 12 meses)
  COALESCE(SUM(e.experimentais), 0) AS experimentais_total,
  COALESCE(SUM(m.matriculas), 0) AS matriculas_total,
  
  -- Taxa de Conversão
  CASE WHEN SUM(e.experimentais) > 0 
    THEN ROUND((SUM(m.matriculas)::DECIMAL / SUM(e.experimentais)) * 100, 2)
    ELSE 0 
  END AS taxa_conversao,
  
  -- Renovações
  COALESCE(SUM(r.renovacoes), 0) AS renovacoes_total,
  COALESCE(SUM(r.nao_renovacoes), 0) AS nao_renovacoes_total,
  
  -- Taxa de Renovação
  CASE WHEN SUM(r.renovacoes) + SUM(r.nao_renovacoes) > 0 
    THEN ROUND((SUM(r.renovacoes)::DECIMAL / (SUM(r.renovacoes) + SUM(r.nao_renovacoes))) * 100, 2)
    ELSE 0 
  END AS taxa_renovacao,
  
  -- Evasões
  COALESCE(SUM(ev.evasoes), 0) AS evasoes_total,
  COALESCE(SUM(ev.mrr_perdido), 0) AS mrr_perdido_total,
  
  -- Taxa de Cancelamento (Churn do professor)
  CASE WHEN c.qtd_alunos > 0 
    THEN ROUND((COALESCE(SUM(ev.evasoes), 0)::DECIMAL / c.qtd_alunos) * 100, 2)
    ELSE 0 
  END AS taxa_cancelamento,
  
  -- Rankings (calculados depois)
  RANK() OVER (PARTITION BY p.unidade_id ORDER BY 
    CASE WHEN SUM(e.experimentais) > 0 
      THEN (SUM(m.matriculas)::DECIMAL / SUM(e.experimentais)) 
      ELSE 0 
    END DESC
  ) AS ranking_matriculador,
  
  RANK() OVER (PARTITION BY p.unidade_id ORDER BY 
    CASE WHEN SUM(r.renovacoes) + SUM(r.nao_renovacoes) > 0 
      THEN (SUM(r.renovacoes)::DECIMAL / (SUM(r.renovacoes) + SUM(r.nao_renovacoes))) 
      ELSE 0 
    END DESC
  ) AS ranking_renovador,
  
  RANK() OVER (PARTITION BY p.unidade_id ORDER BY 
    CASE WHEN c.qtd_alunos > 0 
      THEN (COALESCE(SUM(ev.evasoes), 0)::DECIMAL / c.qtd_alunos) 
      ELSE 0 
    END ASC -- ASC porque menor churn é melhor
  ) AS ranking_churn

FROM professores p
LEFT JOIN unidades u ON p.unidade_id = u.id
LEFT JOIN professor_carteira c ON p.id = c.professor_id
LEFT JOIN professor_experimentais e ON p.id = e.professor_id 
  AND e.mes >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
LEFT JOIN professor_matriculas m ON p.id = m.professor_id 
  AND m.mes >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
LEFT JOIN professor_renovacoes r ON p.id = r.professor_id 
  AND r.mes >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
LEFT JOIN professor_evasoes ev ON p.id = ev.professor_id 
  AND ev.mes >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
WHERE p.ativo = true
GROUP BY p.id, p.nome, p.unidade_id, u.nome, c.qtd_alunos, c.ticket_medio;
```

### 7.3 View: Análise por Canal de Origem

```sql
CREATE OR REPLACE VIEW vw_analise_canal AS
SELECT
  co.id AS canal_id,
  co.nome AS canal_nome,
  ld.unidade_id,
  u.nome AS unidade_nome,
  DATE_TRUNC('month', ld.data) AS mes,
  
  -- Leads
  SUM(ld.quantidade) FILTER (WHERE ld.tipo = 'LEAD') AS leads,
  
  -- Experimentais
  SUM(ld.quantidade) FILTER (WHERE ld.tipo IN ('EXP_REALIZADA', 'EXP_FALTOU')) AS experimentais,
  
  -- Matrículas (contando da tabela alunos)
  COUNT(DISTINCT a.id) AS matriculas,
  
  -- Taxas de Conversão
  CASE WHEN SUM(ld.quantidade) FILTER (WHERE ld.tipo = 'LEAD') > 0 
    THEN ROUND(
      (SUM(ld.quantidade) FILTER (WHERE ld.tipo = 'EXP_REALIZADA')::DECIMAL / 
       SUM(ld.quantidade) FILTER (WHERE ld.tipo = 'LEAD')) * 100, 2
    )
    ELSE 0 
  END AS taxa_lead_exp,
  
  CASE WHEN SUM(ld.quantidade) FILTER (WHERE ld.tipo = 'EXP_REALIZADA') > 0 
    THEN ROUND(
      (COUNT(DISTINCT a.id)::DECIMAL / 
       SUM(ld.quantidade) FILTER (WHERE ld.tipo = 'EXP_REALIZADA')) * 100, 2
    )
    ELSE 0 
  END AS taxa_exp_mat,
  
  -- Faturamento
  SUM(a.valor_passaporte) AS faturamento_passaportes,
  AVG(a.valor_parcela) AS ticket_medio_parcela

FROM canais_origem co
LEFT JOIN leads_diarios ld ON co.id = ld.canal_origem_id
LEFT JOIN unidades u ON ld.unidade_id = u.id
LEFT JOIN alunos a ON co.id = a.canal_origem_id 
  AND DATE_TRUNC('month', a.data_matricula) = DATE_TRUNC('month', ld.data)
  AND a.unidade_id = ld.unidade_id
WHERE co.ativo = true
GROUP BY co.id, co.nome, ld.unidade_id, u.nome, DATE_TRUNC('month', ld.data);
```

### 7.4 View: Análise por Motivo de Saída

```sql
CREATE OR REPLACE VIEW vw_analise_motivo_saida AS
SELECT
  ms.id AS motivo_id,
  ms.nome AS motivo_nome,
  ms.categoria AS motivo_categoria,
  e.unidade_id,
  u.nome AS unidade_nome,
  DATE_TRUNC('month', e.data_evasao) AS mes,
  
  -- Quantidades
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE ts.codigo = 'INTERROMPIDO') AS interrompidos,
  COUNT(*) FILTER (WHERE ts.codigo = 'NAO_RENOVOU') AS nao_renovacoes,
  
  -- Valores
  SUM(e.valor_parcela) AS mrr_perdido,
  AVG(e.valor_parcela) AS ticket_medio_evadidos,
  
  -- Percentual do total
  ROUND(
    COUNT(*)::DECIMAL / 
    NULLIF(SUM(COUNT(*)) OVER (PARTITION BY e.unidade_id, DATE_TRUNC('month', e.data_evasao)), 0) * 100
  , 2) AS percentual_total

FROM motivos_saida ms
LEFT JOIN evasoes_v2 e ON ms.id = e.motivo_saida_id
LEFT JOIN tipos_saida ts ON e.tipo_saida_id = ts.id
LEFT JOIN unidades u ON e.unidade_id = u.id
WHERE ms.ativo = true AND e.id IS NOT NULL
GROUP BY ms.id, ms.nome, ms.categoria, e.unidade_id, u.nome, DATE_TRUNC('month', e.data_evasao)
ORDER BY total DESC;
```

### 7.5 Função: Projeção de Meta

```sql
CREATE OR REPLACE FUNCTION fn_projecao_meta(
  p_unidade_id UUID,
  p_kpi VARCHAR,
  p_mes DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)
)
RETURNS TABLE (
  realizado DECIMAL,
  meta DECIMAL,
  dias_passados INTEGER,
  dias_total INTEGER,
  projecao DECIMAL,
  percentual_meta DECIMAL,
  status VARCHAR
) AS $$
DECLARE
  v_dias_passados INTEGER;
  v_dias_total INTEGER;
  v_realizado DECIMAL;
  v_meta DECIMAL;
  v_projecao DECIMAL;
BEGIN
  -- Calcular dias
  v_dias_passados := EXTRACT(DAY FROM CURRENT_DATE);
  v_dias_total := EXTRACT(DAY FROM (DATE_TRUNC('month', p_mes) + INTERVAL '1 month - 1 day'));
  
  -- Buscar meta
  SELECT 
    CASE p_kpi
      WHEN 'matriculas' THEN m.meta_novas_matriculas
      WHEN 'faturamento' THEN m.meta_faturamento
      WHEN 'churn' THEN m.meta_churn_max
      WHEN 'renovacao' THEN m.meta_taxa_renovacao
      WHEN 'conversao' THEN m.meta_taxa_conversao_exp
      WHEN 'alunos' THEN m.meta_alunos_ativos
      WHEN 'ticket' THEN m.meta_ticket_medio
    END INTO v_meta
  FROM metas m
  WHERE m.unidade_id = p_unidade_id 
    AND m.periodo_tipo = 'MENSAL'
    AND m.ano = EXTRACT(YEAR FROM p_mes)
    AND m.mes = EXTRACT(MONTH FROM p_mes);
  
  -- Buscar realizado (simplificado - adaptar conforme KPI)
  SELECT 
    CASE p_kpi
      WHEN 'matriculas' THEN SUM(CASE WHEN tipo = 'MATRICULA' THEN quantidade ELSE 0 END)
      -- Adicionar outros KPIs conforme necessário
    END INTO v_realizado
  FROM leads_diarios
  WHERE unidade_id = p_unidade_id
    AND DATE_TRUNC('month', data) = p_mes;
  
  -- Calcular projeção
  IF v_dias_passados > 0 THEN
    v_projecao := (v_realizado / v_dias_passados) * v_dias_total;
  ELSE
    v_projecao := 0;
  END IF;
  
  RETURN QUERY SELECT
    v_realizado,
    v_meta,
    v_dias_passados,
    v_dias_total,
    v_projecao,
    CASE WHEN v_meta > 0 THEN ROUND((v_projecao / v_meta) * 100, 2) ELSE 0 END,
    CASE 
      WHEN v_projecao >= v_meta THEN 'NO_CAMINHO'
      WHEN v_projecao >= v_meta * 0.8 THEN 'ATENCAO'
      ELSE 'CRITICO'
    END;
END;
$$ LANGUAGE plpgsql;
```

---

## 8. RESUMO CONSOLIDADO

### 8.1 Totais por Categoria

| Categoria | Campos Entrada | Campos Calculados | Total |
|-----------|:--------------:|:-----------------:|:-----:|
| **Gestão/Retenção** | 18 | 12 | 30 |
| **Comercial** | 16 | 8 | 24 |
| **Professor** | 10 | 11 | 21 |
| **TOTAL** | **44** | **31** | **75** |

### 8.2 Tabelas do Sistema

| Categoria | Tabela | Registros Esperados |
|-----------|--------|:-------------------:|
| **Mestra** | unidades | 3 |
| **Mestra** | professores | 44 |
| **Mestra** | cursos | 16 |
| **Mestra** | canais_origem | 9 |
| **Mestra** | motivos_saida | 13+ |
| **Mestra** | motivos_arquivamento | 7 |
| **Mestra** | tipos_saida | 4 |
| **Mestra** | tipos_matricula | 5 |
| **Mestra** | formas_pagamento | 5 |
| **Mestra** | horarios | 3 |
| **Principal** | alunos | 911+ |
| **Principal** | evasoes_v2 | Crescente |
| **Principal** | renovacoes | Crescente |
| **Principal** | leads_diarios | Crescente |
| **Principal** | relatorios_diarios | Crescente |
| **Principal** | metas | ~36/ano |
| **Sistema** | audit_log | Crescente |

### 8.3 Views Disponíveis

| View | Descrição | Uso Principal |
|------|-----------|---------------|
| `vw_kpis_mensais` | KPIs consolidados por mês/unidade | Dashboard principal |
| `vw_kpis_professor` | Performance por professor | Ranking e análise |
| `vw_analise_canal` | Conversão por canal de origem | ROI de marketing |
| `vw_analise_motivo_saida` | Análise de evasões | Identificar problemas |

### 8.4 KPIs com Meta (OKR)

| KPI | Mensal | Trimestral | Anual |
|-----|:------:|:----------:|:-----:|
| Novas Matrículas | ✅ | ✅ | ✅ |
| Taxa Conversão Experimental | ✅ | - | - |
| Taxa Renovação | ✅ | - | - |
| Churn Rate (máximo) | ✅ | - | - |
| Faturamento | ✅ | ✅ | ✅ |
| LTV | - | - | ✅ |
| Ticket Médio | ✅ | - | - |
| Total Alunos Ativos | ✅ | - | - |

---

## CHANGELOG

| Data | Versão | Alteração |
|------|--------|-----------|
| 18/01/2026 | 1.0 | Criação do documento completo |

---

*Documento gerado para servir como referência técnica do projeto LA Music Performance Report 2026.*