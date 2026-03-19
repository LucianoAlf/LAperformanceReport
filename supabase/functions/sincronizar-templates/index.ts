/**
 * sincronizar-templates — busca templates aprovados da Meta WABA e salva em templates_meta.
 *
 * POST body: { numero_meta_id: string }
 * Auth: Bearer token do usuário Supabase.
 */
import { createServiceClient, createUserClient } from '../_shared/supabase-client.ts'
import { buscarTemplates } from '../_shared/whatsapp-meta-api.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Auth — verificar usuário logado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonError('Token de autenticação ausente', 401)
    }

    const userClient = createUserClient(authHeader)
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return jsonError('Não autorizado', 401)

    const { numero_meta_id } = await req.json()
    if (!numero_meta_id) return jsonError('numero_meta_id é obrigatório', 400)

    const supabase = createServiceClient()

    // 2. Verificar permissão — usuário precisa ser admin ou da unidade do número
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('perfil, unidade_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!usuario) return jsonError('Usuário não encontrado', 403)

    // 3. Buscar número Meta
    const query = supabase
      .from('numeros_meta')
      .select('id, phone_number_id, access_token, waba_id, unidade_id')
      .eq('id', numero_meta_id)

    if (usuario.perfil !== 'admin') {
      query.eq('unidade_id', usuario.unidade_id)
    }

    const { data: numero, error: numErr } = await query.single()
    if (numErr || !numero) return jsonError('Número Meta não encontrado', 404)
    if (!numero.waba_id) return jsonError('WABA ID não configurado para este número', 400)

    // 4. Buscar templates na Meta API
    const metaTemplates = await buscarTemplates(numero.access_token, numero.waba_id)

    // 5. Upsert em templates_meta
    let sincronizados = 0

    for (const tpl of metaTemplates) {
      const componentes = tpl.components ?? []

      const bodyComp = componentes.find((c: any) => c.type === 'BODY')
      const bodyText = bodyComp?.text ?? null

      const headerComp = componentes.find((c: any) => c.type === 'HEADER')
      const headerType = headerComp?.format ?? null

      const hasButtons = componentes.some((c: any) => c.type === 'BUTTONS')

      const variableMatches: string[] = bodyText?.match(/\{\{(\d+)\}\}/g) ?? []

      const { error: upsertErr } = await supabase
        .from('templates_meta')
        .upsert(
          {
            numero_meta_id: numero.id,
            meta_template_id: tpl.id,
            nome: tpl.name,
            idioma: tpl.language,
            categoria: tpl.category,
            status: tpl.status,
            componentes,
            body_text: bodyText,
            header_type: headerType,
            has_buttons: hasButtons,
            variaveis: variableMatches,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'meta_template_id,numero_meta_id' },
        )

      if (upsertErr) {
        console.error(`Erro ao upsert template ${tpl.name}:`, upsertErr.message)
      } else {
        sincronizados++
      }
    }

    return json({ success: true, sincronizados, total: metaTemplates.length })
  } catch (err) {
    console.error('sincronizar-templates error:', err)
    return jsonError((err as Error).message, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number) {
  return json({ error: message }, status)
}
