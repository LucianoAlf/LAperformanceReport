import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  History,
  Loader2,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useProfessorCursoModalidadeReconciliacao,
  type ProfessorCursoModalidade,
  type ProfessorCursoModalidadeReconciliacaoAction,
  type ProfessorCursoModalidadeReconciliacaoRow,
} from '@/hooks/useProfessorCursoModalidadeReconciliacao';

interface ProfessorCursoModalidadeReconciliacaoProps {
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
}

type PendingAction = 'manter' | 'encerrar' | 'revisar';

interface RowDecision {
  action: PendingAction;
  unidadeId: string;
  modalidade: ProfessorCursoModalidade | '';
}

function rowKey(row: ProfessorCursoModalidadeReconciliacaoRow): string {
  return [
    row.atribuicaoId || 'evidencia',
    row.professorId,
    row.unidadeId || 'sem-unidade',
    row.cursoId,
    row.modalidade || 'sem-modalidade',
    row.estado,
  ].join('|');
}

function hasZeroPortfolio(row: ProfessorCursoModalidadeReconciliacaoRow): boolean {
  const evidence = row.evidencias;
  if (evidence.sem_evidencia_atual === true) return true;
  return [
    evidence.carteira_pessoas,
    evidence.alunos,
    evidence.qtd_alunos,
    evidence.ocupacoes,
  ].some((value) => typeof value === 'number' && value === 0);
}

function sourceLabel(row: ProfessorCursoModalidadeReconciliacaoRow): string {
  return row.estado === 'pista_professores_cursos_sem_escopo'
    ? 'Pista global do cadastro legado'
    : row.fonte;
}

function confidenceVariant(confidence: string): 'success' | 'warning' | 'error' | 'outline' {
  if (confidence === 'alta' || confidence === 'revisado_aprovado') return 'success';
  if (confidence === 'media') return 'warning';
  if (confidence === 'baixa') return 'error';
  return 'outline';
}

export function ProfessorCursoModalidadeReconciliacao({
  disabled = false,
  onSaved,
}: ProfessorCursoModalidadeReconciliacaoProps) {
  const { rows, loading, saving, error, refresh, save } =
    useProfessorCursoModalidadeReconciliacao();
  const [unitFilter, setUnitFilter] = useState('');
  const [professorFilter, setProfessorFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('pendentes');
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [justification, setJustification] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const selectedProfessorId = professorFilter ? Number(professorFilter) : null;

  const units = useMemo(() => Array.from(new Map(
    rows
      .filter((row) => row.unidadeId && row.unidadeNome)
      .map((row) => [row.unidadeId as string, row.unidadeNome as string]),
  ).entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [rows]);

  const professors = useMemo(() => Array.from(new Map(
    rows.map((row) => [row.professorId, row.professorNome]),
  ).entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [rows]);

  const states = useMemo(() => Array.from(new Set(rows.map((row) => row.estado))).sort(), [rows]);

  const visibleRows = useMemo(() => rows.filter((row) => {
    const unitMatches = !unitFilter || row.unidadeId === unitFilter || row.unidadeId === null;
    const professorMatches = !selectedProfessorId || row.professorId === selectedProfessorId;
    const stateMatches = stateFilter === 'todos'
      || (stateFilter === 'pendentes'
        ? !['resolvido', 'historico'].includes(row.estado)
        : row.estado === stateFilter);
    return unitMatches && professorMatches && stateMatches;
  }), [rows, selectedProfessorId, stateFilter, unitFilter]);

  useEffect(() => {
    setDecisions({});
    setLocalError(null);
  }, [professorFilter]);

  const updateDecision = (
    row: ProfessorCursoModalidadeReconciliacaoRow,
    patch: Partial<RowDecision>,
  ) => {
    const key = rowKey(row);
    setDecisions((current) => ({
      ...current,
      [key]: {
        action: current[key]?.action || (row.atribuicaoId ? 'manter' : 'revisar'),
        unidadeId: current[key]?.unidadeId || row.unidadeId || unitFilter,
        modalidade: current[key]?.modalidade || row.modalidade || '',
        ...patch,
      },
    }));
    setLocalError(null);
  };

  const clearDecision = (row: ProfessorCursoModalidadeReconciliacaoRow) => {
    const key = rowKey(row);
    setDecisions((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const buildActions = (): ProfessorCursoModalidadeReconciliacaoAction[] | null => {
    if (!selectedProfessorId) {
      setLocalError('Selecione um professor para registrar uma conciliação por vez.');
      return null;
    }

    const selectedRows = rows.filter((row) => (
      row.professorId === selectedProfessorId && decisions[rowKey(row)]
    ));
    if (!selectedRows.length) {
      setLocalError('Marque ao menos uma decisão para o professor selecionado.');
      return null;
    }

    const actions: ProfessorCursoModalidadeReconciliacaoAction[] = [];
    for (const row of selectedRows) {
      const decision = decisions[rowKey(row)];
      if (decision.action === 'manter' || decision.action === 'encerrar') {
        if (!row.atribuicaoId) {
          setLocalError('Uma evidência ainda sem vínculo deve ser revisada, não mantida ou encerrada.');
          return null;
        }
        actions.push({
          acao: decision.action,
          atribuicao_id: row.atribuicaoId,
        });
        continue;
      }

      if (!decision.unidadeId || !decision.modalidade) {
        setLocalError(`Informe unidade e modalidade para ${row.cursoNome}.`);
        return null;
      }
      actions.push({
        acao: 'revisar',
        ...(row.atribuicaoId ? { atribuicao_id: row.atribuicaoId } : {}),
        unidade_id: decision.unidadeId,
        curso_id: row.cursoId,
        modalidade: decision.modalidade,
        ...(!row.atribuicaoId && row.vigenciaInicio
          ? { vigencia_inicio: row.vigenciaInicio }
          : {}),
      });
    }
    return actions;
  };

  const handleSave = async () => {
    const actions = buildActions();
    if (!actions || selectedProfessorId === null) return;
    if (justification.trim().length < 10) {
      setLocalError('A justificativa deve explicar a decisão em pelo menos 10 caracteres.');
      return;
    }
    if (!window.confirm(`Registrar ${actions.length} decisão(ões) para este professor?`)) return;

    try {
      await save(selectedProfessorId, actions, justification);
      setDecisions({});
      setJustification('');
      setLocalError(null);
      await onSaved();
    } catch {
      // O hook preserva a mensagem canônica da RPC.
    }
  };

  return (
    <section className="space-y-4 border-t border-slate-800 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-cyan-300" />
            <h4 className="text-sm font-semibold text-slate-100">Conciliação de vínculos pedagógicos</h4>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Confirme unidade, curso e modalidade sem alterar o cadastro legado do professor.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Atualizar fila de conciliação"
          disabled={disabled || loading || saving}
          onClick={() => void refresh().catch(() => undefined)}
        >
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <select
          aria-label="Filtrar por unidade"
          value={unitFilter}
          onChange={(event) => setUnitFilter(event.target.value)}
          className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
        >
          <option value="">Todas as unidades</option>
          {units.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select
          aria-label="Filtrar por professor"
          value={professorFilter}
          onChange={(event) => setProfessorFilter(event.target.value)}
          className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
        >
          <option value="">Selecione um professor</option>
          {professors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select
          aria-label="Filtrar por estado"
          value={stateFilter}
          onChange={(event) => setStateFilter(event.target.value)}
          className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
        >
          <option value="pendentes">Somente pendências</option>
          <option value="todos">Todos os estados</option>
          {states.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </div>

      {!selectedProfessorId && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Selecione um professor para habilitar decisões. Cursos com carteira vazia continuam visíveis.
        </div>
      )}

      {(error || localError) && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {localError || error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-slate-800">
        <div className="min-w-[980px] divide-y divide-slate-800">
          <div className="grid grid-cols-[minmax(180px,1.4fr)_minmax(160px,1fr)_110px_140px_minmax(260px,1.8fr)] gap-3 bg-slate-900/80 px-3 py-2 text-[10px] font-semibold uppercase text-slate-500">
            <span>Professor / curso</span>
            <span>Unidade / modalidade</span>
            <span>Fonte</span>
            <span>Confiança</span>
            <span>Decisão</span>
          </div>

          {loading ? (
            <div className="flex h-24 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando vínculos
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Nenhum vínculo encontrado para os filtros.
            </div>
          ) : visibleRows.map((row) => {
            const key = rowKey(row);
            const decision = decisions[key];
            const canDecide = selectedProfessorId === row.professorId
              && row.estado !== 'historico'
              && !disabled
              && !saving;
            const isGlobalClue = row.estado === 'pista_professores_cursos_sem_escopo';

            return (
              <div
                key={key}
                className="grid grid-cols-[minmax(180px,1.4fr)_minmax(160px,1fr)_110px_140px_minmax(260px,1.8fr)] gap-3 px-3 py-3 text-xs text-slate-300"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{row.professorNome}</p>
                  <p className="mt-0.5 break-words text-slate-400">{row.cursoNome}</p>
                  {hasZeroPortfolio(row) && (
                    <Badge variant="outline" className="mt-1 border-slate-600 text-slate-400">
                      Carteira vazia: zero alunos
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {row.unidadeId ? (
                    <p>{row.unidadeNome}</p>
                  ) : (
                    <select
                      aria-label={`Unidade de ${row.professorNome} - ${row.cursoNome}`}
                      value={decision?.unidadeId || unitFilter}
                      disabled={!canDecide}
                      onChange={(event) => updateDecision(row, {
                        action: 'revisar',
                        unidadeId: event.target.value,
                      })}
                      className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2"
                    >
                      <option value="">Escolher unidade</option>
                      {units.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  )}
                  <select
                    aria-label={`Modalidade de ${row.professorNome} - ${row.cursoNome}`}
                    value={decision?.modalidade || row.modalidade || ''}
                    disabled={!canDecide}
                    onChange={(event) => updateDecision(row, {
                      action: 'revisar',
                      modalidade: event.target.value as ProfessorCursoModalidade,
                    })}
                    className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2"
                  >
                    <option value="">Escolher modalidade</option>
                    <option value="turma">Turma</option>
                    <option value="individual">Individual</option>
                  </select>
                </div>

                <div>
                  <p className="break-words">{sourceLabel(row)}</p>
                  {isGlobalClue && <p className="mt-1 text-[10px] text-amber-300">Somente pista</p>}
                </div>

                <div className="space-y-1">
                  <Badge variant={confidenceVariant(row.confianca)}>{row.confianca}</Badge>
                  <p className="break-words text-[10px] text-slate-500">{row.estado}</p>
                  <details>
                    <summary className="cursor-pointer text-[10px] text-cyan-400">
                      Evidências <ChevronDown className="inline h-3 w-3" />
                    </summary>
                    <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all text-[9px] text-slate-500">
                      {JSON.stringify(row.evidencias, null, 2)}
                    </pre>
                  </details>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {row.atribuicaoId && (
                      <Button
                        type="button"
                        size="sm"
                        variant={decision?.action === 'manter' ? 'default' : 'outline'}
                        disabled={!canDecide}
                        onClick={() => updateDecision(row, { action: 'manter' })}
                      >
                        <Check /> Manter
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={decision?.action === 'revisar' ? 'default' : 'outline'}
                      disabled={!canDecide}
                      onClick={() => updateDecision(row, { action: 'revisar' })}
                    >
                      <RefreshCw /> Revisar
                    </Button>
                    {row.atribuicaoId && row.estado !== 'historico' && (
                      <Button
                        type="button"
                        size="sm"
                        variant={decision?.action === 'encerrar' ? 'destructive' : 'outline'}
                        disabled={!canDecide}
                        onClick={() => updateDecision(row, { action: 'encerrar' })}
                      >
                        <X /> Encerrar
                      </Button>
                    )}
                    {decision && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Limpar decisão"
                        onClick={() => clearDecision(row)}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  {decision && <p className="text-[10px] text-cyan-300">Decisão preparada: {decision.action}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="space-y-1 text-xs font-medium text-slate-300">
          Justificativa da conciliação
          <Textarea
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            disabled={disabled || saving || !selectedProfessorId}
            rows={2}
            placeholder="Registre a evidência usada e por que este vínculo foi mantido, revisado ou encerrado."
            className="mt-1 min-h-[56px] resize-none border-slate-700 bg-slate-900"
          />
        </label>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={disabled || saving || !selectedProfessorId || Object.keys(decisions).length === 0}
          className="h-10"
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Registrar decisões
        </Button>
      </div>
    </section>
  );
}
