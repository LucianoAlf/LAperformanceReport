import { useState, useMemo, useEffect } from 'react';
import { format, subMonths, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Search, Loader2, Copy, Phone,
  ChevronLeft, ChevronRight, UserX, Music,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useWidgetOverlapSentinel } from '@/contexts/WidgetVisibilityContext';
import { useFaltasPeriodo, type FaltaAluno } from './hooks/useFaltasPeriodo';

interface Props {
  unidadeAtual: UnidadeId;
}

const POR_PAGINA = 30;

// Faixa de cor por número de faltas (alerta: 2+)
function faixaFaltas(faltas: number) {
  if (faltas >= 4) return { cls: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'crítico' };
  if (faltas === 3) return { cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'alerta' };
  return { cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'atenção' };
}

function contatoDe(f: FaltaAluno): { numero: string; origem: string } | null {
  if (f.telefone) return { numero: f.telefone, origem: 'Aluno' };
  if (f.whatsapp) return { numero: f.whatsapp, origem: 'WhatsApp' };
  if (f.responsavel_telefone) return { numero: f.responsavel_telefone, origem: 'Responsável' };
  return null;
}

export function FaltasMesSection({ unidadeAtual }: Props) {
  const sentinelRef = useWidgetOverlapSentinel();
  // Mês selecionado (default: mês passado, pois no início do mês corrente ainda não há dados)
  const [mes, setMes] = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [minFaltas, setMinFaltas] = useState(2);
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);

  const { dataInicio, dataFim } = useMemo(() => {
    const base = parseISO(`${mes}-01`);
    return {
      dataInicio: format(startOfMonth(base), 'yyyy-MM-dd'),
      dataFim: format(endOfMonth(base), 'yyyy-MM-dd'),
    };
  }, [mes]);

  const { faltas, loading } = useFaltasPeriodo({ unidadeId: unidadeAtual, dataInicio, dataFim });

  const mostrarUnidade = unidadeAtual === 'todos';

  // KPIs por faixa (sobre o conjunto completo, antes do filtro mínimo)
  const kpis = useMemo(() => ({
    dois: faltas.filter(f => f.faltas >= 2).length,
    tres: faltas.filter(f => f.faltas >= 3).length,
    quatro: faltas.filter(f => f.faltas >= 4).length,
  }), [faltas]);

  const filtrados = useMemo(() => {
    let r = faltas.filter(f => f.faltas >= minFaltas);
    if (busca.trim()) {
      const t = busca.toLowerCase();
      r = r.filter(f =>
        f.nome.toLowerCase().includes(t) ||
        f.curso_nome?.toLowerCase().includes(t) ||
        f.professor_nome?.toLowerCase().includes(t)
      );
    }
    return r;
  }, [faltas, minFaltas, busca]);

  useEffect(() => { setPagina(1); }, [minFaltas, busca, mes, unidadeAtual]);

  const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados = useMemo(() => {
    const ini = (pagina - 1) * POR_PAGINA;
    return filtrados.slice(ini, ini + POR_PAGINA);
  }, [filtrados, pagina]);

  const copiar = (numero: string) => {
    navigator.clipboard.writeText(numero).then(
      () => toast.success('Contato copiado'),
      () => toast.error('Não foi possível copiar')
    );
  };

  const labelMes = format(parseISO(`${mes}-01`), "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
      {/* Cabeçalho + seletor de mês */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <UserX className="w-5 h-5 text-rose-400" />
          <h2 className="font-semibold text-white">Acompanhamento de Faltas</h2>
        </div>
        <span className="text-xs text-slate-400 capitalize">· {labelMes}</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-400">Mês:</label>
          <input
            type="month"
            value={mes}
            max={format(new Date(), 'yyyy-MM')}
            onChange={(e) => setMes(e.target.value)}
            className="h-8 px-2 text-xs bg-slate-700/50 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      {/* KPIs por faixa (clicáveis: setam o filtro mínimo) */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { n: 2, qtd: kpis.dois, cls: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400', emoji: '🟡' },
          { n: 3, qtd: kpis.tres, cls: 'bg-orange-500/10 border-orange-500/30 text-orange-400', emoji: '🟠' },
          { n: 4, qtd: kpis.quatro, cls: 'bg-red-500/10 border-red-500/30 text-red-400', emoji: '🔴' },
        ].map(k => (
          <button
            key={k.n}
            onClick={() => setMinFaltas(m => (m === k.n ? 1 : k.n))}
            title={minFaltas === k.n ? 'Clique para limpar o filtro' : `Filtrar ${k.n}+ faltas`}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition hover:opacity-80 ${k.cls} ${
              minFaltas === k.n ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-current' : ''
            }`}
          >
            <span className="text-xl">{k.emoji}</span>
            <div className="text-left">
              <p className="font-bold text-lg leading-none">{k.qtd}</p>
              <p className="text-xs opacity-80 mt-0.5">{k.n}+ faltas</p>
            </div>
          </button>
        ))}
      </div>

      {/* Busca (o filtro de faixa é feito clicando nos cards acima) */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar aluno, curso ou professor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 w-64 h-8"
          />
        </div>
        {minFaltas > 1 && (
          <button
            onClick={() => setMinFaltas(1)}
            className="text-xs text-slate-500 hover:text-slate-300 underline"
          >
            Filtrando {minFaltas}+ faltas · limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <UserX className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">Nenhum aluno com {minFaltas}+ faltas em {labelMes}.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-10">#</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Aluno</th>
                  {mostrarUnidade && <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-16">Unid.</th>}
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Professor</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-20">Faltas</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-16">Aulas</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-20">Presença</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-44">Contato</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map((f, i) => {
                  const faixa = faixaFaltas(f.faltas);
                  const contato = contatoDe(f);
                  return (
                    <tr key={f.aluno_id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition">
                      <td className="px-3 py-2.5 text-sm text-slate-500">{(pagina - 1) * POR_PAGINA + i + 1}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-sm font-medium text-slate-200">{f.nome}</p>
                        <p className="text-xs text-blue-400 flex items-center gap-1.5">
                          {f.curso_nome || 'Sem curso'}
                          {f.is_projeto_banda && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                              <Music className="w-2.5 h-2.5" /> Banda
                            </span>
                          )}
                        </p>
                      </td>
                      {mostrarUnidade && (
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">{f.unidade_codigo || '—'}</span>
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-sm text-slate-400">{f.professor_nome || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-lg border text-sm font-bold ${faixa.cls}`}>
                          {f.faltas}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-sm text-slate-400">{f.total_aulas}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-sm font-medium ${
                          f.pct_presenca >= 80 ? 'text-green-400' : f.pct_presenca >= 60 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {f.pct_presenca}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {contato ? (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-slate-500 flex-shrink-0" />
                            <span className="text-xs text-slate-300">{contato.numero}</span>
                            <span className="text-[9px] text-slate-500">({contato.origem})</span>
                            <button
                              onClick={() => copiar(contato.numero)}
                              className="text-slate-500 hover:text-violet-400 transition"
                              title="Copiar contato"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">Sem contato</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div ref={sentinelRef} className="flex items-center justify-between pt-3 mt-2 border-t border-slate-700/50">
            <span className="text-xs text-slate-400">
              {((pagina - 1) * POR_PAGINA) + 1}–{Math.min(pagina * POR_PAGINA, filtrados.length)} de {filtrados.length} aluno{filtrados.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="h-7 border-slate-700 text-xs"
              >
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <span className="text-xs text-slate-300 px-1">{pagina} / {totalPaginas || 1}</span>
              <Button
                variant="outline" size="sm"
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="h-7 border-slate-700 text-xs"
              >
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
