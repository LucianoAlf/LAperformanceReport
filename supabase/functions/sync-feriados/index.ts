// Edge Function: sync-feriados
// Sincroniza feriados nacionais via BrasilAPI e permite cadastro de feriados municipais/recessos.
// Chamada via pg_cron (1x/ano) ou botão manual no frontend.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FeriadoAPI {
  date: string;
  name: string;
  type: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const ano = body.ano || new Date().getFullYear();

    // 1. Buscar feriados nacionais da BrasilAPI
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
    if (!response.ok) {
      throw new Error(`BrasilAPI retornou ${response.status}`);
    }

    const feriados: FeriadoAPI[] = await response.json();

    // 2. Buscar feriados já desativados manualmente (para não reativar)
    const { data: desativados } = await supabase
      .from('feriados')
      .select('data')
      .eq('ativo', false);

    const datasDesativadas = new Set((desativados || []).map((f: any) => f.data));

    // 3. Upsert feriados — não reativa os desativados manualmente
    let inseridos = 0;
    let ignorados = 0;

    for (const feriado of feriados) {
      if (datasDesativadas.has(feriado.date)) {
        ignorados++;
        continue;
      }

      const { error } = await supabase
        .from('feriados')
        .upsert(
          {
            data: feriado.date,
            nome: feriado.name,
            tipo: 'national',
            ativo: true,
          },
          { onConflict: 'data' }
        );

      if (!error) inseridos++;
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        ano,
        total_api: feriados.length,
        inseridos,
        ignorados_desativados: ignorados,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ sucesso: false, erro: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
