// monitor-saude-webhook
// Chamado pelo pg_cron a cada 10 minutos.
// Pinga webhook-whatsapp-inbox?_health=1 SEM autenticação.
// Se receber != 200 (ex: 401 por verify_jwt errado), envia alerta WhatsApp.
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Caixas a monitorar: [caixa_id, nome]
const CAIXAS_MONITORADAS = [
  [3, 'Sol - Sucesso do Aluno'],
];

// Número que recebe o alerta (Luciano)
const NUMERO_ALERTA = '5521966583325';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const problemas: string[] = [];

  for (const [caixaId, nome] of CAIXAS_MONITORADAS) {
    const healthUrl = `${SUPABASE_URL}/functions/v1/webhook-whatsapp-inbox?caixa_id=${caixaId}&_health=1`;

    let status = 0;
    let erro = '';
    try {
      // Chamada SEM Authorization header — simula exatamente o que UAZAPI faz
      const resp = await fetch(healthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      status = resp.status;
    } catch (e) {
      erro = e.message;
      status = 0;
    }

    console.log(`[monitor] caixa_id=${caixaId} (${nome}) → status=${status} erro=${erro}`);

    if (status !== 200) {
      problemas.push(`*${nome}* (caixa_id=${caixaId}): HTTP ${status || 'timeout'} ${erro}`);
    }
  }

  if (problemas.length > 0) {
    const mensagem =
      `🚨 *Alerta: Webhook de recebimento de mensagens com problema*\n\n` +
      problemas.join('\n') +
      `\n\n⚠️ Mensagens do WhatsApp podem NÃO estar chegando na caixa de entrada.\n` +
      `Causa mais comum: deploy sem \`--no-verify-jwt\`.\n` +
      `Fix: \`npx supabase functions deploy webhook-whatsapp-inbox --project-ref ouqwbbermlzqqvtqwlul --no-verify-jwt\``;

    // Buscar caixa de envio (qualquer admin com verify_jwt false — enviar-mensagem-admin)
    const { data: caixas } = await supabase
      .from('whatsapp_caixas')
      .select('id, numero, uazapi_url, uazapi_token')
      .eq('funcao', 'administrativo')
      .eq('ativo', true)
      .limit(1)
      .single();

    if (caixas?.uazapi_url && caixas?.uazapi_token) {
      await fetch(`${caixas.uazapi_url}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: caixas.uazapi_token },
        body: JSON.stringify({
          phone: NUMERO_ALERTA,
          message: mensagem,
        }),
      });
      console.log(`[monitor] Alerta enviado para ${NUMERO_ALERTA}`);
    } else {
      console.error('[monitor] Não foi possível obter credenciais UAZAPI para enviar alerta');
    }
  }

  return new Response(
    JSON.stringify({
      ok: problemas.length === 0,
      problemas,
      checadas: CAIXAS_MONITORADAS.length,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
