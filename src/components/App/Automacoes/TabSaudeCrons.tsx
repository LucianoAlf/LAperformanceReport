// src/components/App/Automacoes/TabSaudeCrons.tsx
import { RefreshCw, CheckCircle2, XCircle, MinusCircle, AlertTriangle } from 'lucide-react';
import { useSaudeCrons, type CronJob } from '@/hooks/useSaudeCrons';
import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

  // "0 H * * *" → "Todo dia HH:00 (BRT)"
  const diariaMatch = expr.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (diariaMatch) {
    const min = diariaMatch[1].padStart(2, '0');
    const hor = diariaMatch[2].padStart(2, '0');
    return `Todo dia ${hor}:${min} (UTC) — ${String((parseInt(hor) - 3 + 24) % 24).padStart(2, '0')}:${min} BRT`;
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

export function TabSaudeCrons() {
  const { jobs, loading, erro, refetch } = useSaudeCrons();

  const falhos = jobs.filter(j => j.active && j.ultimo_status === 'failed').length;

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
                <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Job</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Schedule</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Última execução</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="py-2.5 px-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Duração</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => <LinhaJob key={job.jobid} job={job} />)}
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
