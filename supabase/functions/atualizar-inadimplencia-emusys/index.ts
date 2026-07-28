/// <reference lib="deno.ns" />

// Edge Function: atualizar-inadimplencia-emusys
//
// Atualiza SOMENTE aluno_jornada_matricula_disciplina.inadimplente_emusys de uma unidade,
// a partir de contrato_atual.inadimplente de GET /matriculas?status=ativa.
//
// Existe para o botão "Atualizar agora" do banner de inadimplência na Lista de Alunos:
// o dado normalmente vem do sync-matriculas-emusys das 02h BRT, e este endpoint permite
// forçar o refresh sob demanda sem rodar a varredura inteira (que também faz conciliação,
// leva ~45s por unidade e é restrita a usuários técnicos).
//
// ⚠️ NÃO cria linha nem grava nenhum outro campo: faz UPDATE em linhas que já existem,
// casando por (unidade_id, emusys_matricula_id). A jornada continua sendo criada e mantida
// exclusivamente pelo sync-matriculas-emusys e pelo webhook processar-matricula-emusys.
//
// ⚠️ verify_jwt = false em supabase/config.toml, com a autenticação feita AQUI DENTRO.
// Isso é obrigatório: a antecessora (sync-inadimplencia-emusys) ficou com verify_jwt=true
// e seus 9 crons, que mandavam só x-sync-token, tomavam 401 no gateway antes do código
// rodar -- falha silenciosa de 13 dias, porque o pg_cron só avalia se o net.http_post foi
// enfileirado. Ver migration 20260728221547_aposentar_inadimplencia_emusys_cache.sql.

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
  cg: {
    nome: 'Campo Grande',
    id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    token: Deno.env.get('EMUSYS_TOKEN_CAMPO_GRANDE')?.trim() || requiredEnv('EMUSYS_TOKEN_CG'),
  },
  recreio: { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: requiredEnv('EMUSYS_TOKEN_RECREIO') },
  barra: { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: requiredEnv('EMUSYS_TOKEN_BARRA') },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Leitura de cache operacional: qualquer usuário autenticado pode disparar (o botão fica
// no banner que a equipe toda enxerga). Diferente do sync-matriculas-emusys, que escreve
// dado de negócio e por isso restringe a técnicos.
async function validarAcesso(req: Request): Promise<Response | null> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) return null;

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ erro: 'nao autenticado' }, 401);
  if (token === SUPABASE_SERVICE_ROLE_KEY) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return json({ erro: 'token invalido' }, 401);
  return null;
}

async function buscarInadimplencia(token: string) {
  const inadimplentes: number[] = [];
  const adimplentes: number[] = [];
  let cursor = '';
  let completo = false;

  for (let pagina = 0; pagina < 200; pagina++) {
    const url = `${EMUSYS_API}/matriculas?status=ativa&limite=50${cursor ? `&cursor=${cursor}` : ''}`;
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { token } });
    } catch (erro) {
      console.error(`[atualizar-inadimplencia] falha de rede na pagina ${pagina + 1}:`, erro);
      break;
    }
    if (!resp.ok) {
      console.error(`[atualizar-inadimplencia] API respondeu ${resp.status} na pagina ${pagina + 1}`);
      break;
    }

    const body = await resp.json();
    for (const m of body.items || []) {
      const id = Number(m.id);
      if (!Number.isFinite(id)) continue;
      (m.contrato_atual?.inadimplente === true ? inadimplentes : adimplentes).push(id);
    }

    if (!body.paginacao?.tem_mais || !body.paginacao?.proximo_cursor) {
      completo = true;
      break;
    }
    cursor = body.paginacao.proximo_cursor;
    await sleep(1100); // rate limit da API: 60 req/min por IP
  }

  return { inadimplentes, adimplentes, completo };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const bloqueio = await validarAcesso(req);
  if (bloqueio) return bloqueio;

  const alvo = new URL(req.url).searchParams.get('u') || '';
  const unidade = UNIDADES[alvo];
  if (!unidade) return json({ erro: 'unidade invalida; use ?u=cg|recreio|barra' }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { inadimplentes, adimplentes, completo } = await buscarInadimplencia(unidade.token);

  // Paginação incompleta significa foto parcial da unidade: gravar assim marcaria como
  // adimplente quem simplesmente não foi buscado. Melhor não escrever nada e avisar.
  if (!completo) {
    return json({
      unidade: unidade.nome,
      erro: 'paginacao incompleta na API do Emusys; nada foi gravado',
      lidas: inadimplentes.length + adimplentes.length,
    }, 502);
  }

  // Dois UPDATEs em lote (não upsert): só mexe em linha que já existe, e só neste campo.
  const CHUNK = 200;
  let atualizadas = 0;
  for (const [valor, ids] of [[true, inadimplentes], [false, adimplentes]] as const) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('aluno_jornada_matricula_disciplina')
        .update({ inadimplente_emusys: valor })
        .eq('unidade_id', unidade.id)
        .in('emusys_matricula_id', ids.slice(i, i + CHUNK))
        .select('id');
      if (error) return json({ unidade: unidade.nome, erro: `update falhou: ${error.message}` }, 500);
      atualizadas += data?.length || 0;
    }
  }

  return json({
    unidade: unidade.nome,
    matriculas_lidas: inadimplentes.length + adimplentes.length,
    inadimplentes: inadimplentes.length,
    linhas_jornada_atualizadas: atualizadas,
  });
});
