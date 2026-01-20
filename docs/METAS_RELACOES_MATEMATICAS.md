# 🧮 METAS E RELAÇÕES MATEMÁTICAS - Simulador LA Music

## Objetivo
Definir **TODAS** as metas que o simulador pode calcular e suas interdependências matemáticas, para que o usuário possa editar qualquer uma e o sistema recalcule as outras automaticamente.

---

## 1. MAPA COMPLETO DE METAS

### 📊 GESTÃO (Alunos)
| # | Meta | Tipo | Unidade | Relação com outras |
|---|------|------|---------|-------------------|
| G1 | **Alunos Pagantes** | Snapshot | número | = G1_anterior + C3 - G2 |
| G2 | **Evasões** | Soma | número | = G1 × G3 |
| G3 | **Churn Rate** | Média | % | = G2 / G1 × 100 |
| G4 | **Taxa Renovação** | Média | % | ≈ 100% - G3 (aproximado) |
| G5 | **Ticket Médio** | Média | R$ | Input direto ou histórico |
| G6 | **MRR** | Snapshot | R$ | = G1 × G5 |
| G7 | **Faturamento Anual** | Soma | R$ | = G6 × 12 |

### 📞 COMERCIAL (Funil)
| # | Meta | Tipo | Unidade | Relação com outras |
|---|------|------|---------|-------------------|
| C1 | **Leads** | Soma | número | = C2 / C4 |
| C2 | **Experimentais** | Soma | número | = C3 / C5 |
| C3 | **Matrículas** | Soma | número | = (G1_objetivo - G1_atual) + G2 |
| C4 | **Taxa Lead→Exp** | Média | % | = C2 / C1 × 100 |
| C5 | **Taxa Exp→Mat** | Média | % | = C3 / C2 × 100 |
| C6 | **Taxa Conversão Total** | Média | % | = C4 × C5 / 100 |
| C7 | **Ticket Passaporte** | Média | R$ | Input direto |

### 💰 FINANCEIRO
| # | Meta | Tipo | Unidade | Relação com outras |
|---|------|------|---------|-------------------|
| F1 | **Faturamento Previsto** | Soma | R$ | = G1 × G5 |
| F2 | **Inadimplência %** | Média | % | Input ou histórico |
| F3 | **Inadimplência R$** | Soma | R$ | = F1 × F2 / 100 |
| F4 | **Faturamento Realizado** | Soma | R$ | = F1 - F3 |
| F5 | **LTV** | Média | R$ | = G5 × (1 / G3) |

### 👨‍🏫 PROFESSORES (opcional)
| # | Meta | Tipo | Unidade | Relação com outras |
|---|------|------|---------|-------------------|
| P1 | **Média Alunos/Professor** | Média | número | = G1 / P2 |
| P2 | **Total Professores** | Snapshot | número | Input |
| P3 | **Média Alunos/Turma** | Média | número | Input ou cálculo |

---

## 2. GRAFO DE DEPENDÊNCIAS

```
                    ┌─────────────────────────────────────────────────────┐
                    │                   INPUTS PRIMÁRIOS                   │
                    │  (usuário pode definir diretamente)                  │
                    └─────────────────────────────────────────────────────┘
                                            │
            ┌───────────────────────────────┼───────────────────────────────┐
            │                               │                               │
            ▼                               ▼                               ▼
    ┌───────────────┐              ┌───────────────┐              ┌───────────────┐
    │ G1: Alunos    │              │ G3: Churn %   │              │ G5: Ticket    │
    │ Objetivo      │              │ Projetado     │              │ Médio         │
    └───────┬───────┘              └───────┬───────┘              └───────┬───────┘
            │                               │                               │
            │                               ▼                               │
            │                      ┌───────────────┐                        │
            │                      │ G2: Evasões   │                        │
            │                      │ = G1 × G3     │                        │
            │                      └───────┬───────┘                        │
            │                               │                               │
            └───────────────┬───────────────┘                               │
                            │                                               │
                            ▼                                               │
                   ┌───────────────┐                                        │
                   │ C3: Matrículas│                                        │
                   │ = ΔG1 + G2    │                                        │
                   └───────┬───────┘                                        │
                           │                                                │
            ┌──────────────┼──────────────┐                                 │
            │              │              │                                 │
            ▼              │              ▼                                 │
    ┌───────────────┐      │      ┌───────────────┐                        │
    │ C5: Taxa      │      │      │ C4: Taxa      │                        │
    │ Exp→Mat %     │      │      │ Lead→Exp %    │                        │
    └───────┬───────┘      │      └───────┬───────┘                        │
            │              │              │                                 │
            ▼              │              │                                 │
    ┌───────────────┐      │              │                                 │
    │ C2: Experim.  │      │              │                                 │
    │ = C3 / C5     │      │              │                                 │
    └───────┬───────┘      │              │                                 │
            │              │              │                                 │
            └──────────────┼──────────────┘                                 │
                           │                                                │
                           ▼                                                │
                   ┌───────────────┐                                        │
                   │ C1: Leads     │                                        │
                   │ = C2 / C4     │                                        │
                   └───────────────┘                                        │
                                                                            │
                           ┌────────────────────────────────────────────────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ G6: MRR       │
                   │ = G1 × G5    │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ F1: Faturamento│
                   │ = G6 × 12     │
                   └───────────────┘
```

---

## 3. FÓRMULAS MATEMÁTICAS DETALHADAS

### 3.1 Cálculo de Evasões
```typescript
// Evasões mensais baseadas no churn
evasoesMensais = alunosAtuais * (churnRate / 100)

// Evasões totais no período
evasoesTotais = evasoesMensais * mesesRestantes

// Exemplo: 480 alunos × 4.2% = 20.16 ≈ 20 evasões/mês
```

### 3.2 Cálculo de Matrículas Necessárias
```typescript
// Crescimento líquido necessário
crescimentoNecessario = alunosObjetivo - alunosAtuais

// Matrículas totais = compensar evasões + crescer
matriculasTotais = crescimentoNecessario + evasoesTotais
matriculasMensais = matriculasTotais / mesesRestantes

// Exemplo: (535 - 480) + 240 = 295 matrículas/ano = 25/mês
```

### 3.3 Cálculo do Funil Reverso
```typescript
// Taxa de conversão total
taxaConversaoTotal = (taxaLeadExp / 100) * (taxaExpMat / 100)

// Experimentais necessárias (dado matrículas e taxa exp→mat)
experimentaisNecessarias = matriculasMensais / (taxaExpMat / 100)

// Leads necessários (dado experimentais e taxa lead→exp)
leadsNecessarios = experimentaisNecessarias / (taxaLeadExp / 100)

// Ou diretamente:
leadsNecessarios = matriculasMensais / taxaConversaoTotal

// Exemplo: 25 matrículas / (60% × 50%) = 25 / 0.30 = 83 leads
```

### 3.4 Cálculo Financeiro
```typescript
// MRR (Monthly Recurring Revenue)
mrr = alunosPagantes * ticketMedio

// Faturamento anual previsto
faturamentoAnual = mrr * 12

// Inadimplência
inadimplenciaValor = faturamentoPrevisto * (inadimplenciaPct / 100)
faturamentoRealizado = faturamentoPrevisto - inadimplenciaValor

// LTV (Lifetime Value)
tempoPermanenciaMeses = 1 / (churnRate / 100)  // Em meses
ltv = ticketMedio * tempoPermanenciaMeses

// Exemplo: Ticket R$285, Churn 4.2%
// Permanência = 1/0.042 = 23.8 meses
// LTV = 285 × 23.8 = R$ 6.783
```

---

## 4. MODOS DE CÁLCULO

O simulador pode operar em diferentes modos, dependendo de qual meta o usuário define como "âncora":

### Modo 1: Meta de Alunos (padrão)
```
INPUT:  Alunos Objetivo (ex: 535)
CALCULA: Evasões → Matrículas → Experimentais → Leads → MRR
```

### Modo 2: Meta de Faturamento
```
INPUT:  MRR Objetivo (ex: R$ 160.000)
CALCULA: Alunos necessários = MRR / Ticket
         → Evasões → Matrículas → Experimentais → Leads
```

### Modo 3: Meta de Matrículas
```
INPUT:  Matrículas/mês (ex: 30)
CALCULA: Alunos possíveis = Atual + (Matrículas - Evasões) × meses
         → Leads necessários → MRR projetado
```

### Modo 4: Meta de Leads (capacidade)
```
INPUT:  Leads disponíveis/mês (ex: 70)
CALCULA: Matrículas possíveis = Leads × Conversão
         → Crescimento possível → Alunos finais → MRR
```

---

## 5. CAMPOS EDITÁVEIS vs CALCULADOS

### 🔵 SEMPRE EDITÁVEIS (inputs primários)
| Campo | Descrição | Default |
|-------|-----------|---------|
| Alunos Objetivo | Meta final de alunos | +10% do atual |
| Churn Projetado | % de evasão esperado | Média histórica |
| Ticket Médio | Valor médio da parcela | Atual |
| Taxa Lead→Exp | Conversão de leads | Média histórica |
| Taxa Exp→Mat | Conversão de experimentais | Média histórica |
| Inadimplência % | Taxa de inadimplência | Média histórica |

### 🟢 CALCULADOS (mas podem ser sobrescritos)
| Campo | Fórmula | Pode editar? |
|-------|---------|--------------|
| Evasões/mês | Alunos × Churn | ✅ Sim (recalcula Churn) |
| Matrículas/mês | ΔAlunos + Evasões | ✅ Sim (recalcula Alunos objetivo) |
| Experimentais/mês | Matrículas / TaxaExpMat | ✅ Sim (recalcula Taxa) |
| Leads/mês | Experimentais / TaxaLeadExp | ✅ Sim (recalcula Taxa) |
| MRR | Alunos × Ticket | ✅ Sim (recalcula Alunos ou Ticket) |

### 🔴 SOMENTE LEITURA (resultados)
| Campo | Descrição |
|-------|-----------|
| Crescimento % | (Objetivo - Atual) / Atual |
| Meses restantes | Calculado automaticamente |
| Score de viabilidade | Baseado nos alertas |
| LTV projetado | Ticket × (1/Churn) |

---

## 6. REGRAS DE RECÁLCULO

Quando o usuário edita um campo calculado, o sistema precisa "inverter" a fórmula:

### Exemplo 1: Usuário edita Matrículas
```typescript
// Fórmula original: matriculas = (alunosObj - alunosAtual) + evasoes
// Invertendo: alunosObj = alunosAtual + matriculas - evasoes

if (usuarioEditou('matriculas')) {
  alunosObjetivo = alunosAtuais + (matriculasEditadas * meses) - evasoesTotais;
  // Recalcula o resto a partir do novo objetivo
}
```

### Exemplo 2: Usuário edita Leads
```typescript
// Fórmula original: leads = experimentais / taxaLeadExp
// Invertendo: taxaLeadExp = experimentais / leads

if (usuarioEditou('leads')) {
  // Opção A: Ajustar taxa de conversão
  taxaLeadExpNova = experimentaisNecessarias / leadsEditados;
  
  // Opção B: Ajustar matrículas possíveis (cascata reversa)
  matriculasPossiveis = leadsEditados * taxaConversaoTotal;
  alunosObjetivoPossivel = alunosAtuais + (matriculasPossiveis * meses) - evasoesTotais;
}
```

### Exemplo 3: Usuário edita MRR
```typescript
// Fórmula original: mrr = alunos * ticket
// Invertendo: alunos = mrr / ticket

if (usuarioEditou('mrr')) {
  alunosObjetivo = mrrEditado / ticketMedio;
  // Recalcula matrículas, leads, etc.
}
```

---

## 7. INTEGRAÇÃO COM IA (Edge Function)

### Proposta de Edge Function: `analisar-simulacao`

```typescript
// Supabase Edge Function
// POST /functions/v1/analisar-simulacao

interface RequestBody {
  unidade_id: string;
  dados_atuais: DadosAtuais;
  dados_historicos: DadosHistoricos;
  simulacao: ResultadoSimulacao;
}

interface ResponseBody {
  analise: string;           // Texto gerado pela IA
  sugestoes: Sugestao[];     // Ações recomendadas
  cenarios_alternativos: CenarioAlternativo[];
  score_confianca: number;   // 0-100
}

interface Sugestao {
  prioridade: 'alta' | 'media' | 'baixa';
  area: 'comercial' | 'retencao' | 'financeiro' | 'marketing';
  acao: string;
  impacto_estimado: string;
  investimento_estimado?: string;
}

interface CenarioAlternativo {
  nome: string;              // "Conservador", "Agressivo", "Foco em Retenção"
  descricao: string;
  ajustes: Record<string, number>;
  resultado_projetado: ResultadoSimulacao;
}
```

### Exemplo de Prompt para IA

```
Você é um consultor de negócios especializado em escolas de música.

DADOS DA UNIDADE: Campo Grande
- Alunos atuais: 480
- Ticket médio: R$ 285
- Churn: 4.2%
- Média histórica de matrículas: 18/mês
- Média histórica de leads: 65/mês

SIMULAÇÃO DO USUÁRIO:
- Meta: 535 alunos em Dez/2026
- Matrículas necessárias: 25/mês (+39% vs histórico)
- Leads necessários: 85/mês (+31% vs histórico)

ALERTAS GERADOS:
- Matrículas acima do histórico
- Leads exigem aumento de investimento

TAREFA:
1. Analise a viabilidade desta meta
2. Sugira 3 ações concretas para atingir o objetivo
3. Proponha 2 cenários alternativos (conservador e agressivo)
4. Estime investimentos necessários em marketing
5. Identifique riscos e como mitigá-los

Responda em JSON no formato especificado.
```

---

## 8. LISTA FINAL DE METAS PARA O SIMULADOR

### ✅ METAS INCLUÍDAS (v1)

| # | Meta | Editável | Calculado |
|---|------|----------|-----------|
| 1 | Alunos Pagantes (objetivo) | ✅ | - |
| 2 | Churn Rate % | ✅ | - |
| 3 | Ticket Médio | ✅ | - |
| 4 | Taxa Lead→Exp % | ✅ | - |
| 5 | Taxa Exp→Mat % | ✅ | - |
| 6 | Evasões/mês | ✅* | ✅ |
| 7 | Matrículas/mês | ✅* | ✅ |
| 8 | Experimentais/mês | ✅* | ✅ |
| 9 | Leads/mês | ✅* | ✅ |
| 10 | MRR | ✅* | ✅ |
| 11 | Inadimplência % | ✅ | - |

*Editável com recálculo inverso

### ⏳ METAS FUTURAS (v2)

| # | Meta | Motivo para v2 |
|---|------|----------------|
| 12 | Taxa Renovação | Precisa de dados históricos mais robustos |
| 13 | LTV | Derivado do churn, pode confundir |
| 14 | Média Alunos/Professor | Requer dados de professores |
| 15 | NPS | Não temos coleta sistemática ainda |

---

## 9. PERGUNTAS PARA VALIDAÇÃO

1. **Modos de cálculo**: Quer todos os 4 modos ou só "Meta de Alunos"?
2. **Edição de calculados**: Quando editar um campo calculado, qual comportamento?
   - A) Recalcula a taxa de conversão
   - B) Recalcula o objetivo final
   - C) Pergunta ao usuário
3. **IA**: Implementar Edge Function agora ou depois?
4. **Cenários**: Salvar múltiplos cenários para comparar?
5. **Alguma meta faltando** que você usa no dia a dia?

---

## 10. PRÓXIMOS PASSOS

Após sua validação:

1. **Implementar motor de cálculo** com todas as fórmulas
2. **Criar UI editável** onde qualquer campo pode ser alterado
3. **Implementar recálculo bidirecional** (editar calculado → recalcula inputs)
4. **Criar Edge Function** com IA para análise e sugestões
5. **Testar com dados reais** de cada unidade

**Aguardo sua validação das metas e fórmulas!** 🎯
