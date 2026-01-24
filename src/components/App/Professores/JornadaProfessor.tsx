import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format, differenceInDays, addMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Target, CheckCircle2, Clock, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';

interface Meta {
  id: string;
  professor_id: number;
  tipo: string;
  valor_atual: number | null;
  valor_meta: number;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  observacoes: string | null;
}

interface Acao {
  id: string;
  tipo: string;
  titulo: string;
  data_agendada: string;
  status: string;
}

interface Checkpoint {
  data: string;
  valor_esperado: number;
  valor_real: number | null;
  status: 'pendente' | 'atingido' | 'nao_atingido';
}

interface Props {
  professorId: number;
  professorNome: string;
  metaAtiva?: Meta;
  acoes?: Acao[];
}

export function JornadaProfessor({ professorId, professorNome, metaAtiva, acoes = [] }: Props) {
  const [meta, setMeta] = useState<Meta | null>(metaAtiva || null);
  const [acoesRelacionadas, setAcoesRelacionadas] = useState<Acao[]>(acoes);
  const [loading, setLoading] = useState(!metaAtiva);

  useEffect(() => {
    if (!metaAtiva) {
      carregarDados();
    }
  }, [professorId, metaAtiva]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Buscar meta ativa mais recente
      const { data: metasData } = await supabase
        .from('professor_metas')
        .select('*')
        .eq('professor_id', professorId)
        .eq('status', 'em_andamento')
        .order('created_at', { ascending: false })
        .limit(1);

      if (metasData && metasData.length > 0) {
        setMeta(metasData[0]);

        // Buscar ações relacionadas à meta
        const { data: acoesData } = await supabase
          .from('professor_acoes')
          .select('id, tipo, titulo, data_agendada, status')
          .eq('professor_id', professorId)
          .order('data_agendada', { ascending: true });

        setAcoesRelacionadas(acoesData || []);
      }
    } catch (error) {
      console.error('Erro ao carregar jornada:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
        <div className="h-32 bg-slate-700/50 rounded"></div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white">Jornada: {professorNome}</h3>
        </div>
        <div className="text-center py-8">
          <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Nenhuma meta ativa para este professor</p>
          <p className="text-slate-500 text-sm mt-1">Crie uma meta para acompanhar a jornada de desenvolvimento</p>
        </div>
      </div>
    );
  }

  // Calcular checkpoints intermediários
  const dataInicio = parseISO(meta.data_inicio);
  const dataFim = meta.data_fim ? parseISO(meta.data_fim) : addMonths(dataInicio, 3);
  const diasTotal = differenceInDays(dataFim, dataInicio);
  const diasPassados = differenceInDays(new Date(), dataInicio);
  const progresso = Math.min(100, Math.max(0, (diasPassados / diasTotal) * 100));

  // Gerar checkpoints (início, meio, fim)
  const valorInicial = meta.valor_atual || 0;
  const valorFinal = meta.valor_meta;
  const incremento = (valorFinal - valorInicial) / 3;

  const checkpoints: Checkpoint[] = [
    {
      data: meta.data_inicio,
      valor_esperado: valorInicial,
      valor_real: valorInicial,
      status: 'atingido'
    },
    {
      data: format(addMonths(dataInicio, 1), 'yyyy-MM-dd'),
      valor_esperado: Math.round((valorInicial + incremento) * 100) / 100,
      valor_real: null,
      status: diasPassados > 30 ? 'pendente' : 'pendente'
    },
    {
      data: format(addMonths(dataInicio, 2), 'yyyy-MM-dd'),
      valor_esperado: Math.round((valorInicial + incremento * 2) * 100) / 100,
      valor_real: null,
      status: 'pendente'
    },
    {
      data: meta.data_fim || format(addMonths(dataInicio, 3), 'yyyy-MM-dd'),
      valor_esperado: valorFinal,
      valor_real: null,
      status: 'pendente'
    }
  ];

  // Filtrar ações concluídas
  const acoesConcluidas = acoesRelacionadas.filter(a => a.status === 'concluida');

  const getTipoMetaLabel = (tipo: string) => {
    switch (tipo) {
      case 'media_turma': return 'Média de Alunos por Turma';
      case 'retencao': return 'Taxa de Retenção';
      case 'conversao': return 'Taxa de Conversão';
      case 'nps': return 'NPS';
      case 'presenca': return 'Taxa de Presença';
      default: return tipo;
    }
  };

  const getValorFormatado = (valor: number, tipo: string) => {
    if (tipo === 'media_turma' || tipo === 'nps') {
      return valor.toFixed(1);
    }
    return `${valor.toFixed(0)}%`;
  };

  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl p-6 border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white">📈 Jornada: {professorNome}</h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          meta.status === 'em_andamento' 
            ? 'bg-blue-500/20 text-blue-400' 
            : meta.status === 'concluida' 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-slate-500/20 text-slate-400'
        }`}>
          {meta.status === 'em_andamento' ? 'Em andamento' : meta.status === 'concluida' ? 'Concluída' : meta.status}
        </span>
      </div>

      {/* Meta Info */}
      <div className="mb-6 p-4 bg-slate-800/50 rounded-xl">
        <p className="text-slate-400 text-sm mb-1">{getTipoMetaLabel(meta.tipo)}</p>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold text-white">
            {getValorFormatado(meta.valor_atual || 0, meta.tipo)}
          </span>
          <span className="text-slate-400">→</span>
          <span className="text-2xl font-bold text-green-400">
            {getValorFormatado(meta.valor_meta, meta.tipo)}
          </span>
          {meta.data_fim && (
            <span className="text-slate-400 text-sm ml-auto">
              Prazo: {format(parseISO(meta.data_fim), "MMM/yyyy", { locale: ptBR })}
            </span>
          )}
        </div>
      </div>

      {/* Timeline Visual */}
      <div className="mb-6">
        <div className="relative">
          {/* Linha de progresso */}
          <div className="absolute top-4 left-0 right-0 h-1 bg-slate-700 rounded-full">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${progresso}%` }}
            />
          </div>

          {/* Checkpoints */}
          <div className="relative flex justify-between">
            {checkpoints.map((cp, idx) => {
              const isAtual = idx === 0 || (diasPassados >= (idx * 30) && diasPassados < ((idx + 1) * 30));
              const isPast = diasPassados >= ((idx + 1) * 30);
              
              return (
                <div key={idx} className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                    cp.status === 'atingido' 
                      ? 'bg-green-500 text-white' 
                      : isPast 
                        ? 'bg-yellow-500 text-white'
                        : isAtual 
                          ? 'bg-blue-500 text-white ring-4 ring-blue-500/30' 
                          : 'bg-slate-700 text-slate-400'
                  }`}>
                    {cp.status === 'atingido' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isPast ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-xs text-slate-400">
                      {format(parseISO(cp.data), "MMM/yy", { locale: ptBR })}
                    </p>
                    <p className={`text-sm font-medium ${
                      idx === 0 ? 'text-slate-300' : 
                      idx === checkpoints.length - 1 ? 'text-green-400' : 
                      'text-slate-400'
                    }`}>
                      {idx === 0 ? 'Início' : idx === checkpoints.length - 1 ? 'Meta' : `Check ${idx}`}
                    </p>
                    <p className={`text-xs ${
                      cp.valor_real !== null ? 'text-white' : 'text-slate-500'
                    }`}>
                      {cp.valor_real !== null 
                        ? getValorFormatado(cp.valor_real, meta.tipo)
                        : getValorFormatado(cp.valor_esperado, meta.tipo) + '?'
                      }
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Barra de progresso com valores */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-slate-400">
            [Atual: {getValorFormatado(meta.valor_atual || 0, meta.tipo)}]
          </span>
          <span className="text-slate-400">
            {Math.round(progresso)}% do tempo
          </span>
          <span className="text-green-400">
            [Meta: {getValorFormatado(meta.valor_meta, meta.tipo)}]
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-3">
          <div 
            className="bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 h-3 rounded-full transition-all duration-500 relative"
            style={{ width: `${progresso}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-blue-500" />
          </div>
        </div>
      </div>

      {/* Ações Realizadas */}
      {acoesConcluidas.length > 0 && (
        <div>
          <p className="text-sm text-slate-400 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Ações realizadas:
          </p>
          <div className="space-y-2">
            {acoesConcluidas.slice(0, 5).map((acao) => (
              <div key={acao.id} className="flex items-center gap-2 text-sm">
                <span className="text-green-400">✅</span>
                <span className="text-slate-300">
                  {format(parseISO(acao.data_agendada), "dd/MM", { locale: ptBR })} - {acao.titulo}
                </span>
              </div>
            ))}
            {acoesConcluidas.length > 5 && (
              <p className="text-slate-500 text-xs ml-6">
                + {acoesConcluidas.length - 5} outras ações
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dias restantes */}
      {meta.data_fim && (
        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between">
          <span className="text-slate-400 text-sm">
            {differenceInDays(parseISO(meta.data_fim), new Date())} dias restantes
          </span>
          <span className={`text-sm font-medium ${
            progresso > 75 ? 'text-yellow-400' : 'text-slate-400'
          }`}>
            {progresso > 75 ? '⚠️ Reta final!' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
