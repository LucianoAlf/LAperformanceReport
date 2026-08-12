import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, XCircle, Clock, RotateCcw, CalendarX, PartyPopper } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface ProjecaoAula {
  sequencia: number;
  data_projetada: string;
  status: 'projetada' | 'realizada' | 'falta' | 'falta_justificada' | 'reposta' | 'debitada_evento' | 'cancelada';
  dia_semana: string;
}

interface Props {
  alunoId: number;
  matriculaDisciplinaId: number;
}

const STATUS_CONFIG = {
  projetada: { icon: Clock, cor: 'text-slate-400', bg: 'bg-slate-700/50', label: 'Projetada' },
  realizada: { icon: CheckCircle2, cor: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Realizada' },
  falta: { icon: XCircle, cor: 'text-rose-400', bg: 'bg-rose-500/20', label: 'Falta' },
  falta_justificada: { icon: AlertTriangle, cor: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Justificada' },
  reposta: { icon: RotateCcw, cor: 'text-violet-400', bg: 'bg-violet-500/20', label: 'Reposta' },
  debitada_evento: { icon: PartyPopper, cor: 'text-cyan-400', bg: 'bg-cyan-500/20', label: 'Evento' },
  cancelada: { icon: CalendarX, cor: 'text-slate-500', bg: 'bg-slate-700/30', label: 'Cancelada' },
};

import { AlertTriangle } from 'lucide-react';

/**
 * Timeline do contrato — mostra as N aulas do pacote com status de cada uma.
 * Cada aula é um ponto na linha do tempo: realizada, falta, justificada, reposta, evento, cancelada.
 */
export function TimelineContrato({ alunoId, matriculaDisciplinaId }: Props) {
  const [aulas, setAulas] = useState<ProjecaoAula[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      const { data, error } = await supabase
        .from('projecao_aulas')
        .select('sequencia, data_projetada, status, dia_semana')
        .eq('aluno_id', alunoId)
        .eq('matricula_disciplina_id', matriculaDisciplinaId)
        .order('sequencia');

      if (!error && data) {
        setAulas(data);
      }
      setCarregando(false);
    }
    carregar();
  }, [alunoId, matriculaDisciplinaId]);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-8">
        <Clock className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (aulas.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-6 text-center">
        <p className="text-xs text-slate-500">Nenhuma projeção encontrada para este contrato.</p>
      </div>
    );
  }

  const realizadas = aulas.filter((a) => a.status === 'realizada').length;
  const total = aulas.length;

  return (
    <div className="space-y-3">
      {/* Progresso */}
      <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
        <span className="text-xs text-slate-400">
          <b className="text-white">{realizadas}</b> de <b className="text-white">{total}</b> aulas realizadas
        </span>
        <span className="text-xs text-slate-500">
          {Math.round((realizadas / total) * 100)}% do contrato
        </span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Linha vertical */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-700/50" />

        <div className="space-y-1">
          {aulas.map((aula) => {
            const config = STATUS_CONFIG[aula.status] || STATUS_CONFIG.projetada;
            const Icon = config.icon;
            return (
              <div key={aula.sequencia} className="relative flex items-center gap-3 pl-10">
                {/* Ponto na linha */}
                <div className={cn(
                  'absolute left-2.5 flex h-3 w-3 items-center justify-center rounded-full border-2',
                  config.bg,
                  aula.status === 'realizada' && 'border-emerald-500',
                  aula.status === 'falta' && 'border-rose-500',
                  aula.status === 'falta_justificada' && 'border-amber-500',
                  aula.status === 'reposta' && 'border-violet-500',
                  aula.status === 'debitada_evento' && 'border-cyan-500',
                  aula.status === 'cancelada' && 'border-slate-600',
                  aula.status === 'projetada' && 'border-slate-600',
                )}>
                  <Icon className={cn('h-2 w-2', config.cor)} />
                </div>

                {/* Conteúdo */}
                <div className={cn(
                  'flex flex-1 items-center justify-between rounded-lg border px-3 py-2 text-xs',
                  aula.status === 'realizada' && 'border-emerald-500/20 bg-emerald-500/5',
                  aula.status === 'falta' && 'border-rose-500/20 bg-rose-500/5',
                  aula.status === 'falta_justificada' && 'border-amber-500/20 bg-amber-500/5',
                  aula.status === 'reposta' && 'border-violet-500/20 bg-violet-500/5',
                  aula.status === 'debitada_evento' && 'border-cyan-500/20 bg-cyan-500/5',
                  aula.status === 'cancelada' && 'border-slate-700/30 bg-slate-800/20',
                  aula.status === 'projetada' && 'border-slate-700/50 bg-slate-800/30',
                )}>
                  <div>
                    <span className="font-medium text-slate-200">Aula {aula.sequencia}</span>
                    <span className="ml-2 text-slate-500">{aula.dia_semana}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{format(parseISO(aula.data_projetada), 'dd/MM/yyyy')}</span>
                    <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', config.bg, config.cor)}>
                      {config.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const Icon = config.icon;
          return (
            <span key={status} className="flex items-center gap-1">
              <span className={cn('h-2 w-2 rounded-full', config.bg)} />
              {config.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
