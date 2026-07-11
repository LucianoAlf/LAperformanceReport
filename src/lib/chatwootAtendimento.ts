// Tipos e formatação da performance de atendimento por agente (Chatwoot).
// Consumido pela sub-aba "Atendimento" em Analytics → Comercial.

export interface AgentePerformanceChatwoot {
  id: number;
  nome: string;
  conversas: number;
  resolvidas: number;
  avgFirstResponseTime: number | null;
  avgReplyTime: number | null;
  avgResolutionTime: number | null;
}

export interface ChatwootAtendimentoResposta {
  ok: boolean;
  since: number;
  until: number;
  agentes: AgentePerformanceChatwoot[];
  error?: string;
}

// Converte segundos numa string curta e legível (ex: "2d 4h", "18h 21min", "45min", "12s").
// null/indefinido → "N/A" (agente sem amostra para aquela métrica).
export function formatarDuracaoSegundos(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return 'N/A';
  const total = Math.round(segundos);
  if (total <= 0) return '0s';

  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segs = total % 60;

  if (dias > 0) return horas > 0 ? `${dias}d ${horas}h` : `${dias}d`;
  if (horas > 0) return minutos > 0 ? `${horas}h ${minutos}min` : `${horas}h`;
  if (minutos > 0) return `${minutos}min`;
  return `${segs}s`;
}

// Média simples (ignora null) de uma métrica de tempo ao longo dos agentes.
export function mediaMetrica(
  agentes: AgentePerformanceChatwoot[],
  campo: 'avgFirstResponseTime' | 'avgReplyTime' | 'avgResolutionTime',
): number | null {
  const validos = agentes.map((a) => a[campo]).filter((v): v is number => v !== null && Number.isFinite(v));
  if (validos.length === 0) return null;
  return validos.reduce((soma, v) => soma + v, 0) / validos.length;
}
