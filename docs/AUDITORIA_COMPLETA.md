# 🔍 AUDITORIA COMPLETA - SISTEMA LA MUSIC 2026

**Data da Auditoria:** 09/01/2026  
**Método:** Consulta direta via API REST do Supabase + Análise de código  
**Projeto:** LA Performance Report  
**Supabase Project ID:** ouqwbbermlzqqvtqwlul  
**Região:** sa-east-1  
**Status:** ACTIVE_HEALTHY

---

## 📊 1. BANCO DE DADOS ATUAL

### 1.1 Tabelas e Contagem de Registros

| Tabela | Registros | Tipo PK | Tem FK? | RLS | Descrição |
|--------|-----------|---------|---------|-----|-----------|
| `unidades` | **3** | UUID | - | ✅ | Cadastro base das unidades |
| `dados_mensais` | **108** | UUID | ✅ unidade_id | ✅ | KPIs mensais de gestão |
| `dados_comerciais` | **36** | SERIAL | ❌ VARCHAR | ❌ | KPIs mensais comerciais |
| `evasoes` | **619** | SERIAL | ❌ VARCHAR | ❌ | Registro granular de evasões |
| `professores_performance` | **78** | SERIAL | ❌ VARCHAR | ❌ | Performance agregada 2025 |
| `professores_experimentais` | **284** | SERIAL | ❌ VARCHAR | ❌ | Experimentais por professor/mês |
| `cursos_matriculados` | **236** | SERIAL | ❌ VARCHAR | ❌ | Matrículas por curso/mês |
| `origem_leads` | **215** | SERIAL | ❌ VARCHAR | ❌ | Leads por canal/mês |
| `metas` | **6** | UUID | ✅ unidade_id | ✅ | Metas anuais de gestão |
| `metas_comerciais` | **4** | SERIAL | ❌ VARCHAR | ❌ | Metas comerciais |
| `audit_log` | ~174 | UUID | - | ✅ | Log de auditoria |
| `dashboard_config` | 6 | UUID | - | ✅ | Configurações |
| `anotacoes` | 0 | UUID | ✅ unidade_id | ✅ | Não utilizada |

### 1.2 Estrutura Detalhada das Tabelas

#### `unidades` (3 registros)
```sql
id              UUID PRIMARY KEY DEFAULT uuid_generate_v4()
nome            VARCHAR UNIQUE NOT NULL
codigo          VARCHAR UNIQUE NOT NULL
cor_primaria    VARCHAR DEFAULT '#00d4ff'
ativo           BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

#### `dados_mensais` (108 registros)
```sql
id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4()
unidade_id            UUID FK -> unidades.id
ano                   INTEGER CHECK (2020-2030)
mes                   INTEGER CHECK (1-12)
alunos_pagantes       INTEGER DEFAULT 0
novas_matriculas      INTEGER DEFAULT 0
evasoes               INTEGER DEFAULT 0
churn_rate            NUMERIC DEFAULT 0
ticket_medio          NUMERIC DEFAULT 0
taxa_renovacao        NUMERIC DEFAULT 0
tempo_permanencia     INTEGER DEFAULT 0
inadimplencia         NUMERIC DEFAULT 0
reajuste_parcelas     NUMERIC DEFAULT 0
faturamento_estimado  NUMERIC GENERATED (alunos_pagantes * ticket_medio)
saldo_liquido         INTEGER GENERATED (novas_matriculas - evasoes)
created_at            TIMESTAMPTZ DEFAULT now()
updated_at            TIMESTAMPTZ DEFAULT now()
```

#### `evasoes` (619 registros) ⚠️ TABELA CRÍTICA
```sql
id                INTEGER PRIMARY KEY SERIAL
competencia       DATE NOT NULL -- Mês/Ano da evasão
unidade           VARCHAR NOT NULL
aluno             VARCHAR NOT NULL
professor         VARCHAR NULL
parcela           NUMERIC DEFAULT 400
motivo_categoria  VARCHAR NOT NULL -- Financeiro, Horário, Mudança, etc.
motivo_detalhe    TEXT NULL
tipo              VARCHAR CHECK ('Interrompido', 'Não Renovação') DEFAULT 'Interrompido'
created_at        TIMESTAMPTZ DEFAULT now()
```

#### `dados_comerciais` (36 registros)
```sql
id                      INTEGER PRIMARY KEY SERIAL
competencia             DATE NOT NULL
unidade                 VARCHAR NOT NULL
total_leads             INTEGER DEFAULT 0
aulas_experimentais     INTEGER DEFAULT 0
novas_matriculas_total  INTEGER DEFAULT 0
novas_matriculas_lamk   INTEGER DEFAULT 0
novas_matriculas_emla   INTEGER DEFAULT 0
ticket_medio_parcelas   NUMERIC NULL
ticket_medio_passaporte NUMERIC NULL
faturamento_passaporte  NUMERIC NULL
created_at              TIMESTAMPTZ DEFAULT now()
updated_at              TIMESTAMPTZ DEFAULT now()
```

#### `professores_performance` (78 registros)
```sql
id                INTEGER PRIMARY KEY SERIAL
professor         VARCHAR NOT NULL
unidade           VARCHAR NOT NULL
ano               INTEGER DEFAULT 2025
experimentais     INTEGER DEFAULT 0
matriculas        INTEGER DEFAULT 0
taxa_conversao    NUMERIC DEFAULT 0
evasoes           INTEGER DEFAULT 0
contratos_vencer  INTEGER DEFAULT 0
renovacoes        INTEGER DEFAULT 0
taxa_renovacao    NUMERIC DEFAULT 0
created_at        TIMESTAMPTZ DEFAULT now()
```

#### `metas` (6 registros)
```sql
id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4()
unidade_id          UUID FK -> unidades.id
ano                 INTEGER CHECK (2020-2030)
meta_alunos         INTEGER DEFAULT 0
meta_matriculas_mes INTEGER DEFAULT 0
meta_evasoes_max    INTEGER DEFAULT 0
meta_churn          NUMERIC DEFAULT 3.5
meta_renovacao      NUMERIC DEFAULT 90
meta_ticket         NUMERIC DEFAULT 0
meta_permanencia    INTEGER DEFAULT 0
meta_inadimplencia  NUMERIC DEFAULT 2
meta_faturamento    NUMERIC DEFAULT 0
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
```

### 1.3 Views Existentes (9 views no banco)

| View | Campos Principais |
|------|-------------------|
| `vw_consolidado_anual` | ano, alunos_dezembro, total_matriculas, total_evasoes, churn_medio, ticket_medio |
| `vw_unidade_anual` | unidade, codigo, ano, alunos_dezembro, total_matriculas, total_evasoes |
| `vw_sazonalidade` | unidade, ano, mes, novas_matriculas, evasoes, churn_rate |
| `vw_ranking_unidades` | unidade, churn_medio, renovacao_media, ticket_medio |
| `vw_evasoes_resumo` | competencia, unidade, total_evasoes, interrompidos, nao_renovacoes |
| `vw_evasoes_motivos` | motivo_categoria, unidade, quantidade, mrr_perdido |
| `vw_evasoes_professores` | professor, unidade, total_evasoes, mrr_perdido |
| `vw_ranking_professores_evasoes` | professor, evasoes, matriculas, taxa_renovacao, nivel_risco |
| `vw_totais_unidade_performance` | unidade, total_professores, total_evasoes, total_renovacoes |

### 1.4 Functions/RPCs Existentes (10 functions)

| Function | Parâmetros | Descrição |
|----------|------------|-----------|
| `get_kpis_consolidados` | p_ano | KPIs consolidados do grupo |
| `get_kpis_unidade` | p_unidade_codigo, p_ano | KPIs de uma unidade |
| `get_kpis_retencao` | p_ano, p_unidade | KPIs de retenção |
| `get_comparativo_anos` | p_ano_atual, p_ano_anterior | Comparativo entre anos |
| `get_heatmap_data` | p_ano, p_metrica | Dados para heatmap |
| `get_heatmap_totais` | p_ano, p_metrica | Totais para heatmap |
| `get_metas_vs_realizado` | p_ano | Metas vs realizado |
| `upsert_dados_mensais` | p_unidade_codigo, p_ano, p_mes, ... | Inserir/atualizar dados mensais |
| `upsert_metas` | p_unidade_codigo, p_ano, ... | Inserir/atualizar metas |
| `calcular_variacao` | valor_atual, valor_anterior | Cálculo de variação % |

### 1.5 Migrações Aplicadas

1. `20260106025222` - create_dados_comerciais_table
2. `20260106025232` - create_metas_comerciais_table
3. `20260106025242` - create_professores_experimentais_table
4. `20260106025244` - create_cursos_matriculados_table
5. `20260106025247` - create_origem_leads_table
6. `20260107012927` - update_inadimplencia_values
7. `20260107012953` - fix_reajuste_janeiro

### 1.6 Extensões Instaladas

- `pgcrypto` - Funções criptográficas
- `pg_stat_statements` - Estatísticas de queries
- `supabase_vault` - Vault para secrets
- `pg_graphql` - Suporte GraphQL
- `uuid-ossp` - Geração de UUIDs
- `plpgsql` - Linguagem procedural

---

## 📁 2. ESTRUTURA DE CÓDIGO FONTE

### 2.1 Estrutura de Pastas

```
d:\2026\LA-performance-report\
├── App.tsx                    # Componente principal (138KB - MUITO GRANDE!)
├── constants.tsx              # Constantes globais
├── types.ts                   # Tipos globais
├── index.tsx                  # Entry point
├── index.html                 # HTML base
├── vite.config.ts             # Config Vite
├── package.json               # Dependências
├── docs/                      # Documentação
│   └── AUDITORIA_COMPLETA.md  # Este arquivo
├── src/
│   ├── components/
│   │   ├── Comercial/         # 16 arquivos - Módulo Comercial
│   │   │   ├── ComercialDashboard.tsx
│   │   │   ├── ComercialVisaoGeral.tsx
│   │   │   ├── ComercialFunil.tsx
│   │   │   ├── ComercialProfessores.tsx
│   │   │   ├── ComercialCursos.tsx
│   │   │   ├── ComercialOrigem.tsx
│   │   │   ├── ComercialRanking.tsx
│   │   │   ├── ComercialSazonalidade.tsx
│   │   │   ├── ComercialFinanceiro.tsx
│   │   │   ├── ComercialAlertas.tsx
│   │   │   ├── ComercialMetas.tsx
│   │   │   ├── ComercialInicio.tsx
│   │   │   ├── SidebarComercial.tsx
│   │   │   ├── ChartTooltip.tsx
│   │   │   ├── PageSwitcher.tsx
│   │   │   └── index.ts
│   │   ├── Retencao/          # 12 arquivos - Módulo Retenção
│   │   │   ├── RetencaoDashboard.tsx
│   │   │   ├── RetencaoVisaoGeral.tsx
│   │   │   ├── RetencaoTendencias.tsx
│   │   │   ├── RetencaoMotivos.tsx
│   │   │   ├── RetencaoProfessores.tsx
│   │   │   ├── RetencaoSazonalidade.tsx
│   │   │   ├── RetencaoComparativo.tsx
│   │   │   ├── RetencaoAlertas.tsx
│   │   │   ├── RetencaoAcoes.tsx
│   │   │   ├── RetencaoInicio.tsx
│   │   │   ├── SidebarRetencao.tsx
│   │   │   └── index.ts
│   │   ├── Jarvis/            # 6 arquivos - Assistente IA (não implementado)
│   │   ├── ui/                # 2 arquivos - Componentes UI base
│   │   ├── Metas2026.tsx      # Componente de metas
│   │   ├── LearningsTimeline.tsx
│   │   ├── LearningsKPIs.tsx
│   │   └── LearningsResponsaveis.tsx
│   ├── hooks/                 # 8 hooks customizados
│   │   ├── useSupabase.ts     # Hooks gerais do Supabase
│   │   ├── useSupabaseMutations.ts # Mutations
│   │   ├── useComercialData.ts # Dados comerciais
│   │   ├── useEvasoesData.ts  # Dados de evasões
│   │   ├── useProfessoresPerformance.ts # Performance professores
│   │   ├── useProfessoresData.ts # Dados de professores
│   │   ├── useCursosData.ts   # Dados de cursos
│   │   └── useOrigemData.ts   # Dados de origem
│   ├── lib/
│   │   └── supabase.ts        # Cliente Supabase
│   └── types/                 # 4 arquivos de tipos
│       ├── database.types.ts  # Tipos do banco
│       ├── comercial.ts       # Tipos comerciais
│       ├── retencao.ts        # Tipos retenção
│       └── speech.d.ts        # Tipos de speech
```

### 2.2 Componentes por Módulo

#### Módulo Gestão (App.tsx)
- Componente monolítico com ~2700 linhas
- Contém toda a lógica do módulo de Gestão
- **⚠️ PROBLEMA:** Arquivo muito grande, difícil manutenção

#### Módulo Comercial
| Componente | Linhas | Responsabilidade |
|------------|--------|------------------|
| ComercialDashboard | ~140 | Container principal, navegação |
| ComercialVisaoGeral | ~350 | KPIs, gráficos de visão geral |
| ComercialFunil | ~400 | Funil de conversão |
| ComercialProfessores | ~300 | Ranking de professores |
| ComercialCursos | ~300 | Distribuição por cursos |
| ComercialOrigem | ~300 | Origem dos leads |
| ComercialRanking | ~400 | Rankings diversos |
| ComercialSazonalidade | ~400 | Análise sazonal |
| ComercialFinanceiro | ~300 | Métricas financeiras |
| ComercialAlertas | ~250 | Alertas e insights |
| ComercialMetas | ~300 | Metas e projeções |

#### Módulo Retenção
| Componente | Linhas | Responsabilidade |
|------------|--------|------------------|
| RetencaoDashboard | ~150 | Container principal, navegação |
| RetencaoVisaoGeral | ~300 | KPIs de evasão |
| RetencaoTendencias | ~250 | Tendências mensais |
| RetencaoMotivos | ~250 | Motivos de evasão |
| RetencaoProfessores | ~350 | Evasões por professor |
| RetencaoSazonalidade | ~250 | Padrões sazonais |
| RetencaoComparativo | ~300 | Comparativo unidades |
| RetencaoAlertas | ~250 | Alertas críticos |
| RetencaoAcoes | ~300 | Plano de ação |

### 2.3 Hooks e Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUXO DE DADOS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  Supabase   │────▶│   Hooks     │────▶│ Componentes │       │
│  │  (Banco)    │     │ (Fetch +    │     │ (UI +       │       │
│  │             │     │  Cálculos)  │     │  Gráficos)  │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│        │                    │                   │               │
│        │                    │                   │               │
│        ▼                    ▼                   ▼               │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ Tabelas:    │     │ Hooks:      │     │ Módulos:    │       │
│  │ - evasoes   │     │ - useEvasoes│     │ - Gestão    │       │
│  │ - dados_    │     │ - useComercial    │ - Comercial │       │
│  │   comerciais│     │ - useProfessores  │ - Retenção  │       │
│  │ - dados_    │     │ - useSupabase     │             │       │
│  │   mensais   │     │                   │             │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Tipos TypeScript

#### `database.types.ts`
- Define tipos para tabelas: `Unidade`, `DadosMensais`, `Meta`, `Anotacao`
- Define tipos para views: `ConsolidadoAnual`, `UnidadeAnual`, `Sazonalidade`
- Define tipos para functions: `get_kpis_consolidados`, `get_kpis_unidade`, etc.

#### `comercial.ts`
- `DadosComerciais` - Dados da tabela dados_comerciais
- `KPIsComerciais` - KPIs calculados
- `DadosMensais` - Dados mensais processados
- `DadosUnidade` - Dados por unidade
- `MetaComercial` - Metas comerciais

#### `retencao.ts`
- `Evasao` - Registro de evasão
- `KPIsRetencao` - KPIs de retenção
- `ProfessorEvasao` - Evasões por professor
- `MotivoEvasao` - Motivos de evasão
- `ProfessorPerformance` - Performance de professor

---

## ⚠️ 3. INCONSISTÊNCIAS CRÍTICAS IDENTIFICADAS

### 3.1 🔴 DIVERGÊNCIA DE EVASÕES 2025

| Fonte | CG | Recreio | Barra | **TOTAL** |
|-------|----:|--------:|------:|----------:|
| `evasoes` (granular) | 297 | 189 | 133 | **619** |
| `dados_mensais` (agregado) | 288 | 189 | 135 | **612** |
| `professores_performance` | 255 | 151 | 108 | **514** |

**Diferenças:**
- `evasoes` vs `dados_mensais`: **7 registros** a mais
- `evasoes` vs `professores_performance`: **105 registros** a mais (16.9%!)

**Causa provável:**
- `professores_performance` só contém evasões de alunos COM professor atribuído
- Alguns alunos em `evasoes` têm professor NULL ou "Desconhecido"

### 3.2 🔴 FALTA DE NORMALIZAÇÃO - PROFESSORES

**Em `evasoes` (105 nomes únicos - NÃO normalizados):**
```
- Alexandre, Alexandre Santo, Alexandre Sá, Alexandre de Sá (4 variações!)
- Caio, Caio Araujo, Caio Araújo, Caio Lucca (4 variações!)
- Daiana, Daiana Amorim, Daiana Anjos, Daiana Pacifico, Daiana Pacífico (5 variações!)
- Gabriel, Gabriel Antony, Gabriel Araújo, Gabriel Barbosa, Gabriel Leão (5 variações!)
```

**Em `professores_performance` (44 nomes únicos - NORMALIZADOS):**
```
- ALEXANDRE DE SÁ (1 nome padronizado, maiúsculo)
- CAIO TENÓRIO (1 nome padronizado, maiúsculo)
- DAIANA PACÍFICO (1 nome padronizado, maiúsculo)
```

### 3.3 🔴 FALTA DE NORMALIZAÇÃO - MOTIVOS DE SAÍDA

**17 categorias identificadas em `evasoes`:**
| Motivo | Quantidade |
|--------|----------:|
| Horário | 140 |
| Financeiro | 130 |
| Desistência | 90 |
| Mudança | 72 |
| Pessoal | 46 |
| Desinteresse | 41 |
| Saúde | 32 |
| Inadimplência | 18 |
| Abandono | 16 |
| Insatisfação | 12 |
| Outros | 7 |
| Transferência | 5 |
| Viagem | 5 |
| Concorrência | 2 |
| Acordo | 1 |
| Dificuldade | 1 |
| Finalização | 1 |

**Problemas:**
- "Desistência" vs "Desinteresse" - Qual a diferença?
- "Acordo" e "Finalização" - Categorias com 1 registro apenas

### 3.4 🔴 CANAIS DE ORIGEM - 12 categorias

| Canal | Registros |
|-------|----------:|
| Instagram | 36 |
| Indicação | 36 |
| Placa/Fachada | 36 |
| Google | 32 |
| Site | 31 |
| Ex-aluno | 14 |
| Ligação | 11 |
| Convênios | 7 |
| Facebook | 6 |
| Eventos | 3 |
| Outros | 2 |
| Aluno Escola | 1 |

### 3.5 🔴 CURSOS - 17 categorias (com duplicações)

| Curso | Registros |
|-------|----------:|
| Bateria | 34 |
| Canto | 33 |
| Teclado | 32 |
| Guitarra | 27 |
| Violão | 23 |
| Piano | 19 |
| Musicalização | 17 |
| Musicalização Preparatória | 14 |
| Violino | 10 |
| Musicalização Bebê | 9 |
| Contrabaixo | 5 |
| Baixo | 3 |
| Produção Musical | 3 |
| Cavaquinho | 2 |
| **Musicalização Bebês** | 2 |
| Musicalização Infantil | 2 |
| Flauta Transversal | 1 |

**Duplicações:**
- "Musicalização Bebê" vs "Musicalização Bebês" (singular/plural)
- "Baixo" vs "Contrabaixo" - são o mesmo?

### 3.6 🟡 TABELAS SEM FK (Usar VARCHAR em vez de ID)

| Tabela | Campo | Deveria ser |
|--------|-------|-------------|
| `evasoes` | unidade VARCHAR | unidade_id UUID FK |
| `evasoes` | professor VARCHAR | professor_id INT FK |
| `evasoes` | motivo_categoria VARCHAR | motivo_id INT FK |
| `dados_comerciais` | unidade VARCHAR | unidade_id UUID FK |
| `professores_performance` | unidade VARCHAR | unidade_id UUID FK |
| `professores_performance` | professor VARCHAR | professor_id INT FK |
| `professores_experimentais` | unidade VARCHAR | unidade_id UUID FK |
| `professores_experimentais` | professor VARCHAR | professor_id INT FK |
| `cursos_matriculados` | unidade VARCHAR | unidade_id UUID FK |
| `cursos_matriculados` | curso VARCHAR | curso_id INT FK |
| `origem_leads` | unidade VARCHAR | unidade_id UUID FK |
| `origem_leads` | canal VARCHAR | canal_id INT FK |
| `metas_comerciais` | unidade VARCHAR | unidade_id UUID FK |

### 3.7 🟡 TIPOS DE EVASÃO

| Tipo | Quantidade |
|------|----------:|
| Interrompido | 484 (78.2%) |
| Não Renovação | 135 (21.8%) |

**Faltando:** "Aviso Prévio" como categoria separada

### 3.8 🟡 Tabelas sem RLS

As seguintes tabelas **NÃO** têm Row Level Security:
- `evasoes` (619 registros sensíveis)
- `dados_comerciais`
- `metas_comerciais`
- `professores_performance`
- `professores_experimentais`
- `cursos_matriculados`
- `origem_leads`

### 3.9 🟡 Dados Hardcoded no Código

No hook `useEvasoesData.ts`:
```typescript
churnMedio: 4.86,  // HARDCODED!
taxaRenovacao: 80, // HARDCODED!
```

### 3.10 🟡 Arquivo App.tsx Muito Grande

- **138KB** / ~2700 linhas
- Contém todo o módulo de Gestão
- Difícil manutenção e testes
- **Recomendação:** Refatorar para componentes menores

---

## 🔄 4. ANÁLISE DE IMPACTO PARA NOVAS FUNCIONALIDADES

### 4.1 Tabelas Mestras (Cadastros Base)

| Tabela Necessária | Status | Ação |
|-------------------|--------|------|
| `unidades` | ✅ Existe | Manter, adicionar campos se necessário |
| `professores` | ❌ Não existe | **CRIAR** - Hoje é VARCHAR nas tabelas |
| `cursos` | ❌ Não existe | **CRIAR** - Hoje é VARCHAR em cursos_matriculados |
| `canais_origem` | ❌ Não existe | **CRIAR** - Hoje é VARCHAR em origem_leads |
| `motivos_saida` | ❌ Não existe | **CRIAR** - Hoje é VARCHAR em evasoes |
| `formas_pagamento` | ❌ Não existe | **CRIAR** |
| `tipos_matricula` | ❌ Não existe | **CRIAR** |
| `tipos_saida` | ❌ Não existe | **CRIAR** |

### 4.2 Tabela de Alunos

**Status:** ❌ NÃO EXISTE

Hoje os alunos estão apenas na tabela `evasoes` (quando saem).
Não há registro de alunos ativos.

**Impacto:**
- Precisa criar tabela `alunos` do zero
- Migrar dados de `evasoes` para popular histórico
- Criar fluxo de entrada de dados

### 4.3 Tabelas de Movimentação

**Status:** ❌ NÃO EXISTE

Hoje não há registro de movimentações (matrículas, renovações, etc.)
Apenas dados agregados em `dados_mensais` e `dados_comerciais`.

### 4.4 Código que Precisa Ser Adaptado

| Arquivo | Mudança Necessária |
|---------|-------------------|
| `useEvasoesData.ts` | Adaptar para nova estrutura de evasões |
| `useProfessoresPerformance.ts` | Usar FK para professores |
| `useComercialData.ts` | Usar FK para canais, cursos |
| `database.types.ts` | Adicionar novos tipos |
| Todos os componentes | Adaptar para novos dados |

---

## 📋 5. TABELAS MESTRAS NECESSÁRIAS

### 5.1 Tabelas que PRECISAM ser criadas

| Tabela | Registros Iniciais | Origem dos Dados |
|--------|-------------------|------------------|
| `professores` | 44 | DISTINCT de `professores_performance` |
| `cursos` | ~15 | DISTINCT de `cursos_matriculados` (normalizar) |
| `canais_origem` | 12 | DISTINCT de `origem_leads` |
| `motivos_saida` | ~12 | DISTINCT de `evasoes` (normalizar) |
| `formas_pagamento` | 5 | Lista definida manualmente |
| `tipos_matricula` | 6 | Lista definida manualmente |
| `tipos_saida` | 3 | Lista definida manualmente |
| `alunos` | ~1000 | Importar do Emuises |

### 5.2 Mapeamento de Normalização - PROFESSORES

| Nome em `evasoes` | Nome Normalizado |
|-------------------|------------------|
| Alexandre, Alexandre Santo, Alexandre Sá, Alexandre de Sá | ALEXANDRE DE SÁ |
| Caio, Caio Araujo, Caio Araújo | CAIO TENÓRIO |
| Daiana, Daiana Amorim, Daiana Anjos, Daiana Pacifico, Daiana Pacífico | DAIANA PACÍFICO |
| Gabriel, Gabriel Antony | GABRIEL ANTONY |
| Gabriel Araújo | GABRIEL ARAÚJO |
| Gabriel Barbosa | GABRIEL BARBOSA |
| Gabriel Leão | GABRIEL LEÃO |
| ... | ... |

### 5.3 Mapeamento de Normalização - MOTIVOS

| Motivo Atual | Categoria Proposta |
|--------------|-------------------|
| Financeiro | Financeiro |
| Dificuldade | Financeiro |
| Horário | Horário |
| Mudança | Mudança |
| Transferência | Mudança |
| Viagem | Mudança |
| Desistência | Desistência |
| Desinteresse | Desistência |
| Abandono | Desistência |
| Saúde | Saúde |
| Pessoal | Pessoal |
| Insatisfação | Insatisfação |
| Concorrência | Concorrência |
| Inadimplência | Inadimplência |
| Acordo | Outros |
| Finalização | Outros |
| Outros | Outros |

---

## 📋 6. PLANO DE MIGRAÇÃO RECOMENDADO

### Fase 1: Preparação (Sem quebrar nada)

1. **Criar tabelas mestras** (professores, cursos, canais, motivos)
2. **Popular tabelas mestras** com dados existentes (DISTINCT das tabelas atuais)
3. **Adicionar colunas FK** nas tabelas existentes (nullable)
4. **Criar script de migração** para popular FKs

### Fase 2: Tabela de Alunos

1. **Criar tabela `alunos`**
2. **Importar alunos** da tabela `evasoes` (como inativos)
3. **Criar interface** de cadastro de alunos
4. **Popular alunos ativos** manualmente ou via import

### Fase 3: Movimentações

1. **Criar tabela `movimentacoes`**
2. **Criar interface** de registro de movimentações
3. **Adaptar hooks** para usar nova estrutura

### Fase 4: Cálculos Automáticos

1. **Criar views** para cálculos em tempo real
2. **Criar triggers** para atualizar dados derivados
3. **Remover dados hardcoded** dos hooks

### Fase 5: Autenticação e RLS

1. **Criar tabela `usuarios`**
2. **Configurar Supabase Auth**
3. **Implementar RLS** em todas as tabelas
4. **Criar políticas** por unidade

### Fase 6: Relatórios e Alertas

1. **Criar sistema de alertas**
2. **Criar gerador de relatórios**
3. **Integrar com WhatsApp** (via API)

---

## � 7. DADOS CONSOLIDADOS POR ANO

### 7.1 View `vw_consolidado_anual` 

| Ano | Alunos Dez | Matrículas | Evasões | Churn | Ticket | Faturamento |
|----:|-----------:|-----------:|--------:|------:|-------:|------------:|
| 2023 | 687 | 436 | 409 | 5.44% | R$367 | R$2.88M |
| 2024 | 970 | 688 | 449 | 4.83% | R$390 | R$3.66M |
| 2025 | 935 | 602 | 612 | 5.04% | R$404 | R$4.69M |

### 7.2 Metas 2026

| Unidade | Meta Alunos | Meta Matr/Mês | Meta Churn | Meta Ticket |
|---------|------------:|--------------:|-----------:|------------:|
| Campo Grande | 537 | 30 | 4.0% | R$387 |
| Recreio | 385 | 25 | 4.0% | R$440 |
| Barra | 285 | 18 | 4.0% | R$460 |

---

## 🔄 8. ANÁLISE DE REDUNDÂNCIA

### 8.1 Dados que se repetem em múltiplas tabelas

| Dado | Tabelas | Ação Recomendada |
|------|---------|------------------|
| Evasões mensais | `evasoes`, `dados_mensais`, `professores_performance` | VIEW unificada |
| Matrículas mensais | `dados_comerciais`, `dados_mensais` | Manter separado (granularidade diferente) |
| Professores | `evasoes`, `professores_performance`, `professores_experimentais` | Criar tabela mestra |

### 8.2 Campos que podem ser calculados

| Campo | Tabela | Cálculo |
|-------|--------|---------|
| faturamento_estimado | dados_mensais | alunos_pagantes × ticket_medio |
| saldo_liquido | dados_mensais | novas_matriculas - evasoes |
| taxa_conversao | professores_performance | matriculas / experimentais × 100 |
| taxa_renovacao | professores_performance | renovacoes / contratos_vencer × 100 |

---

## � 9. RISCOS IDENTIFICADOS

### Alto Risco

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Perda de dados na migração | Média | Alto | Backup antes de cada etapa |
| Inconsistência de dados | Alta | Alto | Validação em cada fase |
| Quebra de dashboards existentes | Alta | Médio | Manter compatibilidade |

### Médio Risco

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Performance degradada | Média | Médio | Índices adequados |
| Complexidade de migração | Alta | Médio | Fases incrementais |

---

## 📊 10. RESUMO EXECUTIVO

### Métricas do Banco

| Métrica | Valor |
|---------|-------|
| Total de tabelas | 13 |
| Total de views | 9 |
| Total de functions | 10 |
| Registros em `evasoes` | 619 |
| Registros em `dados_mensais` | 108 |
| Professores únicos (normalizado) | 44 |
| Professores únicos (não normalizado) | 105 |
| Cursos únicos | 17 |
| Canais únicos | 12 |
| Motivos únicos | 17 |

### Inconsistência Principal

```
EVASÕES 2025:
  evasoes:                    619 registros
  dados_mensais (soma):       612 registros  → Diferença: 7
  professores_performance:    514 registros  → Diferença: 105 (!)
```

### O que temos hoje:
- ✅ Dashboard de visualização funcional
- ✅ 3 módulos (Gestão, Comercial, Retenção)
- ✅ Dados históricos de 2023-2025
- ✅ 619 registros de evasões detalhados
- ✅ Infraestrutura Supabase configurada
- ✅ 9 views para consultas agregadas
- ✅ 10 functions/RPCs

### O que falta:
- ❌ Cadastro de alunos ativos
- ❌ Tabelas mestras normalizadas (professores, cursos, canais, motivos)
- ❌ Entrada de dados pelo sistema
- ❌ Autenticação e controle de acesso
- ❌ Cálculos automáticos em tempo real
- ❌ Sistema de alertas
- ❌ Geração de relatórios
- ❌ RLS nas tabelas comerciais

### Esforço Estimado:
- **Fase 1-2:** 2-3 semanas (estrutura base + tabelas mestras)
- **Fase 3-4:** 2-3 semanas (movimentações e cálculos)
- **Fase 5-6:** 2-3 semanas (auth e relatórios)
- **Total:** 6-9 semanas para sistema completo

---

## 📎 ANEXOS

### A. Queries Úteis para Verificação

```sql
-- Verificar total de evasões por fonte
SELECT 'evasoes' as fonte, COUNT(*) as total FROM evasoes WHERE competencia >= '2025-01-01';
SELECT 'dados_mensais' as fonte, SUM(evasoes) as total FROM dados_mensais WHERE ano = 2025;
SELECT 'professores_performance' as fonte, SUM(evasoes) as total FROM professores_performance WHERE ano = 2025;

-- Verificar evasões por unidade
SELECT unidade, COUNT(*) as total FROM evasoes WHERE competencia >= '2025-01-01' GROUP BY unidade;

-- Verificar professores únicos
SELECT DISTINCT professor FROM evasoes WHERE professor IS NOT NULL ORDER BY professor;
SELECT DISTINCT professor FROM professores_performance ORDER BY professor;

-- Verificar motivos únicos
SELECT DISTINCT motivo_categoria, COUNT(*) FROM evasoes GROUP BY motivo_categoria ORDER BY COUNT(*) DESC;

-- Verificar canais únicos
SELECT DISTINCT canal FROM origem_leads ORDER BY canal;

-- Verificar cursos únicos
SELECT DISTINCT curso FROM cursos_matriculados ORDER BY curso;

-- Verificar tipos de evasão
SELECT tipo, COUNT(*) FROM evasoes GROUP BY tipo;

-- Verificar dados consolidados por ano
SELECT * FROM vw_consolidado_anual ORDER BY ano;
```

### B. Dependências do Projeto

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "react": "^19.x",
    "recharts": "^2.x",
    "lucide-react": "^0.x"
  },
  "devDependencies": {
    "vite": "^6.x",
    "typescript": "^5.x"
  }
}
```

---

**Documento gerado automaticamente pela auditoria do sistema.**
**Próximo passo:** Validar com stakeholders e iniciar Fase 1.
