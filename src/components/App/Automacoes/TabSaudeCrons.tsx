// src/components/App/Automacoes/TabSaudeCrons.tsx
import { RefreshCw, CheckCircle2, XCircle, MinusCircle, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useSaudeCrons, type CronJob } from '@/hooks/useSaudeCrons';
import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useMemo } from 'react';

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

function StatusBadge({ job }: { job: CronJob }) {
  if (!job.active) {
    return (
      <span className="flex items-center gap-1 text-gray-500 text-xs">
        <MinusCircle className="w-3.5 h-3.5" /> inativo
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
  if (job.ultimo_status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-rose-400 text-xs">
        <XCircle className="w-3.5 h-3.5" /> falhou
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

  // Aviso: duração <= 20ms num job de HTTP provavelmente é fire-and-forget (pg_cron + net.http_post)
  const ehFireAndForget = job.ultima_duracao_ms != null && job.ultima_duracao_ms <= 20;

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
      <td className="py-2.5 px-3 font-mono text-xs text-gray-200 max-w-[220px] truncate">
        {job.jobname}
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-400 whitespace-nowrap">
        <span title={job.schedule}>{humanizarSchedule(job.schedule)}</span>
      </td>
      <td className="py-2.5 px-3">
        <UltimaExecucao iso={job.ultima_execucao_brt} />
      </td>
      <td className="py-2.5 px-3">
        <StatusBadge job={job} />
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className={`text-xs ${ehFireAndForget ? 'text-amber-400' : 'text-gray-400'}`}>
          {duracaoTexto}
          {ehFireAndForget && (
            <span title="Duração muito curta — provavelmente fire-and-forget (net.http_post). O status 'succeeded' não reflete o resultado real da função.">
              {' '}<AlertTriangle className="w-3 h-3 inline" />
            </span>
          )}
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

export function TabSaudeCrons() {
  const { jobs, loading, erro, refetch } = useSaudeCrons();
  const [sortCol, setSortCol] = useState<SortCol>('jobname');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const falhos = jobs.filter(j => j.active && j.ultimo_status === 'failed').length;

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    return [...jobs].sort((a, b) => {
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
  }, [jobs, sortCol, sortDir]);

  const thClass = "py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-300 transition-colors";
  const thRightClass = "py-2.5 px-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-300 transition-colors";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </span>
          {falhos > 0 && (
            <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
              <XCircle className="w-3 h-3" /> {falhos} com falha
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

      {!loading && !erro && jobs.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">Nenhum cron job encontrado.</div>
      )}

      {!loading && !erro && jobs.length > 0 && (
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
              {sorted.map(job => <LinhaJob key={job.jobid} job={job} />)}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-600 mt-1">
        Atualizado a cada 60s. Duração ≤ 20ms indica fire-and-forget (net.http_post) — status "ok" não reflete resultado real da edge function.
      </p>
    </div>
  );
}
