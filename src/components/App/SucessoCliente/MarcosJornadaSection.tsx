import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Sparkles, Target, RefreshCw, Loader2, Copy, Phone, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Tooltip } from '@/components/ui/Tooltip';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useWidgetOverlapSentinel } from '@/contexts/WidgetVisibilityContext';
import { useMarcosJornada, type MarcoAluno } from './hooks/useMarcosJornada';

const fmtISO = (d: Date | undefined) => (d ? format(d, 'yyyy-MM-dd') : null);

interface Props {
  unidadeAtual: UnidadeId;
}

const JANELAS = [3, 7, 14];
const JANELAS_RENOV = [7, 15, 30];

function contatoDe(telefone: string | null, whatsapp: string | null, responsavel?: string | null) {
  if (telefone) return { numero: telefone, origem: 'Aluno' };
  if (whatsapp) return { numero: whatsapp, origem: 'WhatsApp' };
  if (responsavel) return { numero: responsavel, origem: 'Responsável' };
  return null;
}

function CelulaContato({ numero, origem }: { numero: string; origem: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Phone className="w-3 h-3 text-slate-500 flex-shrink-0" />
      <span className="text-xs text-slate-300">{numero}</span>
      <span className="text-[9px] text-slate-500">({origem})</span>
      <button
        onClick={() => navigator.clipboard.writeText(numero).then(
          () => toast.success('Contato copiado'),
          () => toast.error('Não foi possível copiar')
        )}
        className="text-slate-500 hover:text-violet-400 transition"
        title="Copiar contato"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function dataMarcoLabel(data: string, horario: string | null) {
  const d = format(parseISO(data), 'EEE dd/MM', { locale: ptBR });
  return horario ? `${d} · ${horario}` : d;
}

// Tabela para os marcos de aula (primeiras / marco)
function TabelaAula({ itens, vazio }: { itens: MarcoAluno[]; vazio: string }) {
  if (itens.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">{vazio}</p>;
  }
  return (
    <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-slate-800 z-10">
          <tr className="border-b border-slate-700">
            <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Aluno</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Professor</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-32">Data da aula</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-44">Contato</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((f) => {
            const contato = contatoDe(f.telefone, f.whatsapp, f.responsavel_telefone);
            return (
              <tr key={`${f.aluno_id}-${f.data_marco}`} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition">
                <td className="px-3 py-2.5">
                  <p className="text-sm font-medium text-slate-200">{f.nome}</p>
                  <p className="text-xs text-blue-400">{f.curso_nome || 'Sem curso'}</p>
                </td>
                <td className="px-3 py-2.5 text-sm text-slate-400">{f.professor_nome || '—'}</td>
                <td className="px-3 py-2.5 text-sm text-slate-300 capitalize">{dataMarcoLabel(f.data_marco, f.horario)}</td>
                <td className="px-3 py-2.5">
                  {contato ? <CelulaContato {...contato} /> : <span className="text-xs text-slate-600">Sem contato</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_RENOV: Record<string, { label: string; cls: string }> = {
  vencido: { label: 'Vencido', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  urgente_7_dias: { label: '≤ 7 dias', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  atencao_15_dias: { label: '≤ 15 dias', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  proximo_30_dias: { label: '≤ 30 dias', cls: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
};

export function MarcosJornadaSection({ unidadeAtual }: Props) {
  const sentinelRef = useWidgetOverlapSentinel();
  const [modoData, setModoData] = useState<'proximos' | 'periodo'>('proximos');
  const [janelaDias, setJanelaDias] = useState(7);
  const [periodoIni, setPeriodoIni] = useState<Date | undefined>(undefined);
  const [periodoFim, setPeriodoFim] = useState<Date | undefined>(undefined);
  const [nrAlvo, setNrAlvo] = useState(15);
  const [nrInput, setNrInput] = useState('15');
  const [janelaRenov, setJanelaRenov] = useState(30);

  const usaPeriodo = modoData === 'periodo' && !!periodoIni && !!periodoFim;

  const { primeirasAulas, marcoAula, renovacoes, loading, error, refetch } = useMarcosJornada({
    unidadeId: unidadeAtual,
    janelaDias,
    dataInicio: usaPeriodo ? fmtISO(periodoIni) : null,
    dataFim: usaPeriodo ? fmtISO(periodoFim) : null,
  });

  // O marco vem com todos os calouros + nr de cada aula; filtra pelo "Nº da aula" no client (sem rebuscar).
  const marcoAulaFiltrado = useMemo(
    () => marcoAula.filter(m => m.nr === nrAlvo),
    [marcoAula, nrAlvo]
  );

  const renovacoesFiltradas = useMemo(
    () => renovacoes.filter(r => (r.dias_ate_vencimento ?? 999) <= janelaRenov),
    [renovacoes, janelaRenov]
  );

  const periodoLabel = usaPeriodo
    ? `${format(periodoIni!, 'dd/MM/yy')} – ${format(periodoFim!, 'dd/MM/yy')}`
    : `próximos ${janelaDias} dias`;

  const aplicarNrAlvo = () => {
    const n = parseInt(nrInput, 10);
    if (!isNaN(n) && n >= 2) setNrAlvo(n);
    else setNrInput(String(nrAlvo));
  };

  return (
    <div className="space-y-5" ref={sentinelRef}>
      {/* Controles globais */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        {/* Toggle: próximos dias x período customizado (retroativo) */}
        <div className="flex items-center bg-slate-900 border border-slate-600 rounded-md overflow-hidden text-xs">
          <button
            onClick={() => setModoData('proximos')}
            className={`px-2.5 py-1.5 transition ${modoData === 'proximos' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Próximos dias
          </button>
          <button
            onClick={() => setModoData('periodo')}
            className={`px-2.5 py-1.5 transition ${modoData === 'periodo' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Período
          </button>
        </div>

        {modoData === 'proximos' ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Janela:</span>
            <div className="flex items-center bg-slate-900 border border-slate-600 rounded-md overflow-hidden text-xs">
              {JANELAS.map(j => (
                <button
                  key={j}
                  onClick={() => setJanelaDias(j)}
                  className={`px-2.5 py-1.5 transition ${janelaDias === j ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  {j} dias
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">De:</span>
            <DatePicker date={periodoIni} onDateChange={setPeriodoIni} placeholder="Início" className="h-8 w-36 text-xs" maxDate={periodoFim} />
            <span className="text-xs text-slate-400">Até:</span>
            <DatePicker date={periodoFim} onDateChange={setPeriodoFim} placeholder="Fim" className="h-8 w-36 text-xs" minDate={periodoIni} />
          </div>
        )}

        <Button variant="outline" size="sm" onClick={refetch} disabled={loading} className="h-8 border-slate-700 text-xs ml-auto">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {modoData === 'periodo' && !usaPeriodo && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 text-sm text-sky-300">
          Selecione as datas de início e fim para buscar as aulas do período (inclui retroativo).
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
          Erro ao carregar marcos: {error}
        </div>
      )}

      {/* Bloco 1: Primeiras aulas */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-white">Primeiras aulas</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {primeirasAulas.length}
          </span>
          <span className="text-xs text-slate-500">· 1ª aula agendada · {periodoLabel} — pesquisa de boas-vindas</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        ) : (
          <TabelaAula itens={primeirasAulas} vazio={`Nenhum aluno com 1ª aula — ${periodoLabel}.`} />
        )}
      </div>

      {/* Bloco 2: Marco de aula (calouros) */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center flex-wrap gap-2 mb-3">
          <Target className="w-5 h-5 text-violet-400" />
          <h2 className="font-semibold text-white">Marco de aula</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
            {marcoAulaFiltrado.length}
          </span>
          {/* Selo + explicação "só calouros" */}
          <Tooltip
            side="top"
            content={
              <p className="max-w-[260px] text-slate-200">
                O nº da aula <b>reinicia</b> quando o aluno renova o contrato. Por isso este marco mostra
                <b> apenas calouros (matriculados há menos de 12 meses)</b> — assim a "{nrAlvo}ª aula" significa de fato
                ~{Math.round(nrAlvo / 4)} meses de escola, e não o meio do ciclo de um veterano.
              </p>
            }
          >
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 cursor-help">
              Apenas calouros (1º ano de casa) ⓘ
            </span>
          </Tooltip>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-slate-400">Nº da aula:</span>
            <input
              type="number"
              min={2}
              value={nrInput}
              onChange={(e) => setNrInput(e.target.value)}
              onBlur={aplicarNrAlvo}
              onKeyDown={(e) => { if (e.key === 'Enter') aplicarNrAlvo(); }}
              className="w-16 h-8 px-2 text-xs bg-slate-700/50 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        ) : (
          <TabelaAula itens={marcoAulaFiltrado} vazio={`Nenhum calouro na ${nrAlvo}ª aula — ${periodoLabel}.`} />
        )}
      </div>

      {/* Bloco 3: Prestes a renovar */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center flex-wrap gap-2 mb-3">
          <RotateCcw className="w-5 h-5 text-sky-400" />
          <h2 className="font-semibold text-white">Prestes a renovar</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
            {renovacoesFiltradas.length}
          </span>
          <span className="text-xs text-slate-500">· contrato vencendo — pesquisa de renovação</span>
          <div className="flex items-center bg-slate-900 border border-slate-600 rounded-md overflow-hidden text-xs ml-auto">
            {JANELAS_RENOV.map(j => (
              <button
                key={j}
                onClick={() => setJanelaRenov(j)}
                className={`px-2.5 py-1.5 transition ${janelaRenov === j ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {j}d
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        ) : renovacoesFiltradas.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Nenhum contrato vencendo em até {janelaRenov} dias.</p>
        ) : (
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-800 z-10">
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Aluno</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Professor</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-28">Vence em</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-24">Situação</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-44">Contato</th>
                </tr>
              </thead>
              <tbody>
                {renovacoesFiltradas.map((r) => {
                  const st = STATUS_RENOV[r.status_renovacao] || { label: r.status_renovacao, cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
                  const contato = contatoDe(r.telefone, r.whatsapp);
                  return (
                    <tr key={r.aluno_id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition">
                      <td className="px-3 py-2.5">
                        <p className="text-sm font-medium text-slate-200">{r.aluno_nome}</p>
                        <p className="text-xs text-blue-400">{r.curso_nome || 'Sem curso'}</p>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-slate-400">{r.professor_nome || '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-300">
                        {r.data_fim_contrato ? format(parseISO(r.data_fim_contrato), 'dd/MM/yy') : '—'}
                        {r.dias_ate_vencimento != null && (
                          <span className="text-xs text-slate-500 ml-1">
                            ({r.dias_ate_vencimento < 0 ? `${Math.abs(r.dias_ate_vencimento)}d atrás` : `${r.dias_ate_vencimento}d`})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {contato ? <CelulaContato {...contato} /> : <span className="text-xs text-slate-600">Sem contato</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
