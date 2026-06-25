# 🎯 PLANO DETALHADO: Simulador de Metas com Alertas

## 1. Visão Geral

### Conceito
Uma **calculadora de planejamento estratégico** onde o gestor define o objetivo final (ex: 535 alunos em Dez/2026) e o sistema:
1. Calcula automaticamente o que precisa acontecer para chegar lá
2. Alerta sobre inconsistências e inviabilidades
3. Sugere ajustes baseados em dados históricos
4. Permite aplicar as metas calculadas diretamente

### Localização
- **Nova aba na página de Metas**: `Simulador` (ao lado de Gestão, Comercial, Financeiro)
- **Ou página dedicada**: `/app/simulador`

---

## 2. Arquitetura de Dados

### 2.1 Dados de Entrada (já existentes no sistema)

```
┌─────────────────────────────────────────────────────────────────┐
│  DADOS ATUAIS (buscar do banco)                                 │
├─────────────────────────────────────────────────────────────────┤
│  • alunos_pagantes_atual    → vw_kpis_gestao_mensal            │
│  • ticket_medio_atual       → vw_kpis_gestao_mensal            │
│  • churn_atual              → vw_kpis_gestao_mensal            │
│  • taxa_renovacao_atual     → vw_kpis_gestao_mensal            │
│  • matriculas_historico     → média últimos 6-12 meses         │
│  • leads_historico          → média últimos 6-12 meses         │
│  • taxa_conversao_historica → leads → experimentais → matrícula│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Nova Tabela: `simulacoes_metas`

```sql
CREATE TABLE simulacoes_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  unidade_id TEXT NOT NULL REFERENCES unidades(id),
  ano INTEGER NOT NULL,
  nome TEXT, -- Ex: "Cenário Otimista 2026"
  
  -- Inputs do usuário
  alunos_objetivo INTEGER NOT NULL,           -- Meta final de alunos
  mes_objetivo INTEGER DEFAULT 12,            -- Mês alvo (default: dezembro)
  churn_projetado NUMERIC(5,2),               -- Churn que o usuário quer trabalhar
  ticket_medio_projetado NUMERIC(10,2),       -- Ticket projetado
  taxa_conversao_lead_exp NUMERIC(5,2),       -- Lead → Experimental
  taxa_conversao_exp_mat NUMERIC(5,2),        -- Experimental → Matrícula
  
  -- Outputs calculados (salvos para histórico)
  matriculas_necessarias_mes INTEGER,
  leads_necessarios_mes INTEGER,
  experimentais_necessarias_mes INTEGER,
  evasoes_projetadas_mes INTEGER,
  crescimento_liquido_mes INTEGER,
  mrr_projetado NUMERIC(12,2),
  
  -- Alertas gerados (JSON)
  alertas JSONB DEFAULT '[]',
  
  -- Metadados
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  aplicado_em TIMESTAMP WITH TIME ZONE,      -- Se as metas foram aplicadas
  
  UNIQUE(unidade_id, ano, nome)
);

-- Índices
CREATE INDEX idx_simulacoes_unidade_ano ON simulacoes_metas(unidade_id, ano);

-- RLS
ALTER TABLE simulacoes_metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver simulações"
  ON simulacoes_metas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem criar simulações"
  ON simulacoes_metas FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar simulações"
  ON simulacoes_metas FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem deletar simulações"
  ON simulacoes_metas FOR DELETE TO authenticated USING (true);
```

### 2.3 Estrutura do JSON de Alertas

```typescript
interface Alerta {
  tipo: 'sucesso' | 'aviso' | 'erro' | 'sugestao';
  categoria: 'churn' | 'matriculas' | 'leads' | 'conversao' | 'ticket' | 'renovacao';
  mensagem: string;
  detalhe?: string;
  sugestao?: string;
  valor_atual?: number;
  valor_necessario?: number;
  valor_historico?: number;
}

// Exemplo:
[
  {
    "tipo": "aviso",
    "categoria": "matriculas",
    "mensagem": "Matrículas necessárias acima do histórico",
    "detalhe": "Você precisa de 25 matrículas/mês, mas a média histórica é 18",
    "sugestao": "Reduzir churn para 3.5% OU aumentar leads em 30%",
    "valor_atual": 18,
    "valor_necessario": 25
  },
  {
    "tipo": "sucesso",
    "categoria": "renovacao",
    "mensagem": "Taxa de renovação compatível",
    "detalhe": "Sua taxa atual de 82% atende ao mínimo necessário de 80%"
  }
]
```

---

## 3. Motor de Cálculo (Fórmulas Matemáticas)

### 3.1 Fórmulas Principais

```typescript
// ═══════════════════════════════════════════════════════════════
// FÓRMULAS DO SIMULADOR
// ═══════════════════════════════════════════════════════════════

// 1. Crescimento necessário
const crescimentoNecessario = alunosObjetivo - alunosAtual;
const crescimentoPercentual = (crescimentoNecessario / alunosAtual) * 100;
const mesesRestantes = mesObjetivo - mesAtual;

// 2. Evasões projetadas (baseado no churn)
const evasoesMensais = Math.round(alunosAtual * (churnProjetado / 100));
const evasoesTotais = evasoesMensais * mesesRestantes;

// 3. Matrículas necessárias
// Alunos(fim) = Alunos(início) + Matrículas - Evasões
// Matrículas = Alunos(fim) - Alunos(início) + Evasões
const matriculasTotais = crescimentoNecessario + evasoesTotais;
const matriculasMensais = Math.ceil(matriculasTotais / mesesRestantes);

// 4. Funil comercial reverso
// Matrículas = Leads × TaxaLeadExp × TaxaExpMat
// Leads = Matrículas / (TaxaLeadExp × TaxaExpMat)
const taxaConversaoTotal = (taxaLeadExp / 100) * (taxaExpMat / 100);
const leadsNecessarios = Math.ceil(matriculasMensais / taxaConversaoTotal);
const experimentaisNecessarias = Math.ceil(matriculasMensais / (taxaExpMat / 100));

// 5. MRR projetado
const mrrProjetado = alunosObjetivo * ticketMedioProjetado;

// 6. Tempo médio de permanência (LTV relacionado)
const tempoPermanenciaMeses = 1 / (churnProjetado / 100);
```

### 3.2 Regras de Alertas

```typescript
function gerarAlertas(params: SimulacaoParams, historico: DadosHistoricos): Alerta[] {
  const alertas: Alerta[] = [];
  
  // ─────────────────────────────────────────────────────────────
  // ALERTA 1: Matrículas vs Histórico
  // ─────────────────────────────────────────────────────────────
  if (params.matriculasMensais > historico.mediaMatriculas * 1.3) {
    alertas.push({
      tipo: 'aviso',
      categoria: 'matriculas',
      mensagem: 'Matrículas necessárias acima do histórico',
      detalhe: `Você precisa de ${params.matriculasMensais} matrículas/mês, mas a média histórica é ${historico.mediaMatriculas}`,
      sugestao: 'Reduzir churn OU aumentar investimento em marketing',
      valor_atual: historico.mediaMatriculas,
      valor_necessario: params.matriculasMensais
    });
  } else {
    alertas.push({
      tipo: 'sucesso',
      categoria: 'matriculas',
      mensagem: 'Meta de matrículas viável',
      detalhe: `${params.matriculasMensais} matrículas/mês está dentro do histórico`
    });
  }
  
  // ─────────────────────────────────────────────────────────────
  // ALERTA 2: Churn muito alto
  // ─────────────────────────────────────────────────────────────
  if (params.churnProjetado > 5) {
    alertas.push({
      tipo: 'erro',
      categoria: 'churn',
      mensagem: 'Churn projetado muito alto',
      detalhe: `Churn de ${params.churnProjetado}% gera ${params.evasoesMensais} evasões/mês`,
      sugestao: 'Implementar programa de retenção para reduzir churn para < 4%'
    });
  }
  
  // ─────────────────────────────────────────────────────────────
  // ALERTA 3: Leads necessários vs capacidade
  // ─────────────────────────────────────────────────────────────
  if (params.leadsNecessarios > historico.mediaLeads * 1.5) {
    alertas.push({
      tipo: 'erro',
      categoria: 'leads',
      mensagem: 'Leads necessários muito acima da capacidade',
      detalhe: `Precisa de ${params.leadsNecessarios} leads/mês, histórico é ${historico.mediaLeads}`,
      sugestao: 'Aumentar taxa de conversão OU investir em geração de leads'
    });
  }
  
  // ─────────────────────────────────────────────────────────────
  // ALERTA 4: Taxa de conversão baixa
  // ─────────────────────────────────────────────────────────────
  if (params.taxaConversaoTotal < 0.15) {
    alertas.push({
      tipo: 'aviso',
      categoria: 'conversao',
      mensagem: 'Taxa de conversão pode ser melhorada',
      detalhe: `Conversão atual de ${(params.taxaConversaoTotal * 100).toFixed(1)}%`,
      sugestao: 'Treinar equipe comercial para aumentar conversão para > 20%'
    });
  }
  
  // ─────────────────────────────────────────────────────────────
  // ALERTA 5: Crescimento muito agressivo
  // ─────────────────────────────────────────────────────────────
  const crescimentoMensal = params.crescimentoPercentual / params.mesesRestantes;
  if (crescimentoMensal > 3) {
    alertas.push({
      tipo: 'aviso',
      categoria: 'matriculas',
      mensagem: 'Crescimento muito agressivo',
      detalhe: `Crescimento de ${crescimentoMensal.toFixed(1)}%/mês é desafiador`,
      sugestao: 'Considerar meta mais conservadora ou prazo maior'
    });
  }
  
  // ─────────────────────────────────────────────────────────────
  // ALERTA 6: Meta atingível (positivo!)
  // ─────────────────────────────────────────────────────────────
  const viabilidade = calcularViabilidade(params, historico);
  if (viabilidade > 80) {
    alertas.push({
      tipo: 'sucesso',
      categoria: 'matriculas',
      mensagem: '🎉 Meta viável!',
      detalhe: `Probabilidade de atingimento: ${viabilidade}%`
    });
  }
  
  return alertas;
}
```

---

## 4. Componentes React

### 4.1 Estrutura de Arquivos

```
src/
├── components/
│   └── App/
│       └── Metas/
│           ├── MetasPageNew.tsx          (existente - adicionar aba)
│           ├── Simulador/
│           │   ├── SimuladorPage.tsx     (container principal)
│           │   ├── SituacaoAtual.tsx     (card com dados atuais)
│           │   ├── MetaObjetivo.tsx      (input da meta final)
│           │   ├── CalculoAutomatico.tsx (exibe cálculos)
│           │   ├── AlertasViabilidade.tsx(lista de alertas)
│           │   ├── MetasCalculadas.tsx   (metas sugeridas)
│           │   └── ProjecaoMensal.tsx    (gráfico/tabela mensal)
│           └── ...
├── hooks/
│   ├── useSimulador.ts                   (lógica de cálculo)
│   └── useDadosHistoricos.ts             (busca dados históricos)
└── lib/
    └── simulador/
        ├── calculos.ts                   (fórmulas matemáticas)
        ├── alertas.ts                    (geração de alertas)
        └── tipos.ts                      (interfaces TypeScript)
```

### 4.2 Interfaces TypeScript

```typescript
// src/lib/simulador/tipos.ts

export interface DadosAtuais {
  alunosAtivos: number;
  alunosPagantes: number;
  ticketMedio: number;
  churnRate: number;
  taxaRenovacao: number;
  mrr: number;
}

export interface DadosHistoricos {
  mediaMatriculas: number;      // Média mensal últimos 12 meses
  mediaEvasoes: number;
  mediaLeads: number;
  mediaExperimentais: number;
  taxaConversaoLeadExp: number; // Lead → Experimental
  taxaConversaoExpMat: number;  // Experimental → Matrícula
  taxaConversaoTotal: number;   // Lead → Matrícula
}

export interface InputsSimulacao {
  alunosObjetivo: number;
  mesObjetivo: number;          // 1-12
  churnProjetado?: number;      // Se não informado, usa atual
  ticketMedioProjetado?: number;
  taxaConversaoLeadExp?: number;
  taxaConversaoExpMat?: number;
}

export interface ResultadoSimulacao {
  // Crescimento
  crescimentoNecessario: number;
  crescimentoPercentual: number;
  mesesRestantes: number;
  
  // Projeções mensais
  evasoesMensais: number;
  matriculasMensais: number;
  leadsNecessarios: number;
  experimentaisNecessarias: number;
  
  // Totais no período
  evasoesTotais: number;
  matriculasTotais: number;
  
  // Financeiro
  mrrProjetado: number;
  faturamentoAnualProjetado: number;
  
  // Viabilidade
  scoreViabilidade: number;     // 0-100
  alertas: Alerta[];
}

export interface Alerta {
  id: string;
  tipo: 'sucesso' | 'aviso' | 'erro' | 'sugestao';
  categoria: 'churn' | 'matriculas' | 'leads' | 'conversao' | 'ticket' | 'renovacao' | 'geral';
  icone: string;
  mensagem: string;
  detalhe?: string;
  sugestao?: string;
  valorAtual?: number;
  valorNecessario?: number;
}

export interface ProjecaoMensal {
  mes: number;
  ano: number;
  label: string;                // "Jan/26"
  alunosInicio: number;
  matriculas: number;
  evasoes: number;
  alunosFim: number;
  mrr: number;
  acumuladoMatriculas: number;
  acumuladoEvasoes: number;
}
```

---

## 5. Wireframe Visual

Vou criar um HTML interativo para você visualizar:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  METAS 2026                                                                 │
│  ┌──────────┬──────────┬────────────┬─────────────┐                        │
│  │ Gestão   │ Comercial│ Financeiro │ 🎯Simulador │  ← Nova aba            │
│  └──────────┴──────────┴────────────┴─────────────┘                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ 📊 SITUAÇÃO ATUAL               │  │ 🎯 META OBJETIVO                │  │
│  │ Campo Grande • Jan/2026         │  │                                 │  │
│  │                                 │  │  Alunos em Dez/2026:            │  │
│  │  Alunos Pagantes    480         │  │  ┌─────────────────────────┐    │  │
│  │  Ticket Médio       R$ 285      │  │  │         535             │    │  │
│  │  Churn Rate         4.2%        │  │  └─────────────────────────┘    │  │
│  │  Taxa Renovação     82%         │  │                                 │  │
│  │  MRR                R$ 136.800  │  │  Crescimento: +55 (+11.5%)      │  │
│  │                                 │  │  Meses restantes: 11            │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 🧮 CÁLCULO AUTOMÁTICO                                                │  │
│  │                                                                      │  │
│  │  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌──────────┐ │  │
│  │  │  Evasões   │ →  │ Matrículas │ →  │   Leads    │ →  │   MRR    │ │  │
│  │  │  ~20/mês   │    │  25/mês    │    │  85/mês    │    │ R$ 152k  │ │  │
│  │  │  240/ano   │    │  295/ano   │    │  1020/ano  │    │ +11.5%   │ │  │
│  │  └────────────┘    └────────────┘    └────────────┘    └──────────┘ │  │
│  │                                                                      │  │
│  │  Fórmula: 480 + 295 matrículas - 240 evasões = 535 alunos ✓         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠️ ALERTAS DE VIABILIDADE                              Score: 72%   │  │
│  │                                                                      │  │
│  │  ✅ Taxa de renovação 82% é compatível com a meta                   │  │
│  │                                                                      │  │
│  │  ⚠️ Matrículas necessárias acima do histórico                       │  │
│  │     Precisa: 25/mês • Histórico: 18/mês (+39%)                      │  │
│  │     💡 Reduzir churn para 3.5% OU aumentar leads em 30%             │  │
│  │                                                                      │  │
│  │  ⚠️ Leads necessários exigem aumento de investimento                │  │
│  │     Precisa: 85/mês • Histórico: 65/mês (+31%)                      │  │
│  │     💡 Aumentar budget de marketing em ~R$ 2.000/mês                │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 📈 METAS CALCULADAS (prontas para aplicar)                          │  │
│  │                                                                      │  │
│  │  ┌─────────────┬─────────────┬─────────────┬─────────────┐          │  │
│  │  │ Leads       │ Experiment. │ Matrículas  │ Churn máx   │          │  │
│  │  │ 85/mês      │ 50/mês      │ 25/mês      │ 4.2%        │          │  │
│  │  └─────────────┴─────────────┴─────────────┴─────────────┘          │  │
│  │                                                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────┐    │  │
│  │  │ 💾 Aplicar Metas │ 🔄 Recalcular │ 📊 Ver Projeção Mensal │    │  │
│  │  └─────────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Fluxo de Uso

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO DO SIMULADOR                                │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ 1. ENTRADA   │
     │              │
     │ Usuário      │
     │ seleciona    │
     │ unidade e    │
     │ digita meta  │
     │ de alunos    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 2. BUSCA     │
     │              │
     │ Sistema      │
     │ busca dados  │
     │ atuais e     │
     │ históricos   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 3. CÁLCULO   │
     │              │
     │ Motor aplica │
     │ fórmulas e   │
     │ calcula      │
     │ necessidades │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 4. ALERTAS   │
     │              │
     │ Compara com  │
     │ histórico e  │
     │ gera alertas │
     │ de viabilid. │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 5. EXIBIÇÃO  │
     │              │
     │ Mostra       │
     │ resultados,  │
     │ alertas e    │
     │ sugestões    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐      ┌──────────────┐
     │ 6. AJUSTE    │◄────►│ 7. APLICAR   │
     │              │      │              │
     │ Usuário pode │      │ Salva metas  │
     │ ajustar      │      │ calculadas   │
     │ parâmetros   │      │ na tabela    │
     │ e recalcular │      │ metas_kpi    │
     └──────────────┘      └──────────────┘
```

---

## 7. Implementação por Etapas

### Etapa 1: Infraestrutura (30 min)
- [ ] Criar tabela `simulacoes_metas` no Supabase
- [ ] Criar tipos TypeScript em `src/lib/simulador/tipos.ts`
- [ ] Criar funções de cálculo em `src/lib/simulador/calculos.ts`

### Etapa 2: Hook de Dados (20 min)
- [ ] Criar `useDadosHistoricos.ts` - busca médias históricas
- [ ] Criar `useSimulador.ts` - lógica principal do simulador

### Etapa 3: Componentes UI (60 min)
- [ ] `SituacaoAtual.tsx` - exibe dados atuais da unidade
- [ ] `MetaObjetivo.tsx` - input para meta de alunos
- [ ] `CalculoAutomatico.tsx` - mostra cálculos em cards
- [ ] `AlertasViabilidade.tsx` - lista de alertas coloridos
- [ ] `MetasCalculadas.tsx` - metas prontas para aplicar
- [ ] `SimuladorPage.tsx` - container que une tudo

### Etapa 4: Integração (20 min)
- [ ] Adicionar aba "Simulador" na `MetasPageNew.tsx`
- [ ] Implementar botão "Aplicar Metas" (salva em `metas_kpi`)
- [ ] Testar fluxo completo

### Etapa 5: Projeção Mensal (opcional, 30 min)
- [ ] `ProjecaoMensal.tsx` - tabela/gráfico mês a mês
- [ ] Gráfico de evolução projetada vs meta

---

## 8. Estimativa de Tempo Total

| Etapa | Tempo |
|-------|-------|
| Infraestrutura | 30 min |
| Hook de Dados | 20 min |
| Componentes UI | 60 min |
| Integração | 20 min |
| Projeção Mensal | 30 min |
| **TOTAL** | **~2h30** |

---

## 9. Perguntas para Validação

1. **Escopo**: O simulador deve funcionar por unidade OU também consolidado?
2. **Histórico**: Usar últimos 6 ou 12 meses para médias?
3. **Salvamento**: Salvar simulações para comparar cenários depois?
4. **Projeção Mensal**: Incluir gráfico de evolução mês a mês?
5. **Parâmetros ajustáveis**: Usuário pode alterar churn/conversão projetados?

---

## 10. Próximos Passos

Após sua aprovação:
1. Crio a tabela no Supabase
2. Implemento as funções de cálculo
3. Construo os componentes UI
4. Integro na página de Metas
5. Testo o fluxo completo

**Aguardo sua aprovação para iniciar a implementação!** 🚀
