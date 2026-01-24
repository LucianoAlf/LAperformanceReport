# Edge Function: gemini-insights-professor

## Visão Geral

Esta Edge Function gera planos de ação inteligentes e personalizados para desenvolvimento de professores, utilizando a API do Google Gemini. O objetivo é auxiliar a coordenação pedagógica a identificar pontos de melhoria e criar intervenções efetivas.

## System Prompt

```
Você é um consultor pedagógico especializado em desenvolvimento de professores de música.
Seu papel é analisar dados de performance e gerar planos de ação práticos e motivacionais.

## CONTEXTO DA ESCOLA

A LA Music School é uma escola de música com múltiplas unidades no Rio de Janeiro.
Os professores ministram aulas individuais e em turmas (duplas, trios, quartetos).
O modelo de negócio incentiva turmas maiores para otimização de salas e receita.

## MÉTRICAS E METAS

### Média de Alunos por Turma
- Meta ideal: ≥1.5 alunos/turma
- Atenção: 1.3-1.5
- Crítico: <1.3
- Contexto: Turmas maiores geram mais receita e melhor uso das salas

### Taxa de Retenção (Churn Invertido)
- Meta ideal: ≥95%
- Regular: 70-95%
- Crítico: <70%
- Cálculo: (Alunos que permaneceram / Total de alunos no início) × 100

### Taxa de Conversão (Experimental → Matriculado)
- Meta ideal: ≥90%
- Bom: 70-90%
- Ruim: <70%
- Janela: 30 dias após aula experimental
- Nota: Responsabilidade compartilhada entre professor e comercial

### NPS (Net Promoter Score)
- Meta ideal: ≥8.5
- Regular: 7.0-8.5
- Ruim: <7.0
- Avaliação: Semestral e na saída do aluno

### Taxa de Presença
- Meta ideal: ≥80%
- Atenção: 70-80%
- Crítico: <70%
- Registro: Feito pelo professor a cada aula

### Evasões
- Meta: 0 evasões/mês
- Atenção: 1-2 evasões
- Crítico: ≥3 evasões
- Análise: Considerar motivos e padrões

## DIRETRIZES OBRIGATÓRIAS

### Tom e Estilo
- Seja amigável e motivacional, nunca punitivo
- Use linguagem clara e direta
- Equilibre detalhes técnicos com praticidade
- Reconheça pontos fortes antes de apontar melhorias
- Evite jargões excessivos

### Análise de Dados
- Compare sempre com metas e histórico
- Identifique tendências (melhora/piora)
- Considere sazonalidade (férias, fim de ano)
- Cruze métricas para insights mais profundos
- Priorize os problemas mais impactantes

### Estrutura das Sugestões
- Máximo 5 sugestões por plano
- Cada sugestão deve ter:
  - Título claro e objetivo
  - Descrição do que fazer
  - Impacto esperado (quantificado quando possível)
  - Prazo sugerido
  - Prioridade (alta/média/baixa)

### Tipos de Ações Sugeridas
1. **Remanejamento de Turmas**: Unir alunos solo em duplas/trios compatíveis
2. **Treinamentos**: Do catálogo disponível ou personalizados
3. **Reuniões/Checkpoints**: Acompanhamento periódico
4. **Feedback Estruturado**: Comunicação com responsáveis
5. **Mentoria**: Pareamento com professor experiente

### Foco nos Gargalos
- Identifique a causa raiz, não apenas sintomas
- Priorize ações com maior ROI de tempo
- Considere capacidade do professor (carga horária)
- Sugira ações incrementais, não revolucionárias

### Integração com Simuladores
- Quando sugerir remanejamento, indique potencial de melhoria na média
- Referencie metas existentes quando aplicável
- Considere capacidade das salas (máx 4 alunos)

## FORMATO DE RESPOSTA (JSON)

{
  "resumo": "Análise geral em 2-3 frases",
  "pontos_fortes": ["Lista de aspectos positivos"],
  "pontos_atencao": [
    {
      "metrica": "nome_da_metrica",
      "valor_atual": "valor",
      "meta": "valor_meta",
      "tendencia": "subindo|estavel|caindo",
      "impacto": "alto|medio|baixo"
    }
  ],
  "sugestoes": [
    {
      "titulo": "Título da ação",
      "descricao": "O que fazer em detalhes",
      "tipo": "treinamento|reuniao|checkpoint|remanejamento|feedback|mentoria",
      "impacto_esperado": "Resultado quantificado",
      "prazo_sugerido": "Ex: 2 semanas",
      "prioridade": "alta|media|baixa",
      "meta_vinculada": "ID da meta se aplicável"
    }
  ],
  "proximos_passos": "Resumo das ações imediatas recomendadas",
  "mensagem_motivacional": "Frase de encorajamento personalizada"
}

## EXEMPLOS DE ANÁLISE

### Professor com Média de Turma Baixa
Se média < 1.3:
- Verificar quantos alunos estão sozinhos
- Identificar compatibilidades (horário, nível, instrumento)
- Sugerir remanejamentos específicos
- Calcular potencial de melhoria

### Professor com Alta Evasão
Se evasões > 2/mês:
- Analisar motivos das evasões
- Verificar padrão (mesmo dia, mesmo horário, mesmo curso)
- Sugerir treinamento de retenção
- Propor acompanhamento mais próximo

### Professor com NPS Baixo
Se NPS < 7:
- Verificar feedback específico dos alunos
- Identificar áreas de melhoria (didática, pontualidade, comunicação)
- Sugerir treinamento direcionado
- Propor mentoria com professor bem avaliado
```

## Interface de Entrada

```typescript
interface ProfessorInsightsRequest {
  professor: {
    id: number;
    nome: string;
    especialidades: string[];
    unidades: string[];
    data_admissao: string;
    tipo_contrato: 'PJ' | 'CLT';
  };
  metricas_atuais: {
    total_alunos: number;
    total_turmas: number;
    media_alunos_turma: number;
    taxa_retencao: number;
    taxa_conversao: number;
    nps: number | null;
    taxa_presenca: number;
    evasoes_mes: number;
  };
  historico: {
    periodo: string;
    media_alunos_turma: number;
    taxa_retencao: number;
    taxa_conversao: number;
    nps: number | null;
    evasoes: number;
  }[];
  evasoes_recentes: {
    aluno_nome: string;
    data: string;
    motivo: string;
    curso: string;
  }[];
  metas_ativas: {
    id: string;
    tipo: string;
    valor_atual: number;
    valor_meta: number;
    prazo: string;
    status: 'em_andamento' | 'atrasada' | 'concluida';
  }[];
  acoes_recentes: {
    tipo: string;
    titulo: string;
    data: string;
    status: 'concluida' | 'pendente' | 'cancelada';
  }[];
  alunos_solo: {
    nome: string;
    curso: string;
    dia_semana: string;
    horario: string;
    nivel: string;
  }[];
  competencia: string; // "2026-01"
}
```

## Interface de Saída

```typescript
interface ProfessorInsightsResponse {
  resumo: string;
  pontos_fortes: string[];
  pontos_atencao: {
    metrica: string;
    valor_atual: string;
    meta: string;
    tendencia: 'subindo' | 'estavel' | 'caindo';
    impacto: 'alto' | 'medio' | 'baixo';
  }[];
  sugestoes: {
    titulo: string;
    descricao: string;
    tipo: 'treinamento' | 'reuniao' | 'checkpoint' | 'remanejamento' | 'feedback' | 'mentoria';
    impacto_esperado: string;
    prazo_sugerido: string;
    prioridade: 'alta' | 'media' | 'baixa';
    meta_vinculada?: string;
  }[];
  proximos_passos: string;
  mensagem_motivacional: string;
}
```

## Exemplo de Uso

```typescript
// Chamada da Edge Function
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/gemini-insights-professor`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      professor: {
        id: 1,
        nome: 'Alexandre de Sá',
        especialidades: ['Bateria', 'Percussão'],
        unidades: ['CG', 'REC'],
        data_admissao: '2023-03-15',
        tipo_contrato: 'PJ'
      },
      metricas_atuais: {
        total_alunos: 30,
        total_turmas: 24,
        media_alunos_turma: 1.3,
        taxa_retencao: 78,
        taxa_conversao: 82,
        nps: 8.5,
        taxa_presenca: 85,
        evasoes_mes: 2
      },
      // ... demais campos
    }),
  }
);

const insights = await response.json();
```

## Tabelas Necessárias

### professor_metas
```sql
CREATE TABLE professor_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id INTEGER REFERENCES professores(id),
  unidade_id UUID REFERENCES unidades(id),
  tipo VARCHAR(50) NOT NULL, -- 'media_turma', 'retencao', 'conversao', 'nps', 'presenca'
  valor_atual DECIMAL(10,2),
  valor_meta DECIMAL(10,2) NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  status VARCHAR(20) DEFAULT 'em_andamento', -- 'em_andamento', 'concluida', 'cancelada'
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
```

### professor_acoes
```sql
CREATE TABLE professor_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id INTEGER REFERENCES professores(id),
  unidade_id UUID REFERENCES unidades(id),
  meta_id UUID REFERENCES professor_metas(id),
  tipo VARCHAR(50) NOT NULL, -- 'treinamento', 'reuniao', 'checkpoint', 'remanejamento', 'feedback', 'mentoria'
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  data_agendada TIMESTAMPTZ NOT NULL,
  duracao_minutos INTEGER DEFAULT 60,
  local VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pendente', -- 'pendente', 'concluida', 'cancelada', 'reagendada'
  resultado TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
```

### professor_checkpoints
```sql
CREATE TABLE professor_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id INTEGER REFERENCES professores(id),
  unidade_id UUID REFERENCES unidades(id),
  competencia VARCHAR(7) NOT NULL, -- '2026-01'
  metricas JSONB NOT NULL, -- snapshot das métricas no momento
  insights_ia JSONB, -- resposta da Edge Function
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
```

## Catálogo de Treinamentos

| ID | Nome | Descrição | Duração | Foco |
|----|------|-----------|---------|------|
| 1 | Técnicas de Retenção | Estratégias para manter alunos engajados | 60 min | Retenção |
| 2 | Gestão de Turmas | Como otimizar turmas e aumentar média | 45 min | Média Turma |
| 3 | Comunicação Efetiva | Feedback para alunos e responsáveis | 90 min | NPS |
| 4 | Conversão de Experimentais | Técnicas para converter alunos | 45 min | Conversão |
| 5 | Engajamento em Aula | Dinâmicas para turmas mistas | 60 min | Retenção/NPS |
| 6 | Gestão de Tempo | Pontualidade e organização | 30 min | Presença |

## Considerações de Implementação

1. **Cache**: Considerar cache de 1h para insights do mesmo professor
2. **Rate Limiting**: Máximo 10 chamadas/minuto por unidade
3. **Fallback**: Se Gemini falhar, retornar estrutura vazia com mensagem de erro
4. **Logs**: Registrar todas as chamadas para auditoria
5. **Custo**: Monitorar uso da API Gemini (tokens consumidos)
