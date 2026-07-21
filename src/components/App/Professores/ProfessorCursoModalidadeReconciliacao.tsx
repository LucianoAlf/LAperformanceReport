import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CloudDownload,
  FileSearch,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import {
  useProfessorCursoModalidadeReconciliacao,
  type ProfessorCursoModalidadeExcecaoRow,
} from '@/hooks/useProfessorCursoModalidadeReconciliacao';

interface ProfessorCursoModalidadeReconciliacaoProps {
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
}

const TYPE_LABELS: Record<string, string> = {
  disciplina_sem_depara: 'Disciplina sem curso local',
  professor_sem_identidade_local: 'Professor sem identidade local',
  professor_inativo_na_unidade: 'Professor inativo na unidade',
  jornada_disciplina_ausente_catalogo: 'Disciplina ausente do catalogo atual',
  jornada_sem_atribuicao_formal: 'Jornada fora da atribuicao formal',
  id_disciplina_multimodalidade: 'Modalidade conflitante no catalogo',
  sobreposicao_temporal: 'Periodos sobrepostos',
  resolvido_catalogo: 'Resolvido automaticamente',
  historico_encerrado: 'Historico encerrado',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] || type.replaceAll('_', ' ');
}

function modalityLabel(row: ProfessorCursoModalidadeExcecaoRow): string {
  if (row.modalidade === 'individual') return 'Individual';
  if (row.modalidade === 'turma') return 'Turma';
  return 'Modalidade nao informada';
}

function evidenceSummary(row: ProfessorCursoModalidadeExcecaoRow): string[] {
  const values: string[] = [];
  const affected = Number(row.evidencias.atribuicoes_afetadas);
  if (Number.isFinite(affected) && affected > 0) {
    values.push(`${affected} atribuicao(oes) formal(is) afetada(s)`);
  }
  if (row.emusysProfessorId !== null) {
    values.push(`Professor Emusys #${row.emusysProfessorId}`);
  }
  if (row.emusysDisciplinaId !== null) {
    values.push(`Disciplina Emusys #${row.emusysDisciplinaId}`);
  }
  return values;
}

export function ProfessorCursoModalidadeReconciliacao({
  disabled = false,
  onSaved,
}: ProfessorCursoModalidadeReconciliacaoProps) {
  const {
    rows,
    loading,
    syncingUnitId,
    includeAudit,
    error,
    setIncludeAudit,
    refresh,
    syncUnit,
  } = useProfessorCursoModalidadeReconciliacao();
  const [unitFilter, setUnitFilter] = useState('todas');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [open, setOpen] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);

  const actionableRows = useMemo(
    () => rows.filter((row) => row.acionavel),
    [rows],
  );

  const units = useMemo(() => Array.from(new Map(
    rows.map((row) => [row.unidadeId, row.unidadeNome]),
  ).entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [rows]);

  const types = useMemo(() => Array.from(new Set(
    rows.map((row) => row.tipo),
  )).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), 'pt-BR')), [rows]);

  const visibleRows = useMemo(() => rows.filter((row) => (
    (unitFilter === 'todas' || row.unidadeId === unitFilter)
    && (typeFilter === 'todos' || row.tipo === typeFilter)
  )), [rows, typeFilter, unitFilter]);

  const syncTargets = useMemo(() => {
    if (unitFilter !== 'todas') return [unitFilter];
    return Array.from(new Set(actionableRows.map((row) => row.unidadeId)));
  }, [actionableRows, unitFilter]);

  const handleSync = async () => {
    for (const unidadeId of syncTargets) {
      await syncUnit(unidadeId);
    }
    await onSaved();
  };

  const syncing = syncingUnitId !== null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="border-t border-slate-800 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {actionableRows.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-amber-300" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              )}
              <h4 className="text-sm font-semibold text-slate-100">
                Excecoes de vinculos Emusys
              </h4>
              <Badge variant={actionableRows.length > 0 ? 'warning' : 'success'}>
                {actionableRows.length}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Nao e um recadastro de professores. Aqui aparecem somente divergencias que
              persistem entre o catalogo oficial do Emusys e as jornadas ativas do LA Report.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || loading || syncing}
              onClick={() => void refresh().catch(() => undefined)}
            >
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Atualizar leitura
            </Button>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                {open ? 'Recolher' : 'Ver excecoes'}
                <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-800 bg-slate-950/30 p-3">
            <div className="min-w-[210px] flex-1">
              <Select value={unitFilter} onValueChange={setUnitFilter}>
                <SelectTrigger
                  aria-label="Filtrar por unidade"
                  className="rounded-md border-slate-700 bg-slate-900"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as unidades</SelectItem>
                  {units.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[250px] flex-1">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger
                  aria-label="Filtrar por tipo"
                  className="rounded-md border-slate-700 bg-slate-900"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {types.map((type) => (
                    <SelectItem key={type} value={type}>{typeLabel(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex min-h-9 items-center gap-2 px-1 text-xs text-slate-300">
              <Switch
                checked={includeAudit}
                onCheckedChange={setIncludeAudit}
                aria-label="Auditoria avancada"
              />
              Auditoria avancada
            </label>

            <Button
              type="button"
              size="sm"
              disabled={disabled || loading || syncing || syncTargets.length === 0}
              onClick={() => void handleSync().catch(() => undefined)}
            >
              {syncing ? <Loader2 className="animate-spin" /> : <CloudDownload />}
              Sincronizar com Emusys
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          {loading && rows.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Conferindo o catalogo oficial
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 text-sm text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              Nenhuma excecao exige acao.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-800">
              <div className="divide-y divide-slate-800">
                {visibleRows.map((row) => {
                  const summaries = evidenceSummary(row);
                  const evidenceOpen = expandedEvidence === row.excecaoId;
                  return (
                    <div key={row.excecaoId} className="px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={row.acionavel ? 'warning' : 'outline'}>
                              {row.acionavel ? 'Requer conferencia' : 'Auditoria'}
                            </Badge>
                            <span className="text-xs font-semibold text-slate-200">
                              {typeLabel(row.tipo)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-100">
                            {row.professorNome || row.disciplinaNome || 'Item do catalogo Emusys'}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {[row.unidadeNome, row.cursoNome || row.disciplinaNome, modalityLabel(row)]
                              .filter(Boolean)
                              .join('  |  ')}
                          </p>
                          <p className="mt-3 text-xs leading-5 text-slate-300">{row.motivo}</p>
                          {row.sugestao && (
                            <p className="mt-1 text-xs leading-5 text-cyan-200">{row.sugestao}</p>
                          )}
                          {summaries.length > 0 && (
                            <p className="mt-2 text-[11px] text-slate-500">{summaries.join('  |  ')}</p>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedEvidence(
                            evidenceOpen ? null : row.excecaoId,
                          )}
                        >
                          <FileSearch />
                          {evidenceOpen ? 'Ocultar evidencias' : 'Ver evidencias'}
                        </Button>
                      </div>

                      {evidenceOpen && (
                        <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 text-[11px] leading-5 text-slate-400">
                          {JSON.stringify(row.evidencias, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
