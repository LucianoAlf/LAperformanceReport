import { AlertTriangle } from 'lucide-react';
import type { Aluno, Turma } from './AlunosPage';

interface AlertaTurmaProps {
  aluno?: Aluno;
  turmaExistente?: Turma;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function AlertaTurma({ aluno, turmaExistente, onConfirmar, onCancelar }: AlertaTurmaProps) {
  if (!turmaExistente) return null;

  return (
    <div className="fixed bottom-6 right-6 bg-yellow-900/90 border border-yellow-500/50 rounded-xl p-4 max-w-sm shadow-2xl z-50">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-yellow-400">⚠️ Alerta de Turma</h4>
          <p className="text-sm text-yellow-200 mt-1">
            Já existe <strong>{turmaExistente.total_alunos} aluno(s)</strong> nesta turma:
            <br />
            <span className="text-white">
              {turmaExistente.professor_nome} ({turmaExistente.curso_nome}, {turmaExistente.dia_semana} {turmaExistente.horario_inicio?.substring(0, 5)})
            </span>
          </p>
          {turmaExistente.nomes_alunos && turmaExistente.nomes_alunos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {turmaExistente.nomes_alunos.slice(0, 3).map((nome, i) => (
                <span key={i} className="bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded text-xs">
                  {nome.split(' ')[0]}
                </span>
              ))}
              {turmaExistente.nomes_alunos.length > 3 && (
                <span className="text-yellow-300 text-xs">+{turmaExistente.nomes_alunos.length - 3}</span>
              )}
            </div>
          )}
          <p className="text-xs text-yellow-300 mt-2">Deseja cadastrar mesmo assim?</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={onConfirmar}
              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium transition"
            >
              Sim, cadastrar
            </button>
            <button
              onClick={onCancelar}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-sm transition"
            >
              Cancelar
            </button>
          </div>
        </div>
        <button
          onClick={onCancelar}
          className="text-slate-400 hover:text-white transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
