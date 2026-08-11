import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOutletContext } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface CalendarioItem {
  id: string;
  unidade_id: string;
  ano: number;
  tipo: 'recesso' | 'emenda';
  data_inicio: string;
  data_fim: string;
  nome: string;
  status: 'simulado' | 'confirmado';
  observacoes: string | null;
}

interface Feriado {
  id: string;
  data: string;
  nome: string;
  tipo: string;
  ativo: boolean;
}

interface OutletContext {
  unidadeSelecionada: string | null;
}

/**
 * Página do Calendário Escolar — cadastro de feriados, recessos e emendas.
 * O motor de projeção usa esse calendário para calcular as datas do contrato.
 */
export function CalendarioEscolar() {
  const context = useOutletContext<OutletContext | undefined>();
  const unidadeId = context?.unidadeSelecionada;

  const [mesAtual, setMesAtual] = useState(new Date());
  const [itens, setItens] = useState<CalendarioItem[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState<Date | null>(null);

  // Form do novo item
  const [novoTipo, setNovoTipo] = useState<'recesso' | 'emenda'>('recesso');
  const [novoNome, setNovoNome] = useState('');
  const [novoDataInicio, setNovoDataInicio] = useState('');
  const [novoDataFim, setNovoDataFim] = useState('');
  const [novoStatus, setNovoStatus] = useState<'simulado' | 'confirmado'>('confirmado');

  const carregar = useCallback(async () => {
    if (!unidadeId) return;
    setCarregando(true);
    try {
      const [itensRes, feriadosRes] = await Promise.all([
        supabase
          .from('calendario_escolar')
          .select('*')
          .eq('unidade_id', unidadeId)
          .order('data_inicio'),
        supabase
          .from('feriados')
          .select('*')
          .eq('ativo', true)
          .order('data'),
      ]);
      setItens(itensRes.data ?? []);
      setFeriados(feriadosRes.data ?? []);
    } catch (e) {
      toast.error('Erro ao carregar calendário', { description: String(e) });
    } finally {
      setCarregando(false);
    }
  }, [unidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Dias do mês atual
  const diasDoMes = useMemo(() => {
    const inicio = startOfMonth(mesAtual);
    const fim = endOfMonth(mesAtual);
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [mesAtual]);

  // Mapa de data -> item do calendário
  const mapaItens = useMemo(() => {
    const mapa = new Map<string, CalendarioItem[]>();
    for (const item of itens) {
      const dias = eachDayOfInterval({ start: parseISO(item.data_inicio), end: parseISO(item.data_fim) });
      for (const dia of dias) {
        const chave = format(dia, 'yyyy-MM-dd');
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave)!.push(item);
      }
    }
    return mapa;
  }, [itens]);

  // Mapa de data -> feriado
  const mapaFeriados = useMemo(() => {
    const mapa = new Map<string, Feriado>();
    for (const f of feriados) {
      mapa.set(f.data, f);
    }
    return mapa;
  }, [feriados]);

  function corDoDia(dia: Date): string {
    const chave = format(dia, 'yyyy-MM-dd');
    const itensDoDia = mapaItens.get(chave);
    const feriado = mapaFeriados.get(chave);

    if (itensDoDia?.some((i) => i.tipo === 'recesso')) return 'bg-slate-600/50 text-slate-400';
    if (itensDoDia?.some((i) => i.tipo === 'emenda')) return 'bg-amber-500/30 text-amber-300';
    if (feriado) return 'bg-rose-500/30 text-rose-300';
    if (isToday(dia)) return 'bg-emerald-500/30 text-emerald-300 font-bold';
    return 'bg-slate-800/30 text-slate-300 hover:bg-slate-700/50';
  }

  function descricaoDoDia(dia: Date): string {
    const chave = format(dia, 'yyyy-MM-dd');
    const itensDoDia = mapaItens.get(chave);
    const feriado = mapaFeriados.get(chave);

    if (itensDoDia?.some((i) => i.tipo === 'recesso')) return `Recesso: ${itensDoDia[0].nome}`;
    if (itensDoDia?.some((i) => i.tipo === 'emenda')) return `Emenda: ${itensDoDia[0].nome}`;
    if (feriado) return `Feriado: ${feriado.nome}`;
    return '';
  }

  async function salvarItem() {
    if (!unidadeId || !novoNome || !novoDataInicio || !novoDataFim) return;
    try {
      const { error } = await supabase.from('calendario_escolar').insert({
        unidade_id: unidadeId,
        ano: parseISO(novoDataInicio).getFullYear(),
        tipo: novoTipo,
        data_inicio: novoDataInicio,
        data_fim: novoDataFim,
        nome: novoNome,
        status: novoStatus,
      });
      if (error) throw error;
      toast.success('Item adicionado ao calendário');
      setModalAberto(false);
      setNovoNome('');
      setNovoDataInicio('');
      setNovoDataFim('');
      carregar();
    } catch (e) {
      toast.error('Erro ao salvar', { description: String(e) });
    }
  }

  async function removerItem(id: string) {
    try {
      const { error } = await supabase.from('calendario_escolar').delete().eq('id', id);
      if (error) throw error;
      toast.success('Item removido');
      carregar();
    } catch (e) {
      toast.error('Erro ao remover', { description: String(e) });
    }
  }

  if (!unidadeId) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 p-12 text-center">
        <Calendar className="mx-auto mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">Selecione uma unidade para ver o calendário.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-grotesk text-lg font-bold text-white">Calendário Escolar</h2>
          <p className="text-xs text-slate-500">Cadastre feriados, recessos e emendas. O motor usa isso para projetar os contratos.</p>
        </div>
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>

      {/* Navegação do mês */}
      <div className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2">
        <button
          type="button"
          onClick={() => setMesAtual(addMonths(mesAtual, -1))}
          className="grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-slate-300 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-white capitalize">
          {format(mesAtual, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <button
          type="button"
          onClick={() => setMesAtual(addMonths(mesAtual, 1))}
          className="grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-slate-300 hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-500/30" /> Feriado</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-slate-600/50" /> Recesso</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-500/30" /> Emenda</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500/30" /> Hoje</span>
      </div>

      {/* Calendário */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
        {/* Dias da semana */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((dia) => (
            <span key={dia} className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {dia}
            </span>
          ))}
        </div>

        {/* Dias do mês */}
        <div className="grid grid-cols-7 gap-1">
          {/* Espaço para alinhar o primeiro dia */}
          {Array.from({ length: (diasDoMes[0]?.getDay() + 6) % 7 }).map((_, i) => (
            <span key={`vazio-${i}`} className="h-9" />
          ))}

          {diasDoMes.map((dia) => {
            const chave = format(dia, 'yyyy-MM-dd');
            const descricao = descricaoDoDia(dia);
            return (
              <button
                key={chave}
                type="button"
                onClick={() => {
                  setDataSelecionada(dia);
                  setNovoDataInicio(chave);
                  setNovoDataFim(chave);
                  setModalAberto(true);
                }}
                title={descricao || format(dia, 'dd/MM/yyyy')}
                className={cn(
                  'flex h-9 flex-col items-center justify-center rounded-lg text-xs transition-colors',
                  corDoDia(dia),
                  isToday(dia) && 'ring-2 ring-emerald-500',
                )}
              >
                <span>{format(dia, 'd')}</span>
                {descricao && (
                  <span className="text-[8px] opacity-70">{descricao.split(':')[0]}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de itens */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Itens do calendário ({itens.length})
        </h3>
        {itens.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">
            Nenhum recesso ou emenda cadastrado. Adicione para o motor projetar corretamente.
          </p>
        ) : (
          <div className="space-y-2">
            {itens.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-slate-200">{item.nome}</p>
                  <p className="text-[10px] text-slate-500">
                    {item.tipo === 'recesso' ? 'Recesso' : 'Emenda'} · {format(parseISO(item.data_inicio), 'dd/MM')} a {format(parseISO(item.data_fim), 'dd/MM/yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                    item.status === 'confirmado' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300',
                  )}>
                    {item.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerItem(item.id)}
                    className="rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de novo item */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">Adicionar ao calendário</h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Tipo</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNovoTipo('recesso')}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-semibold',
                      novoTipo === 'recesso'
                        ? 'border-slate-500 bg-slate-700 text-white'
                        : 'border-slate-700 text-slate-400 hover:text-slate-200',
                    )}
                  >
                    Recesso
                  </button>
                  <button
                    type="button"
                    onClick={() => setNovoTipo('emenda')}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-semibold',
                      novoTipo === 'emenda'
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                        : 'border-slate-700 text-slate-400 hover:text-slate-200',
                    )}
                  >
                    Emenda
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Nome</label>
                <input
                  type="text"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Recesso de julho"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Início</label>
                  <input
                    type="date"
                    value={novoDataInicio}
                    onChange={(e) => setNovoDataInicio(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Fim</label>
                  <input
                    type="date"
                    value={novoDataFim}
                    onChange={(e) => setNovoDataFim(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNovoStatus('confirmado')}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-semibold',
                      novoStatus === 'confirmado'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-700 text-slate-400 hover:text-slate-200',
                    )}
                  >
                    Confirmado
                  </button>
                  <button
                    type="button"
                    onClick={() => setNovoStatus('simulado')}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-semibold',
                      novoStatus === 'simulado'
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                        : 'border-slate-700 text-slate-400 hover:text-slate-200',
                    )}
                  >
                    Simulado
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Simulado é para testar o impacto antes de confirmar.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarItem}
                className="flex-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
