import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  professorId: number;
  professorNome: string;
  fotoUrl: string | null;
  data: string;
  unidadeId: string;
  totalAulas: number;
  primeiraAula: string; // "08:00"
  ultimaAula: string; // "19:00"
  presente: boolean | null; // null = nao marcado, true = presente, false = ausente
  onMudou: () => void;
}

/**
 * Card de presenca do professor para o dia inteiro. Proeminente: foto, nome,
 * grade (primeira-ultima aula) e toggle grande. Fica abaixo do progresso do dia.
 */
export function ProfessorPresencaToggle({
  professorId,
  professorNome,
  fotoUrl,
  data,
  unidadeId,
  totalAulas,
  primeiraAula,
  ultimaAula,
  presente,
  onMudou,
}: Props) {
  const [salvando, setSalvando] = useState(false);

  async function toggle() {
    if (salvando) return;
    setSalvando(true);
    try {
      if (presente === true) {
        const { error } = await supabase.rpc('app_remover_presenca_professor_dia', {
          p_professor_id: professorId,
          p_data: data,
          p_unidade_id: unidadeId,
        });
        if (error) throw error;
        toast.success(`${professorNome} marcado como ausente`);
      } else {
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

  const inicial = professorNome
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={salvando}
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
        presente === true
          ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'
          : presente === false
            ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15'
            : 'border-slate-700 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60',
        salvando && 'opacity-50',
      )}
    >
      {/* Foto */}
      {fotoUrl ? (
        <img
          src={fotoUrl}
          alt={professorNome}
          className="h-10 w-10 shrink-0 rounded-full border-2 border-slate-600 object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-700 text-xs font-bold text-slate-300">
          {inicial}
        </div>
      )}

      {/* Nome + grade */}
      <div className="min-w-0 flex-1">
        <p className={cn(
          'truncate text-sm font-semibold',
          presente === true ? 'text-emerald-200' : presente === false ? 'text-rose-200' : 'text-slate-200',
        )}>
          {professorNome}
        </p>
        <p className="text-[11px] text-slate-400">
          {primeiraAula} — {ultimaAula} · {totalAulas} {totalAulas === 1 ? 'aula' : 'aulas'}
        </p>
      </div>

      {/* Status */}
      <div className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold',
        presente === true
          ? 'bg-emerald-500/20 text-emerald-300'
          : presente === false
            ? 'bg-rose-500/20 text-rose-300'
            : 'bg-slate-700/50 text-slate-400',
      )}>
        {salvando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : presente === true ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : presente === false ? (
          <XCircle className="h-4 w-4" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {presente === true ? 'Presente' : presente === false ? 'Ausente' : 'Marcar'}
      </div>
    </button>
  );
}
