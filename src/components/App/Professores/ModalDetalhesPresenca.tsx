import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface AlunoPresenca {
  aluno_id: number;
  aluno_nome: string;
  total_aulas: number;
  presencas: number;
  faltas: number;
  percentual: number;
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

export function ModalDetalhesPresenca({ open, onClose, professorId, professorNome, ano, mes, unidadeId, dataInicio, dataFim, periodoLabel }: Props) {
  const [dados, setDados] = useState<AlunoPresenca[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'critico' | 'atencao' | 'ok'>('todos');
  const [ordenacao, setOrdenacao] = useState<'presenca_asc' | 'presenca_desc' | 'nome' | 'faltas'>('presenca_asc');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    if (!open || !professorId) return;

    const fetchPresenca = async () => {
      setLoading(true);
      setBusca('');
      setFiltroStatus('todos');
      setOrdenacao('presenca_asc');
      setPagina(1);
      try {
        const inicio = dataInicio ?? `${ano}-${String(mes).padStart(2, '0')}-01`;
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const fim = dataFim ?? `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;

        let query = supabase.rpc('get_presenca_por_aluno_professor', {
          p_professor_id: professorId,
          p_inicio: inicio,
          p_fim: fim,
          p_unidade_id: unidadeId !== 'todos' ? unidadeId : null,
        });

        const { data, error } = await query;

        if (error) {
          console.warn('RPC nao disponivel, usando query direta:', error.message);

          let q = supabase
            .from('aluno_presenca')
            .select(`
              aluno_id,
              status,
              alunos:aluno_id(nome),
              aulas_emusys:aula_emusys_id!inner(professor_id, data_aula, cancelada, unidade_id)
            `)
            .eq('aulas_emusys.professor_id', professorId)
            .eq('aulas_emusys.cancelada', false)
            .gte('aulas_emusys.data_aula', inicio)
            .lte('aulas_emusys.data_aula', fim);

          if (unidadeId !== 'todos') {
            q = q.eq('aulas_emusys.unidade_id', unidadeId);
          }

          const { data: rawData } = await q;

          if (rawData) {
            const agrupar = new Map<number, { nome: string; total: number; presencas: number; faltas: number }>();
            rawData.forEach((r: any) => {
              const id = r.aluno_id;
              const nome = r.alunos?.nome || 'Sem nome';
              if (!agrupar.has(id)) agrupar.set(id, { nome, total: 0, presencas: 0, faltas: 0 });
              const acc = agrupar.get(id)!;
              acc.total++;
              if (r.status === 'presente') acc.presencas++;
              else if (r.status === 'falta') acc.faltas++;
            });

            const resultado: AlunoPresenca[] = Array.from(agrupar.entries()).map(([id, v]) => ({
              aluno_id: id,
              aluno_nome: v.nome,
              total_aulas: v.total,
              presencas: v.presencas,
              faltas: v.faltas,
              percentual: v.total > 0 ? Math.round((v.presencas / v.total) * 1000) / 10 : 0,
            }));

            setDados(resultado);
          }
          return;
        }

        setDados(data || []);
      } catch (err) {
        console.error('Erro ao buscar presenca:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPresenca();
  }, [open, professorId, ano, mes, unidadeId, dataInicio, dataFim]);

  // Filtrar e ordenar
  const dadosFiltrados = useMemo(() => {
    let resultado = [...dados];

    // Busca por nome
    if (busca) {
      const termo = busca.toLowerCase();
      resultado = resultado.filter(d => d.aluno_nome.toLowerCase().includes(termo));
    }

    // Filtro por faixa de presenca
    if (filtroStatus === 'critico') resultado = resultado.filter(d => d.percentual < 70);
    else if (filtroStatus === 'atencao') resultado = resultado.filter(d => d.percentual >= 70 && d.percentual < 80);
    else if (filtroStatus === 'ok') resultado = resultado.filter(d => d.percentual >= 80);

    // Ordenacao
    switch (ordenacao) {
      case 'presenca_asc': resultado.sort((a, b) => a.percentual - b.percentual); break;
      case 'presenca_desc': resultado.sort((a, b) => b.percentual - a.percentual); break;
      case 'nome': resultado.sort((a, b) => a.aluno_nome.localeCompare(b.aluno_nome)); break;
      case 'faltas': resultado.sort((a, b) => b.faltas - a.faltas); break;
    }

    return resultado;
  }, [dados, busca, filtroStatus, ordenacao]);

  // Paginacao
  const totalPaginas = Math.max(1, Math.ceil(dadosFiltrados.length / POR_PAGINA));
  const dadosPaginados = dadosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // Reset pagina quando filtros mudam
  useEffect(() => { setPagina(1); }, [busca, filtroStatus, ordenacao]);

  // Totais dos dados filtrados
  const totalGeral = dadosFiltrados.reduce((acc, d) => acc + d.total_aulas, 0);
  const presencasGeral = dadosFiltrados.reduce((acc, d) => acc + d.presencas, 0);
  const faltasGeral = dadosFiltrados.reduce((acc, d) => acc + d.faltas, 0);
  const mediaGeral = totalGeral > 0 ? Math.round((presencasGeral / totalGeral) * 1000) / 10 : 0;

  const mesNome = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' });
  const labelPeriodo = periodoLabel ?? `${mesNome} ${ano}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            Presenca — {professorNome}
          </DialogTitle>
          <p className="text-sm text-slate-400 capitalize">{labelPeriodo}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : dados.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            Nenhum dado de presenca encontrado para este periodo
          </div>
        ) : (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">Alunos</p>
                <p className="text-lg font-bold text-white">{dadosFiltrados.length}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">Total Aulas</p>
                <p className="text-lg font-bold text-white">{totalGeral}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center border border-emerald-500/20">
                <p className="text-xs text-slate-400">Presencas</p>
                <p className="text-lg font-bold text-emerald-400">{presencasGeral}</p>
              </div>
              <div className="bg-rose-500/10 rounded-lg p-3 text-center border border-rose-500/20">
                <p className="text-xs text-slate-400">Faltas</p>
                <p className="text-lg font-bold text-rose-400">{faltasGeral}</p>
              </div>
            </div>

            {/* Media geral */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-800/30 rounded-lg mb-3">
              <span className="text-sm text-slate-400">Media geral de presenca</span>
              <span className={cn('text-sm font-bold',
                mediaGeral >= 80 ? 'text-emerald-400' : mediaGeral >= 70 ? 'text-amber-400' : 'text-rose-400'
              )}>
                {mediaGeral.toFixed(1)}%
              </span>
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
              <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v as any)}>
                <SelectTrigger className="w-[130px] h-8 text-xs bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="critico">Critico (&lt;70%)</SelectItem>
                  <SelectItem value="atencao">Atencao (70-80%)</SelectItem>
                  <SelectItem value="ok">OK (&gt;=80%)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ordenacao} onValueChange={v => setOrdenacao(v as any)}>
                <SelectTrigger className="w-[140px] h-8 text-xs bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="presenca_asc">Menor presenca</SelectItem>
                  <SelectItem value="presenca_desc">Maior presenca</SelectItem>
                  <SelectItem value="faltas">Mais faltas</SelectItem>
                  <SelectItem value="nome">Nome A-Z</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tabela */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="text-left py-2 px-2">Aluno</th>
                  <th className="text-center py-2 px-2">Aulas</th>
                  <th className="text-center py-2 px-2">
                    <CheckCircle2 className="w-3.5 h-3.5 inline text-emerald-400" />
                  </th>
                  <th className="text-center py-2 px-2">
                    <XCircle className="w-3.5 h-3.5 inline text-rose-400" />
                  </th>
                  <th className="text-center py-2 px-2">%</th>
                </tr>
              </thead>
              <tbody>
                {dadosPaginados.map(d => (
                  <tr key={d.aluno_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-2 text-white">{d.aluno_nome}</td>
                    <td className="py-2 px-2 text-center text-slate-300">{d.total_aulas}</td>
                    <td className="py-2 px-2 text-center text-emerald-400">{d.presencas}</td>
                    <td className="py-2 px-2 text-center text-rose-400">{d.faltas}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={cn('font-medium',
                        d.percentual >= 80 ? 'text-emerald-400' : d.percentual >= 70 ? 'text-amber-400' : 'text-rose-400'
                      )}>
                        {d.percentual.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
                {dadosPaginados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                      Nenhum aluno encontrado com os filtros atuais
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Paginacao */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                <span className="text-xs text-slate-500">
                  {dadosFiltrados.length} aluno{dadosFiltrados.length !== 1 ? 's' : ''} | Pagina {pagina} de {totalPaginas}
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
