import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  CircleOff,
  Filter,
  GraduationCap,
  LockKeyhole,
  RotateCcw,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  getHealthScoreV3SegmentGoalUiState,
  updateHealthScoreV3SegmentGoalValue,
  type HealthScoreV3SegmentGoalUiState,
  type HealthScoreV3AssignmentSummary,
  type HealthScoreV3ConfigPendencias,
  type HealthScoreV3Modalidade,
  type HealthScoreV3SegmentDraftGoal,
  type HealthScoreV3SegmentGoal,
  type HealthScoreV3SegmentGoalState,
  type HealthScoreV3SimulationCapacityAlert,
} from '@/lib/healthScoreProfessorV3';

const CANONICAL_UNIT_NAMES: Record<string, string> = {
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
};

const CANONICAL_UNIT_ORDER = ['Barra', 'Recreio', 'Campo Grande'];

interface SegmentIdentity {
  unidadeId: string;
  unidadeNome: string | null;
  cursoId: number;
  cursoNome: string | null;
  modalidade: HealthScoreV3Modalidade;
}

interface SegmentPendingState {
  regraAusente: boolean;
  zeroCarteira: boolean;
  superlotacao: boolean;
}

export interface HealthScoreV3SegmentMatrixRow {
  goal: HealthScoreV3SegmentGoal;
  key: string;
  synthetic: boolean;
  pending: SegmentPendingState;
}

export interface HealthScoreV3SegmentGoalErrors {
  capacidadeMaxima?: string;
  metaMediaTurma?: string;
  metaCarteiraCurso?: string;
  estado?: string;
}

function normalizeName(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function resolveUnitName(unidadeId: string, unidadeNome?: string | null) {
  return unidadeNome || CANONICAL_UNIT_NAMES[unidadeId] || unidadeId;
}

function hasCompleteSegmentIdentity(
  summary: HealthScoreV3AssignmentSummary,
): summary is HealthScoreV3AssignmentSummary & SegmentIdentity {
  return Boolean(
    summary.unidadeId?.trim()
    && summary.cursoId !== null
    && Number.isFinite(summary.cursoId)
    && summary.cursoId > 0
    && (summary.modalidade === 'individual' || summary.modalidade === 'turma'),
  );
}

export function healthScoreV3SegmentKey(identity: {
  unidadeId: string;
  cursoId: number;
  modalidade: HealthScoreV3Modalidade;
}) {
  return `${identity.unidadeId}|${identity.cursoId}|${identity.modalidade}`;
}

function createPendingGoal(
  identity: SegmentIdentity,
  source: 'segmento_observado_sem_regra' | 'atribuicao_sem_regra' | 'zero_carteira',
): HealthScoreV3SegmentGoal {
  return {
    id: null,
    configId: null,
    unidadeId: identity.unidadeId,
    unidadeNome: resolveUnitName(identity.unidadeId, identity.unidadeNome),
    cursoId: identity.cursoId,
    cursoNome: identity.cursoNome,
    modalidade: identity.modalidade,
    estado: 'configurada',
    capacidadeMaxima: 0,
    metaMediaTurma: 0,
    metaCarteiraCurso: 0,
    parametros: {
      fonte: source,
      origem_pendencia: source,
    },
    criadoEm: null,
    atualizadoEm: null,
  };
}

function unitSortRank(unitName: string | null) {
  const normalized = normalizeName(unitName);
  const index = CANONICAL_UNIT_ORDER.findIndex((name) => normalizeName(name) === normalized);
  return index === -1 ? CANONICAL_UNIT_ORDER.length : index;
}

export function buildHealthScoreV3SegmentMatrix(
  metas: HealthScoreV3SegmentGoal[],
  pendencias: HealthScoreV3ConfigPendencias,
  superlotacoes: HealthScoreV3SimulationCapacityAlert[] = [],
): HealthScoreV3SegmentMatrixRow[] {
  const unitNames = new Map<string, string>();
  for (const goal of metas) {
    unitNames.set(goal.unidadeId, resolveUnitName(goal.unidadeId, goal.unidadeNome));
  }
  for (const summary of [
    ...pendencias.segmentosObservadosSemRegra,
    ...pendencias.atribuicoesSemRegra,
    ...pendencias.atribuicoesZeroCarteira,
    ...pendencias.divergenciasModalidade,
  ]) {
    if (summary.unidadeId && summary.unidadeNome) {
      unitNames.set(summary.unidadeId, summary.unidadeNome);
    }
  }

  const rows = new Map<string, {
    goal: HealthScoreV3SegmentGoal;
    synthetic: boolean;
  }>();
  const pendingByKey = new Map<string, Omit<SegmentPendingState, 'superlotacao'>>();
  const superlotacaoKeys = new Set(
    superlotacoes.map((alerta) => healthScoreV3SegmentKey(alerta)),
  );

  for (const goal of metas) {
    const key = healthScoreV3SegmentKey(goal);
    if (rows.has(key)) continue;
    rows.set(key, {
      goal: {
        ...goal,
        unidadeNome: resolveUnitName(
          goal.unidadeId,
          goal.unidadeNome || unitNames.get(goal.unidadeId),
        ),
      },
      synthetic: false,
    });
  }

  const registerPending = (
    summary: HealthScoreV3AssignmentSummary,
    source: 'segmento_observado_sem_regra' | 'atribuicao_sem_regra' | 'zero_carteira',
  ) => {
    if (!hasCompleteSegmentIdentity(summary)) return;
    const identity: SegmentIdentity = {
      unidadeId: summary.unidadeId,
      unidadeNome: summary.unidadeNome || unitNames.get(summary.unidadeId) || null,
      cursoId: summary.cursoId,
      cursoNome: summary.cursoNome,
      modalidade: summary.modalidade,
    };
    const key = healthScoreV3SegmentKey(identity);
    const currentPending = pendingByKey.get(key) || {
      regraAusente: false,
      zeroCarteira: false,
    };
    pendingByKey.set(key, {
      regraAusente: currentPending.regraAusente || source !== 'zero_carteira',
      zeroCarteira: currentPending.zeroCarteira || source === 'zero_carteira',
    });

    const current = rows.get(key);
    if (current) {
      if (!current.goal.cursoNome && identity.cursoNome) {
        current.goal = { ...current.goal, cursoNome: identity.cursoNome };
      }
      return;
    }
    rows.set(key, {
      goal: createPendingGoal(identity, source),
      synthetic: true,
    });
  };

  for (const summary of pendencias.segmentosObservadosSemRegra) {
    registerPending(summary, 'segmento_observado_sem_regra');
  }
  for (const summary of pendencias.atribuicoesSemRegra) {
    registerPending(summary, 'atribuicao_sem_regra');
  }
  for (const summary of pendencias.atribuicoesZeroCarteira) {
    registerPending(summary, 'zero_carteira');
  }

  return [...rows.entries()]
    .map(([key, row]) => {
      const pending = pendingByKey.get(key) || {
        regraAusente: false,
        zeroCarteira: false,
      };
      return {
        ...row,
        key,
        pending: {
          ...pending,
          superlotacao: superlotacaoKeys.has(key),
        },
      };
    })
    .sort((left, right) => {
      const unitRank = unitSortRank(left.goal.unidadeNome) - unitSortRank(right.goal.unidadeNome);
      if (unitRank !== 0) return unitRank;
      const unitName = (left.goal.unidadeNome || '').localeCompare(
        right.goal.unidadeNome || '',
        'pt-BR',
      );
      if (unitName !== 0) return unitName;
      const courseName = (left.goal.cursoNome || '').localeCompare(
        right.goal.cursoNome || '',
        'pt-BR',
      );
      if (courseName !== 0) return courseName;
      return left.goal.modalidade === right.goal.modalidade
        ? 0
        : left.goal.modalidade === 'individual' ? -1 : 1;
    });
}

export function countHealthScoreV3ZeroPortfolioProfessors(
  atribuicoes: HealthScoreV3AssignmentSummary[],
) {
  return new Set(
    atribuicoes
      .map((summary) => summary.professorId)
      .filter((professorId): professorId is number => professorId !== null),
  ).size;
}

export function buildHealthScoreV3UnitTabs(matrix: HealthScoreV3SegmentMatrixRow[]) {
  const unique = new Map(Object.entries(CANONICAL_UNIT_NAMES));
  for (const { goal } of matrix) {
    unique.set(goal.unidadeId, resolveUnitName(goal.unidadeId, goal.unidadeNome));
  }
  return [...unique.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => {
      const rank = unitSortRank(left.name) - unitSortRank(right.name);
      return rank !== 0 ? rank : left.name.localeCompare(right.name, 'pt-BR');
    });
}

export function ensureHealthScoreV3DraftSegmentGoals(
  metas: HealthScoreV3SegmentGoal[],
  pendencias: HealthScoreV3ConfigPendencias,
  configId: string,
) {
  return buildHealthScoreV3SegmentMatrix(metas, pendencias).map(({ goal, synthetic }) => (
    synthetic ? { ...goal, configId } : goal
  ));
}

export function transitionHealthScoreV3SegmentGoalState(
  goal: HealthScoreV3SegmentGoal,
  estado: HealthScoreV3SegmentGoalState,
): HealthScoreV3SegmentGoal {
  if (estado === 'nao_ofertada') {
    return {
      ...goal,
      estado: 'nao_ofertada',
      capacidadeMaxima: null,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
    };
  }
  if (goal.estado === 'configurada') return goal;
  return {
    ...goal,
    estado: 'configurada',
    capacidadeMaxima: 0,
    metaMediaTurma: 0,
    metaCarteiraCurso: 0,
  };
}

export function getHealthScoreV3SegmentGoalErrors(
  goal: HealthScoreV3SegmentGoal,
): HealthScoreV3SegmentGoalErrors {
  if (goal.estado === 'nao_ofertada') {
    return goal.capacidadeMaxima === null
      && goal.metaMediaTurma === null
      && goal.metaCarteiraCurso === null
      ? {}
      : { estado: 'Segmento não ofertado deve manter as três metas vazias.' };
  }

  const errors: HealthScoreV3SegmentGoalErrors = {};
  if (!Number.isFinite(goal.capacidadeMaxima) || goal.capacidadeMaxima <= 0) {
    errors.capacidadeMaxima = 'Informe uma capacidade maior que zero.';
  }
  if (!Number.isFinite(goal.metaMediaTurma) || goal.metaMediaTurma <= 0) {
    errors.metaMediaTurma = 'Informe uma meta média/turma maior que zero.';
  }
  if (!Number.isFinite(goal.metaCarteiraCurso) || goal.metaCarteiraCurso <= 0) {
    errors.metaCarteiraCurso = 'Informe uma meta de carteira maior que zero.';
  }
  if (
    goal.metaMediaTurma > 0
    && goal.capacidadeMaxima > 0
    && goal.metaMediaTurma > goal.capacidadeMaxima
  ) {
    errors.metaMediaTurma = 'A meta média/turma não pode superar a capacidade máxima.';
  }
  return errors;
}

export function areHealthScoreV3SegmentGoalsValid(metas: HealthScoreV3SegmentGoal[]) {
  return metas.every((goal) => Object.keys(getHealthScoreV3SegmentGoalErrors(goal)).length === 0);
}

interface HealthScoreV3DraftMatrixRow {
  goal: HealthScoreV3SegmentDraftGoal;
  key: string;
  synthetic: boolean;
  pending: SegmentPendingState;
}

function buildDraftMatrixRows(
  metas: HealthScoreV3SegmentDraftGoal[],
  pendencias: HealthScoreV3ConfigPendencias,
  superlotacoes: HealthScoreV3SimulationCapacityAlert[],
): HealthScoreV3DraftMatrixRow[] {
  const zeroPortfolioKeys = new Set(
    pendencias.atribuicoesZeroCarteira
      .filter(hasCompleteSegmentIdentity)
      .map(healthScoreV3SegmentKey),
  );
  const capacityKeys = new Set(superlotacoes.map(healthScoreV3SegmentKey));

  return metas.map((goal) => {
    const key = healthScoreV3SegmentKey(goal);
    return {
      goal,
      key,
      synthetic: !goal.persistida,
      pending: {
        regraAusente: getHealthScoreV3SegmentGoalUiState(goal) === 'regra_ausente',
        zeroCarteira: zeroPortfolioKeys.has(key),
        superlotacao: capacityKeys.has(key),
      },
    };
  }).sort((left, right) => {
    const unitRank = unitSortRank(left.goal.unidadeNome) - unitSortRank(right.goal.unidadeNome);
    if (unitRank !== 0) return unitRank;
    const courseName = left.goal.cursoNome.localeCompare(right.goal.cursoNome, 'pt-BR');
    if (courseName !== 0) return courseName;
    return left.goal.modalidade === right.goal.modalidade
      ? 0
      : left.goal.modalidade === 'individual' ? -1 : 1;
  });
}

function isDraftRowPending(row: HealthScoreV3DraftMatrixRow) {
  const uiState = getHealthScoreV3SegmentGoalUiState(row.goal);
  return uiState === 'regra_ausente'
    || uiState === 'revisar'
    || uiState === 'pronta_para_salvar'
    || row.pending.superlotacao;
}

function buildDraftUnitTabs(matrix: HealthScoreV3DraftMatrixRow[]) {
  const unique = new Map(Object.entries(CANONICAL_UNIT_NAMES));
  for (const { goal } of matrix) unique.set(goal.unidadeId, goal.unidadeNome);
  return [...unique.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => {
      const rank = unitSortRank(left.name) - unitSortRank(right.name);
      return rank !== 0 ? rank : left.name.localeCompare(right.name, 'pt-BR');
    });
}

function transitionDraftGoalState(
  goal: HealthScoreV3SegmentDraftGoal,
  estado: HealthScoreV3SegmentDraftGoal['estado'],
): HealthScoreV3SegmentDraftGoal {
  const base = { ...goal, tocada: true };
  if (estado === 'nao_configurada') {
    return {
      ...base,
      estado,
      capacidadeMaxima: null,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
    };
  }
  if (estado === 'nao_ofertada') {
    return {
      ...base,
      estado,
      capacidadeMaxima: null,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
    };
  }
  return {
    ...base,
    estado,
    capacidadeMaxima: goal.estado === 'configurada' ? goal.capacidadeMaxima : null,
    metaMediaTurma: goal.estado === 'configurada' ? goal.metaMediaTurma : null,
    metaCarteiraCurso: goal.estado === 'configurada' ? goal.metaCarteiraCurso : null,
  };
}

function getDraftGoalErrors(goal: HealthScoreV3SegmentDraftGoal): HealthScoreV3SegmentGoalErrors {
  if (goal.estado !== 'configurada' || (!goal.tocada && !goal.persistida)) return {};
  const errors: HealthScoreV3SegmentGoalErrors = {};
  if (goal.capacidadeMaxima === null || goal.capacidadeMaxima <= 0) {
    errors.capacidadeMaxima = 'Informe uma capacidade maior que zero.';
  }
  if (goal.metaMediaTurma === null || goal.metaMediaTurma <= 0) {
    errors.metaMediaTurma = 'Informe uma meta média/turma maior que zero.';
  }
  if (goal.metaCarteiraCurso === null || goal.metaCarteiraCurso <= 0) {
    errors.metaCarteiraCurso = 'Informe uma meta de carteira maior que zero.';
  }
  if (
    goal.metaMediaTurma !== null
    && goal.capacidadeMaxima !== null
    && goal.metaMediaTurma > goal.capacidadeMaxima
  ) {
    errors.metaMediaTurma = 'A meta média/turma não pode superar a capacidade máxima.';
  }
  return errors;
}

export interface HealthScoreV3MetasSegmentadasProps {
  metas: HealthScoreV3SegmentDraftGoal[];
  pendencias: HealthScoreV3ConfigPendencias;
  superlotacoes?: HealthScoreV3SimulationCapacityAlert[];
  superlotacaoDisponivel?: boolean;
  editable: boolean;
  disabled?: boolean;
  onMetasChange: (metas: HealthScoreV3SegmentDraftGoal[]) => void;
}

type PendingFilter = 'todas' | 'pendentes' | 'regra_ausente' | 'superlotacao';

export function HealthScoreV3MetasSegmentadas({
  metas,
  pendencias,
  superlotacoes = [],
  superlotacaoDisponivel = false,
  editable,
  disabled = false,
  onMetasChange,
}: HealthScoreV3MetasSegmentadasProps) {
  const [activeUnitId, setActiveUnitId] = useState('');
  const [courseFilter, setCourseFilter] = useState('todos');
  const [modalityFilter, setModalityFilter] = useState<'todas' | HealthScoreV3Modalidade>('todas');
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>('todas');
  const matrix = useMemo(
    () => buildDraftMatrixRows(metas, pendencias, superlotacoes),
    [metas, pendencias, superlotacoes],
  );
  const units = useMemo(() => buildDraftUnitTabs(matrix), [matrix]);

  useEffect(() => {
    if (units.some((unit) => unit.id === activeUnitId)) return;
    setActiveUnitId(units[0]?.id || '');
  }, [activeUnitId, units]);

  const courses = useMemo(() => {
    const unique = new Map<number, string>();
    for (const { goal } of matrix) {
      if (goal.unidadeId !== activeUnitId) continue;
      unique.set(goal.cursoId, goal.cursoNome || `Curso ${goal.cursoId}`);
    }
    return [...unique.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [activeUnitId, matrix]);

  useEffect(() => {
    if (courseFilter === 'todos') return;
    if (!courses.some((course) => String(course.id) === courseFilter)) {
      setCourseFilter('todos');
    }
  }, [courseFilter, courses]);

  const visibleRows = useMemo(() => matrix.filter((row) => {
    if (row.goal.unidadeId !== activeUnitId) return false;
    if (courseFilter !== 'todos' && String(row.goal.cursoId) !== courseFilter) return false;
    if (modalityFilter !== 'todas' && row.goal.modalidade !== modalityFilter) return false;
    if (pendingFilter === 'regra_ausente' && !row.pending.regraAusente) return false;
    if (pendingFilter === 'superlotacao' && !row.pending.superlotacao) return false;
    if (pendingFilter === 'pendentes' && !isDraftRowPending(row)) return false;
    return true;
  }), [activeUnitId, courseFilter, matrix, modalityFilter, pendingFilter]);

  const counters = {
    regraAusente: matrix.filter((row) => row.pending.regraAusente).length,
    salvasRascunho: matrix.filter(
      (row) => getHealthScoreV3SegmentGoalUiState(row.goal) === 'salva_no_rascunho',
    ).length,
    superlotacao: matrix.filter((row) => row.pending.superlotacao).length,
  };

  const updateGoal = (nextGoal: HealthScoreV3SegmentDraftGoal) => {
    if (!editable || disabled) return;
    const key = healthScoreV3SegmentKey(nextGoal);
    let found = false;
    const nextMetas = metas.map((goal) => {
      if (healthScoreV3SegmentKey(goal) !== key) return goal;
      found = true;
      return nextGoal;
    });
    onMetasChange(found ? nextMetas : [...nextMetas, nextGoal]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <GraduationCap className="h-4 w-4 shrink-0 text-cyan-300" />
          <span className="text-xs font-medium text-slate-300">
            {matrix.length} regras por unidade, curso e modalidade
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-200">
            Fonte: catálogo Emusys
          </Badge>
          {!editable && (
            <Badge variant="outline" className="gap-1 border-slate-700 text-slate-300">
              <LockKeyhole className="h-3 w-3" />
              Somente leitura
            </Badge>
          )}
        </div>
      </div>

      <div className="grid border-y border-slate-800 bg-slate-950/30 sm:grid-cols-3 sm:divide-x sm:divide-slate-800">
        <CounterItem
          label="Meta não configurada"
          value={counters.regraAusente}
          tone="amber"
          tooltip="Segmentos observados ou atribuídos que ainda não possuem uma meta exata."
        />
        <CounterItem
          label="Salvas no rascunho"
          value={counters.salvasRascunho}
          tone="cyan"
          tooltip="Metas já persistidas na versão de rascunho exibida."
        />
        <CounterItem
          label="Acima da capacidade"
          value={superlotacaoDisponivel ? counters.superlotacao : '—'}
          tone="rose"
          tooltip="Segmentos observados acima da capacidade na última simulação canônica salva."
        />
      </div>

      {units.length > 0 ? (
        <Tabs value={activeUnitId} onValueChange={setActiveUnitId}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto w-max min-w-full justify-start rounded-md border border-slate-800 bg-slate-950/40 p-1">
              {units.map((unit) => (
                <TabsTrigger
                  key={unit.id}
                  value={unit.id}
                  className="min-w-[132px] rounded-sm px-4 py-2 text-xs data-[state=active]:bg-slate-800"
                >
                  {unit.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4">
        <Filter className="h-4 w-4 shrink-0 text-slate-500" />
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger
            aria-label="Filtrar por curso"
            className="h-9 w-full rounded-md border-slate-700 bg-slate-900 sm:w-[210px]"
          >
            <SelectValue placeholder="Todos os cursos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os cursos</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={String(course.id)}>{course.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={modalityFilter}
          onValueChange={(value) => setModalityFilter(value as 'todas' | HealthScoreV3Modalidade)}
        >
          <SelectTrigger
            aria-label="Filtrar por modalidade"
            className="h-9 w-full rounded-md border-slate-700 bg-slate-900 sm:w-[190px]"
          >
            <SelectValue placeholder="Todas as modalidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as modalidades</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="turma">Turma</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pendingFilter} onValueChange={(value) => setPendingFilter(value as PendingFilter)}>
          <SelectTrigger
            aria-label="Filtrar por pendência"
            className="h-9 w-full rounded-md border-slate-700 bg-slate-900 sm:w-[190px]"
          >
            <SelectValue placeholder="Todas as linhas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as linhas</SelectItem>
            <SelectItem value="pendentes">Com pendência</SelectItem>
            <SelectItem value="regra_ausente">Regra ausente</SelectItem>
            <SelectItem value="superlotacao">Acima da capacidade</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto border-b border-slate-800">
        <table className="w-full min-w-[1380px] table-fixed text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400">
              <th className="w-[190px] px-3 py-2 font-medium">Curso</th>
              <th className="w-[125px] px-3 py-2 font-medium">Modalidade</th>
              <th className="w-[150px] px-3 py-2 font-medium">Capacidade máxima</th>
              <th className="w-[170px] px-3 py-2 font-medium">Meta média/turma</th>
              <th className="w-[155px] px-3 py-2 font-medium">Meta carteira</th>
              <th className="w-[170px] px-3 py-2 font-medium">Configuração</th>
              <th className="w-[205px] px-3 py-2 font-medium">Validação de capacidade</th>
              <th className="w-[210px] px-3 py-2 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {visibleRows.map((row) => {
              const errors = getDraftGoalErrors(row.goal);
              const rowId = row.key.replace(/[^a-zA-Z0-9_-]/g, '-');
              return (
                <tr key={row.key} className="min-h-[94px] align-top hover:bg-slate-900/40">
                  <td className="px-3 py-3">
                    <p className="break-words text-sm font-medium text-slate-100">
                      {row.goal.cursoNome || `Curso ${row.goal.cursoId}`}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">ID {row.goal.cursoId}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      {row.goal.modalidade === 'individual'
                        ? <UserRound className="h-3.5 w-3.5 text-emerald-400" />
                        : <UsersRound className="h-3.5 w-3.5 text-violet-400" />}
                      {row.goal.modalidade === 'individual' ? 'Individual' : 'Turma'}
                    </span>
                  </td>
                  <SegmentNumberInput
                    id={`${rowId}-capacidade`}
                    label={`Capacidade máxima - ${row.goal.cursoNome || `Curso ${row.goal.cursoId}`}`}
                    value={row.goal.estado === 'configurada' ? row.goal.capacidadeMaxima : null}
                    error={errors.capacidadeMaxima}
                    editable={editable && row.goal.estado !== 'nao_ofertada'}
                    disabled={disabled}
                    step={0.1}
                    onChange={(value) => updateGoal(
                      updateHealthScoreV3SegmentGoalValue(row.goal, 'capacidadeMaxima', value),
                    )}
                  />
                  <SegmentNumberInput
                    id={`${rowId}-media`}
                    label={`Meta média por turma - ${row.goal.cursoNome || `Curso ${row.goal.cursoId}`}`}
                    value={row.goal.estado === 'configurada' ? row.goal.metaMediaTurma : null}
                    error={errors.metaMediaTurma}
                    editable={editable && row.goal.estado !== 'nao_ofertada'}
                    disabled={disabled}
                    step={0.1}
                    onChange={(value) => updateGoal(
                      updateHealthScoreV3SegmentGoalValue(row.goal, 'metaMediaTurma', value),
                    )}
                  />
                  <SegmentNumberInput
                    id={`${rowId}-carteira`}
                    label={`Meta de carteira - ${row.goal.cursoNome || `Curso ${row.goal.cursoId}`}`}
                    value={row.goal.estado === 'configurada' ? row.goal.metaCarteiraCurso : null}
                    error={errors.metaCarteiraCurso}
                    editable={editable && row.goal.estado !== 'nao_ofertada'}
                    disabled={disabled}
                    step={1}
                    onChange={(value) => updateGoal(
                      updateHealthScoreV3SegmentGoalValue(row.goal, 'metaCarteiraCurso', value),
                    )}
                  />
                  <td className="px-3 py-3">
                    <SegmentStatus row={row} />
                  </td>
                  <td className="px-3 py-3">
                    <SegmentCapacityStatus
                      row={row}
                      available={superlotacaoDisponivel}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {row.goal.estado === 'nao_ofertada' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!editable || disabled}
                        aria-label={`Voltar a configurar ${row.goal.cursoNome}`}
                        onClick={() => updateGoal(transitionDraftGoalState(row.goal, 'configurada'))}
                        className="h-auto min-h-8 w-full whitespace-normal"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Voltar a configurar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!editable || disabled}
                        aria-label={`Não ofertado nesta unidade - ${row.goal.cursoNome}`}
                        onClick={() => updateGoal(transitionDraftGoalState(row.goal, 'nao_ofertada'))}
                        className="h-auto min-h-8 w-full whitespace-normal text-slate-400 hover:text-slate-100"
                      >
                        <CircleOff className="h-3.5 w-3.5" />
                        Não ofertado nesta unidade
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleRows.length === 0 && (
          <div className="flex min-h-[112px] items-center justify-center px-4 text-sm text-slate-500">
            Nenhum segmento para os filtros selecionados.
          </div>
        )}
      </div>

      {pendencias.atribuicoesZeroCarteira.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-950/30 px-3 py-2 text-[11px] leading-4 text-slate-400">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <p>
            Vínculos de professor sem aluno ativo continuam disponíveis para configuração,
            mas ficam fora do cálculo até receberem um aluno.
          </p>
        </div>
      )}

    </div>
  );
}

function CounterItem({
  label,
  value,
  tone,
  tooltip,
}: {
  label: string;
  value: number | string;
  tone: 'amber' | 'cyan' | 'rose' | 'violet';
  tooltip: string;
}) {
  const toneClass = {
    amber: 'text-amber-300',
    cyan: 'text-cyan-300',
    rose: 'text-rose-300',
    violet: 'text-violet-300',
  }[tone];
  return (
    <div className="flex min-h-[64px] items-center justify-between gap-3 border-b border-slate-800 px-3 py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0">
      <div className="min-w-0">
        <p className="break-words text-[11px] text-slate-400">{label}</p>
        <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
      </div>
      <Tooltip content={tooltip} side="top">
        <button
          type="button"
          aria-label={`Sobre ${label}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}

function SegmentNumberInput({
  id,
  label,
  value,
  error,
  editable,
  disabled,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  error?: string;
  editable: boolean;
  disabled: boolean;
  step: number;
  onChange: (value: number | null) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <td className="px-3 py-3">
      <Input
        id={id}
        aria-label={label}
        type="number"
        min={0.01}
        step={step}
        value={value ?? ''}
        placeholder="—"
        disabled={!editable || disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          if (event.target.value === '') {
            onChange(null);
            return;
          }
          const nextValue = Number(event.target.value);
          onChange(Number.isFinite(nextValue) ? nextValue : null);
        }}
        className="h-8 rounded-md border-slate-700 bg-slate-900 px-2 text-xs"
      />
      <p id={errorId} className="mt-1 min-h-[28px] break-words text-[10px] leading-3 text-rose-300">
        {error || '\u00a0'}
      </p>
    </td>
  );
}

function SegmentStatus({ row }: { row: HealthScoreV3DraftMatrixRow }) {
  const state = getHealthScoreV3SegmentGoalUiState(row.goal);
  const updatedAt = row.goal.atualizadoEm
    ? new Intl.DateTimeFormat('pt-BR').format(new Date(row.goal.atualizadoEm))
    : null;
  return (
    <div className="space-y-1.5">
      <SegmentStateBadge state={state} />
      {updatedAt && <p className="text-[10px] text-slate-500">Salva em {updatedAt}</p>}
    </div>
  );
}

function SegmentCapacityStatus({
  row,
  available,
}: {
  row: HealthScoreV3DraftMatrixRow;
  available: boolean;
}) {
  if (!available) {
    return <span className="text-[11px] text-slate-500">Aguardando simulação</span>;
  }
  if (row.pending.superlotacao) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-300">
        <AlertTriangle className="h-3 w-3" />
        Acima da capacidade
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300">
      <CheckCircle2 className="h-3 w-3" />
      Dentro da capacidade
    </span>
  );
}

function SegmentStateBadge({ state }: { state: HealthScoreV3SegmentGoalUiState }) {
  if (state === 'salva_no_rascunho') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Salva no rascunho
      </Badge>
    );
  }
  if (state === 'pronta_para_salvar') {
    return (
      <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">
        Pronta para salvar
      </Badge>
    );
  }
  if (state === 'revisar') return <Badge variant="error">Revisar valores</Badge>;
  if (state === 'nao_ofertada') {
    return <Badge variant="outline" className="border-slate-700 text-slate-300">Não ofertado</Badge>;
  }
  return <Badge variant="warning">Regra ausente</Badge>;
}
