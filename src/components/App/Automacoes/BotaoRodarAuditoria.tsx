// src/components/App/Automacoes/BotaoRodarAuditoria.tsx
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

type Props = {
  onConcluido?: () => void;
};

export function BotaoRodarAuditoria({ onConcluido }: Props) {
  const [rodando, setRodando] = useState(false);

  async function rodar() {
    setRodando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('auditor-divergencias-emusys', {
        body: { trigger: 'manual', user_id: u?.user?.id ?? null },
      });
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const novos = (data as any)?.novos ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dur = ((data as any)?.duracao_ms ?? 0) / 1000;
      if (novos > 0) {
        toast.success(`Auditoria concluída em ${dur.toFixed(1)}s — ${novos} nova(s) divergência(s) detectada(s).`);
      } else {
        toast.message(`Auditoria concluída em ${dur.toFixed(1)}s — sem novas divergências.`);
      }
      onConcluido?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Erro ao rodar auditoria: ${msg}`);
    } finally {
      setTimeout(() => setRodando(false), 30_000);
    }
  }

  return (
    <button
      onClick={rodar}
      disabled={rodando}
      className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-50 text-cyan-300 border border-cyan-500/40 rounded-lg transition-colors text-sm font-medium"
    >
      <RefreshCw className={`w-4 h-4 ${rodando ? 'animate-spin' : ''}`} />
      {rodando ? 'Rodando auditoria...' : 'Rodar auditoria agora'}
    </button>
  );
}
