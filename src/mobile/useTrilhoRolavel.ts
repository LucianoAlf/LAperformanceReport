import { useCallback, useEffect, useRef, useState } from 'react';
import {
  alvoDeRolagem,
  bordasDoTrilho,
  mascaraDoTrilho,
  type BordasDoTrilho,
} from '@/lib/trilhoRolavel';

/**
 * Liga um trilho de rolagem lateral às regras puras de `@/lib/trilhoRolavel`.
 *
 * Faz duas coisas, e só essas: mantém o esmaecimento das pontas dizendo a
 * verdade sobre o que está escondido, e traz à vista o item aceso.
 *
 * ⚠️ A rolagem é escrita em `scrollLeft`, NUNCA por `scrollIntoView`. O
 * `scrollIntoView` mexe nos dois eixos (`block: 'nearest'` ainda rola o
 * ancestral vertical quando o item está parcialmente fora), e o ancestral
 * vertical aqui é o `<main>` do shell — escolher um filtro daria um salto na
 * lista inteira.
 */
export function useTrilhoRolavel<T extends HTMLElement = HTMLDivElement>() {
  const refTrilho = useRef<T | null>(null);
  const refAtivo = useRef<HTMLElement | null>(null);
  const [bordas, setBordas] = useState<BordasDoTrilho>({ temAntes: false, temDepois: false });

  const medir = useCallback(() => {
    const el = refTrilho.current;
    if (!el) return;
    const novas = bordasDoTrilho(el);
    setBordas((antigas) =>
      antigas.temAntes === novas.temAntes && antigas.temDepois === novas.temDepois
        ? antigas
        : novas,
    );
  }, []);

  useEffect(() => {
    const el = refTrilho.current;
    if (!el) return;
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    // ⚠️ O trilho nasce antes dos dados: as quantidades chegam de hook
    // assíncrono e mudam a largura dos chips. Sem observar o tamanho, o
    // esmaecimento ficaria com a medida do trilho vazio.
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => {
      el.removeEventListener('scroll', medir);
      observador.disconnect();
    };
  }, [medir]);

  /** Traz o item aceso à vista. Chamar num efeito que dependa de qual é ele. */
  const trazerAtivoAVista = useCallback(() => {
    const trilho = refTrilho.current;
    const item = refAtivo.current;
    if (!trilho || !item) return;
    const destino = alvoDeRolagem(trilho, item);
    if (destino === trilho.scrollLeft) return;
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    trilho.scrollTo({ left: destino, behavior: suave ? 'smooth' : 'auto' });
  }, []);

  const mascara = mascaraDoTrilho(bordas);

  return {
    refTrilho,
    refAtivo,
    bordas,
    trazerAtivoAVista,
    /** Pronto para o `style` do trilho — o prefixo do Safari é obrigatório. */
    estiloDaMascara: mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined,
  };
}
