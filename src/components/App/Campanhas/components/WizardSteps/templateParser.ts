import type { TemplateMeta } from '../../hooks/useTemplatesMeta'

export function extrairVariaveis(template: TemplateMeta): string[] {
  const bodyText = template.body_text ?? ''
  const matches = bodyText.match(/\{\{(\d+)\}\}/g)
  if (!matches) return []
  const unique = [...new Set(matches)].sort()
  return unique.map(m => m.replace(/[{}]/g, ''))
}

export function renderizarTemplate(bodyText: string, variaveis: Record<string, string>): string {
  let result = bodyText
  for (const [key, value] of Object.entries(variaveis)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`)
  }
  return result
}
