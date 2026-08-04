import type {
  PesquisaEvasaoCategoria,
  PesquisaEvasaoRelacaoMotivo,
} from '@/components/App/SucessoCliente/pesquisaEvasao.types';

export const MIN_RESPOSTAS_PAINEL = 5;
export const MIN_RESPOSTAS_SEM_AVISO = 30;

export type RespostaAnalytics = {
  pesquisa_id: string;
  categorias: PesquisaEvasaoCategoria[];
  relacao_motivo: PesquisaEvasaoRelacaoMotivo | null;
  classificacao_id: string | null;
  classificacao_desatualizada: boolean;
  acoes_pendentes: number;
  desfecho_atual: string | null;
};

export interface ResumoEvasaoAnalytics {
  total: number;
  classificadasVigentes: number;
  pendentesClassificacao: number;
  acoesPendentes: number;
  encerradas: number;
  categorias: Array<{ categoria: PesquisaEvasaoCategoria; total: number; percentual: number }>;
  relacoes: Array<{ relacao: PesquisaEvasaoRelacaoMotivo; total: number; percentual: number }>;
}

export function nivelDeConfianca(classificadas: number): 'insuficiente' | 'indicativo' | 'estavel' {
  if (classificadas < MIN_RESPOSTAS_PAINEL) return 'insuficiente';
  if (classificadas < MIN_RESPOSTAS_SEM_AVISO) return 'indicativo';
  return 'estavel';
}

export function resumirRespostas(respostas: RespostaAnalytics[]): ResumoEvasaoAnalytics {
  const vigentes = respostas.filter((item) => (
    item.classificacao_id !== null && !item.classificacao_desatualizada
  ));
  const porCategoria = new Map<PesquisaEvasaoCategoria, number>();
  const porRelacao = new Map<PesquisaEvasaoRelacaoMotivo, number>();
  for (const resposta of vigentes) {
    for (const categoria of new Set(resposta.categorias)) {
      porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1);
    }
    if (resposta.relacao_motivo) {
      porRelacao.set(
        resposta.relacao_motivo,
        (porRelacao.get(resposta.relacao_motivo) ?? 0) + 1,
      );
    }
  }
  const denominador = vigentes.length;
  const percentual = (total: number) => denominador === 0
    ? 0
    : Math.round((total / denominador) * 100);
  return {
    total: respostas.length,
    classificadasVigentes: denominador,
    pendentesClassificacao: respostas.length - denominador,
    acoesPendentes: respostas.filter((item) => item.acoes_pendentes > 0).length,
    encerradas: respostas.filter((item) => item.desfecho_atual !== null).length,
    categorias: [...porCategoria.entries()]
      .map(([categoria, total]) => ({ categoria, total, percentual: percentual(total) }))
      .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria)),
    relacoes: [...porRelacao.entries()]
      .map(([relacao, total]) => ({ relacao, total, percentual: percentual(total) }))
      .sort((a, b) => b.total - a.total || a.relacao.localeCompare(b.relacao)),
  };
}

export interface BlocoResposta {
  quando: string | null;
  tipo: string | null;
  texto: string;
}

export function separarBlocosResposta(bruto: string | null): BlocoResposta[] {
  const inteiro = (bruto ?? '').trim();
  if (!inteiro) return [];
  const marcador = /\[([^\]|]+)\|([^\]]+)\]\s*\n?/g;
  const blocos: BlocoResposta[] = [];
  let ultimoFim = 0;
  let cabecalho: { quando: string; tipo: string } | null = null;
  let achado: RegExpExecArray | null;
  while ((achado = marcador.exec(inteiro)) !== null) {
    const anterior = inteiro.slice(ultimoFim, achado.index).trim();
    if (anterior) {
      blocos.push({
        quando: cabecalho?.quando ?? null,
        tipo: cabecalho?.tipo ?? null,
        texto: anterior,
      });
    }
    cabecalho = { quando: achado[1].trim(), tipo: achado[2].trim() };
    ultimoFim = marcador.lastIndex;
  }
  const resto = inteiro.slice(ultimoFim).trim();
  if (resto) {
    blocos.push({ quando: cabecalho?.quando ?? null, tipo: cabecalho?.tipo ?? null, texto: resto });
  }
  return blocos;
}
