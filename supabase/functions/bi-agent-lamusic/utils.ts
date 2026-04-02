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

export function buildVisualizationConfig(vizType: string, data: any[]): any {
  if (!data || data.length === 0 || vizType === 'none') return null;
  const keys = Object.keys(data[0] || {});
  const xAxis = keys[0];
  const yAxis = keys.find(k => typeof data[0][k] === 'number') || keys[1];

  return {
    type: vizType,
    xAxis,
    yAxis,
    title: '',
    format: yAxis?.includes('taxa') || yAxis?.includes('rate') ? 'percent'
      : yAxis?.includes('valor') || yAxis?.includes('ticket') || yAxis?.includes('faturamento') ? 'currency'
      : 'number',
  };
}
