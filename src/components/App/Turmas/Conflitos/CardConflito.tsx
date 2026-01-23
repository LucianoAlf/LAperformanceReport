// Card expandível com detalhes do conflito

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, XCircle, AlertTriangle, Info } from 'lucide-react';
import type { Conflito } from '@/lib/horarios';

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

interface CardConflitoProps {
  conflito: Conflito;
  turmaConflitante?: TurmaConflitante;
  onVerNaGrade?: (turmaId: number) => void;
  expandidoInicial?: boolean;
}

const SEVERIDADE_CONFIG = {
  erro: {
    icon: XCircle,
    cor: 'text-red-400',
    bgCor: 'bg-red-500/10',
    borderCor: 'border-red-500/30',
    headerBg: 'bg-red-500/20',
    label: 'ERRO'
  },
  aviso: {
    icon: AlertTriangle,
    cor: 'text-amber-400',
    bgCor: 'bg-amber-500/10',
    borderCor: 'border-amber-500/30',
    headerBg: 'bg-amber-500/20',
    label: 'AVISO'
  },
  info: {
    icon: Info,
    cor: 'text-blue-400',
    bgCor: 'bg-blue-500/10',
    borderCor: 'border-blue-500/30',
    headerBg: 'bg-blue-500/20',
    label: 'INFO'
  }
};

export function CardConflito({ 
  conflito, 
  turmaConflitante, 
  onVerNaGrade,
  expandidoInicial = false 
}: CardConflitoProps) {
  const [expandido, setExpandido] = useState(expandidoInicial);
  const config = SEVERIDADE_CONFIG[conflito.severidade] || SEVERIDADE_CONFIG.info;
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border ${config.borderCor} ${config.bgCor} overflow-hidden transition-all duration-200`}>
      {/* Header */}
      <button
        onClick={() => setExpandido(!expandido)}
        className={`w-full flex items-center justify-between p-3 ${config.headerBg} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${config.cor}`} />
          <div className="text-left">
            <span className={`text-xs font-bold ${config.cor}`}>{config.label}</span>
            <p className="text-sm font-medium text-white">{conflito.mensagem}</p>
          </div>
        </div>
        {expandido ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="p-4 space-y-3 border-t border-slate-700/50">
          {/* Detalhes do conflito */}
          <p className="text-sm text-slate-300">{conflito.detalhes}</p>

          {/* Turma conflitante (se houver) */}
          {turmaConflitante && (
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-slate-400">Turma conflitante:</p>
              <div className="flex items-center gap-2">
                <span className="text-lg">🎵</span>
                <div>
                  <p className="text-sm font-medium text-white">
                    {turmaConflitante.curso_nome || 'Curso'} 
                    {turmaConflitante.total_alunos !== undefined && (
                      <span className="text-slate-400"> - {turmaConflitante.total_alunos} aluno(s)</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">
                    📍 {turmaConflitante.sala_nome || 'Sala não definida'} | 
                    ⏰ {turmaConflitante.horario_inicio}-{turmaConflitante.horario_fim}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Barra de ocupação (para conflitos de capacidade) */}
          {conflito.tipo === 'capacidade' && conflito.detalhes && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Ocupação</span>
                <span className={config.cor}>
                  {conflito.detalhes.match(/(\d+)%/)?.[1] || '0'}%
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${conflito.severidade === 'erro' ? 'bg-red-500' : 'bg-amber-500'} transition-all`}
                  style={{ width: `${conflito.detalhes.match(/(\d+)%/)?.[1] || 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Botão ver na grade */}
          {turmaConflitante && onVerNaGrade && (
            <button
              onClick={() => onVerNaGrade(turmaConflitante.id)}
              className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Ver na grade
            </button>
          )}
        </div>
      )}
    </div>
  );
}
