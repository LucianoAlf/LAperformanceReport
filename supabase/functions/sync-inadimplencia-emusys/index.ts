/// <reference lib="deno.ns" />

// Edge Function: sync-inadimplencia-emusys
// Cache de inadimplencia/valor real (contrato_atual.inadimplente / valor_mensalidade) por
// matricula ATIVA, vindo da API do Emusys. Processa UMA unidade por invocacao (?u=cg|recreio|barra),
// mesmo padrao de sync-matriculas-emusys, para caber no idle timeout de 150s apesar do
// throttle do rate limit da API (60 req/min).
//
// So le da API -- nunca escreve em alunos.status_pagamento/valor_parcela. Correcao continua manual.
// Spec: docs/superpowers/specs/2026-07-15-inadimplencia-emusys-tempo-real-design.md

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';

const EMUSYS_API = 'https://api.emusys.com.br/v1';
const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
};
const UNIDADES: Record<string, { nome: string; id: string; token: string }> = {
  cg: { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: requiredEnv('EMUSYS_TOKEN_CG') },
  recreio: { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: requiredEnv('EMUSYS_TOKEN_RECREIO') },
  barra: { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: requiredEnv('EMUSYS_TOKEN_BARRA') },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Guard de acesso: cron (x-sync-token) OU qualquer usuario autenticado (o botao "Atualizar
// agora" e usado pela equipe toda -- diferente de sync-matriculas-emusys, que so escreve
// dado de negocio e por isso restringe a tecnicos; aqui e so cache de leitura).
async function validarAcesso(req: Request): Promise<Response | null> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) return null;

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return new Response(JSON.stringify({ erro: 'nao autenticado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (token === SUPABASE_SERVICE_ROLE_KEY) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return new Response(JSON.stringify({ erro: 'token invalido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return null;
}

interface MatriculaAtiva {
  id: number;
  inadimplente: boolean;
  valor_mensalidade: number | null;
  forma_pagamento: string | null;
}

async function fetchMatriculasAtivas(token: string): Promise<{ items: MatriculaAtiva[]; completo: boolean }> {
  const items: MatriculaAtiva[] = [];
  let cursor = '';
  let completo = false;

  for (let i = 0; i < 200; i++) {
    const url = `${EMUSYS_API}/matriculas?status=ativa&limite=50${cursor ? `&cursor=${cursor}` : ''}`;
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { token } });
    } catch (fetchError) {
      console.error('Falha de rede na paginacao de matriculas ativas:', fetchError);
      break; // paginacao incompleta -- completo fica false
    }
    if (!resp.ok) {
      console.error(`API respondeu ${resp.status} na pagina ${i + 1}`);
      break;
    }
    const json = await resp.json();
    for (const m of json.items || []) {
      items.push({
        id: Number(m.id),
        inadimplente: m.contrato_atual?.inadimplente === true,
        valor_mensalidade: m.contrato_atual?.valor_mensalidade ?? null,
        forma_pagamento: m.contrato_atual?.forma_pagamento || null,
      });
    }
    if (!json.paginacao?.tem_mais || !json.paginacao?.proximo_cursor) {
      completo = true;
      break;
    }
    cursor = json.paginacao.proximo_cursor;
    await sleep(1100); // throttle: rate limit 60/min por IP
  }

  return { items, completo };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const bloqueio = await validarAcesso(req);
  if (bloqueio) return bloqueio;

  const alvo = new URL(req.url).searchParams.get('u') || '';
  const u = UNIDADES[alvo];
  if (!u) {
    return new Response(JSON.stringify({ erro: 'unidade invalida; use ?u=cg|recreio|barra' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Guard contra chamadas repetidas: se atualizou ha menos de 5min, nao rechama a API.
  const { data: ultimaAtualizacao } = await supabase
    .from('inadimplencia_emusys_cache')
    .select('atualizado_em')
    .eq('unidade_id', u.id)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ultimaAtualizacao?.atualizado_em) {
    const minutosDesde = (Date.now() - new Date(ultimaAtualizacao.atualizado_em).getTime()) / 60000;
    if (minutosDesde < 5) {
      const { count } = await supabase
        .from('inadimplencia_emusys_cache')
        .select('*', { count: 'exact', head: true })
        .eq('unidade_id', u.id);
      const { count: inadimplentesCount } = await supabase
        .from('inadimplencia_emusys_cache')
        .select('*', { count: 'exact', head: true })
        .eq('unidade_id', u.id)
        .eq('inadimplente', true);
      return new Response(JSON.stringify({
        unidade: u.nome,
        throttled: true,
        total_matriculas: count || 0,
        inadimplentes: inadimplentesCount || 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const { items, completo } = await fetchMatriculasAtivas(u.token);

  const agora = new Date().toISOString();
  let inadimplentes = 0;
  const rows = items.map((m) => {
    if (m.inadimplente) inadimplentes++;
    return {
      unidade_id: u.id,
      emusys_matricula_id: String(m.id),
      inadimplente: m.inadimplente,
      valor_mensalidade_emusys: m.valor_mensalidade,
      forma_pagamento_emusys: m.forma_pagamento,
      atualizado_em: agora,
    };
  });

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase
      .from('inadimplencia_emusys_cache')
      .upsert(chunk, { onConflict: 'unidade_id,emusys_matricula_id' });
    if (error) {
      return new Response(JSON.stringify({ erro: `upsert falhou: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let deletados = 0;
  // So remove fantasmas se a paginacao terminou 100% -- senao um erro no meio apagaria
  // matricula legitima que so nao foi buscada ainda nesta rodada.
  if (completo && items.length > 0) {
    const idsAtuais = items.map((m) => String(m.id));
    const { data: removidos, error: deleteError } = await supabase
      .from('inadimplencia_emusys_cache')
      .delete()
      .eq('unidade_id', u.id)
      .not('emusys_matricula_id', 'in', `(${idsAtuais.map((id) => `"${id}"`).join(',')})`)
      .select('emusys_matricula_id');
    if (deleteError) console.error('Falha no delete-diff:', deleteError.message);
    deletados = removidos?.length || 0;
  }

  return new Response(JSON.stringify({
    unidade: u.nome,
    total_matriculas: items.length,
    inadimplentes,
    paginacao_completa: completo,
    deletados,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
