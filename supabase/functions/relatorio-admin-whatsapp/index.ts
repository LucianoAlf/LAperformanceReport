// Edge Function: relatorio-admin-whatsapp
// Envia relatórios administrativos via WhatsApp para grupos das Farmers
// Suporta modo manual (texto pronto) e modo cron (gera + envia automaticamente)
// Integração com UAZAPI

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RelatorioPayload {
  texto?: string;
  tipoRelatorio?: string;
  unidade?: string;
  competencia?: string;
  numero_teste?: string;
  modo?: 'cron'; // Modo automático: gera + envia para unidades com cron ativo
}

/**
 * Envia mensagem via UAZAPI para um grupo
 */
async function enviarWhatsAppGrupo(
  grupoJid: string,
  mensagem: string,
  creds: { baseUrl: string; token: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log(`[relatorio-admin-whatsapp] Enviando para grupo: ${grupoJid}`);

  try {
    const response = await fetch(`${creds.baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': creds.token,
      },
      body: JSON.stringify({
        number: grupoJid,
        text: mensagem,
        delay: 0,
        readchat: true,
      }),
    });

    const data = await response.json();

    if (response.ok && !data.error) {
      const messageId = data.id || data.messageid || data.key?.id;
      console.log(`[relatorio-admin-whatsapp] ✅ Mensagem enviada! ID: ${messageId}`);
      return { success: true, messageId };
    } else {
      console.error(`[relatorio-admin-whatsapp] ❌ Erro UAZAPI:`, data);
      return {
        success: false,
        error: (typeof data.error === 'string' ? data.error : null) || data.message || JSON.stringify(data)
      };
    }
  } catch (error) {
    console.error(`[relatorio-admin-whatsapp] ❌ Erro de conexão:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro de conexão'
    };
  }
}

/**
 * Gera o texto do relatório diário para uma unidade
 * Replica EXATAMENTE a lógica do frontend (ModalRelatorio.tsx gerarRelatorioDiario)
 * Usa as mesmas views e queries que o AdministrativoPage usa
 */
async function gerarRelatorioDiario(
  supabase: ReturnType<typeof createClient>,
  unidadeId: string
): Promise<string> {
  // Calcular datas em BRT (UTC-3)
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const hoje = brt.toISOString().split('T')[0];
  const ano = brt.getFullYear();
  const mes = brt.getMonth() + 1;
  const dia = brt.getDate();
  const primeiroDiaMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const mesNome = brt.toLocaleString('pt-BR', { month: 'long' });
  const horaStr = `${String(brt.getHours()).padStart(2, '0')}:${String(brt.getMinutes()).padStart(2, '0')}`;

  // Próximo mês (para avisos prévios)
  const proximoMesDate = new Date(ano, mes, 1);
  const proximoMesNome = proximoMesDate.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
  const mesSaidaStart = `${proximoMesDate.getFullYear()}-${String(proximoMesDate.getMonth() + 1).padStart(2, '0')}-01`;
  const ultimoDiaProximoMes = new Date(proximoMesDate.getFullYear(), proximoMesDate.getMonth() + 1, 0).getDate();
  const mesSaidaEnd = `${proximoMesDate.getFullYear()}-${String(proximoMesDate.getMonth() + 1).padStart(2, '0')}-${String(ultimoDiaProximoMes).padStart(2, '0')}`;

  // === 1. BUSCAR DADOS (mesmas queries do frontend) ===

  // Unidade info
  const { data: unidadeInfo } = await supabase
    .from('unidades')
    .select('nome, farmers_nomes')
    .eq('id', unidadeId)
    .single();
  const unidadeNome = unidadeInfo?.nome || 'Unidade';
  const farmersNomes = unidadeInfo?.farmers_nomes?.join(' e ') || 'Equipe Administrativa';

  // KPIs via view (MESMA view que o frontend usa)
  const { data: kpisData } = await supabase
    .from('vw_kpis_gestao_mensal')
    .select('*')
    .eq('ano', ano)
    .eq('mes', mes)
    .eq('unidade_id', unidadeId);

  const kpis = kpisData?.[0] || {};
  const alunosAtivos = kpis.total_alunos_ativos || 0;
  const alunosPagantes = kpis.total_alunos_pagantes || 0;
  const alunosNaoPagantes = alunosAtivos - alunosPagantes;
  const bolsistasIntegrais = kpis.total_bolsistas_integrais || 0;
  const bolsistasParciais = kpis.total_bolsistas_parciais || 0;

  // Trancados (contagem direta)
  const { count: trancados } = await supabase
    .from('alunos')
    .select('id', { count: 'exact', head: true })
    .eq('unidade_id', unidadeId)
    .eq('status', 'trancado');

  // Novos no mês (mesma lógica: data_matricula, excluir 2º curso e bolsistas/banda)
  const { data: novosData } = await supabase
    .from('alunos')
    .select('id, is_segundo_curso, tipo_matricula_id')
    .eq('unidade_id', unidadeId)
    .gte('data_matricula', primeiroDiaMes)
    .lte('data_matricula', hoje);

  const novosAlunos = (novosData || []).filter((a: any) =>
    !a.is_segundo_curso && a.tipo_matricula_id && ![3, 4, 5].includes(a.tipo_matricula_id)
  );

  // Matrículas (mesma lógica: join cursos para banda/coral)
  const { data: matriculasData } = await supabase
    .from('alunos')
    .select('id, is_segundo_curso, curso_id, cursos:curso_id!left(nome, is_projeto_banda)')
    .eq('unidade_id', unidadeId)
    .in('status', ['ativo', 'aviso_previo', 'trancado']);

  const matriculasAtivas = matriculasData?.length || 0;
  const matriculasBanda = matriculasData?.filter((m: any) =>
    m.cursos?.is_projeto_banda
  ).length || 0;
  const matriculas2Curso = matriculasData?.filter((m: any) =>
    m.is_segundo_curso &&
    !m.cursos?.is_projeto_banda &&
    !m.cursos?.nome?.toLowerCase()?.includes('canto coral')
  ).length || 0;
  const alunosCoral = matriculasData?.filter((m: any) =>
    m.cursos?.nome?.toLowerCase()?.includes('canto coral')
  ).length || 0;

  // Retencao view (renovações — MESMA view que o frontend usa)
  const { data: retData } = await supabase
    .from('vw_kpis_retencao_mensal')
    .select('*')
    .eq('ano', ano)
    .eq('mes', mes)
    .eq('unidade_id', unidadeId);

  const ret = retData?.[0] || {};

  // Movimentações do mês (sem join professor — enriquecer depois, como o frontend faz)
  const { data: movData } = await supabase
    .from('movimentacoes_admin')
    .select('*, unidades(codigo)')
    .eq('unidade_id', unidadeId)
    .gte('data', primeiroDiaMes)
    .lte('data', hoje)
    .order('data', { ascending: false });

  const movimentacoes = movData || [];
  const renovacoesMov = movimentacoes.filter((m: any) => m.tipo === 'renovacao');
  const naoRenovacoesMov = movimentacoes.filter((m: any) => m.tipo === 'nao_renovacao');
  const evasoesMov = movimentacoes.filter((m: any) => m.tipo === 'evasao');

  // Enriquecer com nomes de professores (mesma lógica do frontend)
  const profIds = [...new Set(movimentacoes.map((m: any) => m.professor_id).filter(Boolean))];
  const profMap = new Map<number, string>();
  if (profIds.length > 0) {
    const { data: profs } = await supabase.from('professores').select('id, nome').in('id', profIds);
    (profs || []).forEach((p: any) => profMap.set(p.id, p.nome));
  }
  const enriquecer = (m: any) => ({ ...m, professor_nome: m.professor_id ? profMap.get(m.professor_id) || null : null });
  const renovacoes = renovacoesMov.map(enriquecer);
  const naoRenovacoes = naoRenovacoesMov.map(enriquecer);
  const evasoes = evasoesMov.map(enriquecer);

  // Combinar view + movimentacoes (Math.max, como o frontend faz)
  const naoRenovacoesCount = Math.max(ret.nao_renovacoes || 0, naoRenovacoes.length);
  const renovacoesRealizadasCount = Math.max(ret.renovacoes_realizadas || 0, renovacoes.length);
  const renovacoesPendentesCount = ret.renovacoes_pendentes || 0;
  const renovacoesPrevistas = renovacoesRealizadasCount + naoRenovacoesCount + renovacoesPendentesCount;
  const taxaRenovacao = renovacoesPrevistas > 0 ? (renovacoesRealizadasCount / renovacoesPrevistas * 100) : 0;

  // Renovações/evasões do dia
  const renovacoesHoje = renovacoes.filter((r: any) => r.data === hoje);
  const naoRenovacoesHoje = naoRenovacoes.filter((r: any) => r.data === hoje);
  const evasoesHoje = evasoes.filter((e: any) => e.data === hoje);

  // Avisos prévios (mes_saida do mês seguinte — mesma lógica do fix no frontend)
  const { data: avisosData } = await supabase
    .from('movimentacoes_admin')
    .select('*')
    .eq('unidade_id', unidadeId)
    .eq('tipo', 'aviso_previo')
    .gte('mes_saida', mesSaidaStart)
    .lte('mes_saida', mesSaidaEnd)
    .order('data', { ascending: false });

  const avisosProfIds = [...new Set((avisosData || []).map((a: any) => a.professor_id).filter(Boolean))];
  if (avisosProfIds.length > 0) {
    const { data: profs } = await supabase.from('professores').select('id, nome').in('id', avisosProfIds);
    (profs || []).forEach((p: any) => profMap.set(p.id, p.nome));
  }
  const avisosPrevios = (avisosData || []).map(enriquecer);

  // === 2. MONTAR TEXTO (idêntico ao frontend) ===
  const taxaInadimplencia = alunosAtivos > 0 ? (alunosNaoPagantes / alunosAtivos * 100) : 0;

  let texto = '';
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `📋 *RELATÓRIO DIÁRIO ADMINISTRATIVO*\n`;
  texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
  texto += `📆 ${String(dia).padStart(2, '0')}/${mesNome}/${ano}\n`;
  texto += `👥 ${farmersNomes}\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  texto += `👥 *ALUNOS*\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `• Ativos: *${alunosAtivos}*\n`;
  texto += `• Pagantes: *${alunosPagantes}*\n`;
  texto += `• Não Pagantes: *${alunosNaoPagantes}* (${taxaInadimplencia.toFixed(1)}%)\n`;
  texto += `• Bolsistas Integrais: *${bolsistasIntegrais}*\n`;
  texto += `• Bolsistas Parciais: *${bolsistasParciais}*\n`;
  texto += `• Trancados: *${trancados || 0}*\n`;
  texto += `• Novos no mês: *${novosAlunos.length}*\n\n`;

  texto += `📚 *MATRÍCULAS*\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `• Matrículas Ativas: *${matriculasAtivas}*\n`;
  texto += `• Matrículas em Banda: *${matriculasBanda}*\n`;
  texto += `• Matrículas de 2º Curso: *${matriculas2Curso}*\n`;
  texto += `• Alunos no Coral: *${alunosCoral}*\n\n`;

  texto += `🔄 *RENOVAÇÕES DO MÊS*\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `• Total previsto: *${renovacoesPrevistas}*\n`;
  texto += `• Realizadas: *${renovacoesRealizadasCount}*\n`;
  texto += `• Pendentes: *${renovacoesPendentesCount}*\n`;
  texto += `• Não Renovações: *${naoRenovacoesCount}*\n`;
  texto += `• Taxa de Renovação: *${taxaRenovacao.toFixed(1)}%*\n\n`;

  if (renovacoesHoje.length > 0) {
    texto += `✅ *RENOVAÇÕES DO DIA (${renovacoesHoje.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    renovacoesHoje.forEach((r: any, i: number) => {
      const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
        ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
        : 0;
      texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
      texto += `   De: R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (*+${reajuste.toFixed(1)}%*)\n`;
      texto += `   Agente: ${r.agente_comercial || 'N/A'}\n\n`;
    });
  } else {
    texto += `✅ *RENOVAÇÕES DO DIA: 0*\n\n`;
  }

  if (naoRenovacoesHoje.length > 0) {
    texto += `❌ *NÃO RENOVAÇÕES DO DIA (${naoRenovacoesHoje.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    naoRenovacoesHoje.forEach((r: any, i: number) => {
      const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
        ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
        : 0;
      texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
      texto += `   De: R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (${reajuste.toFixed(1)}%)\n`;
      texto += `   Professor(a): ${r.professor_nome || 'N/A'}\n`;
      texto += `   Motivo: ${r.motivo || 'Não informado'}\n\n`;
    });
  } else {
    texto += `❌ *NÃO RENOVAÇÕES DO DIA: 0*\n\n`;
  }

  texto += `⚠️ *AVISOS PRÉVIOS PARA SAIR EM ${proximoMesNome}*\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (avisosPrevios.length === 0) {
    texto += `Nenhum aviso prévio registrado 🎉\n\n`;
  } else {
    avisosPrevios.forEach((a: any, i: number) => {
      texto += `${i + 1}) Nome: *${a.aluno_nome}*\n`;
      texto += `   Motivo: ${a.motivo || 'Não informado'}\n`;
      texto += `   Parcela: R$ ${(a.valor_parcela_novo || 0).toFixed(2)}\n`;
      texto += `   Professor(a): ${a.professor_nome || 'N/A'}\n\n`;
    });
    texto += `● Total no mês: *${avisosPrevios.length}*\n\n`;
  }

  texto += `🚪 *EVASÕES (Saíram esse mês)*\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `• Total de evasões: *${evasoes.length}*\n`;
  texto += `• Interrompido: *${evasoes.filter((e: any) => e.tipo_evasao === 'interrompido').length}*\n`;
  texto += `• Interrompido 2º Curso: *${evasoes.filter((e: any) => e.tipo_evasao === 'interrompido_2_curso').length}*\n`;
  texto += `• Interrompido Bolsista: *${evasoes.filter((e: any) => e.tipo_evasao === 'interrompido_bolsista').length}*\n`;
  texto += `• Interrompido Banda: *${evasoes.filter((e: any) => e.tipo_evasao === 'interrompido_banda').length}*\n`;
  texto += `• Não Renovou: *${evasoes.filter((e: any) => e.tipo_evasao === 'nao_renovou').length}*\n`;
  texto += `• Transferência: *${evasoes.filter((e: any) => e.tipo_evasao === 'transferencia').length}*\n\n`;

  if (evasoesHoje.length > 0) {
    texto += `Evasões do dia: *${evasoesHoje.length}*\n\n`;
    evasoesHoje.forEach((e: any, i: number) => {
      texto += `${i + 1}) *${e.aluno_nome}*\n`;
      texto += `   Tipo: ${e.tipo_evasao || 'N/A'}\n`;
      texto += `   Motivo: ${e.motivo || 'Não informado'}\n\n`;
    });
  } else {
    texto += `Evasões do dia: *0*\n\n`;
  }

  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `📅 Gerado em: ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano} às ${horaStr} (automático)\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━`;

  return texto;
}

/**
 * Modo CRON: gera e envia relatório para todas as unidades com cron ativo
 */
async function processarCron(
  supabase: ReturnType<typeof createClient>
): Promise<{ unidades_processadas: number; resultados: any[] }> {
  console.log('[relatorio-admin-whatsapp] 🕐 Modo CRON iniciado');

  // Buscar unidades com cron ativo
  const { data: unidades } = await supabase
    .from('unidades')
    .select('id, nome')
    .eq('relatorio_diario_cron_ativo', true);

  if (!unidades || unidades.length === 0) {
    console.log('[relatorio-admin-whatsapp] Nenhuma unidade com cron ativo');
    return { unidades_processadas: 0, resultados: [] };
  }

  console.log(`[relatorio-admin-whatsapp] ${unidades.length} unidade(s) com cron ativo`);

  const resultados: any[] = [];

  for (const unidade of unidades) {
    console.log(`[relatorio-admin-whatsapp] Processando: ${unidade.nome}`);

    try {
      // Buscar destinatários
      const { data: destinatarios } = await supabase
        .from('whatsapp_destinatarios_relatorio')
        .select('jid, nome')
        .eq('tipo', 'relatorio_admin')
        .eq('ativo', true)
        .eq('unidade_id', unidade.id);

      if (!destinatarios || destinatarios.length === 0) {
        console.warn(`[relatorio-admin-whatsapp] ⚠️ ${unidade.nome}: sem destinatários configurados, pulando`);
        resultados.push({ unidade: unidade.nome, status: 'skip', motivo: 'sem_destinatarios' });
        continue;
      }

      // Gerar relatório
      const texto = await gerarRelatorioDiario(supabase, unidade.id);

      // Resolver credenciais UAZAPI por unidade
      const creds = await getUazapiCredentials(supabase, { funcao: 'sistema', unidadeId: unidade.id });

      // Enviar para cada grupo
      for (const dest of destinatarios) {
        const resultado = await enviarWhatsAppGrupo(dest.jid, texto, creds);
        resultados.push({
          unidade: unidade.nome,
          grupo: dest.nome,
          ...resultado,
        });

        if (destinatarios.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error(`[relatorio-admin-whatsapp] ❌ Erro ao processar ${unidade.nome}:`, error);
      resultados.push({
        unidade: unidade.nome,
        status: 'error',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  console.log(`[relatorio-admin-whatsapp] 🕐 Modo CRON finalizado. ${resultados.length} envio(s)`);
  return { unidades_processadas: unidades.length, resultados };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload: RelatorioPayload = await req.json();

    // === MODO CRON ===
    if (payload.modo === 'cron') {
      const resultado = await processarCron(supabase);
      return new Response(
        JSON.stringify({ success: true, ...resultado }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === MODO MANUAL (existente) ===
    if (!payload.texto) {
      return new Response(
        JSON.stringify({ success: false, error: 'Texto do relatório não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const creds = await getUazapiCredentials(supabase, { funcao: 'sistema' });

    // Modo teste
    if (payload.numero_teste) {
      const numero = payload.numero_teste.replace(/\D/g, '');
      console.log(`[relatorio-admin-whatsapp] 🧪 MODO TESTE — enviando para ${numero}`);
      const resultado = await enviarWhatsAppGrupo(numero, payload.texto, creds);
      return new Response(
        JSON.stringify({ success: resultado.success, error: resultado.error, resultados: [{ grupo: 'TESTE', ...resultado }] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar destinatários
    let destQuery = supabase
      .from('whatsapp_destinatarios_relatorio')
      .select('jid, nome, unidade_id')
      .eq('tipo', 'relatorio_admin')
      .eq('ativo', true);

    if (payload.unidade && payload.unidade !== 'todos') {
      destQuery = destQuery.eq('unidade_id', payload.unidade);
    }

    const { data: gruposParaEnviar, error: destError } = await destQuery;

    if (destError) {
      console.error('[relatorio-admin-whatsapp] Erro ao buscar destinatários:', destError.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar destinatários' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!gruposParaEnviar || gruposParaEnviar.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum destinatário configurado para este relatório' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[relatorio-admin-whatsapp] Enviando para ${gruposParaEnviar.length} grupo(s)`);

    const resultados: { grupo: string; success: boolean; messageId?: string; error?: string }[] = [];

    for (const grupo of gruposParaEnviar) {
      const resultado = await enviarWhatsAppGrupo(grupo.jid, payload.texto, creds);
      resultados.push({ grupo: grupo.nome, ...resultado });

      if (gruposParaEnviar.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const todosEnviados = resultados.every(r => r.success);
    const algumEnviado = resultados.some(r => r.success);
    const erroMsg = !todosEnviados
      ? resultados.filter(r => !r.success).map(r => r.error).join('; ')
      : undefined;

    return new Response(
      JSON.stringify({
        success: todosEnviados,
        partial: !todosEnviados && algumEnviado,
        error: erroMsg,
        resultados,
        messageId: resultados.find(r => r.success)?.messageId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[relatorio-admin-whatsapp] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
