import type { CaixaAmbiente } from '@/types/caixa';

export type CaixaCategoriaAmbiente = CaixaAmbiente | 'ambos';

export interface CaixaCategoria {
  id?: string;
  slug: string;
  nome: string;
  ambiente: CaixaCategoriaAmbiente;
  ativo: boolean;
  ordem: number;
  criado_por?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const CATEGORIAS_CAIXA_PADRAO: CaixaCategoria[] = [
  { slug: 'lojinha', nome: 'Lojinha', ambiente: 'ambos', ativo: true, ordem: 10 },
  { slug: 'passaporte', nome: 'Passaporte', ambiente: 'ambos', ativo: true, ordem: 20 },
  { slug: 'seguranca', nome: 'Seguranca', ambiente: 'cofre', ativo: true, ordem: 30 },
  { slug: 'troco', nome: 'Troco', ambiente: 'cofre', ativo: true, ordem: 40 },
  { slug: 'retirada', nome: 'Retirada', ambiente: 'cofre', ativo: true, ordem: 50 },
  { slug: 'despesa', nome: 'Despesa', ambiente: 'ambos', ativo: true, ordem: 60 },
  { slug: 'outro', nome: 'Outro', ambiente: 'ambos', ativo: true, ordem: 999 },
];

export function normalizarSlugCategoriaCaixa(valor: string): string {
  const slug = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

  return slug || 'categoria';
}

export function prepararNovaCategoriaCaixa(
  nome: string,
  ambiente: CaixaCategoriaAmbiente = 'ambos',
  criadoPor?: string | null,
): CaixaCategoria {
  const nomeLimpo = nome.trim().replace(/\s+/g, ' ');

  return {
    slug: normalizarSlugCategoriaCaixa(nomeLimpo),
    nome: nomeLimpo,
    ambiente,
    ativo: true,
    ordem: 1000,
    criado_por: criadoPor || null,
  };
}

export function filtrarCategoriasCaixaPorAmbiente(
  categorias: CaixaCategoria[],
  ambiente: CaixaAmbiente,
): CaixaCategoria[] {
  return categorias
    .filter((categoria) => categoria.ativo)
    .filter((categoria) => categoria.ambiente === 'ambos' || categoria.ambiente === ambiente)
    .sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
}

export function obterNomeCategoriaCaixa(slug: string, categorias: CaixaCategoria[]): string {
  return categorias.find((categoria) => categoria.slug === slug)?.nome || slug;
}
