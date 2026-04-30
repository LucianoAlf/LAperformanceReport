import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface MovimentacaoRetencao {
  id: number;
  aluno_nome: string;
  tipo: 'renovacao' | 'nao_renovacao' | 'evasao';
  tipo_evasao: string | null;
  motivo: string | null;
  motivo_saida_id: number | null;
  data: string;
  valor_parcela_anterior: number | null;
  valor_parcela_novo: number | null;
  agente_comercial: string | null;
  conta_score: boolean;
  match_por_texto: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  professorId: number | null;
  professorNome: string;
  ano: number;
  mes: number;
  unidadeId: string;
  taxaRetencao: number;
  totalAlunos: number;
  evasoesMes: number;
}

const POR_PAGINA = 15;

export function ModalDetalhesRetencao({ open, onClose, professorId, professorNome, ano, mes, unidadeId, taxaRetencao, totalAlunos, evasoesMes }: Props) {
  const [dados, setDados] = useState<MovimentacaoRetencao[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroScore, setFiltroScore] = useState<string>('todos');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    if (!open || !professorId) return;

    const fetchDados = async () => {
      setLoading(true);
      setBusca('');
      setFiltroTipo('todos');
      setFiltroScore('todos');
      setPagina(1);
      try {
        const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const fim = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;

        let q = supabase
          .from('movimentacoes_admin')
          .select('id, aluno_nome, tipo, tipo_evasao, motivo, motivo_saida_id, data, valor_parcela_anterior, valor_parcela_novo, agente_comercial')
          .eq('professor_id', professorId)
          .in('tipo', ['renovacao', 'nao_renovacao', 'evasao'])
          .gte('data', inicio)
          .lte('data', fim)
          .order('data', { ascending: false });

        if (unidadeId !== 'todos') {
          q = q.eq('unidade_id', unidadeId);
        }

        const [{ data: rawData }, { data: motivosData }] = await Promise.all([
          q,
          supabase.from('motivos_saida').select('id, nome, conta_score_professor').eq('ativo', true),
        ]);

        const porId = new Map<number, boolean>();
        const porNome = new Map<string, boolean>();
        (motivosData || []).forEach((m: any) => {
          porId.set(m.id, m.conta_score_professor);
          porNome.set(m.nome.toLowerCase(), m.conta_score_professor);
        });

        const resultado: MovimentacaoRetencao[] = (rawData || []).map((m: any) => {
          let conta_score = false;
          let match_por_texto = false;

          if (m.tipo !== 'renovacao') {
            if (m.motivo_saida_id != null) {
              conta_score = porId.get(m.motivo_saida_id) ?? false;
            } else if (m.motivo) {
              const val = porNome.get(m.motivo.toLowerCase());
              if (val !== undefined) {
                conta_score = val;
                match_por_texto = true;
              }
            }
          }

          return {
            ...m,
            conta_score,
            match_por_texto,
          };
        });

        setDados(resultado);
      } catch (err) {
        console.error('Erro ao buscar retencao:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDados();
  }, [open, professorId, ano, mes, unidadeId]);

  const dadosFiltrados = useMemo(() => {
    let resultado = [...dados];

    if (busca) {
      const termo = busca.toLowerCase();
      resultado = resultado.filter(d => d.aluno_nome.toLowerCase().includes(termo));
    }

    if (filtroTipo !== 'todos') {
      resultado = resultado.filter(d => d.tipo === filtroTipo);
    }

    if (filtroScore === 'conta') resultado = resultado.filter(d => d.conta_score);
    else if (filtroScore === 'nao_conta') resultado = resultado.filter(d => d.tipo !== 'renovacao' && !d.conta_score);

    return resultado;
  }, [dados, busca, filtroTipo, filtroScore]);

  const totalPaginas = Math.max(1, Math.ceil(dadosFiltrados.length / POR_PAGINA));
  const dadosPaginados = dadosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  useEffect(() => { setPagina(1); }, [busca, filtroTipo, filtroScore]);

  const totalRenovacoes = dados.filter(d => d.tipo === 'renovacao').length;
  const totalNaoRenovacoes = dados.filter(d => d.tipo === 'nao_renovacao').length;
  const totalEvasoes = dados.filter(d => d.tipo === 'evasao').length;
  const totalContamScore = dados.filter(d => d.conta_score).length;

  const mesNome = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' });

  const getTipoBadge = (tipo: string, tipoEvasao?: string | null) => {
    switch (tipo) {
      case 'renovacao': return { label: 'Renovou', bg: 'bg-emerald-500/20 text-emerald-400' };
      case 'nao_renovacao': return { label: 'Nao Renovou', bg: 'bg-amber-500/20 text-amber-400' };
      case 'evasao': return { label: tipoEvasao === 'interrompido' ? 'Interrompido' : 'Cancelou', bg: 'bg-rose-500/20 text-rose-400' };
      default: return { label: tipo, bg: 'bg-slate-500/20 text-slate-400' };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            Retencao — {professorNome}
          </DialogTitle>
          <p className="text-sm text-slate-400 capitalize">{mesNome} {ano}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">Carteira</p>
                <p className="text-lg font-bold text-white">{totalAlunos}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center border border-emerald-500/20">
                <p className="text-xs text-slate-400">Renovacoes</p>
                <p className="text-lg font-bold text-emerald-400">{totalRenovacoes}</p>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 text-center border border-amber-500/20">
                <p className="text-xs text-slate-400">Nao Renov.</p>
                <p className="text-lg font-bold text-amber-400">{totalNaoRenovacoes}</p>
              </div>
              <div className="bg-rose-500/10 rounded-lg p-3 text-center border border-rose-500/20">
                <p className="text-xs text-slate-400">Evasoes</p>
                <p className="text-lg font-bold text-rose-400">{totalEvasoes}</p>
              </div>
              <div className="bg-violet-500/10 rounded-lg p-3 text-center border border-violet-500/20">
                <p className="text-xs text-slate-400">No Score</p>
                <p className="text-lg font-bold text-violet-400">{totalContamScore}</p>
              </div>
            </div>

            {/* Calculo */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-800/30 rounded-lg mb-3">
              <div className="text-xs text-slate-400">
                <p>Evasoes: {evasoesMes} | Taxa canc.: {totalAlunos > 0 ? ((evasoesMes / totalAlunos) * 100).toFixed(1) : '0'}%</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 mr-2">Retencao</span>
                <span className={cn('text-sm font-bold',
                  taxaRetencao >= 95 ? 'text-emerald-400' : taxaRetencao >= 70 ? 'text-amber-400' : 'text-rose-400'
                )}>
                  {taxaRetencao.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar aluno..."
                  className="pl-8 h-8 text-xs bg-slate-800/50 border-slate-700"
                />
              </div>
              <Select value={filtroTipo} onValueChange={v => setFiltroTipo(v)}>
                <SelectTrigger className="w-[135px] h-8 text-xs bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="renovacao">Renovacoes</SelectItem>
                  <SelectItem value="nao_renovacao">Nao Renovacoes</SelectItem>
                  <SelectItem value="evasao">Evasoes</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroScore} onValueChange={v => setFiltroScore(v)}>
                <SelectTrigger className="w-[125px] h-8 text-xs bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Score: todos</SelectItem>
                  <SelectItem value="conta">Contam</SelectItem>
                  <SelectItem value="nao_conta">Nao contam</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tabela */}
            {dados.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                Nenhuma movimentacao de retencao registrada no periodo
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs text-slate-400">
                      <th className="text-left py-2 px-2">Aluno</th>
                      <th className="text-center py-2 px-2">Status</th>
                      <th className="text-left py-2 px-2">Motivo</th>
                      <th className="text-center py-2 px-2">Score</th>
                      <th className="text-center py-2 px-2">Data</th>
                      <th className="text-right py-2 px-2">Reajuste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosPaginados.map(d => {
                      const badge = getTipoBadge(d.tipo, d.tipo_evasao);
                      const reajuste = d.valor_parcela_anterior && d.valor_parcela_novo
                        ? ((d.valor_parcela_novo - d.valor_parcela_anterior) / d.valor_parcela_anterior * 100)
                        : null;

                      return (
                        <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-2 text-white text-xs">{d.aluno_nome}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full whitespace-nowrap', badge.bg)}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-xs max-w-[120px]">
                            {d.tipo === 'renovacao' ? (
                              <span className="text-slate-600 italic">-</span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-slate-400 truncate" title={d.motivo || ''}>
                                  {d.motivo || <span className="text-slate-600 italic">sem motivo</span>}
                                </span>
                                {d.match_por_texto && (
                                  <span className="text-slate-600 text-[10px]">vinc. por texto</span>
                                )}
                                {!d.motivo_saida_id && !d.match_por_texto && d.motivo && (
                                  <span className="text-slate-600 text-[10px]">sem vinculo</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {d.tipo === 'renovacao' ? (
                              <span className="text-slate-600 text-xs">-</span>
                            ) : d.conta_score ? (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-medium whitespace-nowrap">
                                Conta
                              </span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-500 whitespace-nowrap">
                                Nao conta
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-300 text-xs">
                            {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </td>
                          <td className="py-2 px-2 text-right text-xs">
                            {d.tipo === 'renovacao' && reajuste !== null ? (
                              <span className={reajuste > 0 ? 'text-emerald-400' : 'text-amber-400'}>
                                {reajuste > 0 ? '+' : ''}{reajuste.toFixed(1)}%
                              </span>
                            ) : d.tipo === 'renovacao' ? (
                              <span className="text-slate-500">-</span>
                            ) : (
                              <span className="text-rose-400/50">
                                {d.valor_parcela_anterior ? `R$ ${Number(d.valor_parcela_anterior).toLocaleString('pt-BR')}` : '-'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {dadosPaginados.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                          Nenhuma movimentacao encontrada com os filtros atuais
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Paginacao */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                    <span className="text-xs text-slate-500">
                      {dadosFiltrados.length} registro{dadosFiltrados.length !== 1 ? 's' : ''} | Pagina {pagina} de {totalPaginas}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
