import { useState, useMemo } from 'react';
import { useHistoricoLTV, type RegistroLTV } from '@/hooks/useHistoricoLTV';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { KPICard } from '@/components/ui/KPICard';
import { CelulaEditavelInline } from '@/components/ui/CelulaEditavelInline';
import {
  AreaChart as RechartsAreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  Users, Clock, Repeat2, BarChart3, Search, Plus, Trash2, ChevronUp, ChevronDown,
  ArrowUpDown, ChevronLeft, ChevronRight, Table2, Info, History,
} from 'lucide-react';
import { ModalPassagensAluno } from './ModalPassagensAluno';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

function ChartInsight({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 mt-3 px-1">
      <Info className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
      <p className="text-[11px] text-slate-500 leading-relaxed">{texto}</p>
    </div>
  );
}

const CATEGORIAS = [
  { value: 'Interrompido', label: 'Interrompido' },
  { value: 'Não renovou', label: 'Não renovou' },
  { value: 'Evadido', label: 'Evadido' },
  { value: 'Transferência', label: 'Transferência' },
];

const POR_PAGINA = 30;

type Ordenacao = { campo: keyof RegistroLTV; direcao: 'asc' | 'desc' };

interface TabHistoricoLTVProps {
  unidadeAtual: UnidadeId;
}

export function TabHistoricoLTV({ unidadeAtual }: TabHistoricoLTVProps) {
  const {
    registros, loading, kpis,
    atualizarRegistro, excluirRegistro, adicionarRegistro,
    anularPassagem, reverterAnulacao,
    dadosSobrevivencia, dadosHistograma, dadosEvolucao,
  } = useHistoricoLTV(unidadeAtual);
  const { user } = useAuth();

  // View toggle
  const [visao, setVisao] = useState<'tabela' | 'analytics'>('tabela');

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todos');
  const [filtroFonte, setFiltroFonte] = useState<'todos' | 'historico' | 'sistema'>('todos');

  // Ordenação
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ campo: 'tempo_permanencia_meses', direcao: 'desc' });

  // Paginação
  const [pagina, setPagina] = useState(1);

  // Modais
  const [registroExcluir, setRegistroExcluir] = useState<RegistroLTV | null>(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [novoRegistro, setNovoRegistro] = useState({ nome: '', tempo: '', categoria: 'Interrompido', mes_saida: '' });

  // Modal de passagens (chave = "nome|unidade_id")
  const [pessoaSelecionada, setPessoaSelecionada] = useState<string | null>(null);

  const passagensDaPessoa = useMemo(() => {
    if (!pessoaSelecionada) return [];
    return registros.filter(r => `${r.nome}|${r.unidade_id}` === pessoaSelecionada);
  }, [pessoaSelecionada, registros]);

  const nomePessoaSelecionada = passagensDaPessoa[0]?.nome || '';

  // Filtragem
  const dadosFiltrados = useMemo(() => {
    let dados = [...registros];

    if (busca.trim()) {
      const termo = busca.toLowerCase().trim();
      dados = dados.filter(r => r.nome.toLowerCase().includes(termo));
    }
    if (filtroCategoria !== 'todos') {
      dados = dados.filter(r => r.categoria_saida === filtroCategoria);
    }
    if (filtroFonte !== 'todos') {
      dados = dados.filter(r => r.fonte === filtroFonte);
    }

    return dados;
  }, [registros, busca, filtroCategoria, filtroFonte]);

  // Ordenação
  const dadosOrdenados = useMemo(() => {
    const sorted = [...dadosFiltrados];
    sorted.sort((a, b) => {
      const va = a[ordenacao.campo];
      const vb = b[ordenacao.campo];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return ordenacao.direcao === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      return ordenacao.direcao === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return sorted;
  }, [dadosFiltrados, ordenacao]);

  // Paginação
  const totalPaginas = Math.ceil(dadosOrdenados.length / POR_PAGINA);
  const dadosPaginados = useMemo(() => {
    const inicio = (pagina - 1) * POR_PAGINA;
    return dadosOrdenados.slice(inicio, inicio + POR_PAGINA);
  }, [dadosOrdenados, pagina]);

  // Reset página ao filtrar
  useMemo(() => { setPagina(1); }, [busca, filtroCategoria, filtroFonte]);

  function toggleOrdenacao(campo: keyof RegistroLTV) {
    setOrdenacao(prev =>
      prev.campo === campo
        ? { campo, direcao: prev.direcao === 'asc' ? 'desc' : 'asc' }
        : { campo, direcao: 'desc' }
    );
  }

  function renderSortIcon(campo: keyof RegistroLTV) {
    if (ordenacao.campo !== campo) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return ordenacao.direcao === 'asc'
      ? <ChevronUp className="w-3 h-3 text-cyan-400" />
      : <ChevronDown className="w-3 h-3 text-cyan-400" />;
  }

  async function handleAdicionarRegistro() {
    const tempo = parseInt(novoRegistro.tempo);
    if (!novoRegistro.nome.trim() || isNaN(tempo) || tempo < 1) {
      return;
    }
    await adicionarRegistro({
      nome: novoRegistro.nome.trim(),
      tempo_permanencia_meses: tempo,
      categoria_saida: novoRegistro.categoria,
      mes_saida: novoRegistro.mes_saida.trim() || null,
      unidade_id: unidadeAtual !== 'todos' ? unidadeAtual : null,
    });
    setModalNovo(false);
    setNovoRegistro({ nome: '', tempo: '', categoria: 'Interrompido', mes_saida: '' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Total Ex-Alunos"
          icon={Users}
          value={kpis.totalExAlunos}
          variant="cyan"
          size="sm"
        />
        <KPICard
          label="Tempo Médio"
          icon={Clock}
          value={`${kpis.tempoMedio.toFixed(1)}m`}
          variant="emerald"
          size="sm"
        />
        <KPICard
          label="Taxa de Retorno"
          icon={Repeat2}
          value={`${kpis.taxaRetorno.toFixed(1)}%`}
          variant="amber"
          size="sm"
          subvalue="alunos com 2+ passagens"
        />
        <KPICard
          label="Sistema (registrados)"
          icon={BarChart3}
          value={kpis.totalSistema}
          variant="violet"
          size="sm"
        />
      </div>

      {/* Toggle Tabela / Analytics */}
      <div className="flex items-center gap-1 bg-slate-800/70 rounded-lg p-1 w-fit">
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
            visao === 'tabela'
              ? "bg-slate-700 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          )}
          onClick={() => setVisao('tabela')}
        >
          <Table2 className="w-4 h-4" />
          Tabela
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
            visao === 'analytics'
              ? "bg-slate-700 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          )}
          onClick={() => setVisao('analytics')}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics
        </button>
      </div>

      {visao === 'analytics' ? (
        <div className="space-y-4">
          {/* Linha 1: Sobrevivência + Histograma */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Curva de Sobrevivência */}
            {(() => {
              const pct6 = dadosSobrevivencia.find(d => d.name === '6m')?.percentual ?? 0;
              const pct12 = dadosSobrevivencia.find(d => d.name === '12m')?.percentual ?? 0;
              const pct24 = dadosSobrevivencia.find(d => d.name === '24m')?.percentual ?? 0;
              return (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white">Curva de Sobrevivência</h3>
                  <ChartInsight texto={`Cada ponto mostra o % de ex-alunos que ficaram pelo menos X meses. Aos 12 meses, ${pct12}% dos alunos ainda estavam na escola.`} />
                  <div className="mt-4" />
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsAreaChart data={dadosSobrevivencia}>
                      <defs>
                        <linearGradient id="grad-sobrevivencia" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '11px' }} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (active && payload?.length) {
                            return (
                              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                                <p className="text-white font-medium">{payload[0].payload.name}</p>
                                <p className="text-sm text-cyan-400">
                                  Permanência: <span className="font-bold">{payload[0].value}%</span>
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '5 5' }}
                      />
                      <Area type="monotone" dataKey="percentual" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#grad-sobrevivencia)" />
                      <ReferenceLine x="6m" stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `Adaptação ${pct6}%`, position: 'insideTopRight', fill: '#f59e0b', fontSize: 9, dy: -5 }} />
                      <ReferenceLine x="12m" stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `1 ano ${pct12}%`, position: 'insideTopRight', fill: '#ef4444', fontSize: 9, dy: -5 }} />
                      <ReferenceLine x="24m" stroke="#8b5cf6" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `2 anos ${pct24}%`, position: 'insideTopRight', fill: '#8b5cf6', fontSize: 9, dy: -5 }} />
                    </RechartsAreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* Histograma de Permanência */}
            {(() => {
              const faixaMaior = dadosHistograma.reduce((max, d) => d.quantidade > max.quantidade ? d : max, dadosHistograma[0]);
              return (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white">Distribuição por Faixa</h3>
                  <ChartInsight texto={`Mostra quantos ex-alunos ficaram em cada faixa de tempo. A faixa com mais alunos é ${faixaMaior?.name} (${faixaMaior?.quantidade} alunos). Faixas à direita indicam alunos mais fidelizados.`} />
                  <div className="mt-4" />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dadosHistograma} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="grad-bar-histograma" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#0e7490" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '12px' }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (active && payload?.length) {
                            const pct = kpis.totalExAlunos > 0 ? ((payload[0].value / kpis.totalExAlunos) * 100).toFixed(1) : '0';
                            return (
                              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                                <p className="text-white font-medium">{payload[0].payload.name}</p>
                                <p className="text-sm text-cyan-400">
                                  Alunos: <span className="font-bold">{payload[0].value}</span>
                                  <span className="text-slate-400 ml-1">({pct}%)</span>
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ fill: 'rgba(6, 182, 212, 0.08)' }}
                      />
                      <Bar dataKey="quantidade" fill="url(#grad-bar-histograma)" radius={[6, 6, 0, 0]} animationDuration={800} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>

          {/* Linha 2: Evolução */}
          {(() => {
            const primeiro = dadosEvolucao[0]?.media ?? 0;
            const ultimo = dadosEvolucao[dadosEvolucao.length - 1]?.media ?? 0;
            const variacao = primeiro > 0 ? ((ultimo - primeiro) / primeiro) * 100 : 0;
            const maiorPonto = dadosEvolucao.reduce((max, d) => d.media > max.media ? d : max, dadosEvolucao[0] || { name: '', media: 0 });
            const menorPonto = dadosEvolucao.reduce((min, d) => d.media < min.media ? d : min, dadosEvolucao[0] || { name: '', media: 0 });

            return (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold text-white">Evolução do Tempo Médio por Mês de Saída</h3>
                  {dadosEvolucao.length >= 2 && (
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      variacao >= 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-rose-500/15 text-rose-400"
                    )}>
                      {variacao >= 0 ? '↑' : '↓'} {Math.abs(variacao).toFixed(1)}%
                    </span>
                  )}
                </div>
                <ChartInsight texto="Tendência subindo = retenção melhorando. Quedas bruscas podem indicar eventos pontuais (ex: reajuste de preço, troca de professor)." />

                {dadosEvolucao.length >= 2 && (
                  <div className="flex items-center gap-4 mt-3 mb-2">
                    <span className="text-[11px] text-slate-500">
                      Pico: <span className="text-emerald-400 font-medium">{maiorPonto.media}m</span> ({maiorPonto.name})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Mínimo: <span className="text-rose-400 font-medium">{menorPonto.media}m</span> ({menorPonto.name})
                    </span>
                  </div>
                )}

                <div className="mt-2">
                  <ResponsiveContainer width="100%" height={280}>
                    <RechartsAreaChart data={dadosEvolucao} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="grad-evolucao" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '10px' }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}m`} />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (active && payload?.length) {
                            return (
                              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                                <p className="text-white font-medium text-sm">{payload[0].payload.name}</p>
                                <p className="text-sm text-violet-400">
                                  Tempo Médio: <span className="font-bold">{payload[0].value}m</span>
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {payload[0].payload.quantidade} aluno{payload[0].payload.quantidade !== 1 ? 's' : ''} saíram
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '5 5' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="media"
                        stroke="#8b5cf6"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#grad-evolucao)"
                        dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4, stroke: '#1e1b4b' }}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: '#8b5cf6', fill: '#fff' }}
                        animationDuration={800}
                      />
                    </RechartsAreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <>
      {/* Filtros + Adicionar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Buscar por nome..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-slate-800 border-slate-700 text-sm"
          />
        </div>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-[160px] h-9 bg-slate-800 border-slate-700 text-sm">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas categorias</SelectItem>
            {CATEGORIAS.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroFonte} onValueChange={v => setFiltroFonte(v as typeof filtroFonte)}>
          <SelectTrigger className="w-[140px] h-9 bg-slate-800 border-slate-700 text-sm">
            <SelectValue placeholder="Fonte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas fontes</SelectItem>
            <SelectItem value="historico">Histórico</SelectItem>
            <SelectItem value="sistema">Sistema</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-9 bg-cyan-600 hover:bg-cyan-700 text-white"
          onClick={() => setModalNovo(true)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Novo
        </Button>
      </div>

      {/* Info */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400">
        Apenas ex-alunos com <strong className="text-white">4+ meses</strong> de permanência. Bolsistas, banda e segundo curso excluídos.
        <span className="ml-2 text-slate-500">
          {dadosFiltrados.length} registros encontrados
        </span>
      </div>

      {/* Tabela */}
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/80 sticky top-0 z-10">
              <tr className="border-b border-slate-700">
                <th className="text-center py-2.5 px-2 text-slate-400 font-medium w-12">#</th>
                <th
                  className="text-left py-2.5 px-3 text-slate-400 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleOrdenacao('nome')}
                >
                  <div className="flex items-center gap-1">
                    Nome do Aluno {renderSortIcon('nome')}
                  </div>
                </th>
                <th
                  className="text-center py-2.5 px-3 text-slate-400 font-medium w-24 cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleOrdenacao('tempo_permanencia_meses')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Meses {renderSortIcon('tempo_permanencia_meses')}
                  </div>
                </th>
                <th
                  className="text-center py-2.5 px-3 text-slate-400 font-medium w-36 cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleOrdenacao('categoria_saida')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Categoria {renderSortIcon('categoria_saida')}
                  </div>
                </th>
                <th className="text-center py-2.5 px-3 text-slate-400 font-medium w-36">Mês Saída</th>
                <th
                  className="text-center py-2.5 px-3 text-slate-400 font-medium w-24 cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleOrdenacao('fonte')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Fonte {renderSortIcon('fonte')}
                  </div>
                </th>
                <th className="text-center py-2.5 px-3 text-slate-400 font-medium w-16">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {dadosPaginados.map((reg, i) => {
                const numGlobal = (pagina - 1) * POR_PAGINA + i + 1;
                const editavel = reg.fonte === 'historico';

                return (
                  <tr key={`${reg.fonte}-${reg.id}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="text-center py-1.5 px-2 text-slate-500 text-xs font-mono">
                      {numGlobal}
                    </td>
                    <td
                      className="py-1.5 px-3 text-slate-300 truncate max-w-[300px] cursor-pointer hover:text-cyan-400 hover:underline transition-colors"
                      onClick={() => setPessoaSelecionada(`${reg.nome}|${reg.unidade_id}`)}
                      title="Ver passagens deste aluno"
                    >
                      {reg.nome}
                      {reg.qtd_passagens_pessoa >= 2 && (
                        <span className="ml-2 text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded font-medium">
                          ↻ {reg.qtd_passagens_pessoa}x
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      {editavel ? (
                        <CelulaEditavelInline
                          value={reg.tempo_permanencia_meses}
                          tipo="numero"
                          onChange={async (val) => {
                            await atualizarRegistro(reg.id, 'tempo_permanencia_meses', val as number);
                          }}
                        />
                      ) : (
                        <span className={cn(
                          "font-mono font-medium",
                          reg.tempo_permanencia_meses >= 24 ? "text-emerald-400" :
                          reg.tempo_permanencia_meses >= 12 ? "text-cyan-400" : "text-amber-400"
                        )}>
                          {reg.tempo_permanencia_meses}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      {editavel ? (
                        <CelulaEditavelInline
                          value={reg.categoria_saida}
                          tipo="select"
                          opcoes={CATEGORIAS}
                          onChange={async (val) => {
                            await atualizarRegistro(reg.id, 'categoria_saida', val as string);
                          }}
                        />
                      ) : (
                        <span className="text-slate-400 text-xs">{reg.categoria_saida}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      {editavel ? (
                        <CelulaEditavelInline
                          value={reg.mes_saida || ''}
                          tipo="texto"
                          placeholder="—"
                          onChange={async (val) => {
                            await atualizarRegistro(reg.id, 'mes_saida', val as string || null);
                          }}
                        />
                      ) : (
                        <span className="text-slate-500 text-xs">{reg.mes_saida || '—'}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <span className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full font-medium",
                        reg.fonte === 'historico'
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-emerald-500/15 text-emerald-400"
                      )}>
                        {reg.fonte === 'historico' ? 'Histórico' : 'Sistema'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-500 hover:text-violet-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPessoaSelecionada(`${reg.nome}|${reg.unidade_id}`);
                          }}
                          title="Ver passagens"
                        >
                          <History className="w-3.5 h-3.5" />
                        </Button>
                        {editavel ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-rose-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRegistroExcluir(reg);
                            }}
                            title="Excluir definitivo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {dadosPaginados.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Nenhum registro encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, dadosOrdenados.length)} de {dadosOrdenados.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => setPagina(p => p - 1)}
              className="h-8 border-slate-700 text-slate-400"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Anterior
            </Button>
            <span className="text-xs text-slate-500">
              {pagina} / {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina(p => p + 1)}
              className="h-8 border-slate-700 text-slate-400"
            >
              Próximo
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

        </>
      )}

      {/* Modal de passagens da pessoa */}
      {pessoaSelecionada && passagensDaPessoa.length > 0 && (
        <ModalPassagensAluno
          nome={nomePessoaSelecionada}
          passagens={passagensDaPessoa}
          userName={user?.email || 'sistema'}
          onClose={() => setPessoaSelecionada(null)}
          onAnular={anularPassagem}
          onReverter={reverterAnulacao}
        />
      )}

      {/* Modal de confirmação de exclusão */}
      <AlertDialog open={!!registroExcluir} onOpenChange={() => setRegistroExcluir(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir registro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o registro de <strong className="text-white">{registroExcluir?.nome}</strong> ({registroExcluir?.tempo_permanencia_meses} meses)?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (registroExcluir) {
                  excluirRegistro(registroExcluir.id);
                  setRegistroExcluir(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de novo registro */}
      <Dialog open={modalNovo} onOpenChange={setModalNovo}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Novo Registro de Histórico</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Nome do Aluno</Label>
              <Input
                placeholder="Nome completo"
                value={novoRegistro.nome}
                onChange={e => setNovoRegistro(p => ({ ...p, nome: e.target.value }))}
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Tempo (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Ex: 12"
                  value={novoRegistro.tempo}
                  onChange={e => setNovoRegistro(p => ({ ...p, tempo: e.target.value }))}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Categoria</Label>
                <Select
                  value={novoRegistro.categoria}
                  onValueChange={v => setNovoRegistro(p => ({ ...p, categoria: v }))}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Mês de Saída</Label>
              <Input
                placeholder="Ex: Janeiro/2025"
                value={novoRegistro.mes_saida}
                onChange={e => setNovoRegistro(p => ({ ...p, mes_saida: e.target.value }))}
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNovo(false)} className="border-slate-700 text-slate-300">
              Cancelar
            </Button>
            <Button
              className="bg-cyan-600 hover:bg-cyan-700"
              disabled={!novoRegistro.nome.trim() || !novoRegistro.tempo}
              onClick={handleAdicionarRegistro}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
