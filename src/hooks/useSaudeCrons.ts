import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// Status REAL de um sync Emusys, calculado pela idade da última execução
// (função de banco get_saude_syncs_emusys). Diferente do "succeeded" do pg_cron,
// que para jobs net.http_post só reflete o enfileiramento do POST, não o resultado.
export type SyncStatusReal = 'ok' | 'atrasado' | 'nunca' | 'sem_cron' | 'falhou';

type SaudeSyncRow = {
  sync_tipo: string;
  unidade_id: string | null;
  unidade_codigo: string | null;
  unidade_nome: string;
  ultima_execucao: string | null;
  idade_horas: number | null;
  tolerancia_horas: number | null;
  status_real: SyncStatusReal;
};

export type CronJob = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  ultimo_status: 'succeeded' | 'failed' | null;
  ultima_execucao_brt: string | null;
  ultima_duracao_ms: number | null;
  return_message: string | null;
  // true quando o comando do job dispara via net.http_post (fire-and-forget real:
  // pg_cron só confirma o enqueue do POST, nunca o resultado da edge function).
  is_http_post: boolean;
  // Anexado quando o job é um sync Emusys medível por evidência real:
  sync_status_real?: SyncStatusReal;
  sync_ultima_execucao?: string | null;
  sync_idade_horas?: number | null;
  sync_tolerancia_horas?: number | null;
};

// Mapeia o nome do cron job para (tipo de sync, código da unidade).
// Só os syncs Emusys medíveis por evidência entram aqui; o resto fica sem status real.
function mapearJobParaSync(jobname: string): { tipo: string; codigo: string | null } | null {
  let m = jobname.match(/^sync-matriculas-(cg|recreio|barra)$/);
  if (m) return { tipo: 'matriculas', codigo: m[1] };

  m = jobname.match(/^sync-presenca-(cg|recreio|barra)(?:-sabado)?$/);
  if (m) return { tipo: 'presenca', codigo: m[1] };

  if (jobname.startsWith('sync-professores-emusys')) return { tipo: 'professores', codigo: null };
  if (jobname.startsWith('sync-faturas-emusys')) return { tipo: 'faturas', codigo: null };

  // relatorio-diario-20h e relatorio-diario-sabado-16h so enfileiram (fire-and-forget);
  // o status real vem da evidencia de envio em fila_relatorios_whatsapp.
  if (jobname.startsWith('relatorio-diario')) return { tipo: 'relatorio_diario', codigo: null };

  // Alertas de projeto (mesma edge projeto-alertas-whatsapp, evidencia em notificacao_log).
  if (jobname === 'alertas-diarios') return { tipo: 'alerta_diario', codigo: null };
  if (jobname === 'alertas-tarefas-atrasadas') return { tipo: 'alerta_tarefa_atrasada', codigo: null };
  if (jobname === 'resumo-semanal') return { tipo: 'resumo_semanal', codigo: null };

  // Meta Ads: evidencia em meta_ads_cache.enriquecido_em/erro.
  if (jobname === 'enriquecer-meta-ads-diario') return { tipo: 'meta_ads', codigo: null };

  return null;
}

function chaveSync(tipo: string, codigo: string | null): string {
  return `${tipo}:${codigo ?? 'global'}`;
}

export function useSaudeCrons() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setErro(null);
    const [cronRes, syncRes] = await Promise.all([
      supabase.rpc('get_cron_health'),
      supabase.rpc('get_saude_syncs_emusys'),
    ]);

    if (cronRes.error) {
      setErro(cronRes.error.message);
      setLoading(false);
      return;
    }

    // Índice do status real por (tipo, unidade). Se a função de sync falhar,
    // seguimos sem status real (degrada para o comportamento antigo) em vez de quebrar a tela.
    const indiceSync = new Map<string, SaudeSyncRow>();
    if (!syncRes.error && Array.isArray(syncRes.data)) {
      for (const row of syncRes.data as SaudeSyncRow[]) {
        indiceSync.set(chaveSync(row.sync_tipo, row.unidade_codigo), row);
      }
    }

    const jobsAnotados = ((cronRes.data as CronJob[]) ?? []).map((job) => {
      const alvo = mapearJobParaSync(job.jobname);
      if (!alvo) return job;
      const real = indiceSync.get(chaveSync(alvo.tipo, alvo.codigo));
      if (!real) return job;
      return {
        ...job,
        sync_status_real: real.status_real,
        sync_ultima_execucao: real.ultima_execucao,
        sync_idade_horas: real.idade_horas,
        sync_tolerancia_horas: real.tolerancia_horas,
      };
    });

    setJobs(jobsAnotados);
    setLoading(false);
  }, []);

  useEffect(() => {
    buscar();
    const intervalo = setInterval(buscar, 60_000);
    return () => clearInterval(intervalo);
  }, [buscar]);

  return { jobs, loading, erro, refetch: buscar };
}
