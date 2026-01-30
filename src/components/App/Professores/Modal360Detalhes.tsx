import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Eye, Clock, UserX, Building2, Calendar, Sparkles, 
  TrendingUp, TrendingDown, Minus, X
} from 'lucide-react';
import { Criterio360, Professor360Resumo } from '@/hooks/useProfessor360';

interface Modal360DetalhesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacao: Professor360Resumo;
  criterios: Criterio360[];
  competencia: string;
  competenciaLabel: string;
}

// Ícones para cada critério
const CRITERIO_ICONS: Record<string, React.ReactNode> = {
  atrasos: <Clock className="h-4 w-4" />,
  faltas: <UserX className="h-4 w-4" />,
  organizacao_sala: <Building2 className="h-4 w-4" />,
  uniforme: <span className="text-sm">👔</span>,
  prazos: <Calendar className="h-4 w-4" />,
  emusys: <span className="text-sm">💻</span>,
  projetos: <Sparkles className="h-4 w-4" />,
};

// Cor da nota
const getNotaColor = (nota: number) => {
  if (nota >= 90) return 'text-emerald-400';
  if (nota >= 70) return 'text-amber-400';
  return 'text-rose-400';
};

const getNotaBg = (nota: number) => {
  if (nota >= 90) return 'bg-emerald-500/20 border-emerald-500/30';
  if (nota >= 70) return 'bg-amber-500/20 border-amber-500/30';
  return 'bg-rose-500/20 border-rose-500/30';
};

export function Modal360Detalhes({
  open,
  onOpenChange,
  avaliacao,
  criterios,
  competencia,
  competenciaLabel,
}: Modal360DetalhesProps) {
  // Calcular detalhes por critério
  const detalhesCriterios = criterios.map(criterio => {
    let quantidade = 0;
    let pontosImpacto = 0;

    if (avaliacao.avaliacao) {
      switch (criterio.codigo) {
        case 'atrasos':
          quantidade = avaliacao.avaliacao.qtd_atrasos || 0;
          break;
        case 'faltas':
          quantidade = avaliacao.avaliacao.qtd_faltas || 0;
          break;
        case 'organizacao_sala':
          quantidade = avaliacao.avaliacao.qtd_organizacao_sala || 0;
          break;
        case 'uniforme':
          quantidade = avaliacao.avaliacao.qtd_uniforme || 0;
          break;
        case 'prazos':
          quantidade = avaliacao.avaliacao.qtd_prazos || 0;
          break;
        case 'emusys':
          quantidade = avaliacao.avaliacao.qtd_emusys || 0;
          break;
        case 'projetos':
          quantidade = avaliacao.avaliacao.qtd_projetos || 0;
          break;
      }
    }

    if (criterio.tipo === 'penalidade') {
      const excedente = Math.max(0, quantidade - (criterio.tolerancia || 0));
      pontosImpacto = excedente * (criterio.pontos_perda || 0) * -1;
    } else {
      pontosImpacto = quantidade * 5; // pontos por projeto
    }

    return {
      criterio,
      quantidade,
      pontosImpacto,
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Eye className="h-5 w-5 text-cyan-400" />
            Detalhes da Avaliação 360°
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Cabeçalho com info do professor */}
          <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
              {avaliacao.professor_foto ? (
                <img src={avaliacao.professor_foto} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-slate-400">
                  {avaliacao.professor_nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white text-lg">{avaliacao.professor_nome}</h3>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="px-2 py-0.5 bg-slate-700 rounded text-xs">{avaliacao.unidade_codigo}</span>
                <span>•</span>
                <span>{competenciaLabel}</span>
              </div>
            </div>
            <div className={`text-center p-3 rounded-xl border ${getNotaBg(avaliacao.nota_final)}`}>
              <p className={`text-3xl font-bold ${getNotaColor(avaliacao.nota_final)}`}>
                {avaliacao.nota_final}
              </p>
              <p className="text-xs text-slate-400">pontos</p>
            </div>
          </div>

          {/* Detalhamento por critério */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Detalhamento por Critério
            </h4>
            <div className="space-y-2">
              {detalhesCriterios.map(({ criterio, quantidade, pontosImpacto }) => (
                <div 
                  key={criterio.id}
                  className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/30"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      criterio.tipo === 'bonus' ? 'bg-purple-500/20' : 'bg-slate-700'
                    }`}>
                      {CRITERIO_ICONS[criterio.codigo] || <span>📋</span>}
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">{criterio.nome}</p>
                      <p className="text-xs text-slate-500">
                        {criterio.tipo === 'bonus' 
                          ? 'Bônus por projeto'
                          : `Tolerância: ${criterio.tolerancia || 0} | -${criterio.pontos_perda}pts cada`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{quantidade}</p>
                      <p className="text-xs text-slate-500">ocorr.</p>
                    </div>
                    <div className={`text-right min-w-[60px] ${
                      pontosImpacto > 0 ? 'text-emerald-400' : 
                      pontosImpacto < 0 ? 'text-rose-400' : 'text-slate-500'
                    }`}>
                      <p className="text-sm font-bold">
                        {pontosImpacto > 0 ? '+' : ''}{pontosImpacto}
                      </p>
                      <p className="text-xs">pts</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumo */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Base</p>
                <p className="text-xl font-bold text-white">100 pts</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-400">Penalidades</p>
                <p className="text-xl font-bold text-rose-400">
                  {detalhesCriterios
                    .filter(d => d.pontosImpacto < 0)
                    .reduce((sum, d) => sum + d.pontosImpacto, 0)} pts
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-400">Bônus</p>
                <p className="text-xl font-bold text-emerald-400">
                  +{detalhesCriterios
                    .filter(d => d.pontosImpacto > 0)
                    .reduce((sum, d) => sum + d.pontosImpacto, 0)} pts
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">Final</p>
                <p className={`text-xl font-bold ${getNotaColor(avaliacao.nota_final)}`}>
                  {avaliacao.nota_final} pts
                </p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Status da avaliação:</span>
            {avaliacao.status === 'fechado' ? (
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full font-medium">
                ✓ Fechado
              </span>
            ) : avaliacao.status === 'avaliado' ? (
              <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full font-medium">
                Avaliado
              </span>
            ) : (
              <span className="px-3 py-1 bg-slate-700 text-slate-400 rounded-full font-medium">
                Pendente
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default Modal360Detalhes;
