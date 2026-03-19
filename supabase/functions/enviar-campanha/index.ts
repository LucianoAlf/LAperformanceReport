/**
 * enviar-campanha — despacha templates em lote para contatos pendentes.
 * Processa em batches de 50, respeitando rate limits (~80 msg/seg).
 * Ao finalizar um batch, se ainda houver pendentes, invoca a si mesmo.
 *
 * POST body: { campanha_id: string }
 * Chamada internamente pelo controle-campanha (service role).
 */
import { createServiceClient } from '../_shared/supabase-client.ts'
import { enviarMensagemTemplate } from '../_shared/whatsapp-meta-api.ts'

const BATCH_SIZE = 50
const DELAY_MS = 100

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { campanha_id } = await req.json()
    if (!campanha_id) return jsonError('campanha_id é obrigatório', 400)

    const supabase = createServiceClient()

    // 1. Buscar campanha + template + número Meta
    const { data: campanha, error: campErr } = await supabase
      .from('campanhas')
      .select(`
        *,
        template:templates_meta(*),
        numero:numeros_meta(id, phone_number_id, access_token, unidade_id)
      `)
      .eq('id', campanha_id)
      .single()

    if (campErr || !campanha) return jsonError('Campanha não encontrada', 404)
    if (campanha.status !== 'executando') {
      return jsonError('Campanha não está em execução', 400)
    }

    const config = {
      phone_number_id: campanha.numero.phone_number_id,
      access_token: campanha.numero.access_token,
    }

    // 2. Buscar contatos pendentes (batch)
    const { data: contatos, error: contatosErr } = await supabase
      .from('campanha_contatos')
      .select('*')
      .eq('campanha_id', campanha_id)
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (contatosErr) throw new Error('Falha ao buscar contatos: ' + contatosErr.message)

    // Sem contatos pendentes → campanha concluída
    if (!contatos || contatos.length === 0) {
      await supabase
        .from('campanhas')
        .update({ status: 'concluida', concluida_em: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', campanha_id)
      return json({ success: true, message: 'Campanha concluída', enviados: 0, falhas: 0 })
    }

    let enviados = 0
    let falhas = 0

    // 3. Processar cada contato
    for (const contato of contatos) {
      // Re-checar status da campanha a cada 10 envios (pode ter sido pausada)
      if ((enviados + falhas) > 0 && (enviados + falhas) % 10 === 0) {
        const { data: statusAtual } = await supabase
          .from('campanhas')
          .select('status')
          .eq('id', campanha_id)
          .single()
        if (statusAtual?.status !== 'executando') {
          console.log('Campanha pausada/cancelada durante execução')
          break
        }
      }

      try {
        const componentes = montarComponentes(campanha.template, campanha.mapeamento_variaveis, contato)

        const waResponse = await enviarMensagemTemplate(
          config,
          contato.telefone,
          campanha.template.nome,
          campanha.template.idioma ?? 'pt_BR',
          componentes,
        )

        const metaMessageId = waResponse?.messages?.[0]?.id ?? null

        await supabase
          .from('campanha_contatos')
          .update({ status: 'enviado', enviado_em: new Date().toISOString(), meta_message_id: metaMessageId })
          .eq('id', contato.id)

        // Inserir em mensagens_campanha — com conteúdo real do template
        const textoTemplate = renderizarTextoTemplate(campanha.template, campanha.mapeamento_variaveis, contato)
        await upsertConversaMensagem(supabase, {
          unidadeId: campanha.numero.unidade_id ?? campanha.unidade_id,
          numeroMetaId: campanha.numero.id,
          telefone: contato.telefone,
          metaMessageId,
          texto: textoTemplate,
          campanhaId: campanha_id,
        })

        enviados++
      } catch (sendErr) {
        console.error(`Falha ao enviar para ${contato.telefone}:`, sendErr)
        await supabase
          .from('campanha_contatos')
          .update({ status: 'falha', erro: (sendErr as Error).message })
          .eq('id', contato.id)
        falhas++
      }

      await delay(DELAY_MS)
    }

    // 4. Atualizar contadores da campanha
    const { data: campanhaAtual } = await supabase
      .from('campanhas')
      .select('enviados, falhas, status')
      .eq('id', campanha_id)
      .single()

    if (campanhaAtual) {
      await supabase
        .from('campanhas')
        .update({
          enviados: (campanhaAtual.enviados ?? 0) + enviados,
          falhas: (campanhaAtual.falhas ?? 0) + falhas,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campanha_id)
    }

    // 5. Verificar se há mais pendentes
    const { count: pendentes } = await supabase
      .from('campanha_contatos')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', campanha_id)
      .eq('status', 'pendente')

    const { data: statusFinal } = await supabase
      .from('campanhas')
      .select('status')
      .eq('id', campanha_id)
      .single()

    if ((pendentes ?? 0) > 0 && statusFinal?.status === 'executando') {
      // Auto-invocar para próximo batch
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      fetch(`${supabaseUrl}/functions/v1/enviar-campanha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ campanha_id }),
      }).catch(err => console.error('Erro ao agendar próximo lote:', err))
    } else if ((pendentes ?? 0) === 0) {
      await supabase
        .from('campanhas')
        .update({ status: 'concluida', concluida_em: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', campanha_id)
    }

    return json({ success: true, batch: { enviados, falhas }, pendentes: pendentes ?? 0 })
  } catch (err) {
    console.error('enviar-campanha error:', err)
    return jsonError((err as Error).message, 500)
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Monta componentes do template com as variáveis mapeadas.
 * mapeamento_variaveis ex: { "1": "nome", "2": "empresa" }
 */
function montarComponentes(
  template: any,
  mapeamento: Record<string, string> | null,
  contato: any,
): any[] | undefined {
  if (!mapeamento || Object.keys(mapeamento).length === 0) return undefined

  const vars = contato.variaveis ?? {}
  const chaves = Object.keys(mapeamento).sort((a, b) => parseInt(a) - parseInt(b))
  const parametros = chaves.map(k => {
    const campo = mapeamento[k]
    const valor = vars[campo] ?? contato[campo] ?? ''
    return { type: 'text', text: String(valor) }
  })

  if (parametros.length === 0) return undefined

  const componentes: any[] = []
  const tplComps = template.componentes ?? []

  const headerComp = tplComps.find((c: any) => c.type === 'HEADER')
  if (headerComp?.example?.header_text?.length) {
    const headerCount = headerComp.example.header_text.length
    componentes.push({ type: 'header', parameters: parametros.splice(0, headerCount) })
  }

  if (parametros.length > 0) {
    componentes.push({ type: 'body', parameters: parametros })
  }

  return componentes.length > 0 ? componentes : undefined
}

/**
 * Renderiza o body_text do template substituindo {{1}}, {{2}} pelas variáveis do contato.
 */
function renderizarTextoTemplate(
  template: any,
  mapeamento: Record<string, string> | null,
  contato: any,
): string {
  let texto = template.body_text ?? ''
  if (!texto) return `[Template: ${template.nome}]`

  if (mapeamento) {
    const vars = contato.variaveis ?? {}
    for (const [idx, campo] of Object.entries(mapeamento)) {
      const valor = vars[campo] ?? contato[campo] ?? ''
      texto = texto.replace(`{{${idx}}}`, String(valor))
    }
  }

  return texto
}

async function upsertConversaMensagem(
  supabase: any,
  params: {
    unidadeId: string
    numeroMetaId: string
    telefone: string
    metaMessageId: string | null
    texto: string
    campanhaId: string
  },
) {
  const { unidadeId, numeroMetaId, telefone, metaMessageId, texto, campanhaId } = params

  // Upsert conversa
  const { data: conversa } = await supabase
    .from('conversas_campanha')
    .upsert(
      {
        unidade_id: unidadeId,
        numero_meta_id: numeroMetaId,
        telefone,
        ultima_mensagem_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'numero_meta_id,telefone', ignoreDuplicates: false },
    )
    .select('id')
    .single()

  if (!conversa) return

  await supabase
    .from('mensagens_campanha')
    .insert({
      conversa_id: conversa.id,
      campanha_id: campanhaId,
      telefone,
      direcao: 'outbound',
      tipo: 'template',
      texto,
      meta_message_id: metaMessageId,
      status: 'sent',
    })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  })
}
function jsonError(message: string, status: number) {
  return json({ error: message }, status)
}
