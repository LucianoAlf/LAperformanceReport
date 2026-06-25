import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import {
  AlertTriangle, RefreshCw, Check, X, Loader2, Link2, UserX, Copy, HelpCircle,
  Search, MoreVertical, DollarSign, GraduationCap, ChevronLeft, ChevronRight, Zap, Link as LinkIcon,
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
  fonte?: string | null;
  analise_sol?: string | null;
}

interface ConciliacaoPayload {
  resumo: Record<string, number>;
  items: ConciliacaoItem[];
}

interface TipoMatricula { id: number; codigo: string; nome: string }

const TIPO_META: Record<string, { label: string; descricao: string; icon: typeof Link2; cor: string }> = {
  ambiguo: { label: 'Ambíguo', descricao: 'Várias matrículas ativas, nenhuma casa o curso do nosso cadastro', icon: Copy, cor: 'amber' },
  ausente_api: { label: 'Ausente na API', descricao: 'Ativo no nosso sistema, mas não existe na API do Emusys', icon: UserX, cor: 'red' },
  ausente_nosso_sistema: { label: 'Só no Emusys', descricao: 'Contrato ativo no Emusys sem matrícula correspondente no nosso banco', icon: UserX, cor: 'red' },
  valor_divergente: { label: 'Valor divergente', descricao: 'Parcela comercial difere da API canônica do Emusys', icon: DollarSign, cor: 'orange' },
  classificacao_divergente: { label: 'Classificação', descricao: 'Tipo (bolsista/regular) não bate com a realidade da API', icon: GraduationCap, cor: 'sky' },
  duas_matriculas: { label: '2× mesmo curso', descricao: 'Duas matrículas do mesmo curso (ex.: 2 aulas/semana)', icon: Copy, cor: 'cyan' },
  disciplina_nao_mapeada: { label: 'Disciplina nova', descricao: 'Disciplina do Emusys sem mapeamento para curso', icon: HelpCircle, cor: 'violet' },
  professor_nao_mapeado: { label: 'Professor novo', descricao: 'Professor do Emusys sem mapeamento', icon: HelpCircle, cor: 'violet' },
  valor_fixado_divergente: { label: 'Valor fixado diverge', descricao: 'Valor editado manualmente difere da API', icon: AlertTriangle, cor: 'orange' },
  auto_preview: { label: 'Sugestão do sync', descricao: 'Correções seguras propostas pelo sync. Valor de parcela e status não entram no apply automático.', icon: Zap, cor: 'emerald' },
};

const COR_CLASSES: Record<string, string> = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  orange: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

// rótulos legíveis dos campos que o sync aplica sozinho (chaves do upd da edge)
const CAMPO_LABEL: Record<string, string> = {
  status: 'status', data_fim_contrato: 'fim do contrato', data_saida: 'data de saída',
  curso_id: 'curso', professor_atual_id: 'professor', valor_cheio: 'valor cheio',
  valor_parcela: 'parcela', desconto_fixo: 'desc. fixo', desconto_condicional: 'desc. condicional',
  dia_aula: 'dia da aula', horario_aula: 'horário',
};
const CAMPO_MONETARIO = new Set(['valor_cheio', 'valor_parcela', 'desconto_fixo', 'desconto_condicional']);

const PER_PAGE = 20;

function fmtBRL(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "tipo aplicável" = divergência com sugestão que dá pra aplicar direto da API
const CAMPOS_ALTO_RISCO = new Set(['status', 'data_saida', 'emusys_matricula_id']);
const CAMPOS_DERIVADOS = new Set(['valor_parcela']);

function temSugestaoAplicavel(item: ConciliacaoItem): boolean {
  return item.tipo_divergencia === 'classificacao_divergente' && item.sugestao != null;
}

function camposDoItem(item: ConciliacaoItem): string[] {
  const campos = new Set<string>();
  Object.keys(item.valor_api?.diffs || {}).forEach(c => campos.add(c));
  Object.keys(item.valor_api?.patch || {}).forEach(c => campos.add(c));
  if (item.campo) campos.add(item.campo);
  return [...campos];
}

function temCampoAltoRisco(item: ConciliacaoItem): boolean {
  return camposDoItem(item).some(campo => CAMPOS_ALTO_RISCO.has(campo));
}

function limparPatchGuardado(patch: Record<string, any> = {}): Record<string, any> {
  return Object.fromEntries(
    Object.entries(patch).filter(([campo, valor]) => !CAMPOS_DERIVADOS.has(campo) && valor !== undefined)
  );
}

function temPatchSeguroAplicavel(item: ConciliacaoItem): boolean {
  if (item.tipo_divergencia !== 'auto_preview' || temCampoAltoRisco(item)) return false;
  return Object.keys(limparPatchGuardado(item.valor_api?.patch || {})).length > 0;
}

interface DiffLookups { cursos: Map<number, string>; profs: Map<number, string> }

function fmtVal(campo: string, v: any, lk?: DiffLookups): string {
  if (v == null || v === '') return '—';
  if (CAMPO_MONETARIO.has(campo)) return fmtBRL(v);
  if (campo === 'curso_id') return lk?.cursos.get(Number(v)) || `curso ${v}`;
  if (campo === 'professor_atual_id') return lk?.profs.get(Number(v)) || `prof. ${v}`;
  if (campo === 'horario_aula') return String(v).slice(0, 5);
  return String(v);
}

// Monta "campo: de → para · campo: de → para" a partir dos diffs do auto_preview.
function descreverDiffs(diffs: Record<string, { de: any; para: any }> | undefined, lk?: DiffLookups): string {
  if (!diffs || typeof diffs !== 'object') return '—';
  const partes = Object.entries(diffs).map(([campo, d]) =>
    `${CAMPO_LABEL[campo] || campo}: ${fmtVal(campo, d?.de, lk)} → ${fmtVal(campo, d?.para, lk)}`);
  return partes.length ? partes.join('  ·  ') : '—';
}

function descreverNosso(item: ConciliacaoItem, tiposMap: Map<string, TipoMatricula>): string {
  if (item.tipo_divergencia === 'auto_preview') {
    const campos = Object.keys(item.valor_api?.diffs || {});
    if (!campos.length) return '—';
    return campos.map(c => CAMPO_LABEL[c] || c).join(', ');
  }
  if (item.tipo_divergencia === 'classificacao_divergente') {
    const cod = item.valor_nosso?.tipo;
    return cod ? (tiposMap.get(cod)?.nome || cod) : '—';
  }
  if (item.tipo_divergencia === 'valor_divergente') {
    return item.curso_nome || 'Sem valor de parcela';
  }
  if (item.tipo_divergencia === 'ausente_nosso_sistema') return 'Novo cadastro';
  return item.curso_nome || (item.valor_nosso?.curso_id ? `curso ${item.valor_nosso.curso_id}` : '—');
}

function descreverApi(item: ConciliacaoItem, tiposMap: Map<string, TipoMatricula>, lk?: DiffLookups): string {
  const v = item.valor_api;
  if (!v) return '—';
  if (item.tipo_divergencia === 'auto_preview') {
    return descreverDiffs(v.diffs, lk);
  }
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
    return v.candidatos.map((c: any) => {
      const disc = (c.disciplinas || []).join(', ');
      const turma = (c.turmas || []).join(', ');
      return `#${c.id}: ${disc}${turma ? ` (${turma})` : ''}`;
    }).join('  |  ');
  }
  if (item.tipo_divergencia === 'ausente_nosso_sistema') {
    return [v.nome, v.disciplinas ? `(${v.disciplinas})` : null, `Emusys #${v.emusys_id}`].filter(Boolean).join(' · ');
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
  // mapas id→nome para legibilizar os diffs do auto_preview (curso/professor)
  const [cursos, setCursos] = useState<{ id: number; nome: string }[]>([]);
  const [profs, setProfs] = useState<{ id: number; nome: string }[]>([]);

  // filtros
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todas');
  const [pagina, setPagina] = useState(1);

  // seleção em lote
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [processandoLote, setProcessandoLote] = useState(false);

  // sync manual
  const [rodandoSync, setRodandoSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // modais
  const [modalValor, setModalValor] = useState<{ item: ConciliacaoItem; valor: string } | null>(null);
  const [modalReclass, setModalReclass] = useState<{ item: ConciliacaoItem; tipoId: string } | null>(null);
  const [confirmVincular, setConfirmVincular] = useState<{ item: ConciliacaoItem; candidato: any; patch: Record<string, any>; atual: Record<string, any> } | null>(null);
  const [alunosAtuais, setAlunosAtuais] = useState<Map<number, Record<string, any>>>(new Map());

  const tiposMap = useMemo(() => new Map(tipos.map(t => [t.codigo, t])), [tipos]);
  const diffLookups = useMemo<DiffLookups>(() => ({
    cursos: new Map(cursos.map(c => [c.id, c.nome])),
    profs: new Map(profs.map(p => [p.id, p.nome])),
  }), [cursos, profs]);

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

  const UNIDADE_SLUG: Record<string, string> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'cg',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'recreio',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'barra',
  };

  const rodarSync = useCallback(async () => {
    setRodandoSync(true);
    const slugs = unidadeId && unidadeId !== 'todos' && UNIDADE_SLUG[unidadeId]
      ? [UNIDADE_SLUG[unidadeId]]
      : ['cg', 'recreio', 'barra'];
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-matriculas-emusys`;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      setSyncStatus(`${slug.toUpperCase()} (${i + 1}/${slugs.length})…`);
      try {
        const resp = await fetch(`${url}?u=${slug}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        });
        if (!resp.ok) throw new Error(await resp.text());
      } catch (e: any) {
        toast.error(`Erro no sync ${slug.toUpperCase()}: ${e.message}`);
      }
    }
    setSyncStatus(null);
    setRodandoSync(false);
    await carregar();
  }, [unidadeId, carregar]);

  useEffect(() => {
    supabase.from('tipos_matricula').select('id, codigo, nome').then(({ data }) => setTipos(data || []));
    supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setUnidades(data || []));
    supabase.from('cursos').select('id, nome').then(({ data }) => setCursos(data || []));
    supabase.from('professores').select('id, nome').then(({ data }) => setProfs(data || []));
  }, []);

  // batch fetch dos valores atuais dos alunos ambíguos para mostrar antes/depois nos cards
  useEffect(() => {
    const ids = [...new Set((dados.items || [])
      .filter(i => i.tipo_divergencia === 'ambiguo' && i.aluno_id)
      .map(i => i.aluno_id!))];
    if (!ids.length) { setAlunosAtuais(new Map()); return; }
    supabase.from('alunos')
      .select('id, curso_id, professor_atual_id, dia_aula, horario_aula, valor_cheio, desconto_fixo, desconto_condicional')
      .in('id', ids)
      .then(({ data }) => {
        const m = new Map<number, Record<string, any>>();
        (data || []).forEach((a: any) => m.set(a.id, a));
        setAlunosAtuais(m);
      });
  }, [dados.items]);

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

    if (opts.campo) {
      throw new Error('Alteracoes em alunos devem passar pela RPC guardada.');
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

  // aplica uma decisão via a RPC guardada (trava anti-vínculo-duplicado + régua de valor no banco)
  const aplicarDecisaoRPC = useCallback(async (
    item: ConciliacaoItem, decisao: string, patch: Record<string, any> = {}, emusysMatriculaId: string | null = null,
  ): Promise<boolean> => {
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.rpc('aplicar_conciliacao_decisao', {
      p_divergencia_id: item.id,
      p_aluno_id: item.aluno_id,
      p_decisao: decisao,
      p_patch: patch,
      p_emusys_matricula_id: emusysMatriculaId,
      p_decidido_por: authData.user?.email || 'usuario_app',
    });
    if (error) throw error;
    return true;
  }, []);

  const executarRPC = useCallback(async (
    item: ConciliacaoItem, decisao: string, patch: Record<string, any> = {}, emusysMatriculaId: string | null = null,
  ) => {
    setSalvando(prev => new Set(prev).add(item.id));
    try {
      await aplicarDecisaoRPC(item, decisao, patch, emusysMatriculaId);
      removerDoEstado([item.id]);
      toast.success(decisao === 'vincular' ? 'Vinculado e populado.' : 'Aprovado e aplicado.');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao aplicar');
    } finally {
      setSalvando(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }, [aplicarDecisaoRPC, removerDoEstado]);

  // monta o patch (campos→valores) a partir de um candidato do Emusys para "vincular e popular"
  const patchDeCandidato = useCallback((c: any): Record<string, any> => {
    const p: Record<string, any> = {
      curso_id: c.curso_id,
      professor_atual_id: c.professor_id,
      dia_aula: c.dia,
      horario_aula: c.horario || c.horario_aula || c.hora,
      data_fim_contrato: c.data_fim,
    };
    if (!c.parcela_invalida && c.cheio != null) {
      p.valor_cheio = c.cheio; p.desconto_fixo = c.fixo; p.desconto_condicional = c.cond;
    }
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null));
  }, []);

  // converte uma divergência "aplicável" nas opções de gravação a partir da sugestão da API
  const opcoesAplicarApi = useCallback((item: ConciliacaoItem): { campo: string; valor: any } | null => {
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
    executarRPC(item, 'aprovar', { [op.campo]: op.valor });
  }, [opcoesAplicarApi, executarRPC]);

  // ações em lote
  const aplicarLote = useCallback(async () => {
    const alvos = itemsFiltrados.filter(i => selecionados.has(i.id) && (
      temPatchSeguroAplicavel(i) || temSugestaoAplicavel(i)
    ));
    if (!alvos.length) { toast.error('Nenhum selecionado aprovável.'); return; }
    setProcessandoLote(true);
    const resNormais = await Promise.allSettled(alvos.map(i => {
      if (i.tipo_divergencia === 'auto_preview') return aplicarDecisaoRPC(i, 'aprovar', limparPatchGuardado(i.valor_api?.patch || {}));
      const op = opcoesAplicarApi(i);
      return op ? aplicarDecisaoRPC(i, 'aprovar', { [op.campo]: op.valor }) : Promise.reject();
    }));
    const todos = [...alvos];
    const resAll = [...resNormais];
    const okIds = todos.filter((_, idx) => resAll[idx].status === 'fulfilled').map(i => i.id);
    removerDoEstado(okIds);
    const falhas = resAll.length - okIds.length;
    toast[falhas ? 'warning' : 'success'](`${okIds.length} aplicada(s)${falhas ? `, ${falhas} falha(s)` : ''}.`);
    setProcessandoLote(false);
  }, [itemsFiltrados, selecionados, opcoesAplicarApi, aplicarDecisaoRPC, removerDoEstado]);

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
    const todosMarcados = idsPagina.length > 0 && idsPagina.every(id => selecionados.has(id));
    setSelecionados(prev => {
      const n = new Set(prev);
      idsPagina.forEach(id => todosMarcados ? n.delete(id) : n.add(id));
      return n;
    });
  };

  const totalAberto = itemsFiltrados.length;
  const mostrarFiltroUnidade = (!unidadeId || unidadeId === 'todos') && unidades.length > 1;

  // separa a prévia automática (informativa) dos tipos que pedem decisão humana
  const previewQtd = dados.resumo?.auto_preview || 0;
  const decisaoEntries = Object.entries(dados.resumo || {}).filter(([t]) => t !== 'auto_preview');
  const previewAtivo = filtroTipo === 'auto_preview';
  const totalPreviewFiltrado = itemsFiltrados.filter(i => i.tipo_divergencia === 'auto_preview').length;
  const totalDecisaoFiltrado = totalAberto - totalPreviewFiltrado;

  return (
    <div className="space-y-4 pb-24">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-cyan-400" /> Conciliação Emusys
          </h3>
          <p className="text-sm text-slate-400">
            O sync só audita e propõe — <span className="text-slate-300">nada é alterado sem você aprovar</span>. Aprove ou mantenha cada divergência/sugestão.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={rodarSync} disabled={rodandoSync || loading}
            className="inline-flex items-center gap-2 rounded-md border border-cyan-600/50 bg-cyan-600/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-600/20 disabled:opacity-50">
            {rodandoSync
              ? <><Loader2 className="w-4 h-4 animate-spin" />{syncStatus || 'Rodando…'}</>
              : <><Zap className="w-4 h-4" /> Rodar Sync</>}
          </button>
          <button onClick={carregar} disabled={loading || rodandoSync}
            className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50 disabled:opacity-50">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Atualizar
          </button>
        </div>
      </div>

      {/* Faixa da prévia automática (informativa — não pede decisão) */}
      {previewQtd > 0 && (
        <button
          onClick={() => setFiltroTipo(previewAtivo ? null : 'auto_preview')}
          className={cn(
            'group w-full text-left rounded-xl border p-4 transition flex flex-wrap items-center gap-x-4 gap-y-2',
            'border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent',
            previewAtivo ? 'ring-2 ring-emerald-400/60' : 'hover:from-emerald-500/25',
          )}
        >
          <div className="shrink-0 grid place-items-center w-11 h-11 rounded-lg bg-emerald-500/20 text-emerald-300">
            <Zap className="w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-200 tabular-nums leading-none">{previewQtd}</span>
            <span className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Sugestões do sync</span>
          </div>
          <p className="hidden md:block text-xs text-emerald-300/70 leading-tight max-w-sm">
            Correções seguras do sync. Valor de parcela e status ficam bloqueados para revisão específica.
          </p>
          <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
            {previewAtivo ? 'filtrando' : 'clique para revisar'}
          </span>
        </button>
      )}

      {/* Cards dos tipos que precisam de decisão humana (clicáveis = filtro) */}
      {decisaoEntries.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Precisam de decisão</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {decisaoEntries.map(([tipo, qtd]) => {
              const meta = TIPO_META[tipo] || { label: tipo, descricao: '', icon: HelpCircle, cor: 'amber' };
              const Icon = meta.icon;
              const ativo = filtroTipo === tipo;
              return (
                <button key={tipo} onClick={() => setFiltroTipo(ativo ? null : tipo)}
                  className={cn('flex h-full flex-col rounded-lg border p-3 text-left transition', COR_CLASSES[meta.cor], ativo ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/60' : 'opacity-90 hover:opacity-100')}>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
                    <Icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{meta.label}</span>
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{qtd}</div>
                  <div className="mt-1 text-[11px] opacity-70 leading-tight line-clamp-2">{meta.descricao}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(dados.resumo || {}).length === 0 && !loading && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> Nenhuma divergência pendente. Tudo conciliado.
        </div>
      )}

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
          <span className="text-sm text-slate-500 ml-auto">
            {totalDecisaoFiltrado > 0 && <span>{totalDecisaoFiltrado} p/ decisão</span>}
            {totalDecisaoFiltrado > 0 && totalPreviewFiltrado > 0 && <span className="text-slate-600"> · </span>}
            {totalPreviewFiltrado > 0 && <span className="text-emerald-500/80">{totalPreviewFiltrado} automática(s)</span>}
          </span>
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
                  const isPreview = item.tipo_divergencia === 'auto_preview';
                  const isPreviewAltoRisco = isPreview && temCampoAltoRisco(item);
                  const isPreviewAplicavel = temPatchSeguroAplicavel(item);
                  const candidatos: any[] = item.tipo_divergencia === 'ambiguo' && Array.isArray(item.valor_api?.candidatos) ? item.valor_api.candidatos : [];
                  const homonimo = new Set(candidatos.map(c => c.aluno_id)).size > 1;
                  const isOrfao = item.tipo_divergencia === 'ausente_nosso_sistema';
                  const temDetalhe = candidatos.length > 0 || !!item.analise_sol || isOrfao;
                  return (
                    <Fragment key={item.id}>
                    <tr className={cn('hover:bg-slate-700/20', selecionados.has(item.id) && 'bg-cyan-500/5', temDetalhe && 'border-b-0')}>
                      <td className="px-3 py-3"><Checkbox checked={selecionados.has(item.id)} onCheckedChange={() => toggleSel(item.id)} /></td>
                      <td className="px-4 py-3 text-slate-200">{item.aluno_nome || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{item.unidade_nome || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', COR_CLASSES[meta.cor])}>
                          {isPreview && <Zap className="w-3 h-3 shrink-0" />}
                          {isPreview ? 'Sugestão' : meta.label}
                        </span>
                      </td>
                      {isPreview ? (
                        <td colSpan={2} className="px-4 py-2">
                          <div className="flex flex-wrap gap-x-5 gap-y-1">
                            {Object.entries(item.valor_api?.diffs || {}).map(([campo, d]: [string, any]) => (
                              <span key={campo} className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
                                <span className="text-slate-500">{CAMPO_LABEL[campo] || campo}:</span>
                                <span className="text-slate-400 line-through">{fmtVal(campo, (d as any)?.de, diffLookups)}</span>
                                <span className="text-slate-600">→</span>
                                <span className="text-emerald-400 font-medium">{fmtVal(campo, (d as any)?.para, diffLookups)}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-slate-300 text-xs">{descreverNosso(item, tiposMap)}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{descreverApi(item, tiposMap, diffLookups)}</td>
                        </>
                      )}
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
                                {isPreviewAplicavel && (
                                  <DropdownMenuItem onClick={() => executarRPC(item, 'aprovar', limparPatchGuardado(item.valor_api?.patch || {}))}
                                    className="cursor-pointer text-emerald-400 focus:text-emerald-400 focus:bg-emerald-500/10">
                                    <Check className="w-4 h-4 mr-2" /> Aprovar (aplicar)
                                  </DropdownMenuItem>
                                )}
                                {isPreviewAltoRisco && (
                                  <DropdownMenuItem disabled className="text-amber-300 focus:text-amber-300">
                                    <AlertTriangle className="w-4 h-4 mr-2" /> Revisar individualmente
                                  </DropdownMenuItem>
                                )}
                                {aplicavel && (
                                  <DropdownMenuItem onClick={() => aplicarApi(item)}
                                    className="cursor-pointer text-emerald-400 focus:text-emerald-400 focus:bg-emerald-500/10">
                                    <Check className="w-4 h-4 mr-2" />
                                    {`Aplicar: ${tiposMap.get(String(item.sugestao))?.nome || item.sugestao}`}
                                  </DropdownMenuItem>
                                )}
                                {item.tipo_divergencia === 'valor_divergente' && (
                                  <DropdownMenuItem disabled className="text-amber-300 focus:text-amber-300">
                                    <AlertTriangle className="w-4 h-4 mr-2" /> Reprocessar valor canônico
                                  </DropdownMenuItem>
                                )}
                                {item.tipo_divergencia === 'classificacao_divergente' && (
                                  <DropdownMenuItem onClick={() => setModalReclass({ item, tipoId: String(tiposMap.get(String(item.sugestao))?.id || '') })}
                                    className="cursor-pointer text-blue-400 focus:text-blue-400 focus:bg-blue-500/10">
                                    <GraduationCap className="w-4 h-4 mr-2" /> Reclassificar…
                                  </DropdownMenuItem>
                                )}
                                {!isOrfao && (
                                  <DropdownMenuItem onClick={() => executarUm(item, { decisao: 'manter_nosso' })}
                                    className="cursor-pointer text-slate-300">
                                    <Check className="w-4 h-4 mr-2" /> Manter nosso
                                  </DropdownMenuItem>
                                )}
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
                    {temDetalhe && (
                      <tr className={cn(selecionados.has(item.id) && 'bg-cyan-500/5')}>
                        <td></td>
                        <td colSpan={6} className="px-4 pb-4 pt-0 align-top">
                          {item.analise_sol && (
                            <div className="mb-2 rounded-lg border border-violet-500/30 bg-violet-500/10 p-2.5 text-xs text-violet-200">
                              <span className="font-semibold">Análise da Sol:</span> {item.analise_sol}
                            </div>
                          )}
                          {isOrfao && (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <UserX className="w-4 h-4 text-red-400 shrink-0" />
                                <span className="text-xs font-semibold text-red-300">Contrato no Emusys sem registro no nosso banco</span>
                              </div>
                              <div className="text-xs text-slate-300 space-y-1">
                                {item.valor_api?.nome && <div><span className="text-slate-500">Nome:</span> {item.valor_api.nome}</div>}
                                {item.valor_api?.disciplinas && <div><span className="text-slate-500">Disciplina:</span> {item.valor_api.disciplinas}</div>}
                                {item.valor_api?.emusys_id && <div><span className="text-slate-500">Emusys ID:</span> #{item.valor_api.emusys_id}</div>}
                              </div>
                              <div className="mt-2.5 text-[11px] text-amber-300/80">
                                ⚠ Para resolver, cadastre este aluno manualmente em Alunos → Novo Aluno e vincule ao ID Emusys #{item.valor_api?.emusys_id}.
                              </div>
                            </div>
                          )}
                          {candidatos.length > 0 && (
                            <div className="space-y-2">
                              {homonimo && (
                                <div className="flex items-center gap-1.5 text-[11px] text-red-300">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  Candidatos de pessoas diferentes (aluno_id distinto no Emusys) — confirme que é a pessoa certa antes de vincular.
                                </div>
                              )}
                              <div className="grid gap-2 md:grid-cols-2">
                                {candidatos.map((c) => (
                                  <div key={c.id} className={cn('rounded-lg border p-3', c.sugerido_por_turma ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-slate-700 bg-slate-800/40')}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 text-sm text-slate-200">
                                          <span className="font-medium">#{c.id}</span>
                                          <span className="text-slate-400">·</span>
                                          <span>{c.dia || 'dia ?'}</span>
                                          {(c.horario || c.horario_aula || c.hora) && <span>{String(c.horario || c.horario_aula || c.hora).slice(0, 5)}</span>}
                                          {(c.turmas || []).length > 0 && <span className="text-slate-500 text-xs truncate">{(c.turmas || []).join(', ')}</span>}
                                          {c.sugerido_por_turma && <span className="rounded-full bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 text-[10px]">sugerido</span>}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-400">
                                          {diffLookups.cursos.get(Number(c.curso_id)) || (c.disciplinas?.length ? c.disciplinas.join(', ') : `curso ${c.curso_id ?? '?'}`)}
                                          {' · '}{diffLookups.profs.get(Number(c.professor_id)) || `prof. ${c.professor_id ?? '?'}`}
                                          {' · '}{c.parcela_invalida ? <span className="text-orange-300">valor a revisar</span> : `parcela ${fmtBRL(c.parcela)}`}
                                          {c.status && c.status !== 'ativa' && <span className="text-amber-300"> · {c.status}</span>}
                                        </div>
                                        {(() => {
                                          const at = alunosAtuais.get(item.aluno_id!);
                                          if (!at) return null;
                                          const diffs: { label: string; de: string; para: string }[] = [];
                                          const horaCandidato = c.horario || c.horario_aula || c.hora;
                                          if (c.dia && c.dia !== at.dia_aula) diffs.push({ label: 'Dia', de: at.dia_aula || '—', para: c.dia });
                                          if (horaCandidato && String(horaCandidato).slice(0, 5) !== String(at.horario_aula || '').slice(0, 5)) diffs.push({ label: 'Hora', de: at.horario_aula ? String(at.horario_aula).slice(0, 5) : '—', para: String(horaCandidato).slice(0, 5) });
                                          if (c.curso_id != null && c.curso_id !== at.curso_id) diffs.push({ label: 'Curso', de: diffLookups.cursos.get(Number(at.curso_id)) || '—', para: diffLookups.cursos.get(Number(c.curso_id)) || (c.disciplinas?.join(', ') || `?`) });
                                          if (c.professor_id != null && c.professor_id !== at.professor_atual_id) diffs.push({ label: 'Prof.', de: diffLookups.profs.get(Number(at.professor_atual_id)) || '—', para: diffLookups.profs.get(Number(c.professor_id)) || `?` });
                                          if (!c.parcela_invalida && c.cheio != null && c.cheio !== at.valor_cheio) diffs.push({ label: 'Cheio', de: fmtBRL(at.valor_cheio), para: fmtBRL(c.cheio) });
                                          if (!diffs.length) return null;
                                          return (
                                            <div className="mt-2 space-y-0.5 border-t border-slate-700/50 pt-2">
                                              {diffs.map(d => (
                                                <div key={d.label} className="flex items-center gap-1.5 text-[11px]">
                                                  <span className="text-slate-500 w-10 shrink-0">{d.label}</span>
                                                  <span className="text-slate-400 line-through">{d.de}</span>
                                                  <span className="text-slate-600">→</span>
                                                  <span className="text-emerald-400">{d.para}</span>
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      <button
                                        onClick={async () => {
                                          const patch = patchDeCandidato(c);
                                          const { data: al } = await supabase.from('alunos')
                                            .select('curso_id, professor_atual_id, dia_aula, horario_aula, data_fim_contrato, valor_cheio, desconto_fixo, desconto_condicional')
                                            .eq('id', item.aluno_id!).single();
                                          setConfirmVincular({ item, candidato: c, patch, atual: al || {} });
                                        }}
                                        disabled={emProgresso}
                                        className="shrink-0 inline-flex items-center gap-1 rounded-md bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-medium px-2.5 py-1.5">
                                        <LinkIcon className="w-3.5 h-3.5" /> Vincular
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
            <Check className="w-4 h-4" /> {processandoLote ? 'Processando...' : 'Aprovar / aplicar'}
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
            <DialogTitle>Valor divergente bloqueado</DialogTitle>
            <DialogDescription>
              {modalValor?.item.aluno_nome} precisa ser reprocessado pela regra canônica atual: mensalidade menos desconto condicional.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Não aplique valor manualmente por esta tela. Primeiro vamos reprocessar as divergências antigas com a fórmula canônica e só depois liberar decisões.
          </div>
          <DialogFooter>
            <button onClick={() => setModalValor(null)} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-sm">Cancelar</button>
            <button
              onClick={() => {
                if (!modalValor) return;
                setModalValor(null);
                toast.info('Valor divergente antigo precisa ser reprocessado pela regra canônica.');
              }}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium">Entendi</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: confirmar vínculo Emusys */}
      <Dialog open={!!confirmVincular} onOpenChange={(o) => !o && setConfirmVincular(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar vínculo com #{confirmVincular?.candidato?.id}?</DialogTitle>
            <DialogDescription>
              {confirmVincular?.item.aluno_nome} — matrícula Emusys #{confirmVincular?.candidato?.id} ({confirmVincular?.candidato?.turma})
            </DialogDescription>
          </DialogHeader>
          {confirmVincular && (() => {
            const { patch, atual, candidato } = confirmVincular;
            const fmtData = (d: any) => d ? new Date(String(d) + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
            const nomeAtualCurso = diffLookups.cursos.get(Number(atual.curso_id)) || (atual.curso_id ? `ID ${atual.curso_id}` : '—');
            const nomeNovoCurso = patch.curso_id ? (diffLookups.cursos.get(Number(patch.curso_id)) || `ID ${patch.curso_id}`) : null;
            const nomeAtualProf = diffLookups.profs.get(Number(atual.professor_atual_id)) || (atual.professor_atual_id ? `ID ${atual.professor_atual_id}` : '—');
            const nomeNovoProf = patch.professor_atual_id ? (diffLookups.profs.get(Number(patch.professor_atual_id)) || `ID ${patch.professor_atual_id}`) : null;
            const linhas: { label: string; de: string; para: string | null }[] = [
              { label: 'ID Emusys', de: confirmVincular.item.emusys_matricula_id || '—', para: String(candidato.id) },
              patch.dia_aula ? { label: 'Dia da aula', de: atual.dia_aula || '—', para: patch.dia_aula } : null,
              patch.horario_aula ? { label: 'Horário', de: atual.horario_aula ? String(atual.horario_aula).slice(0, 5) : '—', para: String(patch.horario_aula).slice(0, 5) } : null,
              nomeNovoCurso ? { label: 'Curso', de: nomeAtualCurso, para: nomeNovoCurso } : null,
              nomeNovoProf ? { label: 'Professor', de: nomeAtualProf, para: nomeNovoProf } : null,
              patch.data_fim_contrato ? { label: 'Fim do contrato', de: fmtData(atual.data_fim_contrato), para: fmtData(patch.data_fim_contrato) } : null,
              patch.valor_cheio != null ? { label: 'Valor cheio', de: fmtBRL(atual.valor_cheio), para: fmtBRL(patch.valor_cheio) } : null,
              patch.desconto_fixo != null ? { label: 'Desc. fixo', de: fmtBRL(atual.desconto_fixo), para: fmtBRL(patch.desconto_fixo) } : null,
              patch.desconto_condicional != null ? { label: 'Desc. condicional', de: fmtBRL(atual.desconto_condicional), para: fmtBRL(patch.desconto_condicional) } : null,
            ].filter(Boolean) as { label: string; de: string; para: string }[];
            return (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-slate-800 overflow-hidden">
                  <div className="grid grid-cols-3 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 border-b border-slate-700">
                    <span>Campo</span><span className="text-center">Atual</span><span className="text-right">Vai ficar</span>
                  </div>
                  {linhas.map(({ label, de, para }) => {
                    const mudou = de !== para;
                    return (
                      <div key={label} className={cn('grid grid-cols-3 px-4 py-2 items-center text-xs border-b border-slate-700/40 last:border-0', mudou && 'bg-amber-500/5')}>
                        <span className="text-slate-400">{label}</span>
                        <span className={cn('text-center font-mono', mudou ? 'text-slate-400 line-through' : 'text-slate-300')}>{de}</span>
                        <span className={cn('text-right font-mono font-medium', mudou ? 'text-emerald-400' : 'text-slate-500')}>{para}</span>
                      </div>
                    );
                  })}
                  {candidato.parcela != null && (
                    <div className="grid grid-cols-3 px-4 py-2.5 items-center text-xs border-t border-slate-600 bg-slate-700/30">
                      <span className="text-slate-300 font-medium">Parcela resultante</span>
                      <span></span>
                      <span className="text-right font-semibold text-emerald-400">{fmtBRL(candidato.parcela)}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500">Após vincular, o sync atualizará status e data_fim automaticamente a cada rodada.</p>
              </div>
            );
          })()}
          <DialogFooter>
            <button onClick={() => setConfirmVincular(null)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</button>
            <button
              onClick={() => {
                if (!confirmVincular) return;
                const { item, candidato, patch } = confirmVincular;
                setConfirmVincular(null);
                executarRPC(item, 'vincular', patch, String(candidato.id));
              }}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium">
              Confirmar vínculo
            </button>
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
                executarRPC(item, 'aprovar', { tipo_matricula_id: tipoId });
              }}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium">Salvar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
