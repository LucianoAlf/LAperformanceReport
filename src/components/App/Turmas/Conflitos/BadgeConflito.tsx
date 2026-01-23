// Badge visual para exibir tipo e severidade de conflito

import { AlertTriangle, XCircle, AlertCircle, Info } from 'lucide-react';
import type { Conflito } from '@/lib/horarios';

interface BadgeConflitoProps {
  conflito: Conflito;
  compacto?: boolean;
}

const SEVERIDADE_CONFIG = {
  erro: {
    icon: XCircle,
    cor: 'text-red-400',
    bgCor: 'bg-red-500/20',
    borderCor: 'border-red-500/30',
    label: 'ERRO'
  },
  aviso: {
    icon: AlertTriangle,
    cor: 'text-amber-400',
    bgCor: 'bg-amber-500/20',
    borderCor: 'border-amber-500/30',
    label: 'AVISO'
  },
  info: {
    icon: Info,
    cor: 'text-blue-400',
    bgCor: 'bg-blue-500/20',
    borderCor: 'border-blue-500/30',
    label: 'INFO'
  }
};

const TIPO_CONFIG: Record<string, { emoji: string; label: string }> = {
  sala: { emoji: '🚪', label: 'Sala' },
  professor: { emoji: '👨‍🏫', label: 'Professor' },
  aluno: { emoji: '👤', label: 'Aluno' },
  horario_funcionamento: { emoji: '🕐', label: 'Horário' },
  capacidade: { emoji: '👥', label: 'Capacidade' }
};

export function BadgeConflito({ conflito, compacto = false }: BadgeConflitoProps) {
  const severidadeConfig = SEVERIDADE_CONFIG[conflito.severidade] || SEVERIDADE_CONFIG.info;
  const tipoConfig = TIPO_CONFIG[conflito.tipo] || { emoji: '⚠️', label: conflito.tipo };
  const Icon = severidadeConfig.icon;

  if (compacto) {
    return (
      <span 
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${severidadeConfig.bgCor} ${severidadeConfig.cor}`}
        title={conflito.mensagem}
      >
        <Icon className="w-3 h-3" />
        {tipoConfig.emoji}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${severidadeConfig.bgCor} border ${severidadeConfig.borderCor}`}>
      <Icon className={`w-4 h-4 ${severidadeConfig.cor}`} />
      <span className={`text-xs font-semibold ${severidadeConfig.cor}`}>
        {severidadeConfig.label}
      </span>
      <span className="text-xs text-slate-300">
        {tipoConfig.emoji} {tipoConfig.label}
      </span>
    </div>
  );
}

export { SEVERIDADE_CONFIG, TIPO_CONFIG };
