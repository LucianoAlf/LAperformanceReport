import { useCallback, useRef, useState } from 'react';
import type { FallbackCompetencia } from '@/lib/fallbackCompetenciaRelatorio';

export function useConfirmacaoCompetencia() {
  const [confirmacaoPendente, setConfirmacaoPendente] = useState<FallbackCompetencia | null>(null);
  const resolverRef = useRef<((aceitou: boolean) => void) | null>(null);

  const pedirConfirmacao = useCallback((fallback: FallbackCompetencia): Promise<boolean> => {
    setConfirmacaoPendente(fallback);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const responder = useCallback((aceitou: boolean) => {
    setConfirmacaoPendente(null);
    resolverRef.current?.(aceitou);
    resolverRef.current = null;
  }, []);

  const confirmar = useCallback(() => responder(true), [responder]);
  const cancelar = useCallback(() => responder(false), [responder]);

  return { pedirConfirmacao, confirmacaoPendente, confirmar, cancelar };
}
