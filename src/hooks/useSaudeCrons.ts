import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type CronJob = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  ultimo_status: 'succeeded' | 'failed' | null;
  ultima_execucao_brt: string | null;
  ultima_duracao_ms: number | null;
  return_message: string | null;
};

export function useSaudeCrons() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setErro(null);
    const { data, error } = await supabase.rpc('get_cron_health');
    if (error) {
      setErro(error.message);
    } else {
      setJobs((data as CronJob[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    buscar();
    const intervalo = setInterval(buscar, 60_000);
    return () => clearInterval(intervalo);
  }, [buscar]);

  return { jobs, loading, erro, refetch: buscar };
}
