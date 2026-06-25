import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { api, formatCurrency, getMesNome } from './services/api';
import { supabase } from './services/supabase';
import { Colaborador, FolhaMensal, Lancamento, TotaisFolha, Alerta, UserProfile } from './types';
import { Card, Badge, LoadingSpinner, ErrorState, CustomSelect, ConfirmDialog, AlertDialog, Modal, Tooltip } from './components/UI';
import { MobileCollaboratorList } from './components/colaboradores/MobileCollaboratorList';
import { KPICard, DistributionChart, EvolutionChart } from './components/DashboardWidgets';
import { 
  DollarSign, Users, Building, AlertTriangle, CheckCircle, 
  Calendar, Bell, BarChart3, FileText, 
  TrendingUp, TrendingDown, Filter, Clock, XCircle, ChevronDown, ChevronUp, Database, ShieldCheck, CreditCard,
  LineChart as LineChartIcon,
  Copy, Plus, Search, Check, Loader2, Trash2, LayoutGrid, List, Music, Edit2, UserX, Sparkles, Lightbulb, Coins, LogOut, Menu, X
} from 'lucide-react';
import { 
  CollaboratorCard, 
  CollaboratorModal, 
  DEPARTMENT_LABELS, 
  DEPARTMENT_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
  CONTRACT_LABELS,
  cn
} from './components/CollaboratorComponents';
import { Sidebar } from './components/Sidebar';
import { ContasPagarPage } from './components/contas/ContasPagarPage';
import { AgendaPage } from './components/agenda/AgendaPage';
import { NotificacoesPage } from './components/notificacoes/NotificacoesPage';
import InstallPWAPrompt from './components/ui/InstallPWAPrompt';


const parseBRL = (raw: string) => {
  const cleaned = (raw || '')
    .replace(/\s/g, '')
    .replace(/^R\$\s?/i, '')
    .replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(cleaned) || 0;
};

const formatBRLInput = (value: number) => {
  const abs = Math.abs(value || 0);
  return abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Inline editable cell component (MusiClass-like)
const CellInput: React.FC<{
  value: number;
  onSave: (val: number) => Promise<void>;
  disabled?: boolean;
  colorClass?: string;
}> = ({ value, onSave, disabled, colorClass = 'text-slate-200' }) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const [localValue, setLocalValue] = React.useState<string>(() => (value ? formatBRLInput(value) : ''));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    // Sync when external value changes (only when not editing)
    if (!isFocused) {
      setLocalValue(value ? formatBRLInput(value) : '');
    }
  }, [value, isFocused]);

  const handleBlur = async () => {
    setIsFocused(false);

    const numericVal = Math.abs(parseBRL(localValue));
    const current = Math.abs(value || 0);

    if (numericVal === current) {
      setLocalValue(current === 0 ? '' : formatBRLInput(current));
      return;
    }

    setSaving(true);
    setError(false);
    try {
      await onSave(numericVal);
    } catch (err) {
      console.error('Erro ao salvar célula:', err);
      setError(true);
      setLocalValue(current === 0 ? '' : formatBRLInput(current));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      const current = Math.abs(value || 0);
      setLocalValue(current === 0 ? '' : formatBRLInput(current));
      (e.target as HTMLInputElement).blur();
    }
  };

  const displayValue = Math.abs(value || 0);

  return (
    <div
      className={[
        'relative w-full min-h-[38px] transition-all rounded-lg',
        saving ? 'opacity-60 pointer-events-none' : '',
        error ? 'bg-rose-500/10' : '',
        isFocused ? 'ring-2 ring-violet-500/50 z-20' : '',
      ].join(' ')}
    >
      {/* Display layer (visible when not focused) */}
      {!isFocused && (
        <div className="absolute inset-0 flex items-center justify-end px-3 py-2 font-mono text-xs text-slate-400 pointer-events-none">
          {displayValue === 0 ? '—' : formatCurrency(displayValue)}
        </div>
      )}

      <input
        type="text"
        className={[
          'w-full min-h-[38px] px-3 py-2 bg-transparent text-right font-bold focus:outline-none transition-all text-xs font-mono rounded-lg',
          isFocused ? colorClass : 'text-transparent select-none',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text hover:bg-slate-700/30',
        ].join(' ')}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={isFocused ? '0,00' : ''}
        disabled={!!disabled}
        inputMode="decimal"
      />

      {saving && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2">
          <Loader2 size={12} className="animate-spin text-violet-400" />
        </div>
      )}
    </div>
  );
};

const MOBILE_LANC_PAGE_SIZE = 18;

const loginStyles = `
  @keyframes float {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(10deg); }
  }
  .animate-float { animation: float 6s ease-in-out infinite; }
  
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.4); }
    50% { box-shadow: 0 0 40px rgba(168, 85, 247, 0.6); }
  }
  .pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }

  .glass {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
`;

export default function App() {
  // Auth
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const isAna = (email?: string | null) => !!email && email.toLowerCase() === 'rh@lamusicschool.com.br';
  const isLuciano = (email?: string | null) => !!email && email.toLowerCase() === 'lucianoalf.la@gmail.com';

  const getDefaultAvatarByEmail = (email?: string | null) => {
    if (isAna(email)) return '/Avatar_Ana.png';
    if (isLuciano(email)) return '/Avatar_Alf.png';
    return null;
  };

  const [currentModule, setCurrentModule] = useState<'folha' | 'contas' | 'agenda' | 'notificacoes'>('folha');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [unidadeFiltro, setUnidadeFiltro] = useState('todos');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [contasCompetenciaYM, setContasCompetenciaYM] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });

  const [variacoesOpen, setVariacoesOpen] = useState(true);
  const [insightsIAOpen, setInsightsIAOpen] = useState(true);
  // Folha > Lançamentos (mobile): sem bottom-sheet. Unidades + Ações ficam sempre visíveis.

  // Track window resize for mobile adjustments
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [mobileCollabDetail, setMobileCollabDetail] = useState<Colaborador | null>(null);
  const [isCollabModalOpen, setIsCollabModalOpen] = useState(false);
  const [editingCollab, setEditingCollab] = useState<Colaborador | null>(null);
  const [collabSearch, setCollabSearch] = useState('');
  const [collabDeptFilter, setCollabDeptFilter] = useState('all');
  const [collabStatusFilter, setCollabStatusFilter] = useState('active');

  // Debug instrumentation removida (evita overhead e ruído em produção).

  // Modal & Dialog states
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'primary';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: 'danger' | 'primary';
  }>({ isOpen: false, title: '', message: '', variant: 'primary' });

  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateConfig, setDuplicateConfig] = useState<{ fromFolhaId: string; unidade: string }>({ 
    fromFolhaId: '', 
    unidade: 'todos' 
  });

  // Reset filter when changing tabs to avoid UX confusion
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    // Reset filter only for Folha, to avoid confusing the Finance module UX
    if (currentModule === 'folha') setUnidadeFiltro('todos');
  };

  const MODULE_CONFIG = {
    folha: {
      title: 'Folha de Pagamento',
      subtitle: 'GESTÃO DE PESSOAL E LANÇAMENTOS',
      icon: Users,
      tabs: [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
        { id: 'colaboradores', label: 'Colaboradores', icon: Users },
        { id: 'lancamentos', label: 'Lançamentos', icon: FileText },
        { id: 'comparativo', label: 'Comparativo', icon: TrendingUp },
      ]
    },
    contas: {
      title: 'Contas a Pagar',
      subtitle: 'CONTROLE OPERACIONAL DE DESPESAS',
      icon: CreditCard,
      tabs: [
        { id: 'dashboard', label: 'Resumo', icon: LineChartIcon },
        { id: 'visao-geral', label: 'Contas a Pagar', icon: BarChart3 },
        { id: 'todas', label: 'Auditoria', icon: FileText },
        { id: 'comparativo', label: 'Comparativo', icon: TrendingUp },
        { id: 'categorias', label: 'Categorias', icon: Calendar },
      ]
    },
    agenda: {
      title: 'Agenda',
      subtitle: 'COMPROMISSOS E TAREFAS',
      icon: Calendar,
      tabs: []
    },
    notificacoes: {
      title: 'Notificações',
      subtitle: 'WHATSAPP E ALERTAS AUTOMÁTICOS',
      icon: Bell,
      tabs: []
    }
  };

  // Navegação global (atalhos dentro das telas podem disparar um CustomEvent)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { module?: string; page?: string } | undefined;
      if (!detail?.module) return;

      const mod = detail.module as 'folha' | 'contas' | 'agenda' | 'notificacoes';
      setCurrentModule(mod);

      if (detail.page) {
        setActiveTab(detail.page);
      } else {
        if (mod === 'folha') setActiveTab('dashboard');
        if (mod === 'contas') setActiveTab('dashboard');
        if (mod === 'agenda') setActiveTab('agenda');
        if (mod === 'notificacoes') setActiveTab('notificacoes');
      }

      if (mod === 'folha') setUnidadeFiltro('todos');
    };

    window.addEventListener('la:navigate', handler as EventListener);
    return () => window.removeEventListener('la:navigate', handler as EventListener);
  }, []);

  const handleNavigate = (module: string, page?: string) => {
    const mod = module as 'folha' | 'contas' | 'agenda' | 'notificacoes';
    setCurrentModule(mod);
    
    if (page) {
      setActiveTab(page);
    } else {
      if (mod === 'folha') setActiveTab('dashboard');
      if (mod === 'contas') setActiveTab('dashboard');
      if (mod === 'agenda') setActiveTab('agenda');
      if (mod === 'notificacoes') setActiveTab('notificacoes');
    }
    
    if (mod === 'folha') setUnidadeFiltro('todos');
  };

  // Deep-linking for PWA shortcuts (/?module=agenda|contas|folha|notificacoes)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const moduleParam = (params.get('module') || '').toLowerCase();
      const pageParam = (params.get('page') || '').toLowerCase();

      if (moduleParam === 'folha' || moduleParam === 'contas' || moduleParam === 'agenda' || moduleParam === 'notificacoes') {
        handleNavigate(moduleParam, pageParam || undefined);

        // Keep URL clean (remove only module/page)
        params.delete('module');
        params.delete('page');
        const nextSearch = params.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAiInsights = async (folhaId: number) => {
    setAiInsightsLoading(true);
    setAiInsightsError(null);
    try {
      const data = await api.fetchFolhaAiInsights({ folhaId });
      setAiInsights(data);
    } catch (err: any) {
      setAiInsights(null);
      setAiInsightsError(err?.message || 'Falha ao gerar insights');
    } finally {
      setAiInsightsLoading(false);
    }
  };

  const handleSaveNote = async (colaboradorId: number) => {
    if (!selectedFolhaId) return;
    const nota = (noteDrafts[colaboradorId] ?? '').trim();
    setNoteSaving((prev) => ({ ...prev, [colaboradorId]: true }));
    try {
      await api.upsertColaboradorVariacaoNota({ folhaId: selectedFolhaId, colaboradorId, nota });
      setNoteSaved((prev) => ({ ...prev, [colaboradorId]: true }));
      setTimeout(() => setNoteSaved((prev) => ({ ...prev, [colaboradorId]: false })), 2000);
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: err?.message || 'Falha ao salvar motivo', variant: 'danger' });
    } finally {
      setNoteSaving((prev) => ({ ...prev, [colaboradorId]: false }));
    }
  };

  const [expandedDept, setExpandedDept] = useState<Record<string, boolean>>({ 
    staff_rateado: false, 
    equipe_operacional: false, 
    professores: false 
  });
  const [editingLancamento, setEditingLancamento] = useState<Lancamento | null>(null);
  const [isCreatingLancamento, setIsCreatingLancamento] = useState(false);
  const [draftLancamento, setDraftLancamento] = useState<Partial<Lancamento>>({});
  
  // Data State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [folhas, setFolhas] = useState<FolhaMensal[]>([]);
  const [folhaAtual, setFolhaAtual] = useState<FolhaMensal | null>(null);
  const [selectedFolhaId, setSelectedFolhaId] = useState<number | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [lancamentosAnteriores, setLancamentosAnteriores] = useState<Lancamento[]>([]);
  const [statusFolha, setStatusFolha] = useState<string>('rascunho');
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  // Lancamentos (mobile premium) — declarado após Data State para evitar TDZ
  const [lancamentosSearch, setLancamentosSearch] = useState('');
  const deferredLancSearch = useDeferredValue(lancamentosSearch);
  const [lancamentosVisibleByDept, setLancamentosVisibleByDept] = useState<Record<string, number>>({
    staff_rateado: MOBILE_LANC_PAGE_SIZE,
    equipe_operacional: MOBILE_LANC_PAGE_SIZE,
    professores: MOBILE_LANC_PAGE_SIZE,
  });
  const deptHeaderRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [mobileLancDetail, setMobileLancDetail] = useState<Lancamento | null>(null);
  const [mobileLancObs, setMobileLancObs] = useState('');
  const [mobileLancObsSaving, setMobileLancObsSaving] = useState(false);

  // Persist collapse state (Lancamentos)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('la:folha:lancamentos:expanded');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setExpandedDept((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('la:folha:lancamentos:expanded', JSON.stringify(expandedDept));
    } catch {}
  }, [expandedDept]);

  // Reset "mostrar mais" quando filtros/pesquisa/mês mudarem
  useEffect(() => {
    setLancamentosVisibleByDept({
      staff_rateado: MOBILE_LANC_PAGE_SIZE,
      equipe_operacional: MOBILE_LANC_PAGE_SIZE,
      professores: MOBILE_LANC_PAGE_SIZE,
    });
  }, [unidadeFiltro, selectedFolhaId, deferredLancSearch]);

  useEffect(() => {
    // Sync observação do lançamento selecionado
    setMobileLancObs(mobileLancDetail?.observacao || '');
  }, [mobileLancDetail?.id]);

  // IA (Comparativo)
  const [aiInsights, setAiInsights] = useState<any | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);
  const [anaNote, setAnaNote] = useState('');
  const [anaNoteSaving, setAnaNoteSaving] = useState(false);
  const [anaNoteSaved, setAnaNoteSaved] = useState(false);

  // Motivos (Ana) por colaborador no mês selecionado
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [noteSaving, setNoteSaving] = useState<Record<number, boolean>>({});
  const [noteSaved, setNoteSaved] = useState<Record<number, boolean>>({});

  // Alert note modal (saves into the same memory table used by IA)
  const [alertNoteModal, setAlertNoteModal] = useState<{
    isOpen: boolean;
    colaboradorId: number | null;
    titulo: string;
    descricao: string;
  }>({ isOpen: false, colaboradorId: null, titulo: '', descricao: '' });
  const [alertNoteText, setAlertNoteText] = useState('');
  const [alertNoteSaving, setAlertNoteSaving] = useState(false);
  const [alertNoteSaved, setAlertNoteSaved] = useState(false);

  // ... (dentro de handleSaveNote ou similar)
  const handleSaveAnaNote = async () => {
    if (!selectedFolhaId) return;
    setAnaNoteSaving(true);
    try {
      await api.updateFolhaMensal(selectedFolhaId, { notas_rh: anaNote });
      setAnaNoteSaved(true);
      setTimeout(() => setAnaNoteSaved(false), 2000);
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: err?.message || 'Falha ao salvar nota da Ana', variant: 'danger' });
    } finally {
      setAnaNoteSaving(false);
    }
  };

  const openAlertNote = (alerta: Alerta) => {
    if (!alerta.id) return;
    setAlertNoteText(noteDrafts[alerta.id] ?? '');
    setAlertNoteSaved(false);
    setAlertNoteModal({
      isOpen: true,
      colaboradorId: alerta.id,
      titulo: alerta.titulo,
      descricao: alerta.descricao,
    });
  };

  const saveAlertNote = async (opts?: { markChecked?: boolean }) => {
    const colabId = alertNoteModal.colaboradorId;
    if (!selectedFolhaId || !colabId) return;
    if (alertNoteSaving) return;
    const nota = (alertNoteText ?? '').trim();

    setAlertNoteSaving(true);
    try {
      // Persist to the same table the IA reads (colaborador_variacao_notas)
      await api.upsertColaboradorVariacaoNota({ folhaId: selectedFolhaId, colaboradorId: colabId, nota });
      setNoteDrafts((prev) => ({ ...prev, [colabId]: nota }));
      setAlertNoteSaved(true);
      setTimeout(() => setAlertNoteSaved(false), 2000);

      if (opts?.markChecked) {
        await handleCheckAlert(colabId);
      }
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: err?.message || 'Falha ao salvar motivo do alerta', variant: 'danger' });
    } finally {
      setAlertNoteSaving(false);
    }
  };

  const filteredColaboradores = useMemo(() => {
    return colaboradores.filter(c => {
      const matchesSearch = c.nome.toLowerCase().includes(collabSearch.toLowerCase()) || 
                           c.email?.toLowerCase().includes(collabSearch.toLowerCase()) ||
                           c.funcao?.toLowerCase().includes(collabSearch.toLowerCase());
      const matchesDept = collabDeptFilter === 'all' || c.departamento === collabDeptFilter;
      const matchesStatus = collabStatusFilter === 'all' || c.status === collabStatusFilter;
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [colaboradores, collabSearch, collabDeptFilter, collabStatusFilter]);

  // If salario_base isn't filled in colaboradores yet, derive it from the selected month launches (sum of "salario")
  const baseSalaryByColabId = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of lancamentos) {
      const prev = map.get(l.colaborador_id) || 0;
      map.set(l.colaborador_id, prev + (Number(l.salario) || 0));
    }
    return map;
  }, [lancamentos]);

  const getEffectiveBaseSalary = (c: Colaborador) => {
    const stored = Number((c as any).salario_base) || 0;
    if (stored > 0) return stored;
    return baseSalaryByColabId.get(c.id) || 0;
  };

  const filteredColaboradoresWithBase = useMemo(() => {
    return filteredColaboradores.map((c) => ({
      ...c,
      salario_base: getEffectiveBaseSalary(c),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredColaboradores, baseSalaryByColabId]);

  const handleSaveCollab = async (data: Partial<Colaborador>) => {
    try {
      if (editingCollab) {
        await api.updateColaborador(editingCollab.id, data);
      } else {
        await api.createColaborador(data);
      }
      const metadata = await fetchMetadata();
      if (metadata && selectedFolhaId) {
        await loadMonthData(selectedFolhaId, metadata.folhasData);
      }
      setAlertState({ isOpen: true, title: 'Sucesso', message: 'Colaborador salvo com sucesso.', variant: 'primary' });
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: err.message, variant: 'danger' });
    }
  };

  const handleToggleInactiveCollab = async (c: Colaborador) => {
    const isActive = c.status === 'active';
    setConfirmState({
      isOpen: true,
      title: isActive ? 'Inativar Colaborador' : 'Reativar Colaborador',
      message: isActive
        ? `Deseja inativar ${c.nome}? Ele(a) deixará de aparecer como ativo(a) nas seleções.`
        : `Deseja reativar ${c.nome}?`,
      variant: 'primary',
      onConfirm: async () => {
        try {
          await api.updateColaborador(c.id, {
            status: isActive ? 'inactive' : 'active',
            ativo: !isActive,
          } as any);
          await fetchMetadata();
        } catch (err: any) {
          setAlertState({ isOpen: true, title: 'Erro', message: err.message, variant: 'danger' });
        }
      },
    });
  };

  const handleDeleteCollab = async (c: Colaborador) => {
    setConfirmState({
      isOpen: true,
      title: 'Excluir Colaborador',
      message: `Deseja remover ${c.nome} permanentemente?`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteColaborador(c.id);
          await fetchMetadata();
          setAlertState({ isOpen: true, title: 'Sucesso', message: 'Colaborador removido.', variant: 'primary' });
        } catch (err: any) {
          setAlertState({ isOpen: true, title: 'Erro', message: err.message, variant: 'danger' });
        }
      }
    });
  };

  const computeLancamentoTotal = (l: Pick<Lancamento, 'salario'|'bonus'|'comissao'|'reembolso'|'passagem'|'inss'|'descontos'>) => {
    return (
      (Number(l.salario) || 0) +
      (Number(l.bonus) || 0) +
      (Number(l.comissao) || 0) +
      (Number(l.reembolso) || 0) +
      (Number(l.passagem) || 0) -
      (Number(l.inss) || 0) -
      (Number(l.descontos) || 0)
    );
  };

  const refetchLancamentosSilent = async () => {
    if (!folhaAtual) return;
    try {
      const currentLancData = await api.fetchLancamentos(folhaAtual.id);
      setLancamentos(currentLancData);
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: err.message || 'Erro ao recarregar lançamentos', variant: 'danger' });
    }
  };

  const saveLancamentoPatch = async (l: Lancamento, patch: Partial<Lancamento>) => {
    const next = { ...l, ...patch } as Lancamento;
    const total = computeLancamentoTotal(next);

    try {
      // Persist ONLY the field (total is generated by DB)
      await api.updateLancamento(l.id, patch);

      // Optimistic update to avoid "não persistiu" perception
      setLancamentos(prev => prev.map(x => x.id === l.id ? ({ ...x, ...patch, total }) : x));

      // Silent refetch to guarantee consistency with DB (no loading global)
      await refetchLancamentosSilent();
    } catch (err: any) {
      console.error('Erro no saveLancamentoPatch:', err);
      throw err; // Re-throw to be caught by CellInput
    }
  };

  const fetchMetadata = async () => {
    try {
      const [colabsData, folhasData] = await Promise.all([
        api.fetchColaboradores(),
        api.fetchFolhasMensais()
      ]);
      setColaboradores(colabsData);
      setFolhas(folhasData);
      if (folhasData.length > 0 && !selectedFolhaId) {
        setSelectedFolhaId(folhasData[0].id);
      }
      return { colabsData, folhasData };
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar metadados');
      setLoading(false);
      return null;
    }
  };

  const loadMonthData = async (folhaId: number, allFolhas: FolhaMensal[]) => {
    setLoading(true);
    setError(null);
    try {
      const currentFolha = allFolhas.find(f => f.id === folhaId) || allFolhas[0];
      setFolhaAtual(currentFolha);
      setStatusFolha(currentFolha.status);

      const currentIdx = allFolhas.findIndex(f => f.id === currentFolha.id);
      const prevFolha = currentIdx < allFolhas.length - 1 ? allFolhas[currentIdx + 1] : null;

      const [currentLancData, prevLancData] = await Promise.all([
        api.fetchLancamentos(currentFolha.id),
        prevFolha ? api.fetchLancamentos(prevFolha.id) : Promise.resolve([])
      ]);

      setLancamentos(currentLancData);
      setLancamentosAnteriores(prevLancData);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar dados do mês');
    } finally {
      setLoading(false);
    }
  };

  // Initial load: Fetch colaboradores and available months
  useEffect(() => {
    // Supabase Auth session bootstrap
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setUserEmail(data.session?.user?.email ?? null);
        setUserId(data.session?.user?.id ?? null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
      setUserId(session?.user?.id ?? null);
    });

    // Supabase Realtime: Intelligent auto-refresh
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos_folha' }, () => {
    loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folhas_mensais' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  // Load user profile (user_profiles) after auth is ready
  useEffect(() => {
    if (!userId) {
      setUserProfile(null);
      return;
    }
    (async () => {
      try {
        const profile = await api.fetchUserProfile(userId);
        setUserProfile(profile);
      } catch {
        // non-blocking; profile is optional
        setUserProfile(null);
      }
    })();
  }, [userId]);

  // Simple in-app login page (no router) – production will have signups disabled in Supabase.
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginSubmitting) return;
    setLoginSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      setAlertState({ isOpen: true, title: 'Bem-vindo(a)', message: 'Login realizado com sucesso.', variant: 'primary' });
      setLoginPassword('');
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Falha no login', message: err?.message || 'Credenciais inválidas.', variant: 'danger' });
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUserProfile(null);
    } catch {
      // ignore
    }
  };

  // Profile modal
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string>('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);

  const openProfile = () => {
    setProfileName(userProfile?.nome || (isAna(userEmail) ? 'Ana Paula' : isLuciano(userEmail) ? 'Luciano Alf' : ''));
    setProfileAvatar(userProfile?.avatar_url || getDefaultAvatarByEmail(userEmail) || '');
    setProfileSaved(false);
    setIsProfileOpen(true);
    setProfilePopoverOpen(false); // Fecha o popover ao abrir o modal
  };

  const handlePickProfileAvatar = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAlertState({ isOpen: true, title: 'Arquivo inválido', message: 'Selecione uma imagem (PNG/JPG/WebP).', variant: 'danger' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setProfileAvatar(result);
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    if (!userId) return;
    if (profileSaving) return;
    const nome = (profileName || '').trim() || (isAna(userEmail) ? 'Ana Paula' : isLuciano(userEmail) ? 'Luciano Alf' : 'Usuário');
    const role: UserProfile['role'] = isAna(userEmail) ? 'rh' : isLuciano(userEmail) ? 'admin' : 'user';

    setProfileSaving(true);
    try {
      const saved = await api.upsertUserProfile({
        id: userId,
        nome,
        role,
        avatar_url: profileAvatar || null,
      });
      setUserProfile(saved);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
      setIsProfileOpen(false);
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: err?.message || 'Falha ao salvar perfil', variant: 'danger' });
    } finally {
      setProfileSaving(false);
    }
  };

  const tipoLabels: Record<string, string> = {
    pj: 'PJ', clt: 'CLT', estagiario: 'Estag.', diarista: 'Diarista', pensao: 'Pensão', mensal_fixo: 'Mensal'
  };

  // Initial load: Fetch colaboradores and available months
  useEffect(() => {
    if (userEmail) {
      fetchMetadata();
    }
  }, [userEmail]);

  // Fetch month data when selection changes
  useEffect(() => {
    if (selectedFolhaId && folhas.length > 0) {
      loadMonthData(selectedFolhaId, folhas);
    }
  }, [selectedFolhaId, folhas]);

  const loadData = async () => {
    const data = await fetchMetadata();
    if (data && selectedFolhaId) {
      await loadMonthData(selectedFolhaId, data.folhasData);
    }
  };

  // Calculations
  const totais: TotaisFolha = useMemo(() => {
    if (!folhaAtual) return { totalGeral: 0, totalCG: 0, totalRec: 0, totalBar: 0, headcount: { total: 0, cg: 0, rec: 0, bar: 0 } };
    
    const headcountCG = new Set(lancamentos.filter(l => l.unidade === 'cg').map(l => l.colaborador_id)).size;
    const headcountRec = new Set(lancamentos.filter(l => l.unidade === 'rec').map(l => l.colaborador_id)).size;
    const headcountBar = new Set(lancamentos.filter(l => l.unidade === 'bar').map(l => l.colaborador_id)).size;
    const totalUnico = new Set(lancamentos.map(l => l.colaborador_id)).size;

    // For draft months, prefer live totals from launches (so edits/duplication reflect immediately)
    const liveTotalCG = lancamentos.filter(l => l.unidade === 'cg').reduce((acc, l) => acc + (l.total || 0), 0);
    const liveTotalRec = lancamentos.filter(l => l.unidade === 'rec').reduce((acc, l) => acc + (l.total || 0), 0);
    const liveTotalBar = lancamentos.filter(l => l.unidade === 'bar').reduce((acc, l) => acc + (l.total || 0), 0);
    const liveTotalGeral = liveTotalCG + liveTotalRec + liveTotalBar;
    
    return {
      totalGeral: folhaAtual.status === 'rascunho' ? liveTotalGeral : (folhaAtual.total_geral || 0),
      totalCG: folhaAtual.status === 'rascunho' ? liveTotalCG : (folhaAtual.total_cg || 0),
      totalRec: folhaAtual.status === 'rascunho' ? liveTotalRec : (folhaAtual.total_rec || 0),
      totalBar: folhaAtual.status === 'rascunho' ? liveTotalBar : (folhaAtual.total_bar || 0),
      headcount: {
        total: totalUnico,
        cg: headcountCG,
        rec: headcountRec,
        bar: headcountBar
      }
    };
  }, [folhaAtual, lancamentos]);

  const aggregatedData = useMemo(() => {
    const currentMap: Record<number, { total: number, nome: string, funcao: string, alert_checked: boolean, id: number }> = {};
    const prevMap: Record<number, { total: number, nome: string, funcao: string }> = {};

    lancamentos.forEach(l => {
      if (!currentMap[l.colaborador_id]) {
        currentMap[l.colaborador_id] = { 
          id: l.id, 
          total: 0, 
          nome: l.colaboradores?.nome || 'N/A', 
          funcao: l.colaboradores?.funcao || 'N/A',
          alert_checked: !!l.alert_checked 
        };
      }
      currentMap[l.colaborador_id].total += (l.total || 0);
      // If any individual launch is not checked, the whole collaborator alert should stay
      if (!l.alert_checked) currentMap[l.colaborador_id].alert_checked = false;
    });

    lancamentosAnteriores.forEach(l => {
      if (!prevMap[l.colaborador_id]) {
        prevMap[l.colaborador_id] = { 
          total: 0, 
          nome: l.colaboradores?.nome || 'N/A', 
          funcao: l.colaboradores?.funcao || 'N/A' 
        };
      }
      prevMap[l.colaborador_id].total += (l.total || 0);
    });

    return { currentMap, prevMap };
  }, [lancamentos, lancamentosAnteriores]);

  const alertas = useMemo(() => {
    const alerts: Alerta[] = [];
    if (totais.totalGeral > 0) {
      const percCG = (totais.totalCG / totais.totalGeral) * 100;
      if (percCG > 45 || percCG < 35) {
        alerts.push({
          severidade: 'warning',
          titulo: 'Distribuição atípica em Campo Grande',
          descricao: `Campo Grande representa ${percCG.toFixed(1)}% da folha total (esperado: 38-42%)`,
        });
      }
    }

    const { currentMap, prevMap } = aggregatedData;

    // Variações de colaboradores > 15% (Agregado)
    Object.keys(currentMap).forEach(idStr => {
      const colabId = Number(idStr);
      const curr = currentMap[colabId];
      const prev = prevMap[colabId];

      if (curr.alert_checked) return;

      if (prev && prev.total > 0) {
        const varPerc = ((curr.total - prev.total) / prev.total) * 100;
        if (Math.abs(varPerc) > 15) {
          alerts.push({
            id: colabId, // Using colabId as reference for checking
            severidade: varPerc > 0 ? 'critical' : 'warning',
            titulo: `Variação alta: ${curr.nome}`,
            descricao: `Variação de ${varPerc > 0 ? '+' : ''}${varPerc.toFixed(1)}% no total agregado (${formatCurrency(prev.total)} → ${formatCurrency(curr.total)})`,
          });
        }
      } else if (lancamentosAnteriores.length > 0) {
        // New employee alert
        alerts.push({
          id: colabId,
          severidade: 'info',
          titulo: `Novo Colaborador: ${curr.nome}`,
          descricao: `Primeiro lançamento na folha: ${formatCurrency(curr.total)}`,
        });
      }
    });

    return alerts;
  }, [totais, aggregatedData, lancamentosAnteriores.length]);

  const filteredAlertas = useMemo(() => {
    if (unidadeFiltro === 'todos') return alertas;
    
    return alertas.filter(alerta => {
      // Find the collaborator in the current month to check their unit
      const colabId = alerta.id;
      if (!colabId) return true; // Keep general alerts like "Distribuição atípica"
      
      const lancs = lancamentos.filter(l => l.colaborador_id === colabId);
      // If any of the collaborator's launches match the selected unit
      return lancs.some(l => l.unidade === unidadeFiltro);
    });
  }, [alertas, unidadeFiltro, lancamentos]);

  const comparativoMensal = useMemo(() => {
    if (!folhaAtual || lancamentosAnteriores.length === 0) return null;
    
    const totalAnterior = lancamentosAnteriores.reduce((acc, l) => acc + (l.total || 0), 0);
    const varTotal = totalAnterior > 0 ? ((totais.totalGeral - totalAnterior) / totalAnterior) * 100 : 0;
    
    const { currentMap, prevMap } = aggregatedData;
    const currentHeadcount = Object.keys(currentMap).length;
    const prevHeadcount = Object.keys(prevMap).length;

    return {
      totalAnterior,
      varTotal,
      headcountAnterior: prevHeadcount,
      varHeadcount: prevHeadcount > 0 
        ? ((currentHeadcount - prevHeadcount) / prevHeadcount) * 100 
        : 0
    };
  }, [folhaAtual, totais, lancamentosAnteriores, aggregatedData]);

  // Ao abrir o Comparativo: carregar insights IA e notas (memória da Ana)
  useEffect(() => {
    if (activeTab !== 'comparativo') return;
    if (!selectedFolhaId) return;
    if (!comparativoMensal) return; // precisa ter mês anterior

    loadAiInsights(selectedFolhaId);

    // Também carregar a nota geral da Ana para a folha
    const folha = folhas.find(f => f.id === selectedFolhaId);
    if (folha) {
      setAnaNote((folha as any).notas_rh || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedFolhaId, comparativoMensal]);

  // Carregar motivos (Ana) para o mês selecionado (usado tanto no Comparativo quanto nos Alertas)
  useEffect(() => {
    if (!selectedFolhaId) return;
    (async () => {
      try {
        const notes = await api.fetchColaboradorVariacaoNotas(selectedFolhaId);
        setNoteDrafts((prev) => {
          const next = { ...prev };
          for (const n of notes) {
            if (typeof n.colaborador_id === 'number') {
              next[n.colaborador_id] = n.nota || '';
            }
          }
          return next;
        });
      } catch {
        // silencioso: notas são opcionais
      }
    })();
  }, [selectedFolhaId]);

  const groupedLancamentos = useMemo(() => {
    let filtered = lancamentos;
    if (unidadeFiltro !== 'todos') {
      filtered = lancamentos.filter(l => l.unidade === unidadeFiltro);
    }
    
    return {
      staff_rateado: filtered.filter(l => l.categoria === 'staff_rateado'),
      equipe_operacional: filtered.filter(l => l.categoria === 'equipe_operacional'),
      professores: filtered.filter(l => l.categoria === 'professores'),
    };
  }, [lancamentos, unidadeFiltro]);

  const groupedLancamentosMobile = useMemo(() => {
    const q = (deferredLancSearch || '').trim().toLowerCase();
    if (!q) return groupedLancamentos;
    const matches = (l: Lancamento) => {
      const nome = (l.colaboradores?.nome || '').toLowerCase();
      const funcao = (l.colaboradores?.funcao || '').toLowerCase();
      return nome.includes(q) || funcao.includes(q);
    };
    return {
      staff_rateado: groupedLancamentos.staff_rateado.filter(matches),
      equipe_operacional: groupedLancamentos.equipe_operacional.filter(matches),
      professores: groupedLancamentos.professores.filter(matches),
    };
  }, [groupedLancamentos, deferredLancSearch]);

  const filteredTotalGeral = useMemo(() => {
    const { staff_rateado, equipe_operacional, professores } = groupedLancamentos;
    const all = [...staff_rateado, ...equipe_operacional, ...professores];
    return all.reduce((acc, l) => acc + (l.total || 0), 0);
  }, [groupedLancamentos]);

  const lancamentosKPIs = useMemo(() => {
    const { staff_rateado, equipe_operacional, professores } = groupedLancamentos;
    
    // Agrupamento do mês anterior para comparação
    let filteredPrev = lancamentosAnteriores;
    if (unidadeFiltro !== 'todos') {
      filteredPrev = lancamentosAnteriores.filter(l => l.unidade === unidadeFiltro);
    }
    const prevStaff = filteredPrev.filter(l => l.categoria === 'staff_rateado');
    const prevOperacional = filteredPrev.filter(l => l.categoria === 'equipe_operacional');
    const prevProfessores = filteredPrev.filter(l => l.categoria === 'professores');

    const sum = (list: Lancamento[]) => list.reduce((acc, l) => acc + (l.total || 0), 0);
    const count = (list: Lancamento[]) => new Set(list.map(l => l.colaborador_id)).size;

    const currentTotal = filteredTotalGeral;
    const prevTotalSum = sum(filteredPrev);

    const calcVar = (curr: number, prev: number) => {
      if (prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    };

    return {
      hasPrev: lancamentosAnteriores.length > 0,
      total: {
        value: currentTotal,
        count: count([...staff_rateado, ...equipe_operacional, ...professores]),
        variation: calcVar(currentTotal, prevTotalSum)
      },
      staff: {
        value: sum(staff_rateado),
        count: count(staff_rateado),
        percent: currentTotal > 0 ? (sum(staff_rateado) / currentTotal) * 100 : 0,
        variation: calcVar(sum(staff_rateado), sum(prevStaff))
      },
      operacional: {
        value: sum(equipe_operacional),
        count: count(equipe_operacional),
        percent: currentTotal > 0 ? (sum(equipe_operacional) / currentTotal) * 100 : 0,
        variation: calcVar(sum(equipe_operacional), sum(prevOperacional))
      },
      professores: {
        value: sum(professores),
        count: count(professores),
        percent: currentTotal > 0 ? (sum(professores) / currentTotal) * 100 : 0,
        variation: calcVar(sum(professores), sum(prevProfessores))
      }
    };
  }, [groupedLancamentos, filteredTotalGeral, lancamentosAnteriores, unidadeFiltro]);

  const evolutionData = useMemo(() => {
    if (folhas.length === 0) return [];
    
    // Desktop: Last 7 months, Mobile: Last 6 months
    const sliceCount = isMobile ? -6 : -7;
    
    return [...folhas]
      .filter(f => f.status === 'aprovada' || f.id === folhaAtual?.id)
      .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
      .slice(sliceCount)
      .map(f => ({
        periodo: `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][f.mes - 1]}/${f.ano.toString().slice(-2)}`,
        total: f.total_geral
      }));
  }, [folhas, folhaAtual, isMobile]);

  const unitData = useMemo(() => [
    { 
        id: 'cg',
        name: 'Campo Grande', 
        value: totais.totalCG, 
        color: '#06b6d4', 
        twColor: 'bg-cyan-500', 
        twText: 'text-cyan-400',
        percent: totais.totalGeral ? ((totais.totalCG / totais.totalGeral) * 100).toFixed(1) : '0.0'
    },
    { 
        id: 'rec',
        name: 'Recreio', 
        value: totais.totalRec, 
        color: '#a855f7',
        twColor: 'bg-purple-500',
        twText: 'text-purple-400',
        percent: totais.totalGeral ? ((totais.totalRec / totais.totalGeral) * 100).toFixed(1) : '0.0'
    },
    { 
        id: 'bar',
        name: 'Barra', 
        value: totais.totalBar, 
        color: '#10b981',
        twColor: 'bg-emerald-500',
        twText: 'text-emerald-400',
        percent: totais.totalGeral ? ((totais.totalBar / totais.totalGeral) * 100).toFixed(1) : '0.0'
    },
  ], [totais]);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!folhaAtual) return;
    try {
      await api.updateFolhaStatus(folhaAtual.id, newStatus);
      setStatusFolha(newStatus);
      setFolhaAtual(prev => prev ? ({ ...prev, status: newStatus as any }) : null);
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: 'Erro ao atualizar status: ' + err.message, variant: 'danger' });
    }
  };

  const handleCheckAlert = async (colaboradorId: number) => {
    if (!folhaAtual) return;
    try {
      await api.markAlertAsChecked(colaboradorId, folhaAtual.id);
      // Update local state to remove the alert immediately for all launches of this collaborator
      setLancamentos(prev => prev.map(l => 
        l.colaborador_id === colaboradorId ? { ...l, alert_checked: true } : l
      ));
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: 'Erro ao confirmar alerta: ' + err.message, variant: 'danger' });
    }
  };

  const currentModuleConfig = MODULE_CONFIG[currentModule];
  const getShortLabel = (id: string) => {
    // Mobile cockpit labels dependem do módulo (pra caber sem scroll e manter semântica)
    if (currentModule === 'contas') {
      const contasMap: Record<string, string> = {
        'dashboard': 'Dash',
        'visao-geral': 'Contas',
        'todas': 'Audit.',
        'comparativo': 'IA',
        'categorias': 'Categ.',
      };
      return contasMap[id] || id;
    }

    const map: Record<string, string> = {
      'dashboard': 'Dash',
      'colaboradores': 'Pessoal',
      'lancamentos': 'Folha',
      'comparativo': 'iA',
      'categorias': 'Categorias',
      'todas': 'Auditoria'
    };
    return map[id] || id;
  };

  const tabs = currentModuleConfig.tabs;

  const contasCompetenciaOptions = useMemo(() => {
    // Lista “boa o suficiente” para mobile: últimos 12 meses + próximo mês
    const hoje = new Date();
    const opts: { value: string; label: string }[] = [];
    for (let i = 12; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      opts.push({ value: ym, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    const prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    const proxYm = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}`;
    if (!opts.some(o => o.value === proxYm)) {
      const label = prox.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      opts.push({ value: proxYm, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return opts;
  }, []);

  const deptLabels: Record<string, string> = {
    staff_rateado: 'Staff Rateado',
    equipe_operacional: 'Equipe Operacional',
    professores: 'Professores',
  };

  const deptColors: Record<string, string> = {
    staff_rateado: 'text-violet-400',
    equipe_operacional: 'text-amber-400',
    professores: 'text-cyan-400',
  };

  const unidadeLabels: Record<string, string> = { cg: 'CG', rec: 'REC', bar: 'BAR' };
  const folhaAnterior = useMemo(() => {
    if (!selectedFolhaId || folhas.length === 0) return null;
    const idx = folhas.findIndex(f => f.id === selectedFolhaId);
    return idx >= 0 && idx < folhas.length - 1 ? folhas[idx + 1] : null;
  }, [selectedFolhaId, folhas]);

  const handleCreateNextMonth = async () => {
    if (!folhaAtual) return;
    const nextMes = folhaAtual.mes === 12 ? 1 : folhaAtual.mes + 1;
    const nextAno = folhaAtual.mes === 12 ? folhaAtual.ano + 1 : folhaAtual.ano;

    const label = `${getMesNome(nextMes)} ${nextAno}`;
    
    setConfirmState({
      isOpen: true,
      title: 'Criar Novo Mês',
      message: `Deseja criar a folha de pagamento para ${label}?`,
      onConfirm: async () => {
        try {
          const created = await api.createFolhaMensal({ ano: nextAno, mes: nextMes });
          await loadData();
          setSelectedFolhaId(created.id);
          setActiveTab('lancamentos');
        } catch (err: any) {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          setAlertState({ isOpen: true, title: 'Erro', message: 'Erro ao criar mês: ' + err.message, variant: 'danger' });
        }
      }
    });
  };

  const handleDeleteMonth = async () => {
    if (!folhaAtual) return;
    
    setConfirmState({
      isOpen: true,
      title: 'Excluir Mês',
      message: `Deseja excluir permanentemente a folha de ${getMesNome(folhaAtual.mes)} ${folhaAtual.ano} e todos os seus lançamentos? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteFolhaMensal(folhaAtual.id);
          const updatedFolhas = folhas.filter(f => f.id !== folhaAtual.id);
          setFolhas(updatedFolhas);
          if (updatedFolhas.length > 0) {
            setSelectedFolhaId(updatedFolhas[0].id);
          } else {
            setSelectedFolhaId(null);
          }
          await loadData();
          setAlertState({ isOpen: true, title: 'Sucesso', message: 'Mês excluído com sucesso.', variant: 'primary' });
        } catch (err: any) {
          setAlertState({ isOpen: true, title: 'Erro', message: 'Erro ao excluir mês: ' + err.message, variant: 'danger' });
        }
      }
    });
  };

  const handleDeleteLancamento = async (l: Lancamento) => {
    setConfirmState({
      isOpen: true,
      title: 'Excluir Lançamento',
      message: `Deseja remover o lançamento de ${l.colaboradores?.nome} (${unidadeLabels[l.unidade]}) desta folha?`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteLancamento(l.id);
          setLancamentos(prev => prev.filter(x => x.id !== l.id));
          setAlertState({ isOpen: true, title: 'Sucesso', message: 'Lançamento removido.', variant: 'primary' });
        } catch (err: any) {
          setAlertState({ isOpen: true, title: 'Erro', message: 'Erro ao excluir lançamento: ' + err.message, variant: 'danger' });
        }
      }
    });
  };

  const handleDuplicateAction = async () => {
    if (!folhaAtual) return;
    if (!duplicateConfig.fromFolhaId) {
      setAlertState({ isOpen: true, title: 'Atenção', message: 'Selecione o mês de origem.', variant: 'primary' });
      return;
    }
    
    const fromFolha = folhas.find(f => f.id === Number(duplicateConfig.fromFolhaId));
    if (!fromFolha) return;

    const fromLabel = `${getMesNome(fromFolha.mes)} ${fromFolha.ano}`;
    const toLabel = `${getMesNome(folhaAtual.mes)} ${folhaAtual.ano}`;
    const unitLabel = duplicateConfig.unidade === 'todos' ? 'Todas' : unidadeLabels[duplicateConfig.unidade];

    setConfirmState({
      isOpen: true,
      title: 'Confirmar Duplicação',
      message: `Deseja duplicar os lançamentos da unidade ${unitLabel} de ${fromLabel} para ${toLabel}?`,
      onConfirm: async () => {
        try {
          let count = 0;
          if (duplicateConfig.unidade === 'todos') {
            const results = await Promise.all([
              api.duplicateLancamentos({ fromFolhaId: fromFolha.id, toFolhaId: folhaAtual.id, unidade: 'cg' }),
              api.duplicateLancamentos({ fromFolhaId: fromFolha.id, toFolhaId: folhaAtual.id, unidade: 'rec' }),
              api.duplicateLancamentos({ fromFolhaId: fromFolha.id, toFolhaId: folhaAtual.id, unidade: 'bar' })
            ]);
            count = results.reduce((a, b) => a + b, 0);
          } else {
            count = await api.duplicateLancamentos({ 
              fromFolhaId: fromFolha.id, 
              toFolhaId: folhaAtual.id, 
              unidade: duplicateConfig.unidade as any 
            });
          }
          await loadMonthData(folhaAtual.id, folhas);
          setIsDuplicateModalOpen(false);
          // Show a custom alert/success instead of native alert if possible, or just let it be for now
          // We can add a toast later.
        } catch (err: any) {
          setAlertState({ isOpen: true, title: 'Erro', message: 'Erro ao duplicar: ' + err.message, variant: 'danger' });
        }
      }
    });
  };

  const openCreateLancamento = () => {
    if (!folhaAtual) return;
    if (unidadeFiltro === 'todos') {
      setAlertState({ isOpen: true, title: 'Atenção', message: 'Para criar lançamentos, selecione uma unidade (não Consolidado).', variant: 'primary' });
      return;
    }
    if (folhaAtual.status !== 'rascunho') {
      setAlertState({ isOpen: true, title: 'Atenção', message: 'Para criar lançamentos, o mês precisa estar em rascunho.', variant: 'primary' });
      return;
    }
    setDraftLancamento({
      folha_id: folhaAtual.id,
      unidade: unidadeFiltro as any,
      categoria: 'staff_rateado',
      salario: 0,
      bonus: 0,
      comissao: 0,
      reembolso: 0,
      passagem: 0,
      inss: 0,
      descontos: 0,
    } as any);
    setIsCreatingLancamento(true);
  };

  const handleSaveLancamento = async () => {
    if (!folhaAtual) return;
    try {
      if (isCreatingLancamento) {
        if (!draftLancamento.colaborador_id) {
          setAlertState({ isOpen: true, title: 'Atenção', message: 'Selecione um colaborador.', variant: 'primary' });
          return;
        }
        await api.createLancamento(draftLancamento as any);
      } else if (editingLancamento) {
        await api.updateLancamento(editingLancamento.id, {
          salario: editingLancamento.salario,
          bonus: editingLancamento.bonus,
          comissao: editingLancamento.comissao,
          reembolso: editingLancamento.reembolso,
          passagem: editingLancamento.passagem,
          inss: editingLancamento.inss,
          descontos: editingLancamento.descontos,
        });
      }
      setEditingLancamento(null);
      setIsCreatingLancamento(false);
      await loadMonthData(folhaAtual.id, folhas);
    } catch (err: any) {
      setAlertState({ isOpen: true, title: 'Erro', message: 'Erro ao salvar lançamento: ' + err.message, variant: 'danger' });
    }
  };

  if (authLoading) {
  return (
      <div className="dark min-h-screen bg-slate-950 text-slate-200 font-sans flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="animate-spin" />
          Carregando sessão...
        </div>
      </div>
    );
  }

  if (!userEmail) {
    const isAnaUser = isAna(loginEmail);
    const isLucianoUser = isLuciano(loginEmail);
    
    const displayAvatar = '/Avatar_Ana.png';
        
    const displayGreeting = isAnaUser 
      ? 'Ana!' 
      : isLucianoUser 
        ? 'Luciano!' 
        : 'Ana!';

    return (
      <div className="dark min-h-screen flex bg-[#0a0d14] text-slate-200 font-sans selection:bg-violet-500/30">
        <style>{loginStyles}</style>
        
        {/* Lado Esquerdo - Branding (Oculto em mobile) */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-950 via-purple-950 to-indigo-950">
          {/* Background Effects */}
          <div className="absolute inset-0 overflow-hidden opacity-30">
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] translate-x-1/2 translate-y-1/2"></div>
          </div>

          {/* Floating Notes */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <Music className="absolute animate-float text-white" style={{ left: '15%', top: '25%', width: '40px', height: '40px' }} />
            <Music className="absolute animate-float text-white" style={{ left: '75%', top: '65%', width: '30px', height: '30px', animationDelay: '2s' }} />
          </div>

          <div className="relative z-10 flex flex-col justify-between p-16 w-full">
            {/* Top Logo */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center shrink-0 group/logo">
                <img src="/logo-LA-colapsed.png" className="w-12 h-12 object-contain transition-transform duration-500 group-hover/logo:scale-110" alt="LA" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-[0.2em] text-white leading-none uppercase">SUPER FOLHA SYSTEM</h1>
                <p className="text-purple-300/60 text-[11px] font-bold uppercase tracking-[0.35em] mt-1.5">Sistema Inteligente</p>
              </div>
            </div>

            {/* Central Hero */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-10 group">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full blur-2xl opacity-40 group-hover:opacity-60 transition-opacity animate-pulse"></div>
                <div className="relative w-40 h-40 rounded-full p-1 bg-gradient-to-br from-violet-400 via-fuchsia-500 to-indigo-400">
                  <div className="w-full h-full rounded-full bg-[#0a0d14] p-1 overflow-hidden shadow-inner">
                    <img src={displayAvatar} alt="User" className="w-full h-full object-cover rounded-full transition-transform duration-700 group-hover:scale-110" />
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 w-6 h-6 bg-emerald-500 rounded-full border-4 border-[#0a0d14]">
                  <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-75"></div>
                </div>
              </div>
              
              <h2 className="text-5xl font-black text-white mb-4 tracking-tight">
                Olá, {displayGreeting} <span className="inline-block animate-bounce">👋</span>
              </h2>
              <p className="text-slate-400 text-lg max-w-sm leading-relaxed font-medium">
                Sua folha de pagamento inteligente está pronta para mais um dia de gestão.
              </p>
            </div>

            {/* Bottom Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass rounded-[2rem] p-5 hover:bg-white/[0.05] transition-all cursor-default group/card">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-3 group-hover/card:scale-110 transition-transform">
                  <Users className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="text-white font-bold text-base leading-tight">71 Colaboradores</h3>
                <p className="text-purple-300/50 text-[10px] font-bold uppercase tracking-wider mt-1">Gestão centralizada</p>
              </div>
              
              <div className="glass rounded-[2rem] p-5 hover:bg-white/[0.05] transition-all cursor-default group/card">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-3 group-hover/card:scale-110 transition-transform">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-white font-bold text-base leading-tight">R$ 150k+</h3>
                <p className="text-purple-300/50 text-[10px] font-bold uppercase tracking-wider mt-1">Folha mensal</p>
              </div>
              
              <div className="glass rounded-[2rem] p-5 hover:bg-white/[0.05] transition-all cursor-default group/card">
                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center mb-3 group-hover/card:scale-110 transition-transform">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-white font-bold text-base leading-tight">100% Seguro</h3>
                <p className="text-purple-300/50 text-[10px] font-bold uppercase tracking-wider mt-1">Dados protegidos</p>
              </div>
              
              <div className="glass rounded-[2rem] p-5 hover:bg-white/[0.05] transition-all cursor-default group/card">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center mb-3 group-hover/card:scale-110 transition-transform">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="text-white font-bold text-base leading-tight">IA Integrada</h3>
                <p className="text-purple-300/50 text-[10px] font-bold uppercase tracking-wider mt-1">Insights automáticos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito - Formulário */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[#0a0d14] relative">
          <div className="w-full max-w-md">
              <div className="lg:hidden flex flex-col items-center mb-12">
                <div className="w-20 h-20 flex items-center justify-center mb-6 pulse-glow rounded-3xl">
                  <img src="/logo-LA-colapsed.png" className="w-16 h-16 object-contain" alt="LA" />
                </div>
                <h1 className="text-white text-3xl font-black tracking-tight uppercase">SUPER FOLHA</h1>
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Sistema Inteligente</p>
              </div>

            <div className="bg-slate-900/40 p-10 rounded-[3rem] border border-slate-800/50 shadow-2xl backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-violet-600/20 transition-colors"></div>
              
              <div className="text-center mb-10 relative z-10">
                <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Acesso Restrito</h2>
                <p className="text-slate-500 font-medium">Digite suas credenciais para continuar</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-6 relative z-10">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">E-mail Corporativo</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-950/50 border border-slate-800 rounded-2xl text-white placeholder-slate-600 transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none font-medium"
                    placeholder="ana.paula@lamusic.com.br"
                    required
                    autoComplete="email"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Senha de Acesso</label>
              </div>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-950/50 border border-slate-800 rounded-2xl text-white placeholder-slate-600 transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 outline-none"
                    placeholder="••••••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginSubmitting}
                  className="w-full py-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-violet-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loginSubmitting ? (
                    <>
                      <Loader2 className="animate-spin w-5 h-5" />
                      <span>Autenticando...</span>
                    </>
                  ) : (
                    <span>Acessar Dashboard</span>
                  )}
                </button>
              </form>

              <div className="flex items-center gap-4 my-10">
                <div className="flex-1 h-px bg-slate-800"></div>
                <span className="text-slate-600 text-[10px] font-black uppercase tracking-[0.2em]">Security Check</span>
                <div className="flex-1 h-px bg-slate-800"></div>
              </div>

              <div className="text-center">
                <p className="text-slate-500 text-xs font-medium">
                  Apenas usuários autorizados podem acessar este ambiente.
                </p>
              </div>
            </div>

            <div className="text-center mt-10">
              <p className="text-slate-600 text-xs font-bold uppercase tracking-widest">
                SUPER FOLHA SYSTEM © 2026 • <span className="text-violet-500/80">v2.0 Premium</span>
              </p>
            </div>
          </div>
        </div>

        <AlertDialog
          isOpen={alertState.isOpen}
          onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
          title={alertState.title}
          message={alertState.message}
          variant={alertState.variant}
        />
      </div>
    );
  }

  const userLabelForSidebar =
    userProfile?.nome ||
    (isAna(userEmail) ? 'Ana Paula' : isLuciano(userEmail) ? 'Luciano Alf' : userEmail || 'Usuário');

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-violet-500/30 flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block h-screen sticky top-0 z-30">
        <Sidebar
          current={{ module: currentModule as any, page: activeTab as any }}
          onNavigate={(next) => handleNavigate(next.module, next.page)}
          onLogout={handleLogout}
          onEditProfile={openProfile}
          userLabel={userLabelForSidebar}
          userAvatarUrl={userProfile?.avatar_url || getDefaultAvatarByEmail(userEmail)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a] sticky top-0 z-40">
        <div className="w-full py-4 px-6 md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* MOBILE: Logo + System Name (Hidden on Desktop) */}
              <div className="flex lg:hidden items-center gap-3">
                <img src="/logo-LA-colapsed.png" alt="Logo" className="w-9 h-9 object-contain" />
                <div>
                  <h1 className="text-white font-black text-sm md:text-base tracking-tight leading-tight flex items-center gap-1.5">
                    SUPER FOLHA <span className="text-violet-400">SYSTEM</span>
                  </h1>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] leading-none mt-1">Sistema Inteligente</p>
                </div>
              </div>

              {/* DESKTOP: Dynamic Module Title & Icon (Hidden on Mobile) */}
              <div className="hidden lg:flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                  {(() => {
                    const Icon = MODULE_CONFIG[currentModule as keyof typeof MODULE_CONFIG].icon;
                    return <Icon className="w-5 h-5 text-violet-400" />;
                  })()}
                </div>
                <div>
                  <h1 className="text-white font-black text-sm md:text-base tracking-tight leading-tight">
                    {MODULE_CONFIG[currentModule as keyof typeof MODULE_CONFIG].title}
                  </h1>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] leading-none mt-1">
                    {MODULE_CONFIG[currentModule as keyof typeof MODULE_CONFIG].subtitle}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 sm:gap-6">
              {/* Profile Menu Popover - Only on Mobile */}
              <div className="lg:hidden">
                <Popover.Root open={profilePopoverOpen} onOpenChange={setProfilePopoverOpen}>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="w-10 h-10 rounded-2xl border border-slate-700/60 bg-slate-900/40 hover:bg-slate-900/60 flex items-center justify-center overflow-hidden transition-all active:scale-95 shadow-inner"
                      aria-label="Menu do perfil"
                    >
                      <img
                        src={userProfile?.avatar_url || getDefaultAvatarByEmail(userEmail) || '/logo-LA-colapsed.png'}
                        alt="Meu perfil"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/logo-LA-colapsed.png';
                        }}
                      />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      sideOffset={8}
                      align="end"
                      className="z-[11000] w-56 rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 backdrop-blur-md"
                    >
                      <div className="p-4 border-b border-slate-800/60">
                        <div className="text-white text-sm font-black truncate">{userLabelForSidebar}</div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate mt-0.5">Administrador</div>
                </div>
                      <div className="p-2 space-y-1">
                        <button
                          onClick={openProfile}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all text-sm font-bold"
                        >
                          <Edit2 size={16} />
                          Editar Perfil
                        </button>
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all text-sm font-bold"
                        >
                          <LogOut size={16} />
                          Sair do Sistema
                        </button>
              </div>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "flex-1 overflow-auto flex flex-col",
          // Agenda precisa ficar 100% full-bleed (sem “margem/contorno” visual).
          // No desktop, mantemos um respiro no fundo para não “cortar” a última seção.
          currentModule === 'agenda' ? "p-0 pb-28 lg:pb-10" : "p-8 pb-28 lg:pb-10"
        )}
      >
        {/* Module-specific Header/Toolbar */}
        {currentModule === 'folha' && (
          <>
            {/* Mobile: Premium Header Card (não altera desktop) */}
            <div className="lg:hidden mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
              <Card className="p-4">
                <div className="flex flex-col gap-4">
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-xl font-black text-white leading-tight">
                          Gestão Mensal
                        </h2>
                        <p className="text-sm text-slate-500 font-medium mt-1 leading-snug">
                          Selecione o mês de referência para lançamentos e conferência
                        </p>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        {statusFolha === 'rascunho' && <Badge variant="warning">Rascunho</Badge>}
                        {statusFolha === 'pendente' && <Badge variant="info">Pendente</Badge>}
                        {statusFolha === 'aprovada' && <Badge variant="success">Aprovada</Badge>}
                      </div>
                    </div>
              </div>
              
                  <div className="w-full">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Mês de Referência
                    </div>
                    <CustomSelect
                      value={selectedFolhaId?.toString() || ''}
                      onValueChange={(val) => setSelectedFolhaId(Number(val))}
                      className="w-full"
                      options={folhas.map(f => ({
                        value: f.id.toString(),
                        label: `${getMesNome(f.mes)} ${f.ano}`
                      }))}
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* Desktop: manter layout atual */}
            <div className="hidden lg:flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center gap-3">
                  Gestão Mensal
              <div className="flex items-center gap-2">
                {statusFolha === 'rascunho' && <Badge variant="warning">Rascunho</Badge>}
                {statusFolha === 'pendente' && <Badge variant="info">Pendente</Badge>}
                {statusFolha === 'aprovada' && <Badge variant="success">Aprovada</Badge>}
                  </div>
                </h2>
                <p className="text-sm text-slate-500 font-bold mt-1">
                  Selecione o mês de referência para lançamentos e conferência
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-1">
                  Mês de Referência
                </div>
                <CustomSelect
                  value={selectedFolhaId?.toString() || ''}
                  onValueChange={(val) => setSelectedFolhaId(Number(val))}
                  className="min-w-[200px]"
                  options={folhas.map(f => ({
                    value: f.id.toString(),
                    label: `${getMesNome(f.mes)} ${f.ano}`
                  }))}
                />
              </div>
            </div>
          </>
        )}

        {/* Contas: Mobile Premium Header Card (dynamic for each tab) */}
        {currentModule === 'contas' && isMobile && ['dashboard', 'visao-geral', 'todas', 'comparativo'].includes(activeTab) && (
          <div className="lg:hidden mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
            <Card className="p-4 bg-slate-900/40 border border-slate-800/60 shadow-xl">
              <div className="flex flex-col gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-black text-white leading-tight">
                    {activeTab === 'dashboard' ? 'Gestão Mensal' :
                     activeTab === 'visao-geral' ? 'Gestão Mensal' :
                     activeTab === 'todas' ? 'Auditoria Financeira' :
                     activeTab === 'comparativo' ? 'IA Financeira' :
                     'Gestão Mensal'}
                  </h2>
                  <p className="text-sm text-slate-500 font-medium mt-1 leading-snug">
                    {activeTab === 'dashboard' ? 'Selecione o mês de referência para lançamentos e conferência' :
                     activeTab === 'visao-geral' ? 'Acompanhamento de contas a pagar por competência' :
                     activeTab === 'todas' ? 'Histórico completo de lançamentos e liquidações' :
                     activeTab === 'comparativo' ? 'Insights e anomalias detectadas por IA nas contas a pagar' :
                     'Acompanhamento de contas a pagar por competência'}
                  </p>
                </div>

                <div className="w-full">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">
                    Mês de Referência
                  </div>
                  <CustomSelect
                    value={contasCompetenciaYM}
                    onValueChange={setContasCompetenciaYM}
                    className="w-full"
                    options={contasCompetenciaOptions}
                  />
                </div>
              </div>
            </Card>
          </div>
        )}

        {currentModule === 'contas' && !(isMobile && ['dashboard', 'visao-geral', 'todas', 'comparativo'].includes(activeTab)) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
            <div>
              <h2 className="text-2xl font-black text-white">
                {activeTab === 'todas' ? 'Auditoria Financeira' :
                 activeTab === 'comparativo' ? 'IA Financeira' :
                 activeTab === 'categorias' ? 'Categorias Financeiras' :
                 'Gestão Mensal'}
              </h2>
              <p className="text-sm text-slate-500 font-bold mt-1">
                {activeTab === 'todas' ? 'Histórico completo de lançamentos e liquidações' :
                 activeTab === 'comparativo' ? 'Insights e anomalias detectadas por IA nas contas a pagar' :
                 activeTab === 'categorias' ? 'Gerencie as classificações as categorias para o fluxo de caixa.' :
                 'Acompanhamento de contas a pagar por competência'}
              </p>
            </div>
          </div>
        )}
          
        {/* Module Tabs */}
        {tabs.length > 0 ? (
          <div className="animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Desktop Tabs (MusiClass Style) */}
            <div className="hidden lg:block border-b border-slate-800/60 bg-slate-900/20 backdrop-blur-sm">
              <div className="flex items-center gap-1 overflow-x-auto pb-px scrollbar-hide px-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "relative flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-all whitespace-nowrap group",
                  activeTab === tab.id 
                        ? "text-violet-400" 
                        : "text-slate-500 hover:text-slate-200"
                    )}
                  >
                    <tab.icon size={16} className={cn(
                      "transition-colors",
                      activeTab === tab.id ? "text-violet-400" : "text-slate-600 group-hover:text-slate-400"
                    )} />
                {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
                    )}
              </button>
            ))}
          </div>
        </div>

            {/* Mobile Tabs (Cockpit Premium Style) */}
            <div className="lg:hidden mb-6">
              <div className="relative flex bg-[#0f172a] p-1 rounded-xl border border-slate-800/50 shadow-inner overflow-hidden">
                {/* Indicador Deslizante (Sliding Background) */}
                <div 
                  className="absolute top-1.5 bottom-1.5 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) bg-slate-800/80 rounded-lg border border-slate-700/30 shadow-lg"
                  style={{
                    // inset horizontal para não “encostar” nas bordas do container
                    width: `calc(${100 / Math.max(tabs.length, 1)}% - 10px)`,
                    left: `calc(${(tabs.findIndex(t => t.id === activeTab) * 100) / Math.max(tabs.length, 1)}% + 5px)`,
                  }}
                />
                
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "relative z-10 flex-1 py-3 font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap",
                      tabs.length >= 5 ? "text-[10px]" : "text-[11px]",
                      activeTab === tab.id 
                        ? "text-violet-400 scale-[1.02]" 
                        : "text-slate-500 hover:text-slate-200"
                    )}
                  >
                    {getShortLabel(tab.id)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "w-full flex-1 flex flex-col",
            // Quando não há tabs (Agenda), não adiciona espaço “sobrando” em volta.
            tabs.length > 0 ? "gap-6 pt-6" : "gap-0 pt-0"
          )}
        >
          {currentModule === 'contas' ? (
            <ContasPagarPage
              mode={(activeTab as any) || 'visao-geral'}
              competenciaYM={contasCompetenciaYM}
              onCompetenciaYMChange={setContasCompetenciaYM}
            />
          ) : currentModule === 'agenda' ? (
             <AgendaPage />
          ) : currentModule === 'notificacoes' ? (
            <NotificacoesPage />
          ) : loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : (
          <>
            {(isCreatingLancamento || editingLancamento) && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <Card className="w-full max-w-2xl p-0 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 bg-slate-900/60 border-b border-slate-700/50">
                        <div>
                      <div className="text-white font-bold text-lg">
                        {isCreatingLancamento ? 'Novo Lançamento' : 'Editar Lançamento'}
                        </div>
                      <div className="text-xs text-slate-400">
                        {folhaAtual ? `${getMesNome(folhaAtual.mes)} ${folhaAtual.ano}` : ''}
                        {unidadeFiltro !== 'todos' ? ` • Unidade ${unidadeLabels[unidadeFiltro]}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => { setIsCreatingLancamento(false); setEditingLancamento(null); }}
                      className="text-slate-400 hover:text-white"
                      aria-label="Fechar"
                    >
                      <XCircle size={22} />
                    </button>
                  </div>

                  <div className="p-6 space-y-4">
                    {isCreatingLancamento ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Colaborador</label>
                          <CustomSelect
                            value={draftLancamento.colaborador_id ? String(draftLancamento.colaborador_id) : ''}
                            onValueChange={(v) => setDraftLancamento(prev => ({ ...prev, colaborador_id: Number(v) } as any))}
                            placeholder="Selecione..."
                            options={colaboradores
                              .filter(c => c.ativo)
                              .map(c => ({
                                value: String(c.id),
                                label: `${c.nome}${c.funcao ? ` — ${c.funcao}` : ''}`,
                              }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Categoria</label>
                          <CustomSelect
                            value={(draftLancamento.categoria as any) ?? 'staff_rateado'}
                            onValueChange={(v) => setDraftLancamento(prev => ({ ...prev, categoria: v as any }))}
                            options={[
                              { value: 'staff_rateado', label: 'Staff Rateado' },
                              { value: 'equipe_operacional', label: 'Equipe Operacional' },
                              { value: 'professores', label: 'Professores' },
                            ]}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {([
                        ['Salário', 'salario'],
                        ['Bônus', 'bonus'],
                        ['Comissão', 'comissao'],
                        ['Reembolso', 'reembolso'],
                        ['Passagem', 'passagem'],
                        ['INSS', 'inss'],
                        ['Descontos', 'descontos'],
                      ] as const).map(([label, key]) => (
                        <div key={key}>
                          <label className="block text-xs text-slate-400 mb-1">{label}</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus:ring-2 focus:ring-violet-500"
                            value={
                              isCreatingLancamento
                                ? (Number((draftLancamento as any)[key] ?? 0))
                                : (Number((editingLancamento as any)?.[key] ?? 0))
                            }
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (isCreatingLancamento) {
                                setDraftLancamento(prev => ({ ...prev, [key]: val } as any));
                              } else if (editingLancamento) {
                                setEditingLancamento(prev => prev ? ({ ...prev, [key]: val } as any) : prev);
                              }
                            }}
                          />
                    </div>
                 ))}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        onClick={() => { setIsCreatingLancamento(false); setEditingLancamento(null); }}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveLancamento}
                        className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Alerts Section */}
            {filteredAlertas.length > 0 && (
              <div className="mb-6">
                <div 
                  className={`bg-slate-800/40 border ${alertsExpanded ? 'border-slate-700' : 'border-amber-500/20'} rounded-2xl overflow-hidden transition-all duration-300 shadow-lg`}
                >
                  <button 
                    onClick={() => setAlertsExpanded(!alertsExpanded)}
                    className={`w-full p-4 flex items-center justify-between transition-colors ${alertsExpanded ? 'bg-slate-800/60' : 'hover:bg-slate-800/60'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                        <AlertTriangle size={22} />
                      </div>
                      <div className="text-left">
                        <h4 className="font-bold text-amber-500 text-lg">
                          {filteredAlertas.length} {filteredAlertas.length === 1 ? 'Alerta Detectado' : 'Alertas Detectados'}
                        </h4>
                        <p className="text-xs text-slate-400">
                          {unidadeFiltro === 'todos' ? 'Revise antes de aprovar a folha' : `Alertas da unidade ${unidadeLabels[unidadeFiltro]}`}
                        </p>
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg bg-slate-700/30 text-slate-400 transition-transform duration-300 ${alertsExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={20} />
                    </div>
                  </button>

                  <div className={`transition-all duration-500 ease-in-out ${alertsExpanded ? 'max-h-[600px] opacity-100 overflow-y-auto' : 'max-h-0 opacity-0'}`}>
                    <div className="p-4 pt-2 space-y-px">
                      {filteredAlertas.map((alerta, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 md:gap-4 p-3 md:p-4 hover:bg-slate-700/20 transition-colors border-t border-slate-700/30 first:border-t-0 group"
                        >
                          <AlertTriangle className="text-amber-500 shrink-0 mt-1" size={18} />

                          <div className="flex-1 min-w-0">
                            {/* Title (mobile: hierarchy) + Desktop chip */}
                            {(() => {
                              const rawTitle = String(alerta.titulo || '').trim();
                              const parts = rawTitle.split(':');
                              const hasSplit = parts.length >= 2;
                              const titleKind = hasSplit ? parts[0].trim() : rawTitle;
                              const titleSubject = hasSplit ? parts.slice(1).join(':').trim() : '';

                              return (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    {/* Mobile: small kind label + stronger subject */}
                                    {hasSplit ? (
                                      <>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-400/90">
                                          {titleKind}
                                        </div>
                                        <h5 className="mt-0.5 text-sm md:text-sm font-black text-slate-100 leading-snug break-words">
                                          {titleSubject}
                                        </h5>
                                      </>
                                    ) : (
                                      <h5 className="text-sm md:text-sm font-black text-slate-100 leading-snug break-words">
                                        {rawTitle}
                                      </h5>
                                    )}
                                  </div>

                                  {/* Desktop only (mobile: remove textual badge) */}
                                  <span className="hidden md:inline-flex shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest">
                                    ALERTA
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Body */}
                            <p className="mt-1.5 text-[11px] md:text-sm text-slate-400 leading-relaxed line-clamp-5 md:line-clamp-none">
                              {alerta.descricao}
                            </p>

                            {/* Ana note preview */}
                            {alerta.id && (noteDrafts[alerta.id] || '').trim() ? (
                              <div className="mt-2 rounded-xl border border-slate-700/40 bg-slate-900/30 px-3 py-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  Motivo (Ana)
                                </div>
                                <div className="mt-1 text-[11px] text-slate-400 leading-snug line-clamp-2">
                                  {(noteDrafts[alerta.id] || '').trim()}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {/* Actions: always visible on mobile (touch), hover-only on desktop */}
                          {alerta.id && (
                            <div className="self-start flex items-center gap-2 md:self-center">
                              <Tooltip content="Anotar motivo para alimentar a memória da IA">
                                <button
                                  onClick={() => openAlertNote(alerta)}
                                  className={cn(
                                    "w-10 h-10 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center",
                                    "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                                  )}
                                  aria-label="Anotar"
                                >
                                  <Edit2 size={16} />
                                </button>
                              </Tooltip>
                              <Tooltip content="Marcar como verificado">
                                <button
                                  onClick={() => handleCheckAlert(alerta.id!)}
                                  className={cn(
                                    "w-10 h-10 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all flex items-center justify-center",
                                    "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                                  )}
                                  aria-label="Verificado"
                                >
                                  <CheckCircle size={16} />
                                </button>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Alert Note Modal */}
            <Modal
              isOpen={alertNoteModal.isOpen}
              onClose={() => setAlertNoteModal((prev) => ({ ...prev, isOpen: false }))}
              title="Registrar motivo do alerta"
              className="max-w-xl"
            >
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-700/50">
                  <div className="text-sm font-bold text-slate-200">{alertNoteModal.titulo}</div>
                  <div className="text-xs text-slate-400 mt-1">{alertNoteModal.descricao}</div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Motivo (Ana)
                  </label>
                  <textarea
                    value={alertNoteText}
                    onChange={(e) => setAlertNoteText(e.target.value)}
                    placeholder="Ex.: férias (sem VT), bônus pontual, ajuste de carga horária, pico de matrículas..."
                    className="w-full min-h-[120px] bg-slate-900/40 border border-slate-700/50 rounded-2xl p-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/40 resize-y"
                    spellCheck="false"
                    disabled={alertNoteSaving}
                  />
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Essa anotação alimenta a memória da IA para insights futuros.</span>
                    {alertNoteSaving ? (
                      <span className="text-violet-400 font-bold flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> SALVANDO...
                      </span>
                    ) : alertNoteSaved ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle size={10} /> SALVO
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex gap-2 sm:gap-3 pt-2">
                  <button
                    onClick={() => setAlertNoteModal((prev) => ({ ...prev, isOpen: false }))}
                    className="flex-1 px-3 sm:px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-base font-bold transition-all leading-tight"
                    disabled={alertNoteSaving}
                  >
                    Fechar
                  </button>
                  <Tooltip content="Salva o motivo e mantém o alerta visível">
                    <button
                      onClick={() => saveAlertNote({ markChecked: false })}
                      className="flex-1 px-3 sm:px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs sm:text-base font-bold transition-all shadow-lg shadow-violet-600/20 leading-tight"
                      disabled={alertNoteSaving}
                    >
                      Salvar
                    </button>
                  </Tooltip>
                  <Tooltip content="Salva o motivo e marca o alerta como verificado">
                    <button
                      onClick={() => saveAlertNote({ markChecked: true })}
                      className="flex-1 px-3 sm:px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-base font-bold transition-all shadow-lg shadow-emerald-600/20 leading-tight"
                      disabled={alertNoteSaving}
                    >
                      Salvar + Verificar
                    </button>
                  </Tooltip>
                </div>
              </div>
            </Modal>

            {/* Duplication Modal */}
            <Modal
              isOpen={isDuplicateModalOpen}
              onClose={() => setIsDuplicateModalOpen(false)}
              title="Duplicar Lançamentos"
              className="max-w-lg"
            >
              <div className="space-y-6">
                <p className="text-sm text-slate-400">
                  Selecione o mês de origem e a unidade para duplicar os lançamentos para o mês atual ({folhaAtual ? `${getMesNome(folhaAtual.mes)} ${folhaAtual.ano}` : ''}).
                </p>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Mês de Origem</label>
                    <CustomSelect
                      value={duplicateConfig.fromFolhaId}
                      onValueChange={(v) => setDuplicateConfig(prev => ({ ...prev, fromFolhaId: v }))}
                      placeholder="Selecione o mês..."
                      options={folhas
                        .filter(f => f.id !== selectedFolhaId)
                        .map(f => ({
                          value: String(f.id),
                          label: `${getMesNome(f.mes)} ${f.ano}`,
                        }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Unidade</label>
                    <CustomSelect
                      value={duplicateConfig.unidade}
                      onValueChange={(v) => setDuplicateConfig(prev => ({ ...prev, unidade: v }))}
                      options={[
                        { value: 'todos', label: 'Todas as Unidades (Consolidado)' },
                        { value: 'cg', label: 'Unidade Campo Grande' },
                        { value: 'rec', label: 'Unidade Recreio' },
                        { value: 'bar', label: 'Unidade Barra' },
                      ]}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setIsDuplicateModalOpen(false)}
                    className="flex-1 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDuplicateAction}
                    className="flex-1 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all shadow-lg shadow-violet-600/20"
                  >
                    Duplicar Agora
                  </button>
                </div>
              </div>
            </Modal>

            {/* Generic Confirm Dialog */}
            <ConfirmDialog
              isOpen={confirmState.isOpen}
              onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
              onConfirm={confirmState.onConfirm}
              title={confirmState.title}
              message={confirmState.message}
              variant={confirmState.variant}
            />

            <AlertDialog
              isOpen={alertState.isOpen}
              onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
              title={alertState.title}
              message={alertState.message}
              variant={alertState.variant}
            />

            {/* Profile Modal */}
            <Modal
              isOpen={isProfileOpen}
              onClose={() => setIsProfileOpen(false)}
              title="Editar perfil"
              className="max-w-xl"
            >
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-3xl overflow-hidden border border-slate-700 bg-slate-900/40 shrink-0">
                    <img
                      src={profileAvatar || getDefaultAvatarByEmail(userEmail) || '/logo-LA-colapsed.png'}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        Nome
                      </label>
                      <input
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/40"
                        placeholder="Seu nome"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        Foto
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          id="profile-photo-input"
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePickProfileAvatar(e.target.files?.[0] ?? null)}
                          className="hidden"
                          disabled={profileSaving}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('profile-photo-input')?.click()}
                          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center gap-2 border border-slate-700"
                          disabled={profileSaving}
                        >
                          <Plus size={14} /> Selecionar Imagem
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                        <span>Sua foto será exibida no header e nos relatórios.</span>
                        {profileSaving ? (
                          <span className="text-violet-400 font-bold flex items-center gap-1">
                            <Loader2 size={10} className="animate-spin" /> SALVANDO...
                          </span>
                        ) : profileSaved ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle size={10} /> SALVO
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsProfileOpen(false)}
                    className="flex-1 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all"
                    disabled={profileSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveProfile}
                    className="flex-1 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black transition-all shadow-lg shadow-violet-600/20"
                    disabled={profileSaving}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </Modal>

            {/* Dashboard */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPICard 
                    icon={DollarSign}
                    label="Folha Total"
                    value={formatCurrency(totais.totalGeral)}
                    variant="violet"
                    trend={comparativoMensal ? (comparativoMensal.varTotal > 0 ? 'up' : 'down') : undefined}
                    trendValue={comparativoMensal ? `${comparativoMensal.varTotal.toFixed(1)}%` : undefined}
                  />
                  <KPICard 
                    icon={Users}
                    label="Lançamentos"
                    value={totais.headcount.total}
                    subvalue={`CG: ${totais.headcount.cg} | Rec: ${totais.headcount.rec} | Bar: ${totais.headcount.bar}`}
                    variant="cyan"
                    trend={comparativoMensal ? (comparativoMensal.varHeadcount > 0 ? 'up' : 'down') : undefined}
                    trendValue={comparativoMensal ? `${comparativoMensal.varHeadcount.toFixed(0)}%` : undefined}
                  />
                  <KPICard 
                    icon={Building}
                    label="Colaboradores"
                    value={colaboradores.filter(c => c.ativo).length}
                    subvalue="Ativos no sistema"
                    variant="emerald"
                  />
                  <KPICard 
                    icon={DollarSign}
                    label="Média/Lançamento"
                    value={totais.headcount.total > 0 ? formatCurrency(totais.totalGeral / totais.headcount.total) : 'R$ 0'}
                    variant="amber"
                  />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Distribuição por Unidade */}
                  <Card className="p-4 md:p-6">
                    <h3 className="text-base md:text-lg font-semibold mb-4 flex items-center gap-2">
                      <BarChart3 size={20} className="text-white" />
                      <span className="text-white">Distribuição por Unidade</span>
                    </h3>
                    <div className="w-full">
                      <DistributionChart 
                        data={unitData.map(u => ({ name: u.name, value: u.value, color: u.color }))} 
                        showBars
                        totalValue={formatCurrency(totais.totalGeral).replace('R$', '').trim()}
                      />
                    </div>
                  </Card>

                  {/* Evolução */}
                  <Card className="p-4 md:p-6 flex flex-col">
                    <h3 className="text-base md:text-lg font-semibold mb-4 flex items-center gap-2">
                      <LineChartIcon size={20} className="text-white" />
                      <span className="text-white">Evolução Histórica (Total Geral)</span>
                    </h3>
                    <div className="flex-1 min-h-[200px]">
                      {evolutionData.length > 0 ? (
                        <EvolutionChart data={evolutionData} />
                      ) : (
                        <div className="h-full flex items-center justify-center p-8">
                         <p className="text-slate-500 text-center text-sm">
                            Histórico será exibido após cadastrar meses anteriores
                         </p>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
                
                {/* Resumo por Unidade */}
                <div className="mt-6">
                    <h3 className="text-base md:text-lg font-semibold mb-4 text-white">Resumo por Unidade</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                        {unitData.map(unit => (
                            <Card 
                              key={unit.id} 
                              className={cn(
                                "p-4 md:p-6 relative overflow-hidden group hover:border-slate-600 transition-colors",
                                unit.id === 'cg' ? "col-span-2 md:col-span-1" : "col-span-1"
                              )}
                            >
                                <div className={`absolute top-0 right-0 p-24 opacity-5 ${unit.twColor} blur-3xl rounded-full -mr-12 -mt-12 group-hover:opacity-10 transition-opacity`}></div>
                                <div className="relative z-10">
                                    <div className="text-slate-400 text-[10px] md:text-sm font-bold uppercase tracking-widest md:normal-case md:tracking-normal mb-2">{unit.name}</div>
                                    <div className="text-lg md:text-2xl font-black md:font-bold text-white mb-1 truncate">{formatCurrency(unit.value)}</div>
                                    <div className="text-[10px] md:text-xs text-slate-500">{unit.percent}% do total</div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
              </div>
            )}

            {/* Collaborators Tab */}
            {activeTab === 'colaboradores' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPICard 
                    icon={Users} 
                    label="Total Ativos" 
                    value={colaboradores.filter(c => c.status === 'active').length} 
                    variant="violet" 
                  />
                  <KPICard 
                    icon={Building} 
                    label="Staff Ativo" 
                    value={colaboradores.filter(c => c.departamento === 'staff_rateado' && c.status === 'active').length} 
                    variant="violet" 
                  />
                  <KPICard 
                    icon={Music} 
                    label="Professores Ativos" 
                    value={colaboradores.filter(c => c.departamento === 'professores' && c.status === 'active').length} 
                    variant="emerald" 
                  />
                  <KPICard 
                    icon={DollarSign} 
                    label="Folha Base (Ativos)" 
                    value={formatCurrency(colaboradores.filter(c => c.status === 'active').reduce((acc, c) => acc + getEffectiveBaseSalary(c), 0))} 
                    variant="rose" 
                  />
                </div>

                {/* Toolbar (Mobile-first premium) */}
                <>
                  {/* Mobile */}
                  <div className="lg:hidden sticky top-0 z-20">
                    <Card className="p-4">
                      <div className="space-y-4">
                        {/* Busca */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                          <input
                            type="text"
                            placeholder="Buscar por nome, email ou função..."
                            className="w-full pl-10 pr-4 py-3 bg-slate-900/40 border border-slate-700/60 rounded-2xl text-sm font-medium text-slate-100 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
                            value={collabSearch}
                            onChange={(e) => setCollabSearch(e.target.value)}
                          />
                        </div>

                        {/* Filtros */}
                        <div className="space-y-3">
                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                              Departamentos
                            </div>
                            <CustomSelect
                              value={collabDeptFilter}
                              onValueChange={setCollabDeptFilter}
                              options={[
                                { value: 'all', label: 'Todos os Departamentos' },
                                ...Object.entries(DEPARTMENT_LABELS).map(([k, v]) => ({ value: k, label: v })),
                              ]}
                              className="w-full"
                            />
                          </div>

                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                              Status
                            </div>
                            <CustomSelect
                              value={collabStatusFilter}
                              onValueChange={setCollabStatusFilter}
                              options={[
                                { value: 'all', label: 'Todos os Status' },
                                ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
                              ]}
                              className="w-full"
                            />
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-3">
                          {/* CTA (Full Width on Mobile) */}
                          <button
                            onClick={() => { setEditingCollab(null); setIsCollabModalOpen(true); }}
                            className="flex-1 h-12 flex items-center justify-center gap-2 px-4 bg-violet-600 hover:bg-violet-500 rounded-2xl text-sm font-black text-white transition-all shadow-lg shadow-violet-600/20 active:scale-95"
                          >
                            <Plus size={18} />
                            Novo Colaborador
                          </button>
                        </div>
                      </div>
                    </Card>
                    <div className="h-4" />
                  </div>

                  {/* Desktop (mantém layout atual) */}
                  <div className="hidden lg:flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex flex-1 items-center gap-4 w-full">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="text" 
                          placeholder="Buscar por nome, email ou função..." 
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 outline-none transition-all"
                          value={collabSearch}
                          onChange={(e) => setCollabSearch(e.target.value)}
                        />
                      </div>
                      <CustomSelect 
                        value={collabDeptFilter}
                        onValueChange={setCollabDeptFilter}
                        options={[
                          { value: 'all', label: 'Todos os Departamentos' },
                          ...Object.entries(DEPARTMENT_LABELS).map(([k, v]) => ({ value: k, label: v }))
                        ]}
                        className="w-[280px] sm:w-[340px] shrink-0"
                      />
                      <CustomSelect 
                        value={collabStatusFilter}
                        onValueChange={setCollabStatusFilter}
                        options={[
                          { value: 'all', label: 'Todos os Status' },
                          ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))
                        ]}
                        className="max-w-[180px]"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="bg-slate-800 p-1 rounded-xl flex items-center gap-1">
                        <button 
                          onClick={() => setViewMode('cards')}
                          className={cn("p-2 rounded-lg transition-all", viewMode === 'cards' ? "bg-violet-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}
                        >
                          <LayoutGrid size={18} />
                        </button>
                        <button 
                          onClick={() => setViewMode('table')}
                          className={cn("p-2 rounded-lg transition-all", viewMode === 'table' ? "bg-violet-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}
                        >
                          <List size={18} />
                        </button>
                      </div>
                      <button 
                        onClick={() => { setEditingCollab(null); setIsCollabModalOpen(true); }}
                        className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-violet-600/20"
                      >
                        <Plus size={18} />
                        Novo Colaborador
                      </button>
                    </div>
                  </div>
                </>

                {isMobile ? (
                  <MobileCollaboratorList
                    items={filteredColaboradoresWithBase}
                    onEdit={(collab) => { setEditingCollab({ ...collab, salario_base: getEffectiveBaseSalary(collab) }); setIsCollabModalOpen(true); }}
                    onToggleInactive={handleToggleInactiveCollab}
                    onDelete={handleDeleteCollab}
                  />
                ) : viewMode === 'cards' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredColaboradoresWithBase.map(c => (
                      <CollaboratorCard 
                        key={c.id} 
                        collaborator={c} 
                        onEdit={(collab) => { setEditingCollab({ ...collab, salario_base: getEffectiveBaseSalary(collab) }); setIsCollabModalOpen(true); }}
                        onToggleInactive={handleToggleInactiveCollab}
                        onDelete={handleDeleteCollab}
                        isMobile={false}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-800/40 rounded-3xl border border-slate-700/50 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-[980px] w-full border-collapse">
                        <thead className="bg-slate-900/60 border-b border-slate-700/50">
                          <tr>
                            <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Nome</th>
                            <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Departamento</th>
                            <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Função</th>
                            <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Contrato</th>
                            <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                            <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Unidades</th>
                            <th className="text-right px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Base</th>
                            <th className="text-center px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredColaboradoresWithBase.map((c, idx) => (
                            <tr key={c.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
        <div 
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-lg overflow-hidden" 
          style={{ backgroundColor: DEPARTMENT_COLORS[c.departamento] }}
        >
          {c.id === 2 || c.nome?.includes('Ana Paula') ? (
            <img src="/Avatar_Ana.png" alt="Ana Paula" className="w-full h-full object-cover" />
          ) : c.foto_url ? (
            <img src={c.foto_url} alt={c.nome} className="w-full h-full object-cover" />
          ) : (
            c.nome.charAt(0)
          )}
        </div>
                                  <div>
                                    <div className="font-bold text-sm text-slate-200">{c.nome}</div>
                                    <div className="text-[10px] text-slate-500">{c.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md" style={{ backgroundColor: `${DEPARTMENT_COLORS[c.departamento]}20`, color: DEPARTMENT_COLORS[c.departamento] }}>
                                  {DEPARTMENT_LABELS[c.departamento]}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{c.funcao}</td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{CONTRACT_LABELS[c.tipo]}</td>
                              <td className="px-6 py-4">
                                <Badge variant={STATUS_COLORS[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex gap-1">
                                  {c.is_rateado ? (
                                    <span className="text-[9px] font-black text-slate-500 bg-slate-700/30 px-2 py-0.5 rounded-full uppercase border border-slate-600/50">RATEADO</span>
                                  ) : (
                                    <span className="text-[9px] font-black text-slate-500 bg-slate-700/30 px-2 py-0.5 rounded-full uppercase border border-slate-600/50">{c.unidade_fixa?.toUpperCase()}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right font-mono font-bold text-slate-200 text-sm">
                                {formatCurrency(c.salario_base)}
                              </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1 transition-all">
                      <Tooltip content="Editar">
                        <button onClick={() => { setEditingCollab({ ...c, salario_base: getEffectiveBaseSalary(c) }); setIsCollabModalOpen(true); }} className="p-2 text-slate-400 hover:text-violet-400 transition-colors">
                          <Edit2 size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip content={c.status === 'active' ? 'Inativar' : 'Reativar'}>
                        <button onClick={() => handleToggleInactiveCollab(c)} className="p-2 text-slate-400 hover:text-amber-400 transition-colors">
                          <UserX size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Excluir">
                        <button onClick={() => handleDeleteCollab(c)} className="p-2 text-slate-400 hover:text-rose-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <CollaboratorModal 
                  isOpen={isCollabModalOpen}
                  onClose={() => { setIsCollabModalOpen(false); setEditingCollab(null); }}
                  onSave={handleSaveCollab}
                  initialData={editingCollab || undefined}
                />
              </div>
            )}

            {/* Lancamentos Tab */}
            {activeTab === 'lancamentos' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Filters */}
                  {!isMobile ? (
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-800 p-1 rounded-lg inline-flex">
                        {[
                            { id: 'todos', label: 'Consolidado' },
                            { id: 'cg', label: 'Campo Grande' },
                            { id: 'rec', label: 'Recreio' },
                          { id: 'bar', label: 'Barra' },
                        ].map((item) => (
                             <button
                                key={item.id}
                                onClick={() => setUnidadeFiltro(item.id as any)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                                  unidadeFiltro === item.id
                                    ? 'bg-violet-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                                }`}
                              >
                                {item.label}
                              </button>
                        ))}
                    </div>
                  </div>
                  ) : (
                    <div className="w-full">
                      {/* Mobile: Command Bar v2 (sem modais) */}
                      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-[#060814]/70 backdrop-blur-xl border-b border-white/5">
                        {/* Unidades (pills) */}
                        <div className="bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-full">
                          <div className="grid grid-cols-4 gap-1">
                            {[
                              { id: 'todos', label: 'Consolidado', short: 'Todas' },
                              { id: 'cg', label: 'Campo Grande', short: 'CG' },
                              { id: 'rec', label: 'Recreio', short: 'Recreio' },
                              { id: 'bar', label: 'Barra', short: 'Barra' },
                            ].map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => setUnidadeFiltro(u.id as any)}
                                className={cn(
                                  'w-full px-2 py-2 rounded-xl text-xs font-black transition-all truncate',
                                  unidadeFiltro === u.id
                                    ? 'bg-slate-800 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                                )}
                                aria-pressed={unidadeFiltro === u.id}
                                title={u.label}
                              >
                                {u.short}
                              </button>
                            ))}
                          </div>
                        </div>

                        {unidadeFiltro === 'todos' ? (
                          <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Somente leitura
                          </div>
                        ) : null}

                        {/* Ações (sempre aparentes) */}
                        {(() => {
                            const canEditMonth = statusFolha === 'rascunho';
                            const isConsolidado = unidadeFiltro === 'todos';

                            const actionItems = [
                              {
                                id: 'novo',
                                label: 'Novo',
                                icon: Plus,
                                kind: 'primary' as const,
                                disabled: isConsolidado || !canEditMonth,
                                onClick: openCreateLancamento,
                                title: isConsolidado
                                  ? 'Selecione CG/Rec/Bar (Consolidado é somente leitura).'
                                  : !canEditMonth
                                    ? 'Este mês não está em rascunho.'
                                    : 'Criar novo lançamento',
                              },
                              {
                                id: 'duplicar',
                                label: 'Duplicar',
                                icon: Copy,
                                kind: 'neutral' as const,
                                disabled: !canEditMonth,
                                onClick: () => setIsDuplicateModalOpen(true),
                                title: !canEditMonth ? 'Este mês não está em rascunho.' : 'Duplicar mês',
                              },
                              {
                                id: 'proximo',
                                label: 'Próx',
                                icon: Plus,
                                kind: 'neutral' as const,
                                disabled: !folhaAtual,
                                onClick: handleCreateNextMonth,
                                title: !folhaAtual ? 'Nenhum mês selecionado.' : 'Criar próximo mês',
                              },
                              {
                                id: 'submeter',
                                label: 'Subm',
                                icon: CheckCircle,
                                kind: 'primary' as const,
                                disabled: isConsolidado || !canEditMonth,
                                onClick: () => handleUpdateStatus('pendente'),
                                title: isConsolidado
                                  ? 'Consolidado é somente leitura.'
                                  : !canEditMonth
                                    ? 'Este mês não está em rascunho.'
                                    : 'Submeter para aprovação',
                              },
                              {
                                id: 'excluir',
                                label: 'Excluir',
                                icon: XCircle,
                                kind: 'danger' as const,
                                disabled: isConsolidado || !canEditMonth,
                                onClick: handleDeleteMonth,
                                title: isConsolidado
                                  ? 'Consolidado é somente leitura.'
                                  : !canEditMonth
                                    ? 'Este mês não está em rascunho.'
                                    : 'Excluir mês (irreversível)',
                              },
                            ];

                            const btnBase =
                              'w-full px-3 py-2.5 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-1';

                            const styleEnabled = (kind: 'primary' | 'neutral' | 'danger') =>
                              kind === 'primary'
                                ? 'bg-violet-600 hover:bg-violet-500 border-violet-500/30 text-white shadow-lg shadow-violet-600/20'
                                : kind === 'danger'
                                  ? 'bg-slate-900/50 hover:bg-rose-500/10 border-slate-800/70 hover:border-rose-500/30 text-rose-300'
                                  : 'bg-slate-900/50 hover:bg-slate-900/70 border-slate-800/70 text-slate-200';

                            const styleDisabled =
                              'opacity-40 cursor-not-allowed bg-slate-900/30 border-slate-800/50 text-slate-500';

                            const renderBtn = (a: (typeof actionItems)[number]) => {
                              const Icon = a.icon;
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  disabled={a.disabled}
                                  onClick={() => !a.disabled && a.onClick()}
                                  className={cn(btnBase, a.disabled ? styleDisabled : styleEnabled(a.kind))}
                                  title={a.title}
                                  aria-label={a.label}
                                >
                                  <Icon
                                    size={18}
                                    className={a.disabled ? 'text-slate-500' : a.kind === 'danger' ? 'text-rose-300' : 'text-white'}
                                  />
                                  <span className="leading-none">{a.label}</span>
                                </button>
                              );
                            };

                            const [a1, a2, a3, a4, a5] = actionItems;

                            return (
                              <div className="mt-3 space-y-2">
                                <div className="grid grid-cols-4 gap-2">
                                  {renderBtn(a1)}
                                  {renderBtn(a2)}
                                  {renderBtn(a3)}
                                  {renderBtn(a4)}
                                </div>
                                <div className="grid grid-cols-1">
                                  {renderBtn(a5)}
                                </div>
                              </div>
                            );
                          })()}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {isMobile ? null : (
                    <>
                    {/* Option A: Consolidado é read-only */}
                    <Tooltip content={unidadeFiltro === 'todos' ? 'Selecione uma unidade para criar lançamentos' : 'Novo lançamento'}>
                      <button
                        onClick={openCreateLancamento}
                        disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          unidadeFiltro === 'todos' || statusFolha !== 'rascunho'
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        <Plus size={16} />
                        Novo Lançamento
                      </button>
                    </Tooltip>

                    <Tooltip content="Duplicar lançamentos">
                      <button
                        onClick={() => setIsDuplicateModalOpen(true)}
                        disabled={statusFolha !== 'rascunho'}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          statusFolha !== 'rascunho'
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        <Copy size={16} />
                        Duplicar Mês
                      </button>
                    </Tooltip>

                    <Tooltip content="Criar próximo mês">
                      <button
                        onClick={handleCreateNextMonth}
                        disabled={!folhaAtual}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          !folhaAtual
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        <Plus size={16} />
                        Criar Próximo Mês
                      </button>
                    </Tooltip>

                    {statusFolha === 'rascunho' && (
                      <Tooltip content="Excluir mês atual">
                        <button
                          onClick={handleDeleteMonth}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-rose-500/20 text-rose-400 border border-transparent hover:border-rose-500/30 rounded-lg text-sm font-medium transition-all"
                        >
                          <XCircle size={16} />
                          Excluir Mês
                        </button>
                      </Tooltip>
                    )}
                  
                  {statusFolha === 'rascunho' && (
                    <button 
                      onClick={() => handleUpdateStatus('pendente')}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-violet-600/20"
                    >
                      <CheckCircle size={16} />
                        Submeter
                    </button>
                  )}
                    </>)}
                  </div>
                </div>

                {/* KPI Cards for Lancamentos */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPICard 
                    icon={DollarSign}
                    label={`Folha ${unidadeFiltro === 'todos' ? 'Consolidada' : unidadeLabels[unidadeFiltro]}`}
                    value={formatCurrency(lancamentosKPIs.total.value)}
                    subvalue={`${lancamentosKPIs.total.count} Colaboradores`}
                    variant="violet"
                    trend={lancamentosKPIs.total.variation !== null ? (lancamentosKPIs.total.variation > 0 ? 'up' : 'down') : undefined}
                    trendValue={lancamentosKPIs.total.variation !== null ? `${Math.abs(lancamentosKPIs.total.variation).toFixed(1)}%` : undefined}
                  />
                  <KPICard 
                    icon={Users}
                    label="Staff Rateado"
                    value={formatCurrency(lancamentosKPIs.staff.value)}
                    subvalue={`${lancamentosKPIs.staff.count} pessoas | ${lancamentosKPIs.staff.percent.toFixed(1)}%`}
                    variant="emerald"
                    trend={lancamentosKPIs.staff.variation !== null ? (lancamentosKPIs.staff.variation > 0 ? 'up' : 'down') : undefined}
                    trendValue={lancamentosKPIs.staff.variation !== null ? `${Math.abs(lancamentosKPIs.staff.variation).toFixed(1)}%` : undefined}
                  />
                  <KPICard 
                    icon={Building}
                    label="Equipe Operacional"
                    value={formatCurrency(lancamentosKPIs.operacional.value)}
                    subvalue={`${lancamentosKPIs.operacional.count} pessoas | ${lancamentosKPIs.operacional.percent.toFixed(1)}%`}
                    variant="amber"
                    trend={lancamentosKPIs.operacional.variation !== null ? (lancamentosKPIs.operacional.variation > 0 ? 'up' : 'down') : undefined}
                    trendValue={lancamentosKPIs.operacional.variation !== null ? `${Math.abs(lancamentosKPIs.operacional.variation).toFixed(1)}%` : undefined}
                  />
                  <KPICard 
                    icon={Users}
                    label="Professores"
                    value={formatCurrency(lancamentosKPIs.professores.value)}
                    subvalue={`${lancamentosKPIs.professores.count} pessoas | ${lancamentosKPIs.professores.percent.toFixed(1)}%`}
                    variant="cyan"
                    trend={lancamentosKPIs.professores.variation !== null ? (lancamentosKPIs.professores.variation > 0 ? 'up' : 'down') : undefined}
                    trendValue={lancamentosKPIs.professores.variation !== null ? `${Math.abs(lancamentosKPIs.professores.variation).toFixed(1)}%` : undefined}
                  />
                </div>
                
                {!isMobile ? (
                <Card className="overflow-hidden border-0 bg-slate-800/40">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-700/50 text-xs text-slate-400 font-medium">
                          <th className="py-4 px-4 text-left">Colaborador</th>
                          <th className="py-4 px-2 text-center">Unid.</th>
                          <th className="py-4 px-2 text-center">Tipo</th>
                          <th className="py-4 px-2 text-right">Salário</th>
                          <th className="py-4 px-2 text-right">Bônus</th>
                          <th className="py-4 px-2 text-right">Comissão</th>
                            <th className="py-4 px-2 text-right">Reembolso</th>
                          <th className="py-4 px-2 text-right">Passagem</th>
                          <th className="py-4 px-2 text-right">INSS</th>
                          <th className="py-4 px-2 text-right">Descontos</th>
                          <th className="py-4 px-4 text-right text-white font-bold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(groupedLancamentos).map(([dept, rawLancs]) => {
                          const lancs = rawLancs as Lancamento[];
                          if (lancs.length === 0) return null;
                          
                          const sumSalario = lancs.reduce((acc, l) => acc + (l.salario || 0), 0);
                          const sumBonus = lancs.reduce((acc, l) => acc + (l.bonus || 0), 0);
                          const sumComissao = lancs.reduce((acc, l) => acc + (l.comissao || 0), 0);
                          const sumReembolso = lancs.reduce((acc, l) => acc + (l.reembolso || 0), 0);
                          const sumPassagem = lancs.reduce((acc, l) => acc + (l.passagem || 0), 0);
                          const sumInss = lancs.reduce((acc, l) => acc + (l.inss || 0), 0);
                          const sumDescontos = lancs.reduce((acc, l) => acc + (l.descontos || 0), 0);
                          const subtotal = lancs.reduce((acc, l) => acc + (l.total || 0), 0);
                          
                          return (
                            <React.Fragment key={dept}>
                              <tr 
                                className="bg-slate-900/50 cursor-pointer hover:bg-slate-800 transition-colors"
                                onClick={() => setExpandedDept(prev => ({ ...prev, [dept]: !prev[dept] }))}
                              >
                                <td colSpan={11} className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    {expandedDept[dept] ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronUp size={14} className="text-slate-500" />}
                                    <span className={`font-bold text-xs uppercase tracking-widest ${deptColors[dept]}`}>
                                      {deptLabels[dept]} ({lancs.length})
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right hidden">
                                  {/* Hidden because colspan takes over, maybe redesign if total needs to be shown */}
                                </td>
                              </tr>
                              {/* Add a separate row for subtotal if needed or keep it minimal. The design shows dept header row. */}
                              
                              {expandedDept[dept] && lancs.map(l => {
                                const colab = l.colaboradores || {} as Colaborador;
                                return (
                                  <tr key={l.id} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors group">
                                    <td className="py-3 px-4">
                                      <div className="flex items-center justify-between group/colab">
                                      <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 overflow-hidden">
                                            {colab.id === 2 || colab.nome?.includes('Ana Paula') ? (
                                              <img src="/Avatar_Ana.png" alt="Ana Paula" className="w-full h-full object-cover" />
                                            ) : colab.foto_url ? (
                                              <img src={colab.foto_url} alt={colab.nome} className="w-full h-full object-cover" />
                                            ) : (
                                              (colab.nome || '?').charAt(0)
                                            )}
                                        </div>
                                        <div>
                                          <div className="font-medium text-sm text-slate-200">{colab.nome || 'N/A'}</div>
                                          <div className="text-[10px] text-slate-500 uppercase">{colab.funcao || ''}</div>
                                        </div>
                                        </div>
                                        
                                        {statusFolha === 'rascunho' && (
                                          <Tooltip content="Excluir lançamento">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteLancamento(l);
                                              }}
                                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all mr-2"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </Tooltip>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-2 text-center">
                                      <span className="bg-slate-700 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-600">
                                        {unidadeLabels[l.unidade] || l.unidade}
                                      </span>
                                    </td>
                                    <td className="py-3 px-2 text-center">
                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                                            colab.tipo === 'clt' 
                                                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
                                                : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                                        }`}>
                                            {tipoLabels[colab.tipo] || colab.tipo?.slice(0,3)}
                                        </span>
                                    </td>
                                    <td className="py-3 px-1">
                                      <CellInput 
                                        value={l.salario} 
                                        disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                                        onSave={(val) => saveLancamentoPatch(l, { salario: val })} 
                                      />
                                    </td>
                                    <td className="py-3 px-1">
                                      <CellInput 
                                        value={l.bonus} 
                                        disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                                        onSave={(val) => saveLancamentoPatch(l, { bonus: val })} 
                                      />
                                    </td>
                                    <td className="py-3 px-1">
                                      <CellInput 
                                        value={l.comissao} 
                                        disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                                        onSave={(val) => saveLancamentoPatch(l, { comissao: val })} 
                                      />
                                    </td>
                                    <td className="py-3 px-1">
                                      <CellInput 
                                        value={l.reembolso} 
                                        disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                                        onSave={(val) => saveLancamentoPatch(l, { reembolso: val })} 
                                      />
                                    </td>
                                    <td className="py-3 px-1">
                                      <CellInput 
                                        value={l.passagem} 
                                        disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                                        onSave={(val) => saveLancamentoPatch(l, { passagem: val })} 
                                      />
                                    </td>
                                    <td className="py-3 px-1 text-rose-400/80">
                                      <CellInput 
                                        value={l.inss} 
                                        disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                                        onSave={(val) => saveLancamentoPatch(l, { inss: val })} 
                                      />
                                    </td>
                                    <td className="py-3 px-1 text-rose-400/80">
                                      <CellInput 
                                        value={l.descontos} 
                                        disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                                        onSave={(val) => saveLancamentoPatch(l, { descontos: val })} 
                                      />
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <div className="flex flex-col items-end">
                                      <span className="font-mono font-bold text-sm text-white">{formatCurrency(l.total)}</span>
                                        {(() => {
                                          const { prevMap } = aggregatedData;
                                          const prev = prevMap[l.colaborador_id];
                                          if (prev && prev.total > 0) {
                                            const currColabTotal = aggregatedData.currentMap[l.colaborador_id]?.total || 0;
                                            const perc = ((currColabTotal - prev.total) / prev.total) * 100;
                                            if (Math.abs(perc) > 0.1) {
                                              return (
                                                <span className={`text-[10px] font-bold ${perc > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                  {perc > 0 ? '+' : ''}{perc.toFixed(1)}%
                                                </span>
                                              );
                                            }
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                               <tr className="bg-slate-800/30 border-t border-slate-700/50">
                                   <td colSpan={3} className="py-3 px-4">
                                     <div className="flex items-center justify-between">
                                       <div className="flex flex-col gap-0.5">
                                         <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                                           Resumo da Categoria
                                         </span>
                                         <span className={`text-[10px] font-bold uppercase tracking-widest ${deptColors[dept]}`}>
                                           {deptLabels[dept]}
                                         </span>
                                       </div>
                                       <div className="flex flex-col items-end gap-0.5 pr-6">
                                         <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                                           Representatividade {unidadeFiltro === 'todos' ? 'Geral' : unidadeLabels[unidadeFiltro]}
                                         </span>
                                         <span className="text-[11px] font-bold text-slate-400">
                                           {filteredTotalGeral > 0 ? ((subtotal / filteredTotalGeral) * 100).toFixed(2) : '0.00'}%
                                         </span>
                                       </div>
                                     </div>
                                   </td>
                                   <td className="py-3 px-1 text-right">
                                     <span className="text-xs font-mono text-slate-400 font-bold">{formatCurrency(sumSalario)}</span>
                                   </td>
                                   <td className="py-3 px-1 text-right">
                                     <span className="text-xs font-mono text-slate-400 font-bold">{formatCurrency(sumBonus)}</span>
                                   </td>
                                   <td className="py-3 px-1 text-right">
                                     <span className="text-xs font-mono text-slate-400 font-bold">{formatCurrency(sumComissao)}</span>
                                   </td>
                                   <td className="py-3 px-1 text-right">
                                     <span className="text-xs font-mono text-slate-400 font-bold">{formatCurrency(sumReembolso)}</span>
                                   </td>
                                   <td className="py-3 px-1 text-right">
                                     <span className="text-xs font-mono text-slate-400 font-bold">{formatCurrency(sumPassagem)}</span>
                                   </td>
                                   <td className="py-3 px-1 text-right text-rose-400/80">
                                     <span className="text-xs font-mono font-bold">{formatCurrency(sumInss)}</span>
                                   </td>
                                   <td className="py-3 px-1 text-right text-rose-400/80">
                                     <span className="text-xs font-mono font-bold">{formatCurrency(sumDescontos)}</span>
                                   </td>
                                   <td className={`py-3 px-4 text-right font-mono font-bold text-sm ${deptColors[dept]}`}>
                                     <div className="flex flex-col items-end">
                                       <span className="text-[9px] text-slate-500 uppercase font-medium mb-0.5">Subtotal {deptLabels[dept]}</span>
                                       {formatCurrency(subtotal)}
                                     </div>
                                   </td>
                               </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
                ) : (
                  <div className="space-y-4">
                    {/* Busca + atalhos */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-2xl bg-slate-950/60 border border-slate-800/60 text-slate-400">
                          <Search size={16} />
                        </div>
                        <input
                          value={lancamentosSearch}
                          onChange={(e) => setLancamentosSearch(e.target.value)}
                          placeholder="Buscar colaborador (nome ou função)"
                          className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 text-sm font-bold outline-none"
                        />
                        {lancamentosSearch.trim() ? (
                          <button
                            type="button"
                            onClick={() => setLancamentosSearch('')}
                            className="p-2 rounded-2xl bg-slate-950/60 border border-slate-800/60 text-slate-400"
                            aria-label="Limpar busca"
                          >
                            <X size={16} />
                          </button>
                        ) : null}
                      </div>

                    </div>

                    {/* Summary bar discreta */}
                    <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/60 rounded-3xl px-5 py-4">
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest truncate">
                          Total {unidadeFiltro === 'todos' ? 'Geral' : unidadeLabels[unidadeFiltro]} • {lancamentosKPIs.total.count} colaboradores
                        </div>
                        <div className="text-lg font-black text-white truncate">{formatCurrency(filteredTotalGeral)}</div>
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {statusFolha === 'rascunho' ? 'Rascunho' : statusFolha}
                      </div>
                    </div>

                    {/* Cards por grupo */}
                    <div className="space-y-3">
                      {(['staff_rateado', 'equipe_operacional', 'professores'] as const).map((dept) => {
                        const lancs = (groupedLancamentosMobile as any)[dept] as Lancamento[];
                        if (!lancs || lancs.length === 0) return null;

                        const subtotal = lancs.reduce((acc, l) => acc + (l.total || 0), 0);
                        const visible = lancs.slice(0, lancamentosVisibleByDept[dept] ?? MOBILE_LANC_PAGE_SIZE);
                        const hasMore = visible.length < lancs.length;

                        return (
                          <div key={dept} ref={(el) => { deptHeaderRefs.current[dept] = el; }} className="space-y-2">
                            <button
                              type="button"
                              onClick={() => setExpandedDept((prev) => ({ ...prev, [dept]: !prev[dept] }))}
                              className="w-full flex items-center justify-between px-5 py-4 rounded-3xl bg-slate-900/40 border border-slate-800/60"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {expandedDept[dept] ? (
                                  <ChevronDown size={18} className="text-slate-500 shrink-0" />
                                ) : (
                                  <ChevronUp size={18} className="text-slate-500 shrink-0" />
                                )}
                                <div className="min-w-0 text-left">
                                  <div className={cn("text-[11px] font-black uppercase tracking-widest truncate", deptColors[dept])}>
                                    {deptLabels[dept]} ({lancs.length})
                                  </div>
                                  <div className="text-xs text-slate-400 font-bold truncate">{formatCurrency(subtotal)}</div>
                                </div>
                              </div>
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Abrir</span>
                            </button>

                            {expandedDept[dept] ? (
                              <div className="space-y-2">
                                {visible.map((l) => {
                                  const colab = (l.colaboradores || {}) as Colaborador;
                                  const tipo = (colab.tipo || '') as any;
                                  const tipoLabel = tipoLabels[tipo] || (tipo ? String(tipo).slice(0, 3) : '—');

                                  const badge = (label: string, val: number, variant?: 'muted' | 'pos' | 'neg') => (
                                    <div
                                      className={cn(
                                        "flex items-center justify-between gap-2 px-3 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest",
                                        variant === 'neg'
                                          ? "bg-rose-500/10 border-rose-500/20 text-rose-200"
                                          : variant === 'pos'
                                            ? "bg-slate-950/40 border-slate-800/60 text-slate-200"
                                            : "bg-slate-950/20 border-slate-800/50 text-slate-500"
                                      )}
                                    >
                                      <span>{label}</span>
                                      <span className="font-mono text-[11px] normal-case tracking-normal">{val ? formatCurrency(val) : '—'}</span>
                                    </div>
                                  );

                                  return (
                                    <button
                                      key={l.id}
                                      type="button"
                                      onClick={() => {
                                        // Se está em Consolidado, muda para a unidade do lançamento para permitir edição
                                        if (unidadeFiltro === 'todos' && l.unidade) {
                                          setUnidadeFiltro(l.unidade);
                                        }
                                        setMobileLancDetail(l);
                                      }}
                                      className="w-full text-left px-5 py-4 rounded-3xl bg-slate-900/40 border border-slate-800/60 hover:bg-slate-900/55 transition-colors"
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                          <div className="text-slate-100 font-black truncate">{colab.nome || 'N/A'}</div>
                                          <div className="mt-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <span className="px-2 py-1 rounded-full bg-slate-950/40 border border-slate-800/60">
                                              {unidadeLabels[l.unidade] || l.unidade}
                                            </span>
                                            <span className="px-2 py-1 rounded-full bg-slate-950/40 border border-slate-800/60">
                                              {tipoLabel}
                                            </span>
                                          </div>
                                          {colab.funcao ? (
                                            <div className="mt-1 text-xs text-slate-400 font-bold truncate">{colab.funcao}</div>
                                          ) : null}
                                        </div>
                                        <div className="shrink-0 text-right">
                                          <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Total</div>
                                          <div className="text-lg font-black text-white font-mono">{formatCurrency(l.total)}</div>
                                        </div>
                                      </div>

                                      <div className="mt-3 grid grid-cols-2 gap-2">
                                        {badge('Salário', l.salario, l.salario ? 'pos' : 'muted')}
                                        {badge('Bônus', l.bonus, l.bonus ? 'pos' : 'muted')}
                                        {badge('Comissão', l.comissao, l.comissao ? 'pos' : 'muted')}
                                        {badge('INSS', l.inss, l.inss ? 'neg' : 'muted')}
                                        {badge('Descontos', l.descontos, l.descontos ? 'neg' : 'muted')}
                                        {badge('Passagem', l.passagem, l.passagem ? 'pos' : 'muted')}
                                      </div>
                                    </button>
                                  );
                                })}

                                {hasMore ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLancamentosVisibleByDept((prev) => ({
                                        ...prev,
                                        [dept]: Math.min((prev[dept] ?? MOBILE_LANC_PAGE_SIZE) + MOBILE_LANC_PAGE_SIZE, lancs.length),
                                      }))
                                    }
                                    className="w-full px-5 py-3 rounded-2xl bg-slate-900/30 border border-slate-800/60 text-slate-200 font-black text-sm hover:bg-slate-900/45 transition-colors"
                                  >
                                    Mostrar mais ({lancs.length - visible.length})
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {!isMobile ? (
                <div className="flex justify-end">
                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 inline-flex flex-col items-end gap-1 min-w-[200px]">
                      <span className="text-xs text-slate-500 uppercase tracking-wider">
                        Total {unidadeFiltro === 'todos' ? 'Geral' : unidadeLabels[unidadeFiltro]}
                      </span>
                      <span className="text-2xl font-bold text-white">{formatCurrency(filteredTotalGeral)}</span>
                    </div>
                </div>
                ) : null}

                {/* Mobile: Detail Sheet do lançamento */}
                <Modal
                  isOpen={isMobile && !!mobileLancDetail}
                  onClose={() => setMobileLancDetail(null)}
                  title={mobileLancDetail?.colaboradores?.nome || 'Detalhes do colaborador'}
                  subtitle="Detalhes e edição rápida do lançamento"
                  position="bottom"
                  className="max-w-none"
                  footer={
                    mobileLancDetail ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setMobileLancDetail(null)}
                            className="flex-1 px-6 py-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 font-black transition-all active:scale-95"
                          >
                            Fechar
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!folhaAtual || !mobileLancDetail) return;
                              try {
                                const clone: any = {
                                  folha_id: folhaAtual.id,
                                  colaborador_id: mobileLancDetail.colaborador_id,
                                  unidade: mobileLancDetail.unidade,
                                  categoria: mobileLancDetail.categoria,
                                  salario: mobileLancDetail.salario || 0,
                                  bonus: mobileLancDetail.bonus || 0,
                                  comissao: mobileLancDetail.comissao || 0,
                                  reembolso: mobileLancDetail.reembolso || 0,
                                  passagem: mobileLancDetail.passagem || 0,
                                  inss: mobileLancDetail.inss || 0,
                                  descontos: mobileLancDetail.descontos || 0,
                                  observacao: mobileLancObs || '',
                                };
                                await api.createLancamento(clone);
                                await loadMonthData(folhaAtual.id, folhas);
                                setAlertState({ isOpen: true, title: 'Sucesso', message: 'Linha duplicada.', variant: 'primary' });
                              } catch (err: any) {
                                setAlertState({ isOpen: true, title: 'Erro', message: err?.message || 'Falha ao duplicar linha', variant: 'danger' });
                              }
                            }}
                            disabled={statusFolha !== 'rascunho'}
                            className={cn(
                              "flex-1 px-6 py-3.5 rounded-2xl font-black transition-all active:scale-95 shadow-lg",
                              statusFolha !== 'rascunho'
                                ? "bg-slate-800/60 text-slate-500 cursor-not-allowed shadow-transparent"
                                : "bg-slate-900/60 hover:bg-slate-900 text-white shadow-slate-950/30"
                            )}
                          >
                            Duplicar linha
                          </button>
              </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!mobileLancDetail) return;
                            setMobileLancDetail(null);
                            handleDeleteLancamento(mobileLancDetail);
                          }}
                          disabled={statusFolha !== 'rascunho'}
                          className={cn(
                            "w-full px-6 py-3.5 rounded-2xl font-black transition-all active:scale-95 shadow-lg",
                            statusFolha !== 'rascunho'
                              ? "bg-slate-800/60 text-slate-500 cursor-not-allowed shadow-transparent"
                              : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20"
                          )}
                        >
                          Excluir linha
                        </button>
                      </div>
                    ) : null
                  }
                >
                  {mobileLancDetail ? (
                    <div className="space-y-5">
                      {(() => {
                        const prev = aggregatedData?.prevMap?.[mobileLancDetail.colaborador_id];
                        const currTotal = aggregatedData?.currentMap?.[mobileLancDetail.colaborador_id]?.total || mobileLancDetail.total || 0;
                        const prevTotal = prev?.total || 0;
                        const perc = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;
                        return (
                          <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Total do colaborador</div>
                                <div className="text-2xl font-black text-white font-mono truncate">{formatCurrency(currTotal)}</div>
                                <div className="mt-1 text-xs text-slate-400 font-bold">
                                  {mobileLancDetail.categoria ? deptLabels[mobileLancDetail.categoria] : ''}
                                  {' • '}
                                  Unidade {unidadeLabels[mobileLancDetail.unidade] || mobileLancDetail.unidade}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Anterior</div>
                                <div className="text-sm font-black text-slate-200 font-mono">{prevTotal > 0 ? formatCurrency(prevTotal) : '—'}</div>
                                {perc !== null ? (
                                  <div className={cn("mt-1 text-[11px] font-black", perc > 0 ? "text-rose-300" : "text-emerald-300")}>
                                    {perc > 0 ? '+' : ''}{perc.toFixed(1)}%
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-1 gap-3">
                        {([
                          { k: 'salario', label: 'Salário', neg: false },
                          { k: 'bonus', label: 'Bônus', neg: false },
                          { k: 'comissao', label: 'Comissão', neg: false },
                          { k: 'reembolso', label: 'Reembolso', neg: false },
                          { k: 'passagem', label: 'Passagem', neg: false },
                          { k: 'inss', label: 'INSS', neg: true },
                          { k: 'descontos', label: 'Descontos', neg: true },
                        ] as const).map(({ k, label, neg }) => (
                          <div key={k} className="flex items-center justify-between gap-4 bg-slate-900/40 border border-slate-800/60 rounded-3xl px-4 py-3">
                            <div className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</div>
                            <div className="w-[170px]">
                              <CellInput
                                value={(mobileLancDetail as any)[k] || 0}
                                disabled={unidadeFiltro === 'todos' || statusFolha !== 'rascunho'}
                                colorClass={neg ? 'text-rose-300' : 'text-slate-100'}
                                onSave={(val) => saveLancamentoPatch(mobileLancDetail, { [k]: val } as any)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Observação</div>
                        <textarea
                          spellCheck={false}
                          value={mobileLancObs}
                          onChange={(e) => setMobileLancObs(e.target.value)}
                          onBlur={async () => {
                            if (!mobileLancDetail) return;
                            const next = (mobileLancObs || '').trim();
                            const curr = (mobileLancDetail.observacao || '').trim();
                            if (next === curr) return;
                            setMobileLancObsSaving(true);
                            try {
                              await api.updateLancamento(mobileLancDetail.id, { observacao: next } as any);
                              setLancamentos((prev) => prev.map((x) => (x.id === mobileLancDetail.id ? ({ ...x, observacao: next } as any) : x)));
                            } catch (err: any) {
                              setAlertState({ isOpen: true, title: 'Erro', message: err?.message || 'Falha ao salvar observação', variant: 'danger' });
                              setMobileLancObs(mobileLancDetail.observacao || '');
                            } finally {
                              setMobileLancObsSaving(false);
                            }
                          }}
                          placeholder="Anotações rápidas sobre esse lançamento…"
                          className="w-full min-h-[90px] bg-slate-950/30 border border-slate-800/60 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-violet-500/40"
                        />
                        <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-500">
                          <span>Salva automaticamente ao sair do campo</span>
                          <span>{mobileLancObsSaving ? 'Salvando…' : '—'}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </Modal>
              </div>
            )}
            
            {activeTab === 'comparativo' && (
              <div className="space-y-6">
                {!comparativoMensal ? (
                 <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed border-2 border-slate-700 bg-transparent">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-500">
                        <BarChart3 size={32} />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Dados insuficientes</h3>
                    <p className="text-slate-400 max-w-md">
                        O comparativo histórico será ativado assim que houver mais de um mês de folha processado no sistema.
                    </p>
                 </Card>
                ) : (
                  <div className="space-y-6">
                    {/* IA & Sugestão da Ana */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className="lg:col-span-2 overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-700 flex items-start justify-between gap-4 bg-slate-800/20">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Sparkles size={16} className="text-cyan-400" />
                              <h3 className="text-lg font-semibold text-white">Insights de IA</h3>
                            </div>
                            <p className="text-xs text-slate-400">
                              Análise automática de sazonalidade e padrões de variação.
                            </p>
                          </div>
                          <button
                            onClick={() => selectedFolhaId && loadAiInsights(selectedFolhaId)}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 transition-colors border border-slate-700"
                            disabled={aiInsightsLoading || !selectedFolhaId}
                          >
                            {aiInsightsLoading ? 'Analisando...' : 'Atualizar'}
                          </button>
                        </div>
                        <div className="p-6 flex-1">
                          {aiInsightsError ? (
                            <div className="text-sm text-rose-300 bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20 flex items-center gap-3">
                              <AlertTriangle size={18} />
                              {aiInsightsError}
                            </div>
                          ) : aiInsightsLoading && !aiInsights ? (
                            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-4">
                              <div className="relative">
                                <Loader2 className="animate-spin text-cyan-400" size={32} />
                                <Sparkles className="absolute -top-1 -right-1 text-amber-400 animate-pulse" size={12} />
                              </div>
                              <div className="text-center">
                                <span className="text-sm font-bold text-slate-200 block">Analisando Padrões...</span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Cruzando dados de sazonalidade e memória organizacional</span>
                              </div>
                            </div>
                          ) : aiInsights ? (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                              {/* --- Section 1: Executive Summary --- */}
                              <section>
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="w-1.5 h-4 bg-cyan-500 rounded-full"></div>
                                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Resumo Executivo</h4>
                                </div>
                                <div className="bg-slate-900/40 border border-slate-700/30 rounded-3xl p-6 relative overflow-hidden group">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-500 to-violet-500"></div>
                                  <p className="text-slate-200 leading-relaxed text-sm md:text-base font-medium italic">
                                    {aiInsights.summary}
                                  </p>
                                </div>
                              </section>

                              {/* --- Section 2: Detailed Highlights --- */}
                              {aiInsights?.response_json?.insights_detalhados?.length ? (
                                <section>
                                  <div className="flex items-center gap-2 mb-4">
                                    <div className="w-1.5 h-4 bg-violet-500 rounded-full"></div>
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ocorrências e Padrões</h4>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {aiInsights.response_json.insights_detalhados.map((ins: any, idx: number) => {
                                      const tipo = (ins.tipo || 'remuneracao').toLowerCase();
                                      const iconMap: Record<string, any> = {
                                        turnover: { icon: UserX, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
                                        comercial: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                                        sazonalidade: { icon: Clock, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
                                        remuneracao: { icon: Coins, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
                                        default: { icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
                                      };
                                      const config = iconMap[tipo] || iconMap.default;
                                      const Icon = config.icon;

                                      return (
                                        <div key={idx} className={`group p-5 rounded-2xl bg-slate-800/20 border ${config.border} hover:bg-slate-800/40 transition-all duration-300`}>
                                          <div className="flex items-start gap-4">
                                            <div className={`p-2.5 rounded-xl ${config.bg} ${config.color} shadow-inner`}>
                                              <Icon size={18} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <h5 className="text-sm font-bold text-white tracking-tight">{ins.titulo}</h5>
                                                {ins.impacto_financeiro && (
                                                  <span className={`text-[10px] font-mono font-bold ${ins.impacto_financeiro > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {ins.impacto_financeiro > 0 ? '+' : ''}{formatCurrency(ins.impacto_financeiro)}
                                                  </span>
                                                )}
                                              </div>
                                              <p className="text-xs text-slate-400 leading-relaxed group-hover:text-slate-300">
                                                {ins.descricao}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </section>
                              ) : null}

                              {/* --- Section 3: Action Recommendations --- */}
                              {aiInsights?.response_json?.recomendacoes?.length ? (
                                <section>
                                  <div className="flex items-center gap-2 mb-4">
                                    <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div>
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Sugestões de Ajuste</h4>
                                  </div>
                                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 space-y-3">
                                    {aiInsights.response_json.recomendacoes.map((rec: string, idx: number) => (
                                      <div key={idx} className="flex items-start gap-3">
                                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></div>
                                        <p className="text-xs text-slate-300 leading-snug">{rec}</p>
                                      </div>
                                    ))}
                                  </div>
                                </section>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-48 text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl gap-4">
                              <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center">
                                <Sparkles size={24} className="text-slate-700" />
                              </div>
                              <div className="text-center">
                                <span className="text-sm font-medium">Insights não gerados</span>
                                <p className="text-[10px] text-slate-600 mt-1 max-w-[200px]">Clique em atualizar para processar as variações deste mês.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>

                      <Card className="overflow-hidden flex flex-col border-violet-500/20 shadow-violet-500/5">
                        <div className="p-6 border-b border-slate-700 bg-violet-500/5 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 p-0.5 border border-violet-500/20 overflow-hidden shrink-0 shadow-lg">
                            <img 
                              src="/Avatar_Ana.png" 
                              onError={(e) => { (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=Ana&background=8b5cf6&color=fff'; }}
                              alt="Ana RH" 
                              className="w-full h-full object-cover rounded-xl"
                            />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg font-semibold text-white">Sugestão da Ana</h3>
                            <p className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">RH & Gestão de Pessoas</p>
                          </div>
                        </div>
                        <div className="p-6 flex-1 flex flex-col gap-4">
                          <div className="flex-1 relative">
                            <textarea
                              value={anaNote}
                              onChange={(e) => setAnaNote(e.target.value)}
                              onBlur={handleSaveAnaNote}
                              placeholder="Ana, registre aqui suas percepções sobre este fechamento..."
                              className="w-full h-full min-h-[160px] bg-slate-900/40 border border-slate-700/50 rounded-2xl p-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/40 transition-all resize-none placeholder:text-slate-600"
                              disabled={anaNoteSaving}
                              spellCheck="false"
                            />
              {anaNoteSaving && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] text-violet-400 font-bold bg-slate-900 px-2 py-1 rounded-lg">
                  <Loader2 size={10} className="animate-spin" />
                  SALVANDO...
                </div>
              )}
              {anaNoteSaved && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] text-emerald-400 font-bold bg-slate-900 px-2 py-1 rounded-lg">
                  <CheckCircle size={10} />
                  SALVO NA NUVEM
                </div>
              )}
                          </div>
                          <p className="text-[10px] text-slate-500 text-center">
                            Suas notas ajudam a treinar a IA para reconhecer padrões futuros.
                          </p>
                        </div>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 text-white">Resumo da Variação</h3>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Total Mês Anterior</span>
                            <span className="font-mono text-white">{formatCurrency(comparativoMensal.totalAnterior)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Total Mês Atual</span>
                            <span className="font-mono text-white">{formatCurrency(totais.totalGeral)}</span>
                          </div>
                          <div className="pt-4 border-t border-slate-700 flex justify-between items-center">
                            <span className="font-semibold text-white">Diferença</span>
                            <div className={`flex items-center gap-2 font-bold ${comparativoMensal.varTotal > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {comparativoMensal.varTotal > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                              {formatCurrency(totais.totalGeral - comparativoMensal.totalAnterior)} 
                              &nbsp;({comparativoMensal.varTotal > 0 ? '+' : ''}{comparativoMensal.varTotal.toFixed(1)}%)
                            </div>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 text-white">Variação de Equipe</h3>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Equipe Mês Anterior</span>
                            <span className="font-mono text-white">{comparativoMensal.headcountAnterior}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Equipe Mês Atual</span>
                            <span className="font-mono text-white">{totais.headcount.total}</span>
                          </div>
                          <div className="pt-4 border-t border-slate-700 flex justify-between items-center">
                            <span className="font-semibold text-white">Variação</span>
                            <div className={`flex items-center gap-2 font-bold ${comparativoMensal.varHeadcount > 0 ? 'text-cyan-400' : 'text-slate-400'}`}>
                              {comparativoMensal.varHeadcount > 0 ? <Users size={18} /> : <Users size={18} />}
                              {totais.headcount.total - comparativoMensal.headcountAnterior} 
                              &nbsp;({comparativoMensal.varHeadcount > 0 ? '+' : ''}{comparativoMensal.varHeadcount.toFixed(0)}%)
                            </div>
                          </div>
                        </div>
                      </Card>
                    </div>

                    <Card className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setVariacoesOpen(!variacoesOpen)}
                        className="w-full p-4 md:p-6 border-b border-slate-700 flex items-center justify-between text-left group transition-all active:bg-slate-800/40"
                      >
                        <div className="min-w-0">
                          <h3 className="text-base md:text-lg font-black text-white">Maiores Variações por Colaborador</h3>
                          <p className="mt-1 text-[11px] md:text-xs text-slate-400 font-medium">
                            {variacoesOpen ? 'Toque para recolher a análise detalhada' : 'Toque para expandir e ver as variações por colaborador'}
                          </p>
                        </div>
                        <div className={cn(
                          "w-10 h-10 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 group-hover:text-white transition-all",
                          variacoesOpen ? "rotate-180" : ""
                        )}>
                          <ChevronDown size={20} />
                        </div>
                      </button>

                      {variacoesOpen && (() => {
                        const { currentMap, prevMap } = aggregatedData;
                        const allColabIds = Array.from(new Set([
                          ...Object.keys(currentMap).map(Number),
                          ...Object.keys(prevMap).map(Number)
                        ]));

                        const items = allColabIds
                          .map(id => {
                            const curr = currentMap[id];
                            const prev = prevMap[id];
                            const totalCurr = curr?.total || 0;
                            const totalPrev = prev?.total || 0;
                            const diff = totalCurr - totalPrev;
                            const perc = totalPrev > 0 ? (diff / totalPrev) * 100 : 0;

                            return {
                              id,
                              nome: curr?.nome || prev?.nome,
                              funcao: curr?.funcao || prev?.funcao,
                              totalCurr,
                              totalPrev,
                              diff,
                              perc,
                              status: !prev ? 'NOVO' : !curr ? 'SAIU' : null
                            };
                          })
                          .filter(item => Math.abs(item.perc) > 0.1 || item.status)
                          .sort((a, b) => {
                            if (a.status && !b.status) return -1;
                            if (!a.status && b.status) return 1;
                            return Math.abs(b.perc) - Math.abs(a.perc);
                          });

                        const colorFor = (status: string | null, perc: number) => {
                          if (status === 'SAIU') return 'text-rose-400';
                          if (status === 'NOVO') return 'text-emerald-400';
                          if (perc > 15) return 'text-rose-400';
                          if (perc < -15) return 'text-emerald-400';
                          if (perc > 0) return 'text-amber-400';
                          return 'text-slate-400';
                        };

                        const statusPill = (status: string | null) => {
                          if (!status) return null;
                          return (
                            <span className={cn(
                              "shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border",
                              status === 'NOVO'
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            )}>
                              {status}
                            </span>
                          );
                        };

                        return (
                          <>
                            {/* MOBILE: cards (no horizontal scroll) */}
                            <div className="lg:hidden divide-y divide-slate-800/60">
                              {items.map(({ id, nome, funcao, totalCurr, totalPrev, diff, perc, status }) => (
                                <div key={id} className="p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <div className="font-black text-slate-100 leading-snug break-words">
                                          {nome}
                                        </div>
                                        {statusPill(status)}
                                      </div>
                                      <div className="mt-0.5 text-[11px] text-slate-500 font-bold truncate">
                                        {funcao || '—'}
                                      </div>
                                    </div>

                                    <div className={cn("text-right shrink-0", colorFor(status, perc))}>
                                      <div className="inline-flex items-center justify-end gap-1 font-black text-sm">
                                        {!status && (perc > 0 ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                        {status ? (status === 'NOVO' ? '+100%' : '-100%') : `${perc.toFixed(1)}%`}
                                      </div>
                                      <div className="text-[10px] font-mono opacity-80">
                                        {formatCurrency(diff)}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Metrics grid */}
                                  <div className="mt-3 grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 px-3 py-2">
                                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                        Mês anterior
                                      </div>
                                      <div className="mt-0.5 font-mono text-sm text-slate-300">
                                        {totalPrev > 0 ? formatCurrency(totalPrev) : '—'}
                                      </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 px-3 py-2">
                                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                        Mês atual
                                      </div>
                                      <div className="mt-0.5 font-mono text-sm text-slate-100">
                                        {totalCurr > 0 ? formatCurrency(totalCurr) : '—'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Note (Ana) */}
                                  <div className="mt-3">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                      Motivo (Ana)
                                    </div>
                                    <div className="relative">
                                      <textarea
                                        value={noteDrafts[id] ?? ''}
                                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                                        onBlur={() => handleSaveNote(id)}
                                        placeholder="Ex.: férias (sem VT), bônus pontual, pico de matrículas..."
                                        className="w-full h-[70px] resize-none bg-slate-900/40 border border-slate-700/50 rounded-2xl px-3 py-2 text-[11px] text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/40"
                                        disabled={noteSaving[id]}
                                        spellCheck="false"
                                      />
                                      {noteSaving[id] && (
                                        <div className="absolute right-3 top-3 text-[10px] text-violet-400 font-bold flex items-center gap-1">
                                          <Loader2 size={10} className="animate-spin" />
                                          Salvando...
                                        </div>
                                      )}
                                      {noteSaved[id] && (
                                        <div className="absolute right-3 top-3 text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                          <CheckCircle size={10} />
                                          Salvo
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* DESKTOP: keep table */}
                            <div className="hidden lg:block overflow-x-auto">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                                    <th className="py-4 px-6">Colaborador</th>
                                    <th className="py-4 px-2 text-right">Mês Anterior</th>
                                    <th className="py-4 px-2 text-right">Mês Atual</th>
                                    <th className="py-4 px-6">Motivo (Ana)</th>
                                    <th className="py-4 px-6 text-right">Variação</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map(({ id, nome, funcao, totalCurr, totalPrev, diff, perc, status }) => (
                                    <tr key={id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                                      <td className="py-4 px-6">
                                        <div className="flex items-center gap-3">
                                          <div>
                                            <div className="font-medium text-slate-200">{nome}</div>
                                            <div className="text-xs text-slate-500">{funcao}</div>
                                          </div>
                                          {status && (
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                              status === 'NOVO' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                            }`}>
                                              {status}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-4 px-2 text-right font-mono text-sm text-slate-400">
                                        {totalPrev > 0 ? formatCurrency(totalPrev) : '-'}
                                      </td>
                                      <td className="py-4 px-2 text-right font-mono text-sm text-slate-200">
                                        {totalCurr > 0 ? formatCurrency(totalCurr) : '-'}
                                      </td>
                                      <td className="py-4 px-6">
                                        <div className="relative">
                                          <textarea
                                            value={noteDrafts[id] ?? ''}
                                            onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                                            onBlur={() => handleSaveNote(id)}
                                            placeholder="Ex.: férias (sem VT), bônus pontual, pico de matrículas..."
                                            className="w-full min-w-[280px] h-[52px] resize-none bg-slate-900/40 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/40"
                                            disabled={noteSaving[id]}
                                            spellCheck="false"
                                          />
                                          {noteSaving[id] && (
                                            <div className="absolute right-3 top-3 text-[10px] text-violet-400 font-bold flex items-center gap-1">
                                              <Loader2 size={10} className="animate-spin" />
                                              SALVANDO...
                                            </div>
                                          )}
                                          {noteSaved[id] && (
                                            <div className="absolute right-3 top-3 text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                              <CheckCircle size={10} />
                                              SALVO
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                      <td className={`py-4 px-6 text-right font-bold ${colorFor(status, perc)}`}>
                                        <div className="flex items-center justify-end gap-1">
                                          {!status && (perc > 0 ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                          {status ? (status === 'NOVO' ? '+100%' : '-100%') : `${perc.toFixed(1)}%`}
                                        </div>
                                        <div className="text-[10px] opacity-70">{formatCurrency(diff)}</div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        );
                      })()}
                    </Card>
                  </div>
                )}

                {/* Mobile: detalhe do colaborador (modal) */}
                <Modal
                  isOpen={!!mobileCollabDetail}
                  onClose={() => setMobileCollabDetail(null)}
                  title={mobileCollabDetail?.nome || 'Colaborador'}
                  subtitle={mobileCollabDetail?.funcao || 'Detalhes e ações rápidas'}
                  className="max-w-2xl"
                  footer={
                    mobileCollabDetail ? (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => setMobileCollabDetail(null)}
                          className="flex-1 px-6 py-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 font-black transition-all active:scale-95"
                        >
                          Fechar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCollab({ ...(mobileCollabDetail as any), salario_base: getEffectiveBaseSalary(mobileCollabDetail) } as any);
                            setIsCollabModalOpen(true);
                            setMobileCollabDetail(null);
                          }}
                          className="flex-1 px-6 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-black transition-all shadow-lg shadow-violet-600/20 active:scale-95"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleToggleInactiveCollab(mobileCollabDetail);
                            setMobileCollabDetail(null);
                          }}
                          className="flex-1 px-6 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black transition-all shadow-lg shadow-amber-600/20 active:scale-95"
                        >
                          {mobileCollabDetail.status === 'active' ? 'Inativar' : 'Reativar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleDeleteCollab(mobileCollabDetail);
                            setMobileCollabDetail(null);
                          }}
                          className="flex-1 px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black transition-all shadow-lg shadow-rose-600/20 active:scale-95"
                        >
                          Excluir
                        </button>
                      </div>
                    ) : null
                  }
                >
                  {mobileCollabDetail ? (
                    <div className="space-y-4">
                      <CollaboratorCard
                        collaborator={mobileCollabDetail as any}
                        onEdit={(collab) => { setEditingCollab({ ...collab, salario_base: getEffectiveBaseSalary(collab) }); setIsCollabModalOpen(true); setMobileCollabDetail(null); }}
                        onToggleInactive={handleToggleInactiveCollab}
                        onDelete={handleDeleteCollab}
                        isMobile
                      />
                    </div>
                  ) : null}
                </Modal>
              </div>
            )}

            {/* Action Bar Footer (if pending) */}
            {statusFolha === 'pendente' && (
              <div className="fixed bottom-6 left-0 right-0 px-4 z-40 pointer-events-none">
                <div className="max-w-3xl mx-auto pointer-events-auto">
                    <div className="bg-slate-800/90 backdrop-blur-md border border-amber-500/30 shadow-2xl shadow-black/50 p-4 rounded-2xl flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
                                <Clock size={20} />
                            </div>
                            <div>
                                <div className="font-bold text-white text-sm">Aprovação Necessária</div>
                                <div className="text-xs text-slate-400">Esta folha está pendente de revisão.</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Tooltip content="Rejeitar">
                            <button 
                                onClick={() => handleUpdateStatus('rascunho')}
                                className="p-2 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors"
                            >
                                <XCircle size={20} />
                            </button>
                            </Tooltip>
                            <button 
                                onClick={() => handleUpdateStatus('aprovada')}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20"
                            >
                                <CheckCircle size={16} />
                                Aprovar
                            </button>
                        </div>
                    </div>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </main>
      
      {/* Mobile Bottom Navbar (4 módulos) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-[10500] border-t border-slate-800/70 bg-[#0f172a]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
        aria-label="Navegação inferior"
      >
        <div className="px-4 pt-2">
          <div className="grid grid-cols-4 gap-2">
            {([
              { id: 'folha', label: 'Folha', icon: Users },
              { id: 'contas', label: 'Contas', icon: CreditCard },
              { id: 'agenda', label: 'Agenda', icon: Calendar },
              { id: 'notificacoes', label: 'Notif.', icon: Bell },
            ] as const).map((item) => {
              const active = currentModule === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 py-3 transition-all',
                    active
                      ? 'text-violet-400'
                      : 'text-slate-500 hover:text-slate-300'
                  )}
                  aria-label={item.label}
                >
                  <Icon className={cn("w-6 h-6 transition-all", active && "scale-110 drop-shadow-[0_0_8px_rgba(167,139,250,0.4)]")} />
                  <span className={cn("text-[11px] font-medium transition-colors", active ? "text-violet-400" : "text-slate-500")}>
                    {item.label}
                  </span>
                </button>
              );
            })}
            </div>
        </div>
      </nav>

      {/* PWA Install Prompt (mobile-friendly, sits above bottom navbar) */}
      <InstallPWAPrompt />
    </div>
    </div>
  );
}
