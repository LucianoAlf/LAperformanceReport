import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Users, Music, Clock, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TurmaImplicita {
  curso_nome: string;
  dia_semana: string;
  horario_inicio: string;
  total_alunos: number;
  nomes_alunos: string[];
  sala_nome: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  professorId: number | null;
  professorNome: string;
  unidadeId: string;
  unidadeNome?: string;
}

const DIAS_ORDEM: Record<string, number> = {
  'Segunda': 1, 'Segunda-feira': 1,
  'Terça': 2, 'Terça-feira': 2,
  'Quarta': 3, 'Quarta-feira': 3,
  'Quinta': 4, 'Quinta-feira': 4,
  'Sexta': 5, 'Sexta-feira': 5,
  'Sábado': 6,
  'Domingo': 7,
};

function normalizarDia(dia: string): string {
  const mapa: Record<string, string> = {
    'Segunda-feira': 'Segunda', 'Terça-feira': 'Terça',
    'Quarta-feira': 'Quarta', 'Quinta-feira': 'Quinta',
    'Sexta-feira': 'Sexta',
  };
  return mapa[dia] || dia;
}

export function ModalDetalhesTurmas({ open, onClose, professorId, professorNome, unidadeId, unidadeNome }: Props) {
  const [turmas, setTurmas] = useState<TurmaImplicita[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !professorId) return;

    async function fetchTurmas() {
      setLoading(true);
      let query = supabase
        .from('vw_turmas_implicitas')
        .select('curso_nome, dia_semana, horario_inicio, total_alunos, nomes_alunos, sala_nome')
        .eq('professor_id', professorId!);

      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data } = await query.order('dia_semana').order('horario_inicio');
      setTurmas(data || []);
      setLoading(false);
    }

    fetchTurmas();
  }, [open, professorId, unidadeId]);

  if (!professorId) return null;

  // Agrupar por dia da semana
  const turmasPorDia = turmas.reduce<Record<string, TurmaImplicita[]>>((acc, t) => {
    const dia = normalizarDia(t.dia_semana);
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push(t);
    return acc;
  }, {});

  const diasOrdenados = Object.keys(turmasPorDia).sort(
    (a, b) => (DIAS_ORDEM[a] || 99) - (DIAS_ORDEM[b] || 99)
  );

  const totalAlunos = turmas.reduce((sum, t) => sum + t.total_alunos, 0);
  const totalTurmas = turmas.length;
  const media = totalTurmas > 0 ? (totalAlunos / totalTurmas).toFixed(1) : '0';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-400" />
            Turmas — {professorNome}
          </DialogTitle>
          {unidadeNome && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
              <MapPin size={12} /> {unidadeNome}
            </p>
          )}
        </DialogHeader>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3 py-3 border-b border-slate-700/50">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{totalTurmas}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Turmas</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{totalAlunos}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Alunos</p>
          </div>
          <div className="text-center">
            <p className={cn(
              "text-2xl font-bold",
              Number(media) >= 1.5 ? 'text-emerald-400' :
              Number(media) >= 1.3 ? 'text-amber-400' : 'text-rose-400'
            )}>{media}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Média/Turma</p>
          </div>
        </div>

        {/* Lista de turmas */}
        <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            </div>
          ) : turmas.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Nenhuma turma encontrada</p>
          ) : (
            diasOrdenados.map(dia => (
              <div key={dia}>
                <div className="py-2 border-b border-slate-700/40 mb-2">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {dia}
                  </h3>
                </div>
                <div className="space-y-2">
                  {turmasPorDia[dia]
                    .sort((a, b) => (a.horario_inicio || '').localeCompare(b.horario_inicio || ''))
                    .map((turma, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-3 hover:border-slate-600/60 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Music size={14} className="text-violet-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-white">{turma.curso_nome}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {turma.horario_inicio?.substring(0, 5)}
                          </span>
                          {turma.sala_nome && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} />
                              {turma.sala_nome}
                            </span>
                          )}
                          <span className={cn(
                            "font-semibold px-1.5 py-0.5 rounded text-[10px]",
                            turma.total_alunos >= 2 ? 'bg-emerald-500/20 text-emerald-400' :
                            turma.total_alunos === 1 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-rose-500/20 text-rose-400'
                          )}>
                            {turma.total_alunos} {turma.total_alunos === 1 ? 'aluno' : 'alunos'}
                          </span>
                        </div>
                      </div>
                      {/* Lista de alunos */}
                      {turma.nomes_alunos && turma.nomes_alunos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {turma.nomes_alunos.map((nome, i) => (
                            <span
                              key={i}
                              className="text-[11px] text-slate-300 bg-slate-700/50 px-2 py-0.5 rounded-full"
                            >
                              {nome}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
