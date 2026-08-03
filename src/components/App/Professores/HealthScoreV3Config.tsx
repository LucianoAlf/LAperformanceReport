import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { format, startOfMonth } from 'date-fns';
import {
  Activity,
  Beaker,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  Loader2,
  RotateCcw,
  Save,
  Settings2,
  Target,
  Undo2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { useHealthScoreProfessorV3Config } from '@/hooks/useHealthScoreProfessorV3Config';
import { HealthScoreV3MetasSegmentadas } from './HealthScoreV3MetasSegmentadas';
import { ProfessorCursoModalidadeReconciliacao } from './ProfessorCursoModalidadeReconciliacao';
import type {
  HealthMetricKeyV3,
  HealthScoreV3Config,
  HealthScoreV3MetaStatus,
  HealthScoreV3MetricConfig,
  HealthScoreV3SegmentDraftGoal,
  HealthScoreV3SegmentGoal,
} from '@/lib/healthScoreProfessorV3';
import {
  buildHealthScoreV3DraftLoadState,
  canSaveHealthScoreV3Draft,
  getHealthScoreV3ActivationBlockers,
  HEALTH_SCORE_V3_SCORING_METRICS,
} from '@/lib/healthScoreProfessorV3';

const METRIC_UI: Record<HealthMetricKeyV3, {
  label: string;
  icon: typeof Target;
  unit: string;
  step: number;
  max: number;
}> = {
  retencao: { label: 'Retenção atribuível', icon: Activity, unit: '%', step: 1, max: 100 },
  permanencia: { label: 'Permanência com o professor', icon: Clock3, unit: 'meses', step: 0.1, max: 120 },
  conversao: { label: 'Conversão experimental', icon: Target, unit: '%', step: 1, max: 100 },
  media_turma: { label: 'Média de alunos por turma', icon: Gauge, unit: 'alunos', step: 0.01, max: 10 },
  numero_alunos: { label: 'Número de alunos', icon: Users, unit: 'alunos', step: 1, max: 250 },
  presenca: { label: 'Presença dos alunos', icon: CalendarDays, unit: '%', step: 1, max: 100 },
};

const META_STATUS_LABELS: Record<HealthScoreV3MetaStatus, string> = {
  aprovada: 'Aprovada',
  rascunho: 'Em definição',
  em_calibracao: 'Em calibração',
  aguardando_dados_reais: 'Aguardando dados',
  bloqueada_ate_inicio: 'Bloqueada até o início',
};

const NULL_META_STATUSES: HealthScoreV3MetaStatus[] = [
  'rascunho',
  'em_calibracao',
  'aguardando_dados_reais',
  'bloqueada_ate_inicio',
];

const GLOBAL_TARGET_METRICS: HealthMetricKeyV3[] = [
  'retencao',
  'permanencia',
  'conversao',
  'presenca',
];

const SEGMENTED_TARGET_METRICS: HealthMetricKeyV3[] = [
  'media_turma',
  'numero_alunos',
];

function currentMonthStart() {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd');
}

function draftValidityStart(
  config: HealthScoreV3Config | null,
) {
  return config?.vigenciaInicio || currentMonthStart();
}

function dateFromIso(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isoFromDate(value: Date | undefined) {
  return value ? format(value, 'yyyy-MM-dd') : '';
}

function persistedSegmentGoals(
  goals: HealthScoreV3SegmentDraftGoal[],
): HealthScoreV3SegmentGoal[] {
  return goals.flatMap((goal): HealthScoreV3SegmentGoal[] => {
    if (goal.estado === 'nao_configurada') return [];
    const base = {
      id: goal.id,
      configId: goal.configId,
      unidadeId: goal.unidadeId,
      unidadeNome: goal.unidadeNome,
      cursoId: goal.cursoId,
      cursoNome: goal.cursoNome,
      modalidade: goal.modalidade,
      parametros: { ...goal.parametros },
      criadoEm: goal.criadoEm,
      atualizadoEm: goal.atualizadoEm,
    };
    if (goal.estado === 'nao_ofertada') {
      return [{
        ...base,
        estado: 'nao_ofertada',
        capacidadeMaxima: null,
        metaMediaTurma: null,
        metaCarteiraCurso: null,
      }];
    }
    if (
      goal.capacidadeMaxima === null
      || goal.metaMediaTurma === null
      || goal.metaCarteiraCurso === null
    ) return [];
    return [{
      ...base,
      estado: 'configurada',
      capacidadeMaxima: goal.capacidadeMaxima,
      metaMediaTurma: goal.metaMediaTurma,
      metaCarteiraCurso: goal.metaCarteiraCurso,
    }];
  });
}

function cloneConfig(config: HealthScoreV3Config | null): HealthScoreV3Config | null {
  if (!config) return null;
  return {
    ...config,
    metricas: config.metricas.map((metric) => ({
      ...metric,
      parametros: { ...metric.parametros },
    })),
    metasSegmentadas: config.metasSegmentadas.map((goal) => ({
      ...goal,
      parametros: { ...goal.parametros },
    })),
  };
}

function rebalanceScoringWeights(
  metrics: HealthScoreV3MetricConfig[],
  changedKey: HealthMetricKeyV3,
  nextWeight: number,
) {
  const current = metrics.find((metric) => metric.metrica === changedKey);
  if (!current || current.peso === nextWeight) return metrics;

  let remaining = nextWeight - current.peso;
  const next = metrics.map((metric) => ({ ...metric }));
  const peers = next
    .filter((metric) => (
      metric.metrica !== changedKey
      && HEALTH_SCORE_V3_SCORING_METRICS.includes(
        metric.metrica as (typeof HEALTH_SCORE_V3_SCORING_METRICS)[number],
      )
    ))
    .sort((left, right) => right.peso - left.peso);

  for (const peer of peers) {
    if (remaining === 0) break;
    if (remaining > 0) {
      const transferable = Math.min(remaining, Math.max(0, peer.peso - 1));
      peer.peso -= transferable;
      remaining -= transferable;
    } else {
      const transferable = Math.min(-remaining, Math.max(0, 100 - peer.peso));
      peer.peso += transferable;
      remaining += transferable;
    }
  }

  if (remaining !== 0) return metrics;
  const changed = next.find((metric) => metric.metrica === changedKey);
  if (changed) changed.peso = nextWeight;
  return next;
}

interface HealthScoreV3ConfigProps {
  competencia: string;
}

export function HealthScoreV3Config({ competencia }: HealthScoreV3ConfigProps) {
  const toast = useToast();
  const {
    config,
    simulation,
    loading,
    mutating,
    error,
    refresh,
    createDraft,
    saveDraft,
    simulate,
    restore,
    apply,
  } = useHealthScoreProfessorV3Config(competencia);
  const [workingConfig, setWorkingConfig] = useState<HealthScoreV3Config | null>(null);
  const [workingSegmentGoals, setWorkingSegmentGoals] = useState<HealthScoreV3SegmentDraftGoal[]>([]);
  const [newValidity, setNewValidity] = useState(currentMonthStart);
  const [justification, setJustification] = useState('');
  const [simulationMonth, setSimulationMonth] = useState(currentMonthStart);
  const [simulationIsCurrent, setSimulationIsCurrent] = useState(false);
  const [draftIsDirty, setDraftIsDirty] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const routeBlocker = useBlocker(draftIsDirty);
  const sectionRef = useRef<HTMLElement>(null);
  const pendingNavigationRef = useRef<HTMLElement | null>(null);
  const allowNavigationRef = useRef(false);

  useEffect(() => {
    const source = config?.rascunho || config?.ativa || null;
    const cloned = cloneConfig(source);
    setDraftIsDirty(false);
    setWorkingConfig(cloned);
    setWorkingSegmentGoals((config?.matrizSegmentada || []).map((goal) => ({
      ...goal,
      emusysDisciplinaIds: [...goal.emusysDisciplinaIds],
      parametros: { ...goal.parametros },
    })));
    if (config?.rascunho) {
      setJustification(config.rascunho.justificativa);
      setNewValidity(config.rascunho.vigenciaInicio);
    } else {
      setJustification(
        config?.ativa?.justificativa?.trim() || 'Ajuste do Health Score V3',
      );
      setNewValidity(draftValidityStart(config?.ativa || null));
    }
    setSimulationIsCurrent(false);
  }, [competencia, config]);

  useEffect(() => {
    if (routeBlocker.state !== 'blocked') return;
    setDiscardDialogOpen(true);
  }, [routeBlocker]);

  useEffect(() => {
    if (!draftIsDirty) return undefined;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const confirmNavigation = (event: MouseEvent) => {
      if (allowNavigationRef.current) return;
      if (!(event.target instanceof Element)) return;
      const navigationControl = event.target.closest(
        '[data-tour="professores-abas"] button',
      );
      if (!navigationControl || sectionRef.current?.contains(navigationControl)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingNavigationRef.current = navigationControl as HTMLElement;
      setDiscardDialogOpen(true);
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', confirmNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', confirmNavigation, true);
    };
  }, [draftIsDirty]);

  const editable = Boolean(workingConfig);
  const totalWeight = useMemo(
    () => workingConfig?.metricas.reduce((total, metric) => (
      HEALTH_SCORE_V3_SCORING_METRICS.includes(
        metric.metrica as (typeof HEALTH_SCORE_V3_SCORING_METRICS)[number],
      ) ? total + metric.peso : total
    ), 0) || 0,
    [workingConfig],
  );
  const persistedWeight = useMemo(
    () => workingConfig?.metricas.reduce((total, metric) => total + metric.peso, 0) || 0,
    [workingConfig],
  );
  const weightsAreValid = persistedWeight === 100;
  const hasRequiredTargets = Boolean(workingConfig && GLOBAL_TARGET_METRICS.every((key) => {
    const metric = workingConfig.metricas.find((candidate) => candidate.metrica === key);
    if (!metric) return false;
    return ['retencao', 'presenca'].includes(metric.metrica)
      ? metric.meta !== null || metric.metaStatus !== 'aprovada'
      : metric.meta !== null && metric.metaStatus === 'aprovada';
  }));
  const segmentTargetsAreValid = Boolean(
    workingConfig && canSaveHealthScoreV3Draft(workingSegmentGoals),
  );
  const comparisonCriteriaAreValid = Boolean(
    workingConfig
      && workingConfig.coberturaMinima >= 0
      && workingConfig.coberturaMinima <= 100
      && workingConfig.pilaresMinimos >= 1
      && workingConfig.pilaresMinimos <= HEALTH_SCORE_V3_SCORING_METRICS.length,
  );
  const activationBlockers = getHealthScoreV3ActivationBlockers(
    workingSegmentGoals,
    config?.catalogoSegmentos || [],
  );
  const draftIsValid = weightsAreValid
    && hasRequiredTargets
    && segmentTargetsAreValid
    && comparisonCriteriaAreValid
    && justification.trim().length >= 8;
  const unsavedSegmentCount = useMemo(
    () => workingSegmentGoals.filter((goal) => goal.tocada).length,
    [workingSegmentGoals],
  );
  const canActivate = Boolean(config?.rascunho)
    && draftIsValid
    && !draftIsDirty
    && simulationIsCurrent
    && activationBlockers.length === 0;

  const markDraftChanged = () => {
    setDraftIsDirty(true);
    setSimulationIsCurrent(false);
  };

  const updateMetric = (key: HealthMetricKeyV3, change: Partial<HealthScoreV3MetricConfig>) => {
    if (!editable) return;
    setWorkingConfig((current) => current ? {
      ...current,
      metricas: typeof change.peso === 'number'
        ? rebalanceScoringWeights(current.metricas, key, change.peso)
        : current.metricas.map((metric) => (
            metric.metrica === key ? { ...metric, ...change } : metric
          )),
    } : current);
    markDraftChanged();
  };

  const updateSegmentGoals = (metasSegmentadas: HealthScoreV3SegmentDraftGoal[]) => {
    if (!editable) return;
    setWorkingSegmentGoals(metasSegmentadas);
    markDraftChanged();
  };

  const handleUndo = async () => {
    try {
      await restore();
      toast.success('Alterações desfeitas', 'Voltamos ao último ajuste salvo.');
    } catch {
      toast.error('Não foi possível desfazer', 'Atualize a tela e tente novamente.');
    }
  };

  const handleRestoreActive = () => {
    if (!config?.ativa) return;
    const active = cloneConfig(config.ativa);
    if (!active) return;
    setWorkingConfig(config.rascunho ? {
      ...active,
      id: config.rascunho.id,
      versao: config.rascunho.versao,
      status: config.rascunho.status,
      vigenciaInicio: config.rascunho.vigenciaInicio,
      vigenciaFim: config.rascunho.vigenciaFim,
      justificativa: config.rascunho.justificativa,
    } : active);
    setWorkingSegmentGoals(buildHealthScoreV3DraftLoadState(
      config.ativa.metasSegmentadas,
      config.catalogoSegmentos || [],
    ).matrix);
    setNewValidity(config.rascunho?.vigenciaInicio || active.vigenciaInicio);
    setJustification(
      config.rascunho?.justificativa || active.justificativa || 'Ajuste do Health Score V3',
    );
    markDraftChanged();
    toast.success('Configuração vigente restaurada', 'Revise e simule antes de aplicar.');
  };

  const buildDraft = (): HealthScoreV3Config | null => {
    if (!workingConfig) return null;
    return {
      ...workingConfig,
      vigenciaInicio: newValidity,
      justificativa: justification.trim(),
      metasSegmentadas: persistedSegmentGoals(workingSegmentGoals),
    };
  };

  const ensureEditableConfig = async (
    candidate: HealthScoreV3Config,
  ): Promise<HealthScoreV3Config> => {
    if (config?.rascunho) return candidate;
    const created = await createDraft(
      candidate.vigenciaInicio,
      candidate.justificativa,
    );
    return {
      ...created,
      vigenciaInicio: candidate.vigenciaInicio,
      justificativa: candidate.justificativa,
      coberturaMinima: candidate.coberturaMinima,
      pilaresMinimos: candidate.pilaresMinimos,
      exigePilarFidelizacao: candidate.exigePilarFidelizacao,
      metricas: candidate.metricas,
      metasSegmentadas: candidate.metasSegmentadas,
    };
  };

  const handleSave = async () => {
    const candidate = buildDraft();
    if (!candidate || !draftIsValid) return;
    try {
      const draft = await ensureEditableConfig(candidate);
      const saved = await saveDraft(draft);
      setWorkingConfig(cloneConfig(saved));
      setDraftIsDirty(false);
      setSimulationIsCurrent(false);
      toast.success('Ajustes salvos', 'Pesos e metas ficaram prontos para simulação.');
    } catch {
      toast.error('Não foi possível salvar', 'Confira os pesos, metas e estados dos pilares.');
    }
  };

  const handleSimulate = async () => {
    const candidate = buildDraft();
    if (!candidate || !draftIsValid) return;
    try {
      const draft = await ensureEditableConfig(candidate);
      const saved = draftIsDirty || !config?.rascunho ? await saveDraft(draft) : draft;
      setWorkingConfig(cloneConfig(saved));
      setDraftIsDirty(false);
      await simulate(saved.id, simulationMonth);
      setSimulationIsCurrent(true);
      toast.success('Simulação concluída', 'Nenhum snapshot ou consumidor produtivo foi alterado.');
    } catch {
      toast.error('Simulação indisponível', 'Confira se há snapshots em sombra para a competência.');
    }
  };

  const handleActivate = async () => {
    const draft = buildDraft();
    if (!draft || !canActivate) return;
    try {
      await apply(draft.id, justification.trim());
      toast.success('Configuração aplicada', `A nova regra passa a valer em ${newValidity}.`);
      setJustification('');
    } catch {
      toast.error('Aplicação bloqueada', 'A configuração precisa estar válida e simulada antes de aplicar.');
    }
  };

  const refreshAfterReconciliation = async () => {
    setSimulationIsCurrent(false);
    await refresh();
  };

  const keepEditing = () => {
    if (routeBlocker.state === 'blocked') routeBlocker.reset();
    pendingNavigationRef.current = null;
    setDiscardDialogOpen(false);
  };

  const discardAndContinue = () => {
    setDiscardDialogOpen(false);
    setDraftIsDirty(false);
    if (routeBlocker.state === 'blocked') {
      routeBlocker.proceed();
      return;
    }
    const target = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (!target) return;
    allowNavigationRef.current = true;
    target.click();
    queueMicrotask(() => {
      allowNavigationRef.current = false;
    });
  };

  return (
    <section
      ref={sectionRef}
      className="relative rounded-lg border border-cyan-500/20 bg-slate-950/30"
    >
      <header className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-300">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Health Score V3</h3>
              <Badge variant={draftIsDirty ? 'warning' : 'success'}>
                {draftIsDirty ? 'Ajustes não salvos' : 'Configuração vigente'}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Configuração versionada de pesos e metas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {workingConfig ? `Versão V${workingConfig.versao}` : 'Sem versão vigente'}
        </div>
      </header>

      {loading ? (
        <div className="flex h-36 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando configuração
        </div>
      ) : error ? (
        <div className="m-5 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : workingConfig ? (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 border-b border-slate-800 pb-5 md:grid-cols-[180px_1fr]">
            <div className="space-y-1 text-xs font-medium text-slate-300">
              Vigência da versão
              <DatePicker
                date={dateFromIso(newValidity)}
                onDateChange={(date) => {
                  setNewValidity(isoFromDate(date));
                  markDraftChanged();
                }}
                disabled={() => mutating}
                className="mt-1 h-10 rounded-md border-slate-700 bg-slate-900"
              />
            </div>
            <label className="space-y-1 text-xs font-medium text-slate-300">
              Justificativa da versão
              <Textarea
                value={justification}
                onChange={(event) => {
                  setJustification(event.target.value);
                  markDraftChanged();
                }}
                disabled={mutating}
                rows={2}
                className="mt-1 min-h-[40px] resize-none border-slate-700 bg-slate-900"
              />
            </label>
          </div>

          {editable && (
            <div className="sticky top-20 z-20 flex flex-col gap-3 rounded-md border border-slate-700 bg-slate-950/95 px-4 py-3 shadow-lg shadow-black/25 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${draftIsDirty ? 'bg-amber-400' : 'bg-emerald-400'}`}
                />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${draftIsDirty ? 'text-amber-200' : 'text-emerald-300'}`}>
                    {draftIsDirty
                      ? unsavedSegmentCount > 0
                        ? `${unsavedSegmentCount} ${unsavedSegmentCount === 1 ? 'alteração não salva' : 'alterações não salvas'}`
                        : 'Alterações não salvas'
                      : 'Ajuste salvo'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {draftIsDirty
                      ? 'Revise os estados das linhas e salve o conjunto quando terminar.'
                      : 'A configuração exibida corresponde à última versão salva.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleUndo}
                  disabled={mutating || !draftIsDirty}
                >
                  <Undo2 />
                  Desfazer
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRestoreActive}
                  disabled={mutating || !config?.ativa}
                >
                  <RotateCcw />
                  Restaurar vigente
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={mutating || !draftIsDirty || !draftIsValid}
                  className="h-10 shrink-0"
                >
                  {mutating ? <Loader2 className="animate-spin" /> : <Save />}
                  Salvar ajuste
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Pesos dos pilares</p>
            </div>
            <Badge variant={weightsAreValid ? 'success' : 'error'}>
              {totalWeight} pontos {weightsAreValid ? '• normalizados para 100% na nota' : '• revisar distribuição'}
            </Badge>
          </div>

          <div className="grid border-y border-slate-800 md:grid-cols-2 xl:grid-cols-3">
            {workingConfig.metricas.filter((metric) => (
              HEALTH_SCORE_V3_SCORING_METRICS.includes(
                metric.metrica as (typeof HEALTH_SCORE_V3_SCORING_METRICS)[number],
              )
            )).map((metric) => {
              const visual = METRIC_UI[metric.metrica];
              const Icon = visual.icon;
              return (
                <label
                  key={metric.metrica}
                  className="min-h-[92px] space-y-3 border-b border-slate-800 px-3 py-3 md:odd:border-r xl:[&:nth-child(odd)]:border-r-0 xl:[&:not(:nth-child(3n))]:border-r xl:[&:nth-last-child(-n+3)]:border-b-0"
                >
                  <span className="flex min-w-0 items-center justify-between gap-3 text-xs font-medium text-slate-300">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
                      <span className="break-words">{visual.label}</span>
                    </span>
                    <strong className="shrink-0 text-cyan-300">{metric.peso}%</strong>
                  </span>
                  <Slider
                    aria-label={`Peso no score - ${visual.label}`}
                    min={1}
                    max={100}
                    step={1}
                    value={[metric.peso]}
                    disabled={mutating}
                    onValueChange={([value]) => updateMetric(metric.metrica, { peso: value })}
                  />
                </label>
              );
            })}
          </div>

          <div className="space-y-3 rounded-md border border-violet-500/20 bg-violet-500/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-300" />
                <p className="text-sm font-semibold text-slate-100">Diagnósticos</p>
              </div>
              <Badge variant="outline" className="border-violet-500/30 text-violet-200">
                Não altera a nota
              </Badge>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              A carteira do professor continua visível para diagnosticar carga, maturação,
              concentração e oportunidade de distribuição. A referência permanece segmentada
              por unidade, curso e modalidade, mas fica fora dos sliders de peso.
            </p>
          </div>

          <div className="space-y-4 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Critérios para comparação</p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                  Estes critérios definem quando o desempenho observado tem base suficiente para
                  comparação. Eles não mudam a nota calculada e não alteram ciclos já fechados.
                </p>
              </div>
              <Badge variant={comparisonCriteriaAreValid ? 'success' : 'error'}>
                {comparisonCriteriaAreValid ? 'Critérios válidos' : 'Revisar critérios'}
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium text-slate-300">
                Cobertura mínima
                <div className="relative mt-1">
                  <Input
                    aria-label="Cobertura mínima para comparação"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={workingConfig.coberturaMinima}
                    disabled={mutating}
                    onChange={(event) => {
                      setWorkingConfig((current) => current ? {
                        ...current,
                        coberturaMinima: Number(event.target.value),
                      } : current);
                      markDraftChanged();
                    }}
                    className="border-slate-700 bg-slate-900 pr-10"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">%</span>
                </div>
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-300">
                Pilares mínimos
                <Input
                  aria-label="Pilares mínimos para comparação"
                  type="number"
                  min={1}
                  max={HEALTH_SCORE_V3_SCORING_METRICS.length}
                  step={1}
                  value={workingConfig.pilaresMinimos}
                  disabled={mutating}
                  onChange={(event) => {
                    setWorkingConfig((current) => current ? {
                      ...current,
                      pilaresMinimos: Number(event.target.value),
                    } : current);
                    markDraftChanged();
                  }}
                  className="mt-1 border-slate-700 bg-slate-900"
                />
              </label>

              <div className="flex min-h-16 items-center justify-between gap-4 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-slate-200">Retenção ou permanência obrigatória</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Evita comparação sem evidência de fidelização.
                  </p>
                </div>
                <Switch
                  aria-label="Exigir retenção ou permanência"
                  checked={workingConfig.exigePilarFidelizacao}
                  disabled={mutating}
                  onCheckedChange={(checked) => {
                    setWorkingConfig((current) => current ? {
                      ...current,
                      exigePilarFidelizacao: checked,
                    } : current);
                    markDraftChanged();
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] font-semibold uppercase text-slate-500">
              Metas globais remanescentes
            </p>
            <Badge variant={hasRequiredTargets ? 'success' : 'error'}>
              {hasRequiredTargets ? 'Estados válidos' : 'Revisar metas'}
            </Badge>
          </div>

          <div className="divide-y divide-slate-800 border-y border-slate-800">
            {workingConfig.metricas.filter((metric) => (
              GLOBAL_TARGET_METRICS.includes(metric.metrica)
            )).map((metric) => {
              const visual = METRIC_UI[metric.metrica];
              const Icon = visual.icon;
              return (
                <div
                  key={metric.metrica}
                  className="grid min-h-[96px] items-center gap-4 py-3 lg:grid-cols-[minmax(220px,1fr)_180px_190px]"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-cyan-300" />
                    <div>
                      <p className="text-sm font-medium text-slate-100">{visual.label}</p>
                      <p className="text-xs text-slate-500">{metric.metaStatus === 'aprovada' ? 'Meta homologada' : META_STATUS_LABELS[metric.metaStatus]}</p>
                    </div>
                  </div>

                  <label className="space-y-1 text-xs font-medium text-slate-300">
                    Meta de desempenho
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min={0.01}
                        max={visual.max}
                        step={visual.step}
                        value={metric.meta ?? ''}
                        disabled={mutating}
                        onChange={(event) => {
                          const value = event.target.value === '' ? null : Number(event.target.value);
                          updateMetric(metric.metrica, {
                            meta: value,
                            metaStatus: value === null ? 'em_calibracao' : 'aprovada',
                          });
                        }}
                        className="border-slate-700 bg-slate-900 pr-14"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">
                        {visual.unit}
                      </span>
                    </div>
                  </label>

                  <div className="space-y-1 text-xs font-medium text-slate-300">
                    Estado da meta
                    <Select
                      value={metric.metaStatus}
                      disabled={mutating || metric.meta !== null}
                      onValueChange={(value) => updateMetric(metric.metrica, {
                        metaStatus: value as HealthScoreV3MetaStatus,
                      })}
                    >
                      <SelectTrigger className="mt-1 rounded-md border-slate-700 bg-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {metric.meta !== null && <SelectItem value="aprovada">Aprovada</SelectItem>}
                        {NULL_META_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>{META_STATUS_LABELS[status]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-slate-800 border-y border-slate-800">
            {workingConfig.metricas.filter((metric) => (
              SEGMENTED_TARGET_METRICS.includes(metric.metrica)
            )).map((metric) => {
              const visual = METRIC_UI[metric.metrica];
              const Icon = visual.icon;
              return (
                <div
                  key={metric.metrica}
                  className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-100">
                    <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
                    <span className="break-words">{visual.label}</span>
                  </span>
                  <Badge variant="outline" className="border-cyan-500/30 text-cyan-300">
                    Segmentada por unidade/curso/modalidade
                  </Badge>
                </div>
              );
            })}
          </div>

          <section className="space-y-3 border-t border-slate-800 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-[11px] font-semibold uppercase text-slate-500">
                Metas por unidade, curso e modalidade
              </h4>
              <Badge variant={segmentTargetsAreValid ? 'success' : 'error'}>
                {segmentTargetsAreValid ? 'Validação local válida' : 'Há metas inválidas'}
              </Badge>
            </div>
            <HealthScoreV3MetasSegmentadas
              metas={workingSegmentGoals}
              metasVersionadas={workingConfig.metasSegmentadas}
              versao={workingConfig.versao}
              pendencias={config?.pendencias || {
                segmentosObservadosSemRegra: [],
                atribuicoesSemRegra: [],
                atribuicoesZeroCarteira: [],
                divergenciasModalidade: [],
              }}
              superlotacoes={simulationIsCurrent ? simulation?.superlotacoes : []}
              superlotacaoDisponivel={Boolean(
                simulationIsCurrent
                && simulation
                && simulation.configId === workingConfig.id
              )}
              versionState={config?.rascunho ? 'draft' : 'active'}
              editable={editable}
              disabled={mutating}
              onMetasChange={updateSegmentGoals}
            />
          </section>

          <ProfessorCursoModalidadeReconciliacao
            disabled={mutating}
            onSaved={refreshAfterReconciliation}
          />

          {editable && (
            <div className="space-y-4 border-t border-slate-800 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Simulação</p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="w-full space-y-1 text-xs font-medium text-slate-300 md:max-w-[220px]">
                  Competência da simulação
                  <DatePicker
                    date={dateFromIso(simulationMonth)}
                    onDateChange={(date) => {
                      setSimulationMonth(isoFromDate(date));
                      setSimulationIsCurrent(false);
                    }}
                    disabled={() => mutating}
                    className="mt-1 h-10 rounded-md border-slate-700 bg-slate-900"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleSimulate}
                    disabled={mutating || !draftIsValid}
                  >
                    <Beaker />
                    Simular
                  </Button>
                  <Button onClick={handleActivate} disabled={mutating || !canActivate}>
                    <CheckCircle2 />
                    Aplicar configuração
                  </Button>
                </div>
              </div>

              {simulationIsCurrent && simulation && (
                <div className="space-y-3">
                  <div className="rounded-md border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-100">
                    Simulação parcial - não oficial. Nenhum fechamento ou ranking foi alterado.
                  </div>
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-800 bg-slate-800 sm:grid-cols-6">
                    {[
                      ['Professores', simulation.total],
                      ['Saudáveis', simulation.saudaveis],
                      ['Atenção', simulation.atencao],
                      ['Críticos', simulation.criticos],
                      ['Sem base', simulation.semBase],
                      ['Média', simulation.scoreMedio ?? '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-slate-950 px-3 py-3 text-center">
                        <p className="text-lg font-semibold text-white">{value}</p>
                        <p className="text-[11px] text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 text-sm text-slate-400">Nenhuma configuração V3 foi encontrada.</div>
      )}
      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent className="rounded-lg border-slate-700 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações locais?</AlertDialogTitle>
            <AlertDialogDescription>
              As mudanças deste ajuste ainda não foram salvas. Você pode continuar editando ou sair sem gravá-las.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={keepEditing}>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndContinue}>Descartar e sair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
