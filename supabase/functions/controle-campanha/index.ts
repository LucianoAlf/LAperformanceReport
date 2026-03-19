/**
 * controle-campanha — inicia, pausa ou retoma uma campanha.
 * Ao iniciar/retomar, dispara o enviar-campanha de forma assíncrona.
 *
 * POST body: { campanha_id: string, action: 'iniciar' | 'pausar' | 'retomar' }
 */
import { createServiceClient, createUserClient } from '../_shared/supabase-client.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Token de autenticação ausente', 401)

    const userClient = createUserClient(authHeader)
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return jsonError('Não autorizado', 401)

    const { campanha_id, action } = await req.json()
    if (!campanha_id || !action) return jsonError('campanha_id e action são obrigatórios', 400)
    if (!['iniciar', 'pausar', 'retomar'].includes(action)) {
      return jsonError('action deve ser: iniciar, pausar ou retomar', 400)
    }

    const supabase = createServiceClient()

    // Verificar permissão do usuário
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('perfil, unidade_id')
      .eq('auth_user_id', user.id)
      .single()
    if (!usuario) return jsonError('Usuário não encontrado', 403)

    // Buscar campanha
    const { data: campanha, error: campErr } = await supabase
      .from('campanhas')
      .select('*')
      .eq('id', campanha_id)
      .single()
    if (campErr || !campanha) return jsonError('Campanha não encontrada', 404)

    // Verificar acesso à unidade
    if (usuario.perfil !== 'admin' && campanha.unidade_id !== usuario.unidade_id) {
      return jsonError('Acesso negado a esta campanha', 403)
    }

    // Validar transição de status
    const agora = new Date().toISOString()
    let updateData: Record<string, unknown> = {}

    if (action === 'iniciar') {
      if (campanha.status !== 'rascunho') {
        return jsonError('Apenas campanhas em rascunho podem ser iniciadas', 400)
      }
      updateData = { status: 'executando', iniciada_em: agora, updated_at: agora }
    } else if (action === 'pausar') {
      if (campanha.status !== 'executando') {
        return jsonError('Apenas campanhas em execução podem ser pausadas', 400)
      }
      updateData = { status: 'pausada', updated_at: agora }
    } else if (action === 'retomar') {
      if (campanha.status !== 'pausada') {
        return jsonError('Apenas campanhas pausadas podem ser retomadas', 400)
      }
      updateData = { status: 'executando', updated_at: agora }
    }

    const { data: campanhaAtualizada, error: updateErr } = await supabase
      .from('campanhas')
      .update(updateData)
      .eq('id', campanha_id)
      .select()
      .single()
    if (updateErr) throw new Error('Falha ao atualizar campanha: ' + updateErr.message)

    // Disparar enviar-campanha de forma assíncrona
    if (action === 'iniciar' || action === 'retomar') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      fetch(`${supabaseUrl}/functions/v1/enviar-campanha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ campanha_id }),
      }).catch(err => console.error('Erro ao invocar enviar-campanha:', err))
    }

    return json({ success: true, campanha: campanhaAtualizada })
  } catch (err) {
    console.error('controle-campanha error:', err)
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
