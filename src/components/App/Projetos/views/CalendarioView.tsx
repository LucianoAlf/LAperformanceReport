import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2, FolderKanban, CheckSquare } from 'lucide-react';
import { Button } from '../../../ui/button';
import { useProjetos } from '../../../../hooks/useProjetos';
import { ModalDetalhesProjeto } from '../components';
import { supabase } from '../../../../lib/supabase';
import { useEffect } from 'react';

interface CalendarioViewProps {
  unidadeSelecionada: string;
}

// Interface para evento do calendário
interface EventoCalendario {
  id: number;
  tipo: 'projeto' | 'tarefa';
  titulo: string;
  data: string;
  cor: string;
  projetoId: number;
  projetoNome?: string;
}

// Função para obter o nome do mês em português
function getNomeMes(mes: number): string {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return meses[mes];
}

// Função para obter os dias do mês
function getDiasDoMes(ano: number, mes: number): (number | null)[] {
  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);
  const diasNoMes = ultimoDia.getDate();
  const diaSemanaInicio = primeiroDia.getDay(); // 0 = Domingo
  
  const dias: (number | null)[] = [];
  
  // Adicionar dias vazios antes do primeiro dia
  for (let i = 0; i < diaSemanaInicio; i++) {
    dias.push(null);
  }
  
  // Adicionar os dias do mês
  for (let i = 1; i <= diasNoMes; i++) {
    dias.push(i);
  }
  
  return dias;
}

// Função para formatar data como YYYY-MM-DD
function formatarDataKey(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function CalendarioView({ unidadeSelecionada }: CalendarioViewProps) {
  // Estados
  const [mesAtual, setMesAtual] = useState(() => {
    const hoje = new Date();
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  });
  const [eventos, setEventos] = useState<EventoCalendario[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(true);
  const [projetoDetalhesId, setProjetoDetalhesId] = useState<number | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  // Hooks de dados
  const { data: projetos, loading: loadingProjetos, refetch } = useProjetos(unidadeSelecionada);

  // Buscar tarefas com prazo
  useEffect(() => {
    async function fetchTarefas() {
      setLoadingEventos(true);
      try {
        const { data: tarefas, error } = await supabase
          .from('projeto_tarefas')
          .select(`
            id,
            titulo,
            prazo,
            projeto:projetos!inner(
              id,
              nome,
              unidade_id,
              tipo:projeto_tipos(cor)
            )
          `)
          .not('prazo', 'is', null);

        if (error) throw error;

        // Filtrar por unidade se necessário
        const tarefasFiltradas = unidadeSelecionada === 'todas'
          ? tarefas
          : tarefas?.filter((t: any) => t.projeto?.unidade_id === unidadeSelecionada);

        // Converter tarefas para eventos
        const eventosTarefas: EventoCalendario[] = (tarefasFiltradas || []).map((t: any) => ({
          id: t.id,
          tipo: 'tarefa' as const,
          titulo: t.titulo,
          data: t.prazo,
          cor: t.projeto?.tipo?.cor || '#8b5cf6',
          projetoId: t.projeto?.id,
          projetoNome: t.projeto?.nome,
        }));

        // Converter projetos para eventos (data_fim)
        const eventosProjetos: EventoCalendario[] = projetos
          .filter(p => p.data_fim)
          .map(p => ({
            id: p.id,
            tipo: 'projeto' as const,
            titulo: p.nome,
            data: p.data_fim!,
            cor: p.tipo?.cor || '#8b5cf6',
            projetoId: p.id,
          }));

        setEventos([...eventosProjetos, ...eventosTarefas]);
      } catch (err) {
        console.error('Erro ao buscar tarefas:', err);
      } finally {
        setLoadingEventos(false);
      }
    }

    fetchTarefas();
  }, [projetos, unidadeSelecionada]);

  // Agrupar eventos por data
  const eventosPorData = useMemo(() => {
    const map = new Map<string, EventoCalendario[]>();
    for (const evento of eventos) {
      const key = evento.data;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(evento);
    }
    return map;
  }, [eventos]);

  // Dias do mês atual
  const diasDoMes = useMemo(() => {
    return getDiasDoMes(mesAtual.ano, mesAtual.mes);
  }, [mesAtual]);

  // Verificar se é hoje
  const hoje = new Date();
  const hojeKey = formatarDataKey(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  // Navegação
  const irParaMesAnterior = () => {
    setMesAtual(prev => {
      if (prev.mes === 0) {
        return { ano: prev.ano - 1, mes: 11 };
      }
      return { ...prev, mes: prev.mes - 1 };
    });
    setDiaSelecionado(null);
  };

  const irParaProximoMes = () => {
    setMesAtual(prev => {
      if (prev.mes === 11) {
        return { ano: prev.ano + 1, mes: 0 };
      }
      return { ...prev, mes: prev.mes + 1 };
    });
    setDiaSelecionado(null);
  };

  const irParaHoje = () => {
    const hoje = new Date();
    setMesAtual({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
    setDiaSelecionado(hojeKey);
  };

  // Eventos do dia selecionado
  const eventosDodia = diaSelecionado ? eventosPorData.get(diaSelecionado) || [] : [];

  const loading = loadingProjetos || loadingEventos;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendário */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          {/* Header do Calendário */}
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
            <h2 className="text-lg font-semibold text-white">
              {getNomeMes(mesAtual.mes)} {mesAtual.ano}
            </h2>
            <div className="w-24" /> {/* Spacer para centralizar o título */}
          </div>

          {/* Dias da Semana */}
          <div className="grid grid-cols-7 border-b border-slate-800">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia) => (
              <div key={dia} className="p-2 text-center text-xs font-medium text-slate-500 bg-slate-800/30">
                {dia}
              </div>
            ))}
          </div>

          {/* Grid de Dias */}
          <div className="grid grid-cols-7">
            {diasDoMes.map((dia, index) => {
              if (dia === null) {
                return <div key={`empty-${index}`} className="min-h-[100px] bg-slate-900/30 border-b border-r border-slate-800/50" />;
              }

              const dataKey = formatarDataKey(mesAtual.ano, mesAtual.mes, dia);
              const eventosNoDia = eventosPorData.get(dataKey) || [];
              const isHoje = dataKey === hojeKey;
              const isSelecionado = dataKey === diaSelecionado;

              return (
                <div
                  key={dia}
                  onClick={() => setDiaSelecionado(dataKey)}
                  className={`
                    min-h-[100px] p-2 border-b border-r border-slate-800/50 cursor-pointer
                    transition-colors
                    ${isHoje ? 'bg-violet-500/10' : 'hover:bg-slate-800/30'}
                    ${isSelecionado ? 'ring-2 ring-violet-500 ring-inset' : ''}
                  `}
                >
                  {/* Número do Dia */}
                  <div className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-1
                    ${isHoje ? 'bg-violet-500 text-white' : 'text-slate-300'}
                  `}>
                    {dia}
                  </div>

                  {/* Eventos do Dia (máximo 3) */}
                  <div className="space-y-1">
                    {eventosNoDia.slice(0, 3).map((evento) => (
                      <div
                        key={`${evento.tipo}-${evento.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjetoDetalhesId(evento.projetoId);
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] truncate hover:brightness-110 transition-all"
                        style={{ backgroundColor: `${evento.cor}30`, color: evento.cor }}
                        title={evento.titulo}
                      >
                        {evento.tipo === 'projeto' ? (
                          <FolderKanban className="w-2.5 h-2.5 flex-shrink-0" />
                        ) : (
                          <CheckSquare className="w-2.5 h-2.5 flex-shrink-0" />
                        )}
                        <span className="truncate">{evento.titulo}</span>
                      </div>
                    ))}
                    {eventosNoDia.length > 3 && (
                      <div className="text-[10px] text-slate-500 pl-1">
                        +{eventosNoDia.length - 3} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 p-3 border-t border-slate-800 bg-slate-800/30 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <FolderKanban className="w-3 h-3 text-violet-400" />
              <span>Prazo de Projeto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckSquare className="w-3 h-3 text-cyan-400" />
              <span>Prazo de Tarefa</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-violet-500" />
              <span>Hoje</span>
            </div>
          </div>
        </div>

        {/* Sidebar - Eventos do Dia Selecionado */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-800/30">
            <h3 className="font-semibold text-white">
              {diaSelecionado ? (
                <>
                  {new Date(diaSelecionado + 'T00:00:00').toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  })}
                </>
              ) : (
                'Selecione um dia'
              )}
            </h3>
            {diaSelecionado && (
              <p className="text-sm text-slate-400">
                {eventosDodia.length} evento{eventosDodia.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
            {!diaSelecionado ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                Clique em um dia para ver os eventos
              </div>
            ) : eventosDodia.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                Nenhum evento neste dia
              </div>
            ) : (
              eventosDodia.map((evento) => (
                <div
                  key={`${evento.tipo}-${evento.id}`}
                  onClick={() => setProjetoDetalhesId(evento.projetoId)}
                  className="p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${evento.cor}20` }}
                    >
                      {evento.tipo === 'projeto' ? (
                        <FolderKanban className="w-4 h-4" style={{ color: evento.cor }} />
                      ) : (
                        <CheckSquare className="w-4 h-4" style={{ color: evento.cor }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm">{evento.titulo}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold"
                          style={{ backgroundColor: `${evento.cor}20`, color: evento.cor }}
                        >
                          {evento.tipo === 'projeto' ? 'Projeto' : 'Tarefa'}
                        </span>
                        {evento.projetoNome && (
                          <span className="truncate">• {evento.projetoNome}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalhes do Projeto */}
      <ModalDetalhesProjeto
        isOpen={!!projetoDetalhesId}
        projetoId={projetoDetalhesId}
        onClose={() => setProjetoDetalhesId(null)}
        onSuccess={refetch}
      />
    </>
  );
}

export default CalendarioView;
