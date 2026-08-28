import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Clock, PartyPopper } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  AulaAgenda,
  PresencaEnvelopeAgenda,
  PresencaPendenciaCanonica,
} from '@/hooks/useAgendaDia';
import { aulaJaOcorreu } from '@/lib/agenda';
import { cn } from '@/lib/utils';

interface PendenciaRenderizada {
  item: PresencaPendenciaCanonica;
  aula: AulaAgenda | null;
  minutosDesdeFim: number;
  conflito: boolean;
}

interface Props {
  data: string;
  aulas: AulaAgenda[];
  presenca: PresencaEnvelopeAgenda;
  consolidado: boolean;
  unidadeId: string | null;
  onAbrirDrawer: (aula: AulaAgenda) => void;
}

export function AlertaPendencias({
  data,
  aulas,
  presenca,
  consolidado,
  unidadeId,
  onAbrirDrawer,
}: Props) {
  const agora = useMemo(() => new Date(), []);
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [nomesEquipe, setNomesEquipe] = useState<string[]>([]);

  useEffect(() => {
    if (!unidadeId) {
      setNomesEquipe([]);
      return;
    }
    let cancelado = false;
    void (async () => {
      const { data: rows } = await supabase
        .from('usuarios')
        .select('nome')
        .eq('unidade_id', unidadeId)
        .eq('ativo', true)
        .order('nome');
      if (cancelado) return;
      setNomesEquipe((rows ?? [])
        .map((row: { nome: string }) => row.nome)
        .filter((nome: string) => nome
          && !nome.toLowerCase().includes('equipe')
          && !nome.toLowerCase().includes('teste')));
    })();
    return () => { cancelado = true; };
  }, [unidadeId]);

  const pendentes = useMemo(() => {
    const montar = (
      item: PresencaPendenciaCanonica,
      conflito: boolean,
    ): PendenciaRenderizada => {
      const aula = aulas.find((candidata) =>
        candidata.aula_ids.includes(item.aula_emusys_id)
        || candidata.alunos.some((aluno) =>
          aluno.aluno_id === item.aluno_id
          && aluno.aula_emusys_id === item.aula_emusys_id),
      ) ?? null;
      if (!aula) return { item, aula: null, minutosDesdeFim: 0, conflito };
      const [horas, minutos] = aula.hora_fim.split(':').map(Number);
      const fim = new Date(
        `${data}T${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:00`,
      );
      return {
        item,
        aula,
        conflito,
        minutosDesdeFim: Math.max(0, Math.round((agora.getTime() - fim.getTime()) / 60_000)),
      };
    };
    return [
      ...presenca.pendencias.map((item) => montar(item, false)),
      ...presenca.conflitos.map((item) => montar(item, true)),
    ];
  }, [agora, aulas, data, presenca.conflitos, presenca.pendencias]);

  const conflitos = pendentes.filter((item) => item.conflito);
  const semResposta = pendentes.filter((item) => !item.conflito);
  const aulasEncerradas = aulas.filter(
    (aula) => !aula.cancelada && aulaJaOcorreu(data, aula.hora_fim, agora),
  ).length;

  if (presenca.dados_status !== 'atualizados') {
    const roster = presenca.dados_status === 'roster_em_revisao';
    return (
      <div
        className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"
        role="status"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-amber-200">
            {roster ? 'Roster em revisão estrutural' : 'Dados de presença ainda não publicáveis'}
          </p>
          <p className="mt-0.5 text-xs text-amber-300/80">
            {roster
              ? 'A fotografia de alunos está incompleta, ambígua ou desatualizada.'
              : 'A sincronização do Emusys ainda não cobriu todas as aulas encerradas.'}
            {' '}Nenhuma pendência foi atribuída à equipe.
          </p>
        </div>
      </div>
    );
  }

  if (pendentes.length === 0 && aulasEncerradas === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-700/50 bg-slate-800/20 p-4">
        <Clock className="h-5 w-5 shrink-0 text-slate-500" />
        <p className="text-sm font-semibold text-slate-300">As aulas de hoje ainda não começaram.</p>
      </div>
    );
  }

  if (pendentes.length === 0) {
    const nomes = nomesEquipe.length === 1
      ? nomesEquipe[0]
      : nomesEquipe.length > 1
        ? `${nomesEquipe.slice(0, -1).join(', ')} e ${nomesEquipe.at(-1)}`
        : null;
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <PartyPopper className="h-5 w-5 shrink-0 text-emerald-400" />
        <div>
          <p className="text-sm font-semibold text-emerald-300">
            {nomes ? `Parabéns, ${nomes}!` : 'Parabéns!'} Tudo fechado na ficha de chamada.
          </p>
          <p className="mt-0.5 text-xs text-emerald-400/70">
            Dados sincronizados e nenhuma pendência canônica neste dia.
          </p>
        </div>
      </div>
    );
  }

  const urgente = pendentes.length > 10;

  function formatarTempo(minutos: number): string {
    if (minutos < 60) return `há ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `há ${horas}h` : `há ${horas}h${resto}min`;
  }

  function Item({ pendencia }: { pendencia: PendenciaRenderizada }) {
    return (
      <button
        type="button"
        onClick={() => pendencia.aula && onAbrirDrawer(pendencia.aula)}
        disabled={!pendencia.aula}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-amber-100 transition-colors hover:bg-amber-500/10 disabled:cursor-default"
      >
        <Clock className="h-3 w-3 shrink-0 opacity-60" />
        <span className="font-mono text-[11px] opacity-70">{pendencia.item.hora}</span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {pendencia.item.aluno_nome}
          {pendencia.conflito && (
            <span className="ml-1 rounded bg-rose-500/20 px-1 py-px text-[9px] font-semibold text-rose-300">
              conflito
            </span>
          )}
        </span>
        <span className="truncate text-[10px] opacity-60">
          {pendencia.item.professor_nome.split(' ')[0]} · {pendencia.item.curso_nome}
        </span>
        <span className="shrink-0 text-[10px] opacity-50">
          {formatarTempo(pendencia.minutosDesdeFim)}
        </span>
        {pendencia.aula && <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />}
      </button>
    );
  }

  function Secao({ titulo, itens }: { titulo: string; itens: PendenciaRenderizada[] }) {
    if (itens.length === 0) return null;
    const grupos = new Map<string, PendenciaRenderizada[]>();
    for (const item of itens) {
      const unidade = consolidado ? (item.aula?.unidade_nome ?? 'Unidade') : '';
      grupos.set(unidade, [...(grupos.get(unidade) ?? []), item]);
    }
    return (
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
          {titulo} ({itens.length})
        </p>
        {[...grupos.entries()].map(([unidade, lista]) => (
          <div key={unidade || titulo} className="mb-2 last:mb-0">
            {unidade && <p className="mb-0.5 text-[10px] font-semibold opacity-50">{unidade}</p>}
            <ul className="space-y-0.5">
              {lista.map((item) => <li key={item.item.slot_key}><Item pendencia={item} /></li>)}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const cor = urgente
    ? 'border-rose-500/40 bg-rose-500/10'
    : 'border-amber-500/40 bg-amber-500/10';
  return (
    <div className={cn('rounded-2xl border p-4', cor)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', urgente ? 'text-rose-400' : 'text-amber-400')} />
        <div>
          <p className="text-sm font-semibold text-amber-100">
            {semResposta.length} sem resposta · {conflitos.length} conflitos em aulas encerradas
          </p>
          <p className="mt-0.5 text-xs text-amber-200/70">
            Esta é a mesma lista canônica enviada no relatório diário da Sol.
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <Secao titulo={data === hoje ? 'Conflitos' : 'Ontem — Conflitos'} itens={conflitos} />
        <Secao titulo={data === hoje ? 'Sem resposta' : 'Ontem — Sem resposta'} itens={semResposta} />
      </div>
    </div>
  );
}
