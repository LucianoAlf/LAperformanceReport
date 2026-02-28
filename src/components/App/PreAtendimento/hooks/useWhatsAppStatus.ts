import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { WhatsAppConnectionStatus } from '../types';

const INTERVALO_VERIFICACAO = 60_000; // 1 minuto

export function useWhatsAppStatus(caixaId?: number | null) {
  const [status, setStatus] = useState<WhatsAppConnectionStatus>({
    connected: false,
  });
  const [loading, setLoading] = useState(true);
  const prevCaixaId = useRef(caixaId);

  const verificarStatus = useCallback(async () => {
    try {
      const body: Record<string, any> = { action: 'status' };
      if (caixaId) {
        body.caixa_id = caixaId;
      }

      const { data, error } = await supabase.functions.invoke('whatsapp-status', {
        body,
      });

      if (error) throw error;

      setStatus({
        connected: data?.connected ?? false,
        phone: data?.phone,
        instanceName: data?.instanceName,
        caixaNome: data?.caixa || data?.caixaNome,
        error: data?.error,
      });
    } catch (err) {
      console.error('[useWhatsAppStatus] Erro:', err);
      setStatus({
        connected: false,
        error: err instanceof Error ? err.message : 'Erro ao verificar status',
      });
    } finally {
      setLoading(false);
    }
  }, [caixaId]);

  // Re-verificar imediatamente quando caixaId muda
  useEffect(() => {
    if (prevCaixaId.current !== caixaId) {
      prevCaixaId.current = caixaId;
      setLoading(true);
    }
    verificarStatus();
    const interval = setInterval(verificarStatus, INTERVALO_VERIFICACAO);
    return () => clearInterval(interval);
  }, [verificarStatus]);

  return { status, loading, refetch: verificarStatus };
}
