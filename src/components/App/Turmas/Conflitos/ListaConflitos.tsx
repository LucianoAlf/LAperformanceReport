// Lista de conflitos agrupada por severidade

import { AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import type { Conflito } from '@/lib/horarios';
import { CardConflito } from './CardConflito';

interface TurmaConflitante {
  id: number;
  professor_nome?: string;
  sala_nome?: string;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  horario_fim: string;
  total_alunos?: number;
}

interface ListaConflitosProps {
  conflitos: Conflito[];
  turmasConflitantes?: Map<string, TurmaConflitante>;
  onVerNaGrade?: (turmaId: number) => void;
  mostrarVazio?: boolean;
}

export function ListaConflitos({ 
  conflitos, 
  turmasConflitantes,
  onVerNaGrade,
  mostrarVazio = true 
}: ListaConflitosProps) {
  const erros = conflitos.filter(c => c.severidade === 'erro');
  const avisos = conflitos.filter(c => c.severidade === 'aviso');

  if (conflitos.length === 0 && mostrarVazio) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
        <CheckCircle className="w-5 h-5 text-emerald-400" />
        <div>
          <p className="text-sm font-medium text-emerald-400">Nenhum conflito detectado</p>
          <p className="text-xs text-slate-400">Todos os horários estão disponíveis</p>
        </div>
      </div>
    );
  }

  if (conflitos.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header com resumo */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span className="text-sm font-medium text-white">Conflitos Detectados</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {erros.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 rounded-full">
              <XCircle className="w-3 h-3" />
              {erros.length} erro{erros.length > 1 ? 's' : ''}
            </span>
          )}
          {avisos.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {avisos.length} aviso{avisos.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Lista de erros */}
      {erros.length > 0 && (
        <div className="space-y-2">
          {erros.map((conflito, index) => {
            const chave = `${conflito.tipo}-${index}`;
            const turmaConflitante = turmasConflitantes?.get(chave);
            return (
              <CardConflito
                key={chave}
                conflito={conflito}
                turmaConflitante={turmaConflitante}
                onVerNaGrade={onVerNaGrade}
                expandidoInicial={index === 0}
              />
            );
          })}
        </div>
      )}

      {/* Lista de avisos */}
      {avisos.length > 0 && (
        <div className="space-y-2">
          {avisos.map((conflito, index) => {
            const chave = `${conflito.tipo}-${index}`;
            const turmaConflitante = turmasConflitantes?.get(chave);
            return (
              <CardConflito
                key={chave}
                conflito={conflito}
                turmaConflitante={turmaConflitante}
                onVerNaGrade={onVerNaGrade}
                expandidoInicial={false}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
