import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Database, Users, Clock, Filter, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  calcularTempoPermanenciaMovimentacao,
  valorPerdidoMovimentacao,
  type MovimentacaoRetencaoRow,
} from '@/lib/retencaoOperacionalCanonica';

interface ExAlunoRow {
  nome: string;
  tempo_permanencia_meses: number;
  fonte: 'historico' | 'sistema';
  categoria_saida?: string;
  mes_saida?: string;
  valor_parcela?: number;
  ltv_individual?: number;
}

interface ModalPermanenciaDetalheProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: string;
  mediaAtual: number;
  modo?: 'permanencia' | 'ltv_evasoes';
  movimentacoesEvasao?: MovimentacaoRetencaoRow[];
}

export function ModalPermanenciaDetalhe({
  open,
  onOpenChange,
  unidadeId,
  mediaAtual,
  modo = 'permanencia',
  movimentacoesEvasao = [],
}: ModalPermanenciaDetalheProps) {
  const [loading, setLoading] = useState(false);
  const [dados, setDados] = useState<ExAlunoRow[]>([]);
  const [filtroFonte, setFiltroFonte] = useState<'todos' | 'historico' | 'sistema'>('todos');
  const [ordenacao, setOrdenacao] = useState<'meses_desc' | 'meses_asc' | 'nome'>('meses_desc');
  const isLtvEvasoes = modo === 'ltv_evasoes';

  useEffect(() => {
    if (open && unidadeId) {
      carregarDados();
    }
  }, [open, unidadeId, modo, movimentacoesEvasao]);

  async function carregarDados() {
    setLoading(true);
    try {
      if (isLtvEvasoes) {
        const linhas: ExAlunoRow[] = movimentacoesEvasao.map((mov: MovimentacaoRetencaoRow) => {
          const meses = calcularTempoPermanenciaMovimentacao(mov);
          const valorParcela = valorPerdidoMovimentacao(mov);

          return {
            nome: mov.aluno_nome || 'Aluno sem nome',
            tempo_permanencia_meses: meses,
            fonte: 'sistema',
            categoria_saida: mov.tipo === 'nao_renovacao'
              ? 'Nao renovou'
              : (mov.tipo_evasao || mov.motivo || 'Interrompido'),
            mes_saida: mov.data || mov.mes_saida || undefined,
            valor_parcela: valorParcela,
            ltv_individual: valorParcela * meses,
          };
        });

        setDados(linhas);
        return;
      }

      // RPC historica de permanencia: tempo>=4, exclui bolsistas/banda e exige saida real.
      const { data, error } = await supabase.rpc('get_historico_ltv', {
        p_unidade_id: unidadeId && unidadeId !== 'todos' ? unidadeId : null,
      });
      if (error) throw error;

      const linhas: ExAlunoRow[] = (data || []).map((r: any) => ({
        nome: r.nome,
        tempo_permanencia_meses: Number(r.tempo_meses),
        fonte: r.fonte as 'historico' | 'sistema',
        categoria_saida: r.categoria_saida || undefined,
        mes_saida: r.mes_saida || undefined,
      }));

      setDados(linhas);
    } catch (err) {
      console.error('Erro ao carregar detalhes de permanencia:', err);
    } finally {
      setLoading(false);
    }
  }

  const dadosFiltrados = isLtvEvasoes
    ? dados
    : dados.filter(d => filtroFonte === 'todos' || d.fonte === filtroFonte);

  const dadosOrdenados = [...dadosFiltrados].sort((a, b) => {
    if (ordenacao === 'meses_desc') return b.tempo_permanencia_meses - a.tempo_permanencia_meses;
    if (ordenacao === 'meses_asc') return a.tempo_permanencia_meses - b.tempo_permanencia_meses;
    return a.nome.localeCompare(b.nome);
  });

  const totalHistorico = dados.filter(d => d.fonte === 'historico');
  const totalSistema = dados.filter(d => d.fonte === 'sistema');
  const mediaHistorico = totalHistorico.length > 0
    ? totalHistorico.reduce((acc, d) => acc + d.tempo_permanencia_meses, 0) / totalHistorico.length
    : 0;
  const mediaSistema = totalSistema.length > 0
    ? totalSistema.reduce((acc, d) => acc + d.tempo_permanencia_meses, 0) / totalSistema.length
    : 0;
  const mediaCombinada = dados.length > 0
    ? dados.reduce((acc, d) => acc + d.tempo_permanencia_meses, 0) / dados.length
    : 0;
  const mrrPerdido = dados.reduce((acc, d) => acc + (d.valor_parcela || 0), 0);
  const valoresPerdidosPositivos = dados
    .map(d => d.valor_parcela || 0)
    .filter(valor => valor > 0);
  const ticketMedioPerdido = valoresPerdidosPositivos.length > 0
    ? mrrPerdido / valoresPerdidosPositivos.length
    : 0;
  const ltvTotal = dados.reduce((acc, d) => acc + (d.ltv_individual || 0), 0);
  const ltvMedioIndividual = dados.length > 0 ? ltvTotal / dados.length : 0;
  const ltvMedioCard = isLtvEvasoes && mediaAtual > 0 && ticketMedioPerdido > 0
    ? mediaAtual * ticketMedioPerdido
    : ltvMedioIndividual;

  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

  const formatMeses = (value: number) => Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-h-[85vh] overflow-hidden flex flex-col bg-slate-900 border-slate-700",
        isLtvEvasoes ? "max-w-5xl" : "max-w-3xl"
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isLtvEvasoes ? (
              <DollarSign className="h-5 w-5 text-emerald-400" />
            ) : (
              <Clock className="h-5 w-5 text-cyan-400" />
            )}
            {isLtvEvasoes ? 'LTV das evasoes - detalhamento' : 'Tempo de Permanencia - detalhamento'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div
            className={cn(
              "rounded-lg p-3 border transition-colors",
              !isLtvEvasoes && "cursor-pointer",
              filtroFonte === 'todos'
                ? "bg-cyan-500/20 border-cyan-500/50"
                : "bg-slate-800 border-slate-700 hover:border-slate-600"
            )}
            onClick={() => !isLtvEvasoes && setFiltroFonte('todos')}
          >
            <p className="text-xs text-slate-400 uppercase tracking-wider">
              {isLtvEvasoes ? 'LTV medio' : 'Combinado'}
            </p>
            <p className="text-2xl font-bold text-cyan-400">
              {isLtvEvasoes ? formatCurrency(ltvMedioCard) : `${mediaCombinada.toFixed(1)}m`}
            </p>
            <p className="text-xs text-slate-500">
              {isLtvEvasoes ? `${mediaAtual.toFixed(1)}m x ${formatCurrency(ticketMedioPerdido)}` : `${dados.length} ex-alunos`}
            </p>
          </div>

          <div
            className={cn(
              "rounded-lg p-3 border transition-colors",
              !isLtvEvasoes && "cursor-pointer",
              filtroFonte === 'historico'
                ? "bg-amber-500/20 border-amber-500/50"
                : "bg-slate-800 border-slate-700 hover:border-slate-600"
            )}
            onClick={() => !isLtvEvasoes && setFiltroFonte('historico')}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Database className="h-3 w-3 text-amber-400" />
              <p className="text-xs text-slate-400 uppercase tracking-wider">
                {isLtvEvasoes ? 'MRR perdido' : 'Historico'}
              </p>
            </div>
            <p className="text-2xl font-bold text-amber-400">
              {isLtvEvasoes ? formatCurrency(mrrPerdido) : `${mediaHistorico.toFixed(1)}m`}
            </p>
            <p className="text-xs text-slate-500">
              {isLtvEvasoes ? 'soma das parcelas perdidas' : `${totalHistorico.length} ex-alunos (importados)`}
            </p>
          </div>

          <div
            className={cn(
              "rounded-lg p-3 border transition-colors",
              !isLtvEvasoes && "cursor-pointer",
              filtroFonte === 'sistema'
                ? "bg-emerald-500/20 border-emerald-500/50"
                : "bg-slate-800 border-slate-700 hover:border-slate-600"
            )}
            onClick={() => !isLtvEvasoes && setFiltroFonte('sistema')}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Users className="h-3 w-3 text-emerald-400" />
              <p className="text-xs text-slate-400 uppercase tracking-wider">
                {isLtvEvasoes ? 'Media individual' : 'Sistema'}
              </p>
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              {isLtvEvasoes ? `${mediaCombinada.toFixed(1)}m` : `${mediaSistema.toFixed(1)}m`}
            </p>
            <p className="text-xs text-slate-500">
              {isLtvEvasoes ? 'saidas listadas abaixo' : `${totalSistema.length} ex-alunos (registrados)`}
            </p>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 mb-3">
          <Filter className="h-3 w-3 inline mr-1" />
          {isLtvEvasoes ? (
            <>
              Evasoes e nao renovacoes da competencia selecionada. LTV individual = parcela perdida x meses de permanencia.
            </>
          ) : (
            <>
              Apenas ex-alunos com <strong className="text-white">4+ meses</strong> de permanencia. Bolsistas, banda e segundo curso excluidos.
              {mediaAtual !== mediaCombinada && (
                <span className="text-amber-400 ml-2">
                  (View retorna {mediaAtual}m - diferenca por arredondamento)
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-slate-500">Ordenar:</span>
          {[
            { value: 'meses_desc', label: 'Maior tempo' },
            { value: 'meses_asc', label: 'Menor tempo' },
            { value: 'nome', label: 'Nome A-Z' },
          ].map(opt => (
            <button
              key={opt.value}
              className={cn(
                "text-xs px-2 py-1 rounded transition-colors",
                ordenacao === opt.value
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              )}
              onClick={() => setOrdenacao(opt.value as typeof ordenacao)}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">
            {dadosFiltrados.length} registros
          </span>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Nome</th>
                  <th className="text-center py-2 px-3 text-slate-400 font-medium w-24">Meses</th>
                  {isLtvEvasoes && (
                    <>
                      <th className="text-right py-2 px-3 text-slate-400 font-medium w-32">Parcela</th>
                      <th className="text-right py-2 px-3 text-slate-400 font-medium w-36">LTV gerado</th>
                    </>
                  )}
                  <th className="text-center py-2 px-3 text-slate-400 font-medium w-24">Fonte</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium w-36">Saida</th>
                </tr>
              </thead>
              <tbody>
                {dadosOrdenados.map((row, i) => (
                  <tr
                    key={`${row.nome}-${row.tempo_permanencia_meses}-${i}`}
                    className="border-b border-slate-800 hover:bg-slate-800/50"
                  >
                    <td className="py-1.5 px-3 text-slate-300 truncate max-w-[300px]">{row.nome}</td>
                    <td className="py-1.5 px-3 text-center">
                      <span className={cn(
                        "font-mono font-medium",
                        row.tempo_permanencia_meses >= 24 ? "text-emerald-400" :
                        row.tempo_permanencia_meses >= 12 ? "text-cyan-400" :
                        "text-amber-400"
                      )}>
                        {formatMeses(row.tempo_permanencia_meses)}
                      </span>
                    </td>
                    {isLtvEvasoes && (
                      <>
                        <td className="py-1.5 px-3 text-right font-mono text-slate-300">
                          {formatCurrency(row.valor_parcela || 0)}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono text-emerald-400">
                          {formatCurrency(row.ltv_individual || 0)}
                        </td>
                      </>
                    )}
                    <td className="py-1.5 px-3 text-center">
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        row.fonte === 'historico'
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                      )}>
                        {row.fonte === 'historico' ? 'Historico' : 'Sistema'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-slate-500 text-xs">
                      <div>{row.categoria_saida || 'Sem categoria'}</div>
                      {row.mes_saida && (
                        <div className="text-[11px] text-slate-600">{row.mes_saida}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
