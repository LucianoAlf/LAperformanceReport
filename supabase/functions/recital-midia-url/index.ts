// Edge Function: recital-midia-url
// Devolve uma URL assinada de um MP3 do bucket `recital-playback` (bucket do LA Teacher,
// privado). O LA Report não escreve lá — só lê, e só depois de provar que quem pediu
// enxerga o evento dono do relatório.
//
// Por que edge e não signed URL direto no client: a policy do bucket conhece professor e
// coordenação do LA Teacher, não o ADM do LA Report. A assinatura sai com service_role,
// mas SÓ depois de `fn_evento_pode_ver` (a mesma regra das policies do módulo Eventos)
// validar o chamador — com o JWT dele, não com o service.
//
// Contrato: POST { path: "<relatorio_id>/<arquivo>.mp3" } → { url }. O prefixo numérico é
// o `relatorio_anual.id`; o evento se resolve por `relatorio_anual.evento_id`.
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'recital-playback';
const URL_VALIDA_SEGUNDOS = 3600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  let path: string;
  try {
    path = String((await req.json())?.path ?? '');
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  // `<relatorio_id>/<arquivo>`: o prefixo decide de qual evento o arquivo é — sem ele
  // não há como checar escopo, e um path solto seria "assinatura a pedido".
  const m = /^(\d+)\/(.+)$/u.exec(path);
  if (!m || m[2].includes('..')) return json({ error: 'invalid_path' }, 400);
  const relatorioId = Number(m[1]);

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Cliente com o JWT do chamador: `fn_evento_pode_ver` lê auth.uid() de dentro, então a
  // checagem tem de sair por ESTE client — a service_role passaria de graça.
  const comoUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: usuario, error: erroAuth } = await comoUsuario.auth.getUser();
  if (erroAuth || !usuario?.user) return json({ error: 'unauthorized' }, 401);

  const { data: relatorio, error: erroRel } = await service
    .from('relatorio_anual')
    .select('id, evento_id')
    .eq('id', relatorioId)
    .maybeSingle();
  if (erroRel) return json({ error: erroRel.message }, 500);
  if (!relatorio?.evento_id) return json({ error: 'playback_sem_evento' }, 404);

  const { data: podeVer, error: erroEscopo } = await comoUsuario.rpc('fn_evento_pode_ver', {
    p_evento_id: relatorio.evento_id,
  });
  if (erroEscopo) return json({ error: erroEscopo.message }, 500);
  if (!podeVer) return json({ error: 'forbidden' }, 403);

  const { data: assinada, error: erroSign } = await service.storage
    .from(BUCKET)
    .createSignedUrl(path, URL_VALIDA_SEGUNDOS);
  if (erroSign) return json({ error: erroSign.message }, 404);

  return json({ url: assinada.signedUrl });
});
