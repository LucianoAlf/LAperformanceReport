// Edge Function: projeto-alertas-whatsapp
// Sistema de alertas automáticos via WhatsApp para projetos pedagógicos
// Integração com UAZAPI

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getWhatsAppCredentials, type WhatsAppCreds } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

async function getConfig(tipo: string) {
  const { data } = await supabase
    .from('notificacao_config')
    .select('*')
    .eq('tipo', tipo)
    .single();
  return data;
}

async function getDestinatarios(configId: number) {
  // 1. Buscar destinatários
  const { data: destinatarios, error } = await supabase
    .from('notificacao_destinatarios')
    .select('*')
    .eq('config_id', configId);

  if (error || !destinatarios?.length) {
    console.log('[getDestinatarios] Erro ou sem destinatários:', error, destinatarios);
    return [];
  }

  // 2. Buscar dados de cada pessoa (JOIN polimórfico manual)
  const resultado = await Promise.all(
    destinatarios.map(async (dest) => {
      if (dest.pessoa_tipo === 'usuario') {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('id, nome, telefone')
          .eq('id', dest.pessoa_id)
          .single();
        return { ...dest, usuario, professor: null };
      } else {
        const { data: professor } = await supabase
          .from('professores')
          .select('id, nome, telefone_whatsapp')
          .eq('id', dest.pessoa_id)
          .single();
        return { ...dest, usuario: null, professor };
      }
    })
  );

  console.log('[getDestinatarios] Destinatários encontrados:', resultado.length);
  return resultado;
}

function getPhoneNumber(destinatario: any): string | null {
  if (destinatario.pessoa_tipo === 'usuario') {
    return destinatario.usuario?.telefone || null;
  } else {
    return destinatario.professor?.telefone_whatsapp || null;
  }
}

async function sendWhatsApp(phone: string, message: string, creds: WhatsAppCreds): Promise<boolean> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55')) formattedPhone = '55' + formattedPhone;

    console.log('[sendWhatsApp] Enviando para:', formattedPhone, 'provedor:', creds.provedor);

    let response: Response;
    if (creds.provedor === 'waha') {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.wahaApiKey) headers['X-Api-Key'] = creds.wahaApiKey;
      response = await fetch(`${creds.wahaUrl}/api/sendText`, {
        method: 'POST', headers,
        body: JSON.stringify({ session: creds.wahaSession, chatId: `${formattedPhone}@c.us`, text: message }),
      });
    } else {
      response = await fetch(`${creds.baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': creds.token },
        body: JSON.stringify({ number: formattedPhone, text: message, delay: 0, readchat: true }),
      });
    }
    return response.ok;
  } catch (error) {
    console.error('[WhatsApp] Erro ao enviar:', error);
    return false;
  }
}

async function logNotificacao(params: {
  configId: number;
  tipo: string;
  destinatarioTipo: string;
  destinatarioId: number;
  canal: string;
  mensagem: string;
  projetoId?: number;
  tarefaId?: number;
  status: 'enviado' | 'erro';
  erroMensagem?: string;
}) {
  await supabase.from('notificacao_log').insert({
    config_id: params.configId,
    tipo: params.tipo,
    destinatario_tipo: params.destinatarioTipo,
    destinatario_id: params.destinatarioId,
    canal: params.canal,
    mensagem: params.mensagem,
    projeto_id: params.projetoId,
    tarefa_id: params.tarefaId,
    status: params.status,
    erro_mensagem: params.erroMensagem,
  });
}

// ============================================
// 1. TAREFAS ATRASADAS
// ============================================

async function checkTarefasAtrasadas(creds: WhatsAppCreds) {
  const config = await getConfig('tarefa_atrasada');
  console.log('[checkTarefasAtrasadas] Config:', config);
  if (!config?.ativo) return { skipped: true, reason: 'Config desativada' };

  const destinatarios = await getDestinatarios(config.id);
  console.log('[checkTarefasAtrasadas] Destinatarios:', destinatarios);
  if (destinatarios.length === 0) return { skipped: true, reason: 'Sem destinatários' };

  // Buscar tarefas atrasadas
  const hoje = new Date().toISOString().split('T')[0];
  const { data: tarefas } = await supabase
    .from('projeto_tarefas')
    .select(`
      *,
      projeto:projetos(id, nome, tipo:projeto_tipos(nome, icone))
    `)
    .lt('prazo', hoje)
    .neq('status', 'concluida')
    .neq('status', 'cancelada');

  if (!tarefas?.length) return { enviados: 0, tarefas: 0 };

  let enviados = 0;

  for (const dest of destinatarios) {
    if (dest.canal === 'sistema') continue; // Só WhatsApp por enquanto

    const phone = getPhoneNumber(dest);
    if (!phone) continue;

    // Agrupar tarefas por projeto
    const porProjeto = tarefas.reduce((acc: any, t: any) => {
      const key = t.projeto?.nome || 'Sem projeto';
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});

    let mensagem = `🚨 *ALERTAS DE TAREFAS ATRASADAS*\n\n`;
    mensagem += `Você tem *${tarefas.length} tarefa(s)* atrasada(s):\n\n`;

    for (const [projeto, items] of Object.entries(porProjeto)) {
      mensagem += `📁 *${projeto}*\n`;
      (items as any[]).forEach((t: any) => {
        const dias = Math.floor((new Date().getTime() - new Date(t.prazo).getTime()) / (1000 * 60 * 60 * 24));
        mensagem += `  ⚠️ ${t.titulo} (${dias} dias atrasada)\n`;
      });
      mensagem += `\n`;
    }

    mensagem += `_Acesse o sistema para mais detalhes._`;

    const success = await sendWhatsApp(phone, mensagem, creds);

    await logNotificacao({
      configId: config.id,
      tipo: 'tarefa_atrasada',
      destinatarioTipo: dest.pessoa_tipo,
      destinatarioId: dest.pessoa_id,
      canal: 'whatsapp',
      mensagem,
      status: success ? 'enviado' : 'erro',
      erroMensagem: success ? undefined : 'Falha ao enviar WhatsApp',
    });

    if (success) enviados++;
  }

  return { enviados, tarefas: tarefas.length };
}

// ============================================
// 2. TAREFAS VENCENDO
// ============================================

async function checkTarefasVencendo(creds: WhatsAppCreds) {
  const config = await getConfig('tarefa_vencendo');
  if (!config?.ativo) return { skipped: true, reason: 'Config desativada' };

  const destinatarios = await getDestinatarios(config.id);
  if (destinatarios.length === 0) return { skipped: true, reason: 'Sem destinatários' };

  const hoje = new Date();
  const limite = new Date();
  limite.setDate(hoje.getDate() + (config.antecedencia_dias || 3));

  const { data: tarefas } = await supabase
    .from('projeto_tarefas')
    .select(`
      *,
      projeto:projetos(id, nome, tipo:projeto_tipos(nome, icone))
    `)
    .gte('prazo', hoje.toISOString().split('T')[0])
    .lte('prazo', limite.toISOString().split('T')[0])
    .neq('status', 'concluida')
    .neq('status', 'cancelada');

  if (!tarefas?.length) return { enviados: 0, tarefas: 0 };

  let enviados = 0;

  for (const dest of destinatarios) {
    if (dest.canal === 'sistema') continue;

    const phone = getPhoneNumber(dest);
    if (!phone) continue;

    let mensagem = `📅 *TAREFAS COM PRAZO PRÓXIMO*\n\n`;
    mensagem += `Você tem *${tarefas.length} tarefa(s)* vencendo nos próximos ${config.antecedencia_dias} dias:\n\n`;

    tarefas.forEach((t: any) => {
      const prazo = new Date(t.prazo);
      const diffDias = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      const emoji = diffDias === 0 ? '🔴' : diffDias === 1 ? '🟡' : '🟢';
      const prazoTexto = diffDias === 0 ? 'HOJE' : diffDias === 1 ? 'AMANHÃ' : `em ${diffDias} dias`;
      mensagem += `${emoji} *${t.titulo}*\n`;
      mensagem += `   📁 ${t.projeto?.nome || 'Sem projeto'}\n`;
      mensagem += `   ⏰ Vence ${prazoTexto}\n\n`;
    });

    mensagem += `_Acesse o sistema para gerenciar._`;

    const success = await sendWhatsApp(phone, mensagem, creds);

    await logNotificacao({
      configId: config.id,
      tipo: 'tarefa_vencendo',
      destinatarioTipo: dest.pessoa_tipo,
      destinatarioId: dest.pessoa_id,
      canal: 'whatsapp',
      mensagem,
      status: success ? 'enviado' : 'erro',
    });

    if (success) enviados++;
  }

  return { enviados, tarefas: tarefas.length };
}

// ============================================
// 3. PROJETOS PARADOS
// ============================================

async function checkProjetosParados(creds: WhatsAppCreds) {
  const config = await getConfig('projeto_parado');
  if (!config?.ativo) return { skipped: true, reason: 'Config desativada' };

  const destinatarios = await getDestinatarios(config.id);
  if (destinatarios.length === 0) return { skipped: true, reason: 'Sem destinatários' };

  const diasInatividade = config.dias_inatividade || 7;
  const limite = new Date();
  limite.setDate(limite.getDate() - diasInatividade);

  // Projetos que não tiveram tarefas concluídas recentemente
  const { data: projetos } = await supabase
    .from('projetos')
    .select(`
      *,
      tipo:projeto_tipos(nome, icone),
      tarefas:projeto_tarefas(id, status, updated_at)
    `)
    .in('status', ['planejamento', 'em_andamento'])
    .eq('arquivado', false);

  // Filtrar projetos sem atividade recente
  const projetosParados = projetos?.filter((p: any) => {
    const ultimaAtividade = p.tarefas
      ?.filter((t: any) => t.status === 'concluida')
      ?.map((t: any) => new Date(t.updated_at))
      ?.sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];

    if (!ultimaAtividade) {
      // Projeto sem nenhuma tarefa concluída - verificar data de criação
      return new Date(p.created_at) < limite;
    }
    return ultimaAtividade < limite;
  }) || [];

  if (!projetosParados.length) return { enviados: 0, projetos: 0 };

  let enviados = 0;

  for (const dest of destinatarios) {
    if (dest.canal === 'sistema') continue;

    const phone = getPhoneNumber(dest);
    if (!phone) continue;

    let mensagem = `⏸️ *PROJETOS PARADOS*\n\n`;
    mensagem += `Estes projetos não tiveram atividade nos últimos ${diasInatividade} dias:\n\n`;

    projetosParados.forEach((p: any) => {
      const tarefasPendentes = p.tarefas?.filter((t: any) => t.status !== 'concluida' && t.status !== 'cancelada').length || 0;
      mensagem += `📁 *${p.nome}*\n`;
      mensagem += `   ${p.tipo?.icone || '📋'} ${p.tipo?.nome || 'Projeto'}\n`;
      mensagem += `   📝 ${tarefasPendentes} tarefas pendentes\n\n`;
    });

    mensagem += `_Considere atualizar ou pausar estes projetos._`;

    const success = await sendWhatsApp(phone, mensagem, creds);

    await logNotificacao({
      configId: config.id,
      tipo: 'projeto_parado',
      destinatarioTipo: dest.pessoa_tipo,
      destinatarioId: dest.pessoa_id,
      canal: 'whatsapp',
      mensagem,
      status: success ? 'enviado' : 'erro',
    });

    if (success) enviados++;
  }

  return { enviados, projetos: projetosParados.length };
}

// ============================================
// 4. RESUMO SEMANAL
// ============================================

async function enviarResumoSemanal(creds: WhatsAppCreds) {
  const config = await getConfig('resumo_semanal');
  if (!config?.ativo) return { skipped: true, reason: 'Config desativada' };

  const destinatarios = await getDestinatarios(config.id);
  if (destinatarios.length === 0) return { skipped: true, reason: 'Sem destinatários' };

  // Estatísticas da semana
  const inicioSemana = new Date();
  inicioSemana.setDate(inicioSemana.getDate() - 7);

  const { data: projetos } = await supabase
    .from('projetos')
    .select('id, nome, status')
    .eq('arquivado', false);

  const { data: tarefasConcluidas } = await supabase
    .from('projeto_tarefas')
    .select('id')
    .eq('status', 'concluida')
    .gte('completed_at', inicioSemana.toISOString());

  const { data: tarefasPendentes } = await supabase
    .from('projeto_tarefas')
    .select('id')
    .neq('status', 'concluida')
    .neq('status', 'cancelada');

  const { data: tarefasAtrasadas } = await supabase
    .from('projeto_tarefas')
    .select('id')
    .lt('prazo', new Date().toISOString().split('T')[0])
    .neq('status', 'concluida')
    .neq('status', 'cancelada');

  const stats = {
    projetosAtivos: projetos?.filter((p: any) => p.status !== 'concluido' && p.status !== 'cancelado').length || 0,
    projetosConcluidos: projetos?.filter((p: any) => p.status === 'concluido').length || 0,
    tarefasConcluidasSemana: tarefasConcluidas?.length || 0,
    tarefasPendentes: tarefasPendentes?.length || 0,
    tarefasAtrasadas: tarefasAtrasadas?.length || 0,
  };

  let enviados = 0;

  for (const dest of destinatarios) {
    if (dest.canal === 'sistema') continue;

    const phone = getPhoneNumber(dest);
    if (!phone) continue;

    const nome = dest.pessoa_tipo === 'usuario' 
      ? dest.usuario?.nome 
      : dest.professor?.nome;

    let mensagem = `📊 *RESUMO SEMANAL - LA Music*\n\n`;
    mensagem += `Olá, ${nome?.split(' ')[0] || 'Coordenador'}! 👋\n\n`;
    mensagem += `Aqui está o resumo da semana:\n\n`;
    mensagem += `📁 *Projetos*\n`;
    mensagem += `   • ${stats.projetosAtivos} ativos\n`;
    mensagem += `   • ${stats.projetosConcluidos} concluídos\n\n`;
    mensagem += `✅ *Tarefas Concluídas esta Semana*\n`;
    mensagem += `   • ${stats.tarefasConcluidasSemana} tarefas\n\n`;
    mensagem += `📝 *Tarefas Pendentes*\n`;
    mensagem += `   • ${stats.tarefasPendentes} pendentes\n`;
    if (stats.tarefasAtrasadas > 0) {
      mensagem += `   • ⚠️ ${stats.tarefasAtrasadas} atrasadas\n`;
    }
    mensagem += `\n_Boa semana! 🚀_`;

    const success = await sendWhatsApp(phone, mensagem, creds);

    await logNotificacao({
      configId: config.id,
      tipo: 'resumo_semanal',
      destinatarioTipo: dest.pessoa_tipo,
      destinatarioId: dest.pessoa_id,
      canal: 'whatsapp',
      mensagem,
      status: success ? 'enviado' : 'erro',
    });

    if (success) enviados++;
  }

  return { enviados, stats };
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const creds = await getWhatsAppCredentials(supabase, { funcao: 'sistema' });
    const { action } = await req.json();

    let result;

    switch (action) {
      case 'tarefa_atrasada':
        result = await checkTarefasAtrasadas(creds);
        break;
      case 'tarefa_vencendo':
        result = await checkTarefasVencendo(creds);
        break;
      case 'projeto_parado':
        result = await checkProjetosParados(creds);
        break;
      case 'resumo_semanal':
        result = await enviarResumoSemanal(creds);
        break;
      case 'all':
        // Executa todos (exceto resumo semanal)
        result = {
          tarefa_atrasada: await checkTarefasAtrasadas(creds),
          tarefa_vencendo: await checkTarefasVencendo(creds),
          projeto_parado: await checkProjetosParados(creds),
        };
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Action inválida. Use: status, test, tarefa_atrasada, tarefa_vencendo, projeto_parado, resumo_semanal, all' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    return new Response(
      JSON.stringify({ success: true, action, result, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[projeto-alertas-whatsapp] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
