// src/components/App/Automacoes/TabSaudeCrons.tsx
import { RefreshCw, CheckCircle2, XCircle, MinusCircle, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useSaudeCrons, type CronJob } from '@/hooks/useSaudeCrons';
import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useMemo, useEffect } from 'react';
import type { Filtros } from '@/hooks/useAutomacoesData';
import { Paginacao } from './Paginacao';

function humanizarSchedule(expr: string): string {
  const map: Record<string, string> = {
    '* * * * *':    'A cada minuto',
    '*/5 * * * *':  'A cada 5 min',
    '*/10 * * * *': 'A cada 10 min',
    '*/15 * * * *': 'A cada 15 min',
    '*/30 * * * *': 'A cada 30 min',
    '0 * * * *':    'A cada hora',
  };
  if (map[expr]) return map[expr];

  // "0 H * * *" → "Todo dia HH:00 (UTC) — XX:00 BRT"
  const diariaMatch = expr.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (diariaMatch) {
    const min = diariaMatch[1].padStart(2, '0');
    const hor = diariaMatch[2].padStart(2, '0');
    return `Todo dia ${hor}:${min} (UTC) — ${String((parseInt(hor) - 3 + 24) % 24).padStart(2, '0')}:${min} BRT`;
  }

  // "0 H * * 1-6" → "Seg-Sáb HH:00 (UTC) — XX:00 BRT"
  const semanalMatch = expr.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+([\d,-]+)$/);
  if (semanalMatch) {
    const min = semanalMatch[1].padStart(2, '0');
    const hor = semanalMatch[2].padStart(2, '0');
    const diasMap: Record<string, string> = {
      '1-5': 'Seg-Sex', '1-6': 'Seg-Sáb', '0-6': 'Todos os dias',
      '1': 'Seg', '2': 'Ter', '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb', '0': 'Dom',
    };
    const diasLabel = diasMap[semanalMatch[3]] ?? semanalMatch[3];
    return `${diasLabel} ${hor}:${min} (UTC) — ${String((parseInt(hor) - 3 + 24) % 24).padStart(2, '0')}:${min} BRT`;
  }

  return expr;
}

// Fire-and-forget de verdade = comando dispara via net.http_post (pg_cron só confirma
// o enqueue do POST, nunca o resultado da edge function). Duração não é um bom proxy:
// SQL direto rápido (ex: reset-sol-stuck-messages) também fica abaixo de qualquer limiar.
function ehFireAndForget(job: CronJob): boolean {
  return job.is_http_post === true;
}

// Mesma precedência visual do StatusBadge, reduzida às 3 categorias do filtro
// de Status compartilhado com as outras abas (ok/warn/erro).
function categoriaJob(job: CronJob): 'ok' | 'warn' | 'erro' {
  if (job.sync_status_real) {
    if (job.sync_status_real === 'ok') return 'ok';
    if (job.sync_status_real === 'falhou' || job.sync_status_real === 'atrasado') return 'erro';
    return 'warn'; // 'nunca' | 'sem_cron'
  }
  if (!job.active) return 'warn';
  if (job.ultimo_status === 'failed') return 'erro';
  if (ehFireAndForget(job)) return 'warn';
  if (job.ultimo_status === 'succeeded') return 'ok';
  return 'warn'; // nunca rodou
}

function StatusBadge({ job }: { job: CronJob }) {
  if (!job.active) {
    return (
      <span className="flex items-center gap-1 text-gray-500 text-xs">
        <MinusCircle className="w-3.5 h-3.5" /> inativo
      </span>
    );
  }

  // Syncs Emusys medíveis: status vem da idade da última execução REAL, não do cron.
  if (job.sync_status_real) {
    const idade = job.sync_idade_horas != null ? `${job.sync_idade_horas}h` : '—';
    const tol = job.sync_tolerancia_horas != null ? `${job.sync_tolerancia_horas}h` : '—';
    if (job.sync_status_real === 'ok') {
      return (
        <span className="flex items-center gap-1 text-emerald-400 text-xs" title={`Última execução real há ${idade} (tolerância ${tol})`}>
          <CheckCircle2 className="w-3.5 h-3.5" /> ok
        </span>
      );
    }
    if (job.sync_status_real === 'atrasado') {
      return (
        <span className="flex items-center gap-1 text-rose-400 text-xs" title={`Sem execução real há ${idade} (tolerância ${tol}). O sync pode ter parado.`}>
          <XCircle className="w-3.5 h-3.5" /> atrasado
        </span>
      );
    }
    if (job.sync_status_real === 'sem_cron') {
      return (
        <span className="flex items-center gap-1 text-gray-500 text-xs" title="Sem agendamento (cron) — não há execução automática.">
          <MinusCircle className="w-3.5 h-3.5" /> sem cron
        </span>
      );
    }
    if (job.sync_status_real === 'falhou') {
      return (
        <span className="flex items-center gap-1 text-rose-400 text-xs" title="Falha real na entrega (evidência da fila): item com falha terminal após esgotar tentativas ou preso sem resolver há +3h — ex: número do WhatsApp desconectado.">
          <XCircle className="w-3.5 h-3.5" /> falhou
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-gray-500 text-xs" title="Nenhuma execução real registrada.">
        <MinusCircle className="w-3.5 h-3.5" /> nunca rodou
      </span>
    );
  }

  // Falha SQL de verdade (o próprio comando do cron falhou) — vale independentemente do tipo.
  if (job.ultimo_status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-rose-400 text-xs">
        <XCircle className="w-3.5 h-3.5" /> falhou
      </span>
    );
  }

  // Fire-and-forget sem evidência medível: "succeeded" NÃO prova que a função funcionou.
  // Mostra estado neutro em vez de verde enganoso.
  if (ehFireAndForget(job)) {
    return (
      <span className="flex items-center gap-1 text-amber-400/80 text-xs" title="Disparo via net.http_post: o pg_cron só confirma que enfileirou o POST, não o resultado da edge function. Resultado real não medido.">
        <AlertTriangle className="w-3.5 h-3.5" /> não medido
      </span>
    );
  }

  if (job.ultimo_status === 'succeeded') {
    return (
      <span className="flex items-center gap-1 text-emerald-400 text-xs">
        <CheckCircle2 className="w-3.5 h-3.5" /> ok
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-gray-500 text-xs">
      <MinusCircle className="w-3.5 h-3.5" /> nunca rodou
    </span>
  );
}

function UltimaExecucao({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-600">—</span>;
  const d = parseISO(iso);
  if (!isValid(d)) return <span className="text-gray-400 text-xs">{iso}</span>;
  return (
    <span className="text-gray-300 text-xs" title={d.toLocaleString('pt-BR')}>
      {formatDistanceToNow(d, { addSuffix: true, locale: ptBR })}
    </span>
  );
}

function LinhaJob({ job }: { job: CronJob }) {
  const duracaoTexto = job.ultima_duracao_ms != null
    ? job.ultima_duracao_ms < 1000
      ? `${job.ultima_duracao_ms}ms`
      : `${(job.ultima_duracao_ms / 1000).toFixed(1)}s`
    : '—';

  const fireAndForget = ehFireAndForget(job);
  // Para syncs medíveis, a última execução exibida é a REAL (evidência no banco),
  // não o horário em que o pg_cron enfileirou o POST.
  const ultimaExibida = job.sync_status_real ? (job.sync_ultima_execucao ?? null) : job.ultima_execucao_brt;

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
      <td className="py-2.5 px-3 font-mono text-xs text-gray-200 max-w-[220px] truncate">
        {job.jobname}
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-400 whitespace-nowrap">
        <span title={job.schedule}>{humanizarSchedule(job.schedule)}</span>
      </td>
      <td className="py-2.5 px-3">
        <UltimaExecucao iso={ultimaExibida} />
        {job.sync_status_real && (
          <span className="block text-[10px] text-gray-600" title="Baseado em evidência real gravada pelo sync no banco, não no disparo do cron.">
            execução real
          </span>
        )}
      </td>
      <td className="py-2.5 px-3">
        <StatusBadge job={job} />
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className={`text-xs ${fireAndForget && !job.sync_status_real ? 'text-amber-400/70' : 'text-gray-400'}`}>
          {duracaoTexto}
        </span>
      </td>
      <td className="py-2.5 px-3 max-w-[260px]">
        {job.return_message ? (
          <span
            className={`text-xs font-mono truncate block ${
              job.ultimo_status === 'failed' ? 'text-rose-300' : 'text-gray-500'
            }`}
            title={job.return_message}
          >
            {job.return_message}
          </span>
        ) : (
          <span className="text-gray-700">—</span>
        )}
      </td>
    </tr>
  );
}

type SortCol = 'jobname' | 'schedule' | 'ultima_execucao_brt' | 'ultimo_status' | 'ultima_duracao_ms';
type SortDir = 'asc' | 'desc';

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: SortDir }) {
  if (col !== sortCol) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-blue-400" />
    : <ChevronDown className="w-3 h-3 text-blue-400" />;
}

export function TabSaudeCrons({ filtros }: { filtros?: Filtros }) {
  const { jobs, loading, erro, refetch } = useSaudeCrons();
  const [sortCol, setSortCol] = useState<SortCol>('jobname');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  // "Problemas" reflete a realidade: falha SQL do cron OU sync com execução real atrasada/inexistente.
  // Contagem sempre sobre o total (independente do filtro de busca/status aplicado à tabela).
  const falhos = jobs.filter(j =>
    j.active && (
      j.sync_status_real === 'atrasado' ||
      j.sync_status_real === 'nunca' ||
      j.sync_status_real === 'falhou' ||
      (!j.sync_status_real && j.ultimo_status === 'failed')
    )
  ).length;

  const filtrados = useMemo(() => {
    const busca = filtros?.busca.trim().toLowerCase() ?? '';
    const status = filtros?.status ?? [];
    return jobs.filter(j => {
      if (busca && !j.jobname.toLowerCase().includes(busca)) return false;
      if (status.length > 0 && !status.includes(categoriaJob(j))) return false;
      return true;
    });
  }, [jobs, filtros?.busca, filtros?.status]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      let va: any = a[sortCol] ?? '';
      let vb: any = b[sortCol] ?? '';
      if (sortCol === 'ultima_execucao_brt') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      } else if (sortCol === 'ultima_duracao_ms') {
        va = va ?? -1;
        vb = vb ?? -1;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtrados, sortCol, sortDir]);

  // Reseta pra página 1 sempre que muda filtro/ordenação ou o dataset encolhe
  useEffect(() => { setPagina(1); }, [filtros?.busca, filtros?.status, sortCol, sortDir]);

  const { paginados, totalPaginas } = useMemo(() => {
    const tp = Math.max(1, Math.ceil(sorted.length / porPagina));
    const p = Math.min(pagina, tp);
    const inicio = (p - 1) * porPagina;
    return {
      paginados: sorted.slice(inicio, inicio + porPagina),
      totalPaginas: tp,
    };
  }, [sorted, pagina, porPagina]);

  const thClass = "py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-300 transition-colors";
  const thRightClass = "py-2.5 px-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-300 transition-colors";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {filtrados.length} job{filtrados.length !== 1 ? 's' : ''}
            {filtrados.length !== jobs.length && <span className="text-gray-600"> de {jobs.length}</span>}
          </span>
          {falhos > 0 && (
            <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
              <XCircle className="w-3 h-3" /> {falhos} com problema
            </span>
          )}
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-slate-800"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-500 text-sm">Carregando crons...</div>
      )}

      {erro && (
        <div className="text-center py-8 text-rose-400 text-sm">
          Erro ao carregar: {erro}
        </div>
      )}

      {!loading && !erro && jobs.length > 0 && filtrados.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">Nenhum job corresponde ao filtro/busca.</div>
      )}

      {!loading && !erro && jobs.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">Nenhum cron job encontrado.</div>
      )}

      {!loading && !erro && filtrados.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className={thClass} onClick={() => toggleSort('jobname')}>
                  <span className="flex items-center gap-1">Job <SortIcon col="jobname" sortCol={sortCol} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort('schedule')}>
                  <span className="flex items-center gap-1">Schedule <SortIcon col="schedule" sortCol={sortCol} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort('ultima_execucao_brt')}>
                  <span className="flex items-center gap-1">Última execução <SortIcon col="ultima_execucao_brt" sortCol={sortCol} sortDir={sortDir} /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort('ultimo_status')}>
                  <span className="flex items-center gap-1">Status <SortIcon col="ultimo_status" sortCol={sortCol} sortDir={sortDir} /></span>
                </th>
                <th className={thRightClass} onClick={() => toggleSort('ultima_duracao_ms')}>
                  <span className="flex items-center justify-end gap-1">Duração <SortIcon col="ultima_duracao_ms" sortCol={sortCol} sortDir={sortDir} /></span>
                </th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {paginados.map(job => <LinhaJob key={job.jobid} job={job} />)}
            </tbody>
          </table>
          <Paginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalItens={sorted.length}
            porPagina={porPagina}
            onMudarPagina={setPagina}
            onMudarPorPagina={n => { setPorPagina(n); setPagina(1); }}
          />
        </div>
      )}

      <p className="text-xs text-gray-600 mt-1">
        Atualizado a cada 60s. Os syncs Emusys (matrículas, presença, professores) mostram status <span className="text-gray-400">real</span>, pela idade da última execução de fato — verde só se rodou dentro da tolerância. Jobs marcados <span className="text-amber-400/80">"não medido"</span> são disparos fire-and-forget (net.http_post): o pg_cron confirma só o envio do POST, não o resultado da função.
      </p>
    </div>
  );
}
