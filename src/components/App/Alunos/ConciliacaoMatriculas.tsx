import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AlertTriangle, RefreshCw, Check, X, Loader2, Link2, UserX, Copy, HelpCircle,
  Search, MoreVertical, DollarSign, GraduationCap, ChevronLeft, ChevronRight, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface ConciliacaoItem {
  id: number;
  aluno_id: number | null;
  aluno_nome: string | null;
  unidade_id: string | null;
  unidade_nome: string | null;
  tipo_divergencia: string;
  campo: string | null;
  valor_nosso: any;
  valor_api: any;
  sugestao: any;
  severidade: string | null;
  detectado_em: string | null;
  emusys_matricula_id: string | null;
  curso_nome: string | null;
}

interface ConciliacaoPayload {
  resumo: Record<string, number>;
  items: ConciliacaoItem[];
}

interface TipoMatricula { id: number; codigo: string; nome: string }

const TIPO_META: Record<string, { label: string; descricao: string; icon: typeof Link2; cor: string }> = {
  ambiguo: { label: 'Ambíguo', descricao: 'Várias matrículas ativas, nenhuma casa o curso do nosso cadastro', icon: Copy, cor: 'amber' },
  ausente_api: { label: 'Ausente na API', descricao: 'Ativo no nosso sistema, mas não existe na API do Emusys', icon: UserX, cor: 'red' },
  valor_divergente: { label: 'Valor divergente', descricao: 'Parcela comercial difere da API canônica do Emusys', icon: DollarSign, cor: 'orange' },
  classificacao_divergente: { label: 'Classificação', descricao: 'Tipo (bolsista/regular) não bate com a realidade da API', icon: GraduationCap, cor: 'sky' },
  duas_matriculas: { label: '2× mesmo curso', descricao: 'Duas matrículas do mesmo curso (ex.: 2 aulas/semana)', icon: Copy, cor: 'cyan' },
  disciplina_nao_mapeada: { label: 'Disciplina nova', descricao: 'Disciplina do Emusys sem mapeamento para curso', icon: HelpCircle, cor: 'violet' },
  professor_nao_mapeado: { label: 'Professor novo', descricao: 'Professor do Emusys sem mapeamento', icon: HelpCircle, cor: 'violet' },
  valor_fixado_divergente: { label: 'Valor fixado diverge', descricao: 'Valor editado manualmente difere da API', icon: AlertTriangle, cor: 'orange' },
};

const COR_CLASSES: Record<string, string> = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  orange: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

const PER_PAGE = 20;

function fmtBRL(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "tipo aplicável" = divergência com sugestão que dá pra aplicar direto da API
function temSugestaoAplicavel(item: ConciliacaoItem): boolean {
  return (item.tipo_divergencia === 'valor_divergente' || item.tipo_divergencia === 'classificacao_divergente') && item.sugestao != null;
}

function descreverNosso(item: ConciliacaoItem, tiposMap: Map<string, TipoMatricula>): string {
  if (item.tipo_divergencia === 'classificacao_divergente') {
    const cod = item.valor_nosso?.tipo;
    return cod ? (tiposMap.get(cod)?.nome || cod) : '—';
  }
  if (item.tipo_divergencia === 'valor_divergente') {
    return item.curso_nome || 'Sem valor de parcela';
  }
  return item.curso_nome || (item.valor_nosso?.curso_id ? `curso ${item.valor_nosso.curso_id}` : '—');
}

function descreverApi(item: ConciliacaoItem, tiposMap: Map<string, TipoMatricula>): string {
  const v = item.valor_api;
  if (!v) return '—';
  if (item.tipo_divergencia === 'valor_divergente') {
    const parcelaComercial = v.parcela_comercial ?? item.sugestao;
    return `cheio ${fmtBRL(v.cheio)} − desconto condicional ${fmtBRL(v.cond)} → parcela ${fmtBRL(parcelaComercial)}`;
  }
  if (item.tipo_divergencia === 'classificacao_divergente') {
    const sug = tiposMap.get(v.tipo_sugerido)?.nome || v.tipo_sugerido;
    const pagaTxt = (Number(v.efetivo) || 0) > 0 ? `paga ~${fmtBRL(v.efetivo)}` : 'não paga';
    return `bolsa: ${v.bolsa ? 'sim' : 'não'} · ${pagaTxt} → sugere ${sug}`;
  }
  if (Array.isArray(v.candidatos)) {
    return v.candidatos.map((c: any) => `#${c.id}: ${(c.disciplinas || []).join(', ')}`).join('  |  ');
  }
  if (v.nome) return '(não encontrado na API)';
  if (v.cursos) return `cursos: ${v.cursos.join(', ')}`;
  if (v.disciplina_id) return `disciplina ${v.disciplina_id}`;
  return JSON.stringify(v);
}

export function ConciliacaoMatriculas({ unidadeId }: { unidadeId?: string | null }) {
  const [dados, setDados] = useState<ConciliacaoPayload>({ resumo: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<Set<number>>(new Set());
  const [tipos, setTipos] = useState<TipoMatricula[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);

  // filtros
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todas');
  const [pagina, setPagina] = useState(1);

  // seleção em lote
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [processandoLote, setProcessandoLote] = useState(false);

  // modais
  const [modalValor, setModalValor] = useState<{ item: ConciliacaoItem; valor: string } | null>(null);
  const [modalReclass, setModalReclass] = useState<{ item: ConciliacaoItem; tipoId: string } | null>(null);

  const tiposMap = useMemo(() => new Map(tipos.map(t => [t.codigo, t])), [tipos]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_conciliacao_matriculas', {
        p_unidade_id: unidadeId && unidadeId !== 'todos' ? unidadeId : null,
      });
      if (error) throw error;
      setDados((data as ConciliacaoPayload) || { resumo: {}, items: [] });
      setSelecionados(new Set());
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar a conciliação');
      setDados({ resumo: {}, items: [] });
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    supabase.from('tipos_matricula').select('id, codigo, nome').then(({ data }) => setTipos(data || []));
    supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setUnidades(data || []));
  }, []);

  // reset de página ao mudar filtro
  useEffect(() => { setPagina(1); }, [busca, filtroTipo, filtroUnidade]);

  const itemsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados.items || []).filter(i => {
      if (filtroTipo && i.tipo_divergencia !== filtroTipo) return false;
      if (filtroUnidade !== 'todas' && i.unidade_id !== filtroUnidade) return false;
      if (q && !(i.aluno_nome || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [dados.items, busca, filtroTipo, filtroUnidade]);

  const totalPaginas = Math.max(1, Math.ceil(itemsFiltrados.length / PER_PAGE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const itemsPagina = itemsFiltrados.slice((paginaAtual - 1) * PER_PAGE, paginaAtual * PER_PAGE);

  // Resolve uma divergência: aplica no aluno (se houver campo/valor), fixa o campo,
  // registra a decisão e marca como resolvida. Retorna true em sucesso.
  const resolverDivergencia = useCallback(async (
    item: ConciliacaoItem,
    opts: { decisao: string; campo?: string; valor?: any; motivo?: string },
  ): Promise<boolean> => {
    const { data: authData } = await supabase.auth.getUser();
    const email = authData.user?.email || 'usuario_app';
    const agora = new Date().toISOString();

    if (opts.campo && opts.valor !== undefined && opts.valor !== null && item.aluno_id) {
      const { error: eUpd } = await supabase.from('alunos')
        .update({ [opts.campo]: opts.valor, updated_at: agora }).eq('id', item.aluno_id);
      if (eUpd) throw eUpd;
      const { error: eFix } = await supabase.from('matriculas_campos_fixados')
        .upsert({ aluno_id: item.aluno_id, campo: opts.campo, valor: opts.valor, fixado_por: email, fixado_em: agora },
          { onConflict: 'aluno_id,campo' });
      if (eFix) throw eFix;
    }

    const { error: eDec } = await supabase.from('matriculas_divergencias_decisoes').upsert({
      divergencia_id: item.id, aluno_id: item.aluno_id, decisao: opts.decisao,
      valor_escolhido: opts.valor ?? null,
      motivo: opts.motivo || `Decisão via aba de conciliação: ${opts.decisao}`,
      decidido_por: email, metadata: { tipo: item.tipo_divergencia, aluno_nome: item.aluno_nome, campo: opts.campo ?? null },
      updated_at: agora,
    }, { onConflict: 'divergencia_id' });
    if (eDec) throw eDec;

    const { error: eRes } = await supabase.from('matriculas_divergencias')
      .update({ resolvido: true, updated_at: agora }).eq('id', item.id);
    if (eRes) throw eRes;
    return true;
  }, []);

  const removerDoEstado = useCallback((ids: number[]) => {
    const idSet = new Set(ids);
    setDados(prev => {
      const removidos = prev.items.filter(i => idSet.has(i.id));
      const resumo = { ...prev.resumo };
      for (const r of removidos) resumo[r.tipo_divergencia] = Math.max(0, (resumo[r.tipo_divergencia] || 1) - 1);
      return { resumo, items: prev.items.filter(i => !idSet.has(i.id)) };
    });
    setSelecionados(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
  }, []);

  const executarUm = useCallback(async (
    item: ConciliacaoItem, opts: { decisao: string; campo?: string; valor?: any; motivo?: string },
  ) => {
    setSalvando(prev => new Set(prev).add(item.id));
    try {
      await resolverDivergencia(item, opts);
      removerDoEstado([item.id]);
      toast.success('Decisão registrada.');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar a decisão');
    } finally {
      setSalvando(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }, [resolverDivergencia, removerDoEstado]);

  // converte uma divergência "aplicável" nas opções de gravação a partir da sugestão da API
  const opcoesAplicarApi = useCallback((item: ConciliacaoItem): { campo: string; valor: any } | null => {
    if (item.tipo_divergencia === 'valor_divergente') {
      return { campo: 'valor_parcela', valor: Number(item.sugestao) };
    }
    if (item.tipo_divergencia === 'classificacao_divergente') {
      const t = tiposMap.get(String(item.sugestao));
      if (!t) return null;
      return { campo: 'tipo_matricula_id', valor: t.id };
    }
    return null;
  }, [tiposMap]);

  const aplicarApi = useCallback((item: ConciliacaoItem) => {
    const op = opcoesAplicarApi(item);
    if (!op) { toast.error('Sem sugestão aplicável.'); return; }
    executarUm(item, { decisao: 'aplicar_api', ...op, motivo: 'Aplicado valor/dado da API do Emusys' });
  }, [opcoesAplicarApi, executarUm]);

  // ações em lote
  const aplicarLote = useCallback(async () => {
    const alvos = itemsFiltrados.filter(i => selecionados.has(i.id) && temSugestaoAplicavel(i));
    if (!alvos.length) { toast.error('Nenhum selecionado com sugestão aplicável.'); return; }
    setProcessandoLote(true);
    const res = await Promise.allSettled(alvos.map(i => {
      const op = opcoesAplicarApi(i);
      return op ? resolverDivergencia(i, { decisao: 'aplicar_api', ...op, motivo: 'Aplicado em lote (API)' }) : Promise.reject();
    }));
    const okIds = alvos.filter((_, idx) => res[idx].status === 'fulfilled').map(i => i.id);
    removerDoEstado(okIds);
    const falhas = res.length - okIds.length;
    toast[falhas ? 'warning' : 'success'](`${okIds.length} aplicada(s)${falhas ? `, ${falhas} falha(s)` : ''}.`);
    setProcessandoLote(false);
  }, [itemsFiltrados, selecionados, opcoesAplicarApi, resolverDivergencia, removerDoEstado]);

  const ignorarLote = useCallback(async () => {
    const alvos = itemsFiltrados.filter(i => selecionados.has(i.id));
    if (!alvos.length) return;
    setProcessandoLote(true);
    const res = await Promise.allSettled(alvos.map(i => resolverDivergencia(i, { decisao: 'ignorar', motivo: 'Ignorado em lote' })));
    const okIds = alvos.filter((_, idx) => res[idx].status === 'fulfilled').map(i => i.id);
    removerDoEstado(okIds);
    const falhas = res.length - okIds.length;
    toast[falhas ? 'warning' : 'success'](`${okIds.length} ignorada(s)${falhas ? `, ${falhas} falha(s)` : ''}.`);
    setProcessandoLote(false);
  }, [itemsFiltrados, selecionados, resolverDivergencia, removerDoEstado]);

  const toggleSel = (id: number) => setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelTodosPagina = () => {
    const idsPagina = itemsPagina.map(i => i.id);
    const todosMarcados = idsPagina.every(id => selecionados.has(id));
    setSelecionados(prev => {
      const n = new Set(prev);
      idsPagina.forEach(id => todosMarcados ? n.delete(id) : n.add(id));
      return n;
    });
  };

  const totalAberto = itemsFiltrados.length;
  const mostrarFiltroUnidade = (!unidadeId || unidadeId === 'todos') && unidades.length > 1;

  return (
    <div className="space-y-4 pb-24">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-cyan-400" /> Conciliação Emusys
          </h3>
          <p className="text-sm text-slate-400">
            Divergências entre o nosso cadastro e a API do Emusys que precisam de decisão humana.
          </p>
        </div>
        <button onClick={carregar} disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50 disabled:opacity-50">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {/* Cards de resumo por tipo (clicáveis = filtro) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(dados.resumo || {}).map(([tipo, qtd]) => {
          const meta = TIPO_META[tipo] || { label: tipo, descricao: '', icon: HelpCircle, cor: 'amber' };
          const Icon = meta.icon;
          const ativo = filtroTipo === tipo;
          return (
            <button key={tipo} onClick={() => setFiltroTipo(ativo ? null : tipo)}
              className={cn('text-left rounded-lg border p-3 transition', COR_CLASSES[meta.cor], ativo ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/60' : 'opacity-90 hover:opacity-100')}>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
                <Icon className="w-3.5 h-3.5" /> {meta.label}
              </div>
              <div className="mt-1 text-2xl font-bold">{qtd}</div>
              <div className="mt-1 text-[11px] opacity-70 leading-tight">{meta.descricao}</div>
            </button>
          );
        })}
        {Object.keys(dados.resumo || {}).length === 0 && !loading && (
          <div className="col-span-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300 text-sm flex items-center gap-2">
            <Check className="w-4 h-4" /> Nenhuma divergência pendente. Tudo conciliado.
          </div>
        )}
      </div>

      {/* Filtros */}
      {!loading && (dados.items || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Buscar aluno..." value={busca} onChange={e => setBusca(e.target.value)}
              className="w-[220px] bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 h-10" />
          </div>
          {filtroTipo && (
            <button onClick={() => setFiltroTipo(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 h-10 text-sm text-slate-300 hover:bg-slate-700/50">
              <X className="w-3.5 h-3.5" /> {TIPO_META[filtroTipo]?.label || filtroTipo}
            </button>
          )}
          {mostrarFiltroUnidade && (
            <Select value={filtroUnidade} onValueChange={setFiltroUnidade}>
              <SelectTrigger className={cn('w-[180px] h-10', filtroUnidade !== 'todas' && 'border-2 border-cyan-500 bg-cyan-500/10')}>
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <span className="text-sm text-slate-500 ml-auto">{totalAberto} divergência(s)</span>
        </div>
      )}

      {/* Lista de divergências */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando…
        </div>
      ) : totalAberto > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <Checkbox checked={itemsPagina.length > 0 && itemsPagina.every(i => selecionados.has(i.id))} onCheckedChange={toggleSelTodosPagina} />
                  </th>
                  <th className="px-4 py-3 font-medium">Aluno</th>
                  <th className="px-4 py-3 font-medium">Unidade</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Nosso cadastro</th>
                  <th className="px-4 py-3 font-medium">Na API do Emusys</th>
                  <th className="px-4 py-3 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {itemsPagina.map((item) => {
                  const meta = TIPO_META[item.tipo_divergencia] || { label: item.tipo_divergencia, cor: 'amber' };
                  const emProgresso = salvando.has(item.id);
                  const aplicavel = temSugestaoAplicavel(item);
                  return (
                    <tr key={item.id} className={cn('hover:bg-slate-700/20', selecionados.has(item.id) && 'bg-cyan-500/5')}>
                      <td className="px-3 py-3"><Checkbox checked={selecionados.has(item.id)} onCheckedChange={() => toggleSel(item.id)} /></td>
                      <td className="px-4 py-3 text-slate-200">{item.aluno_nome || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{item.unidade_nome || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', COR_CLASSES[meta.cor])}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{descreverNosso(item, tiposMap)}</td>
                      <td className="px-4 py-3 text-slate-400 max-w-md truncate" title={descreverApi(item, tiposMap)}>{descreverApi(item, tiposMap)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          {emProgresso ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1.5 hover:bg-slate-600 rounded transition" title="Ações">
                                  <MoreVertical className="w-4 h-4 text-slate-400" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                {aplicavel && (
                                  <DropdownMenuItem onClick={() => aplicarApi(item)}
                                    className="cursor-pointer text-emerald-400 focus:text-emerald-400 focus:bg-emerald-500/10">
                                    <Check className="w-4 h-4 mr-2" />
                                    {item.tipo_divergencia === 'valor_divergente'
                                      ? `Aplicar ${fmtBRL(item.sugestao)}`
                                      : `Aplicar: ${tiposMap.get(String(item.sugestao))?.nome || item.sugestao}`}
                                  </DropdownMenuItem>
                                )}
                                {item.tipo_divergencia === 'valor_divergente' && (
                                  <DropdownMenuItem onClick={() => setModalValor({ item, valor: String(item.sugestao ?? '') })}
                                    className="cursor-pointer text-blue-400 focus:text-blue-400 focus:bg-blue-500/10">
                                    <Pencil className="w-4 h-4 mr-2" /> Editar valor…
                                  </DropdownMenuItem>
                                )}
                                {item.tipo_divergencia === 'classificacao_divergente' && (
                                  <DropdownMenuItem onClick={() => setModalReclass({ item, tipoId: String(tiposMap.get(String(item.sugestao))?.id || '') })}
                                    className="cursor-pointer text-blue-400 focus:text-blue-400 focus:bg-blue-500/10">
                                    <GraduationCap className="w-4 h-4 mr-2" /> Reclassificar…
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => executarUm(item, { decisao: 'manter_nosso' })}
                                  className="cursor-pointer text-slate-300">
                                  <Check className="w-4 h-4 mr-2" /> Manter nosso
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => executarUm(item, { decisao: 'ignorar' })}
                                  className="cursor-pointer text-slate-400">
                                  <X className="w-4 h-4 mr-2" /> Ignorar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm text-slate-400">
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaAtual <= 1}
                className="p-1.5 rounded border border-slate-600 hover:bg-slate-700/50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <span>Página {paginaAtual} de {totalPaginas}</span>
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas}
                className="p-1.5 rounded border border-slate-600 hover:bg-slate-700/50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </>
      )}

      {/* Barra flutuante de ações em lote */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl px-6 py-4 flex items-center gap-4">
          <span className="text-white font-medium">{selecionados.size} selecionada(s)</span>
          <button onClick={aplicarLote} disabled={processandoLote}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white rounded-lg text-sm font-medium flex items-center gap-2">
            <Check className="w-4 h-4" /> {processandoLote ? 'Processando...' : 'Aplicar dado da API'}
          </button>
          <button onClick={ignorarLote} disabled={processandoLote}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
            <X className="w-4 h-4" /> Ignorar
          </button>
          <button onClick={() => setSelecionados(new Set())} className="text-slate-400 hover:text-white text-sm">Limpar</button>
        </div>
      )}

      {/* Modal: editar valor manual */}
      <Dialog open={!!modalValor} onOpenChange={(o) => !o && setModalValor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar valor da parcela</DialogTitle>
            <DialogDescription>
              {modalValor?.item.aluno_nome} — a API sugere {fmtBRL(modalValor?.item.sugestao)} (fonte de desconto ambígua, confira).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Valor da parcela (R$)</label>
            <input type="number" step="0.01" value={modalValor?.valor ?? ''}
              onChange={e => setModalValor(m => m && { ...m, valor: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
          </div>
          <DialogFooter>
            <button onClick={() => setModalValor(null)} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-sm">Cancelar</button>
            <button
              onClick={() => {
                if (!modalValor) return;
                const v = Number(modalValor.valor);
                if (!Number.isFinite(v) || v < 0) { toast.error('Valor inválido.'); return; }
                const item = modalValor.item;
                setModalValor(null);
                executarUm(item, { decisao: 'editar_manual', campo: 'valor_parcela', valor: v, motivo: 'Valor editado manualmente' });
              }}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium">Salvar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: reclassificar tipo */}
      <Dialog open={!!modalReclass} onOpenChange={(o) => !o && setModalReclass(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reclassificar tipo de matrícula</DialogTitle>
            <DialogDescription>
              {modalReclass?.item.aluno_nome} — a API sugere {tiposMap.get(String(modalReclass?.item.sugestao))?.nome || modalReclass?.item.sugestao}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Novo tipo</label>
            <Select value={modalReclass?.tipoId ?? ''} onValueChange={(v) => setModalReclass(m => m && { ...m, tipoId: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                {tipos.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <button onClick={() => setModalReclass(null)} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-sm">Cancelar</button>
            <button
              onClick={() => {
                if (!modalReclass) return;
                const tipoId = Number(modalReclass.tipoId);
                if (!tipoId) { toast.error('Selecione um tipo.'); return; }
                const item = modalReclass.item;
                setModalReclass(null);
                executarUm(item, { decisao: 'reclassificar', campo: 'tipo_matricula_id', valor: tipoId, motivo: 'Tipo reclassificado manualmente' });
              }}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium">Salvar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
