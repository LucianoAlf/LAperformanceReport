import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleOff,
  History,
  Loader2,
  RefreshCw,
  Save,
  Undo2,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const DECISION_LABEL: Record<PendingAction, string> = {
  manter: 'Confirmar vínculo',
  revisar: 'Corrigir modalidade',
  encerrar: 'Desativar vínculo',
};

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
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingActions, setPendingActions] = useState<ProfessorCursoModalidadeReconciliacaoAction[]>([]);
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
    setPendingActions(actions);
    setConfirmOpen(true);
  };

  const confirmSave = async () => {
    if (selectedProfessorId === null || pendingActions.length === 0) return;
    try {
      await save(selectedProfessorId, pendingActions, justification);
      setDecisions({});
      setPendingActions([]);
      setJustification('');
      setLocalError(null);
      setConfirmOpen(false);
      await onSaved();
    } catch {
      // O hook preserva a mensagem canônica da RPC.
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
    <section className="border-t border-slate-800 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-cyan-300" />
            <h4 className="text-sm font-semibold text-slate-100">Excecoes de vinculos Emusys</h4>
            <Badge variant={visibleRows.length > 0 ? 'warning' : 'success'}>
              {visibleRows.length}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Revise somente conflitos que o catálogo oficial não resolveu automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Atualizar fila de exceções"
            disabled={disabled || loading || saving}
            onClick={() => void refresh().catch(() => undefined)}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Atualizar
          </Button>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              {open ? 'Recolher' : 'Revisar exceções'}
              <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent className="space-y-4 pt-4">

      <div className="grid gap-3 sm:grid-cols-3">
        <Select value={unitFilter || 'todas'} onValueChange={(value) => setUnitFilter(value === 'todas' ? '' : value)}>
          <SelectTrigger aria-label="Filtrar por unidade" className="rounded-md border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as unidades</SelectItem>
            {units.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={professorFilter || 'nenhum'} onValueChange={(value) => setProfessorFilter(value === 'nenhum' ? '' : value)}>
          <SelectTrigger aria-label="Filtrar por professor" className="rounded-md border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhum">Selecione um professor</SelectItem>
            {professors.map(([id, name]) => <SelectItem key={id} value={String(id)}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger aria-label="Filtrar por estado" className="rounded-md border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pendentes">Somente pendências</SelectItem>
            <SelectItem value="todos">Todos os estados</SelectItem>
            {states.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}
          </SelectContent>
        </Select>
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
                    <Select
                      value={decision?.unidadeId || unitFilter || 'nenhuma'}
                      disabled={!canDecide}
                      onValueChange={(value) => updateDecision(row, {
                        action: 'revisar',
                        unidadeId: value === 'nenhuma' ? '' : value,
                      })}
                    >
                      <SelectTrigger aria-label={`Unidade de ${row.professorNome} - ${row.cursoNome}`} className="h-8 rounded-md border-slate-700 bg-slate-900 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhuma">Escolher unidade</SelectItem>
                        {units.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  <Select
                    value={decision?.modalidade || row.modalidade || 'nenhuma'}
                    disabled={!canDecide}
                    onValueChange={(value) => updateDecision(row, {
                      action: 'revisar',
                      modalidade: value === 'nenhuma' ? '' : value as ProfessorCursoModalidade,
                    })}
                  >
                    <SelectTrigger aria-label={`Modalidade de ${row.professorNome} - ${row.cursoNome}`} className="h-8 rounded-md border-slate-700 bg-slate-900 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Escolher modalidade</SelectItem>
                      <SelectItem value="turma">Turma</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
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
                        <Check /> Confirmar vínculo
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={decision?.action === 'revisar' ? 'default' : 'outline'}
                      disabled={!canDecide}
                      onClick={() => updateDecision(row, { action: 'revisar' })}
                    >
                      <RefreshCw /> Corrigir modalidade
                    </Button>
                    {row.atribuicaoId && row.estado !== 'historico' && (
                      <Button
                        type="button"
                        size="sm"
                        variant={decision?.action === 'encerrar' ? 'destructive' : 'outline'}
                        disabled={!canDecide}
                        onClick={() => updateDecision(row, { action: 'encerrar' })}
                      >
                        <CircleOff /> Desativar vínculo
                      </Button>
                    )}
                    {decision && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => clearDecision(row)}
                        className="text-slate-400 hover:text-slate-100"
                      >
                        <Undo2 /> Desfazer escolha
                      </Button>
                    )}
                  </div>
                  {decision && (
                    <p className="text-[10px] text-cyan-300">
                      Ação preparada: {DECISION_LABEL[decision.action]}
                    </p>
                  )}
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
      </CollapsibleContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-lg border-slate-700 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar decisões?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingActions.length} decisão(ões) serão registradas para o professor selecionado, com trilha de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmSave()}>
              Confirmar registro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
    </Collapsible>
  );
}
