import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';

type AlunoRow = {
  id: number;
  nome: string;
  data_nascimento: string | null;
  classificacao: string | null;
  photo_url: string | null;
  status: string | null;
  emusys_student_id: string | null;
};

type StudioPayload = {
  emusys_id: string;
  name: string;
  birth_date: string | null;
  brand: 'la_music_kids' | 'la_music_school';
  active: boolean;
  source: 'la_music_report';
  photo_url?: string;
};

const STUDIO_WEBHOOK_URL =
  'https://rhxqwraqpabgecgojytj.supabase.co/functions/v1/receive-student-data';
const STUDIO_WEBHOOK_KEY = 'la-studio-webhook-2026';
const CHUNK_SIZE = 200;
const BATCH_DELAY_MS = 3000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function buildPayload(aluno: AlunoRow): StudioPayload {
  const payload: StudioPayload = {
    emusys_id: aluno.emusys_student_id?.trim() || String(aluno.id),
    name: aluno.nome,
    birth_date: aluno.data_nascimento,
    brand: aluno.classificacao === 'LAMK' ? 'la_music_kids' : 'la_music_school',
    active: aluno.status === 'ativo',
    source: 'la_music_report',
  };

  if (aluno.photo_url) {
    payload.photo_url = aluno.photo_url;
  }

  return payload;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendBatchToStudio(payloads: StudioPayload[]) {
  const response = await fetch(STUDIO_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-studio-key': STUDIO_WEBHOOK_KEY,
    },
    body: JSON.stringify(payloads),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createServiceClient();

    let body: { aluno_id?: number | string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    let alunos: AlunoRow[] = [];

    if (body.aluno_id !== undefined && body.aluno_id !== null && String(body.aluno_id).trim() !== '') {
      const alunoId = Number(body.aluno_id);
      if (Number.isNaN(alunoId)) {
        return new Response(JSON.stringify({ error: 'aluno_id inválido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('alunos')
        .select('id, nome, data_nascimento, classificacao, photo_url, status, emusys_student_id')
        .eq('id', alunoId)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao buscar aluno ${alunoId}: ${error.message}`);
      }

      if (!data) {
        return new Response(JSON.stringify({ processed: 0, sent: 0, errors: [{ aluno_id: alunoId, message: 'Aluno não encontrado' }] }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      alunos = [data as AlunoRow];
    } else {
      // Sync inicial em lote: inclui ativo + aviso_previo no conjunto, mas marca active=true apenas para status='ativo'.
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from('alunos')
          .select('id, nome, data_nascimento, classificacao, photo_url, status, emusys_student_id')
          .in('status', ['ativo', 'aviso_previo'])
          .order('id', { ascending: true })
          .range(from, to);

        if (error) {
          throw new Error(`Erro ao buscar alunos para sync em lote: ${error.message}`);
        }

        const rows = (data || []) as AlunoRow[];
        alunos.push(...rows);

        if (rows.length < pageSize) {
          break;
        }

        from += pageSize;
      }
    }

    const errors: Array<{ aluno_id: number; message: string }> = [];
    let sent = 0;

    const chunks = chunkArray(alunos, CHUNK_SIZE);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const payloads = chunk.map(buildPayload);

      try {
        await sendBatchToStudio(payloads);
        sent += chunk.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido ao enviar lote para Studio Manager';
        for (const aluno of chunk) {
          errors.push({ aluno_id: aluno.id, message });
        }
      }

      if (i < chunks.length - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    return new Response(
      JSON.stringify({
        processed: alunos.length,
        sent,
        errors: errors.length,
        error_details: errors.slice(0, 100),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[sync-students-studio] Erro geral:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erro interno',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
