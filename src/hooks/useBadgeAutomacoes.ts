// src/hooks/useBadgeAutomacoes.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Conta invariantes críticas com visto_em IS NULL.
 * Usado pelo badge vermelho do menu lateral "Saúde das Automações".
 *
 * Poll de 60s. Sem WebSocket (volume baixo, complexidade extra desnecessária).
 */
export function useBadgeAutomacoes() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancel = false;

    async function buscar() {
      const { count: total, error } = await supabase
        .from('automacao_invariantes')
        .select('id', { count: 'exact', head: true })
        .is('visto_em', null)
        .eq('severidade', 'critico');
      if (!cancel) {
        if (error) {
          console.error('[useBadgeAutomacoes]', error);
          setCount(0);
        } else {
          setCount(total ?? 0);
        }
        setLoading(false);
      }
    }

    buscar();
    const interval = setInterval(buscar, 60_000);

    return () => {
      cancel = true;
      clearInterval(interval);
    };
  }, []);

  return { count, loading };
}
