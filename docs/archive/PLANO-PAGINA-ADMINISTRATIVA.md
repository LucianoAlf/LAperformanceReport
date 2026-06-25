# 📋 PLANO - PÁGINA ADMINISTRATIVA

## Visão Geral

A página **Administrativa** será o centro de controle para gestão de renovações, avisos prévios e evasões. Ela permitirá lançamento rápido de movimentações e geração de relatórios para WhatsApp.

---

## 1. AUDITORIA - KPIs Existentes (Analytics/Gestão)

### Sub-aba ALUNOS
| KPI | Fonte | Usado no Relatório |
|-----|-------|-------------------|
| Total Alunos Ativos | `vw_kpis_gestao_mensal` | ✅ Diário/Mensal |
| Alunos Pagantes | `vw_kpis_gestao_mensal` | ✅ Diário/Mensal |
| LA Music Kids | `vw_kpis_gestao_mensal` | ❌ |
| LA Music School | `vw_kpis_gestao_mensal` | ❌ |
| Banda | `vw_kpis_gestao_mensal` | ✅ Diário/Mensal |
| Novas Matrículas | `vw_kpis_gestao_mensal` | ✅ Diário/Mensal |
| Evasões | `vw_kpis_gestao_mensal` | ✅ Diário/Mensal |
| Saldo Líquido | calculado | ❌ |
| Bolsistas Integrais | `vw_kpis_gestao_mensal` | ✅ Diário/Mensal |
| Bolsistas Parciais | `vw_kpis_gestao_mensal` | ✅ Diário/Mensal |

### Sub-aba FINANCEIRO
| KPI | Fonte | Usado no Relatório |
|-----|-------|-------------------|
| Ticket Médio | `dados_mensais` | ✅ Mensal |
| MRR | `dados_mensais` | ❌ |
| ARR | calculado | ❌ |
| LTV Médio | `dados_mensais` | ✅ Mensal (tempo permanência) |
| Faturamento Previsto | `dados_mensais` | ❌ |
| Faturamento Realizado | `dados_mensais` | ✅ Mensal |
| Inadimplência % | `dados_mensais` | ✅ Mensal |
| Reajuste Médio % | `dados_mensais` | ❌ |

### Sub-aba RETENÇÃO
| KPI | Fonte | Usado no Relatório |
|-----|-------|-------------------|
| Cancelamentos | `evasoes_v2` | ✅ Diário/Mensal |
| Não Renovações | `renovacoes` | ✅ Diário/Mensal |
| Total Evasões | calculado | ✅ Diário/Mensal |
| Churn Rate % | `dados_mensais` | ✅ Mensal |
| MRR Perdido | calculado | ❌ |
| Renovações | `renovacoes` | ✅ Diário/Mensal |
| Taxa Renovação % | calculado | ❌ |
| Aviso Prévio | `evasoes_v2` | ✅ Diário/Mensal |
| Tempo Permanência | `dados_mensais` | ✅ Mensal |

---

## 2. ESTRUTURA DO BANCO DE DADOS

### Tabela: `movimentacoes_admin`

```sql
CREATE TABLE movimentacoes_admin (
  id SERIAL PRIMARY KEY,
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  data DATE NOT NULL,
  
  -- Tipo: renovacao, nao_renovacao, aviso_previo, evasao
  tipo VARCHAR(50) NOT NULL,
  
  -- Dados do aluno
  aluno_nome VARCHAR(255) NOT NULL,
  aluno_id INTEGER, -- opcional, para vincular com tabela alunos
  
  -- Relacionamentos
  professor_id INTEGER REFERENCES professores(id),
  curso_id INTEGER REFERENCES cursos(id),
  
  -- Valores (para renovação)
  valor_parcela_anterior DECIMAL(10,2),
  valor_parcela_novo DECIMAL(10,2),
  forma_pagamento_id INTEGER REFERENCES formas_pagamento(id),
  
  -- Para aviso prévio
  mes_saida DATE, -- primeiro dia do mês que vai sair
  
  -- Para evasão
  tipo_evasao VARCHAR(50), 
  -- Valores: interrompido, nao_renovou, interrompido_2_curso,
  --          interrompido_bolsista, interrompido_banda
  
  -- Comum
  motivo TEXT,
  observacoes TEXT,
  agente_comercial VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_movimentacoes_admin_unidade ON movimentacoes_admin(unidade_id);
CREATE INDEX idx_movimentacoes_admin_data ON movimentacoes_admin(data);
CREATE INDEX idx_movimentacoes_admin_tipo ON movimentacoes_admin(tipo);
```

---

## 3. LAYOUT DA PÁGINA

### Header
- Título: "Administrativo"
- Subtítulo: "Gestão de Renovações, Avisos e Evasões"
- Filtro de Mês/Ano
- Botão "📊 Relatório" (abre modal de seleção)

### Seção 1: Resumo do Mês (KPIs)
Grid 6 colunas:
1. **Alunos Ativos** - cyan
2. **Pagantes** - emerald (subvalor: não pagantes)
3. **Matrículas Ativas** - violet (subvalor: banda | 2º curso)
4. **Bolsistas** - amber (subvalor: integrais | parciais)
5. **Trancados** - slate
6. **Novos no Mês** - green

### Seção 2: Lançamento Rápido (Quick Input)
Grid 4 colunas - Cards clicáveis:

| Card | Cor | Contador | Subinfo |
|------|-----|----------|---------|
| ✅ Renovação | emerald | Realizadas | Pendentes: X |
| ❌ Não Renovação | amber | Total | % das renovações |
| ⚠️ Aviso Prévio | orange | Total | Saem em [Mês] |
| 🚪 Evasão | rose | Total | Churn: X% |

### Seção 3: Detalhamento (Tabs)
Abas:
1. **✅ Renovações (N)** - Tabela com: #, Data, Aluno, Anterior, Novo, %, Forma, Agente, Ações
2. **⚠️ Avisos Prévios (N)** - Tabela com: #, Data, Aluno, Parcela, Professor, Motivo, Mês Saída, Ações
3. **🚪 Evasões (N)** - Tabela com: #, Data, Aluno, Tipo, Professor, Motivo, Ações

---

## 4. MODAIS DE LANÇAMENTO

### Modal: Registrar Renovação
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Data | DatePicker | ✅ |
| Nome do Aluno | Input | ✅ |
| Parcela Anterior (R$) | Number | ✅ |
| Parcela Nova (R$) | Number | ✅ |
| Forma Pagamento | Select | ✅ |
| Agente Comercial | Input | ❌ |

**Cálculo automático:** Reajuste % = ((Novo - Anterior) / Anterior) * 100

### Modal: Registrar Aviso Prévio
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Data do Aviso | DatePicker | ✅ |
| Mês de Saída | Select (meses) | ✅ |
| Nome do Aluno | Input | ✅ |
| Parcela (R$) | Number | ❌ |
| Professor | Select | ❌ |
| Motivo | Textarea | ✅ |

### Modal: Registrar Não Renovação
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Data | DatePicker | ✅ |
| Nome do Aluno | Input | ✅ |
| Professor | Select | ❌ |
| Motivo | Textarea | ✅ |
| Agente Comercial | Input | ❌ |

### Modal: Registrar Evasão
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Data | DatePicker | ✅ |
| Tipo | Select | ✅ |
| Nome do Aluno | Input | ✅ |
| Professor | Select | ❌ |
| Motivo | Textarea | ✅ |

**Tipos de Evasão:**
- Interrompido
- Não Renovou
- Interrompido 2º Curso
- Interrompido Bolsista
- Interrompido Banda

---

## 5. TIPOS DE RELATÓRIO

### 📅 Relatório Diário
```
*Relatório Diário Administrativo: DD/MM/AAAA*

● Alunos Ativos: X
● Não Pagantes: X
● Trancados: X
● Bolsistas: X
● Bolsistas Parciais: X
● Pagantes: X
● Alunos novos no mês: X
● Matrículas Ativas: X
● Matrículas em Banda: X
● Matrículas 2º curso: X

🔹 RENOVAÇÕES
● Previsto no mês: X
● Realizadas: X
● Pendentes: X
● Não Renovações: X

🔹 AVISOS PRÉVIOS
[Lista com Nome, Motivo, Parcela, Professor]

🔹 EVASÕES
● Total: X
● Interrompido: X
● Não renovou: X
```

### 📊 Relatório Mensal
```
*RELATÓRIO ADMINISTRATIVO*
*[Unidade] - [Mês/Ano]*

● Alunos Ativos: X
● Alunos pagantes: X
● Pagantes no mês: X
● Não pagantes no mês: X
● Alunos novos: X
● Bolsistas: X
● Trancou: X
● Inadimplência: X
● Matrículas Ativas: X
● Matrículas em Banda: X
● Matrículas 2º curso: X

● LTV: X meses e X dias
● Churn Rate: X%
● Ticket Médio: R$ X
● Faturamento: R$ X

🔹 RENOVAÇÕES
[Lista: Nome | Anterior → Novo | Forma | Agente]

🔹 NÃO RENOVAÇÕES
[Lista: Nome | Motivo | Professor | Agente]

🔹 AVISOS PRÉVIOS
[Lista: Nome | Motivo | Professor]

🔹 EVASÕES
[Lista: Nome | Tipo | Motivo | Professor]
```

---

## 6. ARQUIVOS A CRIAR

```
src/
├── components/
│   └── App/
│       └── Administrativo/
│           ├── AdministrativoPage.tsx      # Página principal
│           ├── ResumoMes.tsx               # KPIs do mês
│           ├── QuickInput.tsx              # Cards de lançamento rápido
│           ├── TabelaRenovacoes.tsx        # Tab de renovações
│           ├── TabelaAvisosPrevios.tsx     # Tab de avisos
│           ├── TabelaEvasoes.tsx           # Tab de evasões
│           ├── ModalRenovacao.tsx          # Modal de renovação
│           ├── ModalAvisoPrevio.tsx        # Modal de aviso prévio
│           ├── ModalNaoRenovacao.tsx       # Modal de não renovação
│           ├── ModalEvasao.tsx             # Modal de evasão
│           └── ModalRelatorio.tsx          # Modal de seleção/visualização
└── hooks/
    └── useMovimentacoesAdmin.ts            # Hook para CRUD
```

---

## 7. PRÓXIMOS PASSOS

1. ✅ Auditoria da página Analytics concluída
2. ✅ Plano detalhado criado
3. ✅ Wireframe HTML criado
4. ⏳ Criar migration do banco de dados
5. ⏳ Implementar página AdministrativoPage.tsx
6. ⏳ Implementar modais de lançamento
7. ⏳ Implementar geração de relatórios
8. ⏳ Adicionar rota no AppLayout

---

## Wireframe Visual

Veja o arquivo `wireframe-administrativo.html` para visualização interativa do layout.
