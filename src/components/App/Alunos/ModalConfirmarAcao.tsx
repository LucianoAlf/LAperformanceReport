import { X, AlertTriangle, UserPlus, UserMinus, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Aluno, Turma } from './AlunosPage';

type TipoAcao = 'adicionar' | 'remover' | 'mover';

interface ModalConfirmarAcaoProps {
  tipo: TipoAcao;
  aluno: Aluno;
  turmaOrigem?: Turma;
  turmaDestino: Turma;
  conflitos?: string[];
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ModalConfirmarAcao({
  tipo,
  aluno,
  turmaOrigem,
  turmaDestino,
  conflitos = [],
  onConfirmar,
  onCancelar,
}: ModalConfirmarAcaoProps) {
  const titulos = {
    adicionar: 'Adicionar Aluno à Turma',
    remover: 'Remover Aluno da Turma',
    mover: 'Mover Aluno de Turma',
  };

  const icones = {
    adicionar: <UserPlus className="w-6 h-6 text-emerald-400" />,
    remover: <UserMinus className="w-6 h-6 text-red-400" />,
    mover: <ArrowRightLeft className="w-6 h-6 text-blue-400" />,
  };

  const cores = {
    adicionar: 'bg-emerald-500/20 border-emerald-500/50',
    remover: 'bg-red-500/20 border-red-500/50',
    mover: 'bg-blue-500/20 border-blue-500/50',
  };

  const botaoCores = {
    adicionar: 'bg-emerald-600 hover:bg-emerald-500',
    remover: 'bg-red-600 hover:bg-red-500',
    mover: 'bg-blue-600 hover:bg-blue-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancelar}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cores[tipo]}`}>
              {icones[tipo]}
            </div>
            <h2 className="text-lg font-bold text-white">{titulos[tipo]}</h2>
          </div>
          <button
            onClick={onCancelar}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4">
          {/* Informações do Aluno */}
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
            <p className="text-xs text-slate-400 uppercase mb-1">Aluno</p>
            <p className="text-white font-semibold">{aluno.nome}</p>
            <p className="text-sm text-slate-400 mt-1">
              {aluno.curso_nome || 'Sem curso'} • {aluno.professor_nome || 'Sem professor'}
            </p>
          </div>

          {/* Informações da Turma */}
          {tipo === 'mover' && turmaOrigem ? (
            <div className="space-y-3">
              <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 uppercase mb-1">De</p>
                <p className="text-white font-medium">
                  {turmaOrigem.dia_semana} às {turmaOrigem.horario_inicio}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {turmaOrigem.curso_nome} • {turmaOrigem.professor_nome}
                </p>
              </div>

              <div className="flex justify-center">
                <ArrowRightLeft className="w-5 h-5 text-slate-500" />
              </div>

              <div className="p-4 bg-slate-900/50 rounded-lg border border-emerald-500/30">
                <p className="text-xs text-emerald-400 uppercase mb-1">Para</p>
                <p className="text-white font-medium">
                  {turmaDestino.dia_semana} às {turmaDestino.horario_inicio}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {turmaDestino.curso_nome} • {turmaDestino.professor_nome}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-400 uppercase mb-1">Turma</p>
              <p className="text-white font-medium">
                {turmaDestino.dia_semana} às {turmaDestino.horario_inicio}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {turmaDestino.curso_nome} • {turmaDestino.professor_nome}
              </p>
              {turmaDestino.sala_nome && (
                <p className="text-sm text-slate-400">Sala {turmaDestino.sala_nome}</p>
              )}
            </div>
          )}

          {/* Conflitos/Avisos */}
          {conflitos.length > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-300 mb-2">Atenção</p>
                  <ul className="space-y-1">
                    {conflitos.map((conflito, idx) => (
                      <li key={idx} className="text-sm text-amber-200">
                        • {conflito}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Mensagem de confirmação */}
          <p className="text-sm text-slate-400 text-center">
            {tipo === 'adicionar' && 'Confirma a adição deste aluno à turma?'}
            {tipo === 'remover' && 'Confirma a remoção deste aluno da turma?'}
            {tipo === 'mover' && 'Confirma a movimentação deste aluno entre turmas?'}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700 bg-slate-900/30">
          <Button
            onClick={onCancelar}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirmar}
            className={`px-6 py-2 text-white rounded-lg text-sm font-medium transition ${botaoCores[tipo]}`}
          >
            {tipo === 'adicionar' && 'Adicionar'}
            {tipo === 'remover' && 'Remover'}
            {tipo === 'mover' && 'Mover'}
          </Button>
        </div>
      </div>
    </div>
  );
}
