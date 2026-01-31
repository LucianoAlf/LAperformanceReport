import React, { useState, useCallback } from 'react';
import { 
  HeartPulse, ChevronUp, ChevronDown, Save, RotateCcw,
  Users, RefreshCw, Target, Calendar, DoorOpen, TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Pesos padrão do Health Score do Professor (V2)
// Total deve somar 100%
// NOTA: Professor 360° foi removido do Health Score - agora é nota de corte independente
export const DEFAULT_HEALTH_WEIGHTS = {
  taxaCrescimento: 15, // Taxa de crescimento com fator de demanda ponderado
  mediaTurma: 20,      // Média de alunos por turma
  retencao: 25,        // Taxa de retenção (renovações)
  conversao: 15,       // Taxa de conversão de experimentais
  presenca: 15,        // Taxa de presença dos alunos
  evasoes: 10,         // Evasões/Churn (inverso: menos = melhor)
};

export type HealthWeightKey = keyof typeof DEFAULT_HEALTH_WEIGHTS;

interface HealthScoreConfigProps {
  weights?: typeof DEFAULT_HEALTH_WEIGHTS;
  onWeightsChange?: (weights: typeof DEFAULT_HEALTH_WEIGHTS) => void;
  onSave?: (weights: typeof DEFAULT_HEALTH_WEIGHTS) => void;
  readOnly?: boolean;
}

const WEIGHT_CONFIG: Record<HealthWeightKey, { 
  icon: React.ElementType; 
  label: string; 
  description?: string;
  color: string;
}> = {
  taxaCrescimento: { 
    icon: TrendingUp, 
    label: 'Taxa de Crescimento', 
    description: 'Crescimento da carteira com fator de demanda',
    color: 'text-emerald-400'
  },
  mediaTurma: { icon: Users, label: 'Média/Turma', color: 'text-purple-400' },
  retencao: { 
    icon: RefreshCw, 
    label: 'Retenção', 
    description: 'Taxa de renovações',
    color: 'text-cyan-400' 
  },
  conversao: { icon: Target, label: 'Conversão', color: 'text-pink-400' },
  presenca: { icon: Calendar, label: 'Presença', color: 'text-green-400' },
  evasoes: { 
    icon: DoorOpen, 
    label: 'Evasões', 
    description: 'Inverso: menos = melhor',
    color: 'text-red-400'
  },
};

export const HealthScoreConfig: React.FC<HealthScoreConfigProps> = ({
  weights: initialWeights,
  onWeightsChange,
  onSave,
  readOnly = false
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [weights, setWeights] = useState(initialWeights || DEFAULT_HEALTH_WEIGHTS);
  const [hasChanges, setHasChanges] = useState(false);

  const totalWeight = Object.values(weights).reduce((sum: number, val: number) => sum + val, 0);

  const handleWeightChange = useCallback((key: HealthWeightKey, value: number) => {
    if (readOnly) return;
    
    const otherTotal = Object.entries(weights)
      .filter(([k]) => k !== key)
      .reduce((acc: number, [, v]) => acc + (v as number), 0);
    
    const maxValue = 100 - otherTotal;
    const newValue = Math.min(value, maxValue);
    
    const newWeights = { ...weights, [key]: newValue };
    setWeights(newWeights);
    setHasChanges(true);
    onWeightsChange?.(newWeights);
  }, [weights, readOnly, onWeightsChange]);

  const handleReset = useCallback(() => {
    setWeights(DEFAULT_HEALTH_WEIGHTS);
    setHasChanges(true);
    onWeightsChange?.(DEFAULT_HEALTH_WEIGHTS);
  }, [onWeightsChange]);

  const handleSave = useCallback(() => {
    onSave?.(weights);
    setHasChanges(false);
  }, [weights, onSave]);

  return (
    <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 overflow-hidden">
      {/* Header do Accordion */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <HeartPulse className="w-5 h-5 text-violet-400" />
          <h3 className="font-semibold text-white text-sm">
            Health Score (Saúde do Professor)
          </h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {/* Conteúdo Expandido */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-6">
          {/* Pesos dos Fatores */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Pesos dos fatores (total = 100%)
              </label>
              <span className={`text-sm font-bold ${
                totalWeight === 100 
                  ? 'text-emerald-400' 
                  : 'text-rose-400'
              }`}>
                {totalWeight}%{totalWeight === 100 ? ' ✓' : ''}
              </span>
            </div>

            {/* Sliders */}
            {(Object.keys(WEIGHT_CONFIG) as HealthWeightKey[]).map((key) => {
              const config = WEIGHT_CONFIG[key];
              const IconComponent = config.icon;
              
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white flex items-center gap-2">
                      <IconComponent className={`w-4 h-4 ${config.color}`} />
                      {config.label}
                      {config.description && (
                        <span className="text-[10px] text-slate-500 font-normal">
                          ({config.description})
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-bold text-cyan-400">
                      {weights[key]}%
                    </span>
                  </div>
                  
                  {/* Slider Container */}
                  <div className="relative h-2">
                    {/* Track Background */}
                    <div className="absolute inset-0 bg-slate-700 rounded-full" />
                    {/* Track Fill */}
                    <div 
                      className="absolute inset-y-0 left-0 bg-cyan-500 rounded-full transition-all"
                      style={{ width: `${weights[key]}%` }}
                    />
                    {/* Thumb */}
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-cyan-400 rounded-full border-2 border-slate-900 shadow-lg cursor-pointer transition-all hover:scale-110"
                      style={{ left: `calc(${weights[key]}% - 8px)` }}
                    />
                    {/* Input Range (invisible but functional) */}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={weights[key]}
                      onChange={(e) => handleWeightChange(key, parseInt(e.target.value))}
                      disabled={readOnly}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Classificação do Score (V2: 70/50) */}
          <div className="space-y-4 pt-4 border-t border-slate-700/50">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Classificação do Health Score
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Saudável */}
              <div className="p-4 bg-emerald-900/30 rounded-xl border border-emerald-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="font-bold text-emerald-400 uppercase text-xs tracking-wide">
                    Saudável
                  </span>
                </div>
                <p className="text-sm text-emerald-300">
                  ≥ 70 pontos
                </p>
              </div>

              {/* Atenção */}
              <div className="p-4 bg-amber-900/30 rounded-xl border border-amber-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <span className="font-bold text-amber-400 uppercase text-xs tracking-wide">
                    Atenção
                  </span>
                </div>
                <p className="text-sm text-amber-300">
                  50 a 69 pontos
                </p>
              </div>

              {/* Crítico */}
              <div className="p-4 bg-rose-900/30 rounded-xl border border-rose-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-rose-400" />
                  <span className="font-bold text-rose-400 uppercase text-xs tracking-wide">
                    Crítico
                  </span>
                </div>
                <p className="text-sm text-rose-300">
                  &lt; 50 pontos
                </p>
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          {!readOnly && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/50">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="gap-2 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <RotateCcw className="w-4 h-4" />
                Restaurar Padrão
              </Button>
              {onSave && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || totalWeight !== 100}
                  className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <Save className="w-4 h-4" />
                  Salvar Configuração
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HealthScoreConfig;
