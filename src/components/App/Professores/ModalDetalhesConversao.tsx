import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, ChevronLeft, ChevronRight, AlertTriangle, Check, X, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/Tooltip';

type Categoria =
  | 'realizou_matriculou'
  | 'realizou_nao_matriculou'
  | 'faltou'
  | 'matriculou_sem_realizar'
  | 'matricula_direta'
  | 'agendada_pendente';

interface LeadConversao {
  id: number;
  nome: string;
  data_experimental: string | null;
  data_conversao: string | null;
  experimental_realizada: boolean | null;
  faltou_experimental: boolean | null;
  converteu: boolean | null;
  status: string | null;
  quantidade: number | null;
  categoria: Categoria;
}

interface Props {
  open: boolean;
  onClose: () => void;
  professorId: number | null;
  professorNome: string;
  ano: number;
  mes: number;
  unidadeId: string;
  dataInicio?: string;
  dataFim?: string;
  periodoLabel?: string;
}

const POR_PAGINA = 15;

const CATEGORIA_LABELS: Record<Categoria, string> = {
  realizou_matriculou: 'Realizou + Matriculou',
  realizou_nao_matriculou: 'Realizou + Sem matricula',
  faltou: 'Faltou',
  matriculou_sem_realizar: 'Matriculou sem realizar',
  matricula_direta: 'Matricula direta',
  agendada_pendente: 'Agendada / Pendente',
};

function classificar(lead: any, periodoInicio: string, periodoFim: string): Categoria {
  const dataExp = lead.data_experimental;
  const dataConv = lead.data_conversao;
  const expNoPeriodo = !!dataExp && dataExp >= periodoInicio && dataExp <= periodoFim;
  const convNoPeriodo = !!dataConv && dataConv >= periodoInicio && dataConv <= periodoFim;
  const matriculou = ['matriculado', 'convertido'].includes(lead.status || '');

  if (expNoPeriodo && lead.experimental_realizada && matriculou) return 'realizou_matriculou';
  if (expNoPeriodo && lead.experimental_realizada && !matriculou) return 'realizou_nao_matriculou';
  if (expNoPeriodo && lead.faltou_experimental) return 'faltou';
  if (
    expNoPeriodo &&
    !lead.experimental_realizada &&
    matriculou &&
    !lead.faltou_experimental
  )
    return 'matriculou_sem_realizar';
  if (!expNoPeriodo && convNoPeriodo && matriculou) return 'matricula_direta';
  return 'agendada_pendente';
}

export function ModalDetalhesConversao({
  open,
  onClose,
  professorId,
  professorNome,
  ano,
  mes,
  unidadeId,
  dataInicio,
  dataFim,
  periodoLabel,
}: Props) {
  const [dados, setDados] = useState<LeadConversao[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    if (!open || !professorId) return;

    const fetchLeads = async () => {
      setLoading(true);
      setBusca('');
      setFiltroCategoria('todos');
      setPagina(1);
      try {
        const inicio = dataInicio ?? `${ano}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const fim = dataFim ?? `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;

        let q = supabase
          .from('leads')
          .select(
            'id, nome, data_experimental, data_conversao, experimental_realizada, faltou_experimental, converteu, status, quantidade'
          )
          .eq('professor_experimental_id', professorId)
          .or(
            `and(data_experimental.gte.${inicio},data_experimental.lte.${fim}),and(data_conversao.gte.${inicio},data_conversao.lte.${fim})`
          )
          .order('data_experimental', { ascending: false, nullsFirst: false });

        if (unidadeId !== 'todos') {
          q = q.eq('unidade_id', unidadeId);
        }

        const { data: rawData } = await q;

        const resultado: LeadConversao[] = (rawData || []).map((l: any) => ({
          id: l.id,
          nome: l.nome || 'Sem nome',
          data_experimental: l.data_experimental,
          data_conversao: l.data_conversao,
          experimental_realizada: l.experimental_realizada,
          faltou_experimental: l.faltou_experimental,
          converteu: l.converteu,
          status: l.status,
          quantidade: l.quantidade,
          categoria: classificar(l, inicio, fim),
        }));

        setDados(resultado);
      } catch (err) {
        console.error('Erro ao buscar leads de conversao:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeads();
  }, [open, professorId, ano, mes, unidadeId, dataInicio, dataFim]);

  const dadosFiltrados = useMemo(() => {
    let resultado = [...dados];

    if (busca) {
      const termo = busca.toLowerCase();
      resultado = resultado.filter(d => d.nome.toLowerCase().includes(termo));
    }

    if (filtroCategoria !== 'todos') {
      resultado = resultado.filter(d => d.categoria === filtroCategoria);
    }

    return resultado;
  }, [dados, busca, filtroCategoria]);

  const totalPaginas = Math.max(1, Math.ceil(dadosFiltrados.length / POR_PAGINA));
  const dadosPaginados = dadosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [busca, filtroCategoria]);

  // Totais por categoria (para os cards)
  const totais = useMemo(() => {
    const sumQty = (cat: Categoria) =>
      dados.filter(d => d.categoria === cat).reduce((a, d) => a + (d.quantidade || 1), 0);
    const realizadas = sumQty('realizou_matriculou') + sumQty('realizou_nao_matriculou');
    const faltas = sumQty('faltou');
    const matPos = sumQty('realizou_matriculou') + sumQty('matriculou_sem_realizar');
    const matDir = sumQty('matricula_direta');
    const ambiguas = sumQty('matriculou_sem_realizar');
    return { realizadas, faltas, matPos, matDir, ambiguas };
  }, [dados]);

  const taxaConversao = totais.realizadas > 0 ? (totais.matPos / totais.realizadas) * 100 : 0;

  const mesNome = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' });
  const labelPeriodo = periodoLabel ?? `${mesNome} ${ano}`;

  const formatarData = (d: string | null) => {
    if (!d) return '-';
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const renderBool = (val: boolean | null) => {
    if (val === true) return <Check className="w-3.5 h-3.5 text-emerald-400 inline" />;
    if (val === false) return <X className="w-3.5 h-3.5 text-rose-400 inline" />;
    return <Minus className="w-3.5 h-3.5 text-slate-600 inline" />;
  };

  const getCategoriaBadge = (cat: Categoria) => {
    switch (cat) {
      case 'realizou_matriculou':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'realizou_nao_matriculou':
        return 'bg-slate-500/20 text-slate-300';
      case 'faltou':
        return 'bg-rose-500/20 text-rose-400';
      case 'matriculou_sem_realizar':
        return 'bg-amber-500/20 text-amber-400';
      case 'matricula_direta':
        return 'bg-cyan-500/20 text-cyan-400';
      case 'agendada_pendente':
        return 'bg-violet-500/20 text-violet-400';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Conversao diagnostica (legado) — {professorNome}</DialogTitle>
          <p className="text-sm text-slate-400 capitalize">{labelPeriodo}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : dados.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            Nenhum lead encontrado para este professor no periodo
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100 mb-4">
              Diagnostico operacional legado. Nao usar como KPI oficial ate presenca individual + vinculo canonico estarem fechados.
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center border border-emerald-500/20">
                <p className="text-xs text-slate-400">Realizadas</p>
                <p className="text-lg font-bold text-emerald-400">{totais.realizadas}</p>
              </div>
              <div className="bg-rose-500/10 rounded-lg p-3 text-center border border-rose-500/20">
                <p className="text-xs text-slate-400">Faltas</p>
                <p className="text-lg font-bold text-rose-400">{totais.faltas}</p>
              </div>
              <div className="bg-cyan-500/10 rounded-lg p-3 text-center border border-cyan-500/20">
                <p className="text-xs text-slate-400">Mat. pos-exp</p>
                <p className="text-lg font-bold text-cyan-400">{totais.matPos}</p>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-3 text-center border border-blue-500/20">
                <p className="text-xs text-slate-400">Mat. diretas</p>
                <p className="text-lg font-bold text-blue-400">{totais.matDir}</p>
              </div>
              <div
                className={cn(
                  'rounded-lg p-3 text-center border',
                  totais.ambiguas > 0
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-slate-800/30 border-slate-700/50'
                )}
              >
                <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
                  {totais.ambiguas > 0 && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                  Ambiguas
                </p>
                <p
                  className={cn(
                    'text-lg font-bold',
                    totais.ambiguas > 0 ? 'text-amber-400' : 'text-slate-500'
                  )}
                >
                  {totais.ambiguas}
                </p>
              </div>
            </div>

            {/* Linha da formula */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-800/30 rounded-lg mb-3">
              <div className="text-xs text-slate-400">
                <Tooltip
                  side="top"
                  content={
                    <div className="text-xs max-w-[280px]">
                      <p className="font-semibold text-slate-200 mb-1">Formula diagnostica legada</p>
                      <p className="text-slate-400 mb-1">
                        <span className="text-cyan-400">Matriculas pos-exp</span> = leads que matricularam tendo experimental no periodo (mesmo que `experimental_realizada=false`).
                      </p>
                      <p className="text-slate-400 mb-1">
                        <span className="text-emerald-400">Realizadas</span> = leads com `experimental_realizada=true` no periodo.
                      </p>
                      <p className="text-amber-400">
                        Leads "Ambiguos" entram no numerador mas nao no denominador → taxa pode passar de 100%.
                      </p>
                    </div>
                  }
                >
                  <span className="cursor-help">
                    Conversao legada = <span className="text-cyan-400">{totais.matPos}</span> ÷{' '}
                    <span className="text-emerald-400">{totais.realizadas}</span>
                  </span>
                </Tooltip>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-amber-300">Oficial bloqueada</span>
                <span className="block text-[11px] text-slate-400">diag. legado {taxaConversao.toFixed(1)}%</span>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar lead..."
                  className="pl-8 h-8 text-xs bg-slate-800/50 border-slate-700"
                />
              </div>
              <Select value={filtroCategoria} onValueChange={v => setFiltroCategoria(v)}>
                <SelectTrigger className="w-[200px] h-8 text-xs bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as categorias</SelectItem>
                  <SelectItem value="realizou_matriculou">Realizou + Matriculou</SelectItem>
                  <SelectItem value="realizou_nao_matriculou">Realizou sem matricula</SelectItem>
                  <SelectItem value="faltou">Faltou</SelectItem>
                  <SelectItem value="matriculou_sem_realizar">Matriculou sem realizar</SelectItem>
                  <SelectItem value="matricula_direta">Matricula direta</SelectItem>
                  <SelectItem value="agendada_pendente">Agendada / Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tabela */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="text-left py-2 px-2">Lead</th>
                  <th className="text-center py-2 px-2">Data Exp</th>
                  <th className="text-center py-2 px-2">Realiz.</th>
                  <th className="text-center py-2 px-2">Faltou</th>
                  <th className="text-center py-2 px-2">Conv.</th>
                  <th className="text-center py-2 px-2">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {dadosPaginados.map(d => (
                  <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-2 text-white text-xs">{d.nome}</td>
                    <td className="py-2 px-2 text-center text-slate-300 text-xs">
                      {formatarData(d.data_experimental)}
                    </td>
                    <td className="py-2 px-2 text-center">{renderBool(d.experimental_realizada)}</td>
                    <td className="py-2 px-2 text-center">{renderBool(d.faltou_experimental)}</td>
                    <td className="py-2 px-2 text-center">{renderBool(d.converteu)}</td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap',
                          getCategoriaBadge(d.categoria)
                        )}
                      >
                        {CATEGORIA_LABELS[d.categoria]}
                      </span>
                    </td>
                  </tr>
                ))}
                {dadosPaginados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                      Nenhum lead encontrado com os filtros atuais
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Paginacao */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                <span className="text-xs text-slate-500">
                  {dadosFiltrados.length} lead{dadosFiltrados.length !== 1 ? 's' : ''} | Pagina {pagina} de {totalPaginas}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={pagina <= 1}
                    onClick={() => setPagina(p => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1)
                    .map((p, i, arr) => (
                      <span key={p}>
                        {i > 0 && arr[i - 1] !== p - 1 && <span className="text-slate-600 px-1">...</span>}
                        <Button
                          variant={p === pagina ? 'default' : 'ghost'}
                          size="icon"
                          className={cn('h-7 w-7 text-xs', p === pagina && 'bg-violet-600')}
                          onClick={() => setPagina(p)}
                        >
                          {p}
                        </Button>
                      </span>
                    ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={pagina >= totalPaginas}
                    onClick={() => setPagina(p => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
