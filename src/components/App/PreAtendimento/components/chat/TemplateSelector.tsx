import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { TemplateWhatsApp } from '../../types';

interface TemplateSelectorProps {
  onSelecionar: (conteudo: string) => void;
  onFechar: () => void;
}

const CORES_TEMPLATE: Record<string, string> = {
  confirmacao: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
  lembrete: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
  reagendamento: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
  pos_experimental: 'bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20',
  follow_up_frio: 'bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20',
  boas_vindas: 'bg-pink-500/10 text-pink-400 border-pink-500/20 hover:bg-pink-500/20',
  sem_resposta: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20',
};

const EMOJIS_TEMPLATE: Record<string, string> = {
  confirmacao: '✅',
  lembrete: '⏰',
  reagendamento: '📅',
  pos_experimental: '🎵',
  follow_up_frio: '❄️',
  boas_vindas: '👋',
  sem_resposta: '📵',
};

export function TemplateSelector({ onSelecionar, onFechar }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateWhatsApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const { data } = await supabase
          .from('crm_templates_whatsapp')
          .select('*')
          .eq('ativo', true)
          .order('nome');
        setTemplates((data || []) as TemplateWhatsApp[]);
      } catch (err) {
        console.error('[TemplateSelector] Erro:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  return (
    <div className="px-4 py-2 border-t border-slate-700/50 bg-slate-800/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-slate-400 font-medium">Templates rápidos:</span>
        <button onClick={onFechar} className="text-[11px] text-slate-500 hover:text-slate-300 ml-auto">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {templates.map(t => {
            const cor = CORES_TEMPLATE[t.slug] || 'bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/20';
            const emoji = EMOJIS_TEMPLATE[t.slug] || '📝';
            return (
              <button
                key={t.id}
                onClick={() => onSelecionar(t.conteudo)}
                className={`px-3 py-1.5 text-[11px] border rounded-lg transition font-medium ${cor}`}
              >
                {emoji} {t.nome}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
