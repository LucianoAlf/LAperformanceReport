/// <reference lib="deno.ns" />

// Sincroniza os participantes dos grupos de comunidade WhatsApp de cada unidade.
// Le comunidade_wa_grupos (ativo), chama GET via POST /group/info na UAZAPI e
// grava a foto atual em comunidade_wa_participantes (estado atual, nao historico:
// quem sai do grupo some na captura seguinte).
//
// Consumo: pg_cron/agendador chamando com service_role (ou botao admin autenticado).
// A RPC get_situacao_alunos_v1 so confia em captura < 2 dias — passado disso ela
// responde 'captura_desatualizada' em vez de dizer que o aluno esta fora do grupo.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

async function validarAcesso(req: Request): Promise<Response | null> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) return null;

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, erro: 'nao autenticado' }, 401);
  if (token === SUPABASE_SERVICE_ROLE_KEY) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return json({ ok: false, erro: 'token invalido' }, 401);
  return null;
}

// Espelha fn_normalizar_telefone_br_key (regra do 9o digito):
// so digitos -> tira DDI 55 -> tira o 9 do celular -> chave = DDD + 8 digitos.
function telefoneBrKey(raw: string | null | undefined): string | null {
  let fone = (raw || '').split('@')[0].replace(/\D/g, '');
  if (fone.startsWith('55') && fone.length >= 12 && fone.length <= 13) fone = fone.slice(2);
  if (fone.length === 11 && fone[2] === '9') fone = fone.slice(0, 2) + fone.slice(3);
  return fone.length === 10 ? fone : null;
}

interface Grupo {
  id: number;
  unidade_id: string;
  jid: string;
  nome: string;
  caixa_id: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'metodo nao permitido' }, 405);

  const bloqueio = await validarAcesso(req);
  if (bloqueio) return bloqueio;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: grupos, error: erroGrupos } = await supabase
    .from('comunidade_wa_grupos')
    .select('id, unidade_id, jid, nome, caixa_id')
    .eq('ativo', true);

  if (erroGrupos) return json({ ok: false, erro: erroGrupos.message }, 500);
  if (!grupos?.length) return json({ ok: true, mensagem: 'nenhum grupo ativo configurado', grupos: [] });

  const capturadoEm = new Date().toISOString();
  const resultados: Record<string, unknown>[] = [];

  for (const grupo of grupos as Grupo[]) {
    try {
      // Sem caixa fixa: cai na caixa administrativa da unidade (a que costuma estar nos grupos)
      const creds = await getUazapiCredentials(supabase, {
        caixaId: grupo.caixa_id ?? undefined,
        funcao: 'administrativo',
        unidadeId: grupo.unidade_id,
      });

      const resposta = await fetch(`${creds.baseUrl}/group/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: creds.token },
        body: JSON.stringify({ groupjid: grupo.jid, force: true }),
      });

      const payload = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        resultados.push({ grupo: grupo.nome, jid: grupo.jid, ok: false, erro: `UAZAPI HTTP ${resposta.status}: ${payload?.error ?? 'sem detalhe'}` });
        continue;
      }

      const participantes: { JID?: string; PhoneNumber?: string; LID?: string }[] =
        Array.isArray(payload?.Participants) ? payload.Participants : [];

      const linhas = participantes
        .map((p) => {
          const original = p.PhoneNumber || p.JID || '';
          const key = telefoneBrKey(original);
          return key ? { grupo_id: grupo.id, telefone_key: key, telefone_original: original.split('@')[0], capturado_em: capturadoEm } : null;
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);

      // dedup por telefone_key dentro da captura (mesmo numero pode aparecer 2x)
      const vistos = new Map(linhas.map((l) => [l.telefone_key, l]));

      // captura vazia NAO pode esvaziar a tabela — grupo suspenso/temporario viraria "todo mundo fora"
      if (!vistos.size) {
        throw new Error('UAZAPI devolveu 0 participantes — captura descartada por seguranca');
      }

      const { error: erroUpsert } = await supabase
        .from('comunidade_wa_participantes')
        .upsert([...vistos.values()], { onConflict: 'grupo_id,telefone_key' });
      if (erroUpsert) throw new Error(erroUpsert.message);

      // quem nao apareceu nesta captura sai da foto atual
      const { error: erroPoda } = await supabase
        .from('comunidade_wa_participantes')
        .delete()
        .eq('grupo_id', grupo.id)
        .lt('capturado_em', capturadoEm);
      if (erroPoda) throw new Error(erroPoda.message);

      resultados.push({ grupo: grupo.nome, jid: grupo.jid, ok: true, participantes: vistos.size, caixa: creds.caixaNome });
    } catch (e) {
      resultados.push({ grupo: grupo.nome, jid: grupo.jid, ok: false, erro: (e as Error).message });
    }
  }

  return json({ ok: resultados.some((r) => r.ok), capturado_em: capturadoEm, grupos: resultados });
});
