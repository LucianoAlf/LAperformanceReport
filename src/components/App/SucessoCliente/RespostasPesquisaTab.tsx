import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Star, Send, MessageCircle, TrendingUp, Loader2, BarChart3, Plus } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useAnalisePesquisas } from './hooks/useAnalisePesquisas';
import { ModalLancarRespostaManual } from './ModalLancarRespostaManual';

interface Props {
  unidadeAtual: UnidadeId;
  onAbrirConversa?: (alunoId: number) => void;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function Estrelas({ nota }: { nota: number }) {
  return <span className="text-amber-400">{'⭐'.repeat(nota)}</span>;
}

export function RespostasPesquisaTab({ unidadeAtual, onAbrirConversa }: Props) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth()); // 0-11
  const [modalAberto, setModalAberto] = useState(false);

  const { dataInicio, dataFim } = useMemo(() => {
    const base = new Date(ano, mes, 1);
    return {
      dataInicio: format(startOfMonth(base), 'yyyy-MM-dd'),
      dataFim: format(endOfMonth(base), 'yyyy-MM-dd'),
    };
  }, [ano, mes]);

  const { analise, respostas, loading, recarregar } = useAnalisePesquisas(unidadeAtual, dataInicio, dataFim);

  const kpis = analise?.kpis;
  const distribuicao = kpis?.distribuicao || {};
  const maxDist = Math.max(1, ...Object.values(distribuicao).map((v) => Number(v) || 0));
  const vazio = !loading && (!kpis || kpis.enviadas === 0);

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex items-center gap-3">
        <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i} value={String(i)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2025">2025</SelectItem>
            <SelectItem value="2026">2026</SelectItem>
          </SelectContent>
        </Select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-violet-500" />}

        <button
          onClick={() => setModalAberto(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-violet-500 to-pink-500 text-white hover:opacity-90 transition"
        >
          <Plus className="w-4 h-4" />
          Lançar resposta manual
        </button>
      </div>

      {vazio ? (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 py-16 text-center text-slate-500">
          Nenhuma pesquisa enviada neste período.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Enviadas</p>
                  <p className="text-2xl font-bold text-white mt-1">{kpis?.enviadas || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center">
                  <Send className="w-6 h-6 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Taxa de resposta</p>
                  <p className="text-2xl font-bold text-blue-400 mt-1">{kpis?.taxa_resposta || 0}%</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-blue-400" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">{kpis?.respondidas || 0} respondidas</p>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Nota média</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">
                    {(kpis?.nota_media ?? 0).toFixed(2)} ★
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Star className="w-6 h-6 text-amber-400" />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-sm mb-2">Distribuição</p>
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map((n) => {
                  const qtd = Number(distribuicao[String(n)] || 0);
                  return (
                    <div key={n} className="flex items-center gap-2 text-xs">
                      <span className="text-amber-400 w-6">{n}★</span>
                      <div className="flex-1 bg-slate-700/50 rounded h-2 overflow-hidden">
                        <div className="bg-amber-400 h-full" style={{ width: `${(qtd / maxDist) * 100}%` }} />
                      </div>
                      <span className="text-slate-400 w-6 text-right">{qtd}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Evolução + Por professor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-violet-400" />
                <h3 className="font-medium text-white">Evolução (nota média por semana)</h3>
              </div>
              {analise && analise.evolucao.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={analise.evolucao}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="periodo"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={(v) => format(new Date(v + 'T00:00:00'), 'dd/MM')}
                    />
                    <YAxis domain={[0, 5]} stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff' }}
                      labelFormatter={(v) => format(new Date(v + 'T00:00:00'), 'dd/MM/yyyy')}
                      formatter={(value: any) => [`${Number(value).toFixed(2)} ★`, 'Nota média']}
                    />
                    <Line type="monotone" dataKey="nota_media" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 text-sm py-8 text-center">Sem respostas no período.</p>
              )}
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-violet-400" />
                <h3 className="font-medium text-white">Por professor</h3>
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {analise && analise.por_professor.length > 0 ? (
                  analise.por_professor.map((p) => (
                    <div key={p.professor_nome} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{p.professor_nome}</span>
                      <span className={`font-medium ${p.nota_media < 3 ? 'text-red-400' : 'text-amber-400'}`}>
                        {p.nota_media.toFixed(1)} ★ <span className="text-slate-500 text-xs">({p.qtd})</span>
                        {p.nota_media < 3 && ' ⚠'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-sm">Sem dados.</p>
                )}
              </div>
            </div>
          </div>

          {/* Por unidade + Por curso */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <h3 className="font-medium text-white mb-3">Por unidade</h3>
              <div className="space-y-2">
                {analise && analise.por_unidade.length > 0 ? (
                  analise.por_unidade.map((u) => (
                    <div key={u.unidade_nome} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{u.unidade_nome}</span>
                      <span className="text-amber-400 font-medium">
                        {u.nota_media.toFixed(1)} ★ <span className="text-slate-500 text-xs">({u.qtd})</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-sm">Sem dados.</p>
                )}
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <h3 className="font-medium text-white mb-3">Por curso</h3>
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {analise && analise.por_curso.length > 0 ? (
                  analise.por_curso.map((c) => (
                    <div key={c.curso_nome} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{c.curso_nome}</span>
                      <span className="text-amber-400 font-medium">
                        {c.nota_media.toFixed(1)} ★ <span className="text-slate-500 text-xs">({c.qtd})</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-sm">Sem dados.</p>
                )}
              </div>
            </div>
          </div>

          {/* Registro de pesquisas */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="font-medium text-white">Registro de pesquisas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/80 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Aluno</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Nota</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Curso</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Professor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Unidade</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Respondido</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {respostas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        Nenhuma pesquisa enviada neste período
                      </td>
                    </tr>
                  ) : (
                    respostas.map((r) => {
                      const aguardando = r.status === 'aguardando';
                      const baixa = !aguardando && r.nota !== null && r.nota <= 2;
                      return (
                        <tr key={r.pesquisa_id} className={baixa ? 'bg-red-900/10' : 'hover:bg-slate-700/30'}>
                          <td className="px-4 py-3 text-white font-medium">{r.nome}</td>
                          <td className="px-4 py-3 text-center">
                            {aguardando ? (
                              <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">
                                Aguardando resposta
                              </span>
                            ) : (
                              <Estrelas nota={r.nota!} />
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-300">{r.curso_nome || '—'}</td>
                          <td className="px-4 py-3 text-slate-300">{r.professor_nome || '—'}</td>
                          <td className="px-4 py-3 text-slate-300">{r.unidade_nome || '—'}</td>
                          <td className="px-4 py-3 text-center text-slate-400 text-sm">
                            {aguardando
                              ? `Enviado ${r.enviado_em ? format(new Date(r.enviado_em), 'dd/MM/yy', { locale: ptBR }) : '—'}`
                              : r.respondido_em ? format(new Date(r.respondido_em), 'dd/MM/yy', { locale: ptBR }) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {baixa && onAbrirConversa ? (
                              <button
                                onClick={() => onAbrirConversa(r.aluno_id)}
                                className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2"
                              >
                                Abrir conversa
                              </button>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ModalLancarRespostaManual
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        unidadeAtual={unidadeAtual}
        onSaved={recarregar}
      />
    </div>
  );
}
