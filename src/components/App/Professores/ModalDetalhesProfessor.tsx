import { format, differenceInMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  X, User, Calendar, Building2, Music, Users, BookOpen, 
  TrendingUp, Award, Clock, FileText, Edit2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Professor } from './types';

interface ModalDetalhesProfessorProps {
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  professor: Professor | null;
}

export function ModalDetalhesProfessor({
  open,
  onClose,
  onEdit,
  professor
}: ModalDetalhesProfessorProps) {
  if (!professor) return null;

  // Calcular tempo de casa
  const tempoCasa = professor.data_admissao 
    ? differenceInMonths(new Date(), new Date(professor.data_admissao))
    : null;
  
  const formatarTempoCasa = (meses: number | null) => {
    if (meses === null) return 'Não informado';
    const anos = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    if (anos === 0) return `${mesesRestantes} meses`;
    if (mesesRestantes === 0) return `${anos} ano${anos > 1 ? 's' : ''}`;
    return `${anos} ano${anos > 1 ? 's' : ''} e ${mesesRestantes} meses`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <User className="w-5 h-5 text-violet-400" />
              Detalhes do Professor
            </span>
            <Button variant="ghost" size="sm" onClick={onEdit} className="text-violet-400 hover:text-violet-300">
              <Edit2 className="w-4 h-4 mr-1" />
              Editar
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header com foto e info básica */}
          <div className="flex gap-4 items-start">
            <div className="w-20 h-20 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
              {professor.foto_url ? (
                <img 
                  src={professor.foto_url} 
                  alt={professor.nome} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-10 h-10 text-slate-500" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white">{professor.nome}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`
                  px-2 py-0.5 rounded-full text-xs font-medium
                  ${professor.ativo 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-slate-500/20 text-slate-400'
                  }
                `}>
                  {professor.ativo ? 'Ativo' : 'Inativo'}
                </span>
                {tempoCasa !== null && tempoCasa >= 24 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    Veterano
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Grid de informações */}
          <div className="grid grid-cols-2 gap-4">
            {/* Tempo de Casa */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                <Clock className="w-4 h-4" />
                Tempo de Casa
              </div>
              <div className="text-lg font-semibold text-white">
                {formatarTempoCasa(tempoCasa)}
              </div>
              {professor.data_admissao && (
                <div className="text-xs text-slate-500 mt-1">
                  Desde {format(new Date(professor.data_admissao), "dd/MM/yyyy", { locale: ptBR })}
                </div>
              )}
            </div>

            {/* Total de Turmas */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                <BookOpen className="w-4 h-4" />
                Turmas
              </div>
              <div className="text-lg font-semibold text-white">
                {professor.total_turmas || 0}
              </div>
            </div>

            {/* Total de Alunos */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                <Users className="w-4 h-4" />
                Alunos
              </div>
              <div className="text-lg font-semibold text-white">
                {professor.total_alunos || 0}
              </div>
            </div>
          </div>

          {/* Unidades */}
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <Building2 className="w-4 h-4" />
              Unidades de Atuação
            </div>
            <div className="flex flex-wrap gap-2">
              {professor.unidades && professor.unidades.length > 0 ? (
                professor.unidades.map((u) => (
                  <span 
                    key={u.id} 
                    className="px-3 py-1 rounded-full text-sm font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30"
                  >
                    {u.unidade_nome || u.unidade_codigo}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 text-sm">Nenhuma unidade vinculada</span>
              )}
            </div>
          </div>

          {/* Cursos/Especialidades */}
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <Music className="w-4 h-4" />
              Cursos / Especialidades
            </div>
            <div className="flex flex-wrap gap-2">
              {professor.cursos && professor.cursos.length > 0 ? (
                professor.cursos.map((c) => (
                  <span 
                    key={c.id} 
                    className="px-3 py-1 rounded-full text-sm font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  >
                    {c.curso_nome}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 text-sm">Nenhum curso vinculado</span>
              )}
            </div>
          </div>

          {/* Observações */}
          {professor.observacoes && (
            <div>
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <FileText className="w-4 h-4" />
                Observações
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-sm text-slate-300">
                {professor.observacoes}
              </div>
            </div>
          )}

          {/* Métricas de Performance (se disponíveis) */}
          {(professor.nps_medio !== null || professor.media_alunos_turma !== null) && (
            <div>
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <TrendingUp className="w-4 h-4" />
                Métricas de Performance
              </div>
              <div className="grid grid-cols-2 gap-4">
                {professor.nps_medio !== null && (
                  <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400">NPS Médio</div>
                    <div className="text-lg font-semibold text-white">{professor.nps_medio}</div>
                  </div>
                )}
                {professor.media_alunos_turma !== null && (
                  <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400">Média Alunos/Turma</div>
                    <div className="text-lg font-semibold text-white">{professor.media_alunos_turma}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
