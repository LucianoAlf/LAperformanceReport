// Utilidades: cache, template matching, hash

export async function hashSQL(sql: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(sql);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export interface TemplateMatch {
  sql: string;
  visualization: string;
  templateId: string;
  templateName: string;
}

export function matchTemplate(
  question: string,
  templates: { id: string; name: string; question_pattern: string; sql_template: string; default_visualization: string }[]
): TemplateMatch | null {
  const normalized = normalizeQuestion(question);
  for (const t of templates) {
    try {
      const regex = new RegExp(t.question_pattern, 'i');
      if (regex.test(normalized)) {
        return {
          sql: t.sql_template,
          visualization: t.default_visualization,
          templateId: t.id,
          templateName: t.name,
        };
      }
    } catch { /* regex inválida, pular */ }
  }
  return null;
}

/**
 * Auto-detecta o tipo de visualização baseado na forma dos dados.
 * Se vizHint for fornecido (ex: do LLM), usa como preferência.
 */
export function autoDetectVisualizationType(data: any[], vizHint?: string): string {
  if (vizHint && vizHint !== 'none' && vizHint !== 'table') return vizHint;
  if (!data || data.length === 0) return 'none';

  const keys = Object.keys(data[0] || {});
  const numericKeys = keys.filter(k => typeof data[0][k] === 'number');

  // KPI: 1 row, 1-2 keys (ex: { total: 42 })
  if (data.length === 1 && keys.length <= 2 && numericKeys.length >= 1) return 'kpi';

  // Tabela: muitas colunas (5+) ou sem colunas numéricas (lista de nomes)
  if (numericKeys.length === 0) return 'table';
  if (keys.length >= 6) return 'table';

  // Temporal: xAxis parece ser mês/data → line
  const xKey = keys[0];
  const xSample = String(data[0][xKey] || '').toLowerCase();
  const isTemporalKey = /^(mes|mês|month|data|date|periodo|ano_mes|ano)$/i.test(xKey);
  const isTemporalValue = /^\d{4}[-/]\d{2}|^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i.test(xSample)
    || /\d{2}\/\d{2,4}/.test(xSample);
  if ((isTemporalKey || isTemporalValue) && data.length >= 2) return 'line';

  // Pie: poucos itens (2-6), 1 valor numérico
  if (data.length >= 2 && data.length <= 6 && numericKeys.length === 1) return 'pie';

  // Bar: categorias com valores
  if (data.length >= 2 && data.length <= 30 && numericKeys.length >= 1) return 'bar';

  // Muitos registros → table
  if (data.length > 30) return 'table';

  return 'bar';
}

/** Remove colunas técnicas (unidade_id, etc.) dos dados — não devem aparecer em gráficos */
export function stripTechnicalColumns(data: any[]): any[] {
  const techCols = ['unidade_id', 'professor_id', 'curso_id', 'aluno_id', 'tipo_matricula_id'];
  if (!data || data.length === 0) return data;
  const keys = Object.keys(data[0]);
  const hasTech = keys.some(k => techCols.includes(k));
  if (!hasTech) return data;
  return data.map(row => {
    const clean: any = {};
    for (const [k, v] of Object.entries(row)) {
      if (!techCols.includes(k)) clean[k] = v;
    }
    return clean;
  });
}

export function buildVisualizationConfig(vizType: string, data: any[]): any {
  if (!data || data.length === 0 || vizType === 'none') return null;
  const keys = Object.keys(data[0] || {});
  // xAxis = primeira key de texto (label), yAxis = primeira key numérica (valor)
  const xAxis = keys.find(k => typeof data[0][k] !== 'number') || keys[0];
  const yAxis = keys.find(k => typeof data[0][k] === 'number') || keys[1];

  return {
    type: vizType,
    xAxis,
    yAxis,
    title: '',
    format: yAxis?.includes('taxa') || yAxis?.includes('rate') || yAxis?.includes('churn') ? 'percent'
      : yAxis?.includes('valor') || yAxis?.includes('ticket') || yAxis?.includes('faturamento') || yAxis?.includes('receita') ? 'currency'
      : 'number',
  };
}
