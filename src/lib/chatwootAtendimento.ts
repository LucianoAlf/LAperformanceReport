// Tipos e formatação da performance de atendimento (Chatwoot).
// Consumido pela sub-aba "Atendimento" em Analytics → Comercial.
//
// A edge conta as conversas CRIADAS no período e agrega por agente/caixa/unidade, com a 1ª
// resposta medida por MEDIANA do evento `first_response` do Chatwoot (handoff bot→humano até o
// 1º retorno — não conta a janela do bot SDR). Ver edge chatwoot-atendimento-insights.

export interface EntidadeAtendimento {
  id: number | string;
  nome: string;
  conversas: number;
  resolvidas: number;
  primeiraRespostaMedianaSeg: number | null; // mediana do first_response: handoff → 1ª resposta humana (seg)
  amostraPrimeiraResposta: number;            // nº de conversas com 1ª resposta (base da mediana)
}

export interface CaixaAtendimento extends EntidadeAtendimento {
  id: number;
  unidade: string | null; // 'CG' | 'Recreio' | 'Barra' | null (global)
}

export interface AgenteAtendimento extends EntidadeAtendimento {
  id: number;
}

export interface UnidadeAtendimento extends EntidadeAtendimento {
  id: string;
}

export interface ResumoAtendimento {
  conversas: number;
  resolvidas: number;
  primeiraRespostaMedianaSeg: number | null;
  amostraPrimeiraResposta: number;
}

export interface ChatwootAtendimentoResposta {
  ok: boolean;
  since: number;
  until: number;
  geral: ResumoAtendimento;
  agentes: AgenteAtendimento[];
  caixas: CaixaAtendimento[];
  unidades: UnidadeAtendimento[];
  error?: string;
}

// Converte segundos numa string curta e legível (ex: "2d 4h", "18h 21min", "45min", "12s").
// null/indefinido → "N/A" (entidade sem amostra para a métrica).
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
