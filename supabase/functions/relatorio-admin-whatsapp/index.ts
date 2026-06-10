/// <reference lib="deno.ns" />

// Edge Function: relatorio-admin-whatsapp
// Envia relatórios administrativos via WhatsApp para grupos das Farmers
// Suporta modo manual (texto pronto) e modo cron (gera + envia automaticamente)
// Suporta UAZAPI e WAHA (detectado via campo provedor em whatsapp_caixas)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FIELDS = 'id,nome,provedor,uazapi_url,uazapi_token,waha_url,waha_session,waha_api_key';

interface WhatsAppCreds {
  caixaId: number;
  caixaNome: string;
  provedor: 'uazapi' | 'waha';
  // UAZAPI
  baseUrl: string;
  token: string;
  // WAHA
  wahaUrl?: string;
  wahaSession?: string;
  wahaApiKey?: string;
}

async function getWhatsAppCredentials(supabase: any, opts: { funcao?: string; caixaId?: number; unidadeId?: string } = {}): Promise<WhatsAppCreds> {
  const { funcao, caixaId, unidadeId } = opts;
  const toCreds = (row: any): WhatsAppCreds => {
    let baseUrl = row.uazapi_url || '';
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) baseUrl = 'https://' + baseUrl;
    return {
      caixaId: row.id,
      caixaNome: row.nome,
      provedor: row.provedor || 'uazapi',
      baseUrl: baseUrl.replace(/\/+$/, ''),
      token: row.uazapi_token || '',
      wahaUrl: row.waha_url ? row.waha_url.replace(/\/+$/, '') : undefined,
      wahaSession: row.waha_session || undefined,
      wahaApiKey: row.waha_api_key || undefined,
    };
  };
  if (caixaId) {
    const { data } = await supabase.from('whatsapp_caixas').select(FIELDS).eq('id', caixaId).eq('ativo', true).maybeSingle();
    if (data) return toCreds(data);
  }
  if (funcao && unidadeId) {
    const { data } = await supabase.from('whatsapp_caixas').select(FIELDS).eq('ativo', true).eq('unidade_id', unidadeId).in('funcao', [funcao, 'ambos']).limit(1).maybeSingle();
    if (data) return toCreds(data);
  }
  if (funcao) {
    const { data } = await supabase.from('whatsapp_caixas').select(FIELDS).eq('ativo', true).in('funcao', [funcao, 'ambos']).limit(1).maybeSingle();
    if (data) return toCreds(data);
  }
  const { data } = await supabase.from('whatsapp_caixas').select(FIELDS).eq('ativo', true).limit(1).maybeSingle();
  if (data) return toCreds(data);
  throw new Error(`Nenhuma caixa WhatsApp ativa encontrada (funcao=${funcao || 'any'}, unidade=${unidadeId || 'any'})`);
}

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
  modo?: 'cron' | 'dry_run'; // dry_run gera o texto real sem enfileirar/enviar
}

function n(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isRenovacaoAutomaticaEmusys(mov: any): boolean {
  if (mov?.tipo !== 'renovacao') return false;
  const texto = normalizeText(`${mov?.motivo || ''} ${mov?.observacoes || ''}`);
  const pareceAutomacao = texto.includes('renovacao automatica via emusys')
    || (texto.includes('automatic') && texto.includes('emusys'));
  return pareceAutomacao || !isRenovacaoConfirmadaOperacional(mov);
}

function isRenovacaoConfirmadaOperacional(mov: any): boolean {
  if (mov?.tipo !== 'renovacao') return false;

  const agente = String(mov?.agente_comercial || mov?.agente || '').trim();
  if (!agente) return false;

  const valorAnteriorInformado = mov?.valor_parcela_anterior !== null && mov?.valor_parcela_anterior !== undefined;
  const valorNovoInformado = mov?.valor_parcela_novo !== null && mov?.valor_parcela_novo !== undefined;

  return valorAnteriorInformado || valorNovoInformado || Boolean(mov?.forma_pagamento_id);
}

function numero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function valorPerdidoMovimentacao(mov: any): number {
  return numero(
    mov?.valor_parcela_evasao
      ?? mov?.valor_parcela_anterior
      ?? mov?.valor_parcela_novo
      ?? mov?.alunos?.valor_parcela
  );
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffMesesCompletos(inicio: Date, fim: Date): number {
  let meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
  if (fim.getDate() < inicio.getDate()) meses -= 1;
  return Math.max(0, meses);
}

function calcularTempoPermanenciaMovimentacao(mov: any): number {
  if (mov?.tempo_permanencia_meses !== null && mov?.tempo_permanencia_meses !== undefined) {
    return numero(mov.tempo_permanencia_meses);
  }

  const inicio = parseDateOnly(mov?.alunos?.data_matricula);
  const fim = parseDateOnly(mov?.data || mov?.alunos?.data_saida || null);
  if (!inicio || !fim) return 0;

  return diffMesesCompletos(inicio, fim);
}

function aplicarFallbacksRetencao(mov: any): any {
  if (mov?.tipo !== 'evasao' && mov?.tipo !== 'nao_renovacao') {
    return mov;
  }

  const valor = valorPerdidoMovimentacao(mov);
  const tempo = calcularTempoPermanenciaMovimentacao(mov);

  return {
    ...mov,
    valor_parcela_evasao: mov?.valor_parcela_evasao ?? (valor > 0 ? valor : mov?.valor_parcela_evasao),
    tempo_permanencia_meses: mov?.tempo_permanencia_meses ?? (tempo > 0 ? tempo : mov?.tempo_permanencia_meses),
  };
}

async function fetchKPIsAlunosRelatorioAdmin(
  supabase: any,
  unidadeId: string,
  ano: number,
  mes: number
) {
  const { data, error } = await supabase.rpc('get_kpis_alunos_canonicos', {
    p_unidade_id: unidadeId,
    p_ano: ano,
    p_mes: mes,
  });

  if (error) throw error;

  const porUnidade = data?.por_unidade?.[0] || {};
  const totais = data?.totais || porUnidade;
  const totalCampo = (...campos: string[]) => {
    for (const campo of campos) {
      if (totais[campo] !== null && totais[campo] !== undefined) return totais[campo];
      if (porUnidade[campo] !== null && porUnidade[campo] !== undefined) return porUnidade[campo];
    }
    return undefined;
  };

  const alunosAtivos = n(totalCampo('alunos_ativos', 'total_alunos_ativos'));
  const alunosPagantes = n(totalCampo('alunos_pagantes', 'total_alunos_pagantes'));
  const matriculasBaseAlunosAtivos = n(totalCampo('matriculas_base_alunos_ativos')) || alunosAtivos;
  const matriculasBanda = n(totalCampo('matriculas_banda'));
  const matriculas2Curso = n(totalCampo('matriculas_2_curso'));
  const alunosCoral = n(totalCampo('matriculas_coral'));
  const matriculasAtivas = matriculasBaseAlunosAtivos + matriculasBanda + matriculas2Curso + alunosCoral;

  return {
    alunosAtivos,
    alunosPagantes,
    alunosNaoPagantes: n(totalCampo('alunos_nao_pagantes')) || Math.max(alunosAtivos - alunosPagantes, 0),
    bolsistasIntegrais: n(totalCampo('bolsistas_integrais', 'total_bolsistas_integrais')),
    bolsistasIntegraisRegulares: n(totalCampo('bolsistas_integrais_regulares', 'total_bolsistas_integrais_regulares')),
    bolsistasIntegraisSegundoCurso: n(totalCampo('bolsistas_integrais_segundo_curso', 'total_bolsistas_integrais_segundo_curso')),
    bolsistasParciais: n(totalCampo('bolsistas_parciais', 'total_bolsistas_parciais')),
    trancados: n(totalCampo('alunos_trancados', 'total_alunos_trancados')),
    novosAlunos: n(totalCampo('novas_matriculas')),
    matriculasAtivas,
    matriculasBaseAlunosAtivos,
    matriculasBanda,
    matriculas2Curso,
    alunosCom2Curso: n(totalCampo('alunos_com_2_curso')),
    matriculas2CursoExtras: n(totalCampo('matriculas_2_curso_extras')),
    alunosCoral,
    evasoes: n(totalCampo('evasoes', 'total_evasoes')),
  };
}

async function enviarWhatsAppGrupo(
  grupoJid: string,
  mensagem: string,
  creds: WhatsAppCreds
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log(`[relatorio-admin-whatsapp] Enviando para ${grupoJid} via ${creds.provedor}`);

  try {
    let response: Response;

    if (creds.provedor === 'waha') {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.wahaApiKey) headers['X-Api-Key'] = creds.wahaApiKey;
      response = await fetch(`${creds.wahaUrl}/api/sendText`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ session: creds.wahaSession, chatId: grupoJid, text: mensagem }),
      });
    } else {
      response = await fetch(`${creds.baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': creds.token },
        body: JSON.stringify({ number: grupoJid, text: mensagem, delay: 0, readchat: true }),
      });
    }

    const data = await response.json().catch(() => ({}));

    if (response.ok && !data.error) {
      const messageId = data.id || data.messageid || data.key?.id;
      console.log(`[relatorio-admin-whatsapp] ✅ Mensagem enviada! ID: ${messageId}`);
      return { success: true, messageId };
    } else {
      const errMsg = (typeof data.error === 'string' ? data.error : null) || data.message || data.detail || `HTTP ${response.status}`;
      console.error(`[relatorio-admin-whatsapp] ❌ Erro ${creds.provedor}:`, errMsg);
      return { success: false, error: errMsg };
    }
  } catch (error) {
    console.error(`[relatorio-admin-whatsapp] ❌ Erro de conexão:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Erro de conexão' };
  }
}

/**
 * Gera o texto do relatório diário para uma unidade
 * Replica EXATAMENTE a lógica do frontend (ModalRelatorio.tsx gerarRelatorioDiario)
 * Usa as mesmas views e queries que o AdministrativoPage usa
 */
async function gerarRelatorioDiario(
  supabase: any,
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

  // === 1. BUSCAR DADOS ===

  // Unidade info
  const { data: unidadeInfo } = await supabase
    .from('unidades')
    .select('nome, farmers_nomes')
    .eq('id', unidadeId)
    .single();
  const unidadeNome = unidadeInfo?.nome || 'Unidade';
  const farmersNomes = unidadeInfo?.farmers_nomes?.join(' e ') || 'Equipe Administrativa';

  // KPIs de alunos/matriculas pela RPC canonica P0.1G.
  const kpisAlunos = await fetchKPIsAlunosRelatorioAdmin(supabase, unidadeId, ano, mes);
  const alunosAtivos = kpisAlunos.alunosAtivos;
  const alunosPagantes = kpisAlunos.alunosPagantes;
  const alunosNaoPagantes = kpisAlunos.alunosNaoPagantes;
  const bolsistasIntegrais = kpisAlunos.bolsistasIntegrais;
  const bolsistasIntegraisRegulares = kpisAlunos.bolsistasIntegraisRegulares;
  const bolsistasIntegraisSegundoCurso = kpisAlunos.bolsistasIntegraisSegundoCurso;
  const bolsistasParciais = kpisAlunos.bolsistasParciais;

  const trancados = kpisAlunos.trancados;

  // Novos no mes: pessoas pagantes novas, sem 2o curso, banda/coral ou bolsista.
  const novosAlunos = kpisAlunos.novosAlunos;

  // Matriculas: vinculos ativos/trancados, com banda/2o curso/coral separados.
  const matriculasAtivas = kpisAlunos.matriculasAtivas;
  const matriculasBaseAlunosAtivos = kpisAlunos.matriculasBaseAlunosAtivos;
  const matriculasBanda = kpisAlunos.matriculasBanda;
  const matriculas2Curso = kpisAlunos.matriculas2Curso;
  const alunosCom2Curso = kpisAlunos.alunosCom2Curso;
  const matriculas2CursoExtras = kpisAlunos.matriculas2CursoExtras;
  const alunosCoral = kpisAlunos.alunosCoral;

  // Movimentacoes do mes para retencao operacional viva.
  const { data: movData } = await supabase
    .from('movimentacoes_admin')
    .select('*')
    .eq('unidade_id', unidadeId)
    .gte('data', primeiroDiaMes)
    .lte('data', hoje)
    .order('data', { ascending: false });

  const alunoIdsMovimentacoes = [...new Set((movData || []).map((m: any) => m.aluno_id).filter(Boolean))];
  const alunosRetencaoMap = new Map<number, any>();
  if (alunoIdsMovimentacoes.length > 0) {
    const { data: alunosRetencaoData } = await supabase
      .from('alunos')
      .select('id, valor_parcela, data_matricula, data_saida, tipo_matricula_id, is_segundo_curso')
      .in('id', alunoIdsMovimentacoes);
    (alunosRetencaoData || []).forEach((a: any) => alunosRetencaoMap.set(a.id, a));
  }

  const movimentacoes = (movData || []).map((m: any) => aplicarFallbacksRetencao({
    ...m,
    alunos: m.aluno_id ? alunosRetencaoMap.get(m.aluno_id) || null : null,
  }));
  const renovacoesMovTodas = movimentacoes.filter((m: any) => m.tipo === 'renovacao');
  const renovacoesMov = renovacoesMovTodas.filter(isRenovacaoConfirmadaOperacional);
  const renovacoesAutomaticas = renovacoesMovTodas.filter((m: any) => !isRenovacaoConfirmadaOperacional(m));
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

  // Retencao operacional viva: sem view legada e sem Math.max silencioso.
  const naoRenovacoesCount = naoRenovacoes.length;
  const renovacoesRealizadasCount = renovacoes.length;
  const renovacoesPendentesCount = renovacoesAutomaticas.length;
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
  const bolsistasIntegraisTexto = bolsistasIntegraisRegulares || bolsistasIntegraisSegundoCurso
    ? `*${bolsistasIntegrais}* (${bolsistasIntegraisRegulares} regulares + ${bolsistasIntegraisSegundoCurso} em 2o curso)`
    : `*${bolsistasIntegrais}*`;
  const matriculas2CursoTexto = alunosCom2Curso || matriculas2CursoExtras
    ? `*${matriculas2Curso}* (${alunosCom2Curso} alunos${matriculas2CursoExtras ? ` + ${matriculas2CursoExtras} extras` : ''})`
    : `*${matriculas2Curso}*`;
  const matriculasAtivasTexto = matriculasBaseAlunosAtivos || matriculasBanda || matriculas2Curso
    ? `*${matriculasAtivas}* (${matriculasBaseAlunosAtivos} base alunos + ${matriculasBanda} banda + ${matriculas2Curso} 2o curso)`
    : `*${matriculasAtivas}*`;

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
  texto += `- Bolsistas Integrais: ${bolsistasIntegraisTexto}\n`;
  texto += `• Bolsistas Parciais: *${bolsistasParciais}*\n`;
  texto += `• Trancados: *${trancados || 0}*\n`;
  texto += `• Novos no mês: *${novosAlunos}*\n\n`;

  texto += `📚 *MATRÍCULAS*\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `• Matrículas Ativas: ${matriculasAtivasTexto}\n`;
  texto += `• Matrículas em Banda: *${matriculasBanda}*\n`;
  texto += `- Matriculas de 2o Curso: ${matriculas2CursoTexto}\n`;
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

  // Enriquecer evasões com tipo do aluno (mesmo padrão do frontend)
  const evasaoAlunoIds = [...new Set(evasoes.map((e: any) => e.aluno_id).filter(Boolean))];
  const alunosMap = new Map();
  if (evasaoAlunoIds.length > 0) {
    const { data: alunosData } = await supabase
      .from('alunos')
      .select('id, tipo_matricula_id, is_segundo_curso')
      .in('id', evasaoAlunoIds);
    (alunosData || []).forEach((a: any) => alunosMap.set(a.id, a));
  }
  const getTipoEvasao = (e: any): string => {
    const aluno = alunosMap.get(e.aluno_id);
    if (aluno) {
      if (aluno.tipo_matricula_id === 5) return 'interrompido_banda';
      if (aluno.is_segundo_curso || aluno.tipo_matricula_id === 2) return 'interrompido_2_curso';
      if ([3, 4].includes(aluno.tipo_matricula_id)) return 'interrompido_bolsista';
      return 'interrompido';
    }
    return e.tipo_evasao || 'interrompido';
  };

  texto += `🚪 *EVASÕES (Saíram esse mês)*\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `• Total de evasões: *${evasoes.length + naoRenovacoes.length}*\n`;
  texto += `• Interrompido: *${evasoes.filter((e: any) => getTipoEvasao(e) === 'interrompido').length}*\n`;
  texto += `• Interrompido 2º Curso: *${evasoes.filter((e: any) => getTipoEvasao(e) === 'interrompido_2_curso').length}*\n`;
  texto += `• Interrompido Bolsista: *${evasoes.filter((e: any) => getTipoEvasao(e) === 'interrompido_bolsista').length}*\n`;
  texto += `• Interrompido Banda: *${evasoes.filter((e: any) => getTipoEvasao(e) === 'interrompido_banda').length}*\n`;
  texto += `• Não Renovou: *${naoRenovacoes.length}*\n`;
  texto += `• Transferência: *${evasoes.filter((e: any) => getTipoEvasao(e) === 'transferencia').length}*\n\n`;

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
 * Modo CRON: gera relatórios e enfileira na fila_relatorios_whatsapp com 1 min de intervalo
 * O processamento real é feito pelo cron processar-mensagens-agendadas (a cada minuto)
 */
async function processarCron(
  supabase: any
): Promise<{ unidades_processadas: number; resultados: any[] }> {
  console.log('[relatorio-admin-whatsapp] 🕐 Modo CRON iniciado — enfileirando');

  const { data: unidades } = await supabase
    .from('unidades')
    .select('id, nome')
    .eq('relatorio_diario_cron_ativo', true)
    .order('nome');

  if (!unidades || unidades.length === 0) {
    console.log('[relatorio-admin-whatsapp] Nenhuma unidade com cron ativo');
    return { unidades_processadas: 0, resultados: [] };
  }

  console.log(`[relatorio-admin-whatsapp] ${unidades.length} unidade(s) — gerando e enfileirando`);

  const agora = new Date();
  const resultados: any[] = [];

  for (let i = 0; i < unidades.length; i++) {
    const unidade = unidades[i];

    try {
      const { data: destinatarios } = await supabase
        .from('whatsapp_destinatarios_relatorio')
        .select('jid, nome')
        .eq('tipo', 'relatorio_admin')
        .eq('ativo', true)
        .eq('unidade_id', unidade.id);

      if (!destinatarios || destinatarios.length === 0) {
        console.warn(`[relatorio-admin-whatsapp] ⚠️ ${unidade.nome}: sem destinatários, pulando`);
        resultados.push({ unidade: unidade.nome, status: 'skip', motivo: 'sem_destinatarios' });
        continue;
      }

      const texto = await gerarRelatorioDiario(supabase, unidade.id);

      // Escalonar: unidade 0 = agora, unidade 1 = agora+1min, unidade 2 = agora+2min, ...
      const agendadaPara = new Date(agora.getTime() + i * 60_000);

      for (const dest of destinatarios) {
        const { error } = await supabase
          .from('fila_relatorios_whatsapp')
          .insert({
            unidade_id: unidade.id,
            unidade_nome: unidade.nome,
            jid: dest.jid,
            grupo_nome: dest.nome,
            texto,
            status: 'pendente',
            agendada_para: agendadaPara.toISOString(),
          });

        if (error) {
          console.error(`[relatorio-admin-whatsapp] ❌ Erro ao enfileirar ${unidade.nome}:`, error.message);
          resultados.push({ unidade: unidade.nome, grupo: dest.nome, status: 'erro_fila', error: error.message });
        } else {
          console.log(`[relatorio-admin-whatsapp] ✅ ${unidade.nome} → ${dest.nome} enfileirado para ${agendadaPara.toISOString()}`);
          resultados.push({ unidade: unidade.nome, grupo: dest.nome, status: 'enfileirado', agendada_para: agendadaPara.toISOString() });
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

  console.log(`[relatorio-admin-whatsapp] 🕐 Modo CRON finalizado. ${resultados.length} item(ns) enfileirado(s)`);
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

    // === MODO DRY RUN ===
    if (payload.modo === 'dry_run') {
      if (!payload.unidade || payload.unidade === 'todos') {
        return new Response(
          JSON.stringify({ success: false, error: 'Unidade obrigatória para dry_run' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const texto = await gerarRelatorioDiario(supabase, payload.unidade);
      return new Response(
        JSON.stringify({ success: true, dry_run: true, unidade: payload.unidade, texto }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const creds = await getWhatsAppCredentials(supabase, { funcao: 'sistema' });

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
