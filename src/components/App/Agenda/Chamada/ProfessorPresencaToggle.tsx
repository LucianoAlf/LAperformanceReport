import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  professorId: number;
  professorNome: string;
  data: string;
  unidadeId: string;
  totalAulas: number;
  presente: boolean | null; // null = nao marcado, true = presente, false = ausente
  onMudou: () => void;
}

/**
 * Toggle de presenca do professor para o dia inteiro. Liga/desliga marca
 * todas as aulas do professor como presente/ausente de uma vez.
 */
export function ProfessorPresencaToggle({
  professorId,
  professorNome,
  data,
  unidadeId,
  totalAulas,
  presente,
  onMudou,
}: Props) {
  const [salvando, setSalvando] = useState(false);

  async function toggle() {
    if (salvando) return;
    setSalvando(true);
    try {
      if (presente === true) {
        // Estava presente, vai desligar
        const { error } = await supabase.rpc('app_remover_presenca_professor_dia', {
          p_professor_id: professorId,
          p_data: data,
          p_unidade_id: unidadeId,
        });
        if (error) throw error;
        toast.success(`${professorNome} marcado como ausente`);
      } else {
        // Estava ausente ou nao marcado, vai ligar
        const { error } = await supabase.rpc('app_registrar_presenca_professor_dia', {
          p_professor_id: professorId,
          p_data: data,
          p_unidade_id: unidadeId,
        });
        if (error) throw error;
        toast.success(`${professorNome} marcado como presente`);
      }
      onMudou();
    } catch (e) {
      toast.error('Nao foi possivel alterar', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={salvando}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all',
        presente === true
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
          : presente === false
            ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
            : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300',
        salvando && 'opacity-50',
      )}
    >
      {salvando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : presente === true ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : presente === false ? (
        <XCircle className="h-3.5 w-3.5" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" />
      )}
      {presente === true ? 'Presente' : presente === false ? 'Ausente' : 'Marcar presença'}
      <span className="text-[10px] opacity-60">({totalAulas} aulas)</span>
    </button>
  );
}
