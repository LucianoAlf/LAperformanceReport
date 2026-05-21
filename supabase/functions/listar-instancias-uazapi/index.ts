// Edge Function: listar-instancias-uazapi v1
// Chama GET /instance/all no servidor UAZAPI e retorna lista normalizada
// para popular o seletor de instância no CaixasManager.
//
// Auth: verify_jwt=true (acessada via supabase.functions.invoke do front)
// Segredo necessário: UAZAPI_ADMIN_TOKEN (admintoken do servidor)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const UAZAPI_URL = 'https://lamusic.uazapi.com';
const UAZAPI_ADMIN_TOKEN = Deno.env.get('UAZAPI_ADMIN_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type InstanciaRaw = {
  id?: string;
  token?: string;
  status?: string;
  name?: string;
  profileName?: string;
  profilePicUrl?: string;
  owner?: string;
  phone?: string;
  isBusiness?: boolean;
  lastDisconnect?: string;
  lastDisconnectReason?: string;
};

type InstanciaNormalizada = {
  id: string;
  token: string;
  status: string;
  nome: string;
  numero: string | null;
  profile_pic_url: string | null;
  is_business: boolean;
};

function extrairNumero(inst: InstanciaRaw): string | null {
  const candidatos = [inst.phone, inst.owner, inst.name];
  for (const c of candidatos) {
    if (!c) continue;
    const digits = String(c).replace(/\D/g, '');
    if (digits.length >= 10) return digits.startsWith('55') ? digits : `55${digits}`;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!UAZAPI_ADMIN_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'UAZAPI_ADMIN_TOKEN não configurado no servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const resp = await fetch(`${UAZAPI_URL}/instance/all`, {
      method: 'GET',
      headers: { admintoken: UAZAPI_ADMIN_TOKEN },
    });

    if (!resp.ok) {
      const erroTexto = await resp.text();
      return new Response(
        JSON.stringify({ error: `UAZAPI retornou ${resp.status}`, detalhes: erroTexto }),
        { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const raw = await resp.json() as InstanciaRaw[];
    const instancias: InstanciaNormalizada[] = (Array.isArray(raw) ? raw : []).map(inst => ({
      id: inst.id ?? '',
      token: inst.token ?? '',
      status: inst.status ?? 'unknown',
      nome: inst.profileName || inst.name || '(sem nome)',
      numero: extrairNumero(inst),
      profile_pic_url: inst.profilePicUrl ?? null,
      is_business: Boolean(inst.isBusiness),
    }));

    return new Response(
      JSON.stringify({ uazapi_url: UAZAPI_URL, instancias }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: 'Falha ao chamar UAZAPI', detalhes: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
