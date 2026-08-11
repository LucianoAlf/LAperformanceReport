import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, parseISO, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, CalendarX, CalendarClock, Users, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOutletContext } from 'react-router-dom';
import { DatePicker } from '@/components/ui/date-picker';
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

interface WatchlistItem {
  aluno_id: number;
  aluno_nome: string;
  dia_semana: string;
  aulas_restantes: number;
  ultima_aula_projetada: string;
  ultima_parcela: string;
  delta_dias: number;
  status_alerta: 'estourando' | 'sem_margem' | 'janela_renovacao';
}

/**
 * Página do Calendário Inteligente — cadastro de feriados, recessos e emendas.
 * O motor de projeção usa esse calendário para calcular as datas do contrato.
 */
export function CalendarioEscolar() {
  const context = useOutletContext<OutletContext | undefined>();
  const unidadeId = context?.unidadeSelecionada;
  const consolidado = !unidadeId;

  const [anoAtual, setAnoAtual] = useState(new Date().getFullYear());
  const [itens, setItens] = useState<CalendarioItem[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // Form do novo item
  const [novoTipo, setNovoTipo] = useState<'recesso' | 'emenda'>('recesso');
  const [novoNome, setNovoNome] = useState('');
  const [novoDataInicio, setNovoDataInicio] = useState<Date | undefined>(undefined);
  const [novoDataFim, setNovoDataFim] = useState<Date | undefined>(undefined);
  const [novoStatus, setNovoStatus] = useState<'simulado' | 'confirmado'>('confirmado');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // Em modo consolidado, busca de todas as unidades
      const queryItens = supabase
        .from('calendario_escolar')
        .select('*')
        .eq('ano', anoAtual)
        .order('data_inicio');

      const queryFeriados = supabase
        .from('feriados')
        .select('*')
        .eq('ativo', true)
        .gte('data', `${anoAtual}-01-01`)
        .lte('data', `${anoAtual}-12-31`)
        .order('data');

      // Se nao e consolidado, filtra por unidade
      const [itensRes, feriadosRes] = await Promise.all([
        consolidado ? queryItens : queryItens.eq('unidade_id', unidadeId),
        queryFeriados,
      ]);
      setItens(itensRes.data ?? []);
      setFeriados(feriadosRes.data ?? []);

      // Watchlist: contratos que estouram ou estão sem margem
      // Em modo consolidado, busca de todas as unidades
      const queryProjecoes = supabase
        .from('projecao_aulas')
        .select('aluno_id, matricula_disciplina_id, data_projetada, sequencia')
        .eq('status', 'projetada')
        .order('data_projetada', { ascending: false });

      const { data: projecoes } = consolidado
        ? await queryProjecoes
        : await queryProjecoes.eq('unidade_id', unidadeId);

      if (projecoes) {
        // Agrupa por contrato e pega a última aula projetada
        const porContrato = new Map<string, { aluno_id: number; ultima: string; total: number }>();
        for (const p of projecoes) {
          const chave = `${p.aluno_id}-${p.matricula_disciplina_id}`;
          const existente = porContrato.get(chave);
          if (!existente || p.data_projetada > existente.ultima) {
            porContrato.set(chave, { aluno_id: p.aluno_id, ultima: p.data_projetada, total: p.sequencia });
          }
        }

        // Busca os alunos
        const alunoIds = [...new Set([...porContrato.values()].map((p) => p.aluno_id))];
        const { data: alunos } = await supabase
          .from('alunos')
          .select('id, nome')
          .in('id', alunoIds);

        const nomes = new Map(alunos?.map((a) => [a.id, a.nome]) ?? []);

        // Monta a watchlist
        const lista: WatchlistItem[] = [];
        for (const [chave, p] of porContrato) {
          const [alunoId] = chave.split('-');
          const ultimaProjetada = parseISO(p.ultima);
          const hoje = new Date();
          const deltaDias = Math.ceil((ultimaProjetada.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

          // Status: estourando se a última aula já passou, sem margem se falta menos de 30 dias
          let status: WatchlistItem['status_alerta'] = 'janela_renovacao';
          if (deltaDias < 0) status = 'estourando';
          else if (deltaDias < 30) status = 'sem_margem';

          lista.push({
            aluno_id: p.aluno_id,
            aluno_nome: nomes.get(Number(alunoId)) ?? 'Aluno',
            dia_semana: '', // TODO: buscar da jornada
            aulas_restantes: p.total,
            ultima_aula_projetada: p.ultima,
            ultima_parcela: '', // TODO: calcular
            delta_dias: deltaDias,
            status_alerta: status,
          });
        }

        setWatchlist(lista.sort((a, b) => a.delta_dias - b.delta_dias).slice(0, 10));
      }
    } catch (e) {
      toast.error('Erro ao carregar calendário', { description: String(e) });
    } finally {
      setCarregando(false);
    }
  }, [unidadeId, anoAtual]);

  useEffect(() => { carregar(); }, [carregar]);

  // Dias do ano atual
  const diasDoAno = useMemo(() => {
    const inicio = startOfYear(new Date(anoAtual, 0, 1));
    const fim = endOfYear(new Date(anoAtual, 11, 31));
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [anoAtual]);

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

  // Banco de segurança por dia da semana
  const bancoPorDia = useMemo(() => {
    const diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const banco: Record<string, { total: number; comAula: number }> = {};

    for (const dia of diasSemana) {
      banco[dia] = { total: 0, comAula: 0 };
    }

    for (const dia of diasDoAno) {
      const diaSemana = format(dia, 'EEEE', { locale: ptBR });
      const chave = format(dia, 'yyyy-MM-dd');
      const temFeriado = mapaFeriados.has(chave);
      const temRecesso = mapaItens.get(chave)?.some((i) => i.tipo === 'recesso');
      const temEmenda = mapaItens.get(chave)?.some((i) => i.tipo === 'emenda');

      if (diasSemana.includes(diaSemana)) {
        banco[diaSemana].total++;
        if (!temFeriado && !temRecesso && !temEmenda) {
          banco[diaSemana].comAula++;
        }
      }
    }

    return diasSemana.map((dia) => ({
      dia,
      total: banco[dia].total,
      comAula: banco[dia].comAula,
      banco: banco[dia].comAula - 40, // 40 aulas do pacote
    }));
  }, [diasDoAno, mapaFeriados, mapaItens]);

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

  async function salvarItem() {
    if (!unidadeId || !novoNome || !novoDataInicio || !novoDataFim) return;
    try {
      const { error } = await supabase.from('calendario_escolar').insert({
        unidade_id: unidadeId,
        ano: novoDataInicio.getFullYear(),
        tipo: novoTipo,
        data_inicio: format(novoDataInicio, 'yyyy-MM-dd'),
        data_fim: format(novoDataFim, 'yyyy-MM-dd'),
        nome: novoNome,
        status: novoStatus,
      });
      if (error) throw error;
      toast.success('Item adicionado ao calendário');
      setModalAberto(false);
      setNovoNome('');
      setNovoDataInicio(undefined);
      setNovoDataFim(undefined);
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

  if (carregando) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 p-12 text-center">
        <Calendar className="mx-auto mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">Carregando calendário…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-grotesk text-lg font-bold text-white">Calendário Inteligente</h2>
          <p className="text-xs text-slate-500">Ano letivo {anoAtual} · O motor usa isso para projetar os contratos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <p className="text-xs font-medium text-slate-400">Aulas no ano</p>
          <p className="mt-1 text-2xl font-bold text-white">40</p>
          <p className="mt-1 text-xs text-slate-500">pacote padrão</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <p className="text-xs font-medium text-slate-400">Feriados</p>
          <p className="mt-1 text-2xl font-bold text-rose-400">{feriados.length}</p>
          <p className="mt-1 text-xs text-slate-500">nacionais + RJ</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <p className="text-xs font-medium text-slate-400">Recessos</p>
          <p className="mt-1 text-2xl font-bold text-slate-300">{itens.filter((i) => i.tipo === 'recesso').length}</p>
          <p className="mt-1 text-xs text-slate-500">confirmados</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <p className="text-xs font-medium text-slate-400">Emendas</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{itens.filter((i) => i.tipo === 'emenda').length}</p>
          <p className="mt-1 text-xs text-slate-500">confirmadas</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <p className="text-xs font-medium text-slate-400">Melhor dia</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">
            {bancoPorDia.reduce((a, b) => (a.banco > b.banco ? a : b)).dia.slice(0, 3)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            +{bancoPorDia.reduce((a, b) => (a.banco > b.banco ? a : b)).banco} de banco
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <p className="text-xs font-medium text-slate-400">Pior dia</p>
          <p className="mt-1 text-2xl font-bold text-rose-400">
            {bancoPorDia.reduce((a, b) => (a.banco < b.banco ? a : b)).dia.slice(0, 3)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            +{bancoPorDia.reduce((a, b) => (a.banco < b.banco ? a : b)).banco} de banco
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <p className="text-xs font-medium text-slate-400">Contratos ativos</p>
          <p className="mt-1 text-2xl font-bold text-white">{watchlist.length}</p>
          <p className="mt-1 text-xs text-slate-500">projetados</p>
        </div>
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coluna 1: Calendário do ano */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-grotesk text-lg font-bold text-white">Ano letivo {anoAtual}</h3>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-cyan-500/30" /> Aula</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-500/30" /> Feriado</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-slate-600/50" /> Recesso</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-500/30" /> Emenda</span>
              </div>
            </div>

            {/* Navegação do ano */}
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAnoAtual(anoAtual - 1)}
                className="grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-slate-300 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-white">{anoAtual}</span>
              <button
                type="button"
                onClick={() => setAnoAtual(anoAtual + 1)}
                className="grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-slate-300 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Dias da semana */}
            <div className="mb-2 grid grid-cols-7 gap-1">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((dia) => (
                <span key={dia} className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {dia}
                </span>
              ))}
            </div>

            {/* Dias do ano — agrupados por mês */}
            <div className="space-y-4">
              {Array.from({ length: 12 }, (_, mes) => {
                const inicioMes = startOfMonth(new Date(anoAtual, mes, 1));
                const fimMes = endOfMonth(new Date(anoAtual, mes, 1));
                const diasMes = eachDayOfInterval({ start: inicioMes, end: fimMes });

                return (
                  <div key={mes}>
                    <p className="mb-2 text-xs font-semibold text-slate-400 capitalize">
                      {format(inicioMes, 'MMMM', { locale: ptBR })}
                    </p>
                    <div className="grid grid-cols-7 gap-1">
                      {/* Espaço para alinhar o primeiro dia */}
                      {Array.from({ length: (diasMes[0]?.getDay() + 6) % 7 }).map((_, i) => (
                        <span key={`vazio-${mes}-${i}`} className="h-8" />
                      ))}

                      {diasMes.map((dia) => {
                        const chave = format(dia, 'yyyy-MM-dd');
                        return (
                          <button
                            key={chave}
                            type="button"
                            onClick={() => {
                              setNovoDataInicio(dia);
                              setNovoDataFim(dia);
                              setModalAberto(true);
                            }}
                            title={format(dia, 'dd/MM/yyyy')}
                            className={cn(
                              'flex h-8 items-center justify-center rounded-lg text-xs transition-colors',
                              corDoDia(dia),
                              isToday(dia) && 'ring-2 ring-emerald-500',
                            )}
                          >
                            {format(dia, 'd')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Banco de segurança por dia */}
            <div className="mt-6 border-t border-slate-700/50 pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Banco de segurança por dia</h3>
              <div className="space-y-2">
                {bancoPorDia.map(({ dia, total, comAula, banco }) => (
                  <div key={dia} className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{dia}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 rounded-full bg-slate-700">
                        <div
                          className={cn(
                            'h-2 rounded-full',
                            banco >= 2 ? 'bg-emerald-500' : banco >= 0 ? 'bg-cyan-500' : 'bg-rose-500',
                          )}
                          style={{ width: `${Math.min(100, Math.max(0, (banco / 4) * 100))}%` }}
                        />
                      </div>
                      <span className={cn(
                        'text-xs font-bold',
                        banco >= 2 ? 'text-emerald-400' : banco >= 0 ? 'text-cyan-400' : 'text-rose-400',
                      )}>
                        {banco >= 0 ? `+${banco}` : banco}
                      </span>
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                        banco >= 2 ? 'bg-emerald-500/20 text-emerald-300' : banco >= 0 ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300',
                      )}>
                        {banco >= 2 ? 'ideal' : banco >= 0 ? 'justo' : 'excesso'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coluna 2: Painel lateral */}
        <div className="space-y-4">
          {/* Feriados */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Feriados {anoAtual}</h3>
            <div className="space-y-2">
              {feriados.slice(0, 5).map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-slate-200">{f.nome}</p>
                    <p className="text-[10px] text-slate-500">{format(parseISO(f.data), 'dd/MM')}</p>
                  </div>
                  <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-300">
                    {f.tipo}
                  </span>
                </div>
              ))}
              {feriados.length > 5 && (
                <p className="pt-2 text-center text-xs text-cyan-400">
                  Ver todos os {feriados.length} feriados
                </p>
              )}
            </div>
          </div>

          {/* Recessos */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Recessos {anoAtual}</h3>
            <div className="space-y-2">
              {itens.filter((i) => i.tipo === 'recesso').map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-200">{item.nome}</p>
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                      item.status === 'confirmado' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300',
                    )}>
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {format(parseISO(item.data_inicio), 'dd/MM')} a {format(parseISO(item.data_fim), 'dd/MM/yyyy')}
                  </p>
                </div>
              ))}
              {itens.filter((i) => i.tipo === 'recesso').length === 0 && (
                <p className="py-2 text-center text-xs text-slate-500">Nenhum recesso cadastrado</p>
              )}
            </div>
          </div>

          {/* Emendas */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Emendas</h3>
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/20 p-4 text-center">
              <p className="text-xs text-slate-500">Nenhuma emenda confirmada</p>
              <button
                type="button"
                onClick={() => setModalAberto(true)}
                className="mt-2 w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
              >
                Simular emenda
              </button>
            </div>
          </div>

          {/* Alertas */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-400">Alertas</h3>
            <div className="space-y-2">
              {bancoPorDia.filter((b) => b.banco < 0).map((b) => (
                <div key={b.dia} className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-xs font-medium text-amber-200">{b.dia} tem banco de {b.banco}</p>
                    <p className="text-[10px] text-amber-300/70">Reposição liberada só com atestado</p>
                  </div>
                </div>
              ))}
              {watchlist.filter((w) => w.status_alerta === 'estourando').length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-xs font-medium text-amber-200">
                      {watchlist.filter((w) => w.status_alerta === 'estourando').length} contratos estouram em janeiro
                    </p>
                    <p className="text-[10px] text-amber-300/70">Ver watchlist para detalhes</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Watchlist */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-grotesk text-lg font-bold text-white">Alunos que precisam de olhar</h3>
          <span className="text-xs text-slate-500">Atualizado agora</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-700/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Aluno</th>
                <th className="px-4 py-2 font-semibold">Dia</th>
                <th className="px-4 py-2 font-semibold">Aulas</th>
                <th className="px-4 py-2 font-semibold">Última aula</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {watchlist.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nenhum aluno precisa de atenção agora. O motor está de olho.
                  </td>
                </tr>
              ) : (
                watchlist.map((w) => (
                  <tr key={w.aluno_id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-200">{w.aluno_nome}</td>
                    <td className="px-4 py-3 text-slate-400">{w.dia_semana}</td>
                    <td className="px-4 py-3 text-slate-400">{w.aulas_restantes}/40</td>
                    <td className="px-4 py-3 text-slate-400">{format(parseISO(w.ultima_aula_projetada), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                        w.status_alerta === 'estourando' && 'bg-rose-500/20 text-rose-300',
                        w.status_alerta === 'sem_margem' && 'bg-amber-500/20 text-amber-300',
                        w.status_alerta === 'janela_renovacao' && 'bg-emerald-500/20 text-emerald-300',
                      )}>
                        {w.status_alerta === 'estourando' ? 'estourando' : w.status_alerta === 'sem_margem' ? 'sem margem' : 'janela de renovação'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-500/20">
                        {w.status_alerta === 'estourando' ? 'Agendar reposição' : w.status_alerta === 'sem_margem' ? 'Acompanhar' : 'Chamar para renovar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                  <DatePicker
                    date={novoDataInicio}
                    onDateChange={setNovoDataInicio}
                    placeholder="Selecione"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Fim</label>
                  <DatePicker
                    date={novoDataFim}
                    onDateChange={setNovoDataFim}
                    placeholder="Selecione"
                    className="w-full"
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
