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
  TrendingUp, TrendingDown, Minus, X, Shirt, Monitor, Smartphone
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
  uniforme: <Shirt className="h-4 w-4" />,
  prazos: <Calendar className="h-4 w-4" />,
  emusys: <Monitor className="h-4 w-4" />,
  projetos: <Sparkles className="h-4 w-4" />,
  videos_renovacao: <Smartphone className="h-4 w-4" />,
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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-700">
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

          {/* Resumo do Mês com barra de progresso */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              📊 Resumo do Mês
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Nota Final:</span>
                <span className={`text-2xl font-bold ${getNotaColor(avaliacao.nota_final)}`}>
                  {avaliacao.nota_final} / 100
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    avaliacao.nota_final >= 90 ? 'bg-emerald-500' :
                    avaliacao.nota_final >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${avaliacao.nota_final}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-400 mt-2">
                <span>Nota Base: 100</span>
                <span>|</span>
                <span className="text-rose-400">
                  Penalidades: {detalhesCriterios.filter(d => d.pontosImpacto < 0).reduce((sum, d) => sum + d.pontosImpacto, 0)}
                </span>
                <span>|</span>
                <span className="text-emerald-400">
                  Bônus: +{detalhesCriterios.filter(d => d.pontosImpacto > 0).reduce((sum, d) => sum + d.pontosImpacto, 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Detalhamento por critério - Layout compacto */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              📋 Detalhamento por Critério
            </h4>
            <div className="space-y-1">
              {detalhesCriterios.map(({ criterio, quantidade, pontosImpacto }) => (
                <div 
                  key={criterio.id}
                  className="flex items-center justify-between py-2 px-3 bg-slate-800/30 rounded-lg border border-slate-700/30"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      criterio.tipo === 'bonus' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {CRITERIO_ICONS[criterio.codigo] || <span>📋</span>}
                    </div>
                    <span className="text-sm text-white">
                      {criterio.nome}
                      {criterio.tipo === 'bonus' && (
                        <span className="ml-1 text-xs text-purple-400">⭐</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm ${
                      quantidade === 0 ? 'text-slate-500' : 
                      criterio.tipo === 'bonus' ? 'text-purple-400' : 'text-amber-400'
                    }`}>
                      {quantidade} ocorr.
                    </span>
                    <span className={`text-sm font-bold min-w-[45px] text-right ${
                      criterio.tipo === 'bonus' ? 'text-purple-400' :
                      pontosImpacto === 0 ? 'text-emerald-400' :
                      pontosImpacto >= -10 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {criterio.tipo === 'bonus' ? `+${pontosImpacto}` : pontosImpacto}pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Histórico de Ocorrências - TODO: buscar do banco */}
          {/* 
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              📝 Histórico de Ocorrências
            </h4>
            <div className="space-y-2 max-h-[150px] overflow-y-auto">
              {ocorrencias.map(oc => (
                <div key={oc.id} className="p-2 bg-slate-800/30 rounded-lg text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{oc.data}</span>
                    <span className="text-slate-500">{oc.registrado_por}</span>
                  </div>
                  <p className="text-white">{oc.descricao}</p>
                </div>
              ))}
            </div>
          </div>
          */}

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
      </DialogContent>
    </Dialog>
  );
}

export default Modal360Detalhes;
