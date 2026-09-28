// Edge Function: recital-drive-sync
// Espelha os playbacks do bucket `recital-playback` (LA Teacher) para o Drive do Alf,
// via a ponte Google Apps Script que ele implantou (roda como a conta dele; só grava
// dentro da pasta raiz, protegida por token).
//
// QUEM CHAMA: o cron `recital-drive-sync` (x-sync-token do Vault) ou operador com
// Authorization: Bearer <service_role>. Usuário final NUNCA chama — não é worker dele.
//
// ARMADILHA DO APPS SCRIPT (descoberta 28/09): o POST para /exec dispara o doPost e o
// Google devolve 302 para script.googleusercontent.com/macros/echo — endpoint que só
// aceita GET. fetch com redirect:'follow' re-POSTa lá e morre em 405. Por isso:
// redirect:'manual' no POST e GET explícito no Location (igual ao `curl -L`).
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BRIDGE_URL = Deno.env.get('RECITAL_DRIVE_URL') ?? '';
const BRIDGE_TOKEN = Deno.env.get('RECITAL_DRIVE_TOKEN') ?? '';
const BUCKET = 'recital-playback';
const LIMITE_PADRAO = 10;
const MAX_BYTES = 20 * 1024 * 1024; // MP3 de playback: folga e proteção do body JSON da ponte

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Comparação em tempo constante — igual à do presenca-emusys-escritor.
async function tokensIguaisEmTempoConstante(a: string, b: string) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const xa = new Uint8Array(ha);
  const xb = new Uint8Array(hb);
  let diff = xa.length ^ xb.length;
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    diff |= (xa[i % xa.length] ?? 0) ^ (xb[i % xb.length] ?? 0);
  }
  return diff === 0;
}

function base64De(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(out);
}

function texto(incorporado: unknown, fallback: string) {
  const v = Array.isArray(incorporado) ? incorporado[0] : incorporado;
  const nome = (v as { nome?: string; titulo?: string } | null)?.nome
    ?? (v as { titulo?: string } | null)?.titulo;
  return nome && String(nome).trim() ? String(nome).trim() : fallback;
}

// POST /exec → (302) → GET echo. Devolve o JSON da ponte.
async function chamarPonte(payload: Record<string, unknown>) {
  const r1 = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'manual',
  });
  let resposta = r1;
  const location = r1.headers.get('location');
  if (r1.status >= 300 && r1.status < 400 && location) {
    resposta = await fetch(location); // GET explícito — re-POST aqui morre em 405
  }
  const textoResposta = await resposta.text();
  try {
    return JSON.parse(textoResposta) as { ok?: boolean; erro?: string; id?: string; url?: string };
  } catch {
    return { ok: false, erro: `resposta_nao_json:${resposta.status}:${textoResposta.slice(0, 120)}` };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth interna: bearer service_role OU x-sync-token validado contra o Vault.
  const bearer = req.headers.get('authorization')?.match(/^Bearer[\t ]+([^\s]+)$/i)?.[1] ?? '';
  const syncToken = req.headers.get('x-sync-token')?.trim() ?? '';
  let autorizado = bearer.length > 0 && await tokensIguaisEmTempoConstante(bearer, SERVICE_KEY);
  if (!autorizado && syncToken) {
    const { data, error } = await service.rpc('validar_token_recital_drive_v1', { p_token: syncToken });
    autorizado = !error && data === true;
  }
  if (!autorizado) return json({ error: 'NAO_AUTENTICADO' }, 401);

  if (!BRIDGE_URL || !BRIDGE_TOKEN) return json({ error: 'ponte_nao_configurada' }, 500);

  let corpo: Record<string, unknown> = {};
  try {
    corpo = await req.json();
  } catch { /* body vazio é válido */ }
  const limite = Math.min(Math.max(Number(corpo.limite) || LIMITE_PADRAO, 1), 50);

  // Pendente = tem playback novo do professor que ainda não subiu (ou mudou depois do
  // último envio). Filtro em JS porque PostgREST não compara coluna com coluna.
  let query = service
    .from('evento_apresentacao')
    .select('id, playback_path, aluno_id, evento:evento_id(titulo), unidade:unidade_id(nome), curso:curso_id(nome), professor:professor_id(nome), aluno:aluno_id(nome), drive_playback_path')
    .or('playback_path.not.is.null,drive_playback_path.not.is.null')
    .order('id');
  if (typeof corpo.evento_id === 'number') query = query.eq('evento_id', corpo.evento_id);
  if (typeof corpo.unidade_id === 'string') query = query.eq('unidade_id', corpo.unidade_id);

  const { data: linhas, error: erroLista } = await query;
  if (erroLista) return json({ error: erroLista.message }, 500);

  const pendentes = (linhas ?? [])
    .filter((l) => l.playback_path && l.playback_path !== l.drive_playback_path)
    .slice(0, limite);

  // Professor voltou para "Ao vivo": playback_path zera, mas o arquivo JA esta no
  // Drive — a ponte nao apaga, entao o orfao fica. Marcar na linha e o minimo honesto:
  // sem isso a divergencia so apareceria olhando a pasta.
  const removidos = (linhas ?? [])
    .filter((l) => !l.playback_path && l.drive_playback_path);
  for (const l of removidos) {
    await service.from('evento_apresentacao')
      .update({ drive_erro: 'playback_removido_no_lateacher: arquivo antigo ficou no Drive' })
      .eq('id', l.id);
  }

  const resultado = { ok: true, varridos: linhas?.length ?? 0, processados: 0, enviados: 0, orfaos: removidos.length, erros: [] as Record<string, unknown>[] };

  for (const linha of pendentes) {
    resultado.processados += 1;
    const marcaErro = async (erro: string) => {
      resultado.erros.push({ apresentacao_id: linha.id, erro });
      await service.from('evento_apresentacao')
        .update({ drive_erro: erro.slice(0, 500) })
        .eq('id', linha.id);
    };

    const { data: arquivo, error: erroDownload } = await service.storage
      .from(BUCKET)
      .download(linha.playback_path);
    if (erroDownload || !arquivo) {
      await marcaErro(`download:${erroDownload?.message ?? 'vazio'}`);
      continue;
    }
    const buffer = await arquivo.arrayBuffer();
    if (buffer.byteLength === 0) {
      await marcaErro('arquivo_vazio');
      continue;
    }
    if (buffer.byteLength > MAX_BYTES) {
      await marcaErro(`arquivo_muito_grande:${buffer.byteLength}`);
      continue;
    }

    const unidade = texto(linha.unidade, 'Sem unidade');
    const evento = texto(linha.evento, 'Recital');
    const professor = texto(linha.professor, 'Sem professor');
    const aluno = texto(linha.aluno, `Aluno ${linha.aluno_id ?? ''}`.trim());
    const curso = texto(linha.curso, 'Curso');
    const ext = (linha.playback_path.split('.').pop() ?? 'mp3').toLowerCase();

    const respostaPonte = await chamarPonte({
      token: BRIDGE_TOKEN,
      subpastas: [unidade, evento, professor],
      nome: `${aluno} — ${curso}.${ext}`,
      tipo: arquivo.type || 'audio/mpeg',
      conteudoBase64: base64De(buffer),
    });

    if (!respostaPonte.ok) {
      await marcaErro(`ponte:${respostaPonte.erro ?? 'sem_ok'}`);
      continue;
    }

    resultado.enviados += 1;
    await service.from('evento_apresentacao')
      .update({
        drive_playback_path: linha.playback_path,
        drive_file_id: respostaPonte.id ?? null,
        drive_sincronizado_em: new Date().toISOString(),
        drive_erro: null,
      })
      .eq('id', linha.id);
  }

  return json(resultado);
});
