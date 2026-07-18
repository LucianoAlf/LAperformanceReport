import { useEffect, useMemo, useState } from 'react';
import { format, addMonths, startOfMonth } from 'date-fns';
import {
  Activity,
  Beaker,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  Loader2,
  LockKeyhole,
  Plus,
  Save,
  Settings2,
  Target,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { useHealthScoreProfessorV3Config } from '@/hooks/useHealthScoreProfessorV3Config';
import type {
  HealthMetricKeyV3,
  HealthScoreV3Config,
  HealthScoreV3MetaStatus,
  HealthScoreV3MetricConfig,
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
  rascunho: 'Rascunho',
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

function nextMonthStart() {
  return format(startOfMonth(addMonths(new Date(), 1)), 'yyyy-MM-dd');
}

function currentMonthStart() {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd');
}

function cloneConfig(config: HealthScoreV3Config | null): HealthScoreV3Config | null {
  if (!config) return null;
  return {
    ...config,
    metricas: config.metricas.map((metric) => ({
      ...metric,
      parametros: { ...metric.parametros },
    })),
  };
}

export function HealthScoreV3Config() {
  const toast = useToast();
  const {
    config,
    simulation,
    loading,
    mutating,
    error,
    createDraft,
    saveDraft,
    simulate,
    activate,
  } = useHealthScoreProfessorV3Config();
  const [workingConfig, setWorkingConfig] = useState<HealthScoreV3Config | null>(null);
  const [newValidity, setNewValidity] = useState(nextMonthStart);
  const [justification, setJustification] = useState('');
  const [simulationMonth, setSimulationMonth] = useState(currentMonthStart);
  const [simulationIsCurrent, setSimulationIsCurrent] = useState(false);

  useEffect(() => {
    const source = config?.rascunho || config?.ativa || null;
    setWorkingConfig(cloneConfig(source));
    if (config?.rascunho) {
      setJustification(config.rascunho.justificativa);
      setNewValidity(config.rascunho.vigenciaInicio);
    }
    setSimulationIsCurrent(false);
  }, [config]);

  const editable = Boolean(config?.rascunho && workingConfig?.id === config.rascunho.id);
  const totalWeight = useMemo(
    () => workingConfig?.metricas.reduce((total, metric) => total + metric.peso, 0) || 0,
    [workingConfig],
  );
  const weightsAreValid = totalWeight === 100;
  const hasRequiredTargets = Boolean(workingConfig?.metricas.every((metric) => (
    ['retencao', 'presenca'].includes(metric.metrica)
      ? metric.meta !== null || metric.metaStatus !== 'aprovada'
      : metric.meta !== null && metric.metaStatus === 'aprovada'
  )));
  const canActivate = editable
    && weightsAreValid
    && hasRequiredTargets
    && justification.trim().length >= 8
    && simulationIsCurrent;

  const updateMetric = (key: HealthMetricKeyV3, change: Partial<HealthScoreV3MetricConfig>) => {
    if (!editable) return;
    setWorkingConfig((current) => current ? {
      ...current,
      metricas: current.metricas.map((metric) => (
        metric.metrica === key ? { ...metric, ...change } : metric
      )),
    } : current);
    setSimulationIsCurrent(false);
  };

  const handleCreateDraft = async () => {
    if (justification.trim().length < 8) {
      toast.error('Justificativa obrigatória', 'Descreva por que uma nova versão será criada.');
      return;
    }
    try {
      await createDraft(newValidity, justification.trim());
      toast.success('Rascunho criado', 'A versão ativa foi clonada sem alterar competências fechadas.');
    } catch {
      toast.error('Não foi possível criar', 'Revise a vigência e tente novamente.');
    }
  };

  const buildDraft = (): HealthScoreV3Config | null => {
    if (!workingConfig || !editable) return null;
    return {
      ...workingConfig,
      vigenciaInicio: newValidity,
      justificativa: justification.trim(),
    };
  };

  const handleSave = async () => {
    const draft = buildDraft();
    if (!draft || !weightsAreValid) return;
    try {
      const saved = await saveDraft(draft);
      setWorkingConfig(cloneConfig(saved));
      toast.success('Rascunho salvo', 'Pesos e metas ficaram registrados nesta versão.');
    } catch {
      toast.error('Não foi possível salvar', 'Confira os pesos, metas e estados dos pilares.');
    }
  };

  const handleSimulate = async () => {
    const draft = buildDraft();
    if (!draft || !weightsAreValid) return;
    try {
      const saved = await saveDraft(draft);
      setWorkingConfig(cloneConfig(saved));
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
      await activate(draft.id, justification.trim());
      toast.success('Versão ativada', `A nova regra passa a valer em ${newValidity}.`);
      setJustification('');
    } catch {
      toast.error('Ativação bloqueada', 'A versão precisa estar válida e simulada antes da ativação.');
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-cyan-500/20 bg-slate-950/30">
      <header className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-300">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Health Score V3</h3>
              <Badge variant="warning">Sombra</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Configuração versionada de pesos e metas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <LockKeyhole className="h-4 w-4" />
          {config?.ativa ? `Versão ativa ${config.ativa.versao}` : 'Sem versão ativa'}
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
            <label className="space-y-1 text-xs font-medium text-slate-300">
              Vigência da versão
              <Input
                type="date"
                value={editable ? newValidity : workingConfig.vigenciaInicio}
                onChange={(event) => {
                  setNewValidity(event.target.value);
                  setSimulationIsCurrent(false);
                }}
                disabled={!editable || mutating}
                className="mt-1 border-slate-700 bg-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-300">
              Justificativa da versão
              <Textarea
                value={editable ? justification : workingConfig.justificativa}
                onChange={(event) => {
                  setJustification(event.target.value);
                  setSimulationIsCurrent(false);
                }}
                disabled={!editable || mutating}
                rows={2}
                className="mt-1 min-h-[40px] resize-none border-slate-700 bg-slate-900"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Pesos dos pilares</p>
              <p className="text-xs text-slate-400">Peso no score e meta são controles independentes.</p>
            </div>
            <Badge variant={weightsAreValid ? 'success' : 'error'}>
              Total {totalWeight}% {weightsAreValid ? 'válido' : 'precisa fechar em 100%'}
            </Badge>
          </div>

          <div className="divide-y divide-slate-800 border-y border-slate-800">
            {workingConfig.metricas.map((metric) => {
              const visual = METRIC_UI[metric.metrica];
              const Icon = visual.icon;
              return (
                <div
                  key={metric.metrica}
                  className="grid min-h-[112px] items-center gap-4 py-4 lg:grid-cols-[minmax(190px,1fr)_minmax(240px,2fr)_180px_190px]"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-cyan-300" />
                    <div>
                      <p className="text-sm font-medium text-slate-100">{visual.label}</p>
                      <p className="text-xs text-slate-500">{metric.metaStatus === 'aprovada' ? 'Meta homologada' : META_STATUS_LABELS[metric.metaStatus]}</p>
                    </div>
                  </div>

                  <label className="space-y-2 text-xs font-medium text-slate-300">
                    <span className="flex justify-between">
                      Peso no score
                      <strong className="text-cyan-300">{metric.peso}%</strong>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={metric.peso}
                      disabled={!editable || mutating}
                      onChange={(event) => updateMetric(metric.metrica, { peso: Number(event.target.value) })}
                      className="h-2 w-full cursor-pointer accent-cyan-500 disabled:cursor-not-allowed"
                    />
                  </label>

                  <label className="space-y-1 text-xs font-medium text-slate-300">
                    Meta de desempenho
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min={0.01}
                        max={visual.max}
                        step={visual.step}
                        value={metric.meta ?? ''}
                        disabled={!editable || mutating}
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

                  <label className="space-y-1 text-xs font-medium text-slate-300">
                    Estado da meta
                    <select
                      value={metric.meta === null ? metric.metaStatus : 'aprovada'}
                      disabled={!editable || mutating || metric.meta !== null}
                      onChange={(event) => updateMetric(metric.metrica, {
                        metaStatus: event.target.value as HealthScoreV3MetaStatus,
                      })}
                      className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-cyan-500 disabled:opacity-60"
                    >
                      {metric.meta !== null && <option value="aprovada">Aprovada</option>}
                      {NULL_META_STATUSES.map((status) => (
                        <option key={status} value={status}>{META_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>

          {!editable ? (
            <div className="grid gap-3 border-t border-slate-800 pt-5 md:grid-cols-[180px_1fr_auto] md:items-end">
              <label className="space-y-1 text-xs font-medium text-slate-300">
                Nova vigência
                <Input
                  type="date"
                  value={newValidity}
                  onChange={(event) => setNewValidity(event.target.value)}
                  className="mt-1 border-slate-700 bg-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-300">
                Motivo da nova versão
                <Input
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  placeholder="Ex.: ajuste de metas homologado para o próximo ciclo"
                  className="mt-1 border-slate-700 bg-slate-900"
                />
              </label>
              <Button onClick={handleCreateDraft} disabled={mutating} className="h-10">
                {mutating ? <Loader2 className="animate-spin" /> : <Plus />}
                Criar rascunho
              </Button>
            </div>
          ) : (
            <div className="space-y-4 border-t border-slate-800 pt-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <label className="w-full space-y-1 text-xs font-medium text-slate-300 md:max-w-[220px]">
                  Competência da simulação
                  <Input
                    type="date"
                    value={simulationMonth}
                    onChange={(event) => {
                      setSimulationMonth(event.target.value);
                      setSimulationIsCurrent(false);
                    }}
                    disabled={mutating}
                    className="mt-1 border-slate-700 bg-slate-900"
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={handleSave} disabled={mutating || !weightsAreValid}>
                    <Save />
                    Salvar rascunho
                  </Button>
                  <Button variant="secondary" onClick={handleSimulate} disabled={mutating || !weightsAreValid}>
                    <Beaker />
                    Simular impacto
                  </Button>
                  <Button onClick={handleActivate} disabled={mutating || !canActivate}>
                    <CheckCircle2 />
                    Ativar versão
                  </Button>
                </div>
              </div>

              {simulation && (
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
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 text-sm text-slate-400">Nenhuma configuração V3 foi encontrada.</div>
      )}
    </section>
  );
}
