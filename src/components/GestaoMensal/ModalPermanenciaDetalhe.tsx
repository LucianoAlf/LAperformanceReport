import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Database, Users, Clock, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExAlunoRow {
  nome: string;
  tempo_permanencia_meses: number;
  fonte: 'historico' | 'sistema';
  categoria_saida?: string;
  mes_saida?: string;
}

interface ModalPermanenciaDetalheProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: string;
  mediaAtual: number;
}

export function ModalPermanenciaDetalhe({ open, onOpenChange, unidadeId, mediaAtual }: ModalPermanenciaDetalheProps) {
  const [loading, setLoading] = useState(false);
  const [dados, setDados] = useState<ExAlunoRow[]>([]);
  const [filtroFonte, setFiltroFonte] = useState<'todos' | 'historico' | 'sistema'>('todos');
  const [ordenacao, setOrdenacao] = useState<'meses_desc' | 'meses_asc' | 'nome'>('meses_desc');

  useEffect(() => {
    if (open && unidadeId) {
      carregarDados();
    }
  }, [open, unidadeId]);

  async function carregarDados() {
    setLoading(true);
    try {
      // Usa a RPC get_historico_ltv (regra "saiu de tudo" + agrupamento por passagem).
      // Mesmos filtros aplicados pela RPC: tempo>=4, exclui bolsistas/banda, NOT EXISTS matrícula viva.
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
      console.error('Erro ao carregar detalhes de permanência:', err);
    } finally {
      setLoading(false);
    }
  }

  const dadosFiltrados = dados.filter(d => filtroFonte === 'todos' || d.fonte === filtroFonte);

  const dadosOrdenados = [...dadosFiltrados].sort((a, b) => {
    if (ordenacao === 'meses_desc') return b.tempo_permanencia_meses - a.tempo_permanencia_meses;
    if (ordenacao === 'meses_asc') return a.tempo_permanencia_meses - b.tempo_permanencia_meses;
    return a.nome.localeCompare(b.nome);
  });

  // Estatísticas
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Clock className="h-5 w-5 text-cyan-400" />
            Tempo de Permanência — Detalhamento
          </DialogTitle>
        </DialogHeader>

        {/* Cards de resumo */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div
            className={cn(
              "rounded-lg p-3 border cursor-pointer transition-colors",
              filtroFonte === 'todos'
                ? "bg-cyan-500/20 border-cyan-500/50"
                : "bg-slate-800 border-slate-700 hover:border-slate-600"
            )}
            onClick={() => setFiltroFonte('todos')}
          >
            <p className="text-xs text-slate-400 uppercase tracking-wider">Combinado</p>
            <p className="text-2xl font-bold text-cyan-400">{mediaCombinada.toFixed(1)}m</p>
            <p className="text-xs text-slate-500">{dados.length} ex-alunos</p>
          </div>
          <div
            className={cn(
              "rounded-lg p-3 border cursor-pointer transition-colors",
              filtroFonte === 'historico'
                ? "bg-amber-500/20 border-amber-500/50"
                : "bg-slate-800 border-slate-700 hover:border-slate-600"
            )}
            onClick={() => setFiltroFonte('historico')}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Database className="h-3 w-3 text-amber-400" />
              <p className="text-xs text-slate-400 uppercase tracking-wider">Histórico</p>
            </div>
            <p className="text-2xl font-bold text-amber-400">{mediaHistorico.toFixed(1)}m</p>
            <p className="text-xs text-slate-500">{totalHistorico.length} ex-alunos (importados)</p>
          </div>
          <div
            className={cn(
              "rounded-lg p-3 border cursor-pointer transition-colors",
              filtroFonte === 'sistema'
                ? "bg-emerald-500/20 border-emerald-500/50"
                : "bg-slate-800 border-slate-700 hover:border-slate-600"
            )}
            onClick={() => setFiltroFonte('sistema')}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Users className="h-3 w-3 text-emerald-400" />
              <p className="text-xs text-slate-400 uppercase tracking-wider">Sistema</p>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{mediaSistema.toFixed(1)}m</p>
            <p className="text-xs text-slate-500">{totalSistema.length} ex-alunos (registrados)</p>
          </div>
        </div>

        {/* Info */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 mb-3">
          <Filter className="h-3 w-3 inline mr-1" />
          Apenas ex-alunos com <strong className="text-white">4+ meses</strong> de permanência. Bolsistas, banda e segundo curso excluídos.
          {mediaAtual !== mediaCombinada && (
            <span className="text-amber-400 ml-2">
              (View retorna {mediaAtual}m — diferença por arredondamento)
            </span>
          )}
        </div>

        {/* Controle de ordenação */}
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

        {/* Tabela */}
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
                  <th className="text-center py-2 px-3 text-slate-400 font-medium w-24">Fonte</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium w-32">Saída</th>
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
                        {row.tempo_permanencia_meses}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        row.fonte === 'historico'
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                      )}>
                        {row.fonte === 'historico' ? 'Histórico' : 'Sistema'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-slate-500 text-xs">
                      {row.categoria_saida || row.mes_saida || '—'}
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
