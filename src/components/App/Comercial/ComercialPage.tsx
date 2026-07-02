import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { 
  Smartphone, 
  Guitar, 
  Building2, 
  CheckCircle2, 
  Plus,
  Copy,
  TrendingUp,
  Calendar,
  X,
  Loader2,
  CalendarDays,
  BarChart3,
  Clock,
  Target,
  Lock,
  ArrowRight,
  Zap,
  Users,
  Pencil,
  Check,
  Trash2,
  FileText,
  RotateCcw,
  Send,
  GraduationCap,
  Trophy,
  CheckSquare,
  Search,
  Phone,
  PhoneOff,
  AlertTriangle,
  AlertCircle,
  Brain,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ClipboardCheck
} from 'lucide-react';
import { TarefasRapidasTab } from '@/components/shared/TarefasRapidas';
import { CanalOrigemBadge } from '@/components/shared/CanalOrigemBadge';
import { FunnelPipelineNav } from './FunnelPipelineNav';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { copyTextToClipboard, getManualCopyShortcut } from '@/lib/clipboard';
import { ehMatriculaComercialCanonica } from '@/lib/comercialMatriculasCanonicas';
import { resolverProfessorExperimentalCanonico } from '@/lib/comercialProfessorExperimental.js';
import { calcularRangeRelatorioMensalComercial } from '@/lib/relatorioComercialMensal';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { PageFilterBar } from '@/components/ui/page-filter-bar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePickerNascimento } from '@/components/ui/date-picker-nascimento';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { ComboboxNome, SugestaoLead } from '@/components/ui/combobox-nome';
import { ComboboxTelefone } from '@/components/ui/combobox-telefone';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { verificarDuplicadosEmLote, useCheckLeadDuplicado } from '@/hooks/useCheckLeadDuplicado';
import { useCheckAlunoDuplicado, type AlunoDuplicado } from '@/hooks/useCheckAlunoDuplicado';
import type { LeadDuplicado } from '@/hooks/useCheckLeadDuplicado';
import { CelulaEditavelInline } from '@/components/ui/CelulaEditavelInline';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertasComercial } from './AlertasComercial';
import { PlanoAcaoComercial } from './PlanoAcaoComercial';
import { TabProgramaMatriculador } from './TabProgramaMatriculador';
import { ComercialConciliacaoExperimentais } from './ComercialConciliacaoExperimentais';
import { ModalMatricular } from '../PreAtendimento/components/ModalMatricular';
import { ModalArquivar } from '../PreAtendimento/components/ModalArquivar';
import { ModalEditarLead } from '../PreAtendimento/components/ModalEditarLead';
import type { LeadEditPatch } from '../PreAtendimento/components/ModalEditarLead';
import type { LeadCRM } from '../PreAtendimento/types';

// Helpers de ordenação (3 estados: asc -> desc -> null)
type SortDir = 'asc' | 'desc';
type SortConfig = { col: string; dir: SortDir } | null;

const nextSort = (prev: SortConfig, col: string): SortConfig => {
  if (prev?.col !== col) return { col, dir: 'asc' };
  if (prev.dir === 'asc') return { col, dir: 'desc' };
  return null;
};

const sortArray = <T,>(arr: T[], cfg: SortConfig, getter: (item: T, col: string) => unknown): T[] => {
  if (!cfg) return arr;
  const sign = cfg.dir === 'asc' ? 1 : -1;
  return [...arr].sort((a, b) => {
    const va = getter(a, cfg.col);
    const vb = getter(b, cfg.col);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sign;
  });
};

interface SortableThProps {
  col: string;
  label: string;
  sort: SortConfig;
  onSort: (col: string) => void;
  className?: string;
  align?: 'left' | 'right';
  tooltip?: string;
}
const SortableTh: React.FC<SortableThProps> = ({ col, label, sort, onSort, className, align = 'left', tooltip }) => {
  const active = sort?.col === col;
  const dir = active ? sort!.dir : null;
  const conteudo = (
    <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end w-full' : ''}${tooltip ? ' cursor-help underline decoration-dotted decoration-slate-600 underline-offset-4' : ''}`}>
      {label}
      {dir === 'asc' ? (
        <ChevronUp className="w-3 h-3 text-violet-400" />
      ) : dir === 'desc' ? (
        <ChevronDown className="w-3 h-3 text-violet-400" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-30" />
      )}
    </span>
  );
  return (
    <th
      className={`pb-3 px-2 font-medium cursor-pointer select-none hover:text-white transition-colors ${className ?? 'border-r border-slate-700/30'}`}
      onClick={() => onSort(col)}
    >
      {tooltip ? <Tooltip content={tooltip} side="top">{conteudo}</Tooltip> : conteudo}
    </th>
  );
};

// Tipos
interface LeadDiario {
  id?: number;
  unidade_id: string;
  data_contato: string;
  status: string;
  etapa_pipeline_id: number | null;
  canal_origem_id: number | null;
  curso_interesse_id: number | null;
  quantidade: number;
  observacoes: string | null;
  nome: string | null;
  idade: number | null;
  professor_experimental_id: number | null;
  professor_fixo_id: number | null;
  agente_comercial: string | null;
  valor_passaporte: number | null;
  valor_parcela: number | null;
  forma_pagamento_id: number | null;
  forma_pagamento_passaporte_id: number | null;
  dia_vencimento: number | null;
  tipo_matricula: string | null;
  tipo_aluno: string | null;
  aluno_novo_retorno: string | null;
  unidades?: { codigo: string };
}

interface Option {
  value: number;
  label: string;
}

interface AnamnesePendente {
  id: number;
  nome_aluno: string;
  tipo_formulario: string | null;
  temperamento_codinome: string | null;
  created_at: string;
}

const UNIDADE_MAP: Record<string, string> = {
  cg: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  rec: '95553e96-971b-4590-a6eb-0201d013c14d',
  bar: '368d47f5-2d88-4475-bc14-ba084a9a348e',
};

function normalizarBuscaAnamnese(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolverUnidade(valor?: string | null) {
  if (!valor) return '';
  return UNIDADE_MAP[String(valor).trim().toLowerCase()] || valor;
}

interface ResumoMes {
  leads: number;
  experimentais: number;
  visitas: number;
  matriculas: number;
  matriculasPorCanal: { canal: string; quantidade: number }[];
  matriculasPorCurso: { curso: string; quantidade: number }[];
  conversaoLeadExp: number;
  conversaoLeadMat: number;
  conversaoExpMat: number;
  taxaExpMatLiberada: boolean;
  denominadorExpMat: number;
  conversoesExpMat: number;
  pendenciasExpMat: number;
}

interface TaxaExpMatCanonica {
  liberada: boolean;
  taxa: number;
  denominador: number;
  conversoes: number;
  pendencias: number;
  realizadasConfirmadas: number;
}

const taxaExpMatIndisponivel: TaxaExpMatCanonica = {
  liberada: false,
  taxa: 0,
  denominador: 0,
  conversoes: 0,
  pendencias: 0,
  realizadasConfirmadas: 0,
};

const numeroResumo = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

const buscarTaxaExpMatCanonica = async (
  unidadeId: string | null | undefined,
  ano: number,
  mes: number,
  periodo: 'mensal' | 'diario' = 'mensal',
  data?: string | null
): Promise<TaxaExpMatCanonica> => {
  const { data: payload, error } = await supabase.rpc('get_conciliacao_experimentais_v2', {
    p_unidade_id: unidadeId && unidadeId !== 'todos' ? unidadeId : null,
    p_ano: ano,
    p_mes: mes,
    p_periodo: periodo,
    p_data: data || null,
  });

  if (error) {
    console.warn('[comercial] falha ao buscar taxa Exp->Mat canonica:', error);
    return taxaExpMatIndisponivel;
  }

  const resumo = (payload as any)?.resumo || {};
  return {
    liberada: resumo.taxa_exp_mat_liberada === true,
    taxa: numeroResumo(resumo.taxa_exp_mat_canonica),
    denominador: numeroResumo(resumo.denominador_taxa_exp_mat),
    conversoes: numeroResumo(resumo.conversoes_exp_mat_canonicas),
    pendencias: numeroResumo(resumo.pendencias_taxa_exp_mat),
    realizadasConfirmadas: numeroResumo(
      resumo.experimentais_realizadas_confirmadas ?? resumo.denominador_taxa_exp_mat
    ),
  };
};

const textoTaxaExpMat = (taxa: TaxaExpMatCanonica) =>
  taxa.liberada
    ? `*${taxa.taxa.toFixed(1)}%* (${taxa.conversoes}/${taxa.denominador})`
    : taxa.denominador === 0 && taxa.pendencias === 0
      ? '*SEM BASE* (0 pendencia(s); aguardando experimentais confirmadas)'
    : `*BLOQUEADA* (${taxa.pendencias} pendencia(s) de conciliacao)`;

// Cards de Quick Input
const quickInputCards = [
  { 
    id: 'lead', 
    label: 'Leads Atendidos', 
    icon: Smartphone, 
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400'
  },
  { 
    id: 'experimental', 
    label: 'Experimental', 
    icon: Guitar, 
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-400'
  },
  { 
    id: 'visita', 
    label: 'Visita', 
    icon: Building2, 
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400'
  },
  { 
    id: 'matricula', 
    label: 'Matrícula', 
    icon: CheckCircle2, 
    color: 'from-emerald-500 to-teal-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400'
  },
];

const TIPOS_MATRICULA = [
  { value: 'EMLA', label: 'EMLA (Adulto)' },
  { value: 'LAMK', label: 'LAMK (Kids)' },
];

const TIPOS_ALUNO = [
  { value: 'pagante', label: 'Pagante' },
  { value: 'bolsista_integral', label: 'Bolsista Integral' },
  { value: 'bolsista_parcial', label: 'Bolsista Parcial' },
  { value: 'nao_pagante', label: 'Não Pagante' },
];

// Tipos que dispensam forma de pagamento e valores obrigatórios
const TIPOS_SEM_PAGAMENTO = ['bolsista_integral', 'nao_pagante'];

// Fonte única da regra "matrícula nova" (primária paga): exclui 2º curso, banda e
// passaporte zerado (re-matrícula / bolsista integral). Usado por resumo, funil,
// relatórios e cards para nunca divergirem. Aceita tanto o objeto do state
// (campos planos is_banda/curso_nome) quanto o do relatório (aninhado em cursos).
const ehMatriculaNova = (m: any): boolean => {
  return ehMatriculaComercialCanonica(m);
};

// Formatação monetária BRL com exatamente 2 casas (evita o bug de 3 decimais do
// toLocaleString quando só se define minimumFractionDigits).
const fmtBRL = (n: number): string =>
  (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Item normalizado da busca GLOBAL (registros que batem com a busca mas estão FORA
// do período selecionado) — usado pela seção de aviso em cada aba do funil.
interface ItemForaPeriodo {
  id: number;
  leadId: number;
  experimentalId?: number;
  nome: string;
  telefone: string;
  dataLabel: string;
  statusLabel: string;
  detalhe: string;
  unidade?: string;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Seção de aviso exibida abaixo da lista de cada aba quando a busca encontra
// registros fora do período selecionado. Retorna null se não houver nada.
// semCabecalho=true: suprime separador âmbar (usado quando há busca ativa — tudo fica numa lista unificada).
function ResultadosForaPeriodo({ itens, periodoLabel, isAdmin, onEditar, semCabecalho }: { itens: ItemForaPeriodo[]; periodoLabel: string; isAdmin: boolean; onEditar?: (item: ItemForaPeriodo) => void; semCabecalho?: boolean }) {
  if (!itens.length) return null;
  return (
    <div className={semCabecalho ? 'mt-0' : 'mt-6'}>
      {!semCabecalho && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-amber-500/30" />
            <span className="text-xs text-amber-400 font-medium whitespace-nowrap">⚠️ Encontrados em outro período ({itens.length})</span>
            <div className="h-px flex-1 bg-amber-500/30" />
          </div>
          <p className="text-[11px] text-amber-300/70 text-center mt-1 mb-2">
            Estes registros batem com a busca, mas estão <span className="font-medium">fora de {periodoLabel}</span>.
          </p>
        </>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-700/50">
            <th className="pb-2 px-2 font-medium">Quando</th>
            <th className="pb-2 px-2 font-medium">Nome</th>
            <th className="pb-2 px-2 font-medium">Telefone</th>
            <th className="pb-2 px-2 font-medium">Status</th>
            <th className="pb-2 px-2 font-medium">Detalhe</th>
            {isAdmin && <th className="pb-2 px-2 font-medium">Unidade</th>}
            {onEditar && <th className="pb-2 px-2 font-medium">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {itens.map(it => (
            <tr key={it.id} className="border-b border-slate-700/40 bg-amber-500/[0.04]">
              <td className="py-2 px-2"><span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 whitespace-nowrap">{it.dataLabel}</span></td>
              <td className="py-2 px-2 text-white font-medium">{it.nome || '-'}</td>
              <td className="py-2 px-2 text-emerald-400">{it.telefone || '-'}</td>
              <td className="py-2 px-2 text-slate-300">{it.statusLabel}</td>
              <td className="py-2 px-2 text-slate-400">{it.detalhe || '-'}</td>
              {isAdmin && <td className="py-2 px-2 text-slate-400">{it.unidade || '-'}</td>}
              {onEditar && (
                <td className="py-2 px-2">
                  <button
                    onClick={() => onEditar(it)}
                    className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                  >
                    Editar
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ComercialPage() {
  useSetPageTitle({
    titulo: 'Comercial',
    subtitulo: 'Lançamento diário de leads, experimentais, visitas e matrículas',
    icone: TrendingUp,
    iconeCor: 'text-emerald-400',
    iconeWrapperCor: 'bg-emerald-500/20',
  });

  const { usuario, isAdmin, unidadeId } = useAuth();
  const context = useOutletContext<{ filtroAtivo: string | null; unidadeSelecionada: string | null; setPeriodoLabel?: (label: string | null) => void }>();
  const filtroAtivo = context?.filtroAtivo;

  // Hook de filtro de competência (período)
  const competencia = useCompetenciaFiltro();

  // Sincronizar badge do header com o filtro local
  useEffect(() => {
    context?.setPeriodoLabel?.(competencia.range.label);
    return () => { context?.setPeriodoLabel?.(null); };
  }, [competencia.range.label]);
  
  // Para usuário de unidade: sempre usa sua unidade (unidadeId do auth)
  // Para admin: usa a unidade selecionada no dropdown do header (unidadeSelecionada do context)
  const unidadeParaSalvar = isAdmin 
    ? context?.unidadeSelecionada 
    : unidadeId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmouDuplicataLote, setConfirmouDuplicataLote] = useState(false);
  const [abaPrincipal, setAbaPrincipal] = useState<'lancamentos' | 'conciliacao' | 'programa' | 'tarefas'>('lancamentos');
  const [modalOpen, setModalOpen] = useState<'lead' | 'matricula' | 'experimental' | null>(null);
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [tipoRelatorio, setTipoRelatorio] = useState<'diario' | 'semanal' | 'mensal' | 'matriculas' | 'comparativo_mensal' | 'comparativo_anual' | null>(null);
  const [relatorioTexto, setRelatorioTexto] = useState('');
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [enviadoWhatsApp, setEnviadoWhatsApp] = useState(false);
  const [erroWhatsApp, setErroWhatsApp] = useState<string | null>(null);
  const [numeroTeste, setNumeroTeste] = useState('');
  const [cronComercialAtivo, setCronComercialAtivo] = useState(false);
  const [loadingCronComercial, setLoadingCronComercial] = useState(false);
  
  // Estado para período do relatório (simplificado)
  const [relatorioPeriodo, setRelatorioPeriodo] = useState<'hoje' | 'ontem' | 'mes_anterior' | 'personalizado'>('hoje');
  const [relatorioDataInicio, setRelatorioDataInicio] = useState<Date>(new Date());
  const [relatorioDataFim, setRelatorioDataFim] = useState<Date>(new Date());
  const [canais, setCanais] = useState<Option[]>([]);
  const [cursos, setCursos] = useState<Option[]>([]);
  const [professores, setProfessores] = useState<Option[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<Option[]>([]);
  const [unidades, setUnidades] = useState<Option[]>([]);
  
  // Estado do modal de experimental
  const [expForm, setExpForm] = useState({ telefone: '', nome: '', canal_origem_id: null as number | null, curso_interesse_id: null as number | null, data_experimental: '', horario_experimental: '', professor_experimental_id: null as number | null });
  const [expLeadEncontrado, setExpLeadEncontrado] = useState<any>(null);
  const [expBuscando, setExpBuscando] = useState(false);
  const [expBuscou, setExpBuscou] = useState(false);

  // Resumo do mês
  const [resumo, setResumo] = useState<ResumoMes>({
    leads: 0,
    experimentais: 0,
    visitas: 0,
    matriculas: 0,
    matriculasPorCanal: [],
    matriculasPorCurso: [],
    conversaoLeadExp: 0,
    conversaoLeadMat: 0,
    conversaoExpMat: 0,
    taxaExpMatLiberada: false,
    denominadorExpMat: 0,
    conversoesExpMat: 0,
    pendenciasExpMat: 0,
  });
  
  // Registros do dia
  const [registrosHoje, setRegistrosHoje] = useState<LeadDiario[]>([]);

  useEffect(() => {
    const unidadeCron = unidadeParaSalvar;
    if (!relatorioOpen || !unidadeCron || unidadeCron === 'todos') {
      setCronComercialAtivo(false);
      return;
    }

    supabase
      .from('unidades')
      .select('relatorio_comercial_diario_cron_ativo')
      .eq('id', unidadeCron)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[Comercial] Erro ao carregar cron comercial:', error);
          setCronComercialAtivo(false);
          return;
        }
        setCronComercialAtivo(Boolean(data?.relatorio_comercial_diario_cron_ativo));
      });
  }, [relatorioOpen, unidadeParaSalvar]);

  const toggleCronComercial = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const unidadeCron = unidadeParaSalvar;
    if (!unidadeCron || unidadeCron === 'todos') return;

    const novoValor = !cronComercialAtivo;
    setLoadingCronComercial(true);
    const { error } = await supabase.rpc('toggle_relatorio_comercial_cron', {
      p_unidade_id: unidadeCron,
      p_ativo: novoValor,
    });
    setLoadingCronComercial(false);

    if (error) {
      console.error('[Comercial] Erro ao atualizar cron comercial:', error);
      toast.error('Erro ao atualizar envio automático comercial');
      return;
    }

    setCronComercialAtivo(novoValor);
    toast.success(novoValor ? 'Relatório comercial automático ativado' : 'Relatório comercial automático desativado');
  };
  
  // Gerar relatório automaticamente quando o tipo ou período muda
  useEffect(() => {
    if (tipoRelatorio === 'diario') {
      gerarRelatorioDiario().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'semanal') {
      gerarRelatorioSemanal().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'mensal') {
      gerarRelatorioMensal().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'matriculas') {
      gerarRelatorioMatriculas().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'comparativo_mensal') {
      gerarRelatorioComparativoMensal().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'comparativo_anual') {
      gerarRelatorioComparativoAnual().then(texto => setRelatorioTexto(texto));
    }
  }, [tipoRelatorio, relatorioPeriodo, relatorioDataInicio, relatorioDataFim, filtroAtivo, context?.unidadeSelecionada, usuario?.unidade_id, isAdmin]);
  
  // Matrículas do mês (para tabela)
  const [matriculasMes, setMatriculasMes] = useState<(LeadDiario & { 
    canal_nome?: string; 
    curso_nome?: string; 
    professor_exp_nome?: string;
    professor_fixo_nome?: string;
    forma_pagamento_nome?: string;
    forma_pagamento_passaporte_nome?: string;
  })[]>([]);
  
  // Registros do mês por tipo (para tabelas de detalhamento)
  const [leadsMes, setLeadsMes] = useState<(LeadDiario & { canal_nome?: string; curso_nome?: string })[]>([]);
  const [experimentaisMes, setExperimentaisMes] = useState<(LeadDiario & { canal_nome?: string; curso_nome?: string; professor_nome?: string })[]>([]);
  const [experimentaisDetalhadas, setExperimentaisDetalhadas] = useState<any[]>([]);
  const [visitasMes, setVisitasMes] = useState<(LeadDiario & { canal_nome?: string; curso_nome?: string })[]>([]);
  const [experimentaisHojeOutros, setExperimentaisHojeOutros] = useState<(LeadDiario & { canal_nome?: string; curso_nome?: string; professor_nome?: string; unidade_codigo?: string })[]>([]);

  const [gruposExpandidos, setGruposExpandidos] = useState<Set<number>>(new Set());

  // Aba selecionada no detalhamento
  const [abaDetalhamento, setAbaDetalhamento] = useState<'leads' | 'experimental' | 'visita' | 'matricula'>('matricula');
  const [buscaFunil, setBuscaFunil] = useState('');
  // Resultados da busca GLOBAL ao banco (registros que batem com a busca mas estão fora do período)
  const [buscaFora, setBuscaFora] = useState<{ leads: ItemForaPeriodo[]; experimentais: ItemForaPeriodo[]; visitas: ItemForaPeriodo[]; matriculas: ItemForaPeriodo[] }>({ leads: [], experimentais: [], visitas: [], matriculas: [] });
  const [filtroTelefoneFunil, setFiltroTelefoneFunil] = useState<'todos' | 'com' | 'sem'>('todos');
  const [filtroIncompletoFunil, setFiltroIncompletoFunil] = useState<string>('todos');
  const [filtroCanalFunil, setFiltroCanalFunil] = useState<string>('todos');
  const [filtroCursoFunil, setFiltroCursoFunil] = useState<string>('todos');
  const [filtroProfessorFunil, setFiltroProfessorFunil] = useState<string>('todos');
  const [filtroTipoExp, setFiltroTipoExp] = useState<'leads_novos' | 'todos' | 'alunos' | 'agendadas_periodo'>('leads_novos');
  // Filtro de presença na aba Experimentais: compareceram (vieram) vs faltaram
  const [filtroPresencaExp, setFiltroPresencaExp] = useState<'todas' | 'compareceram' | 'faltaram'>('compareceram');
  const [filtroTipoMat, setFiltroTipoMat] = useState<'novos_alunos' | 'segundo_curso' | 'todos'>('novos_alunos');
  const [selecionadosFunil, setSelecionadosFunil] = useState<Set<number>>(new Set());
  const [excluindoEmLote, setExcluindoEmLote] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [leadsGlobais, setLeadsGlobais] = useState<any[]>([]);
  const [buscandoGlobal, setBuscandoGlobal] = useState(false);
  const [paginaLeads, setPaginaLeads] = useState(1);

  // Ordenação por tabela do funil (independente entre as abas)
  const [sortNovos, setSortNovos] = useState<SortConfig>(null);
  const [sortExperimentais, setSortExperimentais] = useState<SortConfig>(null);
  const [sortVisitas, setSortVisitas] = useState<SortConfig>(null);
  const [sortMatriculas, setSortMatriculas] = useState<SortConfig>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Partial<LeadDiario>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteMatriculaId, setDeleteMatriculaId] = useState<number | null>(null);

  // Estados para lançamento em lote
  interface LoteLinha {
    id: string;
    aluno_nome?: string;
    telefone?: string;
    canal_origem_id: number | null;
    curso_id: number | null;
    quantidade: number;
    status_experimental?: string;
    professor_id?: number | null;
    sabia_preco?: boolean | null;
  }
  
  const genId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const [loteData, setLoteData] = useState(new Date());
  const [loteLeads, setLoteLeads] = useState<LoteLinha[]>([
    { id: genId(), aluno_nome: '', telefone: '', canal_origem_id: null, curso_id: null, quantidade: 1 }
  ]);
  
  // Sugestões de leads para autocomplete
  const [sugestoesLeads, setSugestoesLeads] = useState<SugestaoLead[]>([]);

  // State para popover de mover etapa (campos condicionais)
  const [moverEtapaForm, setMoverEtapaForm] = useState<{
    leadId: number;
    etapa: number;
    professorId: string;
    dataExp: string;
  } | null>(null);

  // State para modais de matricular/arquivar/editar via etapa
  const [leadParaMatricular, setLeadParaMatricular] = useState<LeadCRM | null>(null);
  const [leadParaArquivar, setLeadParaArquivar] = useState<LeadCRM | null>(null);
  const [leadParaEditar, setLeadParaEditar] = useState<{ lead: LeadCRM; experimentalId?: number } | null>(null);

  const handleEditarForaPeriodo = async (item: ItemForaPeriodo) => {
    const { data } = await supabase
      .from('leads')
      .select('*, canais_origem(nome), cursos:curso_interesse_id(nome), unidades(nome, codigo), professores:professor_experimental_id(nome)')
      .eq('id', item.leadId)
      .single();
    if (data) setLeadParaEditar({ lead: data as LeadCRM, experimentalId: item.experimentalId });
  };

  // State para form experimental em bulk
  const [bulkExpForm, setBulkExpForm] = useState<{ professorId: string; dataExp: string } | null>(null);

  // Form states (para matrícula individual)
  const [formData, setFormData] = useState({
    data: new Date(),
    quantidade: 1,
    canal_origem_id: null as number | null,
    curso_id: null as number | null,
    modalidade: 'turma' as string,
    status_experimental: 'experimental_agendada',
    professor_id: null as number | null,
    aluno_nome: '',
    aluno_telefone: '',
    aluno_data_nascimento: null as Date | null,
    tipo_matricula: 'EMLA',
    tipo_aluno: 'pagante',
    teve_experimental: false,
    professor_experimental_id: null as number | null,
    professor_fixo_id: null as number | null,
    valor_passaporte: null as number | null,
    valor_parcela: null as number | null,
    forma_pagamento_id: null as number | null,
    forma_pagamento_passaporte_id: null as number | null,
    forma_pagamento_passaporte: '' as string,
    parcelas_passaporte: 1 as number,
    dia_vencimento: 5 as number | null,
    unidade_id: null as string | null,
    // Novos campos para turma e flags
    dia_aula: '' as string,
    horario_aula: '' as string,
    is_ex_aluno: false,
    is_aluno_retorno: false,
    responsavel_nome: '',
    responsavel_telefone: '',
    responsavel_parentesco: '',
  });

  // Verificacao de duplicidade no fluxo de Matricula
  const [confirmouDupMatricula, setConfirmouDupMatricula] = useState(false);
  const [ignorarDupFortes, setIgnorarDupFortes] = useState<Set<number>>(new Set());
  const [ignorarDupFracas, setIgnorarDupFracas] = useState<Set<number>>(new Set());
  const [anamnesePendenteMatricula, setAnamnesePendenteMatricula] = useState<AnamnesePendente | null>(null);
  const [buscandoAnamneseMatricula, setBuscandoAnamneseMatricula] = useState(false);
  const buscaAnamneseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkLead = useCheckLeadDuplicado();
  const checkAluno = useCheckAlunoDuplicado();

  const limparBuscaAnamneseMatricula = useCallback(() => {
    if (buscaAnamneseTimeoutRef.current) {
      clearTimeout(buscaAnamneseTimeoutRef.current);
      buscaAnamneseTimeoutRef.current = null;
    }
    setBuscandoAnamneseMatricula(false);
  }, []);

  const agendarBuscaAnamneseMatricula = useCallback((nome: string, unidade?: string | null) => {
    limparBuscaAnamneseMatricula();

    const nomeDigitado = nome.trim();
    const unidadeBusca = resolverUnidade(unidade || null) || null;

    if (nomeDigitado.length < 3 || !unidadeBusca) {
      setAnamnesePendenteMatricula(null);
      return;
    }

    buscaAnamneseTimeoutRef.current = setTimeout(async () => {
      setBuscandoAnamneseMatricula(true);

      const { data, error } = await supabase.rpc('buscar_anamnese_pendente', {
        p_nome: nomeDigitado,
        p_unidade_id: unidadeBusca,
      });

      if (error) {
        console.error('Erro ao buscar anamnese pendente da matrícula:', error);
        setAnamnesePendenteMatricula(null);
      } else {
        setAnamnesePendenteMatricula(data || null);
      }

      setBuscandoAnamneseMatricula(false);
      buscaAnamneseTimeoutRef.current = null;
    }, 500);
  }, [limparBuscaAnamneseMatricula]);

  // Verificacao em tempo real quando matricula esta aberta
  useEffect(() => {
    if (modalOpen !== 'matricula') {
      checkLead.limparDuplicados();
      checkAluno.limparDuplicados();
      return;
    }
    // Mesma logica do handleSave: admin usa formData.unidade_id se preenchida, senao fallback
    const unidade = isAdmin
      ? (formData.unidade_id || unidadeParaSalvar)
      : unidadeParaSalvar;
    if (!unidade) return;
    const nome = formData.aluno_nome.trim();
    const tel = formData.aluno_telefone.trim();
    const telResp = formData.responsavel_telefone.trim();
    if (nome.length < 3 && !tel && !telResp) return;
    const t = setTimeout(() => {
      checkLead.verificar(nome, tel, unidade);
      checkAluno.verificar({
        nome,
        telefoneAluno: tel || null,
        telefoneResponsavel: telResp || null,
        dataNascimento: formData.aluno_data_nascimento
          ? formData.aluno_data_nascimento.toISOString().split('T')[0]
          : null,
        unidadeId: unidade,
      });
    }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modalOpen,
    formData.aluno_nome,
    formData.aluno_telefone,
    formData.responsavel_telefone,
    formData.aluno_data_nascimento,
    formData.unidade_id,
    unidadeParaSalvar,
    isAdmin,
  ]);

  useEffect(() => {
    if (modalOpen !== 'matricula') {
      limparBuscaAnamneseMatricula();
      setAnamnesePendenteMatricula(null);
      return;
    }

    const unidadeBusca = isAdmin
      ? (formData.unidade_id || unidadeParaSalvar)
      : unidadeParaSalvar;
    agendarBuscaAnamneseMatricula(formData.aluno_nome, unidadeBusca);
  }, [modalOpen, formData.aluno_nome, formData.unidade_id, isAdmin, unidadeParaSalvar, agendarBuscaAnamneseMatricula, limparBuscaAnamneseMatricula]);

  // Reset confirmacao quando lista de duplicatas muda
  useEffect(() => {
    setConfirmouDupMatricula(false);
  }, [checkLead.duplicatasFortes, checkAluno.duplicatasFortes]);

  const matFortesAtivas = [
    ...checkLead.duplicatasFortes.filter(d => !ignorarDupFortes.has(d.id)).map(d => ({ ...d, _origem: 'lead' as const })),
    ...checkAluno.duplicatasFortes.filter(d => !ignorarDupFortes.has(d.id)).map(d => ({ ...d, _origem: 'aluno' as const })),
  ];
  const matFracasAtivas = [
    ...checkLead.duplicatasFracas.filter(d => !ignorarDupFracas.has(d.id)).map(d => ({ ...d, _origem: 'lead' as const })),
    ...checkAluno.duplicatasFracas.filter(d => !ignorarDupFracas.has(d.id)).map(d => ({ ...d, _origem: 'aluno' as const })),
  ];
  const matTemForteNaoIgnorada = matFortesAtivas.length > 0;

  // Carregar dados mestres
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        // Determinar a unidade para filtrar cursos
        const unidadeFiltro = unidadeParaSalvar;
        
        const [canaisRes, professoresRes, formasRes, unidadesRes] = await Promise.all([
          supabase.from('canais_origem').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('formas_pagamento').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome'),
        ]);

        // Buscar cursos filtrados por unidade (se houver unidade selecionada)
        let cursosData: { value: string; label: string }[] = [];
        if (unidadeFiltro) {
          // Tentar buscar cursos ativos na unidade específica via unidades_cursos
          const { data: unidadesCursosData } = await supabase
            .from('unidades_cursos')
            .select(`
              curso_id,
              ativo,
              cursos (id, nome, ativo)
            `)
            .eq('unidade_id', unidadeFiltro)
            .eq('ativo', true);
          
          // Filtrar apenas cursos que também estão ativos globalmente
          cursosData = (unidadesCursosData || [])
            .filter((uc: any) => uc.cursos && uc.cursos.ativo)
            .map((uc: any) => ({ value: uc.cursos.id, label: uc.cursos.nome }))
            .sort((a, b) => a.label.localeCompare(b.label));
          
          // Fallback: se unidades_cursos estiver vazio, buscar todos os cursos ativos
          if (cursosData.length === 0) {
            const { data: cursosGlobais } = await supabase
              .from('cursos')
              .select('id, nome')
              .eq('ativo', true)
              .order('nome');
            cursosData = (cursosGlobais || []).map((c: any) => ({ value: c.id, label: c.nome }));
          }
        } else {
          // Sem unidade selecionada (admin consolidado) - buscar todos os cursos ativos
          const { data: cursosGlobais } = await supabase
            .from('cursos')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome');
          cursosData = (cursosGlobais || []).map((c: any) => ({ value: c.id, label: c.nome }));
        }

        if (canaisRes.data) setCanais(canaisRes.data.map((c: any) => ({ value: c.id, label: c.nome })));
        setCursos(cursosData);
        if (professoresRes.data) setProfessores(professoresRes.data.map((p: any) => ({ value: p.id, label: p.nome })));
        if (formasRes.data) setFormasPagamento(formasRes.data.map((f: any) => ({ value: f.id, label: f.nome })));
        if (unidadesRes.data) setUnidades(unidadesRes.data.map((u: any) => ({ value: u.id, label: u.nome })));
      } catch (error) {
        console.error('Erro ao carregar dados mestres:', error);
      }
    };

    loadMasterData();
  }, [unidadeParaSalvar]);

  // Carregar resumo do período e registros do dia
  const loadData = useCallback(async () => {
    if (!usuario?.unidade_id && usuario?.perfil !== 'admin') return;

    setLoading(true);
    try {
      const hoje = format(new Date(), 'yyyy-MM-dd'); // usa timezone local (BRT)
      
      // Usar range de datas do filtro de competência
      const { startDate, endDate } = competencia.range;
      // Query base - buscar também cursos, unidades e dados do aluno (para filtro comercial)
      let query = supabase
        .from('leads')
        .select('*, canais_origem(nome), cursos(nome), unidades(codigo), alunos:aluno_id(is_segundo_curso, is_aluno_retorno, is_ex_aluno)')
        .order('data_contato', { ascending: false })
        .limit(10000);

      // Aplicar filtro de datas apenas se preenchidos (tipo 'todos' não tem datas)
      if (startDate) query = query.gte('data_contato', startDate);
      if (endDate) query = query.lte('data_contato', endDate);

      // Aplicar filtro de unidade
      if (isAdmin) {
        // Admin: usa unidade selecionada no filtro (se não for "todos")
        if (context?.unidadeSelecionada && context.unidadeSelecionada !== 'todos') {
          query = query.eq('unidade_id', context.unidadeSelecionada);
        }
      } else {
        // Usuário de unidade: sempre filtra pela sua unidade
        if (usuario?.unidade_id) {
          query = query.eq('unidade_id', usuario.unidade_id);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      const registros = data || [];

      // Quando o filtro é "Hoje", buscar dados do mês inteiro para o "Acumulado do Mês"
      const isFiltroHoje = competencia.filtro.tipo === 'diario';
      let registrosParaResumo = registros;
      const mesStartDateResumo = `${competencia.filtro.ano}-${String(competencia.filtro.mes).padStart(2, '0')}-01`;
      const mesEndDateResumo = `${competencia.filtro.ano}-${String(competencia.filtro.mes).padStart(2, '0')}-${new Date(competencia.filtro.ano, competencia.filtro.mes, 0).getDate()}`;
      const matriculasResumoStartDate = isFiltroHoje ? mesStartDateResumo : startDate;
      const matriculasResumoEndDate = isFiltroHoje ? mesEndDateResumo : endDate;

      if (isFiltroHoje) {
        let queryMes = supabase
          .from('leads')
          .select('*, canais_origem(nome), cursos(nome), unidades(codigo)')
          .gte('data_contato', mesStartDateResumo)
          .lte('data_contato', mesEndDateResumo);

        if (isAdmin) {
          if (context?.unidadeSelecionada && context.unidadeSelecionada !== 'todos') {
            queryMes = queryMes.eq('unidade_id', context.unidadeSelecionada);
          }
        } else {
          if (usuario?.unidade_id) {
            queryMes = queryMes.eq('unidade_id', usuario.unidade_id);
          }
        }

        const { data: dadosMes } = await queryMes;
        registrosParaResumo = dadosMes || [];
      }

      const unidadeResumoId = isAdmin ? context?.unidadeSelecionada : usuario?.unidade_id;
      const taxaExpMatResumo = await buscarTaxaExpMatCanonica(
        unidadeResumoId,
        competencia.filtro.ano,
        competencia.filtro.mes,
        'mensal'
      );

      // Calcular resumo (usa mês inteiro quando filtro é "Hoje")
      const leads = registrosParaResumo.reduce((acc, r) => acc + r.quantidade, 0);
      const visitas = registrosParaResumo.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0);
      const matriculas = registrosParaResumo.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0);
      const experimentaisConfirmadas = taxaExpMatResumo.realizadasConfirmadas;

      // Matrículas por canal (convertidos)
      const canalMap = new Map<string, number>();
      registrosParaResumo.filter(r => ['matriculado','convertido'].includes(r.status)).forEach(r => {
        const canal = (r.canais_origem as any)?.nome || 'Não informado';
        canalMap.set(canal, (canalMap.get(canal) || 0) + r.quantidade);
      });
      const matriculasPorCanal = Array.from(canalMap.entries())
        .map(([canal, quantidade]) => ({ canal, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade);

      // Matrículas por curso (convertidos)
      const cursoMap = new Map<string, number>();
      registrosParaResumo.filter(r => ['matriculado','convertido'].includes(r.status)).forEach(r => {
        const curso = (r.cursos as any)?.nome || 'Não informado';
        cursoMap.set(curso, (cursoMap.get(curso) || 0) + r.quantidade);
      });
      const matriculasPorCurso = Array.from(cursoMap.entries())
        .map(([curso, quantidade]) => ({ curso, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade);

      // Conversões (3 métricas)
      const conversaoLeadExp = leads > 0 ? (experimentaisConfirmadas / leads) * 100 : 0;
      const conversaoLeadMat = leads > 0 ? (matriculas / leads) * 100 : 0;
      const conversaoExpMat = taxaExpMatResumo.taxa;

      // Nao usar snapshot legado como fallback: pode contaminar o funil.
      setResumo({
        leads,
        experimentais: experimentaisConfirmadas,
        visitas,
        matriculas,
        matriculasPorCanal,
        matriculasPorCurso,
        conversaoLeadExp,
        conversaoLeadMat,
        conversaoExpMat,
        taxaExpMatLiberada: taxaExpMatResumo.liberada,
        denominadorExpMat: taxaExpMatResumo.denominador,
        conversoesExpMat: taxaExpMatResumo.conversoes,
        pendenciasExpMat: taxaExpMatResumo.pendencias,
      });

      // Registros de hoje: apenas leads que entraram hoje (por data_contato)
      const registrosEntradaHoje = registros.filter(r => r.data_contato === hoje);
      setRegistrosHoje(registrosEntradaHoje);

      // ════════════════════════════════════════════════════════════════
      // Matrículas do período — FONTE: tabela `alunos` (cada aluno com
      // data_matricula no range = 1 matrícula real). Antes vinha de `leads`
      // convertidos, mas matrículas SEM lead (irmãos no mesmo telefone do
      // responsável, matrículas diretas) sumiam do funil. Ver regras-negocio.
      // Campos recebem aliases legados p/ manter compatibilidade com a tabela.
      // ════════════════════════════════════════════════════════════════
      let alunosMatQuery = supabase
        .from('alunos')
        .select('id, nome, telefone, responsavel_telefone, data_nascimento, idade_atual, curso_id, professor_atual_id, professor_experimental_id, tipo_matricula_id, tipo_aluno, forma_pagamento_id, valor_parcela, valor_passaporte, data_matricula, is_segundo_curso, modalidade, unidade_id, status, canal_origem_id, emusys_matricula_id, cursos:curso_id(nome, is_projeto_banda), canais_origem:canal_origem_id(nome), tipos_matricula:tipo_matricula_id!left(codigo, conta_como_pagante, entra_ticket_medio), unidades:unidade_id(codigo)')
        .not('data_matricula', 'is', null)
        .limit(10000);

      if (matriculasResumoStartDate) alunosMatQuery = alunosMatQuery.gte('data_matricula', matriculasResumoStartDate);
      if (matriculasResumoEndDate) alunosMatQuery = alunosMatQuery.lte('data_matricula', matriculasResumoEndDate);

      if (isAdmin) {
        if (context?.unidadeSelecionada && context.unidadeSelecionada !== 'todos') {
          alunosMatQuery = alunosMatQuery.eq('unidade_id', context.unidadeSelecionada);
        }
      } else if (usuario?.unidade_id) {
        alunosMatQuery = alunosMatQuery.eq('unidade_id', usuario.unidade_id);
      }

      const { data: alunosMatData } = await alunosMatQuery;

      let matriculasDoMes: any[] = (alunosMatData || []).map((a: any) => ({
        ...a,
        // aliases legados (compatibilidade com sortMat/filtros/tabela)
        curso_interesse_id: a.curso_id,
        professor_fixo_id: a.professor_atual_id,
        idade: a.idade_atual,
        data_conversao: a.data_matricula,
        curso_nome: (a.cursos as any)?.nome || '',
        is_banda: (a.cursos as any)?.is_projeto_banda || false,
        // preenchidos abaixo (professores / forma / lead vinculado)
        data_contato: null,
        // origem própria do aluno (matrícula direta usa esta; com lead, o lead sobrescreve abaixo)
        canal_origem_id: a.canal_origem_id ?? null,
        canal_nome: (a.canais_origem as any)?.nome || '',
        professor_fixo_nome: '',
        professor_exp_nome: '',
        forma_pagamento_nome: '',
        lead_id: null,
        lead_nome: null,
        is_orfao: true,
        lead_divergente: false,
      }));

      // Enriquecer com professores, forma de pagamento e lead vinculado (queries separadas)
      if (matriculasDoMes.length > 0) {
        const profIds = new Set<number>();
        const formaIds = new Set<number>();
        const alunoIds: number[] = [];
        matriculasDoMes.forEach(m => {
          if (m.professor_experimental_id) profIds.add(m.professor_experimental_id);
          if (m.professor_atual_id) profIds.add(m.professor_atual_id);
          if (m.forma_pagamento_id) formaIds.add(m.forma_pagamento_id);
          if (m.id) alunoIds.push(m.id);
        });

        const [profsData, formasData, leadsVinc] = await Promise.all([
          profIds.size > 0
            ? supabase.from('professores').select('id, nome').in('id', Array.from(profIds))
            : Promise.resolve({ data: [] as any[] }),
          formaIds.size > 0
            ? supabase.from('formas_pagamento').select('id, nome, sigla').in('id', Array.from(formaIds))
            : Promise.resolve({ data: [] as any[] }),
          alunoIds.length > 0
            ? supabase.from('leads').select('id, nome, aluno_id, canal_origem_id, data_contato, canais_origem(nome)').in('aluno_id', alunoIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const profMap = new Map<number, string>((profsData.data as any[])?.map(p => [p.id, p.nome] as [number, string]) || []);
        const formaMap = new Map<number, string>((formasData.data as any[])?.map(f => [f.id, f.sigla || f.nome] as [number, string]) || []);
        const leadMap = new Map<number, any>();
        ((leadsVinc.data as any[]) || []).forEach(l => {
          if (l.aluno_id && !leadMap.has(l.aluno_id)) leadMap.set(l.aluno_id, l);
        });

        matriculasDoMes.forEach(m => {
          m.professor_exp_nome = m.professor_experimental_id ? profMap.get(m.professor_experimental_id) || '' : '';
          m.professor_fixo_nome = m.professor_atual_id ? profMap.get(m.professor_atual_id) || '' : '';
          m.forma_pagamento_nome = m.forma_pagamento_id ? formaMap.get(m.forma_pagamento_id) || '' : '';
          const lead = leadMap.get(m.id);
          if (lead) {
            m.lead_id = lead.id;
            m.lead_nome = lead.nome;
            m.is_orfao = false;
            m.lead_divergente = (lead.nome || '').trim().toLowerCase() !== (m.nome || '').trim().toLowerCase();
            m.data_contato = lead.data_contato || null;
            m.canal_origem_id = lead.canal_origem_id || null;
            m.canal_nome = (lead.canais_origem as any)?.nome || '';
          }
        });
      }

      setMatriculasMes(matriculasDoMes as any);

      // Alinhar resumo/conversao a fonte real (alunos): conta matriculas primarias
      // (sem segundo curso/banda/passaporte zerado). Inclusive no filtro "Hoje",
      // o card superior mostra acumulado do mes, entao usa o mesmo range mensal.
      const matriculasPrimarias = matriculasDoMes.filter(ehMatriculaNova);
      const totalMatPrimarias = matriculasPrimarias.length;
      const matCanalMap = new Map<string, number>();
      const matCursoMap = new Map<string, number>();
      matriculasPrimarias.forEach((m: any) => {
        const canal = m.canal_nome || 'Nao informado';
        const curso = m.curso_nome || 'Nao informado';
        matCanalMap.set(canal, (matCanalMap.get(canal) || 0) + 1);
        matCursoMap.set(curso, (matCursoMap.get(curso) || 0) + 1);
      });
      setResumo(prev => ({
        ...prev,
        experimentais: taxaExpMatResumo.realizadasConfirmadas,
        matriculas: totalMatPrimarias,
        matriculasPorCanal: Array.from(matCanalMap.entries())
          .map(([canal, quantidade]) => ({ canal, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade),
        matriculasPorCurso: Array.from(matCursoMap.entries())
          .map(([curso, quantidade]) => ({ curso, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade),
        conversaoLeadMat: prev.leads > 0 ? (totalMatPrimarias / prev.leads) * 100 : 0,
        conversaoLeadExp: prev.leads > 0
          ? (taxaExpMatResumo.realizadasConfirmadas / prev.leads) * 100
          : 0,
        conversaoExpMat: taxaExpMatResumo.taxa,
        taxaExpMatLiberada: taxaExpMatResumo.liberada,
        denominadorExpMat: taxaExpMatResumo.denominador,
        conversoesExpMat: taxaExpMatResumo.conversoes,
        pendenciasExpMat: taxaExpMatResumo.pendencias,
      }));

      // Leads do mês (TODOS os leads, incluindo experimentais e convertidos)
      // Cada lead aparece aqui independente do status atual
      const leadsDoMes = registros
        .map(l => ({
          ...l,
          canal_nome: (l.canais_origem as any)?.nome || '',
          curso_nome: (l.cursos as any)?.nome || '',
        }));

      // Experimentais do mês (com nomes dos relacionamentos)
      const experimentaisDoMes = registros
        .filter(r => r.experimental_agendada === true)
        .map(e => ({
          ...e,
          canal_nome: (e.canais_origem as any)?.nome || '',
          curso_nome: (e.cursos as any)?.nome || '',
        }));
      
      // Buscar nomes dos professores para experimentais
      if (experimentaisDoMes.length > 0) {
        const profExpIds = new Set<number>();
        experimentaisDoMes.forEach(e => {
          if (e.professor_experimental_id) profExpIds.add(e.professor_experimental_id);
        });
        
        if (profExpIds.size > 0) {
          const { data: profsExpData } = await supabase
            .from('professores')
            .select('id, nome')
            .in('id', Array.from(profExpIds));
          
          const profExpMap = new Map<number, string>(profsExpData?.map(p => [p.id, p.nome] as [number, string]) || []);
          experimentaisDoMes.forEach(e => {
            (e as any).professor_nome = e.professor_experimental_id ? profExpMap.get(e.professor_experimental_id) || '' : '';
          });
        }
      }
      setLeadsMes(leadsDoMes);
      setExperimentaisMes(experimentaisDoMes);

      // Buscar experimentais detalhadas da nova tabela lead_experimentais
      // Filtro por data_contato do lead (não por data_experimental)
      {
        let expQuery = supabase
          .from('lead_experimentais')
          .select(`
            *,
            leads!inner(id, nome, telefone, canal_origem_id, unidade_id, data_contato, aluno_id, canais_origem(nome), unidades(codigo)),
            professores:professor_experimental_id(nome),
            cursos:curso_interesse_id(nome)
          `)
          .neq('status', 'cancelada')
          .order('data_experimental', { ascending: false });

        // Filtrar pela data da AULA experimental (data_experimental), não pelo data_contato
        // do lead — assim a experimental aparece no mês em que a aula aconteceu.
        if (startDate) expQuery = expQuery.gte('data_experimental', startDate);
        if (endDate) expQuery = expQuery.lte('data_experimental', endDate);

        if (isAdmin) {
          if (context?.unidadeSelecionada && context.unidadeSelecionada !== 'todos') {
            expQuery = expQuery.eq('unidade_id', context.unidadeSelecionada);
          }
        } else if (usuario?.unidade_id) {
          expQuery = expQuery.eq('unidade_id', usuario.unidade_id);
        }

        const { data: expData } = await expQuery;
        setExperimentaisDetalhadas((expData || []).map((e: any) => ({
          ...e,
          lead_nome: e.leads?.nome || e.nome_aluno,
          lead_telefone: e.leads?.telefone || '',
          lead_aluno_id: e.leads?.aluno_id || null,
          canal_nome: e.leads?.canais_origem?.nome || '',
          curso_nome: e.cursos?.nome || '',
          professor_nome: e.professores?.nome || '',
          unidade_codigo: e.leads?.unidades?.codigo || '',
          data_contato: e.leads?.data_contato || '',
        })));
      }

      // Visitas do mês (com nomes dos relacionamentos)
      const visitasDoMes = registros
        .filter(r => r.status === 'visita_escola')
        .map(v => ({
          ...v,
          canal_nome: (v.canais_origem as any)?.nome || '',
          curso_nome: (v.cursos as any)?.nome || '',
        }));
      setVisitasMes(visitasDoMes);

      // Experimentais AGENDADAS dentro do período (filtra por created_at do agendamento),
      // mas só as cuja AULA (data_experimental) cai FORA do range — pra não duplicar com a
      // lista principal, que agora filtra justamente por data_experimental.
      {
        const { startDate, endDate } = competencia.range;
        if (startDate && endDate) {
          // created_at é timestamptz: converter range BRT (00:00 a 23:59:59) para UTC bounds
          const createdAtStart = `${startDate}T00:00:00-03:00`;
          const createdAtEnd = `${endDate}T23:59:59.999-03:00`;

          let expOutrosQuery = supabase
            .from('lead_experimentais')
            .select(`
              *,
              leads!inner(id, nome, telefone, canal_origem_id, unidade_id, data_contato, canais_origem(nome), unidades(codigo)),
              professores:professor_experimental_id(nome),
              cursos:curso_interesse_id(nome)
            `)
            .gte('created_at', createdAtStart)
            .lte('created_at', createdAtEnd)
            .neq('status', 'cancelada')
            .or(`data_experimental.lt.${startDate},data_experimental.gt.${endDate},data_experimental.is.null`);

          if (isAdmin) {
            if (context?.unidadeSelecionada && context.unidadeSelecionada !== 'todos') {
              expOutrosQuery = expOutrosQuery.eq('unidade_id', context.unidadeSelecionada);
            }
          } else if (usuario?.unidade_id) {
            expOutrosQuery = expOutrosQuery.eq('unidade_id', usuario.unidade_id);
          }

          const { data: expOutrosData } = await expOutrosQuery.order('created_at', { ascending: true });

          const expOutrosMapped = (expOutrosData || []).map((e: any) => ({
            ...e,
            lead_nome: e.leads?.nome || e.nome_aluno,
            lead_telefone: e.leads?.telefone || '',
            canal_nome: e.leads?.canais_origem?.nome || '',
            curso_nome: e.cursos?.nome || '',
            professor_nome: e.professores?.nome || '',
            unidade_codigo: e.leads?.unidades?.codigo || '',
            data_contato: e.leads?.data_contato || '',
          }));
          setExperimentaisHojeOutros(expOutrosMapped);
        } else {
          setExperimentaisHojeOutros([]);
        }
      }

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [usuario?.unidade_id, usuario?.perfil, isAdmin, context?.unidadeSelecionada, competencia.range, filtroAtivo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Busca GLOBAL ao banco: quando há texto na busca, traz registros que batem mas estão
  // FORA do período selecionado (qualquer mês), pra encontrar lead/experimental/matrícula
  // de outro período. Cada aba exibe esses resultados numa seção de aviso separada.
  useEffect(() => {
    const termo = buscaFunil.trim();
    const { startDate, endDate } = competencia.range;
    // Sem texto suficiente, ou modo "todos" (sem range) — a busca normal já cobre tudo.
    if (termo.length < 2 || !startDate || !endDate) {
      setBuscaFora({ leads: [], experimentais: [], visitas: [], matriculas: [] });
      return;
    }
    const unidadeBusca = isAdmin
      ? (context?.unidadeSelecionada && context.unidadeSelecionada !== 'todos' ? context.unidadeSelecionada : null)
      : usuario?.unidade_id;
    const tel = termo.replace(/\D/g, '');
    const orNomeTel = tel.length >= 3 ? `nome.ilike.%${termo}%,telefone.ilike.%${tel}%` : `nome.ilike.%${termo}%`;
    const uni = (q: any) => unidadeBusca ? q.eq('unidade_id', unidadeBusca) : q;
    const fmtMes = (iso: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    const labelStatus = (s: string) => (({
      novo: 'Novo', agendado: 'Agendado', experimental_agendada: 'Exp. agendada', experimental_realizada: 'Exp. realizada',
      experimental_faltou: 'Faltou', visita_escola: 'Visita', convertido: 'Convertido', matriculado: 'Matriculado',
      perdido: 'Perdido', ativo: 'Ativo', evadido: 'Evadido', trancado: 'Trancado',
    } as Record<string, string>)[s] || s || '-');

    let cancelado = false;
    const handle = setTimeout(async () => {
      try {
        const [leadsR, expR, matR] = await Promise.all([
          uni(supabase.from('leads')
            .select('id, nome, telefone, data_contato, status, cursos:curso_interesse_id(nome), unidades(codigo)')
            .eq('arquivado', false)
            .or(orNomeTel)
            .or(`data_contato.lt.${startDate},data_contato.gt.${endDate}`)
            .limit(30)),
          uni(supabase.from('lead_experimentais')
            .select('id, nome_aluno, data_experimental, status, lead_id, leads!inner(nome, telefone, unidades(codigo)), professores:professor_experimental_id(nome), cursos:curso_interesse_id(nome)')
            .neq('status', 'cancelada')
            .or(`data_experimental.lt.${startDate},data_experimental.gt.${endDate}`)
            .or(orNomeTel, { referencedTable: 'leads' })
            .limit(30)),
          uni(supabase.from('alunos')
            .select('id, nome, telefone, data_matricula, status, cursos:curso_id(nome), unidades:unidade_id(codigo)')
            .not('data_matricula', 'is', null)
            .or(orNomeTel)
            .or(`data_matricula.lt.${startDate},data_matricula.gt.${endDate}`)
            .limit(30)),
        ]);
        if (cancelado) return;
        const leadsData = (leadsR.data || []) as any[];
        const mapLead = (l: any): ItemForaPeriodo => ({
          id: l.id, leadId: l.id, nome: l.nome, telefone: l.telefone || '', dataLabel: fmtMes(l.data_contato),
          statusLabel: labelStatus(l.status), detalhe: l.cursos?.nome || '', unidade: l.unidades?.codigo,
        });
        setBuscaFora({
          leads: leadsData.filter(l => l.status !== 'visita_escola').map(mapLead),
          visitas: leadsData.filter(l => l.status === 'visita_escola').map(mapLead),
          experimentais: ((expR.data || []) as any[]).map((e: any): ItemForaPeriodo => ({
            id: e.id, leadId: e.lead_id, experimentalId: e.id,
            nome: e.nome_aluno || e.leads?.nome || '', telefone: e.leads?.telefone || '',
            dataLabel: fmtMes(e.data_experimental), statusLabel: labelStatus(e.status),
            detalhe: [e.cursos?.nome, e.professores?.nome].filter(Boolean).join(' · '), unidade: e.leads?.unidades?.codigo,
          })),
          matriculas: ((matR.data || []) as any[]).map((a: any): ItemForaPeriodo => ({
            id: a.id, leadId: a.id, nome: a.nome, telefone: a.telefone || '', dataLabel: fmtMes(a.data_matricula),
            statusLabel: labelStatus(a.status), detalhe: a.cursos?.nome || '', unidade: a.unidades?.codigo,
          })),
        });
      } catch (e) {
        console.error('Erro na busca global fora do período:', e);
      }
    }, 350);
    return () => { cancelado = true; clearTimeout(handle); };
  }, [buscaFunil, competencia.range, isAdmin, context?.unidadeSelecionada, usuario?.unidade_id]);

  // Carregar sugestões de leads para autocomplete
  const loadSugestoesLeads = useCallback(async () => {
    if (!unidadeParaSalvar) return;
    
    try {
      const { startDate, endDate } = competencia.range;
      
      let querySugestoes = supabase
        .from('leads')
        .select('id, nome, telefone, status, canal_origem_id, curso_interesse_id, professor_experimental_id, data_contato')
        .eq('unidade_id', unidadeParaSalvar)
        .order('data_contato', { ascending: false })
        .limit(10000);

      if (startDate) querySugestoes = querySugestoes.gte('data_contato', startDate);
      if (endDate) querySugestoes = querySugestoes.lte('data_contato', endDate);

      const { data, error } = await querySugestoes;
      
      if (error) throw error;
      
      // Mapear para o formato do ComboboxNome
      const sugestoes: SugestaoLead[] = (data || []).map(item => ({
        id: item.id,
        nome: item.nome || '',
        telefone: item.telefone || undefined,
        tipo: item.status as SugestaoLead['tipo'],
        canal_origem_id: item.canal_origem_id,
        curso_id: item.curso_interesse_id,
        professor_id: item.professor_experimental_id,
        data: item.data_contato,
      }));
      
      setSugestoesLeads(sugestoes);
    } catch (error) {
      console.error('Erro ao carregar sugestões de leads:', error);
    }
  }, [unidadeParaSalvar, competencia.range]);

  useEffect(() => {
    loadSugestoesLeads();
  }, [loadSugestoesLeads]);

  // Funções de edição inline da tabela de matrículas
  const startEditing = (matricula: LeadDiario) => {
    setEditingId(matricula.id || null);
    setEditingData({
      nome: matricula.nome,
      idade: matricula.idade,
      curso_interesse_id: matricula.curso_interesse_id,
      canal_origem_id: matricula.canal_origem_id,
      professor_experimental_id: matricula.professor_experimental_id,
      professor_fixo_id: matricula.professor_fixo_id,
      valor_passaporte: matricula.valor_passaporte,
      valor_parcela: matricula.valor_parcela,
      tipo_matricula: matricula.tipo_matricula,
      agente_comercial: matricula.agente_comercial,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingData({});
  };

  const saveEditing = async () => {
    if (!editingId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update(editingData)
        .eq('id', editingId);

      if (error) throw error;

      toast.success('Matrícula atualizada!');
      setEditingId(null);
      setEditingData({});
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar matrícula');
    } finally {
      setSaving(false);
    }
  };

  // ── Dados e handlers compartilhados entre abas do funil ──

  const transicoesEtapa: Record<number, { etapa: number; label: string }[]> = {
    1: [
      { etapa: 5, label: 'Exp. Agendada' },
      { etapa: 6, label: 'Visita Agendada' },
      { etapa: 10, label: 'Matriculado' },
    ],
    5: [
      { etapa: 7, label: 'Exp. Realizada' },
      { etapa: 9, label: 'Faltou' },
      { etapa: 10, label: 'Matriculado' },
    ],
    6: [
      { etapa: 8, label: 'Visita Realizada' },
      { etapa: 9, label: 'Faltou' },
      { etapa: 10, label: 'Matriculado' },
    ],
    7: [{ etapa: 10, label: 'Matriculado' }],
    8: [{ etapa: 10, label: 'Matriculado' }],
    9: [
      { etapa: 5, label: 'Reagendar Exp.' },
      { etapa: 6, label: 'Reagendar Visita' },
      { etapa: 10, label: 'Matriculado' },
    ],
  };

  const voltarEtapa: Record<number, { etapa: number; label: string } | null> = {
    1: null,
    5: { etapa: 1, label: 'Novo' },
    6: { etapa: 1, label: 'Novo' },
    7: { etapa: 5, label: 'Exp. Agendada' },
    8: { etapa: 6, label: 'Visita Agendada' },
    9: { etapa: 5, label: 'Exp. Agendada' },
    10: null,
    11: null,
  };

  const statusFromEtapa = (etapa: number): string => {
    const map: Record<number, string> = { 1: 'novo', 2: 'novo', 3: 'novo', 4: 'novo', 5: 'experimental_agendada', 6: 'visita_escola', 7: 'experimental_realizada', 8: 'experimental_realizada', 9: 'experimental_faltou', 10: 'convertido', 11: 'arquivado' };
    return map[etapa] || 'novo';
  };

  const toLeadCRM = (lead: LeadDiario): LeadCRM => ({
    id: lead.id!,
    nome: lead.nome,
    telefone: (lead as any).telefone || null,
    email: null,
    whatsapp: null,
    idade: lead.idade,
    unidade_id: lead.unidade_id,
    curso_interesse_id: lead.curso_interesse_id,
    canal_origem_id: lead.canal_origem_id,
    data_contato: lead.data_contato,
    data_primeiro_contato: null,
    data_ultimo_contato: null,
    status: lead.status,
    observacoes: lead.observacoes,
    created_at: '',
    updated_at: '',
    etapa_pipeline_id: lead.etapa_pipeline_id,
    professor_experimental_id: lead.professor_experimental_id,
  } as LeadCRM);

  const handleMoverEtapa = async (leadId: number, novaEtapa: number, extras?: Record<string, any>) => {
    try {
      const { error } = await supabase.from('leads').update({
        etapa_pipeline_id: novaEtapa,
        ...extras,
      }).eq('id', leadId);
      if (error) throw error;
      const newStatus = statusFromEtapa(novaEtapa);
      const lead = leadsMes.find(l => l.id === leadId);
      setLeadsMes(prev => prev.map(l => l.id === leadId
        ? { ...l, etapa_pipeline_id: novaEtapa, status: newStatus, ...extras } : l));

      // Criar registro em lead_experimentais quando avança para Exp. Agendada (etapa 5)
      if (novaEtapa === 5 && lead) {
        const expRecord: Record<string, any> = {
          lead_id: leadId,
          nome_aluno: lead.nome || '',
          unidade_id: lead.unidade_id,
          status: 'experimental_agendada',
          etapa_pipeline_id: 5,
          data_experimental: extras?.data_experimental || null,
          horario_experimental: extras?.horario_experimental || null,
          professor_experimental_id: extras?.professor_experimental_id || null,
          curso_interesse_id: lead.curso_interesse_id || null,
        };
        const { data: inserted } = await supabase.from('lead_experimentais').upsert(expRecord, {
          onConflict: 'lead_id,data_experimental,nome_aluno',
        }).select('*, professores:professor_experimental_id(nome), cursos:curso_interesse_id(nome)').single();

        if (inserted) {
          const profNome = (inserted as any).professores?.nome || professores.find(p => p.value === extras?.professor_experimental_id)?.label || '';
          const cursoNome = (inserted as any).cursos?.nome || cursos.find(c => c.value === lead.curso_interesse_id)?.label || '';
          setExperimentaisDetalhadas(prev => [...prev, {
            ...inserted,
            lead_nome: lead.nome || '',
            lead_telefone: (lead as any).telefone || '',
            canal_nome: canais.find(c => c.value === lead.canal_origem_id)?.label || '',
            curso_nome: cursoNome,
            professor_nome: profNome,
            unidade_codigo: (lead as any).unidade_codigo || '',
            leads: { ...lead, canal_origem_id: lead.canal_origem_id },
            data_contato: lead.data_contato,
          }]);
        }
      }

      if (newStatus.startsWith('experimental')) {
        setExperimentaisMes(prev => {
          const exists = prev.some(l => l.id === leadId);
          if (exists) return prev.map(l => l.id === leadId ? { ...l, etapa_pipeline_id: novaEtapa, status: newStatus, ...extras } as any : l);
          return lead ? [...prev, { ...lead, etapa_pipeline_id: novaEtapa, status: newStatus, ...extras } as any] : prev;
        });
      } else {
        setExperimentaisMes(prev => prev.filter(l => l.id !== leadId));
      }
      if (newStatus === 'visita_escola') {
        setVisitasMes(prev => {
          const exists = prev.some(l => l.id === leadId);
          if (exists) return prev.map(l => l.id === leadId ? { ...l, etapa_pipeline_id: novaEtapa, status: newStatus, ...extras } as any : l);
          return lead ? [...prev, { ...lead, etapa_pipeline_id: novaEtapa, status: newStatus, ...extras } as any] : prev;
        });
      } else {
        setVisitasMes(prev => prev.filter(l => l.id !== leadId));
      }
      toast.success('Etapa atualizada');
    } catch (err) {
      toast.error('Erro ao mover etapa');
      console.error(err);
    }
  };

  const handleBulkMoverEtapa = async (novaEtapa: number, extras?: Record<string, any>) => {
    const ids = Array.from(selecionadosFunil);
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        const { error } = await supabase.from('leads').update({
          etapa_pipeline_id: novaEtapa,
          ...extras,
        }).eq('id', id);
        if (error) throw error;
      }
      const newStatus = statusFromEtapa(novaEtapa);
      setLeadsMes(prev => prev.map(l => ids.includes(l.id!) ? { ...l, etapa_pipeline_id: novaEtapa, status: newStatus } : l));
      if (newStatus.startsWith('experimental')) {
        setExperimentaisMes(prev => {
          const updated = prev.map(l => ids.includes(l.id!) ? { ...l, etapa_pipeline_id: novaEtapa, status: newStatus } as any : l);
          const existingIds = new Set(prev.map(l => l.id));
          const novos = leadsMes.filter(l => ids.includes(l.id!) && !existingIds.has(l.id))
            .map(l => ({ ...l, etapa_pipeline_id: novaEtapa, status: newStatus } as any));
          return [...updated, ...novos];
        });
      } else {
        setExperimentaisMes(prev => prev.filter(l => !ids.includes(l.id!)));
      }
      if (newStatus === 'visita_escola') {
        setVisitasMes(prev => {
          const updated = prev.map(l => ids.includes(l.id!) ? { ...l, etapa_pipeline_id: novaEtapa, status: newStatus } as any : l);
          const existingIds = new Set(prev.map(l => l.id));
          const novos = leadsMes.filter(l => ids.includes(l.id!) && !existingIds.has(l.id))
            .map(l => ({ ...l, etapa_pipeline_id: novaEtapa, status: newStatus } as any));
          return [...updated, ...novos];
        });
      } else {
        setVisitasMes(prev => prev.filter(l => !ids.includes(l.id!)));
      }
      setSelecionadosFunil(new Set());
      toast.success(`${ids.length} lead(s) movido(s)`);
    } catch (err) {
      toast.error('Erro ao mover etapas em lote');
      console.error(err);
    }
  };

  // Função para salvar campo individual (edição inline por célula)
  // Edição inline da aba de matrículas. A fonte agora é a tabela `alunos`,
  // então campos da matrícula gravam em `alunos`; campos que só existem no
  // lead (canal, data de entrada) gravam no lead vinculado (quando existir).
  const ALUNO_COL_MAP: Record<string, string> = {
    nome: 'nome', telefone: 'telefone', data_matricula: 'data_matricula',
    curso_interesse_id: 'curso_id', professor_experimental_id: 'professor_experimental_id',
    professor_fixo_id: 'professor_atual_id', valor_passaporte: 'valor_passaporte',
    valor_parcela: 'valor_parcela', idade: 'idade_atual', tipo_matricula_id: 'tipo_matricula_id',
  };
  const LEAD_COL_MAP: Record<string, string> = {
    canal_origem_id: 'canal_origem_id', data_contato: 'data_contato',
  };
  const salvarCampoMatricula = useCallback(async (matriculaId: number, campo: string, valor: string | number | null, leadId?: number | null) => {
    try {
      if (campo === 'canal_origem_id') {
        // Origem: grava no lead se vinculado; senão (matrícula direta) grava no próprio aluno
        if (leadId) {
          const { error } = await supabase.from('leads').update({ canal_origem_id: valor }).eq('id', leadId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('alunos').update({ canal_origem_id: valor }).eq('id', matriculaId);
          if (error) throw error;
        }
      } else if (campo in LEAD_COL_MAP) {
        if (!leadId) { toast.error('Matrícula direta (sem lead) — este campo não é editável aqui'); return; }
        const { error } = await supabase.from('leads').update({ [LEAD_COL_MAP[campo]]: valor }).eq('id', leadId);
        if (error) throw error;
      } else {
        const col = ALUNO_COL_MAP[campo];
        if (!col) { toast.error('Campo não editável'); return; }
        const { error } = await supabase.from('alunos').update({ [col]: valor }).eq('id', matriculaId);
        if (error) throw error;
      }

      // Patch local imediato (só matriculasMes — a aba agora é independente das demais)
      setMatriculasMes(prev => prev.map((row: any) => {
        if (row.id !== matriculaId) return row;
        const updated: any = { ...row, [campo]: valor };
        if (campo === 'canal_origem_id') { updated.canal_nome = canais.find(c => c.value === valor)?.label || ''; }
        if (campo === 'curso_interesse_id') { updated.curso_id = valor; updated.curso_nome = cursos.find(c => c.value === valor)?.label || ''; }
        if (campo === 'professor_fixo_id') { updated.professor_atual_id = valor; updated.professor_fixo_nome = professores.find(p => p.value === valor)?.label || ''; }
        if (campo === 'professor_experimental_id') { updated.professor_exp_nome = professores.find(p => p.value === valor)?.label || ''; }
        if (campo === 'data_matricula') { updated.data_conversao = valor; }
        return updated;
      }));
      toast.success('Atualizado');
    } catch (error: any) {
      console.error('Erro ao atualizar matrícula:', error);
      toast.error('Erro ao atualizar');
    }
  }, [canais, cursos, professores]);

  // Edição inline das abas de LEADS / Experimentais / Visitas — grava SEMPRE na tabela `leads`.
  // (Diferente de salvarCampoMatricula, que é da aba Matrículas e grava em `alunos`.)
  const LEAD_FIELD_MAP: Record<string, string> = {
    data_contato: 'data_contato', nome: 'nome', telefone: 'telefone',
    canal_origem_id: 'canal_origem_id', curso_interesse_id: 'curso_interesse_id',
    quantidade: 'quantidade',
  };
  const salvarCampoLead = useCallback(async (leadId: number, campo: string, valor: string | number | null) => {
    const col = LEAD_FIELD_MAP[campo];
    if (!col) { toast.error('Campo não editável'); return; }
    try {
      const { error } = await supabase.from('leads').update({ [col]: valor }).eq('id', leadId);
      if (error) throw error;

      // Patch para states "rasos" (abas Leads e Visitas — id é o próprio lead)
      const patchRaso = (row: any) => {
        if (row.id !== leadId) return row;
        const updated: any = { ...row, [campo]: valor };
        if (campo === 'canal_origem_id') updated.canal_nome = canais.find(c => c.value === valor)?.label || '';
        if (campo === 'curso_interesse_id') { updated.curso_id = valor; updated.curso_nome = cursos.find(c => c.value === valor)?.label || ''; }
        return updated;
      };
      setLeadsMes(prev => prev.map(patchRaso));
      setVisitasMes(prev => prev.map(patchRaso));
      setExperimentaisMes(prev => prev.map(patchRaso));

      // Patch para a aba Experimentais (estrutura aninhada: lead_nome / lead_telefone / leads.canal_origem_id)
      const patchExp = (row: any) => {
        if (row.lead_id !== leadId) return row;
        const updated: any = { ...row };
        if (campo === 'nome') updated.lead_nome = valor;
        else if (campo === 'telefone') updated.lead_telefone = valor;
        else if (campo === 'data_contato') updated.data_contato = valor;
        else if (campo === 'canal_origem_id') {
          updated.leads = { ...(row.leads || {}), canal_origem_id: valor };
          updated.canal_nome = canais.find(c => c.value === valor)?.label || '';
        } else if (campo === 'curso_interesse_id') {
          updated.curso_interesse_id = valor;
          updated.curso_nome = cursos.find(c => c.value === valor)?.label || '';
        }
        return updated;
      };
      setExperimentaisDetalhadas(prev => prev.map(patchExp));

      toast.success('Atualizado');
    } catch (error: any) {
      console.error('Erro ao atualizar lead:', error);
      toast.error('Erro ao atualizar');
    }
  }, [canais, cursos]);

  // Salvar campo na tabela lead_experimentais (professor, status)
  const salvarCampoExperimental = useCallback(async (expId: number, campo: string, valor: string | number | null) => {
    try {
      const updateData: Record<string, any> = { [campo]: valor };
      const { error } = await supabase
        .from('lead_experimentais')
        .update(updateData)
        .eq('id', expId);
      if (error) throw error;

      setExperimentaisDetalhadas(prev => prev.map((row: any) => {
        if (row.id !== expId) return row;
        const updated = { ...row, [campo]: valor };
        if (campo === 'professor_experimental_id') {
          const prof = professores.find(p => p.value === valor);
          updated.professor_nome = prof?.label || '';
        }
        return updated;
      }));
      toast.success('Atualizado');
    } catch {
      toast.error('Erro ao atualizar');
    }
  }, [professores]);

  // === Proteção contra exclusão de registros vindos do webhook Emusys ===
  // Lead/experimental com emusys_lead_id e matrícula com emusys_matricula_id são
  // da automação e não podem ser excluídos manualmente (corrigir na origem).
  const MSG_BLOQUEIO_EMUSYS = 'Veio da automação (Emusys) e não pode ser excluído. Se está duplicado ou errado, contate o time de TI para corrigir na origem.';

  const leadVeioDoEmusys = (id: number): boolean => {
    const l = [...leadsMes, ...experimentaisMes, ...visitasMes].find((x: any) => x.id === id) as any;
    return !!l?.emusys_lead_id;
  };

  const registrarExclusaoBloqueada = async (
    tipo: 'lead' | 'matricula',
    registros: { id: number; nome?: string | null }[]
  ) => {
    try {
      const base = {
        evento: 'exclusao_bloqueada',
        acao: 'bloqueado_origem_emusys',
        workflow_id: 'comercial-ui',
        execution_id: new Date().toISOString(),
      };
      const tentadoPor = (usuario as any)?.email ?? (usuario as any)?.nome ?? (usuario as any)?.id ?? null;
      if (tipo === 'lead') {
        await supabase.from('leads_automacao_log').insert(
          registros.map(r => ({ ...base, lead_id: r.id, lead_nome: r.nome ?? null,
            detalhes: { motivo: 'Veio do webhook Emusys — exclusão bloqueada', tentado_por: tentadoPor } }))
        );
      } else {
        await supabase.from('automacao_log').insert(
          registros.map(r => ({ ...base, aluno_id: r.id, aluno_nome: r.nome ?? null,
            detalhes: { motivo: 'Matrícula veio do Emusys — exclusão bloqueada', tentado_por: tentadoPor } }))
        );
      }
    } catch (e) {
      console.error('[exclusao-bloqueada] falha ao registrar log:', e);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    if (leadVeioDoEmusys(deleteId)) {
      const l = [...leadsMes, ...experimentaisMes, ...visitasMes].find((x: any) => x.id === deleteId) as any;
      await registrarExclusaoBloqueada('lead', [{ id: deleteId, nome: l?.nome }]);
      toast.error(MSG_BLOQUEIO_EMUSYS);
      setDeleteId(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      toast.success('Registro excluído!');
      setDeleteId(null);
      // Update otimista: remove do state local sem recarregar (mantém scroll)
      setLeadsMes(prev => prev.filter(l => l.id !== deleteId));
      setExperimentaisMes(prev => prev.filter(l => l.id !== deleteId));
      setVisitasMes(prev => prev.filter(l => l.id !== deleteId));
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir registro');
    }
  };

  // Exclusão de matrícula = apaga o ALUNO (a aba de matrículas lê de `alunos`).
  // Estado separado de `deleteId` (que apaga LEADS nas outras abas).
  const confirmDeleteMatricula = async () => {
    if (!deleteMatriculaId) return;

    const mat = matriculasMes.find((x: any) => x.id === deleteMatriculaId) as any;
    if (mat?.emusys_matricula_id) {
      await registrarExclusaoBloqueada('matricula', [{ id: deleteMatriculaId, nome: mat?.nome }]);
      toast.error('Esta matrícula ' + MSG_BLOQUEIO_EMUSYS.charAt(0).toLowerCase() + MSG_BLOQUEIO_EMUSYS.slice(1));
      setDeleteMatriculaId(null);
      return;
    }

    try {
      const { error } = await supabase.from('alunos').delete().eq('id', deleteMatriculaId);
      if (error) throw error;
      toast.success('Matrícula (aluno) excluída!');
      setMatriculasMes(prev => prev.filter((m: any) => m.id !== deleteMatriculaId));
      setDeleteMatriculaId(null);
    } catch (error) {
      console.error('Erro ao excluir matrícula:', error);
      toast.error('Erro ao excluir matrícula');
    }
  };

  // Exclusão em lote
  const toggleSelecionadoFunil = (id: number) => {
    setSelecionadosFunil(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const toggleTodosFunil = (lista: { id?: number }[]) => {
    const ids = lista.filter(l => l.id != null).map(l => l.id!);
    if (ids.length > 0 && ids.every(id => selecionadosFunil.has(id))) {
      setSelecionadosFunil(new Set());
    } else {
      setSelecionadosFunil(new Set(ids));
    }
  };

  const confirmDeleteEmLote = async () => {
    if (selecionadosFunil.size === 0) return;
    setExcluindoEmLote(true);
    try {
      const ids = Array.from(selecionadosFunil);
      const bloqueados = ids.filter(id => leadVeioDoEmusys(id));
      const liberados = ids.filter(id => !leadVeioDoEmusys(id));

      if (bloqueados.length > 0) {
        const todos = [...leadsMes, ...experimentaisMes, ...visitasMes];
        await registrarExclusaoBloqueada('lead', bloqueados.map(id => {
          const l = todos.find((x: any) => x.id === id) as any;
          return { id, nome: l?.nome };
        }));
      }

      if (liberados.length === 0) {
        toast.error(`${bloqueados.length} registro${bloqueados.length > 1 ? 's vieram' : ' veio'} da automação (Emusys) e não ${bloqueados.length > 1 ? 'podem' : 'pode'} ser excluído${bloqueados.length > 1 ? 's' : ''}. Contate o time de TI.`);
        setShowBulkDeleteDialog(false);
        return;
      }

      const { error } = await supabase.from('leads').delete().in('id', liberados);
      if (error) throw error;

      if (bloqueados.length > 0) {
        toast.warning(`${liberados.length} excluído${liberados.length > 1 ? 's' : ''}. ${bloqueados.length} bloqueado${bloqueados.length > 1 ? 's' : ''} por vir${bloqueados.length > 1 ? 'em' : ''} da automação (Emusys).`);
      } else {
        toast.success(`${liberados.length} lead${liberados.length > 1 ? 's' : ''} excluído${liberados.length > 1 ? 's' : ''}!`);
      }
      setShowBulkDeleteDialog(false);
      // Update otimista (só os efetivamente removidos)
      const idsSet = new Set(liberados);
      setLeadsMes(prev => prev.filter(l => !idsSet.has(l.id!)));
      setExperimentaisMes(prev => prev.filter(l => !idsSet.has(l.id!)));
      setVisitasMes(prev => prev.filter(l => !idsSet.has(l.id!)));
      setMatriculasMes(prev => prev.filter(l => !idsSet.has(l.id!)));
      setSelecionadosFunil(new Set());
    } catch (error) {
      console.error('Erro ao excluir em lote:', error);
      toast.error('Erro ao excluir leads');
    } finally {
      setExcluindoEmLote(false);
    }
  };

  // Busca global por telefone ou nome (ignora filtro de data)
  const ehBuscaTelefone = (termo: string) => {
    const digits = termo.replace(/\D/g, '');
    return digits.length >= 8;
  };
  const ehBuscaNome = (termo: string) =>
    termo.trim().length >= 3 && /[a-zA-ZÀ-ú]/.test(termo);

  useEffect(() => {
    const isTel = ehBuscaTelefone(buscaFunil);
    const isNome = ehBuscaNome(buscaFunil);

    if ((!isTel && !isNome) || abaDetalhamento !== 'leads') {
      setLeadsGlobais([]);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscandoGlobal(true);
      try {
        let query = supabase
          .from('leads')
          .select('*, canais_origem(nome), cursos(nome), unidades(codigo)')
          .order('data_contato', { ascending: false })
          .limit(50);

        if (isTel) {
          const digits = buscaFunil.replace(/\D/g, '');
          query = query.ilike('telefone', `%${digits}%`);
        } else {
          query = query.ilike('nome', `%${buscaFunil.trim()}%`);
        }

        if (isAdmin) {
          if (context?.unidadeSelecionada && context.unidadeSelecionada !== 'todos') {
            query = query.eq('unidade_id', context.unidadeSelecionada);
          }
        } else if (usuario?.unidade_id) {
          query = query.eq('unidade_id', usuario.unidade_id);
        }

        const { data } = await query;
        if (data) {
          const idsLocais = new Set(leadsMes.map(l => l.id));
          const extras = data
            .filter(l => !idsLocais.has(l.id))
            .map(l => ({
              ...l,
              canal_nome: (l.canais_origem as any)?.nome || '',
              curso_nome: (l.cursos as any)?.nome || '',
            }));
          setLeadsGlobais(extras);
        }
      } catch (err) {
        console.error('Erro na busca global:', err);
      } finally {
        setBuscandoGlobal(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [buscaFunil, abaDetalhamento, leadsMes, isAdmin, context?.unidadeSelecionada, usuario?.unidade_id]);

  // Resetar paginação ao mudar filtros
  useEffect(() => { setPaginaLeads(1); }, [buscaFunil, filtroTelefoneFunil, filtroIncompletoFunil, filtroCanalFunil, filtroCursoFunil, filtroProfessorFunil]);


  // Reset form
  const resetForm = () => {
    setFormData({
      data: new Date(),
      quantidade: 1,
      canal_origem_id: null,
      curso_id: null,
      modalidade: 'turma',
      status_experimental: 'experimental_agendada',
      professor_id: null,
      aluno_nome: '',
      aluno_telefone: '',
      aluno_data_nascimento: null,
      tipo_matricula: 'EMLA',
      tipo_aluno: 'pagante',
      teve_experimental: false,
      professor_experimental_id: null,
      professor_fixo_id: null,
      valor_passaporte: null,
      valor_parcela: null,
      forma_pagamento_id: null,
      forma_pagamento_passaporte_id: null,
      forma_pagamento_passaporte: '',
      parcelas_passaporte: 1,
      dia_vencimento: 5,
      unidade_id: null,
      dia_aula: '',
      horario_aula: '',
      is_ex_aluno: false,
      is_aluno_retorno: false,
      responsavel_nome: '',
      responsavel_telefone: '',
      responsavel_parentesco: '',
    });
    // Reset lotes
    setLoteData(new Date());
    setLoteLeads([{ id: genId(), aluno_nome: '', telefone: '', canal_origem_id: null, curso_id: null, quantidade: 1 }]);
    // Reset verificacao de duplicidade
    setConfirmouDupMatricula(false);
    setIgnorarDupFortes(new Set());
    setIgnorarDupFracas(new Set());
    setAnamnesePendenteMatricula(null);
    limparBuscaAnamneseMatricula();
    checkLead.limparDuplicados();
    checkAluno.limparDuplicados();
  };

  // Salvar lote de leads atendidos
  const handleSaveLoteLeads = async () => {
    if (!unidadeParaSalvar) {
      toast.error('Selecione uma unidade no filtro acima');
      return;
    }

    // Validar que cada lead tem nome e telefone preenchidos
    const linhasComNome = loteLeads.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0);
    if (linhasComNome.length === 0) {
      toast.error('Preencha o nome de pelo menos um lead');
      return;
    }

    // Verificar se há leads com nome mas sem telefone válido
    const linhasSemTelefone = linhasComNome.filter(l =>
      !l.telefone || l.telefone.replace(/\D/g, '').length < 10
    );
    if (linhasSemTelefone.length > 0) {
      toast.error(`${linhasSemTelefone.length} lead(s) sem telefone válido. Preencha o telefone de todos os leads.`);
      return;
    }

    const linhasValidas = linhasComNome;

    // Verificar se há linhas sem nome
    const linhasSemNome = loteLeads.filter(l => !l.aluno_nome || l.aluno_nome.trim().length === 0);
    if (linhasSemNome.length > 0 && linhasValidas.length < loteLeads.length) {
      toast.warning(`${linhasSemNome.length} linha(s) sem nome serão ignoradas`);
    }

    // Verificar duplicatas por telefone antes de salvar
    const telefonesNormalizados = linhasValidas
      .map(l => l.telefone ? normalizePhone(l.telefone) : null)
      .filter((t): t is string => !!t);

    if (telefonesNormalizados.length > 0 && !confirmouDuplicataLote) {
      const duplicatas = await verificarDuplicadosEmLote(telefonesNormalizados, unidadeParaSalvar);
      if (duplicatas.size > 0) {
        const nomes = Array.from(duplicatas.values()).map(d => d.nome).join(', ');
        toast.warning(`${duplicatas.size} telefone(s) já cadastrado(s) (lead ou aluno): ${nomes}. Clique em salvar novamente para confirmar mesmo assim.`, { duration: 6000 });
        setConfirmouDuplicataLote(true);
        return;
      }
    }

    setSaving(true);
    setConfirmouDuplicataLote(false);
    try {
      const dataLancamento = loteData.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      // Cada lead atendido é 1 registro (quantidade sempre 1)
      const registros = linhasValidas.map(linha => ({
        unidade_id: unidadeParaSalvar,
        data_contato: dataLancamento,
        status: 'novo',
        nome: linha.aluno_nome?.trim(),
        telefone: linha.telefone ? normalizePhone(linha.telefone) : null,
        canal_origem_id: linha.canal_origem_id,
        curso_interesse_id: linha.curso_id,
        quantidade: 1, // Sempre 1 por lead atendido
        etapa_pipeline_id: 1, // Novo Lead
      }));

      const { error } = await supabase.from('leads').insert(registros);
      if (error) throw error;

      toast.success(`${linhasValidas.length} lead(s) atendido(s) registrado(s)!`);
      setModalOpen(null);
      resetForm();
      loadData();
      loadSugestoesLeads(); // Recarregar sugestões após salvar leads
    } catch (error) {
      console.error('Erro ao salvar leads:', error);
      toast.error('Erro ao salvar leads');
    } finally {
      setSaving(false);
    }
  };


  // Funções auxiliares para manipular linhas do lote
  const addLinhaLead = () => {
    setLoteLeads([...loteLeads, { id: genId(), aluno_nome: '', telefone: '', canal_origem_id: null, curso_id: null, quantidade: 1 }]);
  };

  const removeLinhaLead = (id: string) => {
    if (loteLeads.length > 1) {
      setLoteLeads(loteLeads.filter(l => l.id !== id));
    }
  };

  const updateLinhaLead = (id: string, field: keyof LoteLinha, value: any) => {
    setLoteLeads(loteLeads.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const maskPhone = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const normalizePhone = (tel: string): string | null => {
    const digits = tel.replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.length <= 11 ? '55' + digits : digits;
  };

  const checkLeadByPhone = async (telefone: string | undefined, linhaId: string, tipo: 'lead' | 'matricula' = 'lead') => {
    if (!telefone || !unidadeParaSalvar) return;
    const digits = telefone.replace(/\D/g, '');
    if (digits.length < 10) return;
    const normalized = digits.length <= 11 ? '55' + digits : digits;

    const { data } = await supabase
      .from('leads')
      .select('id, nome, canal_origem_id, curso_interesse_id, telefone')
      .eq('telefone', normalized)
      .eq('unidade_id', unidadeParaSalvar)
      .limit(1);

    if (data && data.length > 0) {
      const existing = data[0];

      if (tipo === 'lead') {
        setLoteLeads(prev => prev.map(l => l.id === linhaId ? {
          ...l,
          aluno_nome: l.aluno_nome || existing.nome || '',
          canal_origem_id: existing.canal_origem_id,
          curso_id: existing.curso_interesse_id,
        } : l));
      } else if (tipo === 'matricula') {
        setFormData(prev => ({
          ...prev,
          aluno_nome: prev.aluno_nome || existing.nome || '',
          canal_origem_id: existing.canal_origem_id ?? prev.canal_origem_id,
          curso_id: existing.curso_interesse_id ?? prev.curso_id,
        }));
      }
      toast.info(`Lead encontrado: ${existing.nome}`);
    }
  };

  // Buscar lead por telefone para modal de experimental
  const buscarLeadParaExperimental = async () => {
    const digits = expForm.telefone.replace(/\D/g, '');
    if (digits.length < 10) { toast.warning('Telefone inválido'); return; }
    const normalized = digits.length <= 11 ? '55' + digits : digits;
    setExpBuscando(true);
    try {
      const { data } = await supabase
        .from('leads')
        .select('id, nome, telefone, canal_origem_id, curso_interesse_id, unidade_id, data_contato, status, experimental_agendada, etapa_pipeline_id')
        .eq('telefone', normalized)
        .eq('unidade_id', unidadeParaSalvar)
        .eq('arquivado', false)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        setExpLeadEncontrado(data[0]);
        setExpForm(prev => ({
          ...prev,
          nome: data[0].nome || '',
          canal_origem_id: data[0].canal_origem_id,
          curso_interesse_id: data[0].curso_interesse_id,
        }));
        toast.success(`Lead encontrado: ${data[0].nome}`);
      } else {
        setExpLeadEncontrado(null);
        toast.info('Lead não encontrado. Preencha os dados para criar.');
      }
    } catch (err) {
      toast.error('Erro ao buscar lead');
    } finally {
      setExpBuscando(false);
      setExpBuscou(true);
    }
  };

  // Salvar experimental (cria/atualiza lead + cria lead_experimentais)
  const handleSaveExperimental = async () => {
    if (!expForm.nome?.trim()) { toast.warning('Nome é obrigatório'); return; }
    if (!expForm.data_experimental) { toast.warning('Data da experimental é obrigatória'); return; }
    if (!unidadeParaSalvar) { toast.warning('Selecione uma unidade'); return; }

    setSaving(true);
    try {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const telNormalized = expForm.telefone ? normalizePhone(expForm.telefone) : null;
      let leadId: number;
      let alunoVinculadoId: number | null = null;
      let matchAmbiguo = false;

      if (expLeadEncontrado) {
        // Atualizar lead existente
        const { error } = await supabase.from('leads').update({
          experimental_agendada: true,
          data_experimental: expForm.data_experimental,
          horario_experimental: expForm.horario_experimental || null,
          professor_experimental_id: expForm.professor_experimental_id,
          etapa_pipeline_id: 5,
          status: 'experimental_agendada',
          curso_interesse_id: expForm.curso_interesse_id,
        }).eq('id', expLeadEncontrado.id);
        if (error) throw error;
        leadId = expLeadEncontrado.id;
      } else {
        // Sem lead vinculado: tentar ligar a uma matrícula já existente (evita lead órfão duplicado).
        // Match por telefone próprio na unidade → fallback por nome exato na unidade.
        let alunosMatch: any[] = [];
        if (telNormalized) {
          const { data } = await supabase
            .from('alunos')
            .select('id, is_segundo_curso')
            .eq('unidade_id', unidadeParaSalvar)
            .eq('telefone', telNormalized);
          alunosMatch = data || [];
        }
        if (alunosMatch.length === 0) {
          const { data } = await supabase
            .from('alunos')
            .select('id, is_segundo_curso')
            .eq('unidade_id', unidadeParaSalvar)
            .ilike('nome', expForm.nome.trim());
          alunosMatch = data || [];
        }
        if (alunosMatch.length === 1) {
          alunoVinculadoId = alunosMatch[0].id;
        } else if (alunosMatch.length > 1) {
          // Desambiguar pela matrícula primária; se ainda houver mais de uma, não adivinhar
          const primarias = alunosMatch.filter((a: any) => !a.is_segundo_curso);
          if (primarias.length === 1) alunoVinculadoId = primarias[0].id;
          else matchAmbiguo = true;
        }

        // Criar lead novo — vinculado à matrícula existente quando houver match único
        const { data: newLead, error } = await supabase.from('leads').insert({
          nome: expForm.nome.trim(),
          telefone: telNormalized,
          canal_origem_id: expForm.canal_origem_id,
          curso_interesse_id: expForm.curso_interesse_id,
          unidade_id: unidadeParaSalvar,
          aluno_id: alunoVinculadoId,
          data_contato: hoje,
          status: 'experimental_agendada',
          etapa_pipeline_id: 5,
          experimental_agendada: true,
          data_experimental: expForm.data_experimental,
          horario_experimental: expForm.horario_experimental || null,
          professor_experimental_id: expForm.professor_experimental_id,
          temperatura: 'quente',
          quantidade: 1,
        }).select('id').single();
        if (error) throw error;
        leadId = newLead.id;
      }

      // Criar registro em lead_experimentais
      // onConflict precisa bater com a constraint real UNIQUE (lead_id, data_experimental);
      // o erro é propagado (catch) para não falhar silenciosamente como antes.
      const { error: expErr } = await supabase.from('lead_experimentais').upsert({
        lead_id: leadId,
        nome_aluno: expForm.nome.trim(),
        unidade_id: unidadeParaSalvar,
        status: 'experimental_agendada',
        etapa_pipeline_id: 5,
        data_experimental: expForm.data_experimental,
        horario_experimental: expForm.horario_experimental || null,
        professor_experimental_id: expForm.professor_experimental_id,
        curso_interesse_id: expForm.curso_interesse_id,
      }, { onConflict: 'lead_id,data_experimental' });
      if (expErr) throw expErr;

      if (matchAmbiguo) {
        toast.warning('Experimental criada, mas há mais de uma matrícula com esses dados — não foi vinculada a nenhuma. Verifique manualmente.');
      } else {
        toast.success(
          alunoVinculadoId ? 'Experimental vinculada à matrícula existente!'
          : expLeadEncontrado ? 'Experimental agendada!'
          : 'Lead criado + experimental agendada!'
        );
      }
      setModalOpen(null);
      setExpForm({ telefone: '', nome: '', canal_origem_id: null, curso_interesse_id: null, data_experimental: '', horario_experimental: '', professor_experimental_id: null });
      setExpLeadEncontrado(null);
      setExpBuscou(false);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar experimental:', error);
      toast.error('Erro ao salvar experimental');
    } finally {
      setSaving(false);
    }
  };

  // Salvar registro
  const handleSave = async () => {
    // Para admin: usar unidade do modal se preenchida, senão do filtro
    // Para usuário normal: usar sua unidade
    const unidadeFinal = isAdmin 
      ? (formData.unidade_id || unidadeParaSalvar)
      : unidadeParaSalvar;
      
    if (!unidadeFinal) {
      toast.error('Selecione uma unidade');
      return;
    }

    // Validação de campos obrigatórios para matrícula
    if (modalOpen === 'matricula') {
      if (!formData.aluno_data_nascimento) {
        toast.error('Informe a data de nascimento do aluno');
        return;
      }
      if (!TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno) && !formData.forma_pagamento_id) {
        toast.error('Selecione a forma de pagamento da parcela mensal');
        return;
      }
      // Bloqueio dupla-confirmacao quando ha duplicata forte (lead ou aluno) ainda nao ignorada
      if (matTemForteNaoIgnorada && !confirmouDupMatricula) {
        setConfirmouDupMatricula(true);
        toast.warning('Possivel duplicata detectada. Revise antes de confirmar.', { duration: 5000 });
        return;
      }
    }

    setSaving(true);
    try {
      // Usar a data selecionada no formulário (permite lançamento retroativo)
      const dataLancamento = formData.data.toISOString().split('T')[0];
      
      const tipo = modalOpen;

      // Mapear etapa do pipeline conforme tipo de registro
      const etapaMap: Record<string, number> = {
        'novo': 1,
        'experimental_agendada': 5,
        'experimental_realizada': 7,
        'visita_escola': 6,
        'convertido': 10,
      };

      const registro: Partial<LeadDiario> = {
        unidade_id: unidadeFinal,
        data_contato: dataLancamento,
        status: tipo === 'matricula' ? 'convertido' : (tipo || 'novo'),
        canal_origem_id: formData.canal_origem_id,
        curso_interesse_id: formData.curso_id,
        quantidade: formData.quantidade,
        observacoes: null,
        etapa_pipeline_id: etapaMap[tipo === 'matricula' ? 'convertido' : (tipo || 'novo')] || 1,
      };

      // Campos extras para matrícula
      if (modalOpen === 'matricula') {
        registro.nome = formData.aluno_nome;
        // Calcular idade a partir da data de nascimento
        registro.idade = formData.aluno_data_nascimento 
          ? Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null;
        registro.tipo_matricula = registro.idade != null ? (registro.idade <= 11 ? 'LAMK' : 'EMLA') : formData.tipo_matricula;
        registro.tipo_aluno = formData.tipo_aluno;
        registro.professor_experimental_id = formData.teve_experimental ? formData.professor_experimental_id : null;
        registro.professor_fixo_id = formData.professor_fixo_id;
        const dispensaPagamento = TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno);
        registro.valor_passaporte = formData.valor_passaporte || 0;
        registro.valor_parcela = dispensaPagamento ? 0 : (formData.valor_parcela || 0);
        registro.forma_pagamento_id = dispensaPagamento ? null : formData.forma_pagamento_id;
        registro.forma_pagamento_passaporte_id = formData.forma_pagamento_passaporte_id;
        registro.dia_vencimento = formData.dia_vencimento;
        registro.quantidade = 1; // Matrícula sempre é 1
      }

      // Bolsistas não passam pelo funil comercial — não inserir em leads
      const isBolsista = modalOpen === 'matricula' && TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno);
      let leadCriadoId: number | null = null;

      if (!isBolsista) {
        const { data: leadData, error } = await supabase.from('leads').insert(registro).select().single();
        if (error) throw error;
        leadCriadoId = leadData?.id ?? null;
      }

      // Sincronizar com canônico lead_experimentais quando matrícula veio com checkbox "Teve experimental?"
      // Usa data_matricula como data_experimental (aproximação — a real foi alguns dias antes).
      // Marcador implícito: emusys_lead_id=NULL diferencia esses registros dos vindos do webhook Emusys.
      if (modalOpen === 'matricula' && formData.teve_experimental && leadCriadoId && formData.aluno_nome) {
        const dataExpAprox = formData.data.toISOString().split('T')[0];
        const { error: expError } = await supabase
          .from('lead_experimentais')
          .upsert({
            lead_id: leadCriadoId,
            nome_aluno: formData.aluno_nome.trim(),
            unidade_id: unidadeFinal,
            status: 'experimental_realizada',
            etapa_pipeline_id: 7,
            data_experimental: dataExpAprox,
            professor_experimental_id: formData.professor_experimental_id,
            curso_interesse_id: formData.curso_id,
          }, { onConflict: 'lead_id,data_experimental,nome_aluno' });
        if (expError) {
          console.error('Erro ao registrar experimental no canônico:', expError);
          // Não bloqueia o fluxo — matrícula já salvou. Log e segue.
        }
      }

      // Se for matrícula, criar também o registro na tabela alunos
      // A trigger calcular_campos_aluno() calcula automaticamente: idade_atual e classificacao (EMLA/LAMK)
      if (modalOpen === 'matricula' && formData.aluno_nome) {
        // Determinar tipo_matricula_id baseado em tipo_aluno
        // IDs: 1=Regular, 2=Segundo Curso, 3=Bolsista Integral, 4=Bolsista Parcial, 5=Banda
        let tipo_matricula_id = 1; // Regular por padrão
        if (formData.tipo_aluno === 'bolsista_integral') tipo_matricula_id = 3;
        else if (formData.tipo_aluno === 'bolsista_parcial') tipo_matricula_id = 4;
        else if (formData.tipo_aluno === 'nao_pagante') tipo_matricula_id = 3;

        // Calcular datas de contrato automaticamente (12 meses)
        const dataMatricula = formData.data.toISOString().split('T')[0];
        const dataFimContrato = new Date(formData.data);
        dataFimContrato.setFullYear(dataFimContrato.getFullYear() + 1);

        const novoAluno: Record<string, any> = {
          nome: formData.aluno_nome.trim(),
          unidade_id: unidadeFinal,
          data_nascimento: formData.aluno_data_nascimento?.toISOString().split('T')[0] || null,
          // idade_atual e classificacao são calculados automaticamente pela trigger baseado em data_nascimento
          status: 'ativo',
          tipo_aluno: formData.tipo_aluno || 'pagante',
          tipo_matricula_id,
          valor_parcela: TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno) ? 0 : (formData.valor_parcela || 0),
          valor_passaporte: formData.valor_passaporte || 0,
          forma_pagamento_id: TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno) ? null : (formData.forma_pagamento_id || null),
          dia_vencimento: formData.dia_vencimento || 5,
          data_matricula: dataMatricula,
          data_inicio_contrato: dataMatricula,
          data_fim_contrato: dataFimContrato.toISOString().split('T')[0],
          curso_id: formData.curso_id || null,
          modalidade: formData.modalidade || 'turma',
          professor_atual_id: formData.professor_fixo_id || null,
          canal_origem_id: formData.canal_origem_id || null,
          professor_experimental_id: formData.teve_experimental ? formData.professor_experimental_id : null,
          agente_comercial: usuario?.nome || usuario?.email || null,
          // Novos campos de turma e flags
          dia_aula: formData.dia_aula || null,
          horario_aula: formData.horario_aula || null,
          is_ex_aluno: formData.is_ex_aluno || false,
          is_aluno_retorno: formData.is_aluno_retorno || false,
          responsavel_nome: formData.responsavel_nome?.trim() || null,
          responsavel_telefone: formData.responsavel_telefone?.trim() || null,
          responsavel_parentesco: formData.responsavel_parentesco || null,
        };

        console.log('Inserindo aluno:', novoAluno);
        const { data: alunoData, error: alunoError } = await supabase.from('alunos').insert(novoAluno).select().single();
        
        if (alunoError) {
          console.error('Erro ao criar aluno:', alunoError);
          toast.error(`Erro ao criar aluno: ${alunoError.message}`);
        } else {
          console.log('Aluno criado com sucesso:', alunoData);
          toast.success('Aluno cadastrado com sucesso!');
        }
      }

      toast.success('Registro salvo com sucesso!');
      setModalOpen(null);
      resetForm();
      loadData();

    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar registro');
    } finally {
      setSaving(false);
    }
  };

  // Função auxiliar para calcular range de datas baseado no período
  const calcularRangeDatas = () => {
    const hoje = new Date();
    let dataInicio: Date;
    let dataFim: Date;

    switch (relatorioPeriodo) {
      case 'hoje':
        dataInicio = hoje;
        dataFim = hoje;
        break;
      case 'ontem':
        const ontem = new Date(hoje);
        ontem.setDate(hoje.getDate() - 1);
        dataInicio = ontem;
        dataFim = ontem;
        break;
      case 'mes_anterior':
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        break;
      case 'personalizado':
        dataInicio = relatorioDataInicio;
        dataFim = relatorioDataFim;
        break;
      default:
        dataInicio = hoje;
        dataFim = hoje;
    }

    return {
      dataInicio: format(dataInicio, 'yyyy-MM-dd'),
      dataFim: format(dataFim, 'yyyy-MM-dd'),
      dataInicioObj: dataInicio,
      dataFimObj: dataFim
    };
  };

  // Gerar relatório diário
  // Helper: matrículas reais do período (fonte = alunos por data_matricula).
  // Usado pelos relatórios para alinhar com a aba/funil (que também lê de alunos).
  const formatarDataCurtaRelatorio = (valor?: string | null) => {
    if (!valor) return '-';
    const texto = String(valor).trim();
    if (!texto) return '-';
    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}`;
    const br = texto.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
    if (br) return `${br[1].padStart(2, '0')}/${br[2].padStart(2, '0')}`;
    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) return '-';
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const normalizarTextoRelatorio = (valor?: string | null) =>
    String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const normalizarTelefoneRelatorio = (valor?: string | null) =>
    String(valor || '').replace(/\D/g, '');

  const valoresUnicosRelatorio = (valores: any[]) =>
    Array.from(new Set(
      valores
        .filter((valor) => valor !== null && valor !== undefined)
        .map((valor) => String(valor).trim())
        .filter(Boolean)
    ));

  const statusExperimentalRealizada = (status?: string | null) =>
    ['experimental_realizada', 'realizada', 'presente']
      .includes(String(status || '').trim().toLowerCase());

  const chaveTelefoneUnidade = (unidadeId?: string | null, telefone?: string | null) =>
    `${unidadeId || 'sem_unidade'}|${normalizarTelefoneRelatorio(telefone)}`;

  const chaveGrupoMatriculaRelatorio = (mat: any) => {
    const telefone = normalizarTelefoneRelatorio(mat.telefone || mat.responsavel_telefone);
    const nome = normalizarTextoRelatorio(mat.nome);
    return `${mat.unidade_id || 'sem_unidade'}|${mat.data_matricula || ''}|${nome}|${telefone}`;
  };

  const agruparMatriculasParaRelatorio = (matriculas: any[]) => {
    const grupos = new Map<string, any[]>();
    (matriculas || []).forEach((mat) => {
      const chave = chaveGrupoMatriculaRelatorio(mat);
      const grupo = grupos.get(chave) || [];
      grupo.push(mat);
      grupos.set(chave, grupo);
    });

    return Array.from(grupos.values()).map((grupo) => {
      const ordenadas = [...grupo].sort((a, b) => Number(a.is_segundo_curso) - Number(b.is_segundo_curso));
      const principal = ordenadas.find((mat) => ehMatriculaNova(mat)) || ordenadas[0];
      const cursos = valoresUnicosRelatorio(ordenadas.map((mat) => mat.curso_nome));
      const professores = valoresUnicosRelatorio(ordenadas.map((mat) => mat.professor_fixo_nome));
      const professoresExp = valoresUnicosRelatorio(
        ordenadas.flatMap((mat) => (
          Array.isArray(mat.professor_exp_nomes) && mat.professor_exp_nomes.length > 0
            ? mat.professor_exp_nomes
            : (mat.professor_exp_nome ? [mat.professor_exp_nome] : [])
        ))
      );
      const parcelas = ordenadas
        .map((mat) => Number(mat.valor_parcela) || 0)
        .filter((valor) => valor > 0);
      const formas = valoresUnicosRelatorio(ordenadas.map((mat) => mat.forma_pagamento_nome));

      return {
        ...principal,
        cursos_relatorio: cursos.join(' e '),
        professores_relatorio: professores.join(' e '),
        professores_exp_relatorio: professoresExp.join(' e '),
        parcelas_relatorio: parcelas,
        formas_pagamento_relatorio: formas.join(' / '),
      };
    });
  };

  const formatarParcelasMatriculaRelatorio = (mat: any) => {
    const parcelas = Array.isArray(mat.parcelas_relatorio)
      ? mat.parcelas_relatorio.filter((valor: number) => Number(valor) > 0)
      : [];
    if (parcelas.length > 1) {
      return parcelas.map((valor: number) => `R$ ${fmtBRL(Number(valor) || 0)}`).join(' + ');
    }
    return `R$ ${fmtBRL(Number(mat.valor_parcela) || 0)}`;
  };

  const buscarMatriculasAlunos = async (uid: string | null | undefined, dataInicio: string, dataFim: string) => {
    let q = supabase
      .from('alunos')
      .select('id, nome, telefone, responsavel_telefone, idade_atual, data_matricula, tipo_aluno, valor_passaporte, valor_parcela, is_segundo_curso, curso_id, canal_origem_id, professor_atual_id, professor_experimental_id, forma_pagamento_id, tipo_matricula_id, unidade_id, modalidade, status, emusys_matricula_id, emusys_lead_id, emusys_student_id, cursos:curso_id(nome, is_projeto_banda), canais_origem:canal_origem_id(nome), tipos_matricula:tipo_matricula_id!left(codigo, conta_como_pagante, entra_ticket_medio), unidades:unidade_id(codigo, nome, hunter_nome), formas_pagamento:forma_pagamento_id(nome)')
      .not('data_matricula', 'is', null)
      .gte('data_matricula', dataInicio)
      .lte('data_matricula', dataFim);
    if (uid && uid !== 'todos') q = q.eq('unidade_id', uid);
    const { data } = await q;
    const alunos = (data || []) as any[];
    const alunoIds = alunos.map((a: any) => a.id).filter(Boolean);
    const unidadeIds = Array.from(new Set(alunos.map((a: any) => a.unidade_id).filter(Boolean)));
    const telefonesBusca = valoresUnicosRelatorio(
      alunos.flatMap((a: any) => [a.telefone, a.responsavel_telefone])
    );
    const emusysLeadIds = Array.from(new Set(
      alunos
        .map((a: any) => Number(a.emusys_lead_id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    ));

    const leadSelect = 'id, nome, telefone, aluno_id, unidade_id, emusys_lead_id, status, data_contato, data_experimental, canal_origem_id, professor_experimental_id, canais_origem:canal_origem_id(nome)';
    const leadQueries: Promise<any>[] = [
      alunoIds.length
        ? supabase
            .from('leads')
            .select(leadSelect)
            .in('aluno_id', alunoIds)
        : Promise.resolve({ data: [] as any[] }),
    ];

    if (telefonesBusca.length) {
      let leadsPorTelefone = supabase
        .from('leads')
        .select(leadSelect)
        .in('telefone', telefonesBusca);
      if (uid && uid !== 'todos') leadsPorTelefone = leadsPorTelefone.eq('unidade_id', uid);
      else if (unidadeIds.length) leadsPorTelefone = leadsPorTelefone.in('unidade_id', unidadeIds);
      leadQueries.push(leadsPorTelefone);
    }

    if (emusysLeadIds.length) {
      let leadsPorEmusys = supabase
        .from('leads')
        .select(leadSelect)
        .in('emusys_lead_id', emusysLeadIds);
      if (uid && uid !== 'todos') leadsPorEmusys = leadsPorEmusys.eq('unidade_id', uid);
      else if (unidadeIds.length) leadsPorEmusys = leadsPorEmusys.in('unidade_id', unidadeIds);
      leadQueries.push(leadsPorEmusys);
    }

    const leadResults = await Promise.all(leadQueries);
    const leadsCanonicos = Array.from(
      new Map(
        leadResults
          .flatMap((result: any) => result.data || [])
          .filter((lead: any) => lead?.id)
          .map((lead: any) => [lead.id, lead])
      ).values()
    );
    const leadIds = leadsCanonicos.map((lead: any) => lead.id).filter(Boolean);
    const emusysLeadIdsComLeads = Array.from(new Set([
      ...emusysLeadIds,
      ...leadsCanonicos
        .map((lead: any) => Number(lead.emusys_lead_id))
        .filter((id: number) => Number.isFinite(id) && id > 0),
    ]));

    const [
      { data: experimentaisPorAluno },
      { data: experimentaisPorEmusys },
      { data: experimentaisPorLead },
    ] = await Promise.all([
      alunoIds.length
        ? supabase
            .from('lead_experimentais')
            .select('id, lead_id, aluno_id, emusys_lead_id, nome_aluno, status, data_experimental, professor_experimental_id')
            .in('aluno_id', alunoIds)
        : Promise.resolve({ data: [] as any[] }),
      emusysLeadIdsComLeads.length
        ? supabase
            .from('lead_experimentais')
            .select('id, lead_id, aluno_id, emusys_lead_id, nome_aluno, status, data_experimental, professor_experimental_id')
            .in('emusys_lead_id', emusysLeadIdsComLeads)
        : Promise.resolve({ data: [] as any[] }),
      leadIds.length
        ? supabase
            .from('lead_experimentais')
            .select('id, lead_id, aluno_id, emusys_lead_id, nome_aluno, status, data_experimental, professor_experimental_id')
            .in('lead_id', leadIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const experimentaisCanonicas = Array.from(
      new Map(
        [...(experimentaisPorAluno || []), ...(experimentaisPorEmusys || []), ...(experimentaisPorLead || [])]
          .filter((exp: any) => exp?.id)
          .map((exp: any) => [exp.id, exp])
      ).values()
    );

    const professorIds = Array.from(new Set([
      ...alunos.map((a: any) => a.professor_atual_id),
      ...experimentaisCanonicas.map((exp: any) => exp.professor_experimental_id),
      ...leadsCanonicos.map((lead: any) => lead.professor_experimental_id),
      ...alunos.map((a: any) => a.professor_experimental_id),
    ].filter(Boolean)));

    const { data: professores } = professorIds.length
      ? await supabase.from('professores').select('id, nome').in('id', professorIds)
      : { data: [] as any[] };

    const professoresPorId = new Map((professores || []).map((p: any) => [p.id, p.nome]));
    const leadsPorAluno = new Map();
    const leadsPorEmusysLeadId = new Map();
    const leadsPorTelefone = new Map();
    leadsCanonicos.forEach((lead: any) => {
      if (lead.aluno_id && !leadsPorAluno.has(lead.aluno_id)) leadsPorAluno.set(lead.aluno_id, lead);
      const emusysLeadId = Number(lead.emusys_lead_id);
      if (Number.isFinite(emusysLeadId) && emusysLeadId > 0 && !leadsPorEmusysLeadId.has(emusysLeadId)) {
        leadsPorEmusysLeadId.set(emusysLeadId, lead);
      }
      const tel = normalizarTelefoneRelatorio(lead.telefone);
      if (tel) {
        const key = chaveTelefoneUnidade(lead.unidade_id, lead.telefone);
        const lista = leadsPorTelefone.get(key) || [];
        lista.push(lead);
        leadsPorTelefone.set(key, lista);
      }
    });
    const experimentaisPorAlunoId = new Map();
    const experimentaisPorEmusysLeadId = new Map();
    const experimentaisPorLeadId = new Map();
    experimentaisCanonicas.forEach((exp: any) => {
      const enriquecida = {
        ...exp,
        professorExperimentalNome: professoresPorId.get(exp.professor_experimental_id) || null,
      };
      if (exp.aluno_id) {
        const lista = experimentaisPorAlunoId.get(exp.aluno_id) || [];
        lista.push(enriquecida);
        experimentaisPorAlunoId.set(exp.aluno_id, lista);
      }
      if (exp.emusys_lead_id) {
        const lista = experimentaisPorEmusysLeadId.get(Number(exp.emusys_lead_id)) || [];
        lista.push(enriquecida);
        experimentaisPorEmusysLeadId.set(Number(exp.emusys_lead_id), lista);
      }
      if (exp.lead_id) {
        const lista = experimentaisPorLeadId.get(exp.lead_id) || [];
        lista.push(enriquecida);
        experimentaisPorLeadId.set(exp.lead_id, lista);
      }
    });

    const selecionarLeadParaAluno = (aluno: any) => {
      const candidatos: any[] = [];
      const direto = leadsPorAluno.get(aluno.id);
      if (direto) candidatos.push(direto);
      const emusysLeadId = Number(aluno.emusys_lead_id);
      if (Number.isFinite(emusysLeadId) && leadsPorEmusysLeadId.has(emusysLeadId)) {
        candidatos.push(leadsPorEmusysLeadId.get(emusysLeadId));
      }
      [aluno.telefone, aluno.responsavel_telefone].forEach((tel: string | null) => {
        const normalizado = normalizarTelefoneRelatorio(tel);
        if (!normalizado) return;
        const porTelefone = leadsPorTelefone.get(chaveTelefoneUnidade(aluno.unidade_id, tel)) || [];
        candidatos.push(...porTelefone);
      });

      const unicos = Array.from(new Map(candidatos.filter(Boolean).map((lead: any) => [lead.id, lead])).values());
      if (!unicos.length) return null;

      const nomeAluno = normalizarTextoRelatorio(aluno.nome);
      const dataMatricula = aluno.data_matricula ? new Date(aluno.data_matricula).getTime() : 0;
      return unicos.sort((a: any, b: any) => {
        const score = (lead: any) => {
          let s = 0;
          if (lead.aluno_id === aluno.id) s += 100;
          if (Number(lead.emusys_lead_id) === emusysLeadId) s += 80;
          if (normalizarTextoRelatorio(lead.nome) === nomeAluno) s += 35;
          if (normalizarTelefoneRelatorio(lead.telefone) && [aluno.telefone, aluno.responsavel_telefone].some((tel: string | null) => normalizarTelefoneRelatorio(tel) === normalizarTelefoneRelatorio(lead.telefone))) s += 20;
          if (String(lead.status || '').toLowerCase() === 'convertido') s += 15;
          const dataLead = lead.data_contato || lead.data_experimental;
          const timeLead = dataLead ? new Date(dataLead).getTime() : 0;
          if (dataMatricula && timeLead && timeLead <= dataMatricula) s += 5;
          if (dataMatricula && timeLead && timeLead > dataMatricula) s -= 10;
          return s;
        };
        const diff = score(b) - score(a);
        if (diff !== 0) return diff;
        return String(b.data_contato || b.data_experimental || '').localeCompare(String(a.data_contato || a.data_experimental || ''));
      })[0];
    };

    return alunos.map((aluno: any) => {
      const lead = selecionarLeadParaAluno(aluno);
      const canalAluno = (aluno.canais_origem as any)?.nome;
      const canalLead = (lead?.canais_origem as any)?.nome;
      const emusysLeadId = Number(aluno.emusys_lead_id);
      const experimentaisCanonicasAluno = [
        ...(experimentaisPorAlunoId.get(aluno.id) || []),
        ...(Number.isFinite(emusysLeadId) ? (experimentaisPorEmusysLeadId.get(emusysLeadId) || []) : []),
        ...(lead?.emusys_lead_id ? (experimentaisPorEmusysLeadId.get(Number(lead.emusys_lead_id)) || []) : []),
        ...(lead?.id ? (experimentaisPorLeadId.get(lead.id) || []) : []),
      ];
      const experimentaisUnicasAluno = Array.from(
        new Map(experimentaisCanonicasAluno.filter((exp: any) => exp?.id).map((exp: any) => [exp.id, exp])).values()
      );
      const professoresExpNomes = valoresUnicosRelatorio([
        ...experimentaisUnicasAluno
          .filter((exp: any) => statusExperimentalRealizada(exp.status))
          .map((exp: any) => exp.professorExperimentalNome || exp.professor_experimental_nome),
        lead?.professor_experimental_id ? professoresPorId.get(lead.professor_experimental_id) : null,
      ]);
      const professorExpFallbackAluno = !lead && !experimentaisUnicasAluno.length && aluno.professor_experimental_id && aluno.professor_experimental_id !== aluno.professor_atual_id
        ? professoresPorId.get(aluno.professor_experimental_id)
        : null;
      const professorExpCanonico = professoresExpNomes.join(' e ') || resolverProfessorExperimentalCanonico({
        dataMatricula: aluno.data_matricula,
        experimentais: experimentaisUnicasAluno,
      }) || professorExpFallbackAluno;

      return {
        ...aluno,
        curso_interesse_id: aluno.curso_id,
        professor_fixo_id: aluno.professor_atual_id,
        idade: aluno.idade_atual,
        data_conversao: aluno.data_matricula,
        curso_nome: (aluno.cursos as any)?.nome || '',
        is_banda: Boolean((aluno.cursos as any)?.is_projeto_banda || (aluno.modalidade || '').toLowerCase().includes('banda')),
        canal_origem_id: aluno.canal_origem_id || lead?.canal_origem_id,
        canal_nome: canalAluno || canalLead || 'Não informado',
        unidade_codigo: (aluno.unidades as any)?.codigo,
        unidade_nome: (aluno.unidades as any)?.nome,
        hunter_nome: (aluno.unidades as any)?.hunter_nome,
        professor_fixo_nome: professoresPorId.get(aluno.professor_atual_id) || null,
        professor_exp_nome: professorExpCanonico,
        professor_exp_nomes: professoresExpNomes.length ? professoresExpNomes : (professorExpCanonico ? [professorExpCanonico] : []),
        lead_id: lead?.id || null,
        lead_nome: lead?.nome || null,
        forma_pagamento_nome: (aluno.formas_pagamento as any)?.nome || null,
      };
    });
  };

  const gerarRelatorioDiario = async () => {
    const { dataFim, dataFimObj } = calcularRangeDatas();
    const hoje = dataFimObj;
    const dia = hoje.getDate().toString().padStart(2, '0');
    const mesNome = hoje.toLocaleString('pt-BR', { month: 'long' });
    const ano = hoje.getFullYear();

    // Setor comercial pensa em acumulado: quando o filtro é "hoje", reportar
    // desde o 1º dia do mês até hoje (leads/experimentais/matrículas).
    // Buscar informações da unidade incluindo o Hunter
    const unidadeId = isAdmin ? context?.unidadeSelecionada : usuario?.unidade_id;
    const unidadeRelatorioId = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
    let unidadeNome = unidadeRelatorioId ? 'Unidade' : 'Consolidado';
    let hunterNome = unidadeRelatorioId ? (usuario?.nome || 'Usuário') : 'Todos';

    if (unidadeRelatorioId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeRelatorioId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    const inicioDiaBRT = `${dataFim}T00:00:00-03:00`;
    const fimDiaBRT = `${dataFim}T23:59:59.999-03:00`;
    let experimentaisAgendadasDiaQuery = supabase
      .from('lead_experimentais')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'experimental_agendada')
      .gte('created_at', inicioDiaBRT)
      .lte('created_at', fimDiaBRT);

    if (unidadeRelatorioId) {
      experimentaisAgendadasDiaQuery = experimentaisAgendadasDiaQuery.eq('unidade_id', unidadeRelatorioId);
    }

    const [
      kpisMesResponse,
      kpisDiaResponse,
      conciliacaoMesResponse,
      conciliacaoDiaResponse,
      emusysMesResponse,
      emusysDiaResponse,
      experimentaisAgendadasDiaResponse,
    ] = await Promise.all([
      supabase.rpc('get_kpis_comercial_canonicos_v2', {
        p_unidade_id: unidadeRelatorioId,
        p_ano: ano,
        p_mes: hoje.getMonth() + 1,
        p_periodo: 'mensal',
        p_data: null,
      }),
      supabase.rpc('get_kpis_comercial_canonicos_v2', {
        p_unidade_id: unidadeRelatorioId,
        p_ano: ano,
        p_mes: hoje.getMonth() + 1,
        p_periodo: 'diario',
        p_data: dataFim,
      }),
      supabase.rpc('get_conciliacao_experimentais_v2', {
        p_unidade_id: unidadeRelatorioId,
        p_ano: ano,
        p_mes: hoje.getMonth() + 1,
        p_periodo: 'mensal',
        p_data: null,
      }),
      supabase.rpc('get_conciliacao_experimentais_v2', {
        p_unidade_id: unidadeRelatorioId,
        p_ano: ano,
        p_mes: hoje.getMonth() + 1,
        p_periodo: 'diario',
        p_data: dataFim,
      }),
      supabase.rpc('get_experimentais_emusys_operacional_v1', {
        p_unidade_id: unidadeRelatorioId,
        p_ano: ano,
        p_mes: hoje.getMonth() + 1,
        p_periodo: 'mensal',
        p_data: null,
      }),
      supabase.rpc('get_experimentais_emusys_operacional_v1', {
        p_unidade_id: unidadeRelatorioId,
        p_ano: ano,
        p_mes: hoje.getMonth() + 1,
        p_periodo: 'diario',
        p_data: dataFim,
      }),
      experimentaisAgendadasDiaQuery,
    ]);

    if (kpisMesResponse.error) throw kpisMesResponse.error;
    if (kpisDiaResponse.error) throw kpisDiaResponse.error;
    if (conciliacaoMesResponse.error) throw conciliacaoMesResponse.error;
    if (conciliacaoDiaResponse.error) throw conciliacaoDiaResponse.error;
    if (emusysMesResponse.error) throw emusysMesResponse.error;
    if (emusysDiaResponse.error) throw emusysDiaResponse.error;
    if (experimentaisAgendadasDiaResponse.error) throw experimentaisAgendadasDiaResponse.error;

    const kpisMes = ((kpisMesResponse.data as any)?.kpis || {}) as Record<string, unknown>;
    const kpisDia = ((kpisDiaResponse.data as any)?.kpis || {}) as Record<string, unknown>;
    const resumoConciliacaoMes = ((conciliacaoMesResponse.data as any)?.resumo || {}) as Record<string, unknown>;
    const resumoEmusysMes = ((emusysMesResponse.data as any)?.resumo || {}) as Record<string, unknown>;
    const resumoEmusysDia = ((emusysDiaResponse.data as any)?.resumo || {}) as Record<string, unknown>;

    const leadsPeriodo = numeroResumo(kpisMes.leads_entrantes);
    const experimentaisRealizadasMes = numeroResumo(resumoConciliacaoMes.experimentais_realizadas_confirmadas);
    const experimentaisEmusysMes = numeroResumo(resumoEmusysMes.realizadas_emusys);
    const experimentaisAgendadasMes = experimentaisEmusysMes;
    const experimentaisFaltasMes = numeroResumo(resumoEmusysMes.faltas);
    const totalExpAgendadasV2 = numeroResumo(resumoEmusysDia.linhas_raw);
    const experimentaisAgendadasDia = experimentaisAgendadasDiaResponse.count || 0;
    const visitasDiaTotalV2 = numeroResumo(kpisDia.visitas);

    const visitasDiaTotal = visitasDiaTotalV2;

    // Nao reaproveitar o state da tela, que pode estar consolidado ou defasado entre filtros.
    const dataInicioMes = `${ano}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    const matriculasNovas = agruparMatriculasParaRelatorio(await buscarMatriculasAlunos(unidadeRelatorioId, dataInicioMes, dataFim))
      .filter(ehMatriculaNova)
      .sort((a: any, b: any) => (a.data_matricula || '').localeCompare(b.data_matricula || ''));

    const taxaExpMatMes: TaxaExpMatCanonica = {
      liberada: resumoConciliacaoMes.taxa_exp_mat_liberada === true,
      taxa: numeroResumo(resumoConciliacaoMes.taxa_exp_mat_canonica),
      denominador: numeroResumo(resumoConciliacaoMes.denominador_taxa_exp_mat),
      conversoes: numeroResumo(resumoConciliacaoMes.conversoes_exp_mat_canonicas),
      pendencias: numeroResumo(resumoConciliacaoMes.pendencias_taxa_exp_mat),
      realizadasConfirmadas: experimentaisRealizadasMes,
    };
    const conversaoLeadExp = leadsPeriodo > 0 ? (experimentaisRealizadasMes / leadsPeriodo) * 100 : 0;
    const conversaoLeadMat = leadsPeriodo > 0 ? (matriculasNovas.length / leadsPeriodo) * 100 : 0;

    const totalExpAgendadas = totalExpAgendadasV2;

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 *RELATÓRIO DIÁRIO*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📆 ${dia}/${mesNome}/${ano}\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    texto += `🎯 Leads no mês: *${leadsPeriodo}*\n`;
    texto += `🎸 Experimentais agendadas no mês: *${experimentaisAgendadasMes}*\n`;
    texto += `✅ Experimentais realizadas confirmadas: *${experimentaisRealizadasMes}*\n`;
    texto += `❌ Faltas em experimentais no mês: *${experimentaisFaltasMes}*\n`;
    texto += `📆 Experimentais no dia (Emusys): *${totalExpAgendadas}*\n`;
    texto += `🗓️ Experimentais agendadas no dia: *${experimentaisAgendadasDia}*\n`;
    texto += `🏫 Visitas: *${visitasDiaTotal}*\n\n`;

    texto += `✅ Matrículas no período: *${matriculasNovas.length}*\n\n`;
    texto += `📊 *FUNIL DO MÊS*\n`;
    texto += `Lead → Experimental: *${conversaoLeadExp.toFixed(1)}%* (${experimentaisRealizadasMes}/${leadsPeriodo})\n`;
    texto += `Experimental → Matrícula: ${textoTaxaExpMat(taxaExpMatMes)}\n`;
    texto += `Lead → Matrícula: *${conversaoLeadMat.toFixed(1)}%* (${matriculasNovas.length}/${leadsPeriodo})\n\n`;

    texto = texto
      .replace(
        new RegExp(`^.*Experimentais agendadas no m.*\\*${experimentaisAgendadasMes}\\*\\n`, 'm'),
        `\u{1F3B8} Experimentais realizadas no m\u00eas (Emusys): *${experimentaisEmusysMes}*\n`,
      )
      .replace(
        new RegExp(`^.*Experimentais realizadas confirmadas: \\*${experimentaisRealizadasMes}\\*\\n`, 'm'),
        `\u2705 Presen\u00e7a + v\u00ednculo confirmados: *${experimentaisRealizadasMes}*\n`,
      )
      .replace(
        new RegExp(`^.*Faltas em experimentais no m.*\\*${experimentaisFaltasMes}\\*\\n`, 'm'),
        `\u274C Faltas em experimentais no m\u00eas (Emusys): *${experimentaisFaltasMes}*\n`,
      );

    if (matriculasNovas.length > 0) {
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      texto += `📝 *LISTA DETALHADA*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      matriculasNovas.forEach((mat: any, i: number) => {
        const dataMat = mat.data_matricula || mat.data_contato;
        const dataFormatada = formatarDataCurtaRelatorio(dataMat);
        texto += `MAT. ${(i + 1).toString().padStart(2, '0')}\n`;
        texto += `📅 Data: ${dataFormatada}\n`;
        texto += `👤 Aluno: ${mat.nome || 'Não informado'}`;
        if (mat.idade) texto += ` (${mat.idade} anos)`;
        texto += `\n`;
        texto += `🎵 Curso: ${mat.cursos_relatorio || mat.curso_nome || 'Não informado'}\n`;
        texto += `👨‍🏫 Professor: ${mat.professores_relatorio || mat.professor_fixo_nome || 'Não informado'}\n`;
        texto += `🎸 Prof. Experimental: ${mat.professores_exp_relatorio || mat.professor_exp_nome || 'Não teve'}\n`;
        texto += `📱 Canal: ${mat.canal_nome || 'Não informado'}\n`;
        texto += `👤 Hunter: ${mat.hunter_nome || hunterNome}\n`;
        texto += `💵 Pass: R$ ${fmtBRL(Number(mat.valor_passaporte) || 0)}`;
        if (mat.forma_pagamento_passaporte_nome) texto += ` (${mat.forma_pagamento_passaporte_nome})`;
        texto += `\n`;
        texto += `💵 Parc: ${formatarParcelasMatriculaRelatorio(mat)}`;
        if (mat.formas_pagamento_relatorio || mat.forma_pagamento_nome) texto += ` (${mat.formas_pagamento_relatorio || mat.forma_pagamento_nome})`;
        texto += `\n\n`;
      });
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    const agora = new Date();
    texto += `📅 Gerado em: ${dia}/${(agora.getMonth() + 1).toString().padStart(2, '0')}/${ano} às ${agora.getHours()}:${agora.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório semanal
  const gerarRelatorioSemanal = async () => {
    const hoje = new Date();
    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(hoje.getDate() - 7);
    
    // Buscar informações da unidade incluindo o Hunter
    const unidadeId = isAdmin ? context?.unidadeSelecionada : usuario?.unidade_id;
    const unidadeRelatorioId = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
    let unidadeNome = unidadeRelatorioId ? 'Unidade' : 'Consolidado';
    let hunterNome = unidadeRelatorioId ? (usuario?.nome || 'Usuário') : 'Todos';

    if (unidadeRelatorioId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeRelatorioId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados dos últimos 7 dias
    let registrosSemanaQuery = supabase
      .from('leads')
      .select('status, quantidade, valor_passaporte, valor_parcela, experimental_agendada, tipo_aluno')
      .gte('data_contato', seteDiasAtras.toISOString().split('T')[0])
      .lte('data_contato', hoje.toISOString().split('T')[0]);
    if (unidadeRelatorioId) registrosSemanaQuery = registrosSemanaQuery.eq('unidade_id', unidadeRelatorioId);
    const { data: registrosSemana } = await registrosSemanaQuery;

    const leadsSemana = registrosSemana?.reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisSemana = registrosSemana?.filter(r => r.experimental_agendada === true).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasSemana = registrosSemana?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    // Matriculas: fonte = alunos por data_matricula (apenas matriculas novas)
    const matriculasSemanaAlunos = (await buscarMatriculasAlunos(unidadeRelatorioId, seteDiasAtras.toISOString().split('T')[0], hoje.toISOString().split('T')[0])).filter(ehMatriculaNova);
    const matriculasSemana = matriculasSemanaAlunos.length;

    // Calcular conversões
    const conversaoLeadExp = leadsSemana > 0 ? (experimentaisSemana / leadsSemana) * 100 : 0;
    const taxaExpMatSemana = await buscarTaxaExpMatCanonica(
      unidadeRelatorioId,
      hoje.getFullYear(),
      hoje.getMonth() + 1,
      'mensal'
    );
    const conversaoLeadMat = leadsSemana > 0 ? (matriculasSemana / leadsSemana) * 100 : 0;

    // Calcular tickets medios pela mesma fonte canonica das matriculas
    // Regra de negocio: matriculas com passaporte zerado (ex: re-matricula) nao entram no ticket medio
    const matriculasComPassaporteSemana = matriculasSemanaAlunos.filter(m => (m.valor_passaporte || 0) > 0);
    const totalPassaporte = matriculasComPassaporteSemana.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0);
    // Regra de negocio: bolsistas nao entram no ticket medio da parcela
    const matriculasPagantesSemana = matriculasSemanaAlunos.filter(m => !TIPOS_SEM_PAGAMENTO.includes(m.tipo_aluno));
    const totalParcela = matriculasPagantesSemana.reduce((acc, m) => acc + (m.valor_parcela || 0), 0);
    const ticketMedioPassaporte = matriculasComPassaporteSemana.length > 0 ? totalPassaporte / matriculasComPassaporteSemana.length : 0;
    const ticketMedioParcela = matriculasPagantesSemana.length > 0 ? totalParcela / matriculasPagantesSemana.length : 0;
    
    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📆 *RELATÓRIO SEMANAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 Últimos 7 dias\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    texto += `📈 *TOTAIS DA SEMANA*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🎯 Leads na semana: *${leadsSemana}*\n`;
    texto += `🎸 Experimentais marcadas na semana: *${experimentaisSemana}*\n`;
    texto += `🏫 Visitas na semana: *${visitasSemana}*\n`;
    texto += `✅ Matrículas na semana: *${matriculasSemana}*\n\n`;

    texto += `📊 *CONVERSÕES*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Lead → Experimental: *${conversaoLeadExp.toFixed(1)}%*\n`;
    texto += `Experimental → Matrícula: ${textoTaxaExpMat(taxaExpMatSemana)}\n`;
    texto += `Lead → Matrícula: *${conversaoLeadMat.toFixed(1)}%*\n\n`;

    texto += `💰 *FINANCEIRO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Ticket Médio Passaporte: R$ ${ticketMedioPassaporte.toFixed(2)}\n`;
    texto += `Ticket Médio Parcela: R$ ${ticketMedioParcela.toFixed(2)}\n\n`;

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  };

  const obterCompetenciaRelatorioMensalComercial = () => {
    if (relatorioPeriodo === 'mes_anterior') {
      const { dataInicioObj } = calcularRangeDatas();
      return {
        ano: dataInicioObj.getFullYear(),
        mes: dataInicioObj.getMonth() + 1,
      };
    }

    if (relatorioPeriodo !== 'personalizado') {
      return {
        ano: competencia.filtro.ano,
        mes: competencia.filtro.mes,
      };
    }

    const mesmoMes = relatorioDataInicio.getFullYear() === relatorioDataFim.getFullYear()
      && relatorioDataInicio.getMonth() === relatorioDataFim.getMonth();

    if (!mesmoMes) {
      throw new Error('O relatorio mensal precisa estar dentro de uma unica competencia. Selecione datas do mesmo mes.');
    }

    return {
      ano: relatorioDataInicio.getFullYear(),
      mes: relatorioDataInicio.getMonth() + 1,
    };
  };

  // Gerar relatório mensal completo
  const gerarRelatorioMensal = async () => {
    const competenciaRelatorioMensal = obterCompetenciaRelatorioMensalComercial();

    const {
      ano,
      mes,
      dataInicio,
      dataFim,
      periodoLabel,
    } = calcularRangeRelatorioMensalComercial(competenciaRelatorioMensal.ano, competenciaRelatorioMensal.mes);

    // Buscar informações da unidade incluindo o Hunter
    const unidadeId = isAdmin ? context?.unidadeSelecionada : usuario?.unidade_id;
    const unidadeRelatorioId = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
    let unidadeNome = unidadeRelatorioId ? 'Unidade' : 'Consolidado';
    let hunterNome = unidadeRelatorioId ? (usuario?.nome || 'Usuário') : 'Todos';

    if (unidadeRelatorioId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeRelatorioId)
        .single();

      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados do período selecionado
    let registrosMesQuery = supabase
      .from('leads')
      .select('status, quantidade, canal_origem_id, curso_interesse_id, experimental_agendada, canais_origem(nome), cursos(nome)')
      .gte('data_contato', dataInicio)
      .lte('data_contato', dataFim);
    if (unidadeRelatorioId) registrosMesQuery = registrosMesQuery.eq('unidade_id', unidadeRelatorioId);
    const { data: registrosMes } = await registrosMesQuery;

    const leadsMes = registrosMes?.reduce((acc, r) => acc + r.quantidade, 0) || 0;
    // Experimentais do relatorio mensal usam a mesma conciliacao canonica
    // do diario/cards: endpoint Emusys v2 + decisoes humanas.
    const taxaExpMatMes = await buscarTaxaExpMatCanonica(
      unidadeRelatorioId,
      ano,
      mes,
      'mensal'
    );
    const experimentaisMes = taxaExpMatMes.realizadasConfirmadas || taxaExpMatMes.denominador;
    const visitasMes = registrosMes?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    // Matrículas: fonte = alunos por data_matricula (inclui matrículas sem lead).
    // Conta apenas matrículas novas (exclui 2º curso, banda e passaporte zerado),
    // alinhando com o resumo/funil da tela.
    const matAlunosMesBase = await buscarMatriculasAlunos(unidadeRelatorioId, dataInicio, dataFim);
    const matAlunosMes = matAlunosMesBase.filter(ehMatriculaNova);
    const matAlunosMesRelatorio = agruparMatriculasParaRelatorio(matAlunosMesBase).filter(ehMatriculaNova);
    const matriculasMes = matAlunosMes.length;

    // Calcular conversões
    const conversaoLeadExp = leadsMes > 0 ? (experimentaisMes / leadsMes) * 100 : 0;
    const conversaoLeadMat = leadsMes > 0 ? (matriculasMes / leadsMes) * 100 : 0;

    // Matrículas detalhadas do mês (fonte = alunos por data_matricula)
    const matriculasDetalhadas = matAlunosMesRelatorio.map((a: any) => ({
      nome: a.nome,
      idade: a.idade_atual,
      data_matricula: a.data_matricula,
      data_contato: a.data_matricula,
      tipo_matricula: null,
      tipo_aluno: a.tipo_aluno,
      valor_passaporte: a.valor_passaporte,
      valor_parcela: a.valor_parcela,
      parcelas_relatorio: a.parcelas_relatorio,
      cursos_relatorio: a.cursos_relatorio,
      professores_relatorio: a.professores_relatorio,
      professores_exp_relatorio: a.professores_exp_relatorio,
      formas_pagamento_relatorio: a.formas_pagamento_relatorio,
      professor_fixo_nome: a.professor_fixo_nome,
      professor_exp_nome: a.professor_exp_nome,
      canal_nome: a.canal_nome,
      cursos: a.cursos,
      canais_origem: a.canais_origem,
    }));

    // Agrupar leads por canal
    const leadsPorCanal: { [key: string]: number } = {};
    registrosMes?.forEach(r => {
      const canal = (r.canais_origem as any)?.nome || 'Não informado';
      leadsPorCanal[canal] = (leadsPorCanal[canal] || 0) + r.quantidade;
    });

    // Agrupar leads por curso
    const leadsPorCurso: { [key: string]: number } = {};
    registrosMes?.forEach(r => {
      const curso = (r.cursos as any)?.nome || 'Não informado';
      leadsPorCurso[curso] = (leadsPorCurso[curso] || 0) + r.quantidade;
    });

    // Agrupar matrículas por canal
    const matriculasPorCanal: { [key: string]: number } = {};
    matAlunosMesRelatorio.forEach((a: any) => {
      const canal = a.canal_nome || (a.canais_origem as any)?.nome || 'Não informado';
      matriculasPorCanal[canal] = (matriculasPorCanal[canal] || 0) + 1;
    });

    // Agrupar matrículas por curso (fonte = alunos)
    const matriculasPorCurso: { [key: string]: number } = {};
    matAlunosMesRelatorio.forEach((a: any) => {
      const curso = a.cursos_relatorio || (a.cursos as any)?.nome || 'Não informado';
      matriculasPorCurso[curso] = (matriculasPorCurso[curso] || 0) + 1;
    });

    // Calcular totais financeiros
    // Regra de negócio: matrículas com passaporte zerado (ex: re-matrícula) não entram no ticket médio
    const matriculasComPassaporteMes = matriculasDetalhadas?.filter(m => (m.valor_passaporte || 0) > 0) || [];
    const totalPassaporte = matriculasComPassaporteMes.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0);
    // Regra de negócio: bolsistas não entram no ticket médio da parcela
    const matriculasPagantesMes = matriculasDetalhadas?.filter(m => !TIPOS_SEM_PAGAMENTO.includes(m.tipo_aluno)) || [];
    const totalParcela = matriculasPagantesMes.reduce((acc, m) => {
      const parcelas = Array.isArray((m as any).parcelas_relatorio)
        ? (m as any).parcelas_relatorio.filter((valor: number) => Number(valor) > 0)
        : [];
      if (parcelas.length > 1) return acc + parcelas.reduce((soma: number, valor: number) => soma + (Number(valor) || 0), 0);
      return acc + (Number(m.valor_parcela) || 0);
    }, 0);
    const ticketMedioPass = matriculasComPassaporteMes.length > 0 ? totalPassaporte / matriculasComPassaporteMes.length : 0;
    const ticketMedioPar = matriculasPagantesMes.length > 0 ? totalParcela / matriculasPagantesMes.length : 0;

    // Contar matrículas por tipo
    const lamkCount = matriculasDetalhadas?.filter(m => m.idade != null ? m.idade <= 11 : m.tipo_matricula === 'LAMK').length || 0;
    const emlaCount = matriculasDetalhadas?.filter(m => m.idade != null ? m.idade > 11 : m.tipo_matricula === 'EMLA').length || 0;

    // Cabeçalho
    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO MENSAL COMERCIAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 *${periodoLabel}*\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Resumo Geral
    texto += `📈 *RESUMO GERAL DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🎯 Leads no mês: *${leadsMes}*\n`;
    texto += `🎸 Experimentais realizadas no mês: *${experimentaisMes}*\n`;
    texto += `🏫 Visitas no mês: *${visitasMes}*\n`;
    texto += `✅ Matrículas no mês: *${matriculasMes}*\n\n`;

    // Conversões
    texto += `📊 *TAXAS DE CONVERSÃO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Lead → Experimental: *${conversaoLeadExp.toFixed(1)}%*\n`;
    texto += `Experimental → Matrícula: ${textoTaxaExpMat(taxaExpMatMes)}\n`;
    texto += `Lead → Matrícula: *${conversaoLeadMat.toFixed(1)}%*\n\n`;

    // Matrículas por tipo
    texto += `👥 *MATRÍCULAS DO MÊS (${matriculasMes})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🎨 LAMK (Kids): *${lamkCount}*\n`;
    texto += `🎸 EMLA (Adulto): *${emlaCount}*\n\n`;

    // Valores financeiros
    texto += `💰 *VALORES FINANCEIROS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total Passaportes: *R$ ${fmtBRL(totalPassaporte)}*\n`;
    texto += `Total Parcelas: *R$ ${fmtBRL(totalParcela)}*\n`;
    texto += `Ticket Médio Pass.: *R$ ${fmtBRL(ticketMedioPass)}*\n`;
    texto += `Ticket Médio Parc.: *R$ ${fmtBRL(ticketMedioPar)}*\n\n`;

    // Leads por Canal - sempre mostrar
    texto += `📲 *LEADS POR CANAIS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Object.keys(leadsPorCanal).length > 0) {
      Object.entries(leadsPorCanal)
        .sort(([, a], [, b]) => b - a)
        .forEach(([canal, qtd]) => {
          texto += `${canal}: ${qtd}\n`;
        });
    } else {
      texto += `Nenhum lead registrado\n`;
    }
    texto += `\n`;

    // Leads por Curso - sempre mostrar
    texto += `🎸 *LEADS POR CURSO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Object.keys(leadsPorCurso).length > 0) {
      Object.entries(leadsPorCurso)
        .sort(([, a], [, b]) => b - a)
        .forEach(([curso, qtd]) => {
          texto += `${curso}: ${qtd}\n`;
        });
    } else {
      texto += `Nenhum lead registrado\n`;
    }
    texto += `\n`;

    // Matrículas por Canal - sempre mostrar
    texto += `🔥 *MATRÍCULAS POR CANAIS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Object.keys(matriculasPorCanal).length > 0) {
      Object.entries(matriculasPorCanal)
        .sort(([, a], [, b]) => b - a)
        .forEach(([canal, qtd]) => {
          texto += `${canal}: ${qtd}\n`;
        });
    } else {
      texto += `Nenhuma matrícula registrada\n`;
    }
    texto += `\n`;

    // Matrículas por Curso - sempre mostrar
    texto += `🏆 *MATRÍCULAS POR CURSO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Object.keys(matriculasPorCurso).length > 0) {
      Object.entries(matriculasPorCurso)
        .sort(([, a], [, b]) => b - a)
        .forEach(([curso, qtd]) => {
          texto += `${curso}: ${qtd}\n`;
        });
    } else {
      texto += `Nenhuma matrícula registrada\n`;
    }
    texto += `\n`;

    // Lista de matrículas
    if (matriculasDetalhadas && matriculasDetalhadas.length > 0) {
      texto += `📋 *LISTA DE MATRÍCULAS*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      matriculasDetalhadas.forEach((mat, i) => {
        const dataFormatada = formatarDataCurtaRelatorio(mat.data_matricula || mat.data_contato);
        texto += `${i + 1}. ${mat.nome}`;
        if (mat.idade) texto += ` (${mat.idade} anos)`;
        texto += `\n   📅 ${dataFormatada}`;
        const cursoTexto = (mat as any).cursos_relatorio || (mat.cursos as any)?.nome;
        const canalTexto = (mat as any).canal_nome || (mat.canais_origem as any)?.nome;
        if (cursoTexto) texto += ` | 🎵 ${cursoTexto}`;
        if (canalTexto) texto += ` | 📱 ${canalTexto}`;
        texto += `\n   💵 Pass: R$ ${fmtBRL(Number(mat.valor_passaporte) || 0)}`;
        texto += ` | Parc: ${formatarParcelasMatriculaRelatorio(mat)}\n\n`;
      });
    }

    // Rodapé
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    const agora = new Date();
    texto += `📅 Gerado em: ${agora.getDate().toString().padStart(2, '0')}/${(agora.getMonth() + 1).toString().padStart(2, '0')}/${agora.getFullYear()} às ${agora.getHours()}:${agora.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório de matrículas detalhado
  const gerarRelatorioMatriculas = async () => {
    const hoje = new Date();
    const dia = hoje.getDate().toString().padStart(2, '0');
    const competenciaRelatorioMatriculas = obterCompetenciaRelatorioMensalComercial();
    const ano = competenciaRelatorioMatriculas.ano;
    const mesRelatorio = competenciaRelatorioMatriculas.mes;
    const mesNome = new Date(ano, mesRelatorio - 1, 1).toLocaleString('pt-BR', { month: 'long' });
    const mesNomeUpper = mesNome.toUpperCase();
    
    // Buscar informações da unidade incluindo o Hunter
    const unidadeId = isAdmin ? context?.unidadeSelecionada : usuario?.unidade_id;
    const unidadeRelatorioId = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
    let unidadeNome = unidadeRelatorioId ? 'Unidade' : 'Consolidado';
    let hunterNome = unidadeRelatorioId ? (usuario?.nome || 'Usuário') : 'Todos';
    
    if (unidadeRelatorioId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeRelatorioId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Calcular totais e estatísticas — apenas matrículas novas (exclui 2º curso/banda/passaporte zerado)
    const dataInicioMes = `${ano}-${String(mesRelatorio).padStart(2, '0')}-01`;
    const dataFimMes = `${ano}-${String(mesRelatorio).padStart(2, '0')}-${new Date(ano, mesRelatorio, 0).getDate()}`;
    const matriculasNovas = agruparMatriculasParaRelatorio(await buscarMatriculasAlunos(unidadeRelatorioId, dataInicioMes, dataFimMes))
      .filter(ehMatriculaNova)
      .sort((a: any, b: any) => (a.data_matricula || '').localeCompare(b.data_matricula || ''));
    const totalMatriculas = matriculasNovas.length;
    const lamkCount = matriculasNovas.filter(m => m.idade != null ? m.idade <= 11 : m.tipo_matricula === 'LAMK').length;
    const emlaCount = matriculasNovas.filter(m => m.idade != null ? m.idade > 11 : m.tipo_matricula === 'EMLA').length;

    // Regra de negócio: matrículas com passaporte zerado (ex: re-matrícula) não entram no ticket médio
    const matriculasComPassaporte = matriculasNovas.filter(m => (Number(m.valor_passaporte) || 0) > 0);
    const totalPassaporte = matriculasComPassaporte.reduce((acc, m) => acc + (Number(m.valor_passaporte) || 0), 0);
    // Regra de negócio: bolsistas não entram no ticket médio da parcela
    const matriculasPagantes = matriculasNovas.filter(m => !TIPOS_SEM_PAGAMENTO.includes(m.tipo_aluno) && (Number(m.valor_parcela) || 0) > 0);
    const totalParcela = matriculasPagantes.reduce((acc, m) => {
      const parcelas = Array.isArray((m as any).parcelas_relatorio)
        ? (m as any).parcelas_relatorio.filter((valor: number) => Number(valor) > 0)
        : [];
      if (parcelas.length > 1) return acc + parcelas.reduce((soma: number, valor: number) => soma + (Number(valor) || 0), 0);
      return acc + (Number(m.valor_parcela) || 0);
    }, 0);
    const ticketMedioPass = matriculasComPassaporte.length > 0 ? totalPassaporte / matriculasComPassaporte.length : 0;
    const ticketMedioPar = matriculasPagantes.length > 0 ? totalParcela / matriculasPagantes.length : 0;

    // Agrupar por canal
    const matriculasPorCanal: { [key: string]: number } = {};
    matriculasNovas.forEach(m => {
      const canal = m.canal_nome || 'Não informado';
      matriculasPorCanal[canal] = (matriculasPorCanal[canal] || 0) + 1;
    });

    // Agrupar por curso
    const matriculasPorCurso: { [key: string]: number } = {};
    matriculasNovas.forEach(m => {
      const curso = (m as any).cursos_relatorio || m.curso_nome || 'Não informado';
      matriculasPorCurso[curso] = (matriculasPorCurso[curso] || 0) + 1;
    });

    // Cabeçalho
    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📋 *RELATÓRIO DE MATRÍCULAS*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Resumo Executivo
    texto += `📊 *RESUMO EXECUTIVO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `✅ Total de Matrículas: *${totalMatriculas}*\n`;
    texto += `🎨 LAMK (Kids): *${lamkCount}*\n`;
    texto += `🎸 EMLA (Adulto): *${emlaCount}*\n\n`;

    // Valores Financeiros
    texto += `💰 *VALORES FINANCEIROS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total Passaportes: *R$ ${fmtBRL(totalPassaporte)}*\n`;
    texto += `Total Parcelas: *R$ ${fmtBRL(totalParcela)}*\n`;
    texto += `Ticket Médio Pass.: *R$ ${fmtBRL(ticketMedioPass)}*\n`;
    texto += `Ticket Médio Parc.: *R$ ${fmtBRL(ticketMedioPar)}*\n\n`;

    // Estatísticas
    texto += `📊 *ESTATÍSTICAS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Por Canal
    texto += `🔥 Por Canal:\n`;
    if (Object.keys(matriculasPorCanal).length > 0) {
      Object.entries(matriculasPorCanal)
        .sort(([, a], [, b]) => b - a)
        .forEach(([canal, qtd]) => {
          texto += `• ${canal}: ${qtd}\n`;
        });
    } else {
      texto += `• Nenhuma matrícula\n`;
    }
    texto += `\n`;

    // Por Curso
    texto += `🎸 Por Curso:\n`;
    if (Object.keys(matriculasPorCurso).length > 0) {
      Object.entries(matriculasPorCurso)
        .sort(([, a], [, b]) => b - a)
        .forEach(([curso, qtd]) => {
          texto += `• ${curso}: ${qtd}\n`;
        });
    } else {
      texto += `• Nenhuma matrícula\n`;
    }
    texto += `\n`;

    // Lista Detalhada
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📝 *LISTA DETALHADA*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    matriculasNovas.forEach((mat, i) => {
      const dataMat = (mat as any).data_matricula || mat.data_contato;
      const dataFormatada = formatarDataCurtaRelatorio(dataMat);

      texto += `MAT. ${(i + 1).toString().padStart(2, '0')}\n`;
      texto += `📅 Data: ${dataFormatada}\n`;
      texto += `👤 Aluno: ${mat.nome || 'Não informado'}`;
      if (mat.idade) texto += ` (${mat.idade} anos)`;
      texto += `\n`;
      texto += `🎵 Curso: ${(mat as any).cursos_relatorio || mat.curso_nome || 'Não informado'}\n`;
      texto += `👨‍🏫 Professor: ${(mat as any).professores_relatorio || mat.professor_fixo_nome || 'Não informado'}\n`;
      texto += `🎸 Prof. Experimental: ${(mat as any).professores_exp_relatorio || mat.professor_exp_nome || 'Não teve'}\n`;
      texto += `📱 Canal: ${mat.canal_nome || 'Não informado'}\n`;
      texto += `👤 Hunter: ${mat.hunter_nome || hunterNome}\n`;
      texto += `💵 Pass: R$ ${fmtBRL(Number(mat.valor_passaporte) || 0)}`;
      if (mat.forma_pagamento_passaporte_nome) texto += ` (${mat.forma_pagamento_passaporte_nome})`;
      texto += `\n`;
      texto += `💵 Parc: ${formatarParcelasMatriculaRelatorio(mat)}`;
      if ((mat as any).formas_pagamento_relatorio || mat.forma_pagamento_nome) texto += ` (${(mat as any).formas_pagamento_relatorio || mat.forma_pagamento_nome})`;
      texto += `\n\n`;
    });

    // Rodapé
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${dia}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()} às ${hoje.getHours()}:${hoje.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório comparativo mensal (mês atual vs mês anterior)
  const gerarRelatorioComparativoMensal = async () => {
    const hoje = new Date();
    const competenciaComparativo = obterCompetenciaRelatorioMensalComercial();
    const mesAtual = competenciaComparativo.mes - 1;
    const anoAtual = competenciaComparativo.ano;
    
    // Mês anterior
    const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    const anoAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;
    
    const unidadeId = isAdmin ? context?.unidadeSelecionada : usuario?.unidade_id;
    const unidadeRelatorioId = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
    let unidadeNome = unidadeRelatorioId ? 'Unidade' : 'Consolidado';
    let hunterNome = unidadeRelatorioId ? (usuario?.nome || 'Usuário') : 'Todos';
    
    if (unidadeRelatorioId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeRelatorioId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados do mês atual
    const inicioMesAtual = new Date(anoAtual, mesAtual, 1);
    const fimMesAtual = new Date(anoAtual, mesAtual + 1, 0);
    
    let dadosMesAtualQuery = supabase
      .from('leads')
      .select('status, quantidade, experimental_agendada')
      .gte('data_contato', inicioMesAtual.toISOString().split('T')[0])
      .lte('data_contato', fimMesAtual.toISOString().split('T')[0]);
    if (unidadeRelatorioId) dadosMesAtualQuery = dadosMesAtualQuery.eq('unidade_id', unidadeRelatorioId);
    const { data: dadosMesAtual } = await dadosMesAtualQuery;

    // Buscar dados do mês anterior
    const inicioMesAnterior = new Date(anoAnterior, mesAnterior, 1);
    const fimMesAnterior = new Date(anoAnterior, mesAnterior + 1, 0); // Último dia do mês

    let dadosMesAnteriorQuery = supabase
      .from('leads')
      .select('status, quantidade, experimental_agendada')
      .gte('data_contato', inicioMesAnterior.toISOString().split('T')[0])
      .lte('data_contato', fimMesAnterior.toISOString().split('T')[0]);
    if (unidadeRelatorioId) dadosMesAnteriorQuery = dadosMesAnteriorQuery.eq('unidade_id', unidadeRelatorioId);
    const { data: dadosMesAnterior } = await dadosMesAnteriorQuery;

    // Calcular totais mês atual
    const leadsAtual = dadosMesAtual?.reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisAtual = dadosMesAtual?.filter(r => r.experimental_agendada === true).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasAtual = dadosMesAtual?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasAtual = (await buscarMatriculasAlunos(unidadeRelatorioId, inicioMesAtual.toISOString().split('T')[0], fimMesAtual.toISOString().split('T')[0])).filter(ehMatriculaNova).length;

    // Calcular totais mês anterior
    const leadsAnterior = dadosMesAnterior?.reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisAnterior = dadosMesAnterior?.filter(r => r.experimental_agendada === true).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasAnterior = dadosMesAnterior?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasAnterior = (await buscarMatriculasAlunos(unidadeRelatorioId, inicioMesAnterior.toISOString().split('T')[0], fimMesAnterior.toISOString().split('T')[0])).filter(ehMatriculaNova).length;

    // Calcular variações
    const varLeads = leadsAnterior > 0 ? ((leadsAtual - leadsAnterior) / leadsAnterior * 100) : 0;
    const varExp = experimentaisAnterior > 0 ? ((experimentaisAtual - experimentaisAnterior) / experimentaisAnterior * 100) : 0;
    const varVisitas = visitasAnterior > 0 ? ((visitasAtual - visitasAnterior) / visitasAnterior * 100) : 0;
    const varMat = matriculasAnterior > 0 ? ((matriculasAtual - matriculasAnterior) / matriculasAnterior * 100) : 0;

    const mesAtualNome = new Date(anoAtual, mesAtual, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const mesAnteriorNome = new Date(anoAnterior, mesAnterior, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO COMPARATIVO MENSAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    texto += `📅 *${mesAtualNome}/${anoAtual}* vs *${mesAnteriorNome}/${anoAnterior}*\n\n`;
    
    texto += `🎯 *LEADS*\n`;
    texto += `${mesAtualNome}: *${leadsAtual}* | ${mesAnteriorNome}: *${leadsAnterior}*\n`;
    texto += `Variação: *${varLeads > 0 ? '+' : ''}${varLeads.toFixed(1)}%* ${varLeads > 0 ? '📈' : varLeads < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `🎸 *EXPERIMENTAIS*\n`;
    texto += `${mesAtualNome}: *${experimentaisAtual}* | ${mesAnteriorNome}: *${experimentaisAnterior}*\n`;
    texto += `Variação: *${varExp > 0 ? '+' : ''}${varExp.toFixed(1)}%* ${varExp > 0 ? '📈' : varExp < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `🏫 *VISITAS*\n`;
    texto += `${mesAtualNome}: *${visitasAtual}* | ${mesAnteriorNome}: *${visitasAnterior}*\n`;
    texto += `Variação: *${varVisitas > 0 ? '+' : ''}${varVisitas.toFixed(1)}%* ${varVisitas > 0 ? '📈' : varVisitas < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `✅ *MATRÍCULAS*\n`;
    texto += `${mesAtualNome}: *${matriculasAtual}* | ${mesAnteriorNome}: *${matriculasAnterior}*\n`;
    texto += `Variação: *${varMat > 0 ? '+' : ''}${varMat.toFixed(1)}%* ${varMat > 0 ? '📈' : varMat < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório comparativo anual (mesmo mês ano atual vs ano anterior)
  const gerarRelatorioComparativoAnual = async () => {
    const hoje = new Date();
    const competenciaComparativo = obterCompetenciaRelatorioMensalComercial();
    const mesAtual = competenciaComparativo.mes - 1;
    const anoAtual = competenciaComparativo.ano;
    const anoAnterior = anoAtual - 1;
    
    const unidadeId = isAdmin ? context?.unidadeSelecionada : usuario?.unidade_id;
    const unidadeRelatorioId = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
    let unidadeNome = unidadeRelatorioId ? 'Unidade' : 'Consolidado';
    let hunterNome = unidadeRelatorioId ? (usuario?.nome || 'Usuário') : 'Todos';
    
    if (unidadeRelatorioId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeRelatorioId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados do mês atual no ano atual
    const inicioMesAtual = new Date(anoAtual, mesAtual, 1);
    const fimMesAtual = new Date(anoAtual, mesAtual + 1, 0);
    
    let dadosAnoAtualQuery = supabase
      .from('leads')
      .select('status, quantidade, experimental_agendada')
      .gte('data_contato', inicioMesAtual.toISOString().split('T')[0])
      .lte('data_contato', fimMesAtual.toISOString().split('T')[0]);
    if (unidadeRelatorioId) dadosAnoAtualQuery = dadosAnoAtualQuery.eq('unidade_id', unidadeRelatorioId);
    const { data: dadosAnoAtual } = await dadosAnoAtualQuery;

    // Buscar dados do mesmo mês no ano anterior
    const inicioMesAnterior = new Date(anoAnterior, mesAtual, 1);
    const fimMesAnterior = new Date(anoAnterior, mesAtual + 1, 0);

    let dadosAnoAnteriorQuery = supabase
      .from('leads')
      .select('status, quantidade, experimental_agendada')
      .gte('data_contato', inicioMesAnterior.toISOString().split('T')[0])
      .lte('data_contato', fimMesAnterior.toISOString().split('T')[0]);
    if (unidadeRelatorioId) dadosAnoAnteriorQuery = dadosAnoAnteriorQuery.eq('unidade_id', unidadeRelatorioId);
    const { data: dadosAnoAnterior } = await dadosAnoAnteriorQuery;

    // Calcular totais ano atual
    const leadsAtual = dadosAnoAtual?.reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisAtual = dadosAnoAtual?.filter(r => r.experimental_agendada === true).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasAtual = dadosAnoAtual?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasAtual = (await buscarMatriculasAlunos(unidadeRelatorioId, inicioMesAtual.toISOString().split('T')[0], fimMesAtual.toISOString().split('T')[0])).filter(ehMatriculaNova).length;

    // Calcular totais ano anterior
    const leadsAnterior = dadosAnoAnterior?.reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisAnterior = dadosAnoAnterior?.filter(r => r.experimental_agendada === true).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasAnterior = dadosAnoAnterior?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasAnterior = (await buscarMatriculasAlunos(unidadeRelatorioId, inicioMesAnterior.toISOString().split('T')[0], fimMesAnterior.toISOString().split('T')[0])).filter(ehMatriculaNova).length;

    // Calcular variações
    const varLeads = leadsAnterior > 0 ? ((leadsAtual - leadsAnterior) / leadsAnterior * 100) : 0;
    const varExp = experimentaisAnterior > 0 ? ((experimentaisAtual - experimentaisAnterior) / experimentaisAnterior * 100) : 0;
    const varVisitas = visitasAnterior > 0 ? ((visitasAtual - visitasAnterior) / visitasAnterior * 100) : 0;
    const varMat = matriculasAnterior > 0 ? ((matriculasAtual - matriculasAnterior) / matriculasAnterior * 100) : 0;

    const mesNome = new Date(anoAtual, mesAtual, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO COMPARATIVO ANUAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    texto += `📅 *${mesNome}/${anoAtual}* vs *${mesNome}/${anoAnterior}*\n\n`;
    
    texto += `🎯 *LEADS*\n`;
    texto += `${anoAtual}: *${leadsAtual}* | ${anoAnterior}: *${leadsAnterior}*\n`;
    texto += `Variação: *${varLeads > 0 ? '+' : ''}${varLeads.toFixed(1)}%* ${varLeads > 0 ? '📈' : varLeads < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `🎸 *EXPERIMENTAIS*\n`;
    texto += `${anoAtual}: *${experimentaisAtual}* | ${anoAnterior}: *${experimentaisAnterior}*\n`;
    texto += `Variação: *${varExp > 0 ? '+' : ''}${varExp.toFixed(1)}%* ${varExp > 0 ? '📈' : varExp < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `🏫 *VISITAS*\n`;
    texto += `${anoAtual}: *${visitasAtual}* | ${anoAnterior}: *${visitasAnterior}*\n`;
    texto += `Variação: *${varVisitas > 0 ? '+' : ''}${varVisitas.toFixed(1)}%* ${varVisitas > 0 ? '📈' : varVisitas < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `✅ *MATRÍCULAS*\n`;
    texto += `${anoAtual}: *${matriculasAtual}* | ${anoAnterior}: *${matriculasAnterior}*\n`;
    texto += `Variação: *${varMat > 0 ? '+' : ''}${varMat.toFixed(1)}%* ${varMat > 0 ? '📈' : varMat < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  const copiarRelatorio = async () => {
    let texto = '';
    
    switch (tipoRelatorio) {
      case 'diario':
        texto = await gerarRelatorioDiario();
        break;
      case 'semanal':
        texto = await gerarRelatorioSemanal();
        break;
      case 'mensal':
        texto = await gerarRelatorioMensal();
        break;
      case 'matriculas':
        texto = await gerarRelatorioMatriculas();
        break;
      case 'comparativo_mensal':
        texto = await gerarRelatorioComparativoMensal();
        break;
      case 'comparativo_anual':
        texto = await gerarRelatorioComparativoAnual();
        break;
      default:
        texto = await gerarRelatorioMensal();
    }
    
    // Clipboard API primeiro (confiável em HTTPS / dentro de modais)
    const copyResult = await copyTextToClipboard(texto);

    if (copyResult.ok) {
      toast.success('Relatório copiado!');
      return;
    }

    console.error('Erro ao copiar relatório comercial:', copyResult.error);
    toast.error(`Erro ao copiar. Selecione o texto e pressione ${getManualCopyShortcut()}.`);
  };

  // Enviar relatório via WhatsApp para o grupo
  const enviarWhatsAppGrupo = async () => {
    if (!relatorioTexto || enviandoWhatsApp) return;
    
    setEnviandoWhatsApp(true);
    setErroWhatsApp(null);
    setEnviadoWhatsApp(false);
    
    // Determinar a unidade para envio
    const unidadeEnvio = isAdmin ? (context?.unidadeSelecionada || 'todos') : (unidadeId || 'todos');
    
    try {
      const { data, error } = await supabase.functions.invoke('relatorio-admin-whatsapp', {
        body: {
          texto: relatorioTexto,
          tipoRelatorio: tipoRelatorio ? `comercial_${tipoRelatorio}` : 'comercial',
          unidade: unidadeEnvio,
          competencia: `${competencia.filtro.ano}-${String(competencia.filtro.mes).padStart(2, '0')}`,
          ...(numeroTeste ? { numero_teste: numeroTeste } : {}),
        },
      });
      
      if (error) {
        console.error('[WhatsApp Comercial] Erro ao enviar:', error);
        setErroWhatsApp('Erro ao enviar mensagem');
        return;
      }
      
      if (data?.success || data?.partial) {
        console.log('[WhatsApp Comercial] ✅ Mensagem enviada!', data.resultados);
        setEnviadoWhatsApp(true);
        toast.success('Relatório enviado para o grupo!');
        setTimeout(() => setEnviadoWhatsApp(false), 3000);
      } else {
        setErroWhatsApp(data?.error || 'Erro desconhecido');
        toast.error(data?.error || 'Erro ao enviar');
      }
    } catch (err) {
      console.error('[WhatsApp Comercial] Erro inesperado:', err);
      setErroWhatsApp('Erro de conexão');
      toast.error('Erro de conexão');
    } finally {
      setEnviandoWhatsApp(false);
    }
  };

  // Obter contagem do dia para cada tipo
  const getContagemHoje = (tipo: string) => {
    if (tipo === 'experimental') {
      return registrosHoje
        .filter(r => r.experimental_agendada === true)
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    if (tipo === 'visita') {
      return registrosHoje
        .filter(r => r.status === 'visita_escola')
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    if (tipo === 'lead') {
      return registrosHoje
        .filter(r => ['novo','agendado'].includes(r.status))
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    if (tipo === 'matricula') {
      const hojeISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      return matriculasMes
        .filter((m: any) => ehMatriculaNova(m) && ((m.data_matricula || m.data_conversao || m.data_contato) === hojeISO))
        .length;
    }
    return registrosHoje
      .filter(r => r.status === tipo)
      .reduce((acc, r) => acc + r.quantidade, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // Calcular totais de hoje
  const hojeLeads = getContagemHoje('lead');
  const hojeVisitas = getContagemHoje('visita');
  const hojeMatriculas = getContagemHoje('matricula');
  const hojeTotalRegistros = registrosHoje.length;

  // Data formatada
  const dataHoje = new Date().toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });
  // Usar o mês/ano do filtro de competência, não a data atual
  const mesAtual = new Date(competencia.filtro.ano, competencia.filtro.mes - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Linha de filtros / ações */}
      <PageFilterBar className="gap-4">
        <CompetenciaFilter
          filtro={competencia.filtro}
          range={competencia.range}
          anosDisponiveis={competencia.anosDisponiveis}
          onTipoChange={competencia.setTipo}
          onAnoChange={competencia.setAno}
          onMesChange={competencia.setMes}
          onTrimestreChange={competencia.setTrimestre}
          onSemestreChange={competencia.setSemestre}
          onDataInicioChange={competencia.setDataInicio}
          onDataFimChange={competencia.setDataFim}
        />
        <button
          onClick={() => setRelatorioOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20"
        >
          <Copy className="w-4 h-4" />
          Gerar Relatório WhatsApp
        </button>
      </PageFilterBar>

      {/* ABAS PRINCIPAIS */}
      <PageTabs
        tabs={[
          { id: 'lancamentos' as const, label: 'Lançamentos', shortLabel: 'Lanç.', icon: Zap, activeGradient: 'from-cyan-500 to-blue-500', activeShadow: 'shadow-cyan-500/20' },
          { id: 'conciliacao' as const, label: 'Conciliação', shortLabel: 'Conciliar', icon: ClipboardCheck, activeGradient: 'from-teal-400 to-teal-700', activeShadow: 'shadow-teal-500/20' },
          { id: 'programa' as const, label: 'Programa Matriculador+ LA', shortLabel: 'Matriculador+', icon: Trophy, activeGradient: 'from-yellow-500 to-orange-500', activeShadow: 'shadow-yellow-500/20' },
          { id: 'tarefas' as const, label: 'Tarefas Rápidas', shortLabel: 'Tarefas', icon: CheckSquare, activeGradient: 'from-violet-500 to-fuchsia-700', activeShadow: 'shadow-violet-500/20' },
        ]}
        activeTab={abaPrincipal}
        onTabChange={setAbaPrincipal}
      />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CONTEÚDO DA ABA PROGRAMA */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {abaPrincipal === 'conciliacao' && (
        <ComercialConciliacaoExperimentais
          unidadeId={isAdmin ? (context?.unidadeSelecionada || 'todos') : unidadeId}
          ano={competencia.filtro.ano}
          mes={competencia.filtro.mes}
        />
      )}

      {abaPrincipal === 'programa' && (
        <TabProgramaMatriculador
          unidadeId={isAdmin ? (context?.unidadeSelecionada || 'todos') : unidadeId}
          ano={competencia.filtro.ano}
          mes={competencia.filtro.mes}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CONTEÚDO DA ABA TAREFAS RÁPIDAS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {abaPrincipal === 'tarefas' && (
        <TarefasRapidasTab
          contexto="comercial"
          unidadeId={isAdmin ? (context?.unidadeSelecionada || 'todos') : (unidadeId || 'todos')}
          isAdmin={isAdmin}
          accentGradient="from-emerald-600 to-teal-600"
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CONTEÚDO DA ABA LANÇAMENTOS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {abaPrincipal === 'lancamentos' && (
        <>
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ALERTAS COMERCIAL (IA) */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <AlertasComercial 
        unidadeId={isAdmin ? (context?.unidadeSelecionada || 'todos') : (unidadeId || 'todos')}
        ano={competencia.filtro.ano}
        mes={competencia.filtro.mes}
        resumoLeads={resumo}
        totalMatriculasMes={matriculasMes.filter(ehMatriculaNova).length}
      />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 1: LANÇAMENTO DE HOJE */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-cyan-500/20 rounded-2xl overflow-hidden">
        {/* Header da seção */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Lançamento de Hoje</h2>
                <p className="text-sm text-cyan-400 capitalize">{dataHoje}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{hojeTotalRegistros}</p>
              <p className="text-xs text-slate-400">registros hoje</p>
            </div>
          </div>
        </div>

        {/* Quick Input Cards - HOJE */}
        <div className="p-6">
          <p className="text-sm text-slate-400 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Clique para adicionar um novo registro
          </p>
          <div data-tour="cards-resumo" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickInputCards.map((card) => {
              const Icon = card.icon;
              const contagemHoje = getContagemHoje(card.id);
              const isClickable = card.id === 'lead' || card.id === 'matricula' || card.id === 'experimental';

              return (
                <button
                  key={card.id}
                  data-tour={`btn-${card.id}`}
                  onClick={() => isClickable && setModalOpen(card.id)}
                  className={cn(
                    "group relative p-5 rounded-2xl border-2 transition-all",
                    card.bgColor,
                    card.borderColor,
                    isClickable ? "hover:scale-[1.02] hover:shadow-xl hover:border-opacity-60 cursor-pointer" : "cursor-default opacity-90"
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center",
                      `bg-gradient-to-br ${card.color}`
                    )}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    {isClickable && (
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                        <Plus className={cn("w-4 h-4", card.textColor)} />
                      </div>
                    )}
                  </div>
                  <div className="text-left">
                    <p className={cn("text-3xl font-bold mb-0.5", card.textColor)}>{contagemHoje}</p>
                    <p className="text-slate-400 text-sm font-medium">{card.label}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Lista de registros de hoje (se houver) */}
          {registrosHoje.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <p className="text-sm text-slate-400 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Últimos registros de hoje
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {registrosHoje.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        ['novo','agendado'].includes(r.status) ? 'bg-blue-400' :
                        r.status?.startsWith('experimental') ? 'bg-purple-400' :
                        r.status === 'visita_escola' ? 'bg-amber-400' : 'bg-emerald-400'
                      )} />
                      <span className="text-slate-300 capitalize">
                        {['novo','agendado'].includes(r.status) ? 'Lead' :
                         r.status === 'experimental_agendada' ? 'Exp. Agendada' :
                         r.status === 'experimental_realizada' ? 'Exp. Realizada' :
                         r.status === 'experimental_faltou' ? 'Exp. Faltou' :
                         r.status === 'visita_escola' ? 'Visita' : 'Matrícula'}
                      </span>
                    </div>
                    <span className="text-white font-medium">+{r.quantidade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 2: ACUMULADO DO MÊS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        {/* Header da seção */}
        <div className="bg-slate-800/80 border-b border-slate-700/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Acumulado do Mês</h2>
              <p className="text-sm text-slate-400 capitalize">{mesAtual}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Totais do Mês */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Totais
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tooltip content="Total de leads registrados no mês (por data de contato). Inclui todos os status." side="bottom">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30 cursor-help">
                  <div className="flex items-center gap-2 mb-2">
                    <Smartphone className="w-4 h-4 text-blue-400" />
                    <span className="text-xs text-slate-400 font-medium">Leads Atendidos</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-400">{resumo.leads}</p>
                  {hojeLeads > 0 && (
                    <p className="text-xs text-emerald-400 mt-1">+{hojeLeads} hoje</p>
                  )}
                </div>
              </Tooltip>
              <Tooltip content="Experimentais realizadas confirmadas pela conciliacao v2/Emusys: aluno vinculado, presença individual e aula experimental." side="bottom">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30 cursor-help">
                  <div className="flex items-center gap-2 mb-2">
                    <Guitar className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-slate-400 font-medium">Experimentais confirmadas</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-400">{resumo.experimentais}</p>
                </div>
              </Tooltip>
              <Tooltip content="Leads que visitaram a escola no mês." side="bottom">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30 cursor-help">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-slate-400 font-medium">Visitas</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-400">{resumo.visitas}</p>
                  {hojeVisitas > 0 && (
                    <p className="text-xs text-emerald-400 mt-1">+{hojeVisitas} hoje</p>
                  )}
                </div>
              </Tooltip>
              <Tooltip content="Matrículas novas do mês pela fonte alunos. Exclui segundo curso, banda/projeto e passaporte zerado." side="bottom">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30 cursor-help">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-slate-400 font-medium">Matrículas novas</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">{resumo.matriculas}</p>
                  {hojeMatriculas > 0 && (
                    <p className="text-xs text-emerald-400 mt-1">+{hojeMatriculas} hoje</p>
                  )}
                </div>
              </Tooltip>
            </div>
          </div>

          {/* Conversões - 3 métricas */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Conversões
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Lead → Experimental */}
              <Tooltip content="Leads do mes para experimentais realizadas confirmadas pela conciliacao v2/Emusys." side="bottom">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30 cursor-help">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-blue-400 text-sm font-medium">Lead</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span className="text-purple-400 text-sm font-medium">Experimental confirmada</span>
                  </div>
                  <p className="text-3xl font-bold text-cyan-400 mb-2">{resumo.conversaoLeadExp.toFixed(1)}%</p>
                  <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(resumo.conversaoLeadExp, 100)}%` }}
                    />
                  </div>
                </div>
              </Tooltip>

              {/* Experimental → Matrícula */}
              <Tooltip
                content={resumo.taxaExpMatLiberada
                  ? 'KPI canonico: conversoes / experimentais realizadas confirmadas por presenca ou decisao humana.'
                  : (resumo.denominadorExpMat || 0) === 0 && (resumo.pendenciasExpMat || 0) === 0
                    ? 'Competencia sem base de experimentais confirmadas e sem pendencias de conciliacao.'
                  : 'Bloqueada ate a conciliacao de presenca/vinculo ficar completa.'
                }
                side="bottom"
              >
                <div className={cn(
                  'bg-slate-900/60 rounded-xl p-4 border cursor-help',
                  resumo.taxaExpMatLiberada
                    ? 'border-emerald-500/30'
                    : (resumo.denominadorExpMat || 0) === 0 && (resumo.pendenciasExpMat || 0) === 0
                      ? 'border-cyan-500/30'
                      : 'border-amber-500/30'
                )}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-purple-400 text-sm font-medium">Experimental</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span className="text-emerald-400 text-sm font-medium">Matrícula</span>
                  </div>
                  {resumo.taxaExpMatLiberada ? (
                    <>
                      <p className="text-3xl font-bold text-emerald-400 mb-2">{resumo.conversaoExpMat.toFixed(1)}%</p>
                      <div className="w-full bg-slate-700/50 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-emerald-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(resumo.conversaoExpMat, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        {resumo.conversoesExpMat}/{resumo.denominadorExpMat} confirmadas.
                      </p>
                    </>
                  ) : (
                    <div className={cn(
                      'flex items-center gap-2 mb-2',
                      (resumo.denominadorExpMat || 0) === 0 && (resumo.pendenciasExpMat || 0) === 0
                        ? 'text-cyan-200'
                        : 'text-amber-200'
                    )}>
                      {(resumo.denominadorExpMat || 0) === 0 && (resumo.pendenciasExpMat || 0) === 0 ? (
                        <Clock className="w-4 h-4" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                      <p className="text-2xl font-bold">
                        {(resumo.denominadorExpMat || 0) === 0 && (resumo.pendenciasExpMat || 0) === 0 ? 'Sem base' : 'Bloqueada'}
                      </p>
                    </div>
                  )}
                  {!resumo.taxaExpMatLiberada && (
                    <p className="text-xs text-slate-400">
                      {(resumo.denominadorExpMat || 0) === 0 && (resumo.pendenciasExpMat || 0) === 0
                        ? '0 pendencia(s); aguardando experimentais confirmadas.'
                        : `${resumo.pendenciasExpMat} pendencia(s) de conciliacao.`}
                    </p>
                  )}
                </div>
              </Tooltip>

              {/* Lead → Matrícula (direto) */}
              <Tooltip content="Métrica operacional legada: matrículas / total de leads do mês." side="bottom">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30 cursor-help">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-blue-400 text-sm font-medium">Lead</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span className="text-emerald-400 text-sm font-medium">Matrícula</span>
                  </div>
                  <p className="text-3xl font-bold text-emerald-400 mb-2">{resumo.conversaoLeadMat.toFixed(1)}%</p>
                  <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(resumo.conversaoLeadMat, 100)}%` }}
                    />
                  </div>
                </div>
              </Tooltip>
            </div>
          </div>

          {/* Matrículas por Canal e por Curso */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Matrículas por Canal */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                Matrículas por Canal
              </h3>
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30 max-h-48 overflow-y-auto scrollbar-thin">
                {(resumo.matriculasPorCanal || []).length > 0 ? (
                  <div className="space-y-3">
                    {resumo.matriculasPorCanal.map((c, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-slate-300 text-sm">{c.canal}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-20 bg-slate-700/50 rounded-full h-2">
                            <div 
                              className="bg-emerald-500 h-2 rounded-full"
                              style={{ width: `${resumo.matriculas > 0 ? (c.quantidade / resumo.matriculas) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-white font-semibold w-8 text-right">{c.quantidade}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm text-center py-4">Nenhuma matrícula registrada ainda</p>
                )}
              </div>
            </div>

            {/* Matrículas por Curso */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Guitar className="w-4 h-4" />
                Matrículas por Curso
              </h3>
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30 max-h-48 overflow-y-auto scrollbar-thin">
                {(resumo.matriculasPorCurso || []).length > 0 ? (
                  <div className="space-y-3">
                    {resumo.matriculasPorCurso.map((c, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-slate-300 text-sm">{c.curso}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-20 bg-slate-700/50 rounded-full h-2">
                            <div 
                              className="bg-purple-500 h-2 rounded-full"
                              style={{ width: `${resumo.matriculas > 0 ? (c.quantidade / resumo.matriculas) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-white font-semibold w-8 text-right">{c.quantidade}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm text-center py-4">Nenhuma matrícula registrada ainda</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 3: DETALHAMENTO DO FUNIL */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section data-tour="comercial-detalhamento" className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        {/* Header da seção com abas */}
        <div className="px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Detalhamento do Funil</h2>
                <p className="text-sm text-slate-400">Visualize e edite os registros de cada etapa</p>
              </div>
            </div>
          </div>
          
          {/* Pipeline de navegação */}
          <div data-tour="comercial-abas-funil">
            <FunnelPipelineNav
              stages={[
                { key: 'leads', label: 'Novos', count: leadsMes.filter(l => !l.status || l.status === 'novo').length, icon: Smartphone, color: '#3b82f6', gradient: 'from-blue-500 to-cyan-500' },
                { key: 'experimental', label: 'Experimentais', count: (() => {
                  if (filtroTipoExp !== 'agendadas_periodo' && filtroPresencaExp === 'compareceram') {
                    return resumo.experimentais;
                  }
                  if (filtroTipoExp === 'agendadas_periodo') {
                    const { startDate, endDate } = competencia.range;
                    const toDateBRT = (ts: string) => ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
                    const noPeriodo = (e: any) => { const d = toDateBRT(e.created_at); return d >= (startDate || '') && d <= (endDate || ''); };
                    const presencaOk = (e: any) => filtroPresencaExp === 'compareceram' ? ['experimental_realizada', 'convertido'].includes(e.status) : filtroPresencaExp === 'faltaram' ? e.status === 'experimental_faltou' : true;
                    const fromMain = experimentaisDetalhadas.filter(noPeriodo).filter(presencaOk);
                    const ids = new Set(fromMain.map((e: any) => e.id));
                    const fromOutros = experimentaisHojeOutros.filter(noPeriodo).filter(presencaOk).filter((e: any) => !ids.has(e.id));
                    return fromMain.length + fromOutros.length;
                  }
                  return experimentaisDetalhadas.filter((e: any) => {
                    if (filtroTipoExp === 'leads_novos' && e.lead_aluno_id) return false;
                    if (filtroTipoExp === 'alunos' && !e.lead_aluno_id) return false;
                    if (filtroPresencaExp === 'compareceram' && !['experimental_realizada', 'convertido'].includes(e.status)) return false;
                    if (filtroPresencaExp === 'faltaram' && e.status !== 'experimental_faltou') return false;
                    return true;
                  }).length;
                })(), icon: Guitar, color: '#a855f7', gradient: 'from-purple-500 to-violet-500' },
                { key: 'visita', label: 'Visitas', count: visitasMes.length, icon: Building2, color: '#f59e0b', gradient: 'from-amber-500 to-orange-500' },
                { key: 'matricula', label: 'Matrículas novas', count: matriculasMes.filter((m: any) => { const banda = m.is_banda || m.curso_nome?.toLowerCase().includes('banda'); if (filtroTipoMat === 'novos_alunos') return ehMatriculaNova(m); if (filtroTipoMat === 'segundo_curso') return m.is_segundo_curso || banda; return true; }).length, icon: GraduationCap, color: '#10b981', gradient: 'from-emerald-500 to-teal-500' },
              ]}
              totalLeads={leadsMes.length}
              activeStage={abaDetalhamento}
              onStageClick={(key) => { setAbaDetalhamento(key as any); setSelecionadosFunil(new Set()); }}
            />
          </div>
        </div>

        {/* Campo de busca + filtros */}
        <div className="px-6 py-3 border-b border-slate-700/50">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar nome ou telefone..."
                value={buscaFunil}
                onChange={e => setBuscaFunil(e.target.value)}
                className="pl-9 bg-slate-800/50 border-slate-700 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
              <button
                onClick={() => setFiltroTelefoneFunil('todos')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  filtroTelefoneFunil === 'todos'
                    ? "bg-slate-600 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltroTelefoneFunil('com')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1",
                  filtroTelefoneFunil === 'com'
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Phone className="w-3 h-3" />
                Com tel.
              </button>
              <button
                onClick={() => setFiltroTelefoneFunil('sem')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1",
                  filtroTelefoneFunil === 'sem'
                    ? "bg-red-500/20 text-red-400"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <PhoneOff className="w-3 h-3" />
                Sem tel.
              </button>
            </div>
            {/* Filtro Canal */}
            <Select value={filtroCanalFunil} onValueChange={v => setFiltroCanalFunil(v)}>
              <SelectTrigger className="w-[170px] bg-slate-800/50 border-slate-700 h-9 text-xs">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os canais</SelectItem>
                {canais.map(c => (
                  <SelectItem key={c.value} value={String(c.value)}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Filtro Curso */}
            <Select value={filtroCursoFunil} onValueChange={v => setFiltroCursoFunil(v)}>
              <SelectTrigger className="w-[170px] bg-slate-800/50 border-slate-700 h-9 text-xs">
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os cursos</SelectItem>
                {cursos.map(c => (
                  <SelectItem key={c.value} value={String(c.value)}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Filtro Professor */}
            <Select value={filtroProfessorFunil} onValueChange={v => setFiltroProfessorFunil(v)}>
              <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 h-9 text-xs">
                <SelectValue placeholder="Professor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os professores</SelectItem>
                {professores.map(p => (
                  <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {abaDetalhamento === 'leads' && (
              <Select value={filtroIncompletoFunil} onValueChange={v => setFiltroIncompletoFunil(v)}>
                <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 h-9 text-xs">
                  <SelectValue placeholder="Dados incompletos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os leads</SelectItem>
                  <SelectItem value="sem_nome">Sem nome</SelectItem>
                  <SelectItem value="sem_canal">Sem canal de origem</SelectItem>
                  <SelectItem value="sem_curso">Sem curso de interesse</SelectItem>
                </SelectContent>
              </Select>
            )}
            {abaDetalhamento === 'experimental' && (
              <Select value={filtroTipoExp} onValueChange={v => setFiltroTipoExp(v as any)}>
                <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads_novos">Apenas leads novos</SelectItem>
                  <SelectItem value="todos">Todas as experimentais</SelectItem>
                  <SelectItem value="alunos">Apenas alunos</SelectItem>
                  <SelectItem value="agendadas_periodo">Agendadas no período</SelectItem>
                </SelectContent>
              </Select>
            )}
            {abaDetalhamento === 'experimental' && (
              <Select value={filtroPresencaExp} onValueChange={v => setFiltroPresencaExp(v as any)}>
                <SelectTrigger className="w-[160px] bg-slate-800/50 border-slate-700 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Toda presença</SelectItem>
                  <SelectItem value="compareceram">Compareceram</SelectItem>
                  <SelectItem value="faltaram">Faltaram</SelectItem>
                </SelectContent>
              </Select>
            )}
            {abaDetalhamento === 'experimental' && (
              <div
                className="flex items-center gap-1.5 h-9 px-2.5 rounded-md bg-slate-800/30 border border-slate-700/50 text-[11px] text-slate-400"
                title={filtroTipoExp === 'agendadas_periodo'
                  ? 'Mostrando as experimentais marcadas (agendadas) dentro do período, pela data de agendamento.'
                  : 'O filtro de período considera a data da aula experimental, não a data em que foi agendada.'}
              >
                <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                <span>Período: <span className="text-slate-300 font-medium">{filtroTipoExp === 'agendadas_periodo' ? 'data de agendamento' : 'data da aula'}</span></span>
              </div>
            )}
            {abaDetalhamento === 'matricula' && (
              <Select value={filtroTipoMat} onValueChange={v => setFiltroTipoMat(v as any)}>
                <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="novos_alunos">
                    <div>
                      <span>Novos alunos</span>
                      <p className="text-[10px] text-slate-400 leading-tight">Sem segundo curso, banda ou bolsistas</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="todos">
                    <div>
                      <span>Todos</span>
                      <p className="text-[10px] text-slate-400 leading-tight">Todas as matrículas do mês</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="segundo_curso">
                    <div>
                      <span>Segundo curso / Banda</span>
                      <p className="text-[10px] text-slate-400 leading-tight">Apenas matrículas de segundo curso ou banda</p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            {(filtroIncompletoFunil !== 'todos' || filtroCanalFunil !== 'todos' || filtroCursoFunil !== 'todos' || filtroProfessorFunil !== 'todos') && (
              <button
                onClick={() => { setFiltroIncompletoFunil('todos'); setFiltroCanalFunil('todos'); setFiltroCursoFunil('todos'); setFiltroProfessorFunil('todos'); }}
                className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABELA DE LEADS ATENDIDOS */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {abaDetalhamento === 'leads' && (() => {
          const statusLabel: Record<string, { label: string; color: string }> = {
            novo: { label: 'Novo', color: 'bg-slate-500/20 text-slate-400' },
            experimental_agendada: { label: 'Exp. Agendada', color: 'bg-amber-500/20 text-amber-400' },
            experimental_realizada: { label: 'Exp. Realizada', color: 'bg-emerald-500/20 text-emerald-400' },
            experimental_cancelada: { label: 'Exp. Cancelada', color: 'bg-rose-500/20 text-rose-400' },
            experimental_faltou: { label: 'Exp. Faltou', color: 'bg-rose-500/20 text-rose-400' },
            visita_escola: { label: 'Visita', color: 'bg-cyan-500/20 text-cyan-400' },
            matriculado: { label: 'Matriculado', color: 'bg-violet-500/20 text-violet-400' },
            convertido: { label: 'Convertido', color: 'bg-violet-500/20 text-violet-400' },
            arquivado: { label: 'Arquivado', color: 'bg-slate-600/20 text-slate-500' },
          };

          const leadsFiltrados = leadsMes.filter(l => {
            if (buscaFunil) {
              const termo = normalizar(buscaFunil);
              const digits = buscaFunil.replace(/\D/g, '');
              const matchNome = normalizar(l.nome || '').includes(termo);
              const matchTel = digits.length > 0 && ((l as any).telefone || '').includes(digits);
              if (!matchNome && !matchTel) return false;
            }
            if (filtroTelefoneFunil === 'sem') {
              const tel = ((l as any).telefone || '').trim();
              if (tel !== '' && tel !== '-') return false;
            } else if (filtroTelefoneFunil === 'com') {
              const tel = ((l as any).telefone || '').trim();
              if (tel === '' || tel === '-') return false;
            }
            // Filtros de dados incompletos
            if (filtroIncompletoFunil === 'sem_nome') {
              const nome = (l.nome || '').trim();
              if (nome !== '' && nome !== '-') return false;
            } else if (filtroIncompletoFunil === 'sem_canal') {
              if (l.canal_origem_id !== null) return false;
            } else if (filtroIncompletoFunil === 'sem_curso') {
              if (l.curso_interesse_id !== null) return false;
            }
            // Filtro por canal
            if (filtroCanalFunil !== 'todos') {
              if (String(l.canal_origem_id) !== filtroCanalFunil) return false;
            }
            // Filtro por curso
            if (filtroCursoFunil !== 'todos') {
              if (String(l.curso_interesse_id) !== filtroCursoFunil) return false;
            }
            // Filtro por professor (experimental)
            if (filtroProfessorFunil !== 'todos') {
              if (String(l.professor_experimental_id) !== filtroProfessorFunil) return false;
            }
            return true;
          });
          return (
          <div className="p-4 overflow-x-auto">
            {/* Barra de ações em lote */}
            {selecionadosFunil.size > 0 && (
              <div className="mb-3 flex items-center gap-3 bg-violet-500/10 border border-violet-500/30 rounded-lg px-4 py-2.5">
                <span className="text-sm text-violet-300">
                  <strong>{selecionadosFunil.size}</strong> selecionado{selecionadosFunil.size > 1 ? 's' : ''}
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs border-violet-500/50 text-violet-400 hover:bg-violet-500/20">
                      <ChevronRight className="w-3 h-3 mr-1" /> Mover Etapa
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    {bulkExpForm ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-300 px-1">Agendar Experimental ({selecionadosFunil.size} leads)</p>
                        <div>
                          <label className="text-[10px] text-slate-500 mb-0.5 block px-1">Professor</label>
                          <Command className="rounded-md border border-slate-700 bg-slate-800/50">
                            <CommandInput placeholder="Buscar professor..." className="h-7 text-xs" />
                            <CommandList className="max-h-[160px]">
                              <CommandEmpty className="py-2 text-center text-xs">Nenhum encontrado</CommandEmpty>
                              <CommandGroup>
                                {professores.map(p => (
                                  <CommandItem
                                    key={p.value}
                                    value={p.label}
                                    onSelect={() => setBulkExpForm(prev => prev ? { ...prev, professorId: p.value.toString() } : prev)}
                                    className="text-xs"
                                  >
                                    {p.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                          {bulkExpForm.professorId && (
                            <p className="text-[10px] text-violet-400 px-1 mt-0.5">
                              {professores.find(p => p.value.toString() === bulkExpForm.professorId)?.label}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 mb-0.5 block px-1">Data da experimental</label>
                          <input
                            type="date"
                            value={bulkExpForm.dataExp}
                            onChange={(e) => setBulkExpForm(prev => prev ? { ...prev, dataExp: e.target.value } : prev)}
                            className="w-full h-7 rounded-md bg-slate-800/50 border border-slate-700 text-xs text-white px-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                        <div className="flex gap-1 pt-1">
                          <button
                            onClick={() => setBulkExpForm(null)}
                            className="flex-1 px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => {
                              handleBulkMoverEtapa(5, {
                                ...(bulkExpForm.professorId ? { professor_experimental_id: Number(bulkExpForm.professorId) } : {}),
                                ...(bulkExpForm.dataExp ? { data_experimental: bulkExpForm.dataExp } : {}),
                              });
                              setBulkExpForm(null);
                            }}
                            className="flex-1 px-2 py-1 text-xs rounded bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                          >
                            Confirmar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-400 mb-2 px-1">Mover para:</p>
                        {[
                          { etapa: 5, label: 'Exp. Agendada' },
                          { etapa: 6, label: 'Visita Agendada' },
                          { etapa: 7, label: 'Exp. Realizada' },
                          { etapa: 9, label: 'Faltou' },
                        ].map(opt => (
                          <button
                            key={opt.etapa}
                            onClick={() => {
                              if (opt.etapa === 5) {
                                setBulkExpForm({ professorId: '', dataExp: '' });
                              } else {
                                handleBulkMoverEtapa(opt.etapa);
                              }
                            }}
                            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-700 text-slate-300 transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </>
                    )}
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                  onClick={() => setShowBulkDeleteDialog(true)}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Excluir selecionados
                </Button>
                <button
                  onClick={() => setSelecionadosFunil(new Set())}
                  className="text-xs text-slate-500 hover:text-white flex items-center gap-1 ml-auto transition-colors"
                >
                  <X className="w-3 h-3" /> Limpar seleção
                </button>
              </div>
            )}
            {(() => {
              // Quando há busca, separar leads novos dos de outras etapas
              const leadsBase = leadsFiltrados.filter(l => !l.status || l.status === 'novo');
              const leadsOutrasEtapas = buscaFunil ? leadsFiltrados.filter(l => l.status && l.status !== 'novo') : [];

              // Ordenação
              type LeadComCampos = LeadDiario & { canal_nome?: string; curso_nome?: string; telefone?: string };
              const leadsTabela = sortArray(leadsBase as LeadComCampos[], sortNovos, (l: LeadComCampos, col) => {
                switch (col) {
                  case 'data': return l.data_contato;
                  case 'nome': return l.nome;
                  case 'telefone': return l.telefone;
                  case 'canal': return l.canal_nome;
                  case 'curso': return l.curso_nome;
                  case 'etapa': return l.etapa_pipeline_id;
                  case 'unidade': return l.unidades?.codigo;
                  default: return null;
                }
              });

              // Paginação
              const LEADS_POR_PAGINA = 50;
              const totalPaginas = Math.ceil(leadsTabela.length / LEADS_POR_PAGINA);
              const leadsVisiveis = leadsTabela.slice((paginaLeads - 1) * LEADS_POR_PAGINA, paginaLeads * LEADS_POR_PAGINA);
              return (<>
            {leadsTabela.length > 0 ? (<>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3 px-2 w-10">
                      <input
                        type="checkbox"
                        checked={leadsVisiveis.length > 0 && leadsVisiveis.every(l => selecionadosFunil.has(l.id!))}
                        onChange={() => toggleTodosFunil(leadsVisiveis)}
                        className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 cursor-pointer"
                      />
                    </th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
                    <SortableTh col="data" label="Data" sort={sortNovos} onSort={(c) => setSortNovos(prev => nextSort(prev, c))} />
                    <SortableTh col="nome" label="Nome" sort={sortNovos} onSort={(c) => setSortNovos(prev => nextSort(prev, c))} />
                    <SortableTh col="telefone" label="Telefone" sort={sortNovos} onSort={(c) => setSortNovos(prev => nextSort(prev, c))} />
                    <SortableTh col="canal" label="Canal" sort={sortNovos} onSort={(c) => setSortNovos(prev => nextSort(prev, c))} />
                    <SortableTh col="curso" label="Curso" sort={sortNovos} onSort={(c) => setSortNovos(prev => nextSort(prev, c))} />
                    <SortableTh col="etapa" label="Etapa" sort={sortNovos} onSort={(c) => setSortNovos(prev => nextSort(prev, c))} />
                    {isAdmin && <SortableTh col="unidade" label="Unidade" sort={sortNovos} onSort={(c) => setSortNovos(prev => nextSort(prev, c))} />}
                    <th className="pb-3 px-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsVisiveis.map((lead, index) => (
                    <tr
                      key={lead.id}
                      className={cn(
                        "border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors",
                        selecionadosFunil.has(lead.id!) && "bg-violet-500/10"
                      )}
                    >
                      <td className="py-3 px-2">
                        <input
                          type="checkbox"
                          checked={selecionadosFunil.has(lead.id!)}
                          onChange={() => lead.id && toggleSelecionadoFunil(lead.id)}
                          className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{(paginaLeads - 1) * LEADS_POR_PAGINA + index + 1}</td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={lead.data_contato}
                          onChange={async (valor) => lead.id && salvarCampoLead(lead.id,'data_contato', valor)}
                          tipo="data"
                          textClassName="text-slate-300"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={lead.nome}
                          onChange={async (valor) => lead.id && salvarCampoLead(lead.id,'nome', valor)}
                          tipo="texto"
                          textClassName="text-white font-medium"
                          placeholder="-"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={(lead as any).telefone}
                          onChange={async (valor) => lead.id && salvarCampoLead(lead.id,'telefone', valor)}
                          tipo="texto"
                          textClassName="text-emerald-400"
                          placeholder="-"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={lead.canal_origem_id}
                          onChange={async (valor) => lead.id && salvarCampoLead(lead.id,'canal_origem_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <CanalOrigemBadge canal={lead.canal_nome || '-'} />}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={lead.curso_interesse_id}
                          onChange={async (valor) => lead.id && salvarCampoLead(lead.id,'curso_interesse_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-purple-400">{lead.curso_nome || '-'}</span>}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        {(() => {
                          const etapa = lead.etapa_pipeline_id || 1;
                          const st = statusLabel[lead.status] || statusLabel.novo;
                          const transicoes = transicoesEtapa[etapa] || [];
                          return (
                            <div className="flex items-center gap-1">
                              <span className={cn("px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap", st.color)}>
                                {st.label}
                              </span>
                              {transicoes.length > 0 && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="p-0.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Mover etapa">
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 p-2" align="start">
                                    {moverEtapaForm?.leadId === lead.id ? (
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-slate-300 px-1">Agendar Experimental</p>
                                        <div>
                                          <label className="text-[10px] text-slate-500 mb-0.5 block px-1">Professor</label>
                                          <Command className="rounded-md border border-slate-700 bg-slate-800/50">
                                            <CommandInput placeholder="Buscar professor..." className="h-7 text-xs" />
                                            <CommandList className="max-h-[160px]">
                                              <CommandEmpty className="py-2 text-center text-xs">Nenhum encontrado</CommandEmpty>
                                              <CommandGroup>
                                                {professores.map(p => (
                                                  <CommandItem
                                                    key={p.value}
                                                    value={p.label}
                                                    onSelect={() => setMoverEtapaForm(prev => prev ? { ...prev, professorId: p.value.toString() } : prev)}
                                                    className="text-xs"
                                                  >
                                                    {p.label}
                                                  </CommandItem>
                                                ))}
                                              </CommandGroup>
                                            </CommandList>
                                          </Command>
                                          {moverEtapaForm.professorId && (
                                            <p className="text-[10px] text-violet-400 px-1 mt-0.5">
                                              {professores.find(p => p.value.toString() === moverEtapaForm.professorId)?.label}
                                            </p>
                                          )}
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-slate-500 mb-0.5 block px-1">Data da experimental</label>
                                          <input
                                            type="date"
                                            value={moverEtapaForm.dataExp}
                                            onChange={(e) => setMoverEtapaForm(prev => prev ? { ...prev, dataExp: e.target.value } : prev)}
                                            className="w-full h-7 rounded-md bg-slate-800/50 border border-slate-700 text-xs text-white px-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
                                          />
                                        </div>
                                        <div className="flex gap-1 pt-1">
                                          <button
                                            onClick={() => setMoverEtapaForm(null)}
                                            className="flex-1 px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                                          >
                                            Cancelar
                                          </button>
                                          <button
                                            onClick={() => {
                                              handleMoverEtapa(lead.id!, moverEtapaForm.etapa, {
                                                ...(moverEtapaForm.professorId ? { professor_experimental_id: Number(moverEtapaForm.professorId) } : {}),
                                                ...(moverEtapaForm.dataExp ? { data_experimental: moverEtapaForm.dataExp } : {}),
                                              });
                                              setMoverEtapaForm(null);
                                            }}
                                            className="flex-1 px-2 py-1 text-xs rounded bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                                          >
                                            Confirmar
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="text-xs text-slate-400 mb-2 px-1">Avançar para:</p>
                                        {transicoes.map(t => (
                                          <button
                                            key={t.etapa}
                                            onClick={() => {
                                              if (t.etapa === 5) {
                                                setMoverEtapaForm({ leadId: lead.id!, etapa: 5, professorId: '', dataExp: '' });
                                              } else if (t.etapa === 10) {
                                                setLeadParaMatricular(toLeadCRM(lead));
                                              } else {
                                                handleMoverEtapa(lead.id!, t.etapa);
                                              }
                                            }}
                                            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-700 text-slate-300 transition-colors"
                                          >
                                            {t.label}
                                          </button>
                                        ))}
                                        {/* Arquivar sempre disponível */}
                                        <div className="border-t border-slate-700/50 mt-1 pt-1">
                                          <button
                                            onClick={() => setLeadParaEditar({ lead: toLeadCRM(lead) })}
                                            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                                          >
                                            Editar
                                          </button>
                                          <button
                                            onClick={() => setLeadParaArquivar(toLeadCRM(lead))}
                                            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
                                          >
                                            Arquivar
                                          </button>
                                        </div>
                                        {/* Voltar para etapa anterior */}
                                        {voltarEtapa[etapa] && (
                                          <div className="border-t border-slate-700/50 mt-1 pt-1">
                                            <button
                                              onClick={() => handleMoverEtapa(lead.id!, voltarEtapa[etapa]!.etapa)}
                                              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-700 text-slate-500 transition-colors flex items-center gap-1"
                                            >
                                              <RotateCcw className="w-3 h-3" /> Voltar para {voltarEtapa[etapa]!.label}
                                            </button>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-2 border-r border-slate-700/30">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                            {(lead as any).unidades?.codigo || '-'}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => lead.id && setDeleteId(lead.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between mt-3 px-2">
                  <span className="text-xs text-slate-500">
                    {leadsTabela.length} leads — página {paginaLeads} de {totalPaginas}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={paginaLeads <= 1}
                      onClick={() => setPaginaLeads(p => p - 1)}
                      className="h-7 text-xs border-slate-700 text-slate-400 hover:text-white"
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={paginaLeads >= totalPaginas}
                      onClick={() => setPaginaLeads(p => p + 1)}
                      className="h-7 text-xs border-slate-700 text-slate-400 hover:text-white"
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>) : leadsOutrasEtapas.length === 0 ? (
              <div className="text-center py-12">
                <Smartphone className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">
                  {buscaFunil || filtroIncompletoFunil !== 'todos' ? 'Nenhum lead encontrado com os filtros atuais' : 'Nenhum lead atendido registrado ainda'}
                </p>
                {!buscaFunil && filtroIncompletoFunil === 'todos' && <p className="text-slate-500 text-sm mt-1">Clique no card "Leads Atendidos" acima para adicionar</p>}
              </div>
            ) : null}

            {/* Seção: leads encontrados em outras etapas (quando há busca) */}
            {leadsOutrasEtapas.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-violet-500/30" />
                  <span className="text-xs text-violet-400 font-medium whitespace-nowrap">
                    Encontrados em outras etapas ({leadsOutrasEtapas.length})
                  </span>
                  <div className="h-px flex-1 bg-violet-500/30" />
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {leadsOutrasEtapas.map((lead) => {
                      const st = statusLabel[lead.status] || { label: lead.status, color: 'bg-slate-500/20 text-slate-400' };
                      return (
                        <tr
                          key={lead.id}
                          className="border-b border-slate-700/50 bg-violet-500/5 hover:bg-violet-500/10 transition-colors"
                        >
                          <td className="py-3 px-2 w-10">
                            <input
                              type="checkbox"
                              checked={selecionadosFunil.has(lead.id!)}
                              onChange={() => lead.id && toggleSelecionadoFunil(lead.id)}
                              className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">-</td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <CelulaEditavelInline
                              value={lead.data_contato}
                              onChange={async (valor) => lead.id && salvarCampoLead(lead.id,'data_contato', valor)}
                              tipo="data"
                              textClassName="text-slate-300"
                            />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <span className="text-white font-medium">{lead.nome || '-'}</span>
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', st.color)}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <span className="text-emerald-400">{(lead as any).telefone || '-'}</span>
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <CanalOrigemBadge canal={lead.canal_nome || '-'} />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <span className="text-purple-400">{lead.curso_nome || '-'}</span>
                          </td>
                          {isAdmin && (
                            <td className="py-3 px-2 border-r border-slate-700/30">
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                                {(lead as any).unidades?.codigo || '-'}
                              </span>
                            </td>
                          )}
                          <td className="py-3 px-2 text-right">
                            <button
                              onClick={() => lead.id && setDeleteId(lead.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </>); })()}

            {/* Resultados globais (outros períodos) */}
            {buscandoGlobal && (
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-3">
                <Loader2 className="w-3 h-3 animate-spin" /> Buscando em outros períodos...
              </div>
            )}
            {leadsGlobais.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-amber-500/30" />
                  <span className="text-xs text-amber-400 font-medium whitespace-nowrap">
                    Encontrados em outros períodos ({leadsGlobais.length})
                  </span>
                  <div className="h-px flex-1 bg-amber-500/30" />
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {leadsGlobais.map((lead, index) => {
                      const dataLead = new Date(lead.data_contato + 'T12:00:00');
                      const mesLabel = dataLead.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: '2-digit' });
                      return (
                        <tr
                          key={lead.id}
                          className="border-b border-slate-700/50 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                        >
                          <td className="py-3 px-2 w-10">
                            <input
                              type="checkbox"
                              checked={selecionadosFunil.has(lead.id!)}
                              onChange={() => lead.id && toggleSelecionadoFunil(lead.id)}
                              className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">-</td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400">
                              {mesLabel}
                            </span>
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <span className="text-white font-medium">{lead.nome || '-'}</span>
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            {(() => {
                              const st = statusLabel[lead.status] || { label: lead.status, color: 'bg-slate-500/20 text-slate-400' };
                              return (
                                <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', st.color)}>
                                  {st.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <span className="text-emerald-400">{lead.telefone || '-'}</span>
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <CanalOrigemBadge canal={lead.canal_nome || '-'} />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <span className="text-purple-400">{lead.curso_nome || '-'}</span>
                          </td>
                          {isAdmin && (
                            <td className="py-3 px-2 border-r border-slate-700/30">
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                                {lead.unidades?.codigo || '-'}
                              </span>
                            </td>
                          )}
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setLeadParaEditar({ lead: lead as any })}
                                className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => lead.id && setDeleteId(lead.id)}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABELA DE EXPERIMENTAIS */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {abaDetalhamento === 'experimental' && (() => {
          // Quando "Agendadas no período": fonte = todas marcadas (created_at) no período,
          // combinando a lista principal (aula no período) com as de aula fora do período.
          const expBase = (() => {
            if (filtroTipoExp === 'agendadas_periodo') {
              const { startDate, endDate } = competencia.range;
              const toDateBRT = (ts: string) => ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
              const noPeriodo = (e: any) => { const d = toDateBRT(e.created_at); return d >= (startDate || '') && d <= (endDate || ''); };
              const fromMain = experimentaisDetalhadas.filter(noPeriodo);
              const ids = new Set(fromMain.map((e: any) => e.id));
              const fromOutros = experimentaisHojeOutros.filter(noPeriodo).filter((e: any) => !ids.has(e.id));
              return [...fromMain, ...fromOutros];
            }
            return experimentaisDetalhadas;
          })();
          const expFiltradasRaw = expBase.filter((l: any) => {
            // Filtro por tipo (leads novos vs alunos)
            if (filtroTipoExp === 'leads_novos' && l.lead_aluno_id) return false;
            if (filtroTipoExp === 'alunos' && !l.lead_aluno_id) return false;
            // Filtro por presença (compareceram = realizada/convertido; faltaram = faltou)
            if (filtroPresencaExp === 'compareceram' && !['experimental_realizada', 'convertido'].includes(l.status)) return false;
            if (filtroPresencaExp === 'faltaram' && l.status !== 'experimental_faltou') return false;
            if (buscaFunil) {
              const termo = normalizar(buscaFunil);
              const digits = buscaFunil.replace(/\D/g, '');
              const matchNome = normalizar(l.nome_aluno || '').includes(termo) || normalizar(l.lead_nome || '').includes(termo);
              const matchTel = digits.length > 0 && (l.lead_telefone || '').includes(digits);
              if (!matchNome && !matchTel) return false;
            }
            if (filtroCanalFunil !== 'todos' && String(l.leads?.canal_origem_id) !== filtroCanalFunil) return false;
            if (filtroCursoFunil !== 'todos' && String(l.curso_interesse_id) !== filtroCursoFunil) return false;
            if (filtroProfessorFunil !== 'todos' && String(l.professor_experimental_id) !== filtroProfessorFunil) return false;
            return true;
          });
          // Ordenação (afeta a ordem dos grupos por lead_id — o primeiro item de cada grupo na lista ordenada vira o "header")
          const expFiltradas = sortArray(expFiltradasRaw, sortExperimentais, (l: any, col) => {
            switch (col) {
              case 'agendada_em': return l.created_at;
              case 'aula_em': return l.data_experimental;
              case 'aluno': return l.lead_nome || l.nome_aluno;
              case 'telefone': return l.lead_telefone;
              case 'status': return l.status;
              case 'canal': return l.canal_nome;
              case 'curso': return l.curso_nome;
              case 'professor': return l.professor_nome;
              case 'unidade': return l.unidade_codigo;
              default: return null;
            }
          });
          return (
          <div className="p-4 overflow-x-auto">
            {expFiltradas.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
                    <SortableTh col="agendada_em" label="Agendada em" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />
                    <SortableTh col="aula_em" label="Aula em" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />
                    <SortableTh col="aluno" label="Aluno" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Responsável</th>
                    <SortableTh col="telefone" label="Telefone" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />
                    <SortableTh col="status" label="Status" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />
                    <SortableTh col="canal" label="Canal" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />
                    <SortableTh col="curso" label="Curso" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />
                    <SortableTh col="professor" label="Professor" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />
                    {isAdmin && <SortableTh col="unidade" label="Unidade" sort={sortExperimentais} onSort={(c) => setSortExperimentais(prev => nextSort(prev, c))} />}
                    <th className="pb-3 px-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const grupos = new Map<number, any[]>();
                    expFiltradas.forEach((exp: any) => {
                      const lid = exp.lead_id;
                      if (!grupos.has(lid)) grupos.set(lid, []);
                      grupos.get(lid)!.push(exp);
                    });
                    let rowIndex = 0;
                    const statusBadge = (s: string) => (
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        s === 'experimental_agendada' ? 'bg-amber-500/20 text-amber-400' :
                        s === 'experimental_realizada' ? 'bg-emerald-500/20 text-emerald-400' :
                        s === 'experimental_faltou' ? 'bg-red-500/20 text-red-400' :
                        s === 'convertido' ? 'bg-violet-500/20 text-violet-400' :
                        'bg-slate-500/20 text-slate-400'
                      )}>
                        {s === 'experimental_agendada' ? 'Agendada' :
                         s === 'experimental_realizada' ? 'Realizada' :
                         s === 'experimental_faltou' ? 'Faltou' :
                         s === 'convertido' ? 'Convertido' : s}
                      </span>
                    );
                    const fmtData = (exp: any) => {
                      const d = exp.data_experimental ? new Date(exp.data_experimental + 'T12:00:00') : null;
                      return d ? d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + (exp.horario_experimental ? ' ' + exp.horario_experimental.slice(0, 5) : '') : '-';
                    };
                    const fmtAgendada = (exp: any) => {
                      const d = exp.created_at ? new Date(exp.created_at) : null;
                      return d ? d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : '-';
                    };
                    const abrirLead = (exp: any) => {
                      const leadData = exp.leads;
                      if (leadData) {
                        startEditing({ ...leadData, id: exp.lead_id } as LeadDiario);
                      }
                    };
                    const expToLeadCRM = (exp: any): LeadCRM => ({
                      id: exp.lead_id,
                      nome: exp.lead_nome || exp.nome_aluno,
                      telefone: exp.lead_telefone || null,
                      email: null, whatsapp: null, idade: null,
                      unidade_id: exp.unidade_id,
                      curso_interesse_id: exp.curso_interesse_id,
                      canal_origem_id: exp.leads?.canal_origem_id || null,
                      data_contato: exp.data_contato || '',
                      data_primeiro_contato: null, data_ultimo_contato: null,
                      status: exp.status, observacoes: null,
                      created_at: '', updated_at: '',
                      etapa_pipeline_id: exp.etapa_pipeline_id,
                      professor_experimental_id: exp.professor_experimental_id,
                    } as LeadCRM);
                    const statusOpcoes = [
                      { value: 'experimental_agendada', label: 'Agendada' },
                      { value: 'experimental_realizada', label: 'Realizada' },
                      { value: 'experimental_faltou', label: 'Faltou' },
                      { value: 'convertido', label: 'Convertido' },
                      { value: 'cancelada', label: 'Cancelada' },
                    ];
                    const renderAcoes = (exp: any) => {
                      const etapa = exp.etapa_pipeline_id || 5;
                      const transicoes = transicoesEtapa[etapa] || [];
                      return (
                        <div className="flex items-center justify-end gap-1">
                          {transicoes.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Mover etapa" onClick={(e) => e.stopPropagation()}>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-2" align="end">
                                <>
                                  <p className="text-xs text-slate-400 mb-2 px-1">Avançar para:</p>
                                  {transicoes.map(t => (
                                    <button
                                      key={t.etapa}
                                      onClick={() => {
                                        if (t.etapa === 10) {
                                          setLeadParaMatricular(expToLeadCRM(exp));
                                        } else {
                                          handleMoverEtapa(exp.lead_id, t.etapa);
                                        }
                                      }}
                                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-700 text-slate-300 transition-colors"
                                    >
                                      {t.label}
                                    </button>
                                  ))}
                                  <div className="border-t border-slate-700/50 mt-1 pt-1">
                                    <button
                                      onClick={() => setLeadParaEditar({ lead: expToLeadCRM(exp), experimentalId: exp.id })}
                                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => setLeadParaArquivar(expToLeadCRM(exp))}
                                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
                                    >
                                      Arquivar
                                    </button>
                                  </div>
                                  {voltarEtapa[etapa] && (
                                    <div className="border-t border-slate-700/50 mt-1 pt-1">
                                      <button
                                        onClick={() => handleMoverEtapa(exp.lead_id, voltarEtapa[etapa]!.etapa)}
                                        className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-700 text-slate-500 transition-colors flex items-center gap-1"
                                      >
                                        <RotateCcw className="w-3 h-3" /> Voltar para {voltarEtapa[etapa]!.label}
                                      </button>
                                    </div>
                                  )}
                                </>
                              </PopoverContent>
                            </Popover>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); exp.lead_id && setDeleteId(exp.lead_id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      );
                    };
                    return Array.from(grupos.entries()).flatMap(([leadId, exps]) => {
                      const isGrupo = exps.length > 1;
                      const isExpanded = gruposExpandidos.has(leadId);
                      const first = exps[0];
                      rowIndex++;

                      if (!isGrupo) {
                        // Lead com 1 experimental — linha normal
                        return [(
                          <tr key={first.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => abrirLead(first)}>
                            <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{rowIndex}</td>
                            <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                              <CelulaEditavelInline
                                value={(first.created_at || '').slice(0, 10) || null}
                                onChange={async (valor) => first.id && salvarCampoExperimental(first.id, 'created_at', valor ? valor + 'T12:00:00-03:00' : null)}
                                tipo="data"
                                placeholder="-"
                                formatarExibicao={() => <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-slate-500/20 text-slate-400">{fmtAgendada(first)}</span>}
                              />
                            </td>
                            <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                              <CelulaEditavelInline
                                value={first.data_experimental || null}
                                onChange={async (valor) => first.id && salvarCampoExperimental(first.id, 'data_experimental', valor)}
                                tipo="data"
                                placeholder="-"
                                formatarExibicao={() => <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-violet-500/20 text-violet-400">{fmtData(first)}</span>}
                              />
                            </td>
                            <td className="py-3 px-2 border-r border-slate-700/30">
                              <CelulaEditavelInline
                                value={first.lead_nome || first.nome_aluno}
                                onChange={async (valor) => first.lead_id && salvarCampoLead(first.lead_id,'nome', valor)}
                                tipo="texto"
                                textClassName="text-white font-medium"
                                placeholder="-"
                              />
                            </td>
                            <td className="py-3 px-2 border-r border-slate-700/30"><span className="text-slate-400 text-xs">{first.nome_aluno !== first.lead_nome ? first.nome_aluno : ''}</span></td>
                            <td className="py-3 px-2 border-r border-slate-700/30">
                              <CelulaEditavelInline
                                value={first.lead_telefone}
                                onChange={async (valor) => first.lead_id && salvarCampoLead(first.lead_id,'telefone', valor)}
                                tipo="texto"
                                textClassName="text-emerald-400"
                                placeholder="-"
                              />
                            </td>
                            <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                              <CelulaEditavelInline
                                value={first.status}
                                onChange={async (valor) => first.id && salvarCampoExperimental(first.id, 'status', valor)}
                                tipo="select"
                                opcoes={statusOpcoes}
                                placeholder="-"
                                formatarExibicao={() => statusBadge(first.status)}
                              />
                            </td>
                            <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                              <CelulaEditavelInline
                                value={first.leads?.canal_origem_id}
                                onChange={async (valor) => first.lead_id && salvarCampoLead(first.lead_id,'canal_origem_id', valor ? Number(valor) : null)}
                                tipo="select"
                                opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                                placeholder="-"
                                formatarExibicao={() => <CanalOrigemBadge canal={first.canal_nome || '-'} />}
                              />
                            </td>
                            <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                              <CelulaEditavelInline
                                value={first.curso_interesse_id}
                                onChange={async (valor) => first.lead_id && salvarCampoLead(first.lead_id,'curso_interesse_id', valor ? Number(valor) : null)}
                                tipo="select"
                                opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                                placeholder="-"
                                formatarExibicao={() => <span className="text-purple-400">{first.curso_nome || '-'}</span>}
                              />
                            </td>
                            <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                              <CelulaEditavelInline
                                value={first.professor_experimental_id}
                                onChange={async (valor) => first.id && salvarCampoExperimental(first.id, 'professor_experimental_id', valor ? Number(valor) : null)}
                                tipo="select"
                                opcoes={professores.map(p => ({ value: p.value, label: p.label }))}
                                placeholder="-"
                                formatarExibicao={() => <span className="text-violet-400">{first.professor_nome || '-'}</span>}
                              />
                            </td>
                            {isAdmin && <td className="py-3 px-2 border-r border-slate-700/30"><span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">{first.unidade_codigo || '-'}</span></td>}
                            <td className="py-3 px-2 text-right">{renderAcoes(first)}</td>
                          </tr>
                        )];
                      }

                      // Lead com múltiplas experimentais — header clicável + filhos colapsáveis
                      const rows = [(
                        <tr
                          key={`grupo-${leadId}`}
                          className="border-b border-slate-700/50 bg-violet-500/5 hover:bg-violet-500/10 transition-colors cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGruposExpandidos(prev => {
                              const next = new Set(prev);
                              if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
                              return next;
                            });
                          }}
                        >
                          <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{rowIndex}</td>
                          <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                            <CelulaEditavelInline
                              value={(first.created_at || '').slice(0, 10) || null}
                              onChange={async (valor) => first.id && salvarCampoExperimental(first.id, 'created_at', valor ? valor + 'T12:00:00-03:00' : null)}
                              tipo="data"
                              placeholder="-"
                              formatarExibicao={() => <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-slate-500/20 text-slate-400">{fmtAgendada(first)}</span>}
                            />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                            <CelulaEditavelInline
                              value={first.data_experimental || null}
                              onChange={async (valor) => first.id && salvarCampoExperimental(first.id, 'data_experimental', valor)}
                              tipo="data"
                              placeholder="-"
                              formatarExibicao={() => <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-violet-500/20 text-violet-400">{fmtData(first)}</span>}
                            />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30">
                            <div className="flex items-center gap-1.5">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-violet-400" /> : <ChevronRight className="w-3.5 h-3.5 text-violet-400" />}
                              <span className="text-white font-medium">{first.nome_aluno || '-'}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-400">+{exps.length - 1}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30"><span className="text-slate-400 text-xs">{first.lead_nome || '-'}</span></td>
                          <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                            <CelulaEditavelInline
                              value={first.lead_telefone}
                              onChange={async (valor) => first.lead_id && salvarCampoLead(first.lead_id,'telefone', valor)}
                              tipo="texto"
                              textClassName="text-emerald-400"
                              placeholder="-"
                            />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                            <CelulaEditavelInline
                              value={first.status}
                              onChange={async (valor) => first.id && salvarCampoExperimental(first.id, 'status', valor)}
                              tipo="select"
                              opcoes={statusOpcoes}
                              placeholder="-"
                              formatarExibicao={() => statusBadge(first.status)}
                            />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                            <CelulaEditavelInline
                              value={first.leads?.canal_origem_id}
                              onChange={async (valor) => first.lead_id && salvarCampoLead(first.lead_id,'canal_origem_id', valor ? Number(valor) : null)}
                              tipo="select"
                              opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                              placeholder="-"
                              formatarExibicao={() => <CanalOrigemBadge canal={first.canal_nome || '-'} />}
                            />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                            <CelulaEditavelInline
                              value={first.curso_interesse_id}
                              onChange={async (valor) => first.lead_id && salvarCampoLead(first.lead_id,'curso_interesse_id', valor ? Number(valor) : null)}
                              tipo="select"
                              opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                              placeholder="-"
                              formatarExibicao={() => <span className="text-purple-400">{first.curso_nome || '-'}</span>}
                            />
                          </td>
                          <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                            <CelulaEditavelInline
                              value={first.professor_experimental_id}
                              onChange={async (valor) => first.id && salvarCampoExperimental(first.id, 'professor_experimental_id', valor ? Number(valor) : null)}
                              tipo="select"
                              opcoes={professores.map(p => ({ value: p.value, label: p.label }))}
                              placeholder="-"
                              formatarExibicao={() => <span className="text-violet-400">{first.professor_nome || '-'}</span>}
                            />
                          </td>
                          {isAdmin && <td className="py-3 px-2 border-r border-slate-700/30"><span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">{first.unidade_codigo || '-'}</span></td>}
                          <td className="py-3 px-2 text-right">{renderAcoes(first)}</td>
                        </tr>
                      )];

                      if (isExpanded) {
                        exps.slice(1).forEach((exp: any) => {
                          rows.push(
                            <tr key={exp.id} className="border-b border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => abrirLead(exp)}>
                              <td className="py-3 px-2 text-slate-600 border-r border-slate-700/30"></td>
                              <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                                <CelulaEditavelInline
                                  value={(exp.created_at || '').slice(0, 10) || null}
                                  onChange={async (valor) => exp.id && salvarCampoExperimental(exp.id, 'created_at', valor ? valor + 'T12:00:00-03:00' : null)}
                                  tipo="data"
                                  placeholder="-"
                                  formatarExibicao={() => <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-slate-500/20 text-slate-400">{fmtAgendada(exp)}</span>}
                                />
                              </td>
                              <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                                <CelulaEditavelInline
                                  value={exp.data_experimental || null}
                                  onChange={async (valor) => exp.id && salvarCampoExperimental(exp.id, 'data_experimental', valor)}
                                  tipo="data"
                                  placeholder="-"
                                  formatarExibicao={() => <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-violet-500/20 text-violet-400">{fmtData(exp)}</span>}
                                />
                              </td>
                              <td className="py-3 px-2 border-r border-slate-700/30">
                                <div className="flex items-center gap-1.5 pl-5">
                                  <span className="text-slate-600 text-xs">└</span>
                                  <span className="text-white font-medium">{exp.nome_aluno || '-'}</span>
                                </div>
                              </td>
                              <td className="py-3 px-2 border-r border-slate-700/30"><span className="text-slate-600 text-xs">↑</span></td>
                              <td className="py-3 px-2 border-r border-slate-700/30"><span className="text-slate-600 text-xs">↑</span></td>
                              <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                                <CelulaEditavelInline
                                  value={exp.status}
                                  onChange={async (valor) => exp.id && salvarCampoExperimental(exp.id, 'status', valor)}
                                  tipo="select"
                                  opcoes={statusOpcoes}
                                  placeholder="-"
                                  formatarExibicao={() => statusBadge(exp.status)}
                                />
                              </td>
                              <td className="py-3 px-2 border-r border-slate-700/30"><CanalOrigemBadge canal={exp.canal_nome || '-'} /></td>
                              <td className="py-3 px-2 border-r border-slate-700/30"><span className="text-purple-400">{exp.curso_nome || '-'}</span></td>
                              <td className="py-3 px-2 border-r border-slate-700/30" onClick={(e) => e.stopPropagation()}>
                                <CelulaEditavelInline
                                  value={exp.professor_experimental_id}
                                  onChange={async (valor) => exp.id && salvarCampoExperimental(exp.id, 'professor_experimental_id', valor ? Number(valor) : null)}
                                  tipo="select"
                                  opcoes={professores.map(p => ({ value: p.value, label: p.label }))}
                                  placeholder="-"
                                  formatarExibicao={() => <span className="text-violet-400">{exp.professor_nome || '-'}</span>}
                                />
                              </td>
                              {isAdmin && <td className="py-3 px-2 border-r border-slate-700/30"><span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">{exp.unidade_codigo || '-'}</span></td>}
                              <td className="py-3 px-2 text-right">{renderAcoes(exp)}</td>
                            </tr>
                          );
                        });
                      }
                      return rows;
                    });
                  })()}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <Guitar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">
                  {buscaFunil ? 'Nenhuma experimental encontrada para esta busca' : 'Nenhuma experimental registrada ainda'}
                </p>
                {!buscaFunil && <p className="text-slate-500 text-sm mt-1">Clique no card "Experimental" acima para adicionar</p>}
              </div>
            )}

            <ResultadosForaPeriodo itens={buscaFora.experimentais.filter(it => !expFiltradas.some((e: any) => e.id === it.experimentalId))} periodoLabel={competencia.range.label} isAdmin={isAdmin} onEditar={handleEditarForaPeriodo} semCabecalho={!!buscaFunil} />
          </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABELA DE VISITAS */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {abaDetalhamento === 'visita' && (() => {
          const visitasFiltradasRaw = visitasMes.filter(l => {
            if (buscaFunil) {
              const termo = normalizar(buscaFunil);
              const digits = buscaFunil.replace(/\D/g, '');
              const matchNome = normalizar(l.nome || '').includes(termo);
              const matchTel = digits.length > 0 && ((l as any).telefone || '').includes(digits);
              if (!matchNome && !matchTel) return false;
            }
            if (filtroCanalFunil !== 'todos' && String(l.canal_origem_id) !== filtroCanalFunil) return false;
            if (filtroCursoFunil !== 'todos' && String(l.curso_interesse_id) !== filtroCursoFunil) return false;
            if (filtroProfessorFunil !== 'todos' && String(l.professor_experimental_id) !== filtroProfessorFunil) return false;
            return true;
          });
          type VisitaComCampos = LeadDiario & { canal_nome?: string; curso_nome?: string; telefone?: string; curso_id?: number };
          const visitasFiltradas = sortArray(visitasFiltradasRaw as VisitaComCampos[], sortVisitas, (v: VisitaComCampos, col) => {
            switch (col) {
              case 'data': return v.data_contato;
              case 'nome': return v.nome;
              case 'telefone': return v.telefone;
              case 'canal': return v.canal_nome;
              case 'curso': return v.curso_nome;
              case 'qtd': return v.quantidade;
              case 'unidade': return v.unidades?.codigo;
              default: return null;
            }
          });
          return (
          <div className="p-4 overflow-x-auto">
            {visitasFiltradas.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
                    <SortableTh col="data" label="Data" sort={sortVisitas} onSort={(c) => setSortVisitas(prev => nextSort(prev, c))} />
                    <SortableTh col="nome" label="Nome" sort={sortVisitas} onSort={(c) => setSortVisitas(prev => nextSort(prev, c))} />
                    <SortableTh col="telefone" label="Telefone" sort={sortVisitas} onSort={(c) => setSortVisitas(prev => nextSort(prev, c))} />
                    <SortableTh col="canal" label="Canal" sort={sortVisitas} onSort={(c) => setSortVisitas(prev => nextSort(prev, c))} />
                    <SortableTh col="curso" label="Curso" sort={sortVisitas} onSort={(c) => setSortVisitas(prev => nextSort(prev, c))} />
                    <SortableTh col="qtd" label="Qtd" sort={sortVisitas} onSort={(c) => setSortVisitas(prev => nextSort(prev, c))} />
                    {isAdmin && <SortableTh col="unidade" label="Unidade" sort={sortVisitas} onSort={(c) => setSortVisitas(prev => nextSort(prev, c))} />}
                    <th className="pb-3 px-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visitasFiltradas.map((visita, index) => (
                    <tr 
                      key={visita.id} 
                      className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={visita.data_contato}
                          onChange={async (valor) => visita.id && salvarCampoLead(visita.id,'data_contato', valor)}
                          tipo="data"
                          textClassName="text-slate-300"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={(visita as any).nome}
                          onChange={async (valor) => visita.id && salvarCampoLead(visita.id,'nome', valor)}
                          tipo="texto"
                          textClassName="text-white font-medium"
                          placeholder="-"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={(visita as any).telefone}
                          onChange={async (valor) => visita.id && salvarCampoLead(visita.id,'telefone', valor)}
                          tipo="texto"
                          textClassName="text-emerald-400"
                          placeholder="-"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={visita.canal_origem_id}
                          onChange={async (valor) => visita.id && salvarCampoLead(visita.id,'canal_origem_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <CanalOrigemBadge canal={visita.canal_nome || '-'} />}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={visita.curso_id}
                          onChange={async (valor) => visita.id && salvarCampoLead(visita.id,'curso_interesse_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-purple-400">{visita.curso_nome || '-'}</span>}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={visita.quantidade}
                          onChange={async (valor) => visita.id && salvarCampoLead(visita.id,'quantidade', valor ? Number(valor) : 1)}
                          tipo="numero"
                          textClassName="text-amber-400 font-medium"
                        />
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-2 border-r border-slate-700/30">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                            {(visita as any).unidades?.codigo || '-'}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(() => {
                            const etapa = visita.etapa_pipeline_id || 6;
                            const transicoes = transicoesEtapa[etapa] || [];
                            if (transicoes.length === 0) return null;
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Mover etapa">
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-2" align="end">
                                  <>
                                    <p className="text-xs text-slate-400 mb-2 px-1">Avançar para:</p>
                                    {transicoes.map(t => (
                                      <button
                                        key={t.etapa}
                                        onClick={() => {
                                          if (t.etapa === 10) {
                                            setLeadParaMatricular(toLeadCRM(visita as any));
                                          } else {
                                            handleMoverEtapa(visita.id!, t.etapa);
                                          }
                                        }}
                                        className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-700 text-slate-300 transition-colors"
                                      >
                                        {t.label}
                                      </button>
                                    ))}
                                    <div className="border-t border-slate-700/50 mt-1 pt-1">
                                      <button
                                        onClick={() => setLeadParaEditar({ lead: toLeadCRM(visita as any) })}
                                        className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        onClick={() => setLeadParaArquivar(toLeadCRM(visita as any))}
                                        className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
                                      >
                                        Arquivar
                                      </button>
                                    </div>
                                    {voltarEtapa[etapa] && (
                                      <div className="border-t border-slate-700/50 mt-1 pt-1">
                                        <button
                                          onClick={() => handleMoverEtapa(visita.id!, voltarEtapa[etapa]!.etapa)}
                                          className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-700 text-slate-500 transition-colors flex items-center gap-1"
                                        >
                                          <RotateCcw className="w-3 h-3" /> Voltar para {voltarEtapa[etapa]!.label}
                                        </button>
                                      </div>
                                    )}
                                  </>
                                </PopoverContent>
                              </Popover>
                            );
                          })()}
                          <button
                            onClick={() => visita.id && setDeleteId(visita.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">
                  {buscaFunil ? 'Nenhuma visita encontrada para esta busca' : 'Nenhuma visita registrada ainda'}
                </p>
                {!buscaFunil && <p className="text-slate-500 text-sm mt-1">Clique no card "Visita" acima para adicionar</p>}
              </div>
            )}
            <ResultadosForaPeriodo itens={buscaFora.visitas.filter(it => !visitasFiltradas.some((v: any) => v.id === it.leadId))} periodoLabel={competencia.range.label} isAdmin={isAdmin} onEditar={handleEditarForaPeriodo} semCabecalho={!!buscaFunil} />
          </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABELA DE MATRÍCULAS (original - mantida intacta) */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {abaDetalhamento === 'matricula' && (() => {
          // helper local para ordenar mantendo todos os campos calculados
          const sortMat = (arr: typeof matriculasMes) => sortArray(arr, sortMatriculas, (m: any, col) => {
            switch (col) {
              case 'data': return m.data_matricula;
              case 'aluno': return m.nome;
              case 'lead': return m.lead_nome || '';
              case 'telefone': return m.telefone;
              case 'idade': return m.idade;
              case 'curso': return m.curso_nome;
              case 'canal': return m.canal_nome;
              case 'prof_exp': return m.professor_exp_nome;
              case 'prof_fixo': return m.professor_fixo_nome;
              case 'passaporte': return m.valor_passaporte;
              case 'parcela': return m.valor_parcela;
              case 'escola': return m.idade != null ? (m.idade <= 11 ? 'LAMK' : 'EMLA') : m.tipo_matricula;
              default: return null;
            }
          });
          const ehBanda = (l: any) => l.is_banda || (l.curso_nome || '').toLowerCase().includes('banda');
          const matriculasFiltradasRaw = matriculasMes.filter((l: any) => {
            // Filtro por tipo (novos alunos vs segundo curso/banda)
            if (filtroTipoMat === 'novos_alunos' && !ehMatriculaNova(l)) return false;
            if (filtroTipoMat === 'segundo_curso' && !l.is_segundo_curso && !ehBanda(l)) return false;
            // 'todos': mostra tudo sem filtro de tipo
            if (buscaFunil) {
              const termo = buscaFunil.toLowerCase();
              const nome = (l.aluno_nome || l.nome || '').toLowerCase();
              const tel = (l.telefone || '').toLowerCase();
              if (!nome.includes(termo) && !tel.includes(termo)) return false;
            }
            if (filtroCursoFunil !== 'todos' && String(l.curso_id || l.curso_interesse_id) !== filtroCursoFunil) return false;
            if (filtroProfessorFunil !== 'todos') {
              const expId = (l as any).professor_experimental_id;
              const fixoId = (l as any).professor_fixo_id;
              if (String(expId) !== filtroProfessorFunil && String(fixoId) !== filtroProfessorFunil) return false;
            }
            return true;
          });
          const matriculasFiltradas = sortMat(matriculasFiltradasRaw);
          return (
          <>
            {/* Header específico de matrículas */}
            <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-emerald-400">{matriculasFiltradas.length} matrícula{matriculasFiltradas.length !== 1 ? 's' : ''} no mês</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Total Passaportes:</span>
                  <span className="text-lg font-bold text-emerald-400">
                    R$ {matriculasFiltradasRaw.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Tabela de Matrículas */}
            <div className="p-4 overflow-x-auto">
          {matriculasMes.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
                  <SortableTh col="data" label="Matrícula" tooltip="Data da matrícula (data_matricula do aluno)" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="aluno" label="Aluno(a)" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="lead" label="Lead vinculado" tooltip="Lead de origem. 'Matrícula direta' = sem lead; âmbar = nome do lead diverge do aluno" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="telefone" label="Telefone" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="idade" label="Idade" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="curso" label="Curso" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="canal" label="Canal" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="prof_exp" label="Prof. Exp." sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="prof_fixo" label="Prof. Fixo" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="passaporte" label="Passaporte" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="parcela" label="Parcela" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <SortableTh col="escola" label="Escola" sort={sortMatriculas} onSort={(c) => setSortMatriculas(prev => nextSort(prev, c))} />
                  <th className="pb-3 px-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {matriculasFiltradas.map((mat, index) => (
                  <tr 
                    key={mat.id} 
                    className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                    
                    {/* Matrícula (data) - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.data_matricula}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'data_matricula', valor)}
                        tipo="data"
                        textClassName="text-emerald-400"
                      />
                    </td>

                    {/* Aluno - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.nome}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'nome', valor)}
                        tipo="texto"
                        textClassName="text-white font-medium"
                        placeholder="-"
                      />
                    </td>

                    {/* Lead vinculado - somente leitura */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {!(mat as any).is_orfao ? (
                        (mat as any).lead_divergente ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 whitespace-nowrap" title={`Lead "${(mat as any).lead_nome}" tem nome diferente do aluno`}>{(mat as any).lead_nome}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">{(mat as any).lead_nome || '-'}</span>
                        )
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-400 whitespace-nowrap">Matrícula direta</span>
                      )}
                    </td>

                    {/* Telefone - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={(mat as any).telefone}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'telefone', valor)}
                        tipo="texto"
                        textClassName="text-emerald-400"
                        placeholder="-"
                      />
                    </td>
                    
                    {/* Idade - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.idade}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'idade', valor ? Number(valor) : null)}
                        tipo="numero"
                        textClassName="text-slate-300"
                        placeholder="-"
                      />
                    </td>
                    
                    {/* Curso - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.curso_interesse_id}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'curso_interesse_id', valor ? Number(valor) : null)}
                        tipo="select"
                        opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                        placeholder="-"
                        formatarExibicao={() => mat.curso_nome || '-'}
                        textClassName="text-purple-400"
                      />
                    </td>
                    
                    {/* Canal - Edição inline. Com lead grava no lead; matrícula direta grava em alunos.canal_origem_id */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.canal_origem_id}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'canal_origem_id', valor ? Number(valor) : null, (mat as any).lead_id)}
                        tipo="select"
                        opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                        placeholder="-"
                        formatarExibicao={() => <CanalOrigemBadge canal={mat.canal_nome || '-'} />}
                        textClassName="text-blue-400"
                      />
                    </td>
                    
                    {/* Prof. Exp. - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.professor_experimental_id}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'professor_experimental_id', valor ? Number(valor) : null)}
                        tipo="select"
                        opcoes={professores.map(p => ({ value: p.value, label: p.label }))}
                        placeholder="-"
                        formatarExibicao={() => mat.professor_exp_nome || '-'}
                        textClassName="text-slate-300"
                      />
                    </td>
                    
                    {/* Prof. Fixo - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.professor_fixo_id}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'professor_fixo_id', valor ? Number(valor) : null)}
                        tipo="select"
                        opcoes={professores.map(p => ({ value: p.value, label: p.label }))}
                        placeholder="-"
                        formatarExibicao={() => mat.professor_fixo_nome || '-'}
                        textClassName="text-slate-300"
                      />
                    </td>
                    
                    {/* Passaporte - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.valor_passaporte}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'valor_passaporte', valor ? Number(valor) : null)}
                        tipo="moeda"
                        placeholder="-"
                        formatarExibicao={() => (
                          <span className="text-emerald-400 font-medium whitespace-nowrap">
                            R$ {(mat.valor_passaporte || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            {mat.forma_pagamento_passaporte_nome && (
                              <span className="text-slate-500 text-xs ml-1">{mat.forma_pagamento_passaporte_nome}</span>
                            )}
                          </span>
                        )}
                      />
                    </td>
                    
                    {/* Parcela - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.valor_parcela}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'valor_parcela', valor ? Number(valor) : null)}
                        tipo="moeda"
                        placeholder="-"
                        formatarExibicao={() => (
                          <span className="text-cyan-400 font-medium whitespace-nowrap">
                            R$ {(mat.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            {mat.forma_pagamento_nome && (
                              <span className="text-slate-500 text-xs ml-1">{mat.forma_pagamento_nome}</span>
                            )}
                          </span>
                        )}
                      />
                    </td>
                    
                    {/* Escola - somente leitura (derivado da idade) */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const escolaCalc = mat.idade != null ? (mat.idade <= 11 ? 'LAMK' : 'EMLA') : '-';
                          return (
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium",
                              escolaCalc === 'LAMK' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                            )}>
                              {escolaCalc}
                            </span>
                          );
                        })()}
                        {isAdmin && mat.unidades?.codigo && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                            {mat.unidades.codigo}
                          </span>
                        )}
                      </div>
                    </td>
                    
                    {/* Ações - Apenas excluir (apaga o ALUNO) */}
                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => mat.id && setDeleteMatriculaId(mat.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                        title="Excluir matrícula (aluno)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-600 bg-slate-800/50">
                  <td colSpan={10} className="py-3 px-2 text-right text-slate-400 font-medium">Totais:</td>
                  <td className="py-3 px-2 text-emerald-400 font-bold">
                    R$ {matriculasFiltradasRaw.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-2 text-cyan-400 font-bold">
                    R$ {matriculasFiltradasRaw.reduce((acc, m) => acc + (m.valor_parcela || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Nenhuma matrícula registrada ainda</p>
              <p className="text-slate-500 text-sm mt-1">Clique no card "Matrícula" acima para adicionar</p>
            </div>
          )}
        </div>

        <div className="px-6"><ResultadosForaPeriodo itens={buscaFora.matriculas} periodoLabel={competencia.range.label} isAdmin={isAdmin} semCabecalho={!!buscaFunil} /></div>

        {/* Resumo financeiro */}
        {matriculasMes.length > 0 && (
          <div className="px-6 pb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">LAMK (Kids)</p>
                <p className="text-xl font-bold text-pink-400">
                  {matriculasMes.filter(ehMatriculaNova).filter(m => m.idade != null ? m.idade <= 11 : m.tipo_matricula === 'LAMK').length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">EMLA (Adulto)</p>
                <p className="text-xl font-bold text-blue-400">
                  {matriculasMes.filter(ehMatriculaNova).filter(m => m.idade != null ? m.idade > 11 : m.tipo_matricula === 'EMLA').length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">Ticket Médio Pass.</p>
                <p className="text-xl font-bold text-emerald-400">
                  R$ {(() => {
                    // Apenas matrículas novas (já excluem passaporte zerado por definição)
                    const novas = matriculasMes.filter(ehMatriculaNova);
                    return novas.length > 0
                      ? fmtBRL(novas.reduce((acc, m) => acc + (Number(m.valor_passaporte) || 0), 0) / novas.length)
                      : '0,00';
                  })()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">Ticket Médio Parc.</p>
                <p className="text-xl font-bold text-cyan-400">
                  R$ {(() => {
                    // Apenas matrículas novas pagantes (com parcela > 0)
                    const novasPagantes = matriculasMes.filter(m => ehMatriculaNova(m) && !TIPOS_SEM_PAGAMENTO.includes(m.tipo_aluno) && (Number(m.valor_parcela) || 0) > 0);
                    return novasPagantes.length > 0
                      ? fmtBRL(novasPagantes.reduce((acc, m) => acc + (Number(m.valor_parcela) || 0), 0) / novasPagantes.length)
                      : '0,00';
                  })()}
                </p>
              </div>
            </div>
          </div>
        )}
        </>
          );
        })()}
      </section>

      {/* Modal de Lead Atendido */}
      {modalOpen === 'lead' && (
        <Modal title="Registrar Leads Atendidos" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">📅 Data do Lançamento</Label>
              <DatePicker
                date={loteData}
                onDateChange={(date) => setLoteData(date || new Date())}
                placeholder="Selecione a data"
              />
            </div>

            {/* Tabela de linhas */}
            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr className="text-slate-400 text-xs uppercase">
                    <th className="py-2 px-2 text-left">Nome</th>
                    <th className="py-2 px-2 text-left w-36">Telefone</th>
                    <th className="py-2 px-2 text-left w-32">Canal</th>
                    <th className="py-2 px-2 text-left w-32">Curso</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loteLeads.map((linha) => (
                    <tr key={linha.id} className="border-t border-slate-700/50">
                      <td className="py-2 px-2">
                        <ComboboxNome
                          value={linha.aluno_nome || ''}
                          onChange={(nome) => updateLinhaLead(linha.id, 'aluno_nome', nome)}
                          onSelectSugestao={(sugestao) => {
                            setLoteLeads(prev => prev.map(l =>
                              l.id === linha.id
                                ? {
                                    ...l,
                                    aluno_nome: sugestao.nome,
                                    telefone: sugestao.telefone ? maskPhone(sugestao.telefone.replace(/^55/, '')) : l.telefone,
                                    canal_origem_id: sugestao.canal_origem_id ?? l.canal_origem_id,
                                    curso_id: sugestao.curso_id ?? l.curso_id,
                                  }
                                : l
                            ));
                          }}
                          sugestoes={sugestoesLeads}
                          placeholder="Nome do lead..."
                        />
                      </td>
                      <td className="py-2 px-2">
                        <ComboboxTelefone
                          value={linha.telefone || ''}
                          onChange={(masked) => updateLinhaLead(linha.id, 'telefone', masked)}
                          onSelectSugestao={(sugestao) => {
                            setLoteLeads(prev => prev.map(l =>
                              l.id === linha.id
                                ? {
                                    ...l,
                                    aluno_nome: sugestao.nome,
                                    telefone: sugestao.telefone
                                      ? maskPhone(sugestao.telefone.replace(/^55/, ''))
                                      : l.telefone,
                                    canal_origem_id: sugestao.canal_origem_id ?? l.canal_origem_id,
                                    curso_id: sugestao.curso_id ?? l.curso_id,
                                  }
                                : l
                            ));
                          }}
                          onBlur={() => checkLeadByPhone(linha.telefone, linha.id)}
                          sugestoes={sugestoesLeads}
                          maskPhone={maskPhone}
                          placeholder="(21) 99999-9999"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={linha.canal_origem_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaLead(linha.id, 'canal_origem_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Canal..." />
                          </SelectTrigger>
                          <SelectContent>
                            {canais.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={linha.curso_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaLead(linha.id, 'curso_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Curso..." />
                          </SelectTrigger>
                          <SelectContent>
                            {cursos.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => removeLinhaLead(linha.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          disabled={loteLeads.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Botão adicionar linha */}
            <button
              onClick={addLinhaLead}
              className="w-full py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adicionar lead
            </button>

            {/* Total */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
              <span className="text-slate-400">Total de leads atendidos:</span>
              <span className="text-2xl font-bold text-cyan-400">
                {loteLeads.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length}
              </span>
            </div>

            <Button
              onClick={handleSaveLoteLeads}
              disabled={saving || loteLeads.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length === 0}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar ({loteLeads.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length} leads atendidos)
            </Button>
          </div>
        </Modal>
      )}


      {/* Modal de Matrícula */}
      {modalOpen === 'matricula' && (
        <Modal title="Registrar Matrícula" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            {matFortesAtivas.length > 0 && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                  <AlertCircle className="w-4 h-4" />
                  Já existe registro com estes dados (telefone ou nome+nascimento batem)
                </div>
                <div className="space-y-1.5">
                  {matFortesAtivas.map((d) => (
                    <div key={`${d._origem}-${d.id}`} className="flex items-center justify-between gap-2 text-xs bg-slate-800/50 rounded px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-300 text-[10px] uppercase mr-2">{d._origem}</span>
                        <span className="text-white font-medium">{d.nome}</span>
                        {d._origem === 'lead' && (d as LeadDuplicado).telefone && (
                          <span className="text-slate-400 ml-2">{(d as LeadDuplicado).telefone}</span>
                        )}
                        {d._origem === 'aluno' && (d as AlunoDuplicado).data_nascimento && (
                          <span className="text-slate-400 ml-2">
                            {new Date((d as AlunoDuplicado).data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 whitespace-nowrap">
                        <span>{d.status}</span>
                        <button
                          type="button"
                          onClick={() => setIgnorarDupFortes(prev => new Set(prev).add(d.id))}
                          className="text-slate-500 hover:text-slate-300 underline"
                        >
                          ignorar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {confirmouDupMatricula && (
                  <p className="text-xs text-red-400/80">
                    Confirmar criação? Clique em "Salvar" novamente.
                  </p>
                )}
              </div>
            )}
            {matFracasAtivas.length > 0 && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  Possível duplicata (mesmo nome)
                </div>
                <div className="space-y-1.5">
                  {matFracasAtivas.map((d) => (
                    <div key={`${d._origem}-${d.id}`} className="flex items-center justify-between gap-2 text-xs bg-slate-800/50 rounded px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-300 text-[10px] uppercase mr-2">{d._origem}</span>
                        <span className="text-white font-medium">{d.nome}</span>
                        {d._origem === 'lead' && (d as LeadDuplicado).telefone && (
                          <span className="text-slate-400 ml-2">{(d as LeadDuplicado).telefone}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 whitespace-nowrap">
                        <span>{d.status}</span>
                        <button
                          type="button"
                          onClick={() => setIgnorarDupFracas(prev => new Set(prev).add(d.id))}
                          className="text-slate-500 hover:text-slate-300 underline"
                        >
                          ignorar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-amber-400/80">
                  Se for o mesmo cliente, abra o registro existente em vez de criar um novo.
                </p>
              </div>
            )}
            <div>
              <Label className="mb-2 block">Data da Matrícula</Label>
              <DatePicker
                date={formData.data}
                onDateChange={(date) => setFormData({ ...formData, data: date || new Date() })}
                placeholder="Selecione a data"
                maxDate={new Date()}
              />
            </div>
            <div>
              <Label className="mb-2 block">Nome do Aluno *</Label>
              <ComboboxNome
                value={formData.aluno_nome}
                onChange={(nome) => setFormData({ ...formData, aluno_nome: nome })}
                onSelectSugestao={(sugestao) => {
                  setFormData(prev => ({
                    ...prev,
                    aluno_nome: sugestao.nome,
                    aluno_telefone: sugestao.telefone ? maskPhone(sugestao.telefone.replace(/^55/, '')) : prev.aluno_telefone,
                    canal_origem_id: sugestao.canal_origem_id || prev.canal_origem_id,
                    curso_id: sugestao.curso_id || prev.curso_id,
                    teve_experimental: sugestao.tipo.startsWith('experimental') ? true : prev.teve_experimental,
                    professor_experimental_id: sugestao.professor_id || prev.professor_experimental_id,
                  }));
                }}
                sugestoes={sugestoesLeads}
                placeholder="Digite ou selecione o nome..."
              />
              {anamnesePendenteMatricula && (
                <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                  <p>
                    🧠 Anamnese encontrada: &quot;{anamnesePendenteMatricula.nome_aluno}&quot; — {anamnesePendenteMatricula.temperamento_codinome || anamnesePendenteMatricula.tipo_formulario}
                  </p>
                  <p className="text-xs text-emerald-500/70">
                    Será vinculada automaticamente ao salvar a matrícula.
                  </p>
                </div>
              )}
              {!anamnesePendenteMatricula && buscandoAnamneseMatricula && formData.aluno_nome.trim().length >= 3 && (
                <p className="mt-2 text-xs text-slate-400">Buscando anamnese pendente...</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Sugestões do funil ou digite um nome novo (ex-aluno)
              </p>
            </div>
            <div>
              <Label className="mb-2 block">Telefone</Label>
              <ComboboxTelefone
                value={formData.aluno_telefone}
                onChange={(masked) => setFormData(prev => ({ ...prev, aluno_telefone: masked }))}
                onSelectSugestao={(sugestao) => {
                  setFormData(prev => ({
                    ...prev,
                    aluno_nome: sugestao.nome,
                    aluno_telefone: sugestao.telefone ? maskPhone(sugestao.telefone.replace(/^55/, '')) : prev.aluno_telefone,
                    canal_origem_id: sugestao.canal_origem_id ?? prev.canal_origem_id,
                    curso_id: sugestao.curso_id ?? prev.curso_id,
                    teve_experimental: sugestao.tipo.startsWith('experimental') ? true : prev.teve_experimental,
                    professor_experimental_id: sugestao.professor_id || prev.professor_experimental_id,
                  }));
                }}
                onBlur={() => {
                  if (!formData.aluno_telefone) return;
                  checkLeadByPhone(formData.aluno_telefone, '', 'matricula');
                }}
                sugestoes={sugestoesLeads}
                maskPhone={maskPhone}
                placeholder="(21) 99999-9999"
              />
            </div>
            {/* Campo Unidade - visível apenas para admin */}
            {isAdmin && (
              <div>
                <Label className="mb-2 block">Unidade *</Label>
                <Select
                  value={formData.unidade_id || ''}
                  onValueChange={(value) => setFormData({ ...formData, unidade_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => (
                      <SelectItem key={u.value} value={u.value.toString()}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">Data de Nascimento *</Label>
                <DatePickerNascimento
                  date={formData.aluno_data_nascimento || undefined}
                  onDateChange={(date) => setFormData({ ...formData, aluno_data_nascimento: date || null })}
                  placeholder="DD/MM/AAAA"
                />
              </div>
              <div>
                <Label className="mb-2 block">Tipo Aluno</Label>
                <Select
                  value={formData.tipo_aluno}
                  onValueChange={(value) => setFormData({ ...formData, tipo_aluno: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ALUNO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Responsável (opcional) */}
            <div className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-slate-300">👤 Responsável <span className="text-xs font-normal text-slate-500">(opcional)</span></h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="mb-1 block text-xs">Nome do Responsável</Label>
                  <Input
                    value={formData.responsavel_nome}
                    onChange={(e) => setFormData({ ...formData, responsavel_nome: e.target.value })}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="mb-1 block text-xs">Telefone/WhatsApp</Label>
                  <Input
                    value={formData.responsavel_telefone}
                    onChange={(e) => setFormData({ ...formData, responsavel_telefone: e.target.value })}
                    placeholder="(21) 99999-9999"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Parentesco</Label>
                <Select
                  value={formData.responsavel_parentesco}
                  onValueChange={(value) => setFormData({ ...formData, responsavel_parentesco: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mae">Mãe</SelectItem>
                    <SelectItem value="pai">Pai</SelectItem>
                    <SelectItem value="avo">Avó/Avô</SelectItem>
                    <SelectItem value="tio">Tio/Tia</SelectItem>
                    <SelectItem value="tutor">Tutor Legal</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label className="mb-2 block">Curso</Label>
                <Select
                  value={formData.curso_id?.toString() || ''}
                  onValueChange={(value) => setFormData({ ...formData, curso_id: parseInt(value) || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cursos.map((c) => (
                      <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Modalidade</Label>
                <Select
                  value={formData.modalidade}
                  onValueChange={(value) => setFormData({ ...formData, modalidade: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="turma">Turma</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Canal de Origem</Label>
              <Select
                value={formData.canal_origem_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, canal_origem_id: parseInt(value) || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {canais.map((c) => (
                    <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="teveExp" className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    id="teveExp"
                    checked={formData.teve_experimental}
                    onChange={(e) => setFormData({ ...formData, teve_experimental: e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 rounded border-2 border-slate-600 bg-slate-800 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all group-hover:border-slate-500 peer-checked:group-hover:bg-emerald-400 flex items-center justify-center">
                    <svg className={`w-3 h-3 text-white transition-opacity ${formData.teve_experimental ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <span className="text-slate-300 group-hover:text-white transition-colors">Teve aula experimental?</span>
              </label>
            </div>
            {formData.teve_experimental && (
              <div>
                <Label className="mb-2 block">Professor da Experimental</Label>
                <Select
                  value={formData.professor_experimental_id?.toString() || ''}
                  onValueChange={(value) => setFormData({ ...formData, professor_experimental_id: parseInt(value) || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {professores.map((p) => (
                      <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="mb-2 block">Professor Fixo</Label>
              <Select
                value={formData.professor_fixo_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, professor_fixo_id: parseInt(value) || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {professores.map((p) => (
                    <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dia e Horário da Aula */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-2 block">Dia da Aula</Label>
                <Select
                  value={formData.dia_aula || ''}
                  onValueChange={(value) => setFormData({ ...formData, dia_aula: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Segunda">Segunda</SelectItem>
                    <SelectItem value="Terça">Terça</SelectItem>
                    <SelectItem value="Quarta">Quarta</SelectItem>
                    <SelectItem value="Quinta">Quinta</SelectItem>
                    <SelectItem value="Sexta">Sexta</SelectItem>
                    <SelectItem value="Sábado">Sábado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Horário</Label>
                <Select
                  value={formData.horario_aula || ''}
                  onValueChange={(value) => setFormData({ ...formData, horario_aula: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="08:00">08:00</SelectItem>
                    <SelectItem value="09:00">09:00</SelectItem>
                    <SelectItem value="10:00">10:00</SelectItem>
                    <SelectItem value="11:00">11:00</SelectItem>
                    <SelectItem value="14:00">14:00</SelectItem>
                    <SelectItem value="15:00">15:00</SelectItem>
                    <SelectItem value="16:00">16:00</SelectItem>
                    <SelectItem value="17:00">17:00</SelectItem>
                    <SelectItem value="18:00">18:00</SelectItem>
                    <SelectItem value="19:00">19:00</SelectItem>
                    <SelectItem value="20:00">20:00</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Flags do Aluno */}
            <div className="flex flex-wrap gap-4 py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_ex_aluno}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_ex_aluno: !!checked })}
                />
                <span className="text-sm text-slate-300">É ex-aluno (já estudou antes)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_aluno_retorno}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_aluno_retorno: !!checked })}
                />
                <span className="text-sm text-slate-300">É aluno retorno</span>
              </label>
            </div>

            {/* Passaporte */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-amber-400">🎫 Passaporte</h4>
              <div className={`grid gap-3 ${formData.forma_pagamento_passaporte === 'cartao_credito' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <Label className="mb-1 block text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_passaporte || ''}
                    onChange={(e) => setFormData({ ...formData, valor_passaporte: parseFloat(e.target.value) || null })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Forma Pagamento</Label>
                  <Select
                    value={formData.forma_pagamento_passaporte}
                    onValueChange={(value) => setFormData({ ...formData, forma_pagamento_passaporte: value, parcelas_passaporte: value === 'cartao_credito' ? 1 : 1 })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="link">Link de Pagamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.forma_pagamento_passaporte === 'cartao_credito' && (
                  <div>
                    <Label className="mb-1 block text-xs">Parcelas</Label>
                    <Select
                      value={formData.parcelas_passaporte?.toString() || '1'}
                      onValueChange={(value) => setFormData({ ...formData, parcelas_passaporte: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="1x" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1x (à vista)</SelectItem>
                        <SelectItem value="2">2x</SelectItem>
                        <SelectItem value="3">3x</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Parcela */}
            <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-cyan-400">📅 Parcela Mensal</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_parcela || ''}
                    onChange={(e) => setFormData({ ...formData, valor_parcela: parseFloat(e.target.value) || null })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Forma Pagamento *</Label>
                  <Select
                    value={formData.forma_pagamento_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, forma_pagamento_id: parseInt(value) || null })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {formasPagamento.map((f) => (
                        <SelectItem key={f.value} value={f.value.toString()}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Vencimento</Label>
                  <Select
                    value={formData.dia_vencimento?.toString() || '5'}
                    onValueChange={(value) => setFormData({ ...formData, dia_vencimento: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Dia..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Dia 5</SelectItem>
                      <SelectItem value="20">Dia 20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.aluno_nome || !formData.aluno_data_nascimento || (!TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno) && !formData.forma_pagamento_id)}
              className={
                matTemForteNaoIgnorada && confirmouDupMatricula
                  ? 'w-full bg-gradient-to-r from-red-500 to-rose-500'
                  : matTemForteNaoIgnorada
                    ? 'w-full bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'w-full bg-gradient-to-r from-emerald-500 to-teal-500'
              }
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : matTemForteNaoIgnorada && confirmouDupMatricula ? (
                <AlertCircle className="w-5 h-5" />
              ) : matTemForteNaoIgnorada ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
              {matTemForteNaoIgnorada && confirmouDupMatricula
                ? 'Criar mesmo assim'
                : matTemForteNaoIgnorada
                  ? 'Confirmar duplicata'
                  : 'Registrar Matrícula'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal de Registrar Experimental */}
      {modalOpen === 'experimental' && (
        <Modal title="Registrar Experimental" onClose={() => { setModalOpen(null); setExpForm({ telefone: '', nome: '', canal_origem_id: null, curso_interesse_id: null, data_experimental: '', horario_experimental: '', professor_experimental_id: null }); setExpLeadEncontrado(null); setExpBuscou(false); }}>
          <div className="space-y-4">
            {/* Busca por telefone */}
            <div>
              <Label className="mb-2 block">Telefone do Lead</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="(21) 99999-9999"
                  value={expForm.telefone}
                  onChange={(e) => setExpForm(prev => ({ ...prev, telefone: maskPhone(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && buscarLeadParaExperimental()}
                />
                <Button onClick={buscarLeadParaExperimental} disabled={expBuscando} variant="outline" className="shrink-0">
                  {expBuscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Buscar
                </Button>
              </div>
            </div>

            {/* Lead encontrado */}
            {expLeadEncontrado && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                <p className="text-emerald-400 text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Lead encontrado: <span className="text-white">{expLeadEncontrado.nome}</span>
                </p>
              </div>
            )}

            {/* Formulário de criação (se buscou e não encontrou) */}
            {expBuscou && !expLeadEncontrado && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                <p className="text-amber-400 text-sm font-medium">Lead não encontrado — preencha para criar:</p>
                <div>
                  <Label className="mb-1 block text-xs">Nome</Label>
                  <Input value={expForm.nome} onChange={(e) => setExpForm(prev => ({ ...prev, nome: e.target.value }))} placeholder="Nome do aluno" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs">Canal</Label>
                    <Select value={expForm.canal_origem_id?.toString() || ''} onValueChange={(v) => setExpForm(prev => ({ ...prev, canal_origem_id: v ? parseInt(v) : null }))}>
                      <SelectTrigger><SelectValue placeholder="Canal" /></SelectTrigger>
                      <SelectContent>
                        {canais.map(c => <SelectItem key={c.value} value={c.value!.toString()}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Curso</Label>
                    <Select value={expForm.curso_interesse_id?.toString() || ''} onValueChange={(v) => setExpForm(prev => ({ ...prev, curso_interesse_id: v ? parseInt(v) : null }))}>
                      <SelectTrigger><SelectValue placeholder="Curso" /></SelectTrigger>
                      <SelectContent>
                        {cursos.map(c => <SelectItem key={c.value} value={c.value!.toString()}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Dados da experimental (sempre visível após busca) */}
            {expBuscou && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 space-y-3">
                <p className="text-purple-400 text-sm font-medium">Dados da Experimental</p>
                {expLeadEncontrado && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1 block text-xs">Nome do aluno</Label>
                      <Input value={expForm.nome} onChange={(e) => setExpForm(prev => ({ ...prev, nome: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Curso</Label>
                      <Select value={expForm.curso_interesse_id?.toString() || ''} onValueChange={(v) => setExpForm(prev => ({ ...prev, curso_interesse_id: v ? parseInt(v) : null }))}>
                        <SelectTrigger><SelectValue placeholder="Curso" /></SelectTrigger>
                        <SelectContent>
                          {cursos.map(c => <SelectItem key={c.value} value={c.value!.toString()}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs">Data</Label>
                    <Input type="date" value={expForm.data_experimental} onChange={(e) => setExpForm(prev => ({ ...prev, data_experimental: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Horário</Label>
                    <Input type="time" value={expForm.horario_experimental} onChange={(e) => setExpForm(prev => ({ ...prev, horario_experimental: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Professor</Label>
                    <Select value={expForm.professor_experimental_id?.toString() || ''} onValueChange={(v) => setExpForm(prev => ({ ...prev, professor_experimental_id: v ? parseInt(v) : null }))}>
                      <SelectTrigger><SelectValue placeholder="Professor" /></SelectTrigger>
                      <SelectContent>
                        {professores.map(p => <SelectItem key={p.value} value={p.value!.toString()}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Botão salvar */}
            {expBuscou && (
              <Button
                onClick={handleSaveExperimental}
                disabled={saving || !expForm.nome || !expForm.data_experimental}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Guitar className="w-5 h-5" />}
                {expLeadEncontrado ? 'Agendar Experimental' : 'Criar Lead + Agendar Experimental'}
              </Button>
            )}
          </div>
        </Modal>
      )}

      {/* Modal de Seleção de Tipo de Relatório */}
      {relatorioOpen && !tipoRelatorio && (
        <Modal title={<span className="flex items-center gap-2"><FileText className="w-5 h-5 text-cyan-400" />Gerar Relatório</span>} onClose={() => setRelatorioOpen(false)}>
          <div className="space-y-4">
            {/* Seleção de Período */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <Label className="text-slate-300 text-sm font-medium mb-3 block">Período do Relatório</Label>
              
              {/* Botões de atalho */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { id: 'hoje', label: 'Hoje' },
                  { id: 'ontem', label: 'Ontem' },
                  { id: 'mes_anterior', label: 'Mês anterior' },
                  { id: 'personalizado', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setRelatorioPeriodo(p.id as typeof relatorioPeriodo);
                      const hoje = new Date();
                      if (p.id === 'hoje') {
                        setRelatorioDataInicio(hoje);
                        setRelatorioDataFim(hoje);
                      } else if (p.id === 'ontem') {
                        const ontem = new Date(hoje);
                        ontem.setDate(ontem.getDate() - 1);
                        setRelatorioDataInicio(ontem);
                        setRelatorioDataFim(ontem);
                      } else if (p.id === 'mes_anterior') {
                        const inicioAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
                        const fimAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
                        setRelatorioDataInicio(inicioAnterior);
                        setRelatorioDataFim(fimAnterior);
                      }
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      relatorioPeriodo === p.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600/50'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              
              {/* Seletor de datas personalizado */}
              {relatorioPeriodo === 'personalizado' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Início</Label>
                    <DatePicker
                      date={relatorioDataInicio}
                      onDateChange={(date) => date && setRelatorioDataInicio(date)}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Fim</Label>
                    <DatePicker
                      date={relatorioDataFim}
                      onDateChange={(date) => date && setRelatorioDataFim(date)}
                    />
                  </div>
                </div>
              )}
              
              {/* Exibir período selecionado */}
              <p className="text-xs text-cyan-400 mt-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {relatorioDataInicio.toLocaleDateString('pt-BR')} 
                {relatorioDataInicio.toDateString() !== relatorioDataFim.toDateString() && (
                  <> até {relatorioDataFim.toLocaleDateString('pt-BR')}</>
                )}
              </p>
            </div>

            <p className="text-slate-400 text-sm">Escolha o tipo de relatório:</p>
            
            {/* Relatório Diário */}
            <button
              onClick={() => setTipoRelatorio('diario')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center text-cyan-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Relatório Diário</h4>
                <p className="text-xs text-slate-400">Resumo do período: leads, experimentais, visitas e matrículas</p>
                <div className="flex items-center gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={toggleCronComercial}
                    disabled={loadingCronComercial || !unidadeParaSalvar || unidadeParaSalvar === 'todos'}
                    className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                      cronComercialAtivo ? "bg-emerald-600" : "bg-slate-600",
                      (!unidadeParaSalvar || unidadeParaSalvar === 'todos') && "opacity-40 cursor-not-allowed"
                    )}
                    title={!unidadeParaSalvar || unidadeParaSalvar === 'todos'
                      ? 'Selecione uma unidade'
                      : cronComercialAtivo
                        ? 'Desativar envio automático comercial'
                        : 'Ativar envio automático comercial'
                    }
                  >
                    <span className={cn(
                      "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                      cronComercialAtivo ? "translate-x-[18px]" : "translate-x-[3px]"
                    )} />
                  </button>
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock className="w-3 h-3" />
                    {cronComercialAtivo ? 'Envio automático 20h ativo' : 'Envio automático 20h'}
                  </span>
                </div>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório Semanal */}
            <button
              onClick={() => setTipoRelatorio('semanal')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center text-cyan-400">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Relatório Semanal</h4>
                <p className="text-xs text-slate-400">Resumo com totais, conversões e principais canais</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório Mensal */}
            <button
              onClick={() => setTipoRelatorio('mensal')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center text-cyan-400">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Relatório Mensal Completo</h4>
                <p className="text-xs text-slate-400">Análise completa: conversões, canais, cursos, valores e lista de matrículas</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório de Matrículas */}
            <button
              onClick={() => setTipoRelatorio('matriculas')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center text-cyan-400">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Relatório de Matrículas Detalhado</h4>
                <p className="text-xs text-slate-400">Lista individual de cada matrícula com todos os dados</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório Comparativo Mensal */}
            <button
              onClick={() => setTipoRelatorio('comparativo_mensal')}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-purple-900/20 to-pink-900/20 hover:from-purple-900/30 hover:to-pink-900/30 border border-purple-700/50 hover:border-purple-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-purple-700/50 rounded-lg flex items-center justify-center text-purple-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white flex items-center gap-2">
                  Comparativo Mensal
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">NOVO</span>
                </h4>
                <p className="text-xs text-slate-400">Mês atual vs mês anterior com variações percentuais</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório Comparativo Anual */}
            <button
              onClick={() => setTipoRelatorio('comparativo_anual')}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-blue-900/20 to-cyan-900/20 hover:from-blue-900/30 hover:to-cyan-900/30 border border-blue-700/50 hover:border-blue-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-blue-700/50 rounded-lg flex items-center justify-center text-blue-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white flex items-center gap-2">
                  Comparativo Anual
                  <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">NOVO</span>
                </h4>
                <p className="text-xs text-slate-400">Mesmo mês ano atual vs ano anterior com variações</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>
          </div>
        </Modal>
      )}

      {/* Modal de Visualização do Relatório */}
      {relatorioOpen && tipoRelatorio && (
        <Modal 
          title={
            <span className="flex items-center gap-2">
              {tipoRelatorio === 'diario' && <Calendar className="w-5 h-5 text-cyan-400" />}
              {tipoRelatorio === 'semanal' && <CalendarDays className="w-5 h-5 text-cyan-400" />}
              {tipoRelatorio === 'mensal' && <BarChart3 className="w-5 h-5 text-cyan-400" />}
              {tipoRelatorio === 'matriculas' && <Users className="w-5 h-5 text-cyan-400" />}
              {tipoRelatorio === 'comparativo_mensal' && <TrendingUp className="w-5 h-5 text-purple-400" />}
              {tipoRelatorio === 'comparativo_anual' && <TrendingUp className="w-5 h-5 text-blue-400" />}
              {tipoRelatorio === 'diario' ? 'Relatório Diário' :
               tipoRelatorio === 'semanal' ? 'Relatório Semanal' :
               tipoRelatorio === 'mensal' ? 'Relatório Mensal' :
               tipoRelatorio === 'matriculas' ? 'Relatório de Matrículas' :
               tipoRelatorio === 'comparativo_mensal' ? 'Comparativo Mensal' :
               'Comparativo Anual'}
            </span>
          } 
          onClose={() => { setRelatorioOpen(false); setTipoRelatorio(null); setRelatorioTexto(''); }}
        >
          <div className="space-y-4">
            <button
              onClick={() => { setTipoRelatorio(null); setRelatorioTexto(''); }}
              className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1"
            >
              ← Voltar para seleção
            </button>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-400 text-sm">Edite o relatório antes de copiar:</Label>
                <button
                  onClick={async () => {
                    if (tipoRelatorio === 'diario') {
                      const texto = await gerarRelatorioDiario();
                      setRelatorioTexto(texto);
                    } else if (tipoRelatorio === 'semanal') {
                      const texto = await gerarRelatorioSemanal();
                      setRelatorioTexto(texto);
                    } else if (tipoRelatorio === 'mensal') {
                      const texto = await gerarRelatorioMensal();
                      setRelatorioTexto(texto);
                    } else if (tipoRelatorio === 'matriculas') {
                      const texto = await gerarRelatorioMatriculas();
                      setRelatorioTexto(texto);
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Resetar
                </button>
              </div>
              <textarea
                value={relatorioTexto}
                onChange={(e) => setRelatorioTexto(e.target.value)}
                className="w-full h-96 p-4 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-300 font-mono resize-none focus:border-cyan-500 focus:outline-none scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600"
                placeholder="O relatório aparecerá aqui..."
              />
              <p className="text-xs text-slate-500 mt-2">
                💡 Você pode editar qualquer parte do relatório: nomes, números, adicionar observações, etc.
              </p>
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={async () => {
                  if (relatorioTexto) {
                    const copyResult = await copyTextToClipboard(relatorioTexto);

                    if (copyResult.ok) {
                      toast.success('Relatório copiado!');
                      return;
                    }

                    console.error('Erro ao copiar relatório comercial:', copyResult.error);
                    toast.error(`Erro ao copiar. Selecione o texto e pressione ${getManualCopyShortcut()}.`);
                  } else {
                    toast.error('Aguarde o relatório ser gerado');
                  }
                }}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500"
              >
                <Copy className="w-5 h-5 mr-2" />
                Copiar
              </Button>
              {usuario?.email === 'hugo@lamusic.com.br' && (
                <input
                  type="text"
                  placeholder="Teste: 5521..."
                  value={numeroTeste}
                  onChange={e => setNumeroTeste(e.target.value)}
                  className="px-3 py-1.5 bg-slate-900/60 border border-amber-500/30 rounded-lg text-xs text-white placeholder-slate-500 w-40"
                />
              )}
              <Button
                onClick={enviarWhatsAppGrupo}
                disabled={!relatorioTexto || enviandoWhatsApp}
                className={cn(
                  'flex-1 transition-all',
                  enviadoWhatsApp 
                    ? 'bg-emerald-500' 
                    : erroWhatsApp 
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-green-600 hover:bg-green-700'
                )}
              >
                {enviandoWhatsApp ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : enviadoWhatsApp ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Enviado!
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    WhatsApp
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PLANO DE AÇÃO INTELIGENTE (IA) */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <PlanoAcaoComercial 
        unidadeId={isAdmin ? (context?.unidadeSelecionada || 'todos') : (unidadeId || 'todos')}
        ano={competencia.filtro.ano}
        mes={competencia.filtro.mes}
      />

      {/* AlertDialog de Confirmação de Exclusão */}
      {/* AlertDialog de exclusão individual */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de exclusão de matrícula (apaga o ALUNO) */}
      <AlertDialog open={deleteMatriculaId !== null} onOpenChange={(open) => !open && setDeleteMatriculaId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir matrícula</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Isto vai apagar o <strong className="text-slate-200">cadastro do aluno</strong> definitivamente — ele some da Gestão de Alunos e dos relatórios. Esta ação não pode ser desfeita. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteMatricula}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Excluir aluno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de exclusão em lote */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={(open) => !open && setShowBulkDeleteDialog(false)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          {(() => {
            const ids = Array.from(selecionadosFunil);
            const bloqueados = ids.filter(id => leadVeioDoEmusys(id)).length;
            const livres = ids.length - bloqueados;
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">
                    {livres === 0
                      ? 'Nenhum desses registros pode ser excluído'
                      : `Excluir ${livres} lead${livres > 1 ? 's' : ''} permanentemente?`}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    {bloqueados > 0 ? (
                      <>
                        🔒 {bloqueados} {bloqueados > 1 ? 'vieram' : 'veio'} da automação (Emusys) e {bloqueados > 1 ? 'serão mantidos' : 'será mantido'}.
                        {livres > 0 && <> Só {livres} registro{livres > 1 ? 's' : ''} manual{livres > 1 ? 'is' : ''} {livres > 1 ? 'serão excluídos' : 'será excluído'}.</>}
                        {' '}Se algum registro do Emusys está duplicado ou errado, contate o time de TI para corrigir na origem.
                      </>
                    ) : (
                      'Esta ação não pode ser desfeita. Todos os registros selecionados serão removidos permanentemente.'
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={excluindoEmLote} className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600">
                    {livres === 0 ? 'Fechar' : 'Cancelar'}
                  </AlertDialogCancel>
                  {livres > 0 && (
                    <AlertDialogAction
                      onClick={confirmDeleteEmLote}
                      disabled={excluindoEmLote}
                      className="bg-red-600 hover:bg-red-500 text-white"
                    >
                      {excluindoEmLote ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Excluindo...</>
                      ) : (
                        <><Trash2 className="w-4 h-4 mr-2" /> Excluir {livres}</>
                      )}
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}

      {/* Modal Matricular via mover etapa */}
      <ModalMatricular
        aberto={!!leadParaMatricular}
        onClose={() => setLeadParaMatricular(null)}
        onSalvo={() => { setLeadParaMatricular(null); loadData(); }}
        lead={leadParaMatricular}
      />

      {/* Modal Arquivar via mover etapa */}
      <ModalArquivar
        aberto={!!leadParaArquivar}
        onClose={() => setLeadParaArquivar(null)}
        onSalvo={() => { setLeadParaArquivar(null); loadData(); }}
        lead={leadParaArquivar}
      />

      {/* Modal Editar Lead */}
      <ModalEditarLead
        aberto={!!leadParaEditar}
        onClose={() => setLeadParaEditar(null)}
        onSalvo={(patch: LeadEditPatch) => {
          setLeadParaEditar(null);
          const apply = (l: any) => l.id === patch.id ? { ...l, ...patch } : l;
          setLeadsMes(prev => prev.map(apply));
          setExperimentaisMes(prev => prev.map(apply));
          setVisitasMes(prev => prev.map(apply));
        }}
        lead={leadParaEditar?.lead ?? null}
        experimentalId={leadParaEditar?.experimentalId}
      />


    </div>
  );
}

// Componente Modal reutilizável com scrollbar sutil para dark mode
function Modal({ title, children, onClose }: { title: string | React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
          {children}
        </div>
      </div>
    </div>
  );
}

export default ComercialPage;
