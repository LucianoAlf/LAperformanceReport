import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import {
  AlertTriangle, RefreshCw, Check, X, Loader2, Link2, UserX, Copy, HelpCircle,
  Search, MoreVertical, DollarSign, GraduationCap, ChevronLeft, ChevronRight, Zap, Link as LinkIcon,
  FileText, Phone, CreditCard, Image as ImageIcon, AtSign, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
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

interface AtributoDivergencia {
  id: number;
  unidade_id: string | null;
  aluno_id: number | null;
  aluno_nome?: string | null;
  emusys_student_id: string | null;
  emusys_matricula_id: string | null;
  tipo_divergencia: string;
  campo: string;
  valor_nosso: any;
  valor_emusys: any;
  sugestao: any;
  severidade: 'baixa' | 'media' | 'alta' | string;
  detectado_em: string | null;
}

interface AtributoTotais {
  total: number;
  grupos: Record<string, number>;
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
  auto_preview: { label: 'Sync matricula/grade', descricao: 'Diferencas de curso, professor, dia ou horario vindas do sync. Financeiro e fim de contrato exigem revisao.', icon: Zap, cor: 'emerald' },
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

const ATRIBUTO_GRUPOS: Record<string, { label: string; descricao: string; icon: typeof Link2; cor: string; tipos: string[] }> = {
  cadastro: {
    label: 'Dados a completar',
    descricao: 'Responsavel, telefone e email para completar ou revisar. Contagem em campos, nao em alunos.',
    icon: Phone,
    cor: 'sky',
    tipos: ['contato_divergente', 'responsavel_divergente'],
  },
  imagem: {
    label: 'Foto/Instagram',
    descricao: 'Foto ou Instagram que existem no Emusys e podem completar o cadastro do LA Report.',
    icon: ImageIcon,
    cor: 'violet',
    tipos: ['foto_ausente', 'instagram_ausente', 'instagram_divergente'],
  },
  financeiro: {
    label: 'Financeiro a revisar',
    descricao: 'Status financeiro e forma de pagamento para revisao. Tipos sem parcela ficam fora.',
    icon: CreditCard,
    cor: 'orange',
    tipos: ['status_financeiro_divergente', 'forma_pagamento_divergente', 'aguardando_renovacao_divergente'],
  },
  contrato: {
    label: 'Checklist interno',
    descricao: 'Anamnese e contrato pendentes dentro do LA Report. Nao sao divergencias do Emusys.',
    icon: FileText,
    cor: 'amber',
    tipos: ['anamnese_pendente', 'contrato_assinatura_pendente'],
  },
  criticas: {
    label: 'Prioridade alta',
    descricao: 'Somente itens de alto impacto para atendimento ou financeiro.',
    icon: ShieldAlert,
    cor: 'red',
    tipos: [],
  },
};

const ATRIBUTO_TIPO_META: Record<string, { label: string; grupo: string; cor: string; icon: typeof Link2 }> = {
  foto_ausente: { label: 'Foto ausente', grupo: 'imagem', cor: 'violet', icon: ImageIcon },
  instagram_ausente: { label: 'Instagram ausente', grupo: 'imagem', cor: 'violet', icon: AtSign },
  instagram_divergente: { label: 'Instagram diverge', grupo: 'imagem', cor: 'violet', icon: AtSign },
  contato_divergente: { label: 'Contato diverge', grupo: 'cadastro', cor: 'sky', icon: Phone },
  responsavel_divergente: { label: 'Responsavel diverge', grupo: 'cadastro', cor: 'sky', icon: Phone },
  status_financeiro_divergente: { label: 'Status financeiro', grupo: 'financeiro', cor: 'orange', icon: CreditCard },
  forma_pagamento_divergente: { label: 'Forma de pagamento', grupo: 'financeiro', cor: 'orange', icon: CreditCard },
  aguardando_renovacao_divergente: { label: 'Aguardando renovacao', grupo: 'financeiro', cor: 'orange', icon: CreditCard },
  anamnese_pendente: { label: 'Anamnese pendente', grupo: 'contrato', cor: 'amber', icon: FileText },
  contrato_assinatura_pendente: { label: 'Contrato sem assinatura', grupo: 'contrato', cor: 'amber', icon: FileText },
};

// rótulos legíveis dos campos que o sync aplica sozinho (chaves do upd da edge)
const ATRIBUTO_CAMPOS_APLICAVEIS = new Set([
  'foto_url',
  'instagram',
  'telefone',
  'email',
  'responsavel_nome',
  'responsavel_telefone',
  'status_pagamento',
  'forma_pagamento_id',
  'aguardando_renovacao',
]);

const CAMPO_LABEL: Record<string, string> = {
  status: 'status', data_fim_contrato: 'fim do contrato', data_saida: 'data de saída',
  curso_id: 'curso', professor_atual_id: 'professor', valor_cheio: 'valor cheio',
  valor_parcela: 'parcela', desconto_fixo: 'desc. fixo', desconto_condicional: 'desc. condicional',
  dia_aula: 'dia da aula', horario_aula: 'horário',
};
const CAMPO_MONETARIO = new Set(['valor_cheio', 'valor_parcela', 'desconto_fixo', 'desconto_condicional']);

const PER_PAGE = 20;
const EMAILS_SYNC_TECNICO = new Set([
  'lucianoalf.la@gmail.com',
  'hugo@lamusic.com.br',
  ...(String(import.meta.env.VITE_EMUSYS_SYNC_ALLOWED_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)),
]);

const ATRIBUTO_LIMITES_CARREGAMENTO: Record<string, number> = {
  criticas: 1000,
  financeiro: 1000,
  imagem: 1000,
  cadastro: 1000,
  contrato: 1000,
};

function fmtBRL(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "tipo aplicável" = divergência com sugestão que dá pra aplicar direto da API
const CAMPOS_ALTO_RISCO = new Set([
  'status',
  'data_saida',
  'emusys_matricula_id',
  'data_fim_contrato',
  'valor_cheio',
  'desconto_fixo',
  'desconto_condicional',
]);
const CAMPOS_DERIVADOS = new Set(['valor_parcela']);

function temSugestaoAplicavel(item: ConciliacaoItem): boolean {
  return item.tipo_divergencia === 'classificacao_divergente' && item.sugestao != null;
}

function textoCurtoValor(v: any): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(textoCurtoValor).filter(Boolean).join(', ') || '—';
  if (typeof v !== 'object') return String(v);

  const preferidos = [
    'status_pagamento', 'status_financeiro', 'inadimplente', 'forma_pagamento',
    'cobranca_automatica_status', 'telefone', 'email', 'responsavel', 'instagram',
    'foto_url', 'anamnese_preenchida', 'contrato_assinado', 'aguardando_renovacao', 'valor_parcela',
  ];
  const partes = preferidos
    .filter(chave => v[chave] != null && v[chave] !== '')
    .map(chave => `${chave.replaceAll('_', ' ')}: ${String(v[chave])}`);

  if (partes.length) return partes.join(' · ');
  return Object.entries(v)
    .slice(0, 3)
    .map(([chave, valor]) => `${chave.replaceAll('_', ' ')}: ${textoCurtoValor(valor)}`)
    .join(' · ') || '—';
}

function grupoAtributo(item: AtributoDivergencia): string {
  if (item.severidade === 'alta') return 'criticas';
  if (item.tipo_divergencia === 'status_financeiro_divergente' && item.valor_emusys?.status_pagamento === 'inadimplente') {
    return 'criticas';
  }
  return ATRIBUTO_TIPO_META[item.tipo_divergencia]?.grupo || 'cadastro';
}

const ATRIBUTO_GRUPO_PRIORIDADE: Record<string, number> = {
  criticas: 0,
  financeiro: 1,
  cadastro: 2,
  imagem: 3,
  contrato: 4,
};

function origemAtributo(item: AtributoDivergencia): string {
  const grupo = grupoAtributo(item);
  if (grupo === 'contrato') return 'Checklist interno LA Report';
  if (item.tipo_divergencia === 'foto_ausente' || item.tipo_divergencia.includes('instagram')) return 'Emusys -> LA Report';
  if (grupo === 'financeiro') return 'Contrato Emusys';
  return 'LA Report x Emusys';
}

function descricaoAtributo(item: AtributoDivergencia): { nosso: string; emusys: string; sugestao: string } {
  if (item.tipo_divergencia === 'foto_ausente') {
    return { nosso: 'Sem foto no LA Report', emusys: 'Foto disponivel no Emusys', sugestao: 'Aplicar foto do Emusys' };
  }
  if (item.tipo_divergencia === 'anamnese_pendente') {
    return { nosso: 'Anamnese nao preenchida', emusys: 'Checklist interno do LA Report', sugestao: 'Cobrar preenchimento' };
  }
  if (item.tipo_divergencia === 'contrato_assinatura_pendente') {
    return { nosso: 'Contrato sem assinatura', emusys: 'Checklist interno do LA Report', sugestao: 'Regularizar assinatura' };
  }
  return {
    nosso: textoCurtoValor(item.valor_nosso),
    emusys: textoCurtoValor(item.valor_emusys),
    sugestao: textoCurtoValor(item.sugestao),
  };
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

function patchAtualDoPreview(item: ConciliacaoItem): Record<string, any> {
  return Object.fromEntries(
    Object.entries(item.valor_api?.diffs || {})
      .filter(([campo, diff]: [string, any]) => !CAMPOS_DERIVADOS.has(campo) && diff?.de !== undefined)
      .map(([campo, diff]: [string, any]) => [campo, diff.de])
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
  const { user, usuario, session } = useAuth();
  const [dados, setDados] = useState<ConciliacaoPayload>({ resumo: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [loadingAtributos, setLoadingAtributos] = useState(true);
  const [atributos, setAtributos] = useState<AtributoDivergencia[]>([]);
  const [atributoTotais, setAtributoTotais] = useState<AtributoTotais>({ total: 0, grupos: {} });
  const [salvando, setSalvando] = useState<Set<number>>(new Set());
  const [salvandoAtributo, setSalvandoAtributo] = useState<Set<number>>(new Set());
  const [tipos, setTipos] = useState<TipoMatricula[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  // mapas id→nome para legibilizar os diffs do auto_preview (curso/professor)
  const [cursos, setCursos] = useState<{ id: number; nome: string }[]>([]);
  const [profs, setProfs] = useState<{ id: number; nome: string }[]>([]);

  // filtros
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todas');
  const [filtroAtributoGrupo, setFiltroAtributoGrupo] = useState<string>('todos');
  const [filtroAtributoTipo, setFiltroAtributoTipo] = useState<string>('todos');
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
  const emailUsuario = (user?.email || usuario?.email || '').trim().toLowerCase();
  const podeRodarSync = EMAILS_SYNC_TECNICO.has(emailUsuario);
  const diffLookups = useMemo<DiffLookups>(() => ({
    cursos: new Map(cursos.map(c => [c.id, c.nome])),
    profs: new Map(profs.map(p => [p.id, p.nome])),
  }), [cursos, profs]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setLoadingAtributos(true);
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

    try {
      const unidadeSelecionada = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
      const selectAtributos = 'id, unidade_id, aluno_id, emusys_student_id, emusys_matricula_id, tipo_divergencia, campo, valor_nosso, valor_emusys, sugestao, severidade, detectado_em';

      const baseRowsQuery = () => {
        let query = (supabase as any)
          .from('alunos_emusys_atributos_divergencias')
          .select(selectAtributos)
          .eq('resolvido', false)
          .order('detectado_em', { ascending: false });
        if (unidadeSelecionada) query = query.eq('unidade_id', unidadeSelecionada);
        return query;
      };

      const baseCountQuery = () => {
        let query = (supabase as any)
          .from('alunos_emusys_atributos_divergencias')
          .select('id', { count: 'exact', head: true })
          .eq('resolvido', false);
        if (unidadeSelecionada) query = query.eq('unidade_id', unidadeSelecionada);
        return query;
      };

      const aplicarFiltroGrupo = (query: any, grupo: string) => {
        if (grupo === 'criticas') return query.eq('severidade', 'alta');
        const tiposGrupo = ATRIBUTO_GRUPOS[grupo]?.tipos || [];
        return query.in('tipo_divergencia', tiposGrupo).neq('severidade', 'alta');
      };

      const grupos = Object.keys(ATRIBUTO_GRUPOS);
      const { count: totalCount, error: totalCountError } = await baseCountQuery();
      if (totalCountError) throw totalCountError;

      const gruposCounts = await Promise.all(grupos.map(async grupo => {
        const { count, error } = await aplicarFiltroGrupo(baseCountQuery(), grupo);
        if (error) throw error;
        return [grupo, count || 0] as const;
      }));

      const lotes = await Promise.all(grupos.map(async grupo => {
        const limite = ATRIBUTO_LIMITES_CARREGAMENTO[grupo] || 100;
        const { data, error } = await aplicarFiltroGrupo(baseRowsQuery(), grupo).limit(limite);
        if (error) throw error;
        return (data || []) as AtributoDivergencia[];
      }));

      const dedup = new Map<number, AtributoDivergencia>();
      lotes.flat().forEach(row => dedup.set(row.id, row));
      const rows = Array.from(dedup.values()).sort((a, b) => {
        const pa = ATRIBUTO_GRUPO_PRIORIDADE[grupoAtributo(a)] ?? 99;
        const pb = ATRIBUTO_GRUPO_PRIORIDADE[grupoAtributo(b)] ?? 99;
        if (pa !== pb) return pa - pb;
        if (a.severidade === 'alta' && b.severidade !== 'alta') return -1;
        if (b.severidade === 'alta' && a.severidade !== 'alta') return 1;
        return String(b.detectado_em || '').localeCompare(String(a.detectado_em || ''));
      });

      setAtributoTotais({
        total: totalCount || 0,
        grupos: Object.fromEntries(gruposCounts),
      });

      const alunoIds = [...new Set(rows.map(r => r.aluno_id).filter(Boolean))] as number[];
      const alunoMap = new Map<number, string>();
      if (alunoIds.length) {
        const { data: alunosData, error: alunosError } = await supabase
          .from('alunos')
          .select('id, nome')
          .in('id', alunoIds);
        if (alunosError) throw alunosError;
        (alunosData || []).forEach((a: any) => alunoMap.set(a.id, a.nome));
      }

      setAtributos(rows.map(row => ({ ...row, aluno_nome: row.aluno_id ? alunoMap.get(row.aluno_id) || null : null })));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar atributos da conciliacao');
      setAtributos([]);
      setAtributoTotais({ total: 0, grupos: {} });
    } finally {
      setLoadingAtributos(false);
    }
  }, [unidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  const UNIDADE_SLUG: Record<string, string> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'cg',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'recreio',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'barra',
  };

  const rodarSync = useCallback(async () => {
    if (!podeRodarSync) {
      toast.error('Rodar sync Emusys e uma acao tecnica restrita.');
      return;
    }
    const authToken = session?.access_token || (await supabase.auth.getSession()).data.session?.access_token;
    if (!authToken) {
      toast.error('Sessao expirada. Entre novamente para rodar o sync.');
      return;
    }
    setRodandoSync(true);
    const slugs = unidadeId && unidadeId !== 'todos' && UNIDADE_SLUG[unidadeId]
      ? [UNIDADE_SLUG[unidadeId]]
      : ['cg', 'recreio', 'barra'];
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-matriculas-emusys`;
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      setSyncStatus(`${slug.toUpperCase()} (${i + 1}/${slugs.length})…`);
      try {
        const resp = await fetch(`${url}?u=${slug}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        });
        if (!resp.ok) throw new Error(await resp.text());
      } catch (e: any) {
        toast.error(`Erro no sync ${slug.toUpperCase()}: ${e.message}`);
      }
    }
    setSyncStatus(null);
    setRodandoSync(false);
    await carregar();
  }, [unidadeId, carregar, podeRodarSync, session?.access_token]);

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
  useEffect(() => { setPagina(1); }, [busca, filtroTipo, filtroUnidade, filtroAtributoGrupo, filtroAtributoTipo]);

  useEffect(() => {
    if (filtroAtributoTipo === 'todos' || filtroAtributoGrupo === 'todos') return;
    const tiposGrupo = ATRIBUTO_GRUPOS[filtroAtributoGrupo]?.tipos || [];
    if (!tiposGrupo.includes(filtroAtributoTipo)) setFiltroAtributoTipo('todos');
  }, [filtroAtributoGrupo, filtroAtributoTipo]);

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
  const unidadesMap = useMemo(() => new Map(unidades.map(u => [u.id, u.nome])), [unidades]);
  const atributosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return atributos.filter(item => {
      if (filtroUnidade !== 'todas' && item.unidade_id !== filtroUnidade) return false;
      if (filtroAtributoGrupo !== 'todos' && grupoAtributo(item) !== filtroAtributoGrupo) return false;
      if (filtroAtributoTipo !== 'todos' && item.tipo_divergencia !== filtroAtributoTipo) return false;
      if (q) {
        const nome = (item.aluno_nome || '').toLowerCase();
        const campo = (item.campo || '').toLowerCase();
        const tipo = (ATRIBUTO_TIPO_META[item.tipo_divergencia]?.label || item.tipo_divergencia).toLowerCase();
        if (!nome.includes(q) && !campo.includes(q) && !tipo.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const pa = ATRIBUTO_GRUPO_PRIORIDADE[grupoAtributo(a)] ?? 99;
      const pb = ATRIBUTO_GRUPO_PRIORIDADE[grupoAtributo(b)] ?? 99;
      if (pa !== pb) return pa - pb;
      if (a.severidade === 'alta' && b.severidade !== 'alta') return -1;
      if (b.severidade === 'alta' && a.severidade !== 'alta') return 1;
      return String(b.detectado_em || '').localeCompare(String(a.detectado_em || ''));
    });
  }, [atributos, busca, filtroUnidade, filtroAtributoGrupo, filtroAtributoTipo]);
  const atributosVisiveis = atributosFiltrados.slice(0, 80);
  const tiposAtributoDisponiveis = useMemo(() => {
    const tiposBase = filtroAtributoGrupo === 'todos'
      ? Object.keys(ATRIBUTO_TIPO_META)
      : (ATRIBUTO_GRUPOS[filtroAtributoGrupo]?.tipos || []);
    const contagens = new Map<string, number>();
    for (const item of atributos) {
      if (filtroUnidade !== 'todas' && item.unidade_id !== filtroUnidade) continue;
      if (filtroAtributoGrupo !== 'todos' && grupoAtributo(item) !== filtroAtributoGrupo) continue;
      contagens.set(item.tipo_divergencia, (contagens.get(item.tipo_divergencia) || 0) + 1);
    }
    return tiposBase
      .map(tipo => ({
        tipo,
        count: contagens.get(tipo) || 0,
        meta: ATRIBUTO_TIPO_META[tipo],
      }))
      .filter(item => item.meta && (item.count > 0 || item.tipo === filtroAtributoTipo));
  }, [atributos, filtroAtributoGrupo, filtroAtributoTipo, filtroUnidade]);
  const atributosPorGrupo = useMemo(() => {
    if (atributoTotais.total > 0) return atributoTotais.grupos;
    const total: Record<string, number> = Object.fromEntries(Object.keys(ATRIBUTO_GRUPOS).map(g => [g, 0]));
    for (const item of atributos) {
      const grupo = grupoAtributo(item);
      total[grupo] = (total[grupo] || 0) + 1;
    }
    return total;
  }, [atributos, atributoTotais]);
  const totalAtributosFiltrado = atributosFiltrados.length;
  const totalAtributosPendente = atributoTotais.total || atributos.length;
  const totalAtributosFiltroExato = filtroAtributoTipo !== 'todos'
    ? totalAtributosFiltrado
    : filtroAtributoGrupo === 'todos'
    ? totalAtributosPendente
    : (atributoTotais.grupos[filtroAtributoGrupo] || totalAtributosFiltrado);
  const totalAtributosCabecalho = busca.trim()
    ? totalAtributosFiltrado
    : totalAtributosFiltroExato;

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
      toast.success(
        decisao === 'vincular'
          ? 'Vinculado e populado.'
          : decisao === 'manter'
            ? 'Nosso valor mantido e travado.'
            : 'Aprovado e aplicado.'
      );
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao aplicar');
    } finally {
      setSalvando(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }, [aplicarDecisaoRPC, removerDoEstado]);

  // monta o patch (campos→valores) a partir de um candidato do Emusys para "vincular e popular"
  const removerAtributoDoEstado = useCallback((id: number) => {
    setAtributos(prev => prev.filter(item => item.id !== id));
  }, []);

  const executarAtributoRPC = useCallback(async (
    item: AtributoDivergencia,
    decisao: 'aplicar_emusys' | 'manter_la' | 'ignorar' | 'revisar',
  ) => {
    setSalvandoAtributo(prev => new Set(prev).add(item.id));
    try {
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('aplicar_conciliacao_aluno_atributo', {
        p_divergencia_id: item.id,
        p_decisao: decisao,
        p_decidido_por: authData.user?.email || 'usuario_app',
      });
      if (error) throw error;
      if (decisao !== 'revisar') removerAtributoDoEstado(item.id);
      toast.success(
        decisao === 'aplicar_emusys'
          ? 'Dado do Emusys aplicado.'
          : decisao === 'manter_la'
            ? 'Valor do LA Report mantido e travado.'
            : decisao === 'ignorar'
              ? 'Divergencia ignorada.'
              : 'Marcado para revisar depois.'
      );
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar atributo');
    } finally {
      setSalvandoAtributo(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }, [removerAtributoDoEstado]);

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
    const res = await Promise.allSettled(alvos.map(i => aplicarDecisaoRPC(i, 'ignorar')));
    const okIds = alvos.filter((_, idx) => res[idx].status === 'fulfilled').map(i => i.id);
    removerDoEstado(okIds);
    const falhas = res.length - okIds.length;
    toast[falhas ? 'warning' : 'success'](`${okIds.length} ignorada(s)${falhas ? `, ${falhas} falha(s)` : ''}.`);
    setProcessandoLote(false);
  }, [itemsFiltrados, selecionados, aplicarDecisaoRPC, removerDoEstado]);

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

  // separa sugestoes de sync/grade dos tipos que pedem decisão humana
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
            O sync separa diferencas LA Report x Emusys, sugestoes de matricula/grade e checklist interno. <span className="text-slate-300">Nada e alterado sem decisao guardada.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeRodarSync && (
          <button onClick={rodarSync} disabled={rodandoSync || loading}
            className="inline-flex items-center gap-2 rounded-md border border-cyan-600/50 bg-cyan-600/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-600/20 disabled:opacity-50">
            {rodandoSync
              ? <><Loader2 className="w-4 h-4 animate-spin" />{syncStatus || 'Rodando…'}</>
              : <><Zap className="w-4 h-4" /> Rodar Sync</>}
          </button>
          )}
          <button onClick={carregar} disabled={loading || rodandoSync}
            className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50 disabled:opacity-50">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Atualizar
          </button>
        </div>
      </div>

      {/* Faixa da previa de matricula/grade */}
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
            <span className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Sugestoes de matricula/grade</span>
          </div>
          <p className="hidden md:block text-xs text-emerald-300/70 leading-tight max-w-sm">
            Dia, horario, curso ou professor passam por RPC. Financeiro e fim de contrato ficam em revisao especifica.
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

      {Object.keys(dados.resumo || {}).length === 0 && atributos.length === 0 && !loading && !loadingAtributos && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> Nenhuma divergência pendente. Tudo conciliado.
        </div>
      )}

      {/* Filtros */}
      {!loading && !loadingAtributos && ((dados.items || []).length > 0 || atributos.length > 0) && (
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
          {filtroAtributoGrupo !== 'todos' && (
            <button onClick={() => setFiltroAtributoGrupo('todos')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 h-10 text-sm text-slate-300 hover:bg-slate-700/50">
              <X className="w-3.5 h-3.5" /> {ATRIBUTO_GRUPOS[filtroAtributoGrupo]?.label || filtroAtributoGrupo}
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
            {totalPreviewFiltrado > 0 && <span className="text-emerald-500/80">{totalPreviewFiltrado} sync(s)</span>}
            {(totalDecisaoFiltrado > 0 || totalPreviewFiltrado > 0) && totalAtributosCabecalho > 0 && <span className="text-slate-600"> · </span>}
            {totalAtributosCabecalho > 0 && (
              <span className="text-cyan-400/80">
                {totalAtributosCabecalho} atributo(s){busca.trim() ? ' carregado(s)' : ' no banco'}
              </span>
            )}
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
                  <th className="px-4 py-3 font-medium">No LA Report</th>
                  <th className="px-4 py-3 font-medium">No Emusys/sync</th>
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
                          {isPreview ? 'Sync grade' : meta.label}
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
                                    <Check className="w-4 h-4 mr-2" /> Aprovar via RPC
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
                                  <DropdownMenuItem onClick={() => executarRPC(item, 'manter', isPreview ? patchAtualDoPreview(item) : {})}
                                    className="cursor-pointer text-slate-300">
                                    <Check className="w-4 h-4 mr-2" /> Manter LA Report
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => executarRPC(item, 'ignorar')}
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
      {loadingAtributos && !loading && (
        <div className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900/40 py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando atributos do Emusys...
        </div>
      )}

      {!loadingAtributos && atributos.length > 0 && (
        <section className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
          <div className="border-b border-slate-700/70 bg-slate-800/40 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <ShieldAlert className="h-4 w-4 text-cyan-300" />
                  Pendencias de cadastro, financeiro e checklist
                </h4>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
                  A contagem e por campo/tarefa, nao por aluno. Checklist e interno do LA Report; nada e aplicado sem RPC guardada.
                </p>
              </div>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-300">
                {totalAtributosPendente} campos/tarefas pendentes · {atributos.length} carregados nesta tela
              </span>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
            {Object.entries(ATRIBUTO_GRUPOS).map(([grupo, meta]) => {
              const Icon = meta.icon;
              const total = atributosPorGrupo[grupo] || 0;
              const ativo = filtroAtributoGrupo === grupo;
              return (
                <button
                  key={grupo}
                  onClick={() => {
                    setFiltroAtributoGrupo(ativo ? 'todos' : grupo);
                    setFiltroAtributoTipo('todos');
                  }}
                  className={cn(
                    'rounded-lg border p-3 text-left transition',
                    COR_CLASSES[meta.cor],
                    total === 0 && 'opacity-45',
                    ativo ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/60' : 'hover:opacity-100'
                  )}
                >
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide opacity-80">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{meta.label}</span>
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{total}</div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-tight opacity-70">{meta.descricao}</p>
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-700/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filtroAtributoTipo} onValueChange={setFiltroAtributoTipo}>
                <SelectTrigger className="h-9 w-[230px] border-slate-700 bg-slate-900/70 text-sm text-slate-200">
                  <SelectValue placeholder="Tipo de pendencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {tiposAtributoDisponiveis.map(({ tipo, count, meta }) => (
                    <SelectItem key={tipo} value={tipo}>
                      {meta.label} ({count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex max-w-full flex-wrap gap-1.5">
                {tiposAtributoDisponiveis.map(({ tipo, count, meta }) => {
                  const ativo = filtroAtributoTipo === tipo;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setFiltroAtributoTipo(ativo ? 'todos' : tipo)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition',
                        ativo
                          ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100'
                          : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{meta.label}</span>
                      <span className="rounded-full bg-slate-950/60 px-1.5 py-0.5 text-[10px] text-slate-400">{count}</span>
                    </button>
                  );
                })}
              </div>

              {(filtroAtributoGrupo !== 'todos' || filtroAtributoTipo !== 'todos') && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroAtributoGrupo('todos');
                    setFiltroAtributoTipo('todos');
                  }}
                  className="ml-auto h-8 rounded-md border border-slate-700 px-2.5 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-slate-700/70">
            {atributosVisiveis.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-400">
                <Check className="h-4 w-4 text-emerald-400" />
                Nenhum atributo encontrado neste filtro.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-800/60 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Aluno</th>
                      <th className="px-4 py-3 font-medium">Unidade</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Leitura LA Report</th>
                      <th className="px-4 py-3 font-medium">Fonte externa/interna</th>
                      <th className="px-4 py-3 font-medium">Acao sugerida</th>
                      <th className="px-4 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {atributosVisiveis.map(item => {
                      const meta = ATRIBUTO_TIPO_META[item.tipo_divergencia] || { label: item.tipo_divergencia, cor: 'sky', icon: HelpCircle };
                      const Icon = meta.icon;
                      const desc = descricaoAtributo(item);
                      const origem = origemAtributo(item);
                      const podeAplicar = ATRIBUTO_CAMPOS_APLICAVEIS.has(item.campo);
                      const busy = salvandoAtributo.has(item.id);
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-100">{item.aluno_nome || `Aluno LA Report #${item.aluno_id || '—'}`}</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              {item.emusys_matricula_id ? `Emusys mat. ${item.emusys_matricula_id}` : 'Sem matricula Emusys'}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-400">{item.unidade_id ? (unidadesMap.get(item.unidade_id) || '—') : '—'}</td>
                          <td className="px-4 py-3 align-top">
                            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', COR_CLASSES[meta.cor])}>
                              <Icon className="h-3 w-3 shrink-0" />
                              {meta.label}
                            </span>
                            <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{origem}</div>
                            {item.severidade === 'alta' && (
                              <span className="ml-1 inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                                critico
                              </span>
                            )}
                          </td>
                          <td className="max-w-[220px] px-4 py-3 align-top text-xs text-slate-300">
                            <span className="line-clamp-3">{desc.nosso}</span>
                          </td>
                          <td className="max-w-[260px] px-4 py-3 align-top text-xs text-slate-400">
                            <span className="line-clamp-3">{desc.emusys}</span>
                          </td>
                          <td className="max-w-[260px] px-4 py-3 align-top text-xs text-cyan-200">
                            <span className="line-clamp-3">{desc.sugestao}</span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex min-w-[260px] flex-wrap justify-end gap-1.5">
                              {podeAplicar && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => executarAtributoRPC(item, 'aplicar_emusys')}
                                  className="inline-flex h-7 items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                                >
                                  Aplicar Emusys
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => executarAtributoRPC(item, 'manter_la')}
                                className="inline-flex h-7 items-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                              >
                                Manter LA Report
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => executarAtributoRPC(item, 'revisar')}
                                className="inline-flex h-7 items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                              >
                                Revisar
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => executarAtributoRPC(item, 'ignorar')}
                                className="inline-flex h-7 items-center rounded-md border border-slate-600 bg-slate-800 px-2 text-[11px] font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                              >
                                Ignorar
                              </button>
                            </div>
                            {!podeAplicar && (
                              <div className="mt-1 text-right text-[10px] text-slate-500">
                                checklist interno
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalAtributosFiltroExato > atributosVisiveis.length && (
              <div className="border-t border-slate-700/70 px-4 py-2 text-right text-[11px] text-slate-500">
                Mostrando {atributosVisiveis.length} de {totalAtributosFiltroExato} neste filtro. O lote carrega primeiro prioridade alta, financeiro, foto/Instagram, cadastro e checklist.
              </div>
            )}
          </div>
        </section>
      )}

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
