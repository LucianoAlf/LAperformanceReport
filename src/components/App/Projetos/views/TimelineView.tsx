import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Calendar } from 'lucide-react';
import { Button } from '../../../ui/button';
import { useProjetos } from '../../../../hooks/useProjetos';
import { ModalDetalhesProjeto } from '../components';
import type { Projeto } from '../../../../types/projetos';

interface TimelineViewProps {
  unidadeSelecionada: string;
}

// Função para obter o nome do mês em português
function getNomeMes(mes: number): string {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return meses[mes];
}

// Função para obter a semana do mês (1-4)
function getSemanaDoMes(data: Date): number {
  const dia = data.getDate();
  return Math.min(Math.ceil(dia / 7), 4);
}

// Função para calcular a posição e largura da barra
function calcularPosicaoBarra(
  dataInicio: string,
  dataFim: string,
  mesInicio: Date,
  totalSemanas: number
): { left: number; width: number } {
  const inicio = new Date(dataInicio + 'T00:00:00');
  const fim = new Date(dataFim + 'T00:00:00');
  const mesInicioTimeline = new Date(mesInicio);
  
  // Calcular dias desde o início da timeline
  const diasDesdeInicio = Math.max(0, Math.floor((inicio.getTime() - mesInicioTimeline.getTime()) / (1000 * 60 * 60 * 24)));
  const duracaoDias = Math.max(1, Math.floor((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  
  // Converter para porcentagem (cada semana = 7 dias, total = totalSemanas * 7 dias)
  const totalDias = totalSemanas * 7;
  const left = (diasDesdeInicio / totalDias) * 100;
  const width = Math.min((duracaoDias / totalDias) * 100, 100 - left);
  
  return { left: Math.max(0, left), width: Math.max(2, width) };
}

// Função para calcular a posição do indicador "hoje"
function calcularPosicaoHoje(mesInicio: Date, totalSemanas: number): number {
  const hoje = new Date();
  const totalDias = totalSemanas * 7;
  const diasDesdeInicio = Math.floor((hoje.getTime() - mesInicio.getTime()) / (1000 * 60 * 60 * 24));
  return (diasDesdeInicio / totalDias) * 100;
}

// Componente de Tooltip
interface TooltipProps {
  projeto: Projeto;
  visible: boolean;
  x: number;
  y: number;
}

function Tooltip({ projeto, visible, x, y }: TooltipProps) {
  if (!visible) return null;
  
  const formatarData = (data?: string) => {
    if (!data) return '-';
    return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  return (
    <div 
      className="fixed z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 min-w-[200px] pointer-events-none"
      style={{ 
        left: Math.min(x + 10, window.innerWidth - 220), 
        top: y - 80 
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span 
          className="text-xs font-semibold uppercase px-2 py-0.5 rounded"
          style={{ 
            backgroundColor: `${projeto.tipo?.cor || '#8b5cf6'}20`,
            color: projeto.tipo?.cor || '#8b5cf6'
          }}
        >
          {projeto.tipo?.nome || 'Projeto'}
        </span>
      </div>
      <h4 className="font-semibold text-white text-sm mb-2">{projeto.nome}</h4>
      <div className="space-y-1 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3" />
          <span>{formatarData(projeto.data_inicio)} - {formatarData(projeto.data_fim)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-600" />
          <span>{projeto.tarefas_concluidas || 0}/{projeto.total_tarefas || 0} tarefas ({projeto.progresso || 0}%)</span>
        </div>
      </div>
    </div>
  );
}

export function TimelineView({ unidadeSelecionada }: TimelineViewProps) {
  // Hooks de dados
  const { data: projetos, loading, refetch } = useProjetos(unidadeSelecionada);
  
  // Estados locais
  const [mesAtual, setMesAtual] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });
  const [projetoDetalhesId, setProjetoDetalhesId] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ projeto: Projeto; x: number; y: number } | null>(null);

  // Gerar array de meses para exibição (3 meses)
  const mesesExibidos = useMemo(() => {
    const meses = [];
    for (let i = 0; i < 3; i++) {
      const data = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + i, 1);
      meses.push({
        data,
        nome: `${getNomeMes(data.getMonth())} ${data.getFullYear()}`,
        semanas: ['S1', 'S2', 'S3', 'S4'],
      });
    }
    return meses;
  }, [mesAtual]);

  const totalSemanas = mesesExibidos.length * 4; // 12 semanas (3 meses)
  
  // Calcular posição do indicador "hoje"
  const posicaoHoje = useMemo(() => {
    return calcularPosicaoHoje(mesAtual, totalSemanas);
  }, [mesAtual, totalSemanas]);

  // Filtrar projetos que estão no período exibido
  const projetosFiltrados = useMemo(() => {
    const fimPeriodo = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 3, 0);
    
    return projetos.filter(p => {
      if (!p.data_inicio || !p.data_fim) return false;
      const inicio = new Date(p.data_inicio + 'T00:00:00');
      const fim = new Date(p.data_fim + 'T00:00:00');
      // Projeto está no período se há sobreposição
      return inicio <= fimPeriodo && fim >= mesAtual;
    });
  }, [projetos, mesAtual]);

  // Navegação
  const irParaMesAnterior = () => {
    setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1));
  };

  const irParaProximoMes = () => {
    setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1));
  };

  const irParaHoje = () => {
    const hoje = new Date();
    setMesAtual(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  };

  // Handlers de mouse
  const handleMouseEnter = (projeto: Projeto, e: React.MouseEvent) => {
    setTooltip({ projeto, x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tooltip) {
      setTooltip({ ...tooltip, x: e.clientX, y: e.clientY });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        {/* Controles de Navegação */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={irParaMesAnterior}
              className="border-slate-700 h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={irParaProximoMes}
              className="border-slate-700 h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={irParaHoje}
              className="border-slate-700 h-8 px-3"
            >
              Hoje
            </Button>
          </div>
          <div className="text-sm text-slate-400">
            {projetosFiltrados.length} projeto{projetosFiltrados.length !== 1 ? 's' : ''} no período
          </div>
        </div>

        {/* Header */}
        <div className="flex border-b border-slate-800">
          {/* Sidebar Header */}
          <div className="w-72 flex-shrink-0 p-4 bg-slate-800/50 border-r border-slate-800">
            <span className="font-semibold text-white text-sm">Projetos</span>
          </div>

          {/* Meses */}
          <div className="flex-1 flex">
            {mesesExibidos.map((mes, i) => (
              <div key={i} className="flex-1 border-r border-slate-800 last:border-r-0">
                <div className="text-center py-2 border-b border-slate-800 bg-slate-800/50">
                  <span className="font-semibold text-white text-sm">{mes.nome}</span>
                </div>
                <div className="flex">
                  {mes.semanas.map((semana, j) => (
                    <div key={j} className="flex-1 text-center py-1.5 text-xs text-slate-500 border-r border-slate-800/50 last:border-r-0">
                      {semana}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[500px] overflow-y-auto">
          {projetosFiltrados.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              Nenhum projeto neste período
            </div>
          ) : (
            projetosFiltrados.map((projeto) => {
              const { left, width } = calcularPosicaoBarra(
                projeto.data_inicio!,
                projeto.data_fim!,
                mesAtual,
                totalSemanas
              );
              
              return (
                <div key={projeto.id} className="flex border-b border-slate-800 last:border-b-0 min-h-[60px]">
                  {/* Info do Projeto */}
                  <div 
                    className="w-72 flex-shrink-0 p-3 border-r border-slate-800 flex items-center gap-3 bg-slate-900/30 cursor-pointer hover:bg-slate-800/50 transition-colors"
                    onClick={() => setProjetoDetalhesId(projeto.id)}
                  >
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                      style={{ backgroundColor: `${projeto.tipo?.cor || '#8b5cf6'}20` }}
                    >
                      {projeto.tipo?.icone || '📁'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-white text-sm truncate">{projeto.nome}</div>
                      <div className="text-xs text-slate-500 truncate">{projeto.tipo?.nome || 'Projeto'}</div>
                    </div>
                  </div>

                  {/* Barra de Timeline */}
                  <div 
                    className="flex-1 relative"
                    style={{
                      background: `repeating-linear-gradient(
                        90deg,
                        transparent,
                        transparent calc(${100 / totalSemanas}% - 1px),
                        rgb(51 65 85 / 0.3) calc(${100 / totalSemanas}% - 1px),
                        rgb(51 65 85 / 0.3) ${100 / totalSemanas}%
                      )`
                    }}
                  >
                    {/* Indicador de Hoje */}
                    {posicaoHoje >= 0 && posicaoHoje <= 100 && (
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
                        style={{ left: `${posicaoHoje}%` }}
                      >
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-rose-500" />
                      </div>
                    )}

                    {/* Barra do Projeto */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-7 rounded-md flex items-center px-2.5 text-[11px] font-semibold text-white cursor-pointer hover:brightness-110 hover:scale-[1.02] transition-all truncate shadow-lg"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: projeto.tipo?.cor || '#8b5cf6',
                        minWidth: '60px',
                      }}
                      onClick={() => setProjetoDetalhesId(projeto.id)}
                      onMouseEnter={(e) => handleMouseEnter(projeto, e)}
                      onMouseLeave={handleMouseLeave}
                      onMouseMove={handleMouseMove}
                    >
                      <span className="truncate">{projeto.nome}</span>
                      {/* Barra de progresso dentro */}
                      <div 
                        className="absolute bottom-0 left-0 h-1 bg-white/30 rounded-b-md"
                        style={{ width: `${projeto.progresso || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 p-3 border-t border-slate-800 bg-slate-800/30 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-rose-500 rounded" />
            <span>Hoje</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-3 bg-violet-500 rounded" />
            <span>Duração do projeto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-1 bg-white/30 rounded" />
            <span>Progresso</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <Tooltip 
          projeto={tooltip.projeto} 
          visible={true} 
          x={tooltip.x} 
          y={tooltip.y} 
        />
      )}

      {/* Modal de Detalhes */}
      <ModalDetalhesProjeto
        isOpen={!!projetoDetalhesId}
        projetoId={projetoDetalhesId}
        onClose={() => setProjetoDetalhesId(null)}
        onSuccess={refetch}
      />
    </>
  );
}

export default TimelineView;
