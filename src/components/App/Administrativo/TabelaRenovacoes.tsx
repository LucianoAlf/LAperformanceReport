import { CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CelulaEditavelInline } from '@/components/ui/CelulaEditavelInline';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import type { MovimentacaoAdmin } from './AdministrativoPage';
import { calcularReajusteMedioCanonico } from '@/lib/retencaoOperacionalCanonica';

interface TabelaRenovacoesProps {
  data: MovimentacaoAdmin[];
  onEdit: (item: MovimentacaoAdmin) => void;
  onDelete: (id: number) => void;
  onSaveInline?: (
    item: MovimentacaoAdmin,
    patch: Partial<MovimentacaoAdmin>,
    options?: { atualizarLista?: boolean }
  ) => Promise<boolean>;
  formasPagamento?: { id: number; nome: string; sigla: string }[];
  status?: 'confirmada' | 'pendente' | 'antecipada';
}

interface DraftRenovacao {
  valor_parcela_novo: string;
  forma_pagamento_id: string;
  agente_comercial: string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function valorAnteriorOperacional(item: MovimentacaoAdmin): number {
  return toNumber(item.valor_parcela_anterior ?? item.alunos?.valor_parcela);
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isLinhaSemValidacaoFinanceira(item: MovimentacaoAdmin, valorAnterior: number): boolean {
  if (valorAnterior > 0) return false;

  const curso = normalizeText(item.curso_nome);
  const classificacao = normalizeText(item.alunos?.classificacao);
  const tipoMatriculaId = String(item.alunos?.tipo_matricula_id ?? '');

  return (
    curso.includes('coral') ||
    curso.includes('banda') ||
    curso.includes('projeto') ||
    curso.includes('garage') ||
    classificacao.includes('bolsista') ||
    ['3', '4', '5'].includes(tipoMatriculaId)
  );
}

function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(0)}%`;
}

function formatDateShort(value?: string | null): string {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function dataEfetivaRenovacao(item: MovimentacaoAdmin): string | null {
  return item.renovacao_primeira_aula_novo_ciclo || item.competencia_referencia || item.data || null;
}

function campoInlineClass(tone: 'neutral' | 'success' = 'neutral'): string {
  return cn(
    'inline-flex h-7 min-w-[84px] items-center justify-center rounded-md border px-2 text-xs transition-colors',
    tone === 'success'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/40 hover:bg-emerald-500/15'
      : 'border-slate-700/80 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:bg-slate-800/50'
  );
}

export function TabelaRenovacoes({
  data,
  onEdit,
  onDelete,
  onSaveInline,
  formasPagamento = [],
  status = 'confirmada',
}: TabelaRenovacoesProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  const isAntecipada = status === 'antecipada';
  const isPendente = status === 'pendente' || isAntecipada;
  const [drafts, setDrafts] = useState<Record<string, DraftRenovacao>>({});
  const [validatingKey, setValidatingKey] = useState<string | null>(null);

  function rowKey(item: MovimentacaoAdmin, index: number): string {
    return String(item.id ?? `row-${index}`);
  }

  function getDraft(item: MovimentacaoAdmin, key: string): DraftRenovacao {
    return drafts[key] ?? {
      valor_parcela_novo: item.valor_parcela_novo ? String(item.valor_parcela_novo) : '',
      forma_pagamento_id: item.forma_pagamento_id ? String(item.forma_pagamento_id) : '',
      agente_comercial: item.agente_comercial || '',
    };
  }

  function updateDraft(key: string, patch: Partial<DraftRenovacao>, item?: MovimentacaoAdmin) {
    setDrafts(prev => ({
      ...prev,
      [key]: {
        valor_parcela_novo: prev[key]?.valor_parcela_novo ?? (item?.valor_parcela_novo ? String(item.valor_parcela_novo) : ''),
        forma_pagamento_id: prev[key]?.forma_pagamento_id ?? (item?.forma_pagamento_id ? String(item.forma_pagamento_id) : ''),
        agente_comercial: prev[key]?.agente_comercial ?? item?.agente_comercial ?? '',
        ...patch,
      },
    }));
  }

  async function saveInline(
    item: MovimentacaoAdmin,
    patch: Partial<MovimentacaoAdmin>,
    key: string,
    options?: { atualizarLista?: boolean }
  ) {
    if (!onSaveInline || !item.id) return;

    const valorAnterior = valorAnteriorOperacional(item);
    const success = await onSaveInline(item, {
      ...patch,
      valor_parcela_anterior: patch.valor_parcela_anterior ?? item.valor_parcela_anterior ?? (valorAnterior > 0 ? valorAnterior : null),
    }, options);

    if (!success) {
      throw new Error(`Falha ao salvar renovacao ${key}`);
    }
  }

  async function saveValorNovo(item: MovimentacaoAdmin, key: string, value: string | number | null) {
    const nextValue = toNumber(value);
    updateDraft(key, { valor_parcela_novo: nextValue > 0 ? String(nextValue) : '' }, item);
    await saveInline(item, { valor_parcela_novo: nextValue > 0 ? nextValue : null }, key);
  }

  async function saveAgente(item: MovimentacaoAdmin, key: string, value: string | number | null) {
    const nextValue = String(value ?? '').trim();
    updateDraft(key, { agente_comercial: nextValue }, item);
    await saveInline(item, { agente_comercial: nextValue || null }, key);
  }

  async function saveFormaPagamento(item: MovimentacaoAdmin, key: string, value: string | number | null) {
    const nextValue = value ? String(value) : '';
    updateDraft(key, { forma_pagamento_id: nextValue }, item);
    await saveInline(item, { forma_pagamento_id: nextValue ? Number(nextValue) : null }, key);
  }

  async function validarRenovacao(item: MovimentacaoAdmin, key: string) {
    const draft = getDraft(item, key);
    const valorNovo = toNumber(draft.valor_parcela_novo || item.valor_parcela_novo);
    const agente = draft.agente_comercial.trim() || item.agente_comercial || null;
    const formaPagamento = draft.forma_pagamento_id ? Number(draft.forma_pagamento_id) : item.forma_pagamento_id ?? null;

    if (valorNovo <= 0 || !agente) return;

    setValidatingKey(key);
    try {
      await saveInline(item, {
        valor_parcela_novo: valorNovo,
        forma_pagamento_id: formaPagamento,
        agente_comercial: agente,
        renovacao_status: isAntecipada ? 'antecipada_confirmada' : 'confirmada',
        renovacao_antecipada: isAntecipada || item.renovacao_antecipada || false,
      }, key, { atualizarLista: true });
    } finally {
      setValidatingKey(null);
    }
  }

  const reajusteCanonico = calcularReajusteMedioCanonico(data);

  return (
    <div className="overflow-x-auto">
      {isPendente && data.length > 0 && (
        <div className="border-b border-amber-500/15 bg-amber-500/[0.03] px-4 py-2 text-xs text-amber-100/80">
          {isAntecipada
            ? 'Renovações antecipadas foram capturadas agora, mas só contam na competência da primeira aula do novo ciclo.'
            : 'Renovações importadas do Emusys ficam pendentes até a DM validar valor novo e agente. Itens sem parcela recorrente ficam marcados como sem valor.'}
        </div>
      )}

      <table className="w-full min-w-[1320px]">
        <thead className="bg-slate-800/50">
          <tr className="text-xs uppercase tracking-wider text-slate-400">
            <th className="px-3 py-2.5 text-left">#</th>
            <th className="px-3 py-2.5 text-left">{isAntecipada ? 'Efetiva' : 'Data'}</th>
            {isPendente && <th className="px-3 py-2.5 text-center">Status</th>}
            <th className="px-3 py-2.5 text-left">Aluno</th>
            <th className="px-3 py-2.5 text-left">Curso</th>
            <th className="px-3 py-2.5 text-left">Escola</th>
            <th className="px-3 py-2.5 text-right">Anterior</th>
            <th className="px-3 py-2.5 text-right">Novo</th>
            <th className="px-3 py-2.5 text-center">Reajuste</th>
            <th className="px-3 py-2.5 text-left">Forma</th>
            <th className="px-3 py-2.5 text-left">Agente</th>
            <th className="px-3 py-2.5 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={isPendente ? 12 : 11} className="py-8 text-center text-slate-500">
                {isPendente
                  ? isAntecipada
                    ? 'Nenhuma renovação antecipada registrada neste período'
                    : 'Nenhuma renovação pendente neste período'
                  : 'Nenhuma renovação registrada neste período'}
              </td>
            </tr>
          ) : (
            data.map((item, index) => {
              const key = rowKey(item, index);
              const draft = getDraft(item, key);
              const valorAnterior = valorAnteriorOperacional(item);
              const valorNovo = isPendente
                ? toNumber(draft.valor_parcela_novo || item.valor_parcela_novo)
                : toNumber(item.valor_parcela_novo);
              const agente = draft.agente_comercial.trim() || item.agente_comercial || '';
              const semValidacaoFinanceira = isLinhaSemValidacaoFinanceira(item, valorAnterior);
              const podeValidar = !semValidacaoFinanceira && valorNovo > 0 && agente.trim().length > 0;
              const reajuste = valorAnterior > 0 && valorNovo > 0
                ? ((valorNovo - valorAnterior) / valorAnterior) * 100
                : 0;

              return (
                <tr
                  key={key}
                  className={cn(
                    'border-t border-slate-700/30',
                    isPendente
                      ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.09]'
                      : 'hover:bg-slate-800/30'
                  )}
                >
                  <td className="px-3 py-2.5 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {isAntecipada ? (
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium text-amber-100">
                          {formatDateShort(dataEfetivaRenovacao(item))}
                        </span>
                        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                          capt. {formatDateShort(item.data)}
                        </span>
                      </div>
                    ) : (
                      formatDateShort(item.data)
                    )}
                  </td>
                  {isPendente && (
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                        {isAntecipada ? 'Antecipada' : 'Pendente'}
                      </span>
                    </td>
                  )}
                  <td className="min-w-[280px] px-3 py-2.5 font-medium text-white">
                    <span className="whitespace-nowrap">{item.aluno_nome}</span>
                  </td>
                  <td className="min-w-[140px] px-3 py-2.5 text-sm text-slate-300">{item.curso_nome || '-'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        'rounded px-2 py-0.5 text-xs font-medium',
                        item.unidade_id === 'emla'
                          ? 'bg-violet-500/20 text-violet-400'
                          : 'bg-cyan-500/20 text-cyan-400'
                      )}>
                        {item.unidade_id === 'emla' ? 'EMLA' : 'LAMK'}
                      </span>
                      {isAdmin && item.unidades?.codigo && (
                        <span className="rounded bg-slate-600/30 px-2 py-0.5 text-xs font-medium text-slate-300">
                          {item.unidades.codigo}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="min-w-[100px] px-3 py-2.5 text-right text-slate-400">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <span className="whitespace-nowrap">{valorAnterior > 0 ? formatCurrency(valorAnterior) : '-'}</span>
                      {isPendente && !item.valor_parcela_anterior && valorAnterior > 0 && (
                        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-300">
                          auto
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="min-w-[100px] px-3 py-2.5 text-right font-medium text-emerald-400">
                    {isPendente ? (
                      semValidacaoFinanceira ? (
                        <span className={campoInlineClass('neutral')}>sem valor</span>
                      ) : (
                        <CelulaEditavelInline
                          value={valorNovo > 0 ? valorNovo : null}
                          onChange={(value) => saveValorNovo(item, key, value)}
                          tipo="moeda"
                          placeholder="preencher"
                          textClassName="font-mono text-xs text-emerald-300"
                          inputClassName="w-24 text-xs"
                          formatarExibicao={(value) => value
                            ? <span className="whitespace-nowrap font-mono text-xs text-emerald-300">{formatCurrency(toNumber(value))}</span>
                            : <span className={campoInlineClass('success')}>preencher</span>}
                        />
                      )
                    ) : (
                      <span className="whitespace-nowrap">{formatCurrency(valorNovo)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {valorAnterior > 0 && valorNovo > 0 ? (
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-xs font-medium',
                        reajuste > 0 ? 'bg-emerald-500/20 text-emerald-400'
                          : reajuste < 0 ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-slate-500/20 text-slate-400'
                      )}>
                        {formatPercent(reajuste)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {isPendente && !semValidacaoFinanceira ? (
                      <CelulaEditavelInline
                        value={draft.forma_pagamento_id || item.forma_pagamento_id || null}
                        onChange={(value) => saveFormaPagamento(item, key, value)}
                        tipo="select"
                        opcoes={formasPagamento.map(fp => ({ value: fp.id, label: fp.sigla || fp.nome }))}
                        placeholder="-"
                        textClassName="text-xs text-slate-300"
                        inputClassName="h-7 min-w-[72px] text-xs"
                        formatarExibicao={(value) => {
                          const label = value
                            ? formasPagamento.find(fp => String(fp.id) === String(value))?.sigla
                              || formasPagamento.find(fp => String(fp.id) === String(value))?.nome
                            : null;
                          return <span className={campoInlineClass('neutral')}>{label || 'Selecionar'}</span>;
                        }}
                      />
                    ) : (
                      item.forma_pagamento_nome || '-'
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {isPendente && !semValidacaoFinanceira ? (
                      <CelulaEditavelInline
                        value={agente || null}
                        onChange={(value) => saveAgente(item, key, value)}
                        tipo="texto"
                        placeholder="Agente"
                        textClassName="text-xs text-slate-300"
                        inputClassName="w-28 text-xs"
                        formatarExibicao={(value) => (
                          <span className={campoInlineClass('neutral')}>
                            {String(value || '').trim() || 'Agente'}
                          </span>
                        )}
                      />
                    ) : (
                      item.agente_comercial || '-'
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {isPendente && podeValidar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => validarRenovacao(item, key)}
                          disabled={!podeValidar || validatingKey === key}
                          className={cn(
                            'h-7 w-7 p-0 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200',
                            validatingKey === key && 'opacity-60'
                          )}
                          title={podeValidar ? 'Validar renovação' : 'Preencha valor novo e agente para validar'}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(item)}
                        className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => item.id && onDelete(item.id)}
                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {data.length > 0 && !isPendente && (
          <tfoot className="bg-slate-800/50">
            <tr className="border-t border-slate-600">
              <td colSpan={6} className="px-4 py-3 text-right font-medium text-slate-400">
                Totais: {data.length} renovações - {reajusteCanonico.total} válidas para reajuste
              </td>
              <td className="px-4 py-3 text-center font-bold text-emerald-400">
                +{reajusteCanonico.media.toFixed(1)}%
              </td>
              <td colSpan={4} className="px-4 py-3 text-slate-400">Reajuste médio</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

