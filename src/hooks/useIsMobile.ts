import { useEffect, useState } from 'react';

import { MEDIA_QUERY_MOBILE } from '@/lib/shellMobile';

/**
 * Acompanha o viewport com listener — nao le so na montagem.
 *
 * Ler uma vez e o bug classico: quem gira o aparelho, redimensiona a janela
 * ou abre a aba ja estreita fica com o shell errado ate dar refresh.
 */
export function useIsMobile(): boolean {
  const [ehMobile, setEhMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(MEDIA_QUERY_MOBILE).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MEDIA_QUERY_MOBILE);
    const aoMudar = (e: MediaQueryListEvent) => setEhMobile(e.matches);
    setEhMobile(mql.matches);
    mql.addEventListener('change', aoMudar);
    return () => mql.removeEventListener('change', aoMudar);
  }, []);

  return ehMobile;
}
