/// <reference lib="deno.ns" />
// Edge Function: ir-whatsapp  (publica, verify_jwt=false)
//
// GET /functions/v1/ir-whatsapp?u=barra|cg|recreio&p=school|kids&o=bio|site|lp
//                              [&gclid=&gbraid=&wbraid=&fbclid=&fbp=&fbc=&utm_*=&pg=<url da pagina>]
//
// Registra o clique e responde 302 para o WhatsApp da unidade, com o texto pre-preenchido +
// um codigo INVISIVEL no fim. O lead nao ve nada; se editar o texto visivel, o codigo
// (repetido 3x) tende a sobreviver. Quem casa o codigo com o telefone e `rastreador-casar`.
//
// ⚠️ REGRA QUE MANDA AQUI: o clique do lead NUNCA pode quebrar. Qualquer falha (banco fora,
// parametro estranho, bot) cai no redirect SEM codigo -- perder a atribuicao e aceitavel,
// perder o lead nao. Mesmo principio de "registrar nunca derruba o envio".
//
// ⚠️ O destino NAO vem da URL. Telefone e texto saem de tabelas fixas abaixo, escolhidas por
// whitelist -- aceitar `?to=` faria desta funcao um open redirect com o dominio da escola.
//
// ⚠️ HEAD e preview de link (WhatsApp, Facebook, Slack, buscadores) redirecionam sem gravar:
// senao cada compartilhamento do link viraria um "clique" fantasma.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { codigoInvisivel, gerarCodigo } from '../_shared/rastreador.ts';

// Caixas "Mila" de cada unidade (inboxes 147/155/148 do Chatwoot).
const UNIDADES: Record<string, { telefone: string; nome: string }> = {
  barra: { telefone: '552139550932', nome: 'Centro Metropolitano Barra' },
  cg: { telefone: '5521982956809', nome: 'Campo Grande' },
  recreio: { telefone: '552139552420', nome: 'Recreio' },
};
const MARCAS: Record<string, string> = { school: 'LA Music School', kids: 'LA Music Kids' };
const ORIGENS = new Set(['bio', 'site', 'lp', 'outro']);
const UNIDADE_PADRAO = 'barra';

const BOT = /bot|crawler|spider|preview|facebookexternalhit|facebot|whatsapp\/|slackbot|telegrambot|embedly|curl|wget|python-requests|headless/i;

const limpa = (v: string | null, max = 300): string | null => {
  if (!v) return null;
  const s = v.trim().slice(0, max);
  return s.length ? s : null;
};

function textoVisivel(unidade: string, publico: string): string {
  const u = UNIDADES[unidade];
  return `Quero informações das aulas de música na ${MARCAS[publico]} ${u.nome}`;
}

function destino(telefone: string, texto: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;
}

function redirecionar(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams;

  const unidade = (q.get('u') ?? '').toLowerCase();
  const unidadeOk = unidade in UNIDADES ? unidade : UNIDADE_PADRAO;
  const publicoRaw = (q.get('p') ?? 'school').toLowerCase();
  const publico = publicoRaw in MARCAS ? publicoRaw : 'school';
  const origemRaw = (q.get('o') ?? 'outro').toLowerCase();
  const origem = ORIGENS.has(origemRaw) ? origemRaw : 'outro';

  const texto = textoVisivel(unidadeOk, publico);
  const telefone = UNIDADES[unidadeOk].telefone;
  const semCodigo = destino(telefone, texto);

  const ua = req.headers.get('user-agent') ?? '';
  if (req.method !== 'GET' || BOT.test(ua)) return redirecionar(semCodigo);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const codigo = gerarCodigo();

    const { error } = await supabase.from('rastreio_cliques').insert({
      codigo,
      origem,
      unidade: unidadeOk,
      publico,
      destino_telefone: telefone,
      texto_visivel: texto,
      gclid: limpa(q.get('gclid')),
      gbraid: limpa(q.get('gbraid')),
      wbraid: limpa(q.get('wbraid')),
      fbclid: limpa(q.get('fbclid')),
      fbp: limpa(q.get('fbp'), 100),
      fbc: limpa(q.get('fbc'), 200),
      utm_source: limpa(q.get('utm_source'), 100),
      utm_medium: limpa(q.get('utm_medium'), 100),
      utm_campaign: limpa(q.get('utm_campaign'), 200),
      utm_content: limpa(q.get('utm_content'), 200),
      utm_term: limpa(q.get('utm_term'), 200),
      page_url_origem: limpa(q.get('pg'), 1000),
      referer: limpa(req.headers.get('referer'), 1000),
      user_agent: limpa(ua, 400),
    });

    if (error) {
      console.error('[ir-whatsapp] falha ao gravar clique:', error.message);
      return redirecionar(semCodigo);
    }

    return redirecionar(destino(telefone, texto + codigoInvisivel(codigo)));
  } catch (e) {
    console.error('[ir-whatsapp]', e instanceof Error ? e.message : e);
    return redirecionar(semCodigo);
  }
});
