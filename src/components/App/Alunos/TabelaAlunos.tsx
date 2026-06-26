import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, RotateCcw, Plus, Edit2, Trash2, Check, X, History, AlertTriangle, MoreVertical, Play, MessageSquarePlus, MessageCircle, CheckCircle2, Circle, FileEdit, ChevronDown, ChevronRight, Music2, Layers, CreditCard, FileText, Banknote, QrCode, Link2, Receipt, ChevronsUpDown, Columns3, Phone, ArrowUp, ArrowDown, Brain } from 'lucide-react';
import { CelulaEditavel } from '@/components/ui/CelulaEditavel';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { Tooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/hooks/useToast';
import { ModalFichaAluno } from './ModalFichaAluno';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useWidgetOverlapSentinel } from '@/contexts/WidgetVisibilityContext';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ContatoPopover } from './ContatoPopover';
import type { Aluno, Filtros } from './AlunosPage';
import {
  analisarMudancaParaSemParcela,
  buscarContextosStatusPagamento,
  deveExigirConfirmacaoDigitada,
  getConfirmacaoSemParcela,
  getStatusPagamentoLabel,
  registrarAuditoriaStatusPagamento,
  type ContextoStatusPagamento,
  type OrigemGovernancaStatusPagamento,
} from './statusPagamentoGovernanca';

interface TabelaAlunosProps {
  alunos: Aluno[];
  todosAlunos: Aluno[]; // Todos os alunos sem filtro para contagem fixa
  filtros: Filtros;
  setFiltros: (filtros: Filtros) => void;
  limparFiltros: () => void;
  professores: {id: number, nome: string}[];
  cursos: {id: number, nome: string, is_projeto_banda?: boolean}[];
  tiposMatricula: {id: number, nome: string}[];
  salas: {id: number, nome: string, capacidade_maxima: number}[];
  horarios: {id: number, nome: string, hora_inicio: string}[];
  totalTurmas?: number;
  onNovoAluno: () => void;
  onRecarregar: () => void;
  verificarTurmaAoSalvar: (aluno: Aluno) => Promise<boolean>;
  onAbrirModalTurma?: (professor_id: number, dia: string, horario: string) => void;
}

interface GovernancaSemParcelaState {
  origem: OrigemGovernancaStatusPagamento;
  alunoIds: number[];
  alunos: ContextoStatusPagamento[];
  salvando: boolean;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HORARIOS_LISTA = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

// Configuração de colunas toggleable
const COLUNAS_CONFIG = [
  { id: 'telefone', label: 'Telefone', defaultVisible: false },
  { id: 'anamnese', label: 'Anamnese', defaultVisible: false },
  { id: 'escola', label: 'Escola', defaultVisible: true },
  { id: 'professor', label: 'Professor', defaultVisible: true },
  { id: 'curso', label: 'Curso', defaultVisible: true },
  { id: 'modalidade', label: 'Mod.', defaultVisible: false },
  { id: 'dia', label: 'Dia', defaultVisible: true },
  { id: 'horario', label: 'Horário', defaultVisible: true },
  { id: 'turma', label: 'Turma', defaultVisible: true },
  { id: 'parcela', label: 'Parcela', defaultVisible: true },
  { id: 'pago', label: 'Pago', defaultVisible: false },
  { id: 'vencimento', label: 'Venc.', defaultVisible: false },
  { id: 'tempo', label: 'Tempo', defaultVisible: true },
  { id: 'data_matricula', label: 'Matrícula', defaultVisible: false },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'data_saida', label: 'Saída', defaultVisible: false },
] as const;

const STORAGE_KEY = 'la-music-tabela-alunos-colunas';

const TEMPERAMENTO_BADGE: Record<string, { emoji: string; className: string }> = {
  CAZUZA: { emoji: '🔥', className: 'border-red-500/30 bg-red-500/15 text-red-300' },
  SLASH: { emoji: '⚡', className: 'border-blue-500/30 bg-blue-500/15 text-blue-300' },
  FRANK: { emoji: '🎩', className: 'border-amber-500/30 bg-amber-500/15 text-amber-300' },
  AMY: { emoji: '🌙', className: 'border-violet-500/30 bg-violet-500/15 text-violet-300' },
};

function getDefaultColunas(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(COLUNAS_CONFIG.filter(c => c.defaultVisible).map(c => c.id));
}

const CAMPOS_COMPOSICAO_MENSALIDADE = new Set(['valor_cheio', 'desconto_fixo', 'desconto_condicional']);

function numeroOuNull(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function calcularParcelaComercialCanonica(
  valorCheio: string | number | null | undefined,
  descontoCondicional: string | number | null | undefined
): number | null {
  const cheio = numeroOuNull(valorCheio);
  if (cheio === null) return null;
  const condicional = numeroOuNull(descontoCondicional) ?? 0;
  return Math.round((cheio - condicional) * 100) / 100;
}

function SortableHeader({ label, sortKey, sortConfig, onSort, className = '', px = 'px-4' }: {
  label: string;
  sortKey: string;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
  className?: string;
  px?: string;
}) {
  const active = sortConfig?.key === sortKey;
  return (
    <th
      className={`${px} py-3 font-medium cursor-pointer select-none hover:text-white transition-colors ${className} ${active ? 'text-amber-400' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortConfig.direction === 'asc'
          ? <ArrowUp className="w-3 h-3" />
          : <ArrowDown className="w-3 h-3" />
        )}
      </span>
    </th>
  );
}

export function TabelaAlunos({
  alunos: alunosProp,
  todosAlunos,
  filtros,
  setFiltros,
  limparFiltros,
  professores,
  cursos,
  tiposMatricula,
  salas,
  horarios,
  totalTurmas,
  onNovoAluno,
  onRecarregar,
  verificarTurmaAoSalvar,
  onAbrirModalTurma
}: TabelaAlunosProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  const sentinelRef = useWidgetOverlapSentinel();

  // Estado local para permitir edição otimista
  const toast = useToast();

  const [alunosLocal, setAlunosLocal] = useState<Aluno[]>(alunosProp);

  // Sincronizar com props quando mudarem
  React.useEffect(() => {
    setAlunosLocal(alunosProp);
  }, [alunosProp]);
  
  const alunos = alunosLocal;
  
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [alunoParaExcluir, setAlunoParaExcluir] = useState<Aluno | null>(null);
  const [modalDestrancamento, setModalDestrancamento] = useState(false);
  const [alunoParaDestrancar, setAlunoParaDestrancar] = useState<Aluno | null>(null);
  const [destrancando, setDestrancando] = useState(false);
  const [modalHistorico, setModalHistorico] = useState(false);
  const [alunoHistorico, setAlunoHistorico] = useState<Aluno | null>(null);
  const [historicoAluno, setHistoricoAluno] = useState<any[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [modalAnotacao, setModalAnotacao] = useState(false);
  const [alunoAnotacao, setAlunoAnotacao] = useState<Aluno | null>(null);
  const [textoAnotacao, setTextoAnotacao] = useState('');
  const [categoriaAnotacao, setCategoriaAnotacao] = useState('geral');
  const [salvandoAnotacao, setSalvandoAnotacao] = useState(false);
  const [modalVerAnotacoes, setModalVerAnotacoes] = useState(false);
  const [alunoVerAnotacoes, setAlunoVerAnotacoes] = useState<Aluno | null>(null);
  const [anotacoesDoAluno, setAnotacoesDoAluno] = useState<any[]>([]);
  const [carregandoAnotacoes, setCarregandoAnotacoes] = useState(false);
  const [editandoAnotacaoId, setEditandoAnotacaoId] = useState<number | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [categoriaEdicao, setCategoriaEdicao] = useState('geral');
  const [professorPopoverOpen, setProfessorPopoverOpen] = useState(false);
  const [anotacaoParaExcluir, setAnotacaoParaExcluir] = useState<number | null>(null);
  const [alunosSelecionados, setAlunosSelecionados] = useState<Set<number>>(new Set());
  const [processandoMassa, setProcessandoMassa] = useState(false);
  const [modalResetMes, setModalResetMes] = useState(false);
  const [confirmacaoReset, setConfirmacaoReset] = useState('');
  const [processandoReset, setProcessandoReset] = useState(false);
  const [filtrosExpandidos, setFiltrosExpandidos] = useState(false);
  const [colunasVisiveis, setColunasVisiveis] = useState<Set<string>>(getDefaultColunas);
  // Modal de composição da mensalidade (valor cheio − descontos = parcela real)
  const [modalMensalidade, setModalMensalidade] = useState<{
    alunoId: number; nome: string; cheio: string; fixo: string; cond: string;
  } | null>(null);
  const [colunasDropdownOpen, setColunasDropdownOpen] = useState(false);
  const [alunoFicha, setAlunoFicha] = useState<Aluno | null>(null);
  const [alunosExpandidos, setAlunosExpandidos] = useState<Set<number>>(new Set());

  // Ao buscar por nome, auto-expandir linhas com outros cursos (inclusive inativos)
  useEffect(() => {
    if (filtros.nome) {
      const ids = alunos
        .filter(a => a.outros_cursos && a.outros_cursos.length > 0)
        .map(a => a.id);
      setAlunosExpandidos(new Set(ids));
    } else {
      setAlunosExpandidos(new Set());
    }
  }, [filtros.nome, alunos]);

  const [alertaInadimplenciaDismissed, setAlertaInadimplenciaDismissed] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [governancaSemParcela, setGovernancaSemParcela] = useState<GovernancaSemParcelaState | null>(null);
  const [justificativaSemParcela, setJustificativaSemParcela] = useState('');
  const [confirmacaoSemParcela, setConfirmacaoSemParcela] = useState('');
  const itensPorPagina = 30;

  const toggleColuna = useCallback((id: string) => {
    setColunasVisiveis(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const col = useCallback((id: string) => colunasVisiveis.has(id), [colunasVisiveis]);

  const getBadgeAnamnese = useCallback((aluno: Aluno) => {
    if (!aluno.anamnese_preenchida) return null;

    const codinome = (aluno.temperamento_codinome || '').toUpperCase();
    const config = TEMPERAMENTO_BADGE[codinome];

    return (
      <Tooltip content={codinome ? `Anamnese preenchida • ${codinome}` : 'Anamnese preenchida'}>
        <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config?.className || 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300'}`}>
          <Brain className="w-3 h-3" />
          {config?.emoji ? <span>{config.emoji}</span> : null}
          <span>{codinome || 'OK'}</span>
        </div>
      </Tooltip>
    );
  }, []);

  // Contagem de inadimplentes (usa todosAlunos para não depender de filtros)
  // Conta ALUNOS únicos, mas soma VALOR de todos os cursos (incluindo segundo curso)
  const inadimplenciaInfo = useMemo(() => {
    const fonte = todosAlunos || alunos;
    const ativos = fonte.filter(a => {
      const status = String(a.status || '').toLowerCase();
      return status === 'ativo' || status === 'trancado';
    });
    
    // Contar alunos inadimplentes (únicos) e somar valor de todos os cursos
    let totalAlunosInadimplentes = 0;
    let valorInadimplente = 0;
    
    ativos.forEach(a => {
      // Verificar se o aluno (ou algum curso dele) é inadimplente
      const principalInadimplente = a.status_pagamento === 'inadimplente';
      const outrosCursosInadimplentes = a.outros_cursos?.filter(oc => oc.status_pagamento === 'inadimplente') || [];
      
      if (principalInadimplente || outrosCursosInadimplentes.length > 0) {
        // Conta como 1 aluno (não importa quantos cursos)
        totalAlunosInadimplentes++;
        
        // Soma valor do curso principal se inadimplente
        if (principalInadimplente) {
          valorInadimplente += a.valor_parcela || 0;
        }
        // Soma valor dos outros cursos inadimplentes
        outrosCursosInadimplentes.forEach(oc => {
          valorInadimplente += oc.valor_parcela || 0;
        });
      }
    });
    
    const pendentes = ativos.filter(a => 
      (!a.status_pagamento || a.status_pagamento === '-') &&
      a.tipo_matricula_id !== 3 && a.tipo_matricula_id !== 4 && a.tipo_matricula_id !== 5
    );
    
    return {
      total: totalAlunosInadimplentes,
      pendentes: pendentes.length,
      valor: valorInadimplente,
      mostrar: totalAlunosInadimplentes > 0 || pendentes.length > 0,
    };
  }, [todosAlunos, alunos]);

  // Ícone da forma de pagamento
  const getFormaPagamentoIcon = (formaPagamentoId?: number | null, formaPagamentoNome?: string | null) => {
    switch (formaPagamentoId) {
      case 1: return <CreditCard className="w-3 h-3" />;   // Crédito Recorrente
      case 2: return <FileText className="w-3 h-3" />;      // Cheque
      case 3: return <QrCode className="w-3 h-3" />;        // Pix
      case 4: return <Banknote className="w-3 h-3" />;      // Dinheiro
      case 5: return <Link2 className="w-3 h-3" />;         // Link
      case 6: return <Receipt className="w-3 h-3" />;       // Boleto
      case 7: return <CreditCard className="w-3 h-3" />;   // Cartão de Débito
      default: return null;
    }
  };

  const fecharGovernancaSemParcela = useCallback(() => {
    setGovernancaSemParcela(null);
    setJustificativaSemParcela('');
    setConfirmacaoSemParcela('');
  }, []);

  const abrirGovernancaSemParcela = useCallback(async (
    alunoIds: number[],
    origem: 'tabela_inline' | 'acao_massa'
  ) => {
    if (alunoIds.length === 0) return;

    if (origem === 'acao_massa') {
      setProcessandoMassa(true);
    }

    try {
      const contextos = await buscarContextosStatusPagamento(alunoIds);
      const pendentes = contextos.filter(aluno => aluno.status_pagamento !== 'sem_parcela');

      if (pendentes.length === 0) {
        toast.addToast('Nenhuma alteração pendente', 'info', 'Os alunos selecionados já estão como "Sem Parcela".');
        return;
      }

      setGovernancaSemParcela({
        origem,
        alunoIds: pendentes.map(aluno => aluno.id),
        alunos: pendentes,
        salvando: false,
      });
    } catch (error: any) {
      console.error('Erro ao carregar governança de status_pagamento:', error);
      toast.addToast('Erro ao abrir confirmação', 'error', error.message || 'Não foi possível validar a mudança para "Sem Parcela".');
    } finally {
      if (origem === 'acao_massa') {
        setProcessandoMassa(false);
      }
    }
  }, [toast]);

  const confirmarGovernancaSemParcela = useCallback(async () => {
    if (!governancaSemParcela) return;

    const ator = usuario?.email || usuario?.nome || 'sistema';
    const motivo = justificativaSemParcela.trim();
    const exigeConfirmacaoDigitada = governancaSemParcela.alunos.some((aluno) =>
      deveExigirConfirmacaoDigitada(governancaSemParcela.origem, analisarMudancaParaSemParcela(aluno))
    );
    if (motivo.length < 12) {
      toast.addToast('Justificativa obrigatória', 'error', 'Descreva o motivo com pelo menos 12 caracteres.');
      return;
    }
    if (
      exigeConfirmacaoDigitada &&
      confirmacaoSemParcela.trim().toUpperCase() !== getConfirmacaoSemParcela()
    ) {
      toast.addToast('Confirmação pendente', 'error', `Digite ${getConfirmacaoSemParcela()} para liberar a alteração.`);
      return;
    }

    setGovernancaSemParcela(prev => prev ? { ...prev, salvando: true } : prev);
    try {
      const ids = governancaSemParcela.alunoIds;
      const { error } = await supabase
        .from('alunos')
        .update({
          status_pagamento: 'sem_parcela',
          updated_at: new Date().toISOString(),
          updated_by: ator,
        })
        .in('id', ids);

      if (error) throw error;

      const auditoriaResultados = await Promise.allSettled(
        governancaSemParcela.alunos.map((aluno) =>
          registrarAuditoriaStatusPagamento({
            alunoId: aluno.id,
            alunoNome: aluno.nome,
            ator,
            antes: aluno.status_pagamento,
            depois: 'sem_parcela',
            motivo,
            origem: governancaSemParcela.origem,
          })
        )
      );
      const falhasAuditoria = auditoriaResultados.filter((resultado) => resultado.status === 'rejected').length;

      setAlunosSelecionados(new Set());
      fecharGovernancaSemParcela();
      onRecarregar();
      if (falhasAuditoria > 0) {
        toast.addToast(
          'Status atualizado com alerta',
          'warning',
          `${ids.length} aluno(s) foram atualizados, mas ${falhasAuditoria} trilha(s) de auditoria falharam.`
        );
      } else {
        toast.addToast(
          'Status atualizado com governança',
          'success',
          `${ids.length} aluno(s) marcados como "Sem Parcela" com justificativa e trilha em anotações.`
        );
      }
    } catch (error: any) {
      console.error('Erro ao confirmar governança de status_pagamento:', error);
      toast.addToast('Erro ao salvar governança', 'error', error.message || 'Não foi possível concluir a alteração.');
      setGovernancaSemParcela(prev => prev ? { ...prev, salvando: false } : prev);
    }
  }, [
    confirmacaoSemParcela,
    fecharGovernancaSemParcela,
    governancaSemParcela,
    justificativaSemParcela,
    onRecarregar,
    toast,
    usuario?.email,
    usuario?.nome,
  ]);

  // Toggle expansão de aluno com segundo curso
  const toggleExpandirAluno = (alunoId: number) => {
    setAlunosExpandidos(prev => {
      const novo = new Set(prev);
      if (novo.has(alunoId)) {
        novo.delete(alunoId);
      } else {
        novo.add(alunoId);
      }
      return novo;
    });
  };

  // Sort por coluna
  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
    setPaginaAtual(1);
  };

  const alunosOrdenados = useMemo(() => {
    if (!sortConfig) return alunos;
    return [...alunos].sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA: any, valB: any;
      switch (key) {
        case 'nome': valA = a.nome || ''; valB = b.nome || ''; break;
        case 'professor': valA = a.professor_nome || ''; valB = b.professor_nome || ''; break;
        case 'curso': valA = a.curso_nome || ''; valB = b.curso_nome || ''; break;
        case 'dia': valA = a.dia_aula || ''; valB = b.dia_aula || ''; break;
        case 'horario': valA = a.horario_aula || ''; valB = b.horario_aula || ''; break;
        case 'parcela': valA = a.valor_parcela ?? 0; valB = b.valor_parcela ?? 0; break;
        case 'tempo': valA = a.tempo_permanencia_meses ?? 0; valB = b.tempo_permanencia_meses ?? 0; break;
        case 'status': valA = a.status || ''; valB = b.status || ''; break;
        case 'data_saida': valA = a.data_saida || ''; valB = b.data_saida || ''; break;
        default: return 0;
      }
      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB);
        return direction === 'asc' ? cmp : -cmp;
      }
      return direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [alunos, sortConfig]);

  // Paginação
  const totalPaginas = Math.ceil(alunosOrdenados.length / itensPorPagina);
  const alunosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return alunosOrdenados.slice(inicio, inicio + itensPorPagina);
  }, [alunosOrdenados, paginaAtual]);

  // Contador de turmas por tamanho (usa todosAlunos para manter fixo)
  // IMPORTANTE: Deve usar a mesma lógica da view vw_turmas_implicitas
  // que agrupa por: unidade_id, professor_atual_id, curso_id, dia_aula, horario_aula
  const contagemTurmas = useMemo(() => {
    const turmasContagem = new Map<string, number>();
    // Usar todosAlunos para contagem fixa (não afetada por filtros)
    // Filtrar apenas alunos ATIVOS com professor/dia/horário (mesma lógica da vw_turmas_implicitas)
    (todosAlunos || alunos)
      .filter(aluno => 
        aluno.status === 'ativo' && 
        aluno.professor_atual_id && 
        aluno.dia_aula && 
        aluno.horario_aula
      )
      .forEach(aluno => {
        // Usar combinação de unidade+professor+curso+dia+horário como chave de turma
        // (mesma lógica da view vw_turmas_implicitas)
        const key = `${aluno.unidade_id}-${aluno.professor_atual_id}-${aluno.curso_id || 'null'}-${aluno.dia_aula}-${aluno.horario_aula}`;
        turmasContagem.set(key, (turmasContagem.get(key) || 0) + 1);
      });
    
    const contagem = { sozinhos: 0, duplas: 0, grupos: 0 };
    turmasContagem.forEach(total => {
      if (total === 1) contagem.sozinhos++;
      else if (total === 2) contagem.duplas++;
      else if (total >= 3) contagem.grupos++;
    });
    
    return contagem;
  }, [todosAlunos, alunos]);

  // Helper: aplica update otimista num registro (principal ou outro curso)
  const aplicarUpdateLocal = useCallback((registro: Aluno, campo: string, valor: string | number | null): Aluno => {
    const updated = { ...registro };
    switch (campo) {
      case 'nome':
        updated.nome = valor as string;
        break;
      case 'professor_atual_id':
        updated.professor_atual_id = valor ? Number(valor) : null;
        updated.professor_nome = professores.find(p => p.id === Number(valor))?.nome || null;
        break;
      case 'curso_id':
        updated.curso_id = valor ? Number(valor) : null;
        updated.curso_nome = cursos.find(c => c.id === Number(valor))?.nome || null;
        break;
      case 'dia_aula':
        updated.dia_aula = valor as string || null;
        break;
      case 'horario_aula':
        updated.horario_aula = valor ? `${valor}:00` : null;
        break;
      case 'valor_parcela':
        updated.valor_parcela = numeroOuNull(valor);
        break;
      case 'valor_cheio':
        updated.valor_cheio = numeroOuNull(valor);
        break;
      case 'desconto_fixo':
        updated.desconto_fixo = numeroOuNull(valor);
        break;
      case 'desconto_condicional':
        updated.desconto_condicional = numeroOuNull(valor);
        break;
      case 'status':
        updated.status = (valor as string) || 'ativo';
        break;
      case 'status_pagamento':
        updated.status_pagamento = valor === '-' ? null : (valor as string);
        break;
      case 'dia_vencimento':
        updated.dia_vencimento = valor ? Number(valor) : 5;
        break;
      case 'telefone':
        updated.telefone = valor as string;
        break;
      case 'responsavel_telefone':
        updated.responsavel_telefone = valor as string;
        break;
      case 'data_matricula':
        updated.data_matricula = valor as string;
        break;
    }
    if (CAMPOS_COMPOSICAO_MENSALIDADE.has(campo)) {
      updated.valor_parcela = calcularParcelaComercialCanonica(
        updated.valor_cheio,
        updated.desconto_condicional
      );
    }
    return updated;
  }, [professores, cursos]);

  // Função para salvar campo individual do aluno
  const salvarCampo = useCallback(async (alunoId: number, campo: string, valor: string | number | null) => {
    if (campo === 'status_pagamento' && valor === 'sem_parcela') {
      await abrirGovernancaSemParcela([alunoId], 'tabela_inline');
      return;
    }

    // Atualização otimista - atualiza UI imediatamente
    // Busca tanto no top-level quanto em outros_cursos (segundo curso)
    setAlunosLocal(prev => prev.map(aluno => {
      if (aluno.id === alunoId) {
        return aplicarUpdateLocal(aluno, campo, valor);
      }
      // Match em outros_cursos (segundo curso nested)
      if (aluno.outros_cursos?.some(oc => oc.id === alunoId)) {
        return {
          ...aluno,
          outros_cursos: aluno.outros_cursos.map(oc =>
            oc.id === alunoId ? aplicarUpdateLocal(oc, campo, valor) : oc
          ),
        };
      }
      return aluno;
    }));

    // Preparar dados para o banco
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      updated_by: usuario?.email || usuario?.nome || 'sistema',
    };

    switch (campo) {
      case 'nome':
        updateData.nome = valor;
        break;
      case 'professor_atual_id':
        updateData.professor_atual_id = valor ? Number(valor) : null;
        break;
      case 'curso_id':
        updateData.curso_id = valor ? Number(valor) : null;
        break;
      case 'dia_aula':
        updateData.dia_aula = valor || null;
        break;
      case 'horario_aula':
        updateData.horario_aula = valor ? `${valor}:00` : null;
        break;
      case 'valor_parcela':
        updateData.valor_parcela = numeroOuNull(valor);
        break;
      case 'valor_cheio':
        updateData.valor_cheio = numeroOuNull(valor);
        break;
      case 'desconto_fixo':
        updateData.desconto_fixo = numeroOuNull(valor);
        break;
      case 'desconto_condicional':
        updateData.desconto_condicional = numeroOuNull(valor);
        break;
      case 'status':
        updateData.status = valor || 'ativo';
        break;
      case 'status_pagamento':
        updateData.status_pagamento = valor === '-' ? null : valor;
        break;
      case 'dia_vencimento':
        updateData.dia_vencimento = valor ? Number(valor) : 5;
        break;
      case 'telefone':
        updateData.telefone = valor || null;
        break;
      case 'responsavel_telefone':
        updateData.responsavel_telefone = valor || null;
        break;
      case 'data_matricula':
        updateData.data_matricula = valor || null;
        break;
    }

    if (CAMPOS_COMPOSICAO_MENSALIDADE.has(campo)) {
      const alunoAtual =
        alunosLocal.find(a => a.id === alunoId) ||
        alunosLocal.flatMap(a => a.outros_cursos || []).find(a => a.id === alunoId);

      const valorCheio =
        campo === 'valor_cheio' ? numeroOuNull(valor) : alunoAtual?.valor_cheio ?? null;
      const descontoCondicional =
        campo === 'desconto_condicional' ? numeroOuNull(valor) : alunoAtual?.desconto_condicional ?? null;

      updateData.valor_parcela = calcularParcelaComercialCanonica(valorCheio, descontoCondicional);
    }

    // Salvar no banco
    const { error } = await supabase
      .from('alunos')
      .update(updateData)
      .eq('id', alunoId);

    if (error) {
      console.error('Erro ao salvar:', error);
      // Reverter otimista em caso de erro
      setAlunosLocal(alunosProp);
      throw error;
    }
  }, [abrirGovernancaSemParcela, aplicarUpdateLocal, alunosLocal, alunosProp, usuario?.email, usuario?.nome]);

  // Salva a composição da mensalidade: parcela = cheio − desconto condicional.
  // O desconto fixo é REGISTRADO (coluna desconto_fixo) mas NÃO entra na parcela comercial.
  const salvarMensalidade = useCallback(async () => {
    if (!modalMensalidade) return;
    const cheio = modalMensalidade.cheio.trim() !== '' ? Number(modalMensalidade.cheio) : null;
    const fixo = modalMensalidade.fixo.trim() !== '' ? Number(modalMensalidade.fixo) : 0;
    const cond = modalMensalidade.cond.trim() !== '' ? Number(modalMensalidade.cond) : 0;
    const parcela = cheio != null ? Math.round((cheio - cond) * 100) / 100 : null;
    const alunoId = modalMensalidade.alunoId;
    setModalMensalidade(null);
    const { error } = await supabase.from('alunos').update({
      valor_cheio: cheio,
      desconto_fixo: cheio != null ? fixo : null,
      desconto_condicional: cheio != null ? cond : null,
      valor_parcela: parcela,
      updated_at: new Date().toISOString(),
      updated_by: usuario?.email || usuario?.nome || 'sistema',
    }).eq('id', alunoId);
    if (error) { console.error('Erro ao salvar mensalidade:', error); throw error; }
    onRecarregar();
  }, [modalMensalidade, usuario?.email, usuario?.nome, onRecarregar]);

  async function confirmarExclusao() {
    if (!alunoParaExcluir) return;

    const ator = usuario?.email || usuario?.nome || 'sistema';
    const agora = new Date().toISOString();

    const { data: alunoArquivado, error } = await supabase
      .from('alunos')
      .update({
        status: 'inativo',
        arquivado_em: agora,
        arquivado_por: ator,
        arquivado_motivo: 'Aluno arquivado pela interface sem exclusao fisica.',
        arquivado_origem: 'ui-arquivar-aluno',
        arquivado_aluno_principal_id: null,
        updated_at: agora,
        updated_by: ator,
      })
      .eq('id', alunoParaExcluir.id)
      .is('arquivado_em', null)
      .select('id')
      .single();

    if (error || !alunoArquivado) {
      console.error('Erro ao arquivar aluno:', error);
      toast.addToast(
        'Não foi possível arquivar',
        'error',
        error.code === '23503'
          ? 'Este registro está vinculado a outros dados, mas deve ser arquivado sem exclusão física.'
          : error.message,
        8000
      );
    } else {
      toast.addToast('Aluno arquivado com segurança', 'success');
      onRecarregar();
    }
    setAlunoParaExcluir(null);
  }

  async function arquivarVinculoAluno(outroCurso: Aluno, alunoPrincipal: Aluno) {
    const ehBanda = outroCurso.curso_is_projeto_banda === true;
    const tipoLabel = ehBanda ? 'banda' : 'curso';
    const origem = ehBanda ? 'ui-remover-banda' : 'ui-remover-segundo-curso';
    const ator = usuario?.email || usuario?.nome || 'sistema';
    const agora = new Date().toISOString();
    const motivo = ehBanda
      ? 'Vinculo de projeto/banda removido pela interface sem exclusao fisica.'
      : 'Segundo curso removido pela interface sem exclusao fisica.';

    const { data: alunoArquivado, error: updateError } = await supabase
      .from('alunos')
      .update({
        status: 'inativo',
        arquivado_em: agora,
        arquivado_por: ator,
        arquivado_motivo: motivo,
        arquivado_origem: origem,
        arquivado_aluno_principal_id: alunoPrincipal.id !== outroCurso.id ? alunoPrincipal.id : null,
        updated_at: agora,
        updated_by: ator,
      })
      .eq('id', outroCurso.id)
      .is('arquivado_em', null)
      .select('id')
      .single();

    if (updateError || !alunoArquivado) {
      console.error(`Erro ao arquivar ${tipoLabel}:`, updateError);
      toast.addToast(
        `Erro ao remover ${tipoLabel}`,
        'error',
        updateError?.message || 'Nenhuma linha ativa foi arquivada. O vinculo pode ja ter sido removido.',
        8000
      );
      return;
    }

    const { error: anotacaoError } = await supabase
      .from('anotacoes_alunos')
      .insert({
        aluno_id: outroCurso.id,
        texto: [
          `Arquivamento logico de ${tipoLabel} pela interface.`,
          `Aluno principal mantido: ${alunoPrincipal.id} - ${alunoPrincipal.nome}.`,
          `Registro arquivado: ${outroCurso.id} - ${outroCurso.curso_nome || 'curso sem nome'} / ${outroCurso.professor_nome || 'professor sem nome'}.`,
          'Preservado sem DELETE fisico para manter presencas, renovacoes, movimentacoes e historico.',
        ].join(' '),
        categoria: 'arquivamento',
        criado_por: ator,
        resolvido: true,
      });

    if (anotacaoError) {
      console.warn(`Arquivamento de ${tipoLabel} concluido, mas anotacao falhou:`, anotacaoError);
      toast.addToast(
        `${ehBanda ? 'Banda removida' : 'Curso removido'} com alerta`,
        'warning',
        `O vinculo foi arquivado, mas a anotacao de auditoria falhou: ${anotacaoError.message}`,
        9000
      );
    } else {
      toast.addToast(ehBanda ? 'Banda removida com seguranca' : 'Curso removido com seguranca', 'success');
    }

    onRecarregar();
  }

  // Função para carregar histórico do aluno
  async function carregarHistorico(aluno: Aluno) {
    setAlunoHistorico(aluno);
    setModalHistorico(true);
    setCarregandoHistorico(true);
    setHistoricoAluno([]);

    try {
      // Buscar movimentações do aluno
      const { data: movimentacoes } = await supabase
        .from('movimentacoes_admin')
        .select('*')
        .eq('aluno_id', aluno.id)
        .order('created_at', { ascending: false });

      // Buscar renovações do aluno
      const { data: renovacoes } = await supabase
        .from('renovacoes')
        .select('*')
        .eq('aluno_id', aluno.id)
        .order('created_at', { ascending: false });

      // Buscar anotações do aluno
      const { data: anotacoes } = await supabase
        .from('anotacoes_alunos')
        .select('*')
        .eq('aluno_id', aluno.id)
        .order('created_at', { ascending: false });

      // Combinar e ordenar por data
      const historico: any[] = [];

      if (movimentacoes) {
        movimentacoes.forEach(m => {
          historico.push({
            tipo: m.tipo || 'Movimentação',
            data: m.created_at,
            descricao: m.tipo === 'evasao' 
              ? `Evasão registrada - ${m.motivo || 'Sem motivo'}` 
              : m.tipo === 'trancamento'
              ? `Trancamento - ${m.observacoes || 'Sem observações'}`
              : m.tipo === 'renovacao'
              ? `Renovação - R$ ${m.valor_parcela_anterior} → R$ ${m.valor_parcela_novo}`
              : `${m.tipo} - ${m.observacoes || ''}`,
            agente: m.agente_comercial || '-'
          });
        });
      }

      if (renovacoes) {
        renovacoes.forEach(r => {
          historico.push({
            tipo: 'Renovação',
            data: r.created_at,
            descricao: `Renovação de contrato - R$ ${r.valor_parcela_anterior || 0} → R$ ${r.valor_parcela_novo || 0} (${r.percentual_reajuste || 0}% reajuste)`,
            agente: r.agente || '-'
          });
        });
      }

      if (anotacoes) {
        const categoriaEmoji: Record<string, string> = {
          geral: '📝',
          pedagogico: '📚',
          financeiro: '💰',
          comportamento: '⚠️',
          elogio: '⭐',
          reclamacao: '😤',
          contato: '📞'
        };
        anotacoes.forEach(a => {
          historico.push({
            tipo: 'Anotação',
            data: a.created_at,
            descricao: `${categoriaEmoji[a.categoria] || '📝'} ${a.texto}`,
            agente: a.criado_por || '-',
            categoria: a.categoria
          });
        });
      }

      // Adicionar data de matrícula como primeiro evento
      if (aluno.data_matricula) {
        historico.push({
          tipo: 'Matrícula',
          data: aluno.data_matricula,
          descricao: `Matrícula realizada`,
          agente: '-'
        });
      }

      // Ordenar por data (mais recente primeiro)
      historico.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      setHistoricoAluno(historico);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setCarregandoHistorico(false);
    }
  }

  // Função para carregar anotações do aluno (para o modal de ver anotações)
  async function carregarAnotacoesDoAluno(aluno: Aluno) {
    setAlunoVerAnotacoes(aluno);
    setModalVerAnotacoes(true);
    setCarregandoAnotacoes(true);
    setAnotacoesDoAluno([]);

    try {
      const { data } = await supabase
        .from('anotacoes_alunos')
        .select('*')
        .eq('aluno_id', aluno.id)
        .order('created_at', { ascending: false });

      setAnotacoesDoAluno(data || []);
    } catch (error) {
      console.error('Erro ao carregar anotações:', error);
    } finally {
      setCarregandoAnotacoes(false);
    }
  }

  // Função para marcar/desmarcar anotação como resolvida
  async function toggleResolvidoAnotacao(anotacaoId: number, resolvidoAtual: boolean) {
    try {
      const { error } = await supabase
        .from('anotacoes_alunos')
        .update({ resolvido: !resolvidoAtual })
        .eq('id', anotacaoId);

      if (error) throw error;

      // Atualizar lista local
      setAnotacoesDoAluno(prev => 
        prev.map(a => a.id === anotacaoId ? { ...a, resolvido: !resolvidoAtual } : a)
      );
      
      // Recarregar dados para atualizar contagem
      onRecarregar();
    } catch (error) {
      console.error('Erro ao atualizar anotação:', error);
    }
  }

  // Função para confirmar exclusão de anotação
  async function confirmarExclusaoAnotacao() {
    if (!anotacaoParaExcluir) return;

    try {
      const { error } = await supabase
        .from('anotacoes_alunos')
        .delete()
        .eq('id', anotacaoParaExcluir);

      if (error) throw error;

      // Atualizar lista local
      setAnotacoesDoAluno(prev => prev.filter(a => a.id !== anotacaoParaExcluir));
      
      // Limpar e fechar modal
      setAnotacaoParaExcluir(null);
      
      // Recarregar dados para atualizar contagem
      onRecarregar();
    } catch (error) {
      console.error('Erro ao excluir anotação:', error);
    }
  }

  // Função para salvar edição de anotação
  async function salvarEdicaoAnotacao(anotacaoId: number) {
    if (!textoEdicao.trim()) return;

    try {
      const { error } = await supabase
        .from('anotacoes_alunos')
        .update({ 
          texto: textoEdicao.trim(),
          categoria: categoriaEdicao,
          updated_at: new Date().toISOString()
        })
        .eq('id', anotacaoId);

      if (error) throw error;

      // Atualizar lista local
      setAnotacoesDoAluno(prev => 
        prev.map(a => a.id === anotacaoId 
          ? { ...a, texto: textoEdicao.trim(), categoria: categoriaEdicao } 
          : a
        )
      );
      
      // Limpar edição
      setEditandoAnotacaoId(null);
      setTextoEdicao('');
      setCategoriaEdicao('geral');
      
      // Recarregar dados
      onRecarregar();
    } catch (error) {
      console.error('Erro ao editar anotação:', error);
    }
  }

  // Função para salvar anotação
  async function salvarAnotacao() {
    if (!alunoAnotacao || !textoAnotacao.trim()) return;

    setSalvandoAnotacao(true);
    try {
      const { error } = await supabase
        .from('anotacoes_alunos')
        .insert({
          aluno_id: alunoAnotacao.id,
          texto: textoAnotacao.trim(),
          categoria: categoriaAnotacao,
          criado_por: usuario?.nome || usuario?.email || 'Sistema'
        });

      if (error) throw error;

      // Limpar e fechar modal
      setTextoAnotacao('');
      setCategoriaAnotacao('geral');
      setModalAnotacao(false);
      setAlunoAnotacao(null);
      
      // Recarregar dados para atualizar contagem de anotações
      onRecarregar();
    } catch (error) {
      console.error('Erro ao salvar anotação:', error);
    } finally {
      setSalvandoAnotacao(false);
    }
  }

  // Funções de seleção em massa
  function toggleSelecionarAluno(alunoId: number) {
    setAlunosSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(alunoId)) {
        novo.delete(alunoId);
      } else {
        novo.add(alunoId);
      }
      return novo;
    });
  }

  // Seleciona TODOS os alunos filtrados (não apenas os paginados)
  function toggleSelecionarTodos() {
    if (alunosSelecionados.size === alunos.length) {
      setAlunosSelecionados(new Set());
    } else {
      setAlunosSelecionados(new Set(alunos.map(a => a.id)));
    }
  }

  async function marcarSelecionadosComoPagos() {
    if (alunosSelecionados.size === 0) return;
    if (!confirm(`Marcar ${alunosSelecionados.size} aluno(s) como PAGOS?`)) return;

    setProcessandoMassa(true);
    try {
      const { error } = await supabase
        .from('alunos')
        .update({
          status_pagamento: 'em_dia',
          updated_at: new Date().toISOString(),
          updated_by: usuario?.email || usuario?.nome || 'sistema',
        })
        .in('id', Array.from(alunosSelecionados));

      if (error) throw error;

      setAlunosSelecionados(new Set());
      onRecarregar();
    } catch (error) {
      console.error('Erro ao marcar como pagos:', error);
      alert('Erro ao atualizar pagamentos. Tente novamente.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  async function marcarSelecionadosComoInadimplentes() {
    if (alunosSelecionados.size === 0) return;
    if (!confirm(`Marcar ${alunosSelecionados.size} aluno(s) como INADIMPLENTES?`)) return;

    setProcessandoMassa(true);
    try {
      const { error } = await supabase
        .from('alunos')
        .update({
          status_pagamento: 'inadimplente',
          updated_at: new Date().toISOString(),
          updated_by: usuario?.email || usuario?.nome || 'sistema',
        })
        .in('id', Array.from(alunosSelecionados));

      if (error) throw error;

      setAlunosSelecionados(new Set());
      onRecarregar();
    } catch (error) {
      console.error('Erro ao marcar como inadimplentes:', error);
      alert('Erro ao atualizar pagamentos. Tente novamente.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  async function marcarSelecionadosComoSemParcela() {
    if (alunosSelecionados.size === 0) return;
    await abrirGovernancaSemParcela(Array.from(alunosSelecionados), 'acao_massa');
  }

  // Função para resetar mês (Admin) - grava snapshot antes de resetar
  async function handleResetMes() {
    if (confirmacaoReset !== 'RESETAR') return;

    setProcessandoReset(true);
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth() + 1; // Janeiro = 1

    try {
      // 1. Buscar todos os alunos ativos com seus dados de pagamento
      const { data: alunosAtivos, error: errorBusca } = await supabase
        .from('alunos')
        .select('id, status_pagamento, valor_parcela, dia_vencimento, unidade_id')
        .in('status', ['ativo', 'trancado']);

      if (errorBusca) throw errorBusca;

      // 2. Gravar snapshot no histórico (apenas alunos com status_pagamento definido)
      const snapshotData = alunosAtivos
        ?.filter(a => a.status_pagamento && a.status_pagamento !== '-')
        .map(a => ({
          aluno_id: a.id,
          ano,
          mes,
          status_pagamento: a.status_pagamento,
          valor_parcela: a.valor_parcela,
          dia_vencimento: a.dia_vencimento,
          unidade_id: a.unidade_id,
          created_by: usuario?.nome || usuario?.email || 'Sistema'
        }));

      if (snapshotData && snapshotData.length > 0) {
        const { error: errorSnapshot } = await supabase
          .from('historico_pagamentos')
          .upsert(snapshotData, { onConflict: 'aluno_id,ano,mes' });

        if (errorSnapshot) throw errorSnapshot;
      }

      // 3. Resetar status_pagamento de todos os alunos ativos para null
      const { error: errorReset } = await supabase
        .from('alunos')
        .update({ status_pagamento: null })
        .in('status', ['ativo', 'trancado']);

      if (errorReset) throw errorReset;

      // 4. Fechar modal e recarregar
      setModalResetMes(false);
      setConfirmacaoReset('');
      onRecarregar();
      
      alert(`✅ Reset concluído!\n\n• ${snapshotData?.length || 0} registros salvos no histórico\n• ${alunosAtivos?.length || 0} matrículas ativas/trancadas resetadas para "Sem sync financeiro"`);
    } catch (error) {
      console.error('Erro ao resetar mês:', error);
      alert('Erro ao resetar mês. Tente novamente.');
    } finally {
      setProcessandoReset(false);
    }
  }

  async function handleConfirmarDestrancamento() {
    if (!alunoParaDestrancar) return;

    setDestrancando(true);
    try {
      const { error } = await supabase
        .from('alunos')
        .update({ status: 'ativo' })
        .eq('id', alunoParaDestrancar.id);

      if (error) throw error;

      setModalDestrancamento(false);
      setAlunoParaDestrancar(null);
      onRecarregar();
    } catch (error) {
      console.error('Erro ao destrancar:', error);
      alert('Erro ao destrancar aluno. Tente novamente.');
    } finally {
      setDestrancando(false);
    }
  }

  function getBadgeTurma(totalAlunos: number, aluno: Aluno) {
    const handleClick = () => {
      // Abrir modal de detalhes da turma
      if (aluno.professor_atual_id && aluno.dia_aula && aluno.horario_aula) {
        onAbrirModalTurma?.(aluno.professor_atual_id, aluno.dia_aula, aluno.horario_aula);
      }
    };

    const badgeClass = "px-2 py-1 rounded text-xs whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity";
    const tooltipContent = aluno.nomes_alunos_turma?.length 
      ? aluno.nomes_alunos_turma.join(', ') 
      : 'Clique para ver a turma';

    if (totalAlunos === 1) {
      return (
        <Tooltip content={tooltipContent} side="top">
          <span 
            className={`${badgeClass} bg-red-500/30 text-red-400 font-medium animate-pulse`}
            onClick={handleClick}
          >
            <AlertTriangle className="w-3 h-3 inline mr-1" />1 aluno
          </span>
        </Tooltip>
      );
    }
    if (totalAlunos === 2) {
      return (
        <Tooltip content={tooltipContent} side="top">
          <span 
            className={`${badgeClass} bg-yellow-500/20 text-yellow-400`}
            onClick={handleClick}
          >
            2 alunos
          </span>
        </Tooltip>
      );
    }
    return (
      <Tooltip content={tooltipContent} side="top">
        <span 
          className={`${badgeClass} bg-emerald-500/20 text-emerald-400`}
          onClick={handleClick}
        >
          {totalAlunos} alunos
        </span>
      </Tooltip>
    );
  }

  function formatarTempoPermanencia(meses: number | null): string {
    if (!meses || meses === 0) return 'Novo';
    
    if (meses < 12) {
      return `${meses}m`;
    }
    
    const anos = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    
    if (mesesRestantes === 0) {
      return `${anos}a`;
    }
    
    return `${anos}a ${mesesRestantes}m`;
  }

  function getBadgeStatus(status: string) {
    switch (status) {
      case 'ativo':
        return <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-xs">Ativo</span>;
      case 'trancado':
        return <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs">Trancado</span>;
      case 'inativo':
        return <span className="bg-slate-500/20 text-slate-400 px-2 py-1 rounded text-xs">Inativo</span>;
      default:
        return <span className="bg-slate-500/20 text-slate-400 px-2 py-1 rounded text-xs">{status}</span>;
    }
  }

  function getBadgeEscola(classificacao: string) {
    if (classificacao === 'EMLA') {
      return <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs font-medium">EMLA</span>;
    }
    return <span className="bg-pink-500/20 text-pink-400 px-2 py-1 rounded text-xs font-medium">LAMK</span>;
  }

  function getBadgesAluno(aluno: Aluno) {
    const badges = [];
    
    // Veterano (mais de 12 meses)
    if (aluno.tempo_permanencia_meses && aluno.tempo_permanencia_meses >= 12) {
      badges.push(
        <span key="veterano" className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
          Veterano
        </span>
      );
    }
    
    // Bolsista
    if (aluno.tipo_matricula_nome?.includes('Bolsista')) {
      badges.push(
        <span key="bolsista" className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
          Bolsista
        </span>
      );
    }
    
    return badges;
  }

  function getBadgeTipoMatriculaVinculo(aluno: Aluno) {
    const nome = aluno.tipo_matricula_nome || '';
    const nomeNormalizado = nome.toLowerCase();
    const codigo = String(aluno.tipo_matricula_codigo || '').toLowerCase();
    const tipoAluno = String(aluno.tipo_aluno || '').toLowerCase();
    const tipoId = aluno.tipo_matricula_id;

    if (
      tipoId === 3 ||
      nomeNormalizado.includes('bolsista integral') ||
      codigo === 'bolsista_int' ||
      tipoAluno === 'bolsista_integral'
    ) {
      return (
        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
          Bolsista integral
        </span>
      );
    }

    if (
      tipoId === 4 ||
      nomeNormalizado.includes('bolsista parcial') ||
      codigo === 'bolsista_parc' ||
      tipoAluno === 'bolsista_parcial'
    ) {
      return (
        <span className="text-[10px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded">
          Bolsista parcial
        </span>
      );
    }

    if (tipoId === 5 || nomeNormalizado.includes('banda') || codigo === 'banda') {
      return (
        <span className="text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded">
          Banda
        </span>
      );
    }

    return null;
  }

  return (
    <>
      {/* Filtros */}
      <div data-tour="filtros-alunos" className="p-4 bg-slate-800/50 border-b border-slate-700">
        {/* Alunos Ativos + Resumo de Turmas */}
        <div className="mb-3 flex items-center gap-3 text-sm">
          {totalTurmas !== undefined && (
            <span className="flex items-center gap-1.5 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-lg text-xs font-semibold">
              <Layers className="w-3.5 h-3.5" />
              {totalTurmas} turmas ativas
            </span>
          )}
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Turmas:</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setFiltros({ ...filtros, turma_size: filtros.turma_size === '1' ? '' : '1' })}
              className={`px-2 py-1 rounded text-xs font-medium transition ${filtros.turma_size === '1' ? 'ring-2 ring-red-400' : ''} bg-red-500/20 text-red-400 hover:bg-red-500/30`}
            >
              {contagemTurmas.sozinhos} sozinho{contagemTurmas.sozinhos !== 1 ? 's' : ''}
            </button>
            <button 
              onClick={() => setFiltros({ ...filtros, turma_size: filtros.turma_size === '2' ? '' : '2' })}
              className={`px-2 py-1 rounded text-xs font-medium transition ${filtros.turma_size === '2' ? 'ring-2 ring-yellow-400' : ''} bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30`}
            >
              {contagemTurmas.duplas} dupla{contagemTurmas.duplas !== 1 ? 's' : ''}
            </button>
            <button 
              onClick={() => setFiltros({ ...filtros, turma_size: filtros.turma_size === '3+' ? '' : '3+' })}
              className={`px-2 py-1 rounded text-xs font-medium transition ${filtros.turma_size === '3+' ? 'ring-2 ring-emerald-400' : ''} bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30`}
            >
              {contagemTurmas.grupos} grupo{contagemTurmas.grupos !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
        
        {/* Linha 1: Filtros Primários + Botões */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Busca por nome */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar aluno..."
              value={filtros.nome}
              onChange={(e) => setFiltros({ ...filtros, nome: e.target.value })}
              className="w-[200px] bg-slate-800/50 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 h-10"
            />
          </div>

          {/* Filtro Professor — Combobox com busca */}
          <Popover open={professorPopoverOpen} onOpenChange={setProfessorPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                role="combobox"
                aria-expanded={professorPopoverOpen}
                className={`flex items-center justify-between gap-2 w-[180px] h-10 px-3 py-2 text-sm rounded-md border bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-colors ${
                  filtros.professor_id ? 'border-2 border-purple-500 bg-purple-500/10' : ''
                }`}
              >
                <span className="truncate">
                  {filtros.professor_id
                    ? professores.find(p => String(p.id) === filtros.professor_id)?.nome || 'Professor'
                    : 'Professor'}
                </span>
                <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar professor..." />
                <CommandList>
                  <CommandEmpty>Nenhum professor encontrado.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="todos"
                      onSelect={() => {
                        setFiltros({ ...filtros, professor_id: '' });
                        setProfessorPopoverOpen(false);
                      }}
                    >
                      <Check className={`w-4 h-4 mr-2 ${!filtros.professor_id ? 'opacity-100' : 'opacity-0'}`} />
                      Todos
                    </CommandItem>
                    {professores.map(p => (
                      <CommandItem
                        key={p.id}
                        value={p.nome}
                        onSelect={() => {
                          setFiltros({ ...filtros, professor_id: String(p.id) });
                          setProfessorPopoverOpen(false);
                        }}
                      >
                        <Check className={`w-4 h-4 mr-2 ${filtros.professor_id === String(p.id) ? 'opacity-100' : 'opacity-0'}`} />
                        {p.nome}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Filtro Dia */}
          <Select
            value={filtros.dia_aula || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, dia_aula: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[110px] ${filtros.dia_aula && filtros.dia_aula !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Dia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Dia</SelectItem>
              {DIAS_SEMANA.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Pagamento */}
          <Select
            value={filtros.status_pagamento || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, status_pagamento: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[130px] ${filtros.status_pagamento && filtros.status_pagamento !== 'todos' ? 'border-2 border-red-500 bg-red-500/10' : ''}`}>
              <SelectValue placeholder="Pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Pagamento</SelectItem>
              <SelectItem value="-">Sem sync financeiro</SelectItem>
              <SelectItem value="em_dia">Em dia</SelectItem>
              <SelectItem value="inadimplente">Inadimplente</SelectItem>
              <SelectItem value="parcial">Parcial</SelectItem>
              <SelectItem value="sem_parcela">Sem Parcela</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro Status */}
          <Select
            value={filtros.status || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, status: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[100px] ${filtros.status && filtros.status !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="aviso_previo">Aviso Prévio</SelectItem>
              <SelectItem value="trancado">Trancado</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="evadido">Evadido</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro Tipo */}
          <Select
            value={filtros.tipo_matricula_id || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, tipo_matricula_id: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[110px] ${filtros.tipo_matricula_id && filtros.tipo_matricula_id !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Tipo</SelectItem>
              {tiposMatricula.map(t => (
                <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Botão Mais Filtros */}
          <button
            onClick={() => setFiltrosExpandidos(!filtrosExpandidos)}
            className="h-10 bg-slate-700 hover:bg-slate-600 px-4 rounded-xl text-sm transition flex items-center gap-2"
          >
            {filtrosExpandidos ? '⊖' : '⊕'} {filtrosExpandidos ? 'Menos' : 'Mais'} Filtros
          </button>

          {/* Toggle de Colunas */}
          <Popover open={colunasDropdownOpen} onOpenChange={setColunasDropdownOpen}>
            <PopoverTrigger asChild>
              <button className="h-10 bg-slate-700 hover:bg-slate-600 px-4 rounded-xl text-sm transition flex items-center gap-2">
                <Columns3 className="w-4 h-4" />
                Colunas
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <p className="text-xs text-slate-400 px-2 pb-2 font-medium">Colunas visíveis</p>
              {COLUNAS_CONFIG.map(c => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-700/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={colunasVisiveis.has(c.id)}
                    onCheckedChange={() => toggleColuna(c.id)}
                  />
                  {c.label}
                </label>
              ))}
            </PopoverContent>
          </Popover>

          {/* Limpar filtros */}
          <button
            onClick={limparFiltros}
            className="h-10 bg-slate-700 hover:bg-slate-600 px-4 rounded-xl text-sm transition flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Limpar
          </button>

          {/* Botão Reset Mês - Apenas Admin */}
          {isAdmin && (
            <button
              onClick={() => setModalResetMes(true)}
              className="h-10 bg-orange-600 hover:bg-orange-700 px-4 rounded-xl text-sm transition flex items-center gap-2 text-white font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Mês
            </button>
          )}

          {/* Botão Novo Aluno - Canto Direito */}
          <button
            data-tour="btn-novo-aluno"
            onClick={onNovoAluno}
            className="ml-auto h-10 bg-purple-600 hover:bg-purple-500 px-5 rounded-xl text-sm font-medium transition flex items-center gap-2 text-white"
          >
            <Plus className="w-4 h-4" />
            Novo Aluno
          </button>
        </div>

        {/* Linha 2: Filtros Secundários (Expansível) */}
        {filtrosExpandidos && (
          <div className="flex flex-wrap items-center gap-3 pt-3">
            {/* Filtro Curso */}
            <Select
              value={filtros.curso_id || "todos"}
              onValueChange={(value) => setFiltros({ ...filtros, curso_id: value === "todos" ? "" : value })}
            >
              <SelectTrigger className={`w-[140px] ${filtros.curso_id && filtros.curso_id !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Curso</SelectItem>
                {cursos.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filtros.anamnese || "todos"}
              onValueChange={(value) => setFiltros({ ...filtros, anamnese: value === "todos" ? "" : value })}
            >
              <SelectTrigger className={`w-[140px] ${filtros.anamnese && filtros.anamnese !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
                <SelectValue placeholder="Anamnese" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Anamnese</SelectItem>
                <SelectItem value="preenchida">Preenchida</SelectItem>
                <SelectItem value="nao_preenchida">Não preenchida</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filtros.temperamento || "todos"}
              onValueChange={(value) => setFiltros({ ...filtros, temperamento: value === "todos" ? "" : value })}
            >
              <SelectTrigger className={`w-[150px] ${filtros.temperamento && filtros.temperamento !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
                <SelectValue placeholder="Temperamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Temperamento</SelectItem>
                <SelectItem value="CAZUZA">🔥 CAZUZA</SelectItem>
                <SelectItem value="SLASH">⚡ SLASH</SelectItem>
                <SelectItem value="FRANK">🎩 FRANK</SelectItem>
                <SelectItem value="AMY">🌙 AMY</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filtros.diagnostico || "todos"}
              onValueChange={(value) => setFiltros({ ...filtros, diagnostico: value === "todos" ? "" : value })}
            >
              <SelectTrigger className={`w-[140px] ${filtros.diagnostico && filtros.diagnostico !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
                <SelectValue placeholder="Diagnóstico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Diagnóstico</SelectItem>
                <SelectItem value="TEA">TEA</SelectItem>
                <SelectItem value="TDAH">TDAH</SelectItem>
                <SelectItem value="TOD">TOD</SelectItem>
                <SelectItem value="TOC">TOC</SelectItem>
                <SelectItem value="TAG">TAG</SelectItem>
                <SelectItem value="nao">NÃO</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro Horário */}
            <Select
              value={filtros.horario_aula || "todos"}
              onValueChange={(value) => setFiltros({ ...filtros, horario_aula: value === "todos" ? "" : value })}
            >
              <SelectTrigger className={`w-[100px] ${filtros.horario_aula && filtros.horario_aula !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
                <SelectValue placeholder="Horário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Horário</SelectItem>
                {HORARIOS_LISTA.map(h => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtro Escola */}
            <Select
              value={filtros.classificacao || "todos"}
              onValueChange={(value) => setFiltros({ ...filtros, classificacao: value === "todos" ? "" : value })}
            >
              <SelectTrigger className={`w-[100px] ${filtros.classificacao && filtros.classificacao !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
                <SelectValue placeholder="Escola" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Escola</SelectItem>
                <SelectItem value="EMLA">EMLA</SelectItem>
                <SelectItem value="LAMK">LAMK</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro Turma */}
            <Select
              value={filtros.turma_size || "todos"}
              onValueChange={(value) => setFiltros({ ...filtros, turma_size: value === "todos" ? "" : value })}
            >
              <SelectTrigger className={`w-[140px] ${filtros.turma_size && filtros.turma_size !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
                <SelectValue placeholder="Turma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Turma</SelectItem>
                <SelectItem value="1">1 aluno (sozinho)</SelectItem>
                <SelectItem value="2">2 alunos</SelectItem>
                <SelectItem value="3+">3+ alunos</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro Tempo de Permanência */}
            <Select
              value={filtros.tempo_permanencia || "todos"}
              onValueChange={(value) => setFiltros({ ...filtros, tempo_permanencia: value === "todos" ? "" : value })}
            >
              <SelectTrigger className={`w-[160px] ${filtros.tempo_permanencia && filtros.tempo_permanencia !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
                <SelectValue placeholder="Tempo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Tempo</SelectItem>
                <SelectItem value="novo">Novo (0-1 mês)</SelectItem>
                <SelectItem value="menos-1">Menos de 1 ano</SelectItem>
                <SelectItem value="1-2">1-2 anos</SelectItem>
                <SelectItem value="2-3">2-3 anos</SelectItem>
                <SelectItem value="3-4">3-4 anos</SelectItem>
                <SelectItem value="4-5">4-5 anos</SelectItem>
                <SelectItem value="5+">5+ anos</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro Sem Telefone */}
            <button
              onClick={() => setFiltros({ ...filtros, sem_telefone: !filtros.sem_telefone })}
              className={`h-10 px-4 rounded-xl text-sm transition flex items-center gap-2 ${
                filtros.sem_telefone
                  ? 'border-2 border-orange-500 bg-orange-500/10 text-orange-400'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              <Phone className="w-4 h-4" />
              Sem Telefone
            </button>
          </div>
        )}
      </div>

      <AlertDialog open={!!governancaSemParcela} onOpenChange={(open) => !open && fecharGovernancaSemParcela()}>
        <AlertDialogContent className="max-w-3xl">
          {(() => {
            const exigeConfirmacaoDigitada = governancaSemParcela?.alunos.some((aluno) =>
              deveExigirConfirmacaoDigitada(governancaSemParcela.origem, analisarMudancaParaSemParcela(aluno))
            ) ?? false;

            return (
              <>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-blue-300">
              <AlertTriangle className="w-5 h-5" />
              Confirmar mudança para "Sem Parcela"
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-slate-300">
              <p>
                Esta ação exige justificativa e gera trilha em <code>anotacoes_alunos</code> com usuário, antes/depois,
                motivo e origem.
              </p>
              <p>
                Revise a lista nominal antes de confirmar. Matrículas regulares/segundo curso ativas com contrato vigente
                ou aula recente aparecem destacadas como risco alto.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              {governancaSemParcela?.alunos.map((aluno) => {
                const analise = analisarMudancaParaSemParcela(aluno);
                return (
                  <div
                    key={aluno.id}
                    className={`rounded-lg border p-3 ${
                      analise.exigeConfirmacaoForte
                        ? 'border-red-500/40 bg-red-500/10'
                        : 'border-slate-700 bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{aluno.nome}</p>
                        <p className="text-xs text-slate-400">
                          {getStatusPagamentoLabel(aluno.status_pagamento)} → {getStatusPagamentoLabel('sem_parcela')}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                          analise.exigeConfirmacaoForte
                            ? 'bg-red-500/20 text-red-200'
                            : 'bg-blue-500/20 text-blue-200'
                        }`}
                      >
                        {analise.exigeConfirmacaoForte ? 'Risco alto' : 'Com justificativa'}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {analise.motivos.length > 0 ? (
                        analise.motivos.map((motivo) => (
                          <li key={`${aluno.id}-${motivo}`}>• {motivo}</li>
                        ))
                      ) : (
                        <li>• Sem sinais ativos adicionais; ainda assim exige motivo.</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Justificativa obrigatória</label>
                <Textarea
                  value={justificativaSemParcela}
                  onChange={(e) => setJustificativaSemParcela(e.target.value)}
                  placeholder="Ex.: aluno migrou para bolsa integral sem cobrança neste mês; validado com ADM em 07/06."
                  className="min-h-[96px]"
                />
              </div>

              {exigeConfirmacaoDigitada ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Digite <code>{getConfirmacaoSemParcela()}</code> para confirmar
                  </label>
                  <Input
                    value={confirmacaoSemParcela}
                    onChange={(e) => setConfirmacaoSemParcela(e.target.value)}
                    placeholder={getConfirmacaoSemParcela()}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
                  Caso individual sensível sem risco alto: alerta + justificativa já liberam a alteração.
                </div>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={fecharGovernancaSemParcela}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmarGovernancaSemParcela}
              disabled={!!governancaSemParcela?.salvando}
              className="bg-blue-600 hover:bg-blue-500"
            >
              {governancaSemParcela?.salvando ? 'Salvando...' : 'Confirmar com justificativa'}
            </Button>
          </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* Alerta financeiro */}
      {inadimplenciaInfo.mostrar && !alertaInadimplenciaDismissed && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${
          inadimplenciaInfo.total > 0 ? 'bg-red-500/15 border-red-500/30' : 'bg-amber-500/15 border-amber-500/30'
        }`}>
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${inadimplenciaInfo.total > 0 ? 'text-red-400' : 'text-amber-300'}`} />
          <span className={`${inadimplenciaInfo.total > 0 ? 'text-red-300' : 'text-amber-200'} flex-1`}>
            <strong className={inadimplenciaInfo.total > 0 ? 'text-red-200' : 'text-amber-100'}>
              {inadimplenciaInfo.total > 0 
                ? `${inadimplenciaInfo.total} aluno${inadimplenciaInfo.total !== 1 ? 's' : ''} inadimplente${inadimplenciaInfo.total !== 1 ? 's' : ''}`
                : `${inadimplenciaInfo.pendentes} aluno${inadimplenciaInfo.pendentes !== 1 ? 's' : ''} sem status financeiro sincronizado`
              }
            </strong>
            {inadimplenciaInfo.total > 0 && (
              <> — R$ {inadimplenciaInfo.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em parcelas marcadas como não pagas</>
            )}
            {inadimplenciaInfo.pendentes > 0 && inadimplenciaInfo.total > 0 && (
              <> • {inadimplenciaInfo.pendentes} ainda estão sem status financeiro sincronizado</>
            )}
            {inadimplenciaInfo.pendentes > 0 && inadimplenciaInfo.total === 0 && (
              <> — confirme pela aba Conciliação Emusys para gravar em dia/inadimplente no LA</>
            )}
          </span>
          <button
            onClick={() => setFiltros({ ...filtros, status_pagamento: inadimplenciaInfo.total > 0 ? 'inadimplente' : '-' })}
            className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
              inadimplenciaInfo.total > 0
                ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-200'
                : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 text-amber-100'
            }`}
          >
            {inadimplenciaInfo.total > 0 ? 'Filtrar inadimplentes' : 'Ver sem sincronizar'}
          </button>
          <button
            onClick={() => setAlertaInadimplenciaDismissed(true)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Dispensar alerta"
          >
            <X className={`w-4 h-4 ${inadimplenciaInfo.total > 0 ? 'text-red-400' : 'text-amber-300'}`} />
          </button>
        </div>
      )}

      {/* Botões de Ação em Massa */}
      {alunosSelecionados.size > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl px-6 py-4 flex items-center gap-4">
          <span className="text-white font-medium">
            {alunosSelecionados.size} selecionado(s)
          </span>
          <button
            onClick={marcarSelecionadosComoPagos}
            disabled={processandoMassa}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {processandoMassa ? 'Processando...' : 'Marcar como Pagos'}
          </button>
          <button
            onClick={marcarSelecionadosComoInadimplentes}
            disabled={processandoMassa}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            {processandoMassa ? 'Processando...' : 'Marcar como Inadimplentes'}
          </button>
          <button
            onClick={marcarSelecionadosComoSemParcela}
            disabled={processandoMassa}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Circle className="w-4 h-4" />
            {processandoMassa ? 'Processando...' : 'Marcar sem parcela'}
          </button>
          <button
            onClick={() => setAlunosSelecionados(new Set())}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Tabela */}
      <div data-tour="tabela-alunos" className="overflow-x-auto bg-slate-800/50">
        <table className="w-full text-sm">
          <thead className="bg-slate-700/50">
            <tr className="text-left text-slate-400 text-xs uppercase">
              <th className="px-2 py-3 font-medium w-12">
                <Checkbox
                  checked={alunos.length > 0 && alunosSelecionados.size === alunos.length}
                  onCheckedChange={toggleSelecionarTodos}
                />
              </th>
              <th className="px-4 py-3 font-medium">#</th>
              <SortableHeader label="Nome" sortKey="nome" sortConfig={sortConfig} onSort={handleSort} className="text-left" />
              {col('telefone') && <th className="px-4 py-3 font-medium">Telefone</th>}
              {col('anamnese') && <th className="px-4 py-3 font-medium">Anamnese</th>}
              {col('escola') && <th className="px-4 py-3 font-medium">Escola</th>}
              {col('professor') && <SortableHeader label="Professor" sortKey="professor" sortConfig={sortConfig} onSort={handleSort} />}
              {col('curso') && <SortableHeader label="Curso" sortKey="curso" sortConfig={sortConfig} onSort={handleSort} />}
              {col('modalidade') && <th className="px-4 py-3 font-medium">Mod.</th>}
              {col('dia') && <SortableHeader label="Dia" sortKey="dia" sortConfig={sortConfig} onSort={handleSort} />}
              {col('horario') && <SortableHeader label="Horário" sortKey="horario" sortConfig={sortConfig} onSort={handleSort} />}
              {col('turma') && <th className="px-4 py-3 font-medium">Turma</th>}
              {col('parcela') && <SortableHeader label="Parcela" sortKey="parcela" sortConfig={sortConfig} onSort={handleSort} />}
              {col('pago') && <th className="px-2 py-3 font-medium">Pago</th>}
              {col('vencimento') && <th className="px-2 py-3 font-medium">Venc.</th>}
              {col('tempo') && <SortableHeader label="Tempo" sortKey="tempo" sortConfig={sortConfig} onSort={handleSort} />}
              {col('data_matricula') && <SortableHeader label="Matrícula" sortKey="data_matricula" sortConfig={sortConfig} onSort={handleSort} />}
              {col('status') && <SortableHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} px="px-2" />}
              {col('data_saida') && <SortableHeader label="Saída" sortKey="data_saida" sortConfig={sortConfig} onSort={handleSort} />}
              <th className="px-2 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {alunosPaginados.map((aluno, index) => (
              <React.Fragment key={aluno.id}>
                <tr
                  className="transition hover:bg-slate-700/30"
                >
                  {/* Checkbox de seleção */}
                  <td className="px-2 py-3">
                    <Checkbox
                      checked={alunosSelecionados.has(aluno.id)}
                      onCheckedChange={() => toggleSelecionarAluno(aluno.id)}
                    />
                  </td>

                  <td className="px-4 py-3 text-slate-500">
                    {(paginaAtual - 1) * itensPorPagina + index + 1}
                  </td>
                  
                  {/* Nome - Clicável para abrir ficha */}
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      {/* Avatar do aluno */}
                      {(aluno.foto_url || aluno.photo_url) ? (
                        <img src={aluno.foto_url || aluno.photo_url || ''} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      ) : null}
                      {/* Botão de expansão apenas para alunos com segundo curso */}
                      {aluno.outros_cursos && aluno.outros_cursos.length > 0 && (
                        <button
                          onClick={() => toggleExpandirAluno(aluno.id)}
                          className="p-0.5 hover:bg-purple-500/20 rounded transition-colors flex-shrink-0"
                          title={alunosExpandidos.has(aluno.id) ? 'Recolher cursos' : 'Expandir cursos'}
                        >
                          {alunosExpandidos.has(aluno.id) ? (
                            <ChevronDown className="w-4 h-4 text-purple-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-purple-400" />
                          )}
                        </button>
                      )}
                      {/* Health Score - Coração de percepção do professor */}
                      {aluno.health_score && (
                        <Tooltip content={
                          aluno.health_score === 'verde' ? 'Aluno saudável' :
                          aluno.health_score === 'amarelo' ? 'Aluno em alerta' :
                          'Aluno em situação emergente'
                        }>
                          <span className="text-base">
                            {aluno.health_score === 'verde' ? '💚' :
                             aluno.health_score === 'amarelo' ? '💛' : '❤️'}
                          </span>
                        </Tooltip>
                      )}
                      <button
                        onClick={() => setAlunoFicha(aluno)}
                        className="text-left text-white hover:text-purple-400 hover:underline transition-colors font-medium min-w-[150px]"
                        title="Clique para abrir a ficha do aluno"
                      >
                        {aluno.nome || '-'}
                      </button>
                      {getBadgeAnamnese(aluno)}
                      {/* Badge de múltiplos cursos */}
                      {aluno.outros_cursos && aluno.outros_cursos.length > 0 && (
                        <Tooltip content={`${aluno.outros_cursos.length + 1} cursos • Ticket: R$ ${aluno.valor_total?.toLocaleString('pt-BR')}`}>
                          <span className="flex items-center gap-1 bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full text-xs font-medium">
                            <Music2 className="w-3 h-3" />
                            {aluno.outros_cursos.length + 1}
                          </span>
                        </Tooltip>
                      )}
                      {(aluno.total_anotacoes || 0) > 0 && (
                        <Tooltip 
                          content={
                            <div className="max-w-xs space-y-1">
                              {aluno.ultimas_anotacoes?.slice(0, 2).map((an, i) => {
                                const emoji: Record<string, string> = { geral: '📝', pedagogico: '📚', financeiro: '💰', comportamento: '⚠️', elogio: '⭐', reclamacao: '😤', contato: '📞' };
                                return (
                                  <p key={i} className="text-xs text-slate-200 line-clamp-2">
                                    {emoji[an.categoria] || '📝'} {an.texto.length > 80 ? an.texto.substring(0, 80) + '...' : an.texto}
                                  </p>
                                );
                              })}
                              {(aluno.total_anotacoes || 0) > 2 && (
                                <p className="text-[10px] text-slate-400 mt-1">+ {aluno.total_anotacoes - 2} mais...</p>
                              )}
                            </div>
                          }
                        >
                          <button
                            onClick={() => carregarAnotacoesDoAluno(aluno)}
                            className="relative p-1 hover:bg-purple-500/20 rounded transition-colors"
                          >
                            <MessageCircle className="w-4 h-4 text-purple-400" />
                            <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                              {aluno.total_anotacoes}
                            </span>
                          </button>
                        </Tooltip>
                      )}
                      {getBadgesAluno(aluno)}
                    </div>
                  </td>

                  {/* Telefone - Popover com todos os contatos */}
                  {col('telefone') && (
                  <td className="px-4 py-2">
                    <ContatoPopover
                      alunoId={aluno.id}
                      telefonePrincipal={aluno.telefone || aluno.responsavel_telefone || null}
                    />
                  </td>
                  )}

                  {col('anamnese') && (
                  <td className="px-4 py-2">
                    {aluno.anamnese_preenchida ? (
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-medium">✓</span>
                        <span className="text-xs text-slate-300">{aluno.temperamento_codinome || 'Preenchida'}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  )}

                  {/* Escola - Não editável */}
                  {col('escola') && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {getBadgeEscola(aluno.classificacao)}
                      {isAdmin && aluno.unidade_codigo && (
                        <span className="bg-slate-600/30 text-slate-300 px-2 py-1 rounded text-xs font-medium">
                          {aluno.unidade_codigo}
                        </span>
                      )}
                    </div>
                  </td>
                  )}

                  {/* Professor - Edição inline */}
                  {col('professor') && (
                  <td className="px-4 py-2">
                    <CelulaEditavel
                      value={aluno.professor_atual_id}
                      onChange={async (valor) => salvarCampo(aluno.id, 'professor_atual_id', valor)}
                      tipo="select"
                      opcoes={professores.map(p => ({ value: p.id, label: p.nome }))}
                      placeholder="-"
                      formatarExibicao={() => aluno.professor_nome || '-'}
                      className="min-w-[120px]"
                    />
                  </td>
                  )}

                  {/* Curso - Edição inline */}
                  {col('curso') && (
                  <td className="px-4 py-2">
                    <CelulaEditavel
                      value={aluno.curso_id}
                      onChange={async (valor) => salvarCampo(aluno.id, 'curso_id', valor)}
                      tipo="select"
                      opcoes={cursos.map(c => ({ value: c.id, label: c.nome }))}
                      placeholder="-"
                      formatarExibicao={() => aluno.curso_nome || '-'}
                      className="min-w-[100px]"
                    />
                  </td>
                  )}

                  {/* Modalidade - Edição inline */}
                  {col('modalidade') && (
                  <td className="px-2 py-2 text-center">
                    <CelulaEditavel
                      value={aluno.modalidade || 'turma'}
                      onChange={async (valor) => salvarCampo(aluno.id, 'modalidade', valor)}
                      tipo="select"
                      opcoes={[
                        { value: 'turma', label: 'T' },
                        { value: 'individual', label: 'IND' },
                      ]}
                      placeholder="T"
                      className="min-w-[50px] text-center"
                    />
                  </td>
                  )}

                  {/* Dia - Edição inline */}
                  {col('dia') && (
                  <td className="px-4 py-2">
                    <CelulaEditavel
                      value={aluno.dia_aula}
                      onChange={async (valor) => salvarCampo(aluno.id, 'dia_aula', valor)}
                      tipo="select"
                      opcoes={DIAS_SEMANA.map(d => ({ value: d, label: d }))}
                      placeholder="-"
                      className="min-w-[90px]"
                    />
                  </td>
                  )}

                  {/* Horário - Edição inline */}
                  {col('horario') && (
                  <td className="px-4 py-2">
                    <CelulaEditavel
                      value={aluno.horario_aula?.substring(0, 5) || null}
                      onChange={async (valor) => salvarCampo(aluno.id, 'horario_aula', valor)}
                      tipo="select"
                      opcoes={HORARIOS_LISTA.map(h => ({ value: h, label: h }))}
                      placeholder="-"
                      className="min-w-[70px]"
                    />
                  </td>
                  )}

                  {/* Turma - Não editável */}
                  {col('turma') && (
                  <td className="px-4 py-3">
                    {aluno.dia_aula && aluno.horario_aula
                      ? getBadgeTurma(aluno.total_alunos_turma || 1, aluno)
                      : <span className="bg-slate-500/20 text-slate-400 px-2 py-1 rounded text-xs">-</span>
                    }
                  </td>
                  )}

                  {/* Parcela - Edição inline com cor baseada no status de pagamento */}
                  {col('parcela') && (() => {
                    const principal = aluno.valor_parcela;
                    const outrosPagantes = aluno.outros_cursos?.filter(oc => oc.valor_parcela && oc.valor_parcela > 0) || [];
                    const valorExibido = (principal && principal > 0)
                      ? principal
                      : (outrosPagantes.length === 1
                          ? outrosPagantes[0].valor_parcela
                          : (outrosPagantes.length > 1
                              ? aluno.valor_total
                              : null));
                    const vemDeOutroCurso = !(principal && principal > 0) && outrosPagantes.length > 0;

                    return (
                      <td className="px-4 py-2">
                        <div className={`rounded-md ${
                          aluno.status_pagamento === 'inadimplente' ? 'text-red-400' :
                          aluno.status_pagamento === 'em_dia' ? 'text-emerald-400' :
                          aluno.status_pagamento === 'parcial' ? 'text-yellow-400' :
                          ''
                        }`}>
                          <button
                            type="button"
                            onClick={() => setModalMensalidade({
                              alunoId: aluno.id,
                              nome: aluno.nome,
                              cheio: aluno.valor_cheio != null ? String(aluno.valor_cheio)
                                : (aluno.valor_parcela != null ? String(aluno.valor_parcela) : ''),
                              fixo: aluno.desconto_fixo != null ? String(aluno.desconto_fixo) : '',
                              cond: aluno.desconto_condicional != null ? String(aluno.desconto_condicional) : '',
                            })}
                            className="min-w-[80px] text-left hover:underline decoration-dotted cursor-pointer"
                            title="Clique para ver/editar a composição (valor cheio − descontos)"
                          >
                            {valorExibido != null
                              ? `R$ ${Number(valorExibido).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '-'}
                          </button>
                          {vemDeOutroCurso && (
                            <span className="text-[10px] text-purple-400 ml-1" title="Valor do segundo curso">2º</span>
                          )}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Status Pagamento - Edição inline com ícone de forma de pagamento */}
                  {col('pago') && (
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <CelulaEditavel
                        value={aluno.status_pagamento || '-'}
                        onChange={async (valor) => salvarCampo(aluno.id, 'status_pagamento', valor)}
                        tipo="select"
                        opcoes={[
                          { value: '-', label: '- Sem sync financeiro' },
                          { value: 'em_dia', label: '✓ Em dia' },
                          { value: 'inadimplente', label: '✗ Inadimplente' },
                          { value: 'parcial', label: '~ Parcial' },
                          { value: 'sem_parcela', label: '○ Sem Parcela' },
                        ]}
                        placeholder="-"
                        formatarExibicao={() => {
                          const icon = getFormaPagamentoIcon(aluno.forma_pagamento_id, aluno.forma_pagamento_nome);
                          const formaNome = aluno.forma_pagamento_nome || 'Não informada';
                          switch (aluno.status_pagamento) {
                            case 'inadimplente': return (
                              <Tooltip content={`Inadimplente • ${formaNome}`}>
                                <span className="flex items-center gap-1 text-red-400 font-bold">✗{icon && <span className="text-red-400/60">{icon}</span>}</span>
                              </Tooltip>
                            );
                            case 'parcial': return (
                              <Tooltip content={`Pagamento Parcial • ${formaNome}`}>
                                <span className="flex items-center gap-1 text-yellow-400 font-bold">~{icon && <span className="text-yellow-400/60">{icon}</span>}</span>
                              </Tooltip>
                            );
                            case 'em_dia': return (
                              <Tooltip content={`Em dia • ${formaNome}`}>
                                <span className="flex items-center gap-1 text-emerald-400">✓{icon && <span className="text-emerald-400/60">{icon}</span>}</span>
                              </Tooltip>
                            );
                            case 'sem_parcela': return <span className="text-blue-400" title="Sem Parcela">○</span>;
                            default: return <span className="text-slate-500" title="Sem status financeiro sincronizado">- Sem sync</span>;
                          }
                        }}
                        className="min-w-[40px]"
                      />
                    </div>
                  </td>
                  )}

                  {/* Dia Vencimento - Edição inline */}
                  {col('vencimento') && (
                  <td className="px-2 py-2">
                    <CelulaEditavel
                      value={aluno.dia_vencimento?.toString() || '5'}
                      onChange={async (valor) => salvarCampo(aluno.id, 'dia_vencimento', valor)}
                      tipo="numero"
                      placeholder="5"
                      className="min-w-[40px] text-center"
                    />
                  </td>
                  )}

                  {/* Tempo - Não editável */}
                  {col('tempo') && (
                  <td className="px-4 py-3 text-slate-300">
                    {formatarTempoPermanencia(aluno.tempo_permanencia_meses)}
                  </td>
                  )}

                  {col('data_matricula') && (
                  <td className="px-2 py-2">
                    <DatePicker
                      date={aluno.data_matricula ? new Date(aluno.data_matricula + 'T00:00:00') : undefined}
                      onDateChange={async (date) => {
                        if (!date) return;
                        await salvarCampo(aluno.id, 'data_matricula', date.toISOString().split('T')[0]);
                      }}
                      placeholder="-"
                      className="min-w-[80px]"
                    />
                  </td>
                  )}

                  {/* Status - Edição inline */}
                  {col('status') && (
                  <td className="px-2 py-2">
                    <CelulaEditavel
                      value={aluno.status}
                      onChange={async (valor) => salvarCampo(aluno.id, 'status', valor)}
                      tipo="select"
                      opcoes={[
                        { value: 'ativo', label: 'Ativo' },
                        { value: 'aviso_previo', label: 'Aviso Prévio' },
                        { value: 'trancado', label: 'Trancado' },
                        { value: 'inativo', label: 'Inativo' },
                      ]}
                      placeholder="-"
                      formatarExibicao={() => {
                        switch (aluno.status) {
                          case 'ativo': return 'Ativo';
                          case 'aviso_previo': return 'Aviso Prévio';
                          case 'trancado': return 'Trancado';
                          case 'inativo': return 'Inativo';
                          default: return aluno.status;
                        }
                      }}
                      className="min-w-[80px]"
                    />
                  </td>
                  )}

                  {col('data_saida') && (
                  <td className="px-2 py-2 text-sm text-slate-400">
                    {aluno.status === 'inativo' || aluno.status === 'evadido' ? (
                      <DatePicker
                        date={aluno.data_saida ? new Date(aluno.data_saida) : undefined}
                        onDateChange={async (date) => {
                          const valor = date ? date.toISOString().split('T')[0] : null;
                          await salvarCampo(aluno.id, 'data_saida', valor);
                        }}
                        placeholder="-"
                        className="h-7 text-xs min-w-[110px] bg-transparent border-transparent hover:border-slate-600"
                      />
                    ) : (
                      <span className="px-2">-</span>
                    )}
                  </td>
                  )}

                  {/* Ações */}
                  <td className="px-2 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 hover:bg-slate-600 rounded transition">
                          <MoreVertical className="w-4 h-4 text-slate-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem 
                          onClick={() => setAlunoFicha(aluno)}
                          className="cursor-pointer text-purple-400 focus:text-purple-400 focus:bg-purple-500/10"
                        >
                          <FileEdit className="w-4 h-4 mr-2" />
                          Editar cadastro
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => carregarHistorico(aluno)}
                          className="cursor-pointer text-blue-400 focus:text-blue-400 focus:bg-blue-500/10"
                        >
                          <History className="w-4 h-4 mr-2" />
                          Ver histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => {
                            setAlunoAnotacao(aluno);
                            setModalAnotacao(true);
                          }}
                          className="cursor-pointer text-amber-400 focus:text-amber-400 focus:bg-amber-500/10"
                        >
                          <MessageSquarePlus className="w-4 h-4 mr-2" />
                          Registrar anotação
                        </DropdownMenuItem>
                        {aluno.status === 'trancado' && (
                          <DropdownMenuItem 
                            onClick={() => {
                              setAlunoParaDestrancar(aluno);
                              setModalDestrancamento(true);
                            }}
                            className="cursor-pointer text-emerald-400 focus:text-emerald-400 focus:bg-emerald-500/10"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Destrancar aluno
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          onClick={() => setAlunoParaExcluir(aluno)}
                          className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Arquivar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
                
                {/* Linhas expandidas para outros cursos (segundo curso) — edição inline */}
                {alunosExpandidos.has(aluno.id) && (filtros.professor_id
                  ? aluno.outros_cursos?.filter(oc => oc.professor_atual_id === parseInt(filtros.professor_id))
                  : aluno.outros_cursos
                )?.map((outroCurso, idx) => (
                  <tr 
                    key={`${aluno.id}-curso-${idx}`}
                    className="bg-purple-500/5 border-l-2 border-purple-500"
                  >
                    <td className="px-2 py-2"></td>
                    <td className="px-4 py-2 text-slate-500 text-xs">↳</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 pl-6">
                        {outroCurso.curso_is_projeto_banda ? (
                          <span className="text-amber-400 text-sm italic">Projeto / Banda</span>
                        ) : (
                          <span className="text-slate-400 text-sm italic">2º curso</span>
                        )}
                        {getBadgeTipoMatriculaVinculo(outroCurso)}
                        <button
                          onClick={() => setAlunoFicha(outroCurso)}
                          className="text-purple-400 hover:text-purple-300 hover:underline text-sm"
                        >
                          Editar
                        </button>
                        {outroCurso.curso_is_projeto_banda ? (
                          <button
                            onClick={() => arquivarVinculoAluno(outroCurso, aluno)}
                            className="text-red-400 hover:text-red-300 hover:underline text-sm"
                          >
                            Remover banda
                          </button>
                        ) : (
                          <button
                            onClick={() => arquivarVinculoAluno(outroCurso, aluno)}
                            className="text-red-400 hover:text-red-300 hover:underline text-sm"
                          >
                            Remover curso
                          </button>
                        )}
                      </div>
                    </td>
                    {col('telefone') && <td className="px-4 py-2"></td>}
                    {col('anamnese') && (
                    <td className="px-4 py-2">
                      {outroCurso.anamnese_preenchida ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-medium">✓</span>
                          <span className="text-xs text-slate-300">{outroCurso.temperamento_codinome || 'Preenchida'}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    )}
                    {col('escola') && (
                    <td className="px-4 py-2">
                      {getBadgeEscola(outroCurso.classificacao)}
                    </td>
                    )}
                    {col('professor') && (
                    <td className="px-4 py-2">
                      <CelulaEditavel
                        value={outroCurso.professor_atual_id}
                        onChange={async (valor) => salvarCampo(outroCurso.id, 'professor_atual_id', valor)}
                        tipo="select"
                        opcoes={professores.map(p => ({ value: p.id, label: p.nome }))}
                        placeholder="-"
                        formatarExibicao={() => outroCurso.professor_nome || '-'}
                        className="min-w-[120px]"
                      />
                    </td>
                    )}
                    {col('curso') && (
                    <td className="px-4 py-2">
                      <CelulaEditavel
                        value={outroCurso.curso_id}
                        onChange={async (valor) => salvarCampo(outroCurso.id, 'curso_id', valor)}
                        tipo="select"
                        opcoes={cursos.map(c => ({ value: c.id, label: c.nome }))}
                        placeholder="-"
                        formatarExibicao={() => outroCurso.curso_nome || '-'}
                        className="min-w-[100px]"
                      />
                    </td>
                    )}
                    {col('modalidade') && (
                    <td className="px-2 py-2 text-center">
                      <CelulaEditavel
                        value={outroCurso.modalidade || 'turma'}
                        onChange={async (valor) => salvarCampo(outroCurso.id, 'modalidade', valor)}
                        tipo="select"
                        opcoes={[
                          { value: 'turma', label: 'T' },
                          { value: 'individual', label: 'IND' },
                        ]}
                        placeholder="T"
                        className="min-w-[50px] text-center"
                      />
                    </td>
                    )}
                    {col('dia') && (
                    <td className="px-4 py-2">
                      <CelulaEditavel
                        value={outroCurso.dia_aula}
                        onChange={async (valor) => salvarCampo(outroCurso.id, 'dia_aula', valor)}
                        tipo="select"
                        opcoes={DIAS_SEMANA.map(d => ({ value: d, label: d }))}
                        placeholder="-"
                        className="min-w-[90px]"
                      />
                    </td>
                    )}
                    {col('horario') && (
                    <td className="px-4 py-2">
                      <CelulaEditavel
                        value={outroCurso.horario_aula?.substring(0, 5) || null}
                        onChange={async (valor) => salvarCampo(outroCurso.id, 'horario_aula', valor)}
                        tipo="select"
                        opcoes={HORARIOS_LISTA.map(h => ({ value: h, label: h }))}
                        placeholder="-"
                        className="min-w-[70px]"
                      />
                    </td>
                    )}
                    {/* Turma - Não editável */}
                    {col('turma') && (
                    <td className="px-4 py-2">
                      {outroCurso.dia_aula && outroCurso.horario_aula
                        ? getBadgeTurma(outroCurso.total_alunos_turma || 1, { ...aluno, ...outroCurso, total_alunos_turma: outroCurso.total_alunos_turma || 1 })
                        : <span className="bg-slate-500/20 text-slate-400 px-2 py-1 rounded text-xs">-</span>
                      }
                    </td>
                    )}
                    {col('parcela') && (
                    <td className="px-4 py-2">
                      <div className={`rounded-md ${
                        outroCurso.status_pagamento === 'inadimplente' ? 'text-red-400' :
                        outroCurso.status_pagamento === 'em_dia' ? 'text-emerald-400' :
                        outroCurso.status_pagamento === 'parcial' ? 'text-yellow-400' :
                        ''
                      }`}>
                        <CelulaEditavel
                          value={outroCurso.valor_parcela}
                          onChange={async (valor) => salvarCampo(outroCurso.id, 'valor_parcela', valor)}
                          tipo="moeda"
                          placeholder="-"
                          className="min-w-[80px]"
                        />
                      </div>
                    </td>
                    )}
                    {col('pago') && (
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <CelulaEditavel
                          value={outroCurso.status_pagamento || '-'}
                          onChange={async (valor) => salvarCampo(outroCurso.id, 'status_pagamento', valor)}
                          tipo="select"
                          opcoes={[
                            { value: '-', label: '- Sem sync financeiro' },
                            { value: 'em_dia', label: '✓ Em dia' },
                            { value: 'inadimplente', label: '✗ Inadimplente' },
                            { value: 'parcial', label: '~ Parcial' },
                            { value: 'sem_parcela', label: '○ Sem Parcela' },
                          ]}
                          placeholder="-"
                          formatarExibicao={() => {
                            const icon = getFormaPagamentoIcon(outroCurso.forma_pagamento_id, outroCurso.forma_pagamento_nome);
                            const formaNome = outroCurso.forma_pagamento_nome || 'Não informada';
                            switch (outroCurso.status_pagamento) {
                              case 'inadimplente': return (
                                <Tooltip content={`Inadimplente • ${formaNome}`}>
                                  <span className="flex items-center gap-1 text-red-400 font-bold">✗{icon && <span className="text-red-400/60">{icon}</span>}</span>
                                </Tooltip>
                              );
                              case 'parcial': return (
                                <Tooltip content={`Pagamento Parcial • ${formaNome}`}>
                                  <span className="flex items-center gap-1 text-yellow-400 font-bold">~{icon && <span className="text-yellow-400/60">{icon}</span>}</span>
                                </Tooltip>
                              );
                              case 'em_dia': return (
                                <Tooltip content={`Em dia • ${formaNome}`}>
                                  <span className="flex items-center gap-1 text-emerald-400">✓{icon && <span className="text-emerald-400/60">{icon}</span>}</span>
                                </Tooltip>
                              );
                              case 'sem_parcela': return <span className="text-blue-400" title="Sem Parcela">○</span>;
                              default: return <span className="text-slate-500" title="Sem status financeiro sincronizado">- Sem sync</span>;
                            }
                          }}
                          className="min-w-[40px]"
                        />
                      </div>
                    </td>
                    )}
                    {col('vencimento') && (
                    <td className="px-2 py-2">
                      <CelulaEditavel
                        value={outroCurso.dia_vencimento?.toString() || '5'}
                        onChange={async (valor) => salvarCampo(outroCurso.id, 'dia_vencimento', valor)}
                        tipo="numero"
                        placeholder="5"
                        className="min-w-[40px] text-center"
                      />
                    </td>
                    )}
                    {col('tempo') && <td className="px-4 py-2 text-slate-400 text-sm">-</td>}
                    {col('data_matricula') && (
                    <td className="px-2 py-2">
                      <DatePicker
                        date={outroCurso.data_matricula ? new Date(outroCurso.data_matricula + 'T00:00:00') : undefined}
                        onDateChange={async (date) => {
                          if (!date) return;
                          await salvarCampo(outroCurso.id, 'data_matricula', date.toISOString().split('T')[0]);
                        }}
                        placeholder="-"
                        className="min-w-[80px]"
                      />
                    </td>
                    )}
                    {col('status') && (
                    <td className="px-2 py-2">
                      <CelulaEditavel
                        value={outroCurso.status}
                        onChange={async (valor) => salvarCampo(outroCurso.id, 'status', valor)}
                        tipo="select"
                        opcoes={[
                          { value: 'ativo', label: 'Ativo' },
                          { value: 'trancado', label: 'Trancado' },
                          { value: 'inativo', label: 'Inativo' },
                          { value: 'cancelado', label: 'Cancelado' },
                          { value: 'evadido', label: 'Evadido' },
                        ]}
                        placeholder="-"
                        className="min-w-[70px]"
                      />
                    </td>
                    )}
                    {col('data_saida') && (
                    <td className="px-2 py-2 text-sm text-slate-400">
                      {outroCurso.status === 'inativo' || outroCurso.status === 'evadido' ? (
                        <DatePicker
                          date={outroCurso.data_saida ? new Date(outroCurso.data_saida) : undefined}
                          onDateChange={async (date) => {
                            const valor = date ? date.toISOString().split('T')[0] : null;
                            await salvarCampo(outroCurso.id, 'data_saida', valor);
                          }}
                          placeholder="-"
                          className="h-7 text-xs min-w-[110px] bg-transparent border-transparent hover:border-slate-600"
                        />
                      ) : (
                        <span className="px-2">-</span>
                      )}
                    </td>
                    )}
                    <td className="px-2 py-2"></td>
                  </tr>
                ))}
                </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div ref={sentinelRef} className="p-4 border-t border-slate-700 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Mostrando {((paginaAtual - 1) * itensPorPagina) + 1}-{Math.min(paginaAtual * itensPorPagina, alunos.length)} de {alunos.length} alunos
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
            disabled={paginaAtual === 1}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition disabled:opacity-50"
          >
            Anterior
          </button>
          {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
            let pageNum = i + 1;
            if (totalPaginas > 5) {
              if (paginaAtual > 3) {
                pageNum = paginaAtual - 2 + i;
              }
              if (pageNum > totalPaginas) {
                pageNum = totalPaginas - 4 + i;
              }
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPaginaAtual(pageNum)}
                className={`px-3 py-1.5 rounded text-sm transition ${
                  paginaAtual === pageNum
                    ? 'bg-purple-600'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
            disabled={paginaAtual === totalPaginas}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition disabled:opacity-50"
          >
            Próximo
          </button>
        </div>
      </div>

      {/* Alert Dialog de Exclusão */}
      <AlertDialog open={!!alunoParaExcluir} onOpenChange={() => setAlunoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar aluno</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja arquivar o aluno <strong className="text-white">{alunoParaExcluir?.nome}</strong>?
              <br />
              A linha sairá das listas operacionais, mas presenças, renovações, movimentações e histórico serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Confirmação de Destrancamento */}
      <ModalConfirmacao
        aberto={modalDestrancamento}
        onClose={() => {
          setModalDestrancamento(false);
          setAlunoParaDestrancar(null);
        }}
        onConfirmar={handleConfirmarDestrancamento}
        titulo="Confirmar Destrancamento"
        mensagem={`Confirma o destrancamento de ${alunoParaDestrancar?.nome}?\n\nO aluno voltará ao status ATIVO e poderá fazer aulas normalmente.`}
        tipo="warning"
        textoConfirmar="Destrancar"
        textoCancelar="Cancelar"
        carregando={destrancando}
      />

      {/* Modal de Histórico do Aluno */}
      <AlertDialog open={modalHistorico} onOpenChange={() => setModalHistorico(false)}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              Histórico do Aluno
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alunoHistorico?.nome}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4">
            {carregandoHistorico ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
              </div>
            ) : historicoAluno.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum histórico encontrado para este aluno.</p>
                <p className="text-sm mt-1">Movimentações como renovações, trancamentos e evasões aparecerão aqui.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historicoAluno.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      item.tipo === 'Matrícula' ? 'bg-emerald-400' :
                      item.tipo === 'Renovação' || item.tipo === 'renovacao' ? 'bg-blue-400' :
                      item.tipo === 'evasao' ? 'bg-red-400' :
                      item.tipo === 'trancamento' ? 'bg-yellow-400' :
                      item.tipo === 'Anotação' ? 'bg-purple-400' :
                      'bg-slate-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${
                          item.tipo === 'Matrícula' ? 'text-emerald-400' :
                          item.tipo === 'Renovação' || item.tipo === 'renovacao' ? 'text-blue-400' :
                          item.tipo === 'evasao' ? 'text-red-400' :
                          item.tipo === 'trancamento' ? 'text-yellow-400' :
                          item.tipo === 'Anotação' ? 'text-purple-400' :
                          'text-slate-300'
                        }`}>
                          {item.tipo === 'evasao' ? 'Evasão' : 
                           item.tipo === 'trancamento' ? 'Trancamento' :
                           item.tipo === 'renovacao' ? 'Renovação' :
                           item.tipo}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(item.data).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">{item.descricao}</p>
                      {item.agente && item.agente !== '-' && (
                        <p className="text-xs text-slate-500 mt-1">Por: {item.agente}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Registrar Anotação */}
      <AlertDialog open={modalAnotacao} onOpenChange={() => {
        setModalAnotacao(false);
        setAlunoAnotacao(null);
        setTextoAnotacao('');
        setCategoriaAnotacao('geral');
      }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="w-5 h-5 text-purple-400" />
              Registrar Anotação
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alunoAnotacao?.nome}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Categoria</label>
              <Select value={categoriaAnotacao} onValueChange={setCategoriaAnotacao}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">📝 Geral</SelectItem>
                  <SelectItem value="pedagogico">📚 Pedagógico</SelectItem>
                  <SelectItem value="financeiro">💰 Financeiro</SelectItem>
                  <SelectItem value="comportamento">⚠️ Comportamento</SelectItem>
                  <SelectItem value="elogio">⭐ Elogio</SelectItem>
                  <SelectItem value="reclamacao">😤 Reclamação</SelectItem>
                  <SelectItem value="contato">📞 Contato/Ligação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Anotação</label>
              <textarea
                value={textoAnotacao}
                onChange={(e) => setTextoAnotacao(e.target.value)}
                placeholder="Digite a anotação sobre o aluno..."
                className="w-full h-32 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={salvarAnotacao}
              disabled={!textoAnotacao.trim() || salvandoAnotacao}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {salvandoAnotacao ? 'Salvando...' : 'Salvar Anotação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Ver Anotações do Aluno */}
      <AlertDialog open={modalVerAnotacoes} onOpenChange={() => setModalVerAnotacoes(false)}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-purple-400" />
              Anotações do Aluno
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alunoVerAnotacoes?.nome}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4">
            {carregandoAnotacoes ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
              </div>
            ) : anotacoesDoAluno.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhuma anotação encontrada.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {anotacoesDoAluno.map((anotacao, index) => {
                  const categoriaEmoji: Record<string, string> = {
                    geral: '📝',
                    pedagogico: '📚',
                    financeiro: '💰',
                    comportamento: '⚠️',
                    elogio: '⭐',
                    reclamacao: '😤',
                    contato: '📞'
                  };
                  const categoriaLabel: Record<string, string> = {
                    geral: 'Geral',
                    pedagogico: 'Pedagógico',
                    financeiro: 'Financeiro',
                    comportamento: 'Comportamento',
                    elogio: 'Elogio',
                    reclamacao: 'Reclamação',
                    contato: 'Contato'
                  };
                  const estaEditando = editandoAnotacaoId === anotacao.id;
                  
                  return (
                    <div 
                      key={index} 
                      className={`p-3 rounded-lg border ${
                        anotacao.resolvido 
                          ? 'bg-emerald-900/20 border-emerald-700/50' 
                          : 'bg-slate-800/50 border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Tooltip content={anotacao.resolvido ? 'Marcar como pendente' : 'Marcar como resolvido'}>
                            <button
                              onClick={() => toggleResolvidoAnotacao(anotacao.id, anotacao.resolvido)}
                              className="hover:scale-110 transition-transform"
                            >
                              {anotacao.resolvido ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                              ) : (
                                <Circle className="w-5 h-5 text-slate-500" />
                              )}
                            </button>
                          </Tooltip>
                          <span className={`text-sm font-medium ${anotacao.resolvido ? 'text-emerald-400 line-through' : 'text-purple-400'}`}>
                            {categoriaEmoji[anotacao.categoria] || '📝'} {categoriaLabel[anotacao.categoria] || 'Geral'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">
                            {new Date(anotacao.created_at).toLocaleDateString('pt-BR')} às {new Date(anotacao.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!estaEditando && (
                            <>
                              <Tooltip content="Editar anotação">
                                <button
                                  onClick={() => {
                                    setEditandoAnotacaoId(anotacao.id);
                                    setTextoEdicao(anotacao.texto);
                                    setCategoriaEdicao(anotacao.categoria);
                                  }}
                                  className="p-1 hover:bg-blue-500/20 rounded transition-colors"
                                >
                                  <Edit2 className="w-4 h-4 text-blue-400" />
                                </button>
                              </Tooltip>
                              <Tooltip content="Excluir anotação">
                                <button
                                  onClick={() => setAnotacaoParaExcluir(anotacao.id)}
                                  className="p-1 hover:bg-red-500/20 rounded transition-colors"
                                >
                                  <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {estaEditando ? (
                        <div className="space-y-2">
                          <Select value={categoriaEdicao} onValueChange={setCategoriaEdicao}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="geral">📝 Geral</SelectItem>
                              <SelectItem value="pedagogico">📚 Pedagógico</SelectItem>
                              <SelectItem value="financeiro">💰 Financeiro</SelectItem>
                              <SelectItem value="comportamento">⚠️ Comportamento</SelectItem>
                              <SelectItem value="elogio">⭐ Elogio</SelectItem>
                              <SelectItem value="reclamacao">😤 Reclamação</SelectItem>
                              <SelectItem value="contato">📞 Contato/Ligação</SelectItem>
                            </SelectContent>
                          </Select>
                          <textarea
                            value={textoEdicao}
                            onChange={(e) => setTextoEdicao(e.target.value)}
                            className="w-full h-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => salvarEdicaoAnotacao(anotacao.id)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
                            >
                              <Check className="w-4 h-4" />
                              Salvar
                            </button>
                            <button
                              onClick={() => {
                                setEditandoAnotacaoId(null);
                                setTextoEdicao('');
                                setCategoriaEdicao('geral');
                              }}
                              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-sm flex items-center gap-1"
                            >
                              <X className="w-4 h-4" />
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className={`text-sm ${anotacao.resolvido ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                            {anotacao.texto}
                          </p>
                          {anotacao.criado_por && (
                            <p className="text-xs text-slate-500 mt-2">Por: {anotacao.criado_por}</p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setModalVerAnotacoes(false);
                if (alunoVerAnotacoes) {
                  setAlunoAnotacao(alunoVerAnotacoes);
                  setModalAnotacao(true);
                }
              }}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <MessageSquarePlus className="w-4 h-4 mr-2" />
              Nova Anotação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Confirmação de Exclusão de Anotação */}
      <ModalConfirmacao
        aberto={anotacaoParaExcluir !== null}
        onClose={() => setAnotacaoParaExcluir(null)}
        onConfirmar={confirmarExclusaoAnotacao}
        titulo="Excluir Anotação"
        mensagem="Tem certeza que deseja excluir esta anotação? Esta ação não pode ser desfeita."
        tipo="danger"
        textoConfirmar="Excluir"
        textoCancelar="Cancelar"
      />

      {/* Modal Reset Mês - Confirmação Dupla (Admin) */}
      <AlertDialog open={modalResetMes} onOpenChange={(open) => {
        setModalResetMes(open);
        if (!open) setConfirmacaoReset('');
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-400">
              <AlertTriangle className="w-5 h-5" />
              Reset Mensal de Pagamentos
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="text-slate-300">
                Esta ação irá:
              </p>
              <ul className="list-disc list-inside text-sm text-slate-400 space-y-1">
                <li>Salvar um snapshot do status atual no histórico</li>
                <li>Resetar <strong className="text-white">matrículas ativas/trancadas</strong> para "Sem sync financeiro"</li>
              </ul>
              <p className="text-red-400 font-medium text-sm">
                ⚠️ Esta ação não pode ser desfeita!
              </p>
              <div className="pt-2">
                <label className="text-sm text-slate-400 block mb-2">
                  Digite <strong className="text-white">RESETAR</strong> para confirmar:
                </label>
                <input
                  type="text"
                  value={confirmacaoReset}
                  onChange={(e) => setConfirmacaoReset(e.target.value.toUpperCase())}
                  placeholder="RESETAR"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmacaoReset('')}>
              Cancelar
            </AlertDialogCancel>
            <button
              onClick={handleResetMes}
              disabled={confirmacaoReset !== 'RESETAR' || processandoReset}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {processandoReset ? 'Processando...' : 'Confirmar Reset'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Ficha do Aluno */}
      {alunoFicha && (
        <ModalFichaAluno
          aluno={alunoFicha}
          onClose={() => setAlunoFicha(null)}
          onSalvar={onRecarregar}
          professores={professores}
          cursos={cursos}
          tiposMatricula={tiposMatricula}
          onAbrirOutroCurso={(outroAluno) => setAlunoFicha(outroAluno)}
        />
      )}

      {/* Modal de composição da mensalidade: cheio − descontos = parcela real */}
      <Dialog open={!!modalMensalidade} onOpenChange={(open) => !open && setModalMensalidade(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mensalidade{modalMensalidade ? ` — ${modalMensalidade.nome}` : ''}</DialogTitle>
            <DialogDescription>
              A parcela é o <strong>valor cheio menos o desconto condicional</strong>. O desconto fixo fica registrado, mas <strong>não entra</strong> no valor da parcela. O valor final é recalculado automaticamente.
            </DialogDescription>
          </DialogHeader>
          {modalMensalidade && (() => {
            const cheioN = modalMensalidade.cheio.trim() !== '' ? Number(modalMensalidade.cheio) : null;
            const condN = modalMensalidade.cond.trim() !== '' ? Number(modalMensalidade.cond) : 0;
            // Desconto fixo é registrado mas NÃO entra na parcela
            const parcela = cheioN != null ? Math.round((cheioN - condN) * 100) / 100 : null;
            return (
              <div className="space-y-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm text-slate-300">Valor cheio <span className="text-slate-500">(entrou no sistema)</span></label>
                  <Input type="number" step="0.01" value={modalMensalidade.cheio}
                    onChange={(e) => setModalMensalidade(m => m && ({ ...m, cheio: e.target.value }))}
                    className="w-32 text-right" placeholder="0,00" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm text-slate-400">Desconto fixo <span className="text-slate-500">(registrado — não entra)</span></label>
                  <Input type="number" step="0.01" value={modalMensalidade.fixo}
                    onChange={(e) => setModalMensalidade(m => m && ({ ...m, fixo: e.target.value }))}
                    className="w-32 text-right" placeholder="0,00" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm text-slate-300">− Desconto condicional</label>
                  <Input type="number" step="0.01" value={modalMensalidade.cond}
                    onChange={(e) => setModalMensalidade(m => m && ({ ...m, cond: e.target.value }))}
                    className="w-32 text-right" placeholder="0,00" />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-700 pt-3 mt-1">
                  <span className="text-sm font-semibold text-emerald-300">= Mensalidade real</span>
                  <span className="text-lg font-bold text-emerald-300">
                    {parcela != null ? `R$ ${parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </span>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMensalidade(null)}>Cancelar</Button>
            <Button onClick={salvarMensalidade}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
