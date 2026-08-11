import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AulaAgenda } from '@/hooks/useAgendaDia';

interface Props {
  professorId: number;
  professorNome: string;
  fotoUrl: string | null;
  data: string;
  unidadeId: string;
  aulas: AulaAgenda[];
  primeiraAula: string;
  ultimaAula: string;
  presente: boolean | null;
  onMudou: () => void;
}

/**
 * Card expansivel de presenca do professor. Clica no card para abrir as aulas
 * individuais e ajustar fino (saiu mais cedo, chegou mais tarde, etc).
 * O botao de status faz o toggle do dia inteiro.
 */
export function ProfessorPresencaToggle({
  professorId,
  professorNome,
  fotoUrl,
  data,
  unidadeId,
  aulas,
  primeiraAula,
  ultimaAula,
  presente,
  onMudou,
}: Props) {
  const [salvando, setSalvando] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [salvandoAula, setSalvandoAula] = useState<number | null>(null);

  const totalAulas = aulas.length;

  async function toggleDia() {
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
      const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as Record<string, unknown>).message) : String(e);
      toast.error('Nao foi possivel alterar', { description: msg });
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAula(aula: AulaAgenda) {
    if (salvandoAula) return;
    const aulaId = aula.aula_ids[0];
    if (!aulaId) return;
    setSalvandoAula(aulaId);
    try {
      const novaPresenca = aula.professor_presenca === 'presente' ? 'ausente' : 'presente';
      const { error } = await supabase
        .from('aulas_emusys')
        .update({ professor_presenca: novaPresenca })
        .eq('id', aulaId);
      if (error) throw error;
      toast.success(`${professorNome} ${novaPresenca} na aula das ${aula.hora_inicio}`);
      onMudou();
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as Record<string, unknown>).message) : String(e);
      toast.error('Nao foi possivel alterar', { description: msg });
    } finally {
      setSalvandoAula(null);
    }
  }

  const inicial = professorNome
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        presente === true
          ? 'border-emerald-500/40 bg-emerald-500/10'
          : presente === false
            ? 'border-rose-500/40 bg-rose-500/10'
            : 'border-slate-700 bg-slate-800/40',
      )}
    >
      {/* Cabecalho do card — clicavel para expandir */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpandido(!expandido)}
        onKeyDown={(e) => { if (e.key === 'Enter') setExpandido(!expandido); }}
        className="flex cursor-pointer items-center gap-3 p-3"
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

        {/* Toggle do dia */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleDia(); }}
          disabled={salvando}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all',
            presente === true
              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
              : presente === false
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70',
            salvando && 'opacity-50',
          )}
        >
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
        </button>

        {/* Chevron expandir */}
        <div className="shrink-0 text-slate-500">
          {expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Aulas individuais — so aparece quando expandido */}
      {expandido && (
        <div className="border-t border-slate-700/50 px-3 pb-3 pt-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Ajuste fino por aula
          </p>
          <div className="space-y-1">
            {aulas.map((aula) => {
              const aulaId = aula.aula_ids[0];
              const presenteAula = aula.professor_presenca === 'presente';
              return (
                <div
                  key={aula.chave}
                  className="flex items-center justify-between rounded-lg bg-slate-800/30 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-400">{aula.hora_inicio}</span>
                    <span className="text-slate-300">{aula.curso_nome}</span>
                    <span className="text-slate-500">{aula.sala_nome}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAula(aula)}
                    disabled={salvandoAula === aulaId}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors',
                      presenteAula
                        ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70',
                      salvandoAula === aulaId && 'opacity-50',
                    )}
                  >
                    {salvandoAula === aulaId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : presenteAula ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {presenteAula ? 'Presente' : 'Ausente'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
