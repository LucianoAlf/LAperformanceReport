/**
 * Qual shell renderizar. Decisao pura, separada do hook, para ser testavel
 * sem DOM — e para o corte existir em UM lugar so.
 */

/** iPad retrato (768) entra no shell mobile; paisagem (1024) fica no desktop. */
export const LARGURA_MAXIMA_MOBILE = 1023;

export const MEDIA_QUERY_MOBILE = `(max-width: ${LARGURA_MAXIMA_MOBILE}px)`;

export function ehLarguraMobile(largura: number): boolean {
  return largura <= LARGURA_MAXIMA_MOBILE;
}

export interface EntradaShell {
  larguraMobile: boolean;
  /** kill switch de operacao (VITE_MOBILE_SHELL=off): desliga para todo mundo */
  flagDesligada?: boolean;
  /** localStorage 'shell-override': 'mobile' | 'desktop', para testar no aparelho */
  override?: string | null;
}

export function resolverShell({ larguraMobile, flagDesligada, override }: EntradaShell): 'mobile' | 'desktop' {
  // O kill switch vem primeiro de proposito: e o rollback sem redeploy de
  // codigo, e nao pode ser contornado por override de ninguem.
  if (flagDesligada) return 'desktop';
  if (override === 'mobile') return 'mobile';
  if (override === 'desktop') return 'desktop';
  return larguraMobile ? 'mobile' : 'desktop';
}
