import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface EvasaoDetalhe {
  id: number;
  aluno_nome: string;
  tipo: string;
  tipo_evasao: string | null;
  motivo: string | null;
  motivo_saida_id: number | null;
  data: string;
  mrr_perdido: number;
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
}

const TIPO_EVASAO_LABELS: Record<string, string> = {
  interrompido: 'Interrompido',
  nao_renovou: 'Nao Renovou',
  interrompido_2_curso: 'Interr. 2o Curso',
  interrompido_bolsista: 'Interr. Bolsista',
  interrompido_banda: 'Interr. Banda',
  transferencia: 'Transferencia',
};

const POR_PAGINA = 15;

export function ModalDetalhesEvasoes({ open, onClose, professorId, professorNome, ano, mes, unidadeId }: Props) {
  const [dados, setDados] = useState<EvasaoDetalhe[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroScore, setFiltroScore] = useState<string>('todos');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    if (!open || !professorId) return;

    const fetchEvasoes = async () => {
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
          .select('id, aluno_nome, tipo, tipo_evasao, motivo, motivo_saida_id, data, valor_parcela_evasao, valor_parcela_anterior')
          .eq('professor_id', professorId)
          .in('tipo', ['evasao', 'nao_renovacao'])
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

        const resultado: EvasaoDetalhe[] = (rawData || []).map((m: any) => {
          let conta_score = false;
          let match_por_texto = false;

          if (m.motivo_saida_id != null) {
            conta_score = porId.get(m.motivo_saida_id) ?? false;
          } else if (m.motivo) {
            const val = porNome.get(m.motivo.toLowerCase());
            if (val !== undefined) {
              conta_score = val;
              match_por_texto = true;
            }
          }

          return {
            id: m.id,
            aluno_nome: m.aluno_nome || 'Sem nome',
            tipo: m.tipo,
            tipo_evasao: m.tipo_evasao,
            motivo: m.motivo,
            motivo_saida_id: m.motivo_saida_id,
            data: m.data,
            mrr_perdido: Number(m.valor_parcela_evasao || m.valor_parcela_anterior || 0),
            conta_score,
            match_por_texto,
          };
        });

        setDados(resultado);
      } catch (err) {
        console.error('Erro ao buscar evasoes:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvasoes();
  }, [open, professorId, ano, mes, unidadeId]);

  const dadosFiltrados = useMemo(() => {
    let resultado = [...dados];

    if (busca) {
      const termo = busca.toLowerCase();
      resultado = resultado.filter(d => d.aluno_nome.toLowerCase().includes(termo));
    }

    if (filtroTipo === 'evasao') resultado = resultado.filter(d => d.tipo === 'evasao');
    else if (filtroTipo === 'nao_renovacao') resultado = resultado.filter(d => d.tipo === 'nao_renovacao');

    if (filtroScore === 'conta') resultado = resultado.filter(d => d.conta_score);
    else if (filtroScore === 'nao_conta') resultado = resultado.filter(d => !d.conta_score);

    return resultado;
  }, [dados, busca, filtroTipo, filtroScore]);

  const totalPaginas = Math.max(1, Math.ceil(dadosFiltrados.length / POR_PAGINA));
  const dadosPaginados = dadosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  useEffect(() => { setPagina(1); }, [busca, filtroTipo, filtroScore]);

  const totalCancelamentos = dados.filter(d => d.tipo === 'evasao').length;
  const totalNaoRenovacoes = dados.filter(d => d.tipo === 'nao_renovacao').length;
  const totalContamScore = dados.filter(d => d.conta_score).length;
  const mrrPerdidoTotal = dados.reduce((acc, d) => acc + d.mrr_perdido, 0);

  const mesNome = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            Evasoes — {professorNome}
          </DialogTitle>
          <p className="text-sm text-slate-400 capitalize">{mesNome} {ano}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : dados.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            Nenhuma evasao registrada para este professor no periodo
          </div>
        ) : (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-rose-500/10 rounded-lg p-3 text-center border border-rose-500/20">
                <p className="text-xs text-slate-400">Cancelamentos</p>
                <p className="text-lg font-bold text-rose-400">{totalCancelamentos}</p>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 text-center border border-amber-500/20">
                <p className="text-xs text-slate-400">Nao Renovacoes</p>
                <p className="text-lg font-bold text-amber-400">{totalNaoRenovacoes}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">MRR Perdido</p>
                <p className="text-sm font-bold text-rose-400">
                  {mrrPerdidoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="bg-violet-500/10 rounded-lg p-3 text-center border border-violet-500/20">
                <p className="text-xs text-slate-400">Contam no Score</p>
                <p className="text-lg font-bold text-violet-400">{totalContamScore}</p>
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
                  <SelectItem value="evasao">Cancelamentos</SelectItem>
                  <SelectItem value="nao_renovacao">Nao Renovacoes</SelectItem>
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="text-left py-2 px-2">Aluno</th>
                  <th className="text-center py-2 px-2">Tipo</th>
                  <th className="text-left py-2 px-2">Motivo</th>
                  <th className="text-center py-2 px-2">Score</th>
                  <th className="text-center py-2 px-2">Data</th>
                  <th className="text-right py-2 px-2">MRR</th>
                </tr>
              </thead>
              <tbody>
                {dadosPaginados.map(d => (
                  <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-2 text-white text-xs">{d.aluno_nome}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full',
                        d.tipo === 'evasao' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                      )}>
                        {d.tipo_evasao ? (TIPO_EVASAO_LABELS[d.tipo_evasao] || d.tipo_evasao) : (d.tipo === 'evasao' ? 'Cancelamento' : 'Nao Renovou')}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs max-w-[120px]">
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
                    </td>
                    <td className="py-2 px-2 text-center">
                      {d.conta_score ? (
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
                    <td className="py-2 px-2 text-right text-rose-400 text-xs">
                      {d.mrr_perdido > 0 ? d.mrr_perdido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                    </td>
                  </tr>
                ))}
                {dadosPaginados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                      Nenhuma evasao encontrada com os filtros atuais
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Paginacao */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                <span className="text-xs text-slate-500">
                  {dadosFiltrados.length} evasao(oes) | Pagina {pagina} de {totalPaginas}
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
      </DialogContent>
    </Dialog>
  );
}
