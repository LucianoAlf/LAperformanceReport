import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { WhatsAppConnectionStatus } from '../types';

const INTERVALO_VERIFICACAO = 60_000; // 1 minuto

export function useWhatsAppStatus() {
  const [status, setStatus] = useState<WhatsAppConnectionStatus>({
    connected: false,
  });
  const [loading, setLoading] = useState(true);

  const verificarStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-status', {
        body: { action: 'status' },
      });

      if (error) throw error;

      setStatus({
        connected: data?.connected ?? false,
        phone: data?.phone,
        instanceName: data?.instanceName,
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
  }, []);

  // Verificar na montagem e a cada intervalo
  useEffect(() => {
    verificarStatus();
    const interval = setInterval(verificarStatus, INTERVALO_VERIFICACAO);
    return () => clearInterval(interval);
  }, [verificarStatus]);

  return { status, loading, refetch: verificarStatus };
}
