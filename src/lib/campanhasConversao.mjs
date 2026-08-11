/**
 * Lógica pura de atribuição de leads a campanhas de WhatsApp e cálculo de
 * conversão/custo. Sem dependência de React/Supabase — só transforma dados
 * já buscados. Ver docs/superpowers/specs/2026-08-11-conversao-campanhas-whatsapp-design.md
 */

export function extrairCampanhaLabel(agentes) {
  for (const agente of agentes ?? []) {
    const tools = Array.isArray(agente?.tools) ? agente.tools : [];
    const transferTool = tools.find((t) => t?.name === 'transfer');
    const label = transferTool?.config?.campanha_label;
    if (label) return label;
  }
  return null;
}

function primeiroLead(linha) {
  const leads = linha?.leads;
  if (Array.isArray(leads)) return leads[0] ?? null;
  return leads ?? null;
}

export function filtrarLeadsCampanhaPorUnidade(linhas, unidadeId) {
  return (linhas ?? []).filter((linha) => {
    const lead = primeiroLead(linha);
    return lead != null && lead.unidade_id === unidadeId;
  });
}

export function calcularTaxaConversao(leadsGerados, matriculados) {
  if (!leadsGerados) return 0;
  return matriculados / leadsGerados;
}

export function calcularCustoPorMatricula(custoReal, matriculados) {
  if (!matriculados) return null;
  return custoReal / matriculados;
}
