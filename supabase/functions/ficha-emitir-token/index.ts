/// <reference lib="deno.ns" />

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_URL = 'https://la-performance-report.vercel.app/ficha-tecnica/';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type Colaborador = {
  id: number;
  unidade_id: string | null;
  departamento: string | null;
  situacao: string | null;
};

type Usuario = {
  id: number;
  perfil: string | null;
  unidade_id: string | null;
  ativo: boolean | null;
};

type TokenEstado = {
  token: string | null;
  link: string | null;
  ja_existia: boolean;
  ja_respondeu: boolean;
  gerado_em: string | null;
};

type AdminClient = SupabaseClient<any, 'public', any>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function bearerValido(header: string | null): boolean {
  return /^Bearer\s+\S+$/i.test(header ?? '');
}

function idValido(value: unknown): value is number {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function colaboradorIdDaRequest(req: Request, body?: unknown): number | null {
  if (req.method === 'GET') {
    const value = new URL(req.url).searchParams.get('colaborador_id');
    return idValido(value) ? Number(value) : null;
  }

  const value = (body as { colaborador_id?: unknown } | null)?.colaborador_id;
  return idValido(value) ? Number(value) : null;
}

function cargoDoDepartamento(departamento: string | null): 'PROFESSOR' | 'ATENDIMENTO' {
  switch ((departamento ?? '').trim().toLocaleLowerCase('pt-BR')) {
    case 'professores':
      return 'PROFESSOR';
    case 'atendimento':
      return 'ATENDIMENTO';
    default:
      throw new Error('DEPARTAMENTO_SEM_CENARIOS');
  }
}

function linkDoToken(token: string | null): string | null {
  return token ? `${APP_URL}?t=${encodeURIComponent(token)}` : null;
}

function estadoSemToken(jaRespondeu: boolean): TokenEstado {
  return {
    token: null,
    link: null,
    ja_existia: false,
    ja_respondeu: jaRespondeu,
    gerado_em: null,
  };
}

function estadoComToken(token: string, jaExistia: boolean, jaRespondeu: boolean, criadoEm: string): TokenEstado {
  return {
    token,
    link: linkDoToken(token),
    ja_existia: jaExistia,
    ja_respondeu: jaRespondeu,
    gerado_em: criadoEm,
  };
}

async function autenticar(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!bearerValido(authHeader)) return { error: json({ error: 'Nao autenticado' }, 401) };

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: json({ error: 'Configuracao backend indisponivel' }, 503) };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader! } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return { error: json({ error: 'Nao autenticado' }, 401) };

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: usuario, error: usuarioError } = await adminClient
    .from('usuarios')
    .select('id, perfil, unidade_id, ativo')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (usuarioError || !usuario || usuario.ativo !== true) {
    return { error: json({ error: 'Usuario sem permissao' }, 403) };
  }

  return { adminClient, usuario: usuario as Usuario };
}

async function carregarAlvo(adminClient: AdminClient, id: number) {
  const { data, error } = await adminClient
    .from('colaboradores')
    .select('id, unidade_id, departamento, situacao')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return { error: json({ error: 'Colaborador nao encontrado' }, 404) };
  return { colaborador: data as Colaborador };
}

function autorizado(usuario: Usuario, colaborador: Colaborador): boolean {
  if ((usuario.perfil ?? '').toLowerCase() === 'admin') return true;
  return (
    (usuario.perfil ?? '').toLowerCase() === 'unidade' &&
    Boolean(usuario.unidade_id) &&
    usuario.unidade_id === colaborador.unidade_id
  );
}

async function consultarEstado(adminClient: AdminClient, colaborador: Colaborador): Promise<TokenEstado> {
  cargoDoDepartamento(colaborador.departamento);

  const { data: ativo, error: ativoError } = await adminClient
    .from('ficha_tokens')
    .select('token, usado_em, criado_em')
    .eq('colaborador_id', colaborador.id)
    .eq('ativo', true)
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ativoError) throw new Error('TOKEN_STATUS_INDISPONIVEL');
  if (ativo) return estadoComToken(String(ativo.token), true, Boolean(ativo.usado_em), String(ativo.criado_em));

  const { data: respondido, error: respondidoError } = await adminClient
    .from('ficha_tokens')
    .select('id')
    .eq('colaborador_id', colaborador.id)
    .not('usado_em', 'is', null)
    .limit(1)
    .maybeSingle();
  if (respondidoError) throw new Error('TOKEN_STATUS_INDISPONIVEL');
  return estadoSemToken(Boolean(respondido));
}

function erroDaRpc(error: { code?: string; message?: string } | null): Response {
  switch (error?.code) {
    case 'P0001':
      return json({ error: 'Ainda nao ha cenarios para este departamento' }, 409);
    case 'P0002':
      return json({ error: 'Colaborador nao encontrado' }, 404);
    case 'P0003':
      return json({ error: 'Colaborador desligado' }, 409);
    case '22023':
      return json({ error: 'Dados da emissao invalidos' }, 400);
    default:
      return json({ error: 'Nao foi possivel gerar o link da ficha' }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405);

  const auth = await autenticar(req);
  if ('error' in auth) return auth.error;

  let body: unknown = null;
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      return json({ error: 'JSON invalido' }, 400);
    }
  }

  const colaboradorId = colaboradorIdDaRequest(req, body);
  if (colaboradorId === null) return json({ error: 'colaborador_id invalido' }, 400);

  const alvo = await carregarAlvo(auth.adminClient, colaboradorId);
  if ('error' in alvo) return alvo.error;
  if (!autorizado(auth.usuario, alvo.colaborador)) return json({ error: 'Colaborador fora da sua unidade' }, 403);
  if ((alvo.colaborador.situacao ?? '').trim().toLocaleLowerCase('pt-BR') === 'desligado') {
    return json({ error: 'Colaborador desligado' }, 409);
  }

  if (req.method === 'GET') {
    try {
      return json(await consultarEstado(auth.adminClient, alvo.colaborador));
    } catch (error) {
      if (error instanceof Error && error.message === 'DEPARTAMENTO_SEM_CENARIOS') {
        return json({ error: 'Ainda nao ha cenarios para este departamento' }, 409);
      }
      return json({ error: 'Nao foi possivel consultar o estado da ficha' }, 500);
    }
  }

  try {
    cargoDoDepartamento(alvo.colaborador.departamento);
  } catch (error) {
    if (error instanceof Error && error.message === 'DEPARTAMENTO_SEM_CENARIOS') {
      return json({ error: 'Ainda nao ha cenarios para este departamento' }, 409);
    }
    return json({ error: 'Nao foi possivel gerar o link da ficha' }, 500);
  }

  try {
    const { data, error } = await auth.adminClient.rpc('ficha_emitir_token', {
      p_colaborador_id: colaboradorId,
      p_criado_por: auth.usuario.id,
    });
    if (error) return erroDaRpc(error);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return json({ error: 'Nao foi possivel gerar o link da ficha' }, 500);
    const token = row.token ? String(row.token) : null;
    return json({
      token,
      link: linkDoToken(token),
      ja_existia: Boolean(row.ja_existia),
      ja_respondeu: Boolean(row.ja_respondeu),
      gerado_em: row.criado_em ? String(row.criado_em) : null,
    });
  } catch {
    return json({ error: 'Nao foi possivel gerar o link da ficha' }, 500);
  }
});
