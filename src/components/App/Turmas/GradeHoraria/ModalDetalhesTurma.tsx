import { X, Users, Clock, MapPin, BookOpen, User, Edit, Calendar } from 'lucide-react';
import { TurmaGrade } from './types';

interface ModalDetalhesTurmaProps {
  turma: TurmaGrade;
  aberto: boolean;
  onClose: () => void;
  onEditar?: () => void;
}

export function ModalDetalhesTurma({ turma, aberto, onClose, onEditar }: ModalDetalhesTurmaProps) {
  if (!aberto) return null;

  // Calcular ocupação
  const ocupacao = turma.sala_capacidade > 0 
    ? Math.round((turma.num_alunos / turma.sala_capacidade) * 100) 
    : 0;

  // Cor da ocupação
  const corOcupacao = ocupacao >= 90 
    ? 'text-red-400 bg-red-500/20' 
    : ocupacao >= 70 
      ? 'text-amber-400 bg-amber-500/20'
      : 'text-emerald-400 bg-emerald-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-500/20 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {turma.nome || `Turma ${turma.id}`}
              </h3>
              <p className="text-sm text-slate-400">{turma.unidade_nome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 space-y-4">
          {/* Horário */}
          <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
            <Clock className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-xs text-slate-400 uppercase">Horário</p>
              <p className="text-white font-medium">
                {turma.dia_semana}, {turma.horario_inicio} - {turma.horario_fim}
              </p>
            </div>
          </div>

          {/* Professor */}
          <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
            <User className="w-5 h-5 text-violet-400" />
            <div>
              <p className="text-xs text-slate-400 uppercase">Professor</p>
              <p className="text-white font-medium">{turma.professor_nome}</p>
            </div>
          </div>

          {/* Sala */}
          <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
            <MapPin className="w-5 h-5 text-emerald-400" />
            <div className="flex-1">
              <p className="text-xs text-slate-400 uppercase">Sala</p>
              <p className="text-white font-medium">{turma.sala_nome}</p>
            </div>
            <div className={`px-2 py-1 rounded-lg ${corOcupacao}`}>
              <span className="text-sm font-medium">
                {turma.num_alunos}/{turma.sala_capacidade}
              </span>
            </div>
          </div>

          {/* Ocupação */}
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                <span className="text-xs text-slate-400 uppercase">Ocupação</span>
              </div>
              <span className={`text-sm font-bold ${
                ocupacao >= 90 ? 'text-red-400' :
                ocupacao >= 70 ? 'text-amber-400' :
                'text-emerald-400'
              }`}>
                {ocupacao}%
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  ocupacao >= 90 ? 'bg-red-500' :
                  ocupacao >= 70 ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(ocupacao, 100)}%` }}
              />
            </div>
          </div>

          {/* Curso */}
          {turma.curso_nome && (
            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
              <BookOpen className="w-5 h-5 text-pink-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase">Curso</p>
                <p className="text-white font-medium">{turma.curso_nome}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Fechar
          </button>
          {onEditar && (
            <button
              onClick={onEditar}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors"
            >
              <Edit size={16} />
              Editar Turma
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ModalDetalhesTurma;
