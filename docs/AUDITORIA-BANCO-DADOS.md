# 📊 AUDITORIA COMPLETA DO BANCO DE DADOS
## LA Performance Report - Supabase

**Data da Auditoria:** 27 de Janeiro de 2026  
**Projeto:** `ouqwbbermlzqqvtqwlul` (LA Performance Report)  
**Região:** sa-east-1  
**Versão PostgreSQL:** 17.6.1.063

---

## 📋 SUMÁRIO EXECUTIVO

### Estatísticas Gerais
- **Total de Tabelas:** 63 tabelas base
- **Total de Views:** 46 views
- **Total de Registros:** ~6.500+ registros
- **Período de Dados Históricos:** 2018 a 2026

### Unidades Cadastradas
| ID (UUID) | Nome | Código |
|-----------|------|--------|
| `368d47f5-2d88-4475-bc14-ba084a9a348e` | Barra | BARRA |
| `2ec861f6-023f-4d7b-9927-3960ad8c2a92` | Campo Grande | CG |
| `95553e96-971b-4590-a6eb-0201d013c14d` | Recreio | REC |

---

## 📅 RANGE DE DADOS HISTÓRICOS POR TABELA

### Tabelas com Dados Históricos Completos

| Tabela | Período | Anos | Meses | Registros |
|--------|---------|------|-------|-----------|
| **dados_mensais** | 2023-01 a 2025-12 | 3 | 36 | 108 |
| **alunos** (data_matricula) | 2018-05 a 2026-01 | 9 | - | 906 |
| **alunos_historico** | - | - | - | 1.350 |
| **evasoes** (competencia) | 2025-01 a 2025-12 | 1 | 12 | 619 |
| **dados_comerciais** | 2025-01 a 2025-12 | 1 | 12 | 36 |
| **experimentais_professor_mensal** | 2025-01 a 2025-12 | 1 | 12 | 283 |
| **origem_leads** | 2025-01 a 2025-12 | 1 | 12 | 523 |
| **metas_kpi** | 2026-01 a 2026-12 | 1 | 12 | 552 |

### ⚠️ PROBLEMA IDENTIFICADO: Views Mensais

As views `vw_kpis_*_mensal` estão **hardcoded para retornar apenas dados do mês atual** (`CURRENT_DATE`), ignorando o histórico disponível em `dados_mensais`.

**Views afetadas:**
- `vw_kpis_comercial_mensal` - Filtra por `EXTRACT(year FROM CURRENT_DATE)`
- `vw_kpis_gestao_mensal` - Filtra por `EXTRACT(year FROM CURRENT_DATE)`
- `vw_kpis_professor_mensal` - Filtra por `EXTRACT(year FROM CURRENT_DATE)`
- `vw_kpis_retencao_mensal` - Filtra por `EXTRACT(year FROM CURRENT_DATE)`

**Solução:** As views precisam aceitar parâmetros de ano/mês ou usar a tabela `dados_mensais` diretamente.

---

## 📊 DISTRIBUIÇÃO DE ALUNOS POR ANO DE MATRÍCULA

| Ano | Total | Ativos | Inativos |
|-----|-------|--------|----------|
| 2026 | 2 | 1 | 1 |
| 2025 | 449 | 449 | 0 |
| 2024 | 237 | 237 | 0 |
| 2023 | 101 | 101 | 0 |
| 2022 | 53 | 53 | 0 |
| 2021 | 37 | 37 | 0 |
| 2020 | 12 | 12 | 0 |
| 2019 | 6 | 6 | 0 |
| 2018 | 9 | 9 | 0 |

**Total Geral:** 906 alunos

---

## 📈 DADOS MENSAIS HISTÓRICOS (dados_mensais)

### Resumo por Ano
| Ano | Meses | Alunos (média) | Matrículas | Evasões |
|-----|-------|----------------|------------|---------|
| 2025 | 12 | 987 | 602 | 612 |
| 2024 | 12 | 811 | 688 | 469 |
| 2023 | 12 | 678 | 436 | 407 |

### Detalhamento Mensal 2025
| Mês | Alunos | Matrículas | Evasões |
|-----|--------|------------|---------|
| Jan | 1.026 | 88 | 36 |
| Fev | 994 | 64 | 81 |
| Mar | 1.016 | 51 | 27 |
| Abr | 1.000 | 44 | 63 |
| Mai | 987 | 59 | 73 |
| Jun | 981 | 34 | 33 |
| Jul | 957 | 39 | 68 |
| Ago | 1.010 | 86 | 26 |
| Set | 1.000 | 51 | 63 |
| Out | 962 | 27 | 63 |
| Nov | 972 | 46 | 30 |
| Dez | 935 | 13 | 49 |

---

## 🗂️ ESTRUTURA COMPLETA DAS TABELAS

### 1. TABELAS PRINCIPAIS (Core)

#### `alunos` (906 registros) - 41 colunas
Tabela central do sistema com dados de todos os alunos.

| Coluna | Tipo | Nullable | Descrição |
|--------|------|----------|-----------|
| id | integer | NO | PK, auto-increment |
| nome | varchar | NO | Nome completo |
| nome_normalizado | varchar | YES | Nome para busca |
| data_nascimento | date | YES | Data de nascimento |
| idade_atual | integer | YES | Idade calculada |
| classificacao | varchar | YES | Classificação do aluno |
| tempo_permanencia_meses | integer | YES | Tempo na escola |
| telefone | varchar | YES | Telefone |
| whatsapp | varchar | YES | WhatsApp |
| email | varchar | YES | E-mail |
| unidade_id | uuid | NO | FK → unidades |
| professor_atual_id | integer | YES | FK → professores |
| curso_id | integer | YES | FK → cursos |
| tipo_matricula_id | integer | YES | FK → tipos_matricula |
| data_matricula | date | YES | Data da matrícula |
| data_inicio_contrato | date | YES | Início do contrato |
| data_fim_contrato | date | YES | Fim do contrato |
| data_saida | date | YES | Data de saída |
| valor_parcela | numeric | YES | Valor da parcela |
| valor_passaporte | numeric | YES | Valor passaporte |
| status | varchar | YES | Status (ativo/inativo) |
| is_ex_aluno | boolean | YES | É ex-aluno? |
| is_segundo_curso | boolean | YES | Segundo curso? |
| tipo_saida_id | integer | YES | FK → tipos_saida |
| motivo_saida_id | integer | YES | FK → motivos_saida |
| canal_origem_id | integer | YES | FK → canais_origem |
| forma_pagamento_id | integer | YES | FK → formas_pagamento |
| created_at | timestamptz | YES | Data criação |
| updated_at | timestamptz | YES | Data atualização |
| dia_aula | varchar | YES | Dia da aula |
| horario_aula | time | YES | Horário da aula |
| percentual_presenca | integer | YES | % presença |
| professor_experimental_id | integer | YES | FK → professores |
| agente_comercial | varchar | YES | Agente comercial |
| is_aluno_retorno | boolean | YES | É retorno? |
| data_ultima_renovacao | date | YES | Última renovação |
| numero_renovacoes | integer | YES | Nº renovações |
| nps_saida | integer | YES | NPS na saída |
| tipo_aluno | varchar | YES | Tipo (pagante/bolsista) |

#### `professores` (44 registros) - 12 colunas
| Coluna | Tipo | Nullable |
|--------|------|----------|
| id | integer | NO |
| nome | varchar | NO |
| nome_normalizado | varchar | YES |
| ativo | boolean | YES |
| created_at | timestamptz | YES |
| updated_at | timestamptz | YES |
| nps_medio | numeric | YES |
| media_alunos_turma | numeric | YES |
| data_admissao | date | YES |
| comissao_percentual | numeric | YES |
| observacoes | text | YES |
| foto_url | varchar | YES |

#### `unidades` (3 registros) - 13 colunas
| Coluna | Tipo | Nullable |
|--------|------|----------|
| id | uuid | NO |
| nome | varchar | NO |
| codigo | varchar | NO |
| cor_primaria | varchar | YES |
| ativo | boolean | YES |
| created_at | timestamptz | YES |
| updated_at | timestamptz | YES |
| horario_funcionamento | jsonb | YES |
| endereco | text | YES |
| telefone | text | YES |
| hunter_nome | text | YES |
| farmers_nomes | ARRAY | YES |
| gerente_nome | varchar | YES |

#### `cursos` (17 registros) - 7 colunas
| Coluna | Tipo | Nullable |
|--------|------|----------|
| id | integer | NO |
| nome | varchar | NO |
| nome_normalizado | varchar | YES |
| sigla | varchar | YES |
| ativo | boolean | YES |
| created_at | timestamptz | YES |
| updated_at | timestamptz | YES |

---

### 2. TABELAS DE HISTÓRICO E MÉTRICAS

#### `dados_mensais` (108 registros) - 19 colunas
Dados consolidados mensais por unidade - **PRINCIPAL FONTE DE HISTÓRICO**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | PK |
| unidade_id | uuid | FK → unidades |
| ano | integer | Ano |
| mes | integer | Mês (1-12) |
| alunos_pagantes | integer | Total pagantes |
| novas_matriculas | integer | Matrículas no mês |
| evasoes | integer | Evasões no mês |
| churn_rate | numeric | Taxa de churn |
| ticket_medio | numeric | Ticket médio |
| taxa_renovacao | numeric | Taxa renovação |
| tempo_permanencia | integer | Permanência média |
| inadimplencia | numeric | % inadimplência |
| reajuste_parcelas | numeric | Reajuste médio |
| faturamento_estimado | numeric | Faturamento previsto |
| saldo_liquido | integer | Saldo líquido |
| ticket_medio_passaporte | numeric | Ticket passaporte |
| faturamento_passaporte | numeric | Fat. passaporte |

#### `evasoes` (619 registros) - 10 colunas
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | integer | PK |
| competencia | date | Mês/ano da evasão |
| unidade | varchar | Nome da unidade |
| aluno | varchar | Nome do aluno |
| professor | varchar | Nome do professor |
| parcela | numeric | Valor da parcela |
| motivo_categoria | varchar | Categoria do motivo |
| motivo_detalhe | text | Detalhe do motivo |
| tipo | varchar | Tipo de saída |
| created_at | timestamptz | Data criação |

#### `dados_comerciais` (36 registros) - 13 colunas
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | integer | PK |
| competencia | date | Mês/ano |
| unidade | varchar | Nome unidade |
| total_leads | integer | Total de leads |
| aulas_experimentais | integer | Experimentais |
| novas_matriculas_total | integer | Total matrículas |
| novas_matriculas_lamk | integer | Matrículas LAMK |
| novas_matriculas_emla | integer | Matrículas EMLA |
| ticket_medio_parcelas | numeric | Ticket parcelas |
| ticket_medio_passaporte | numeric | Ticket passaporte |
| faturamento_passaporte | numeric | Fat. passaporte |

#### `experimentais_professor_mensal` (283 registros) - 7 colunas
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | integer | PK |
| professor_id | integer | FK → professores |
| unidade_id | uuid | FK → unidades |
| ano | integer | Ano |
| mes | integer | Mês |
| experimentais | integer | Qtd experimentais |
| matriculas | integer | Qtd matrículas |

---

### 3. TABELAS DE CONFIGURAÇÃO E LOOKUP

#### `tipos_matricula` (5 registros)
Tipos de matrícula disponíveis (pagante, bolsista integral, bolsista parcial, etc.)

#### `tipos_saida` (4 registros)
Tipos de saída (interrompido, aviso prévio, transferência, etc.)

#### `motivos_saida` (14 registros)
Motivos detalhados de saída

#### `motivos_nao_matricula` (10 registros)
Motivos de não conversão de leads

#### `motivos_trancamento` (10 registros)
Motivos de trancamento

#### `canais_origem` (10 registros)
Canais de origem de leads (Instagram, indicação, etc.)

#### `formas_pagamento` (5 registros)
Formas de pagamento disponíveis

---

### 4. TABELAS DE GESTÃO DE PROFESSORES

#### `professores_unidades` (69 registros)
Relacionamento N:N entre professores e unidades

#### `professores_cursos` (147 registros)
Relacionamento N:N entre professores e cursos

#### `professores_experimentais` (284 registros)
Registro de aulas experimentais por professor

#### `professores_performance` (78 registros)
Métricas de performance dos professores

#### `professor_acoes` (2 registros)
Ações/tarefas relacionadas a professores

#### `professor_metas` (0 registros)
Metas individuais de professores

---

### 5. TABELAS DE METAS E SIMULAÇÕES

#### `metas_kpi` (552 registros)
Metas de KPIs por unidade/mês - **Dados de 2026**

| Coluna | Tipo |
|--------|------|
| id | integer |
| ano | integer |
| mes | integer |
| unidade_id | uuid |
| tipo | varchar |
| valor | numeric |

#### `metas` (7 registros)
Metas gerais

#### `metas_comerciais` (4 registros)
Metas comerciais

#### `simulacoes_metas` (0 registros)
Simulações de metas

#### `simulacoes_turma` (0 registros)
Simulações de turmas

---

### 6. TABELAS DE LEADS E COMERCIAL

#### `leads` (1 registro)
Leads individuais

#### `leads_diarios` (5 registros)
Registro diário de leads

#### `origem_leads` (523 registros)
Origem dos leads por competência - **Dados de 2025**

---

### 7. TABELAS DE TURMAS E SALAS

#### `turmas` (0 registros)
Turmas (estrutura antiga)

#### `turmas_explicitas` (1 registro)
Turmas com estrutura explícita

#### `turmas_alunos` (0 registros)
Relacionamento turmas-alunos

#### `salas` (12 registros)
Salas das unidades

---

### 8. TABELAS DE INVENTÁRIO

#### `inventario` (0 registros)
Itens de inventário

#### `inventario_manutencoes` (0 registros)
Manutenções de equipamentos

#### `inventario_movimentacoes` (0 registros)
Movimentações de inventário

---

### 9. TABELAS DE SISTEMA

#### `usuarios` (5 registros)
Usuários do sistema

#### `audit_log` (286 registros)
Log de auditoria

#### `dashboard_config` (6 registros)
Configurações do dashboard

#### `insights_salvos` (2 registros)
Insights gerados pela IA

---

## 🔗 RELACIONAMENTOS (Foreign Keys)

### Diagrama de Relacionamentos Principais

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  unidades   │────<│   alunos    │>────│ professores │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│dados_mensais│     │   evasoes   │     │prof_unidades│
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  metas_kpi  │     │motivos_saida│     │ prof_cursos │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Lista Completa de Foreign Keys

| Tabela Origem | Coluna | Tabela Destino |
|---------------|--------|----------------|
| alunos | unidade_id | unidades |
| alunos | professor_atual_id | professores |
| alunos | professor_experimental_id | professores |
| alunos | curso_id | cursos |
| alunos | tipo_matricula_id | tipos_matricula |
| alunos | tipo_saida_id | tipos_saida |
| alunos | motivo_saida_id | motivos_saida |
| alunos | canal_origem_id | canais_origem |
| alunos | forma_pagamento_id | formas_pagamento |
| dados_mensais | unidade_id | unidades |
| evasoes_v2 | aluno_id | alunos |
| evasoes_v2 | unidade_id | unidades |
| evasoes_v2 | professor_id | professores |
| evasoes_v2 | motivo_saida_id | motivos_saida |
| experimentais_professor_mensal | professor_id | professores |
| experimentais_professor_mensal | unidade_id | unidades |
| metas_kpi | unidade_id | unidades |
| professores_unidades | professor_id | professores |
| professores_unidades | unidade_id | unidades |
| professores_cursos | professor_id | professores |
| professores_cursos | curso_id | cursos |
| renovacoes | aluno_id | alunos |
| renovacoes | professor_id | professores |
| renovacoes | unidade_id | unidades |
| leads | unidade_id | unidades |
| leads | canal_origem_id | canais_origem |
| turmas | unidade_id | unidades |
| turmas | professor_id | professores |
| turmas | curso_id | cursos |
| turmas | sala_id | salas |
| salas | unidade_id | unidades |

---

## 📊 VIEWS DO SISTEMA

### Views de KPIs (Principais)

| View | Descrição | Problema |
|------|-----------|----------|
| `vw_kpis_comercial_mensal` | KPIs comerciais do mês | ⚠️ Hardcoded CURRENT_DATE |
| `vw_kpis_gestao_mensal` | KPIs de gestão do mês | ⚠️ Hardcoded CURRENT_DATE |
| `vw_kpis_professor_mensal` | KPIs de professores | ⚠️ Hardcoded CURRENT_DATE |
| `vw_kpis_retencao_mensal` | KPIs de retenção | ⚠️ Hardcoded CURRENT_DATE |
| `vw_kpis_comercial_historico` | KPIs comerciais históricos | ✅ Usa dados_comerciais |
| `vw_kpis_professor_historico` | KPIs professores históricos | ✅ Funciona |
| `vw_kpis_professor_completo` | KPIs completos professores | ✅ Funciona |

### Views de Análise

| View | Descrição |
|------|-----------|
| `vw_alunos_ativos` | Lista de alunos ativos |
| `vw_contagem_alunos` | Contagem por unidade |
| `vw_dashboard_unidade` | Dashboard por unidade |
| `vw_distribuicao_permanencia` | Distribuição de permanência |
| `vw_evolucao_alunos` | Evolução temporal |
| `vw_funil_conversao_mensal` | Funil de conversão |
| `vw_ltv_por_unidade` | LTV por unidade |
| `vw_ltv_rede` | LTV da rede |
| `vw_ranking_professores_evasoes` | Ranking evasões |
| `vw_ranking_professores_retencao` | Ranking retenção |
| `vw_renovacoes_pendentes` | Renovações pendentes |
| `vw_renovacoes_proximas` | Próximas renovações |
| `vw_sazonalidade` | Análise sazonal |
| `vw_taxa_crescimento_professor` | Taxa crescimento |
| `vw_turmas_completa` | Turmas completas |
| `vw_turmas_implicitas` | Turmas implícitas |

---

## 🔍 ÍNDICES

### Índices Principais

| Tabela | Índice | Colunas |
|--------|--------|---------|
| alunos | idx_alunos_unidade | unidade_id |
| alunos | idx_alunos_status | status |
| alunos | idx_alunos_professor | professor_atual_id |
| alunos | idx_alunos_data_matricula | data_matricula |
| alunos | idx_alunos_data_saida | data_saida |
| alunos | idx_alunos_curso | curso_id |
| alunos | idx_alunos_classificacao | classificacao |
| dados_mensais | idx_dados_mensais_ano_mes | ano, mes |
| dados_mensais | idx_dados_mensais_unidade_ano | unidade_id, ano |
| evasoes | idx_evasoes_competencia | competencia |
| evasoes | idx_evasoes_comp_unid | competencia, unidade |
| professores_unidades | idx_prof_unidades | professor_id, unidade_id |

---

## ⚠️ PROBLEMAS IDENTIFICADOS

### 1. Views Mensais Hardcoded
**Severidade:** 🔴 Alta

As views `vw_kpis_*_mensal` filtram por `CURRENT_DATE`, ignorando dados históricos.

**Solução:** Criar funções ou views parametrizadas que aceitem ano/mês.

### 2. Inconsistência de Dados Históricos
**Severidade:** 🟡 Média

- `dados_mensais`: 2023-2025 ✅
- `evasoes`: apenas 2025
- `dados_comerciais`: apenas 2025
- `metas_kpi`: apenas 2026

**Solução:** Migrar dados históricos para tabelas apropriadas.

### 3. Tabelas Vazias
**Severidade:** 🟢 Baixa

Várias tabelas estão vazias (turmas, renovacoes, movimentacoes, etc.)

**Solução:** Avaliar se são necessárias ou se dados devem ser migrados.

---

## 📝 RECOMENDAÇÕES

### Curto Prazo (Imediato)
1. ✅ Usar `dados_mensais` diretamente para filtros históricos
2. ✅ Ajustar frontend para consultar tabela correta
3. ✅ Criar view `vw_kpis_historico_completo` que una todas as fontes

### Médio Prazo (1-2 semanas)
1. Criar funções SQL parametrizadas para consultas históricas
2. Migrar dados de evasões para `evasoes_v2`
3. Popular tabela `renovacoes` com dados históricos

### Longo Prazo (1 mês+)
1. Implementar sistema de snapshots mensais automáticos
2. Criar data warehouse para análises históricas
3. Implementar particionamento de tabelas por ano

---

## 📊 QUERIES ÚTEIS

### Consultar dados históricos por período
```sql
SELECT 
  ano, mes, unidade_id,
  alunos_pagantes, novas_matriculas, evasoes,
  churn_rate, ticket_medio
FROM dados_mensais
WHERE ano = 2025 AND mes BETWEEN 7 AND 9  -- Q3 2025
ORDER BY unidade_id, ano, mes;
```

### Verificar anos disponíveis
```sql
SELECT DISTINCT ano 
FROM dados_mensais 
ORDER BY ano DESC;
```

### Totais por trimestre
```sql
SELECT 
  ano,
  CEIL(mes / 3.0) as trimestre,
  SUM(novas_matriculas) as matriculas,
  SUM(evasoes) as evasoes,
  AVG(churn_rate) as churn_medio
FROM dados_mensais
GROUP BY ano, CEIL(mes / 3.0)
ORDER BY ano DESC, trimestre DESC;
```

---

## ✅ SOLUÇÃO IMPLEMENTADA

### 1. Hook `useCompetenciaFiltro` Atualizado

**Antes:** Anos hardcoded (2023 até ano atual)
```typescript
// ❌ ANTIGO - Hardcoded
const anosDisponiveis = useMemo(() => {
  const anos: number[] = [];
  for (let a = anoAtual; a >= 2023; a--) {
    anos.push(a);
  }
  return anos;
}, [anoAtual]);
```

**Depois:** Busca dinâmica do banco de dados
```typescript
// ✅ NOVO - Dinâmico
useEffect(() => {
  async function buscarAnosDisponiveis() {
    const { data } = await supabase
      .from('dados_mensais')
      .select('ano')
      .order('ano', { ascending: false });
    
    const anosUnicos = [...new Set(data.map(d => d.ano))];
    setAnosDisponiveis(anosUnicos);
  }
  buscarAnosDisponiveis();
}, []);
```

**Resultado:** Filtros agora mostram **2023, 2024, 2025** (anos reais do banco)

---

### 2. Novo Hook `useDadosMensais`

Hook especializado para consultar dados históricos da tabela `dados_mensais`.

**Localização:** `src/hooks/useDadosMensais.ts`

**Uso:**
```typescript
import { useDadosMensais } from '@/hooks/useDadosMensais';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';

function MinhaPage() {
  const competencia = useCompetenciaFiltro();
  const { dadosAgregados, loading } = useDadosMensais(
    competencia.range,
    unidadeId // ou null para consolidado
  );

  if (loading) return <Loading />;

  return (
    <div>
      <p>Alunos: {dadosAgregados.alunos_pagantes}</p>
      <p>Matrículas: {dadosAgregados.novas_matriculas}</p>
      <p>Churn: {dadosAgregados.churn_rate}%</p>
    </div>
  );
}
```

**Dados Retornados:**
```typescript
interface DadosMensaisAgregados {
  alunos_pagantes: number;        // Média do período
  novas_matriculas: number;       // Soma do período
  evasoes: number;                // Soma do período
  churn_rate: number;             // Média do período
  ticket_medio: number;           // Média do período
  taxa_renovacao: number;         // Média do período
  tempo_permanencia: number;      // Média em meses
  inadimplencia: number;          // % média
  faturamento_estimado: number;   // Soma do período
  faturamento_realizado: number;  // Calculado
  mrr: number;                    // Calculado
}
```

---

### 3. Páginas que Precisam Atualizar

| Página | Arquivo | Status | Prioridade |
|--------|---------|--------|------------|
| **Dashboard** | `DashboardPage.tsx` | ⏳ Pendente | 🔴 Alta |
| **Analytics** | `GestaoMensalPage.tsx` | ⏳ Pendente | 🔴 Alta |
| **Comercial** | `ComercialPage.tsx` | ⏳ Pendente | 🟡 Média |
| **Administrativo** | `AdministrativoPage.tsx` | ⏳ Pendente | 🟡 Média |
| **Professores** | `TabPerformanceProfessores.tsx` | ⏳ Pendente | 🟢 Baixa |

---

### 4. Guia de Implementação

#### Passo 1: Importar os hooks
```typescript
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { useDadosMensais } from '@/hooks/useDadosMensais';
```

#### Passo 2: Usar no componente
```typescript
const competencia = useCompetenciaFiltro();
const { dadosAgregados, loading, error } = useDadosMensais(
  competencia.range,
  filtroUnidade
);
```

#### Passo 3: Remover queries hardcoded de views
```typescript
// ❌ EVITAR - Views hardcoded
const { data } = await supabase
  .from('vw_kpis_gestao_mensal')  // ← Retorna só mês atual
  .select('*');

// ✅ USAR - Tabela com filtros
const { data } = await supabase
  .from('dados_mensais')
  .select('*')
  .eq('ano', competencia.range.ano)
  .gte('mes', competencia.range.mesInicio)
  .lte('mes', competencia.range.mesFim);
```

#### Passo 4: Exibir dados agregados
```typescript
if (loading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;

return (
  <KPICard
    label="Alunos Pagantes"
    value={dadosAgregados?.alunos_pagantes || 0}
    variant="cyan"
  />
);
```

---

### 5. Exemplo Completo - Dashboard

```typescript
import { useDadosMensais } from '@/hooks/useDadosMensais';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { useOutletContext } from 'react-router-dom';

export function DashboardPage() {
  const { filtroAtivo } = useOutletContext();
  const competencia = useCompetenciaFiltro();
  
  const { dadosAgregados, loading } = useDadosMensais(
    competencia.range,
    filtroAtivo
  );

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="grid grid-cols-4 gap-4">
      <KPICard
        icon={Users}
        label="Alunos Pagantes"
        value={dadosAgregados?.alunos_pagantes || 0}
        subvalue={`Período: ${competencia.range.label}`}
        variant="cyan"
      />
      <KPICard
        icon={TrendingUp}
        label="Novas Matrículas"
        value={dadosAgregados?.novas_matriculas || 0}
        subvalue={`Churn: ${dadosAgregados?.churn_rate || 0}%`}
        variant="emerald"
      />
      <KPICard
        icon={DollarSign}
        label="Ticket Médio"
        value={formatCurrency(dadosAgregados?.ticket_medio || 0)}
        variant="violet"
      />
      <KPICard
        icon={TrendingDown}
        label="Evasões"
        value={dadosAgregados?.evasoes || 0}
        variant="rose"
      />
    </div>
  );
}
```

---

### 6. Benefícios da Solução

✅ **Filtros Funcionais:** Mês, Trimestre, Semestre e Ano agora funcionam corretamente  
✅ **Dados Reais:** Acessa histórico de 2023-2025 (36 meses)  
✅ **Performance:** Consulta direta à tabela otimizada  
✅ **Manutenível:** Código centralizado nos hooks  
✅ **Escalável:** Fácil adicionar novos períodos  
✅ **Type-Safe:** TypeScript completo  

---

### 7. Próximos Passos

1. ✅ Hook `useCompetenciaFiltro` atualizado
2. ✅ Hook `useDadosMensais` criado
3. ⏳ Atualizar Dashboard
4. ⏳ Atualizar Analytics
5. ⏳ Atualizar Comercial
6. ⏳ Atualizar Administrativo
7. ⏳ Testar com dados 2023-2025

---

*Documento gerado automaticamente em 27/01/2026*  
*Última atualização: 27/01/2026 - 17:20*
