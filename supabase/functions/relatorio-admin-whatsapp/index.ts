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


function normalizarTexto(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isAtividadeExtraAcademica(row: any): boolean {
  const curso = row?.cursos || null;
  const nome = normalizarTexto(curso?.nome || row?.curso_nome);
  return (
    curso?.is_projeto_banda === true ||
    nome.includes('canto coral') ||
    nome.includes('power kids') ||
    nome.includes('minha banda') ||
    nome.includes('garageband') ||
    nome.includes('percussion kids')
  );
}

function filtrarRetencaoCanonica<T extends any>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(row => !isAtividadeExtraAcademica(row));
}

async function anexarCursosMovimentacoes(supabase: any, rows: any[] | null | undefined): Promise<any[]> {
  const baseRows = rows || [];
  const cursoIds = [...new Set(baseRows.map((row: any) => row.curso_id).filter(Boolean))];
  if (cursoIds.length === 0) return baseRows;

  const { data: cursos, error } = await supabase
    .from('cursos')
    .select('id, nome, is_projeto_banda')
    .in('id', cursoIds);

  if (error) throw error;

  const cursoMap = new Map((cursos || []).map((curso: any) => [curso.id, curso]));
  return baseRows.map((row: any) => ({
    ...row,
    cursos: row.cursos || cursoMap.get(row.curso_id) || null,
  }));
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
  modo?: 'cron' | 'dry_run' | 'dry_run_comercial'; // dry_run gera o texto real sem enfileirar/enviar
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

  if (mov?.renovacao_status === 'confirmada' || mov?.renovacao_status === 'antecipada_confirmada') {
    return true;
  }

  if (mov?.renovacao_status === 'pendente_validacao' || mov?.renovacao_status === 'antecipada_pendente') {
    return false;
  }

  const agente = String(mov?.agente_comercial || mov?.agente || '').trim();
  if (!agente) return false;

  const valorAnteriorInformado = mov?.valor_parcela_anterior !== null && mov?.valor_parcela_anterior !== undefined;
  const valorNovoInformado = mov?.valor_parcela_novo !== null && mov?.valor_parcela_novo !== undefined;

  return valorAnteriorInformado || valorNovoInformado || Boolean(mov?.forma_pagamento_id);
}

function inicioMesISO(value: string | null | undefined): string {
  const raw = String(value || new Date().toISOString()).split('T')[0];
  const [year, month] = raw.split('-');
  return `${year}-${month}-01`;
}

function competenciaReferenciaMovimento(mov: any): string {
  return inicioMesISO(mov?.competencia_referencia || mov?.data);
}

function isCompetenciaNoPeriodo(mov: any, inicio: string, fim: string): boolean {
  const competencia = competenciaReferenciaMovimento(mov);
  return competencia >= inicio && competencia <= fim;
}

function isRenovacaoAntecipada(mov: any): boolean {
  if (mov?.renovacao_antecipada) return true;
  return competenciaReferenciaMovimento(mov) > inicioMesISO(mov?.data);
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

const tipoEvasaoLabels: Record<string, string> = {
  interrompido: 'Interrompido',
  interrompido_2_curso: 'Interrompido 2º Curso',
  interrompido_bolsista: 'Interrompido Bolsista',
  interrompido_banda: 'Interrompido Banda',
  transferencia: 'Transferência',
};

function labelTipoEvasao(tipo: string): string {
  return tipoEvasaoLabels[tipo] || tipo || 'Interrompido';
}

function formatarParcelaEvasaoDiaria(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return 'N/I';
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarMoedaComercial(valor: number): string {
  return (valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarDataCurtaComercial(valor?: string | null): string {
  if (!valor) return '-';
  const texto = String(valor).trim();
  if (!texto) return '-';
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}`;
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
  if (br) return `${br[1].padStart(2, '0')}/${br[2].padStart(2, '0')}`;
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function normalizarTelefoneComercial(valor?: string | null): string {
  return String(valor || '').replace(/\D/g, '');
}

function valoresUnicosComercial(valores: unknown[]): string[] {
  return Array.from(new Set(
    valores
      .filter((valor) => valor !== null && valor !== undefined)
      .map((valor) => String(valor).trim())
      .filter(Boolean)
  ));
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function toMoneyNumberComercial(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === 'string') {
    const trimmed = valor.trim();
    const normalizado = trimmed.includes(',')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed;
    const parsed = Number(normalizado);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const codigosTipoMatriculaForaNovaComercial = new Set([
  'BOLSISTA_INT',
  'BOLSISTA_PARC',
  'BANDA',
  'SEGUNDO_CURSO',
  'TRANSFERENCIA',
]);

function ehMatriculaComercialCanonicaEdge(matricula: any): boolean {
  const tipo = firstRelation(matricula?.tipos_matricula);
  const curso = firstRelation(matricula?.cursos);
  const cursoNome = String(curso?.nome || matricula?.curso_nome || '').toLowerCase();
  const status = String(matricula?.status || '').toLowerCase();
  const codigoTipo = String(tipo?.codigo || '').trim().toUpperCase();
  const ehBanda =
    matricula?.is_banda === true ||
    curso?.is_projeto_banda === true ||
    cursoNome.includes('banda');
  const ehCoral = cursoNome.includes('canto coral');

  if (['excluido', 'excluida', 'cancelado', 'cancelada'].includes(status)) return false;
  if (matricula?.is_segundo_curso === true) return false;
  if (ehBanda || ehCoral) return false;
  if (codigosTipoMatriculaForaNovaComercial.has(codigoTipo)) return false;

  return (
    (tipo?.conta_como_pagante === true || tipo?.entra_ticket_medio === true) &&
    toMoneyNumberComercial(matricula?.valor_parcela) > 0
  );
}

function statusExperimentalRealizadaComercial(status?: string | null): boolean {
  return ['experimental_realizada', 'realizada', 'presente']
    .includes(String(status || '').trim().toLowerCase());
}

function resolverProfessorExperimentalComercial(experimentais: any[], dataMatricula?: string | null): string | null {
  const limite = dataMatricula ? new Date(dataMatricula).getTime() : 0;
  const candidatas = (experimentais || [])
    .filter((item) => statusExperimentalRealizadaComercial(item?.status))
    .filter((item) => item?.professorExperimentalNome || item?.professor_experimental_nome)
    .sort((a, b) => {
      const dataA = a?.data_experimental ? new Date(a.data_experimental).getTime() : 0;
      const dataB = b?.data_experimental ? new Date(b.data_experimental).getTime() : 0;
      const aAntesMatricula = limite > 0 && dataA > 0 && dataA <= limite;
      const bAntesMatricula = limite > 0 && dataB > 0 && dataB <= limite;
      if (aAntesMatricula !== bAntesMatricula) return aAntesMatricula ? -1 : 1;
      return dataB - dataA;
    });

  const selecionada = candidatas[0] || null;
  return selecionada?.professorExperimentalNome || selecionada?.professor_experimental_nome || null;
}

function chaveTelefoneUnidadeComercial(unidadeId?: string | null, telefone?: string | null): string {
  return `${unidadeId || 'sem_unidade'}|${normalizarTelefoneComercial(telefone)}`;
}

function chaveGrupoMatriculaComercial(mat: any): string {
  const telefone = normalizarTelefoneComercial(mat?.telefone || mat?.responsavel_telefone);
  const nome = normalizarTexto(mat?.nome);
  return `${mat?.unidade_id || 'sem_unidade'}|${mat?.data_matricula || ''}|${nome}|${telefone}`;
}

function formatarParcelasMatriculaComercial(mat: any): string {
  const parcelas = Array.isArray(mat?.parcelas_relatorio)
    ? mat.parcelas_relatorio.filter((valor: number) => Number(valor) > 0)
    : [];
  if (parcelas.length > 1) {
    return parcelas.map((valor: number) => `R$ ${formatarMoedaComercial(Number(valor) || 0)}`).join(' + ');
  }
  return `R$ ${formatarMoedaComercial(Number(mat?.valor_parcela) || 0)}`;
}

function agruparMatriculasComerciais(matriculas: any[]): any[] {
  const grupos = new Map<string, any[]>();
  (matriculas || []).forEach((mat) => {
    const chave = chaveGrupoMatriculaComercial(mat);
    const grupo = grupos.get(chave) || [];
    grupo.push(mat);
    grupos.set(chave, grupo);
  });

  return Array.from(grupos.values()).map((grupo) => {
    const ordenadas = [...grupo].sort((a, b) => Number(a?.is_segundo_curso) - Number(b?.is_segundo_curso));
    const principal = ordenadas.find((mat) => ehMatriculaComercialCanonicaEdge(mat)) || ordenadas[0];
    const cursos = valoresUnicosComercial(ordenadas.map((mat) => mat?.curso_nome));
    const professores = valoresUnicosComercial(ordenadas.map((mat) => mat?.professor_fixo_nome));
    const professoresExp = valoresUnicosComercial(
      ordenadas.flatMap((mat) => (
        Array.isArray(mat?.professor_exp_nomes) && mat.professor_exp_nomes.length > 0
          ? mat.professor_exp_nomes
          : (mat?.professor_exp_nome ? [mat.professor_exp_nome] : [])
      ))
    );
    const parcelas = ordenadas
      .map((mat) => Number(mat?.valor_parcela) || 0)
      .filter((valor) => valor > 0);
    const formas = valoresUnicosComercial(ordenadas.map((mat) => mat?.forma_pagamento_nome));

    return {
      ...principal,
      cursos_relatorio: cursos.join(' e '),
      professores_relatorio: professores.join(' e '),
      professores_exp_relatorio: professoresExp.join(' e '),
      parcelas_relatorio: parcelas,
      formas_pagamento_relatorio: formas.join(' / '),
    };
  });
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
  const { data, error } = await supabase.rpc('get_kpis_alunos_admin_operacional', {
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
  const ultimoDiaMes = `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
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
  const bolsistasParciais = kpisAlunos.bolsistasParciais;

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
  const { data: movData, error: movError } = await supabase
    .from('movimentacoes_admin')
    .select('*')
    .eq('unidade_id', unidadeId)
    .or(`and(data.gte.${primeiroDiaMes},data.lte.${hoje}),and(competencia_referencia.gte.${primeiroDiaMes},competencia_referencia.lte.${ultimoDiaMes})`)
    .order('data', { ascending: false });
  if (movError) throw movError;

  const movComCursos = await anexarCursosMovimentacoes(supabase, movData || []);

  const alunoIdsMovimentacoes = [...new Set(movComCursos.map((m: any) => m.aluno_id).filter(Boolean))];
  const alunosRetencaoMap = new Map<number, any>();
  if (alunoIdsMovimentacoes.length > 0) {
    const { data: alunosRetencaoData } = await supabase
      .from('alunos')
      .select('id, valor_parcela, data_matricula, data_saida, tipo_matricula_id, is_segundo_curso')
      .in('id', alunoIdsMovimentacoes);
    (alunosRetencaoData || []).forEach((a: any) => alunosRetencaoMap.set(a.id, a));
  }

  const movimentacoes = filtrarRetencaoCanonica(movComCursos.map((m: any) => aplicarFallbacksRetencao({
    ...m,
    alunos: m.aluno_id ? alunosRetencaoMap.get(m.aluno_id) || null : null,
  })));
  const renovacoesMovTodas = movimentacoes.filter((m: any) => m.tipo === 'renovacao');
  const renovacoesDaCompetencia = renovacoesMovTodas.filter((m: any) => isCompetenciaNoPeriodo(m, primeiroDiaMes, ultimoDiaMes));
  const renovacoesMov = renovacoesDaCompetencia.filter(isRenovacaoConfirmadaOperacional);
  const renovacoesAutomaticas = renovacoesDaCompetencia.filter((m: any) => !isRenovacaoConfirmadaOperacional(m));
  const renovacoesAntecipadas = renovacoesMovTodas
    .filter((m: any) => m.data >= primeiroDiaMes && m.data <= hoje)
    .filter((m: any) => isRenovacaoAntecipada(m) && competenciaReferenciaMovimento(m) > ultimoDiaMes);
  const naoRenovacoesMov = movimentacoes.filter((m: any) => m.tipo === 'nao_renovacao');
  const evasoesMov = movimentacoes.filter((m: any) => m.tipo === 'evasao');
  const trancamentosMov = movimentacoes.filter((m: any) => m.tipo === 'trancamento');
  const trancados = trancamentosMov.length;

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
  const { data: avisosData, error: avisosError } = await supabase
    .from('movimentacoes_admin')
    .select('*')
    .eq('unidade_id', unidadeId)
    .eq('tipo', 'aviso_previo')
    .gte('mes_saida', mesSaidaStart)
    .lte('mes_saida', mesSaidaEnd)
    .order('data', { ascending: false });
  if (avisosError) throw avisosError;

  const avisosComCursos = await anexarCursosMovimentacoes(supabase, avisosData || []);

  const avisosProfIds = [...new Set(avisosComCursos.map((a: any) => a.professor_id).filter(Boolean))];
  if (avisosProfIds.length > 0) {
    const { data: profs } = await supabase.from('professores').select('id, nome').in('id', avisosProfIds);
    (profs || []).forEach((p: any) => profMap.set(p.id, p.nome));
  }
  const avisosPrevios = filtrarRetencaoCanonica(avisosComCursos).map(enriquecer);

  const { data: transferenciasData, error: transferenciasError } = await supabase
    .from('aluno_transferencias')
    .select('id, aluno_id, unidade_origem_id, unidade_destino_id, data_transferencia, observacao')
    .eq('unidade_destino_id', unidadeId)
    .gte('data_transferencia', primeiroDiaMes)
    .lte('data_transferencia', ultimoDiaMes)
    .order('data_transferencia', { ascending: false });
  if (transferenciasError) throw transferenciasError;

  const transferenciasRecebidas = transferenciasData || [];
  const transferenciasAlunoIds = [...new Set(transferenciasRecebidas.map((t: any) => t.aluno_id).filter(Boolean))];
  const transferenciasUnidadeIds = [...new Set(
    transferenciasRecebidas
      .flatMap((t: any) => [t.unidade_origem_id, t.unidade_destino_id])
      .filter(Boolean)
  )];
  const transferenciasCursoIds = new Set<number>();
  const transferenciasProfessorIds = new Set<number>();
  const alunosTransferenciaMap = new Map<number, any>();
  const unidadesTransferenciaMap = new Map<string, any>();
  const cursosTransferenciaMap = new Map<number, string>();
  const professoresTransferenciaMap = new Map<number, string>();

  if (transferenciasAlunoIds.length > 0) {
    const { data: alunosTransferenciaData } = await supabase
      .from('alunos')
      .select('id, nome, curso_id, professor_atual_id, valor_parcela, data_matricula')
      .in('id', transferenciasAlunoIds);

    (alunosTransferenciaData || []).forEach((aluno: any) => {
      alunosTransferenciaMap.set(aluno.id, aluno);
      if (aluno.curso_id) transferenciasCursoIds.add(aluno.curso_id);
      if (aluno.professor_atual_id) transferenciasProfessorIds.add(aluno.professor_atual_id);
    });
  }

  if (transferenciasUnidadeIds.length > 0) {
    const { data: unidadesTransferenciaData } = await supabase
      .from('unidades')
      .select('id, nome, codigo')
      .in('id', transferenciasUnidadeIds);

    (unidadesTransferenciaData || []).forEach((unidade: any) => {
      unidadesTransferenciaMap.set(String(unidade.id), unidade);
    });
  }

  if (transferenciasCursoIds.size > 0) {
    const { data: cursosTransferenciaData } = await supabase
      .from('cursos')
      .select('id, nome')
      .in('id', Array.from(transferenciasCursoIds));

    (cursosTransferenciaData || []).forEach((curso: any) => {
      cursosTransferenciaMap.set(curso.id, curso.nome);
    });
  }

  if (transferenciasProfessorIds.size > 0) {
    const { data: professoresTransferenciaData } = await supabase
      .from('professores')
      .select('id, nome')
      .in('id', Array.from(transferenciasProfessorIds));

    (professoresTransferenciaData || []).forEach((professor: any) => {
      professoresTransferenciaMap.set(professor.id, professor.nome);
    });
  }

  const transferenciasRecebidasDetalhadas = transferenciasRecebidas.map((transferencia: any) => {
    const aluno = alunosTransferenciaMap.get(transferencia.aluno_id) || {};
    return {
      ...transferencia,
      aluno_nome: aluno.nome || 'Aluno transferido',
      curso_nome: aluno.curso_id ? cursosTransferenciaMap.get(aluno.curso_id) || null : null,
      professor_nome: aluno.professor_atual_id ? professoresTransferenciaMap.get(aluno.professor_atual_id) || null : null,
      valor_parcela: aluno.valor_parcela || null,
      origem_nome: unidadesTransferenciaMap.get(String(transferencia.unidade_origem_id))?.nome || null,
      origem_codigo: unidadesTransferenciaMap.get(String(transferencia.unidade_origem_id))?.codigo || null,
      destino_nome: unidadesTransferenciaMap.get(String(transferencia.unidade_destino_id))?.nome || null,
      destino_codigo: unidadesTransferenciaMap.get(String(transferencia.unidade_destino_id))?.codigo || null,
    };
  });

  // === 2. MONTAR TEXTO (idêntico ao frontend) ===
  const taxaInadimplencia = alunosAtivos > 0 ? (alunosNaoPagantes / alunosAtivos * 100) : 0;
  const bolsistasIntegraisTexto = `*${bolsistasIntegraisRegulares || bolsistasIntegrais}*`;
  const matriculas2CursoTexto = alunosCom2Curso || matriculas2CursoExtras
    ? `*${matriculas2Curso}* (${alunosCom2Curso} alunos${matriculas2CursoExtras ? ` + ${matriculas2CursoExtras} extras` : ''})`
    : `*${matriculas2Curso}*`;
  const matriculasAtivasTexto = matriculasBaseAlunosAtivos || matriculasBanda || matriculas2Curso
    ? `*${matriculasAtivas}* (${matriculasBaseAlunosAtivos} base alunos + ${matriculasBanda} banda + ${matriculas2Curso} 2o curso)`
    : `*${matriculasAtivas}*`;
  const entradasAdministrativas = novosAlunos + transferenciasRecebidasDetalhadas.length;
  const formatarUnidadeTransferencia = (nome?: string | null, codigo?: string | null, fallback = 'N/I') =>
    nome || codigo || fallback;
  const formatarParcelaTransferencia = (valor?: number | string | null) => {
    const numero = Number(valor || 0);
    return numero > 0
      ? `R$ ${numero.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : 'N/I';
  };

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
  texto += `• Novos no mês: *${novosAlunos}*\n`;
  texto += `• Transferências recebidas no mês: *${transferenciasRecebidasDetalhadas.length}*\n`;
  texto += `• Entrada de novos alunos no mês: *${entradasAdministrativas}* (${novosAlunos} novos + ${transferenciasRecebidasDetalhadas.length} transferência${transferenciasRecebidasDetalhadas.length !== 1 ? 's' : ''})\n\n`;

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

  if (renovacoesAntecipadas.length > 0) {
    texto += `🟡 *RENOVAÇÕES ANTECIPADAS (${renovacoesAntecipadas.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Registradas agora, mas contam apenas na competência da primeira aula do novo ciclo.\n`;
    renovacoesAntecipadas.forEach((r: any, i: number) => {
      const competencia = competenciaReferenciaMovimento(r).slice(0, 7);
      texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
      texto += `   Competência efetiva: *${competencia}*\n`;
      texto += `   Curso: ${r.curso_nome || 'N/A'}\n\n`;
    });
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

  texto += `🔁 *TRANSFERÊNCIAS RECEBIDAS NO PERÍODO (${transferenciasRecebidasDetalhadas.length})*\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (transferenciasRecebidasDetalhadas.length === 0) {
    texto += `Nenhuma transferência recebida neste período.\n\n`;
  } else {
    transferenciasRecebidasDetalhadas.forEach((t: any, i: number) => {
      const origem = formatarUnidadeTransferencia(t.origem_nome, t.origem_codigo, 'Origem não informada');
      const destino = formatarUnidadeTransferencia(t.destino_nome, t.destino_codigo, 'Destino não informado');
      texto += `${i + 1}) Nome: *${t.aluno_nome}*\n`;
      texto += `   Movimento: ${origem} → ${destino}\n`;
      texto += `   Curso: ${t.curso_nome || 'N/I'} | Prof: ${t.professor_nome || 'N/I'}\n`;
      texto += `   Parcela: ${formatarParcelaTransferencia(t.valor_parcela)}\n\n`;
    });
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
      const tipo = getTipoEvasao(e);
      const parcela = valorPerdidoMovimentacao(e);
      texto += `${i + 1}) *${e.aluno_nome}*\n`;
      texto += `   Tipo: ${labelTipoEvasao(tipo)}\n`;
      texto += `   Parcela: ${formatarParcelaEvasaoDiaria(parcela)}\n`;
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

async function buscarMatriculasComerciaisAlunos(
  supabase: any,
  unidadeId: string,
  dataInicio: string,
  dataFim: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from('alunos')
    .select('id, nome, telefone, responsavel_telefone, idade_atual, data_matricula, tipo_aluno, valor_passaporte, valor_parcela, is_segundo_curso, curso_id, canal_origem_id, professor_atual_id, professor_experimental_id, forma_pagamento_id, tipo_matricula_id, unidade_id, modalidade, status, emusys_matricula_id, emusys_lead_id, emusys_student_id, cursos:curso_id(nome, is_projeto_banda), canais_origem:canal_origem_id(nome), tipos_matricula:tipo_matricula_id!left(codigo, conta_como_pagante, entra_ticket_medio), unidades:unidade_id(codigo, nome, hunter_nome), formas_pagamento:forma_pagamento_id(nome)')
    .not('data_matricula', 'is', null)
    .gte('data_matricula', dataInicio)
    .lte('data_matricula', dataFim)
    .eq('unidade_id', unidadeId);

  if (error) throw error;

  const alunos = (data || []) as any[];
  const alunoIds = alunos.map((aluno) => aluno.id).filter(Boolean);
  const telefonesBusca = valoresUnicosComercial(
    alunos.flatMap((aluno) => [aluno.telefone, aluno.responsavel_telefone])
  );
  const emusysLeadIds = Array.from(new Set(
    alunos
      .map((aluno) => Number(aluno.emusys_lead_id))
      .filter((id) => Number.isFinite(id) && id > 0)
  ));

  const leadSelect = 'id, nome, telefone, aluno_id, unidade_id, emusys_lead_id, status, data_contato, data_experimental, canal_origem_id, professor_experimental_id, canais_origem:canal_origem_id(nome)';
  const leadQueries: Promise<any>[] = [
    alunoIds.length
      ? supabase.from('leads').select(leadSelect).in('aluno_id', alunoIds)
      : Promise.resolve({ data: [] }),
  ];

  if (telefonesBusca.length) {
    leadQueries.push(
      supabase
        .from('leads')
        .select(leadSelect)
        .in('telefone', telefonesBusca)
        .eq('unidade_id', unidadeId)
    );
  }

  if (emusysLeadIds.length) {
    leadQueries.push(
      supabase
        .from('leads')
        .select(leadSelect)
        .in('emusys_lead_id', emusysLeadIds)
        .eq('unidade_id', unidadeId)
    );
  }

  const leadResults = await Promise.all(leadQueries);
  const leadsCanonicos = Array.from(
    new Map(
      leadResults
        .flatMap((result: any) => result.data || [])
        .filter((lead: any) => lead?.id)
        .map((lead: any) => [lead.id, lead])
    ).values()
  );

  const leadIds = leadsCanonicos.map((lead: any) => lead.id).filter(Boolean);
  const emusysLeadIdsComLeads = Array.from(new Set([
    ...emusysLeadIds,
    ...leadsCanonicos
      .map((lead: any) => Number(lead.emusys_lead_id))
      .filter((id: number) => Number.isFinite(id) && id > 0),
  ]));

  const [
    { data: experimentaisPorAluno },
    { data: experimentaisPorEmusys },
    { data: experimentaisPorLead },
  ] = await Promise.all([
    alunoIds.length
      ? supabase
          .from('lead_experimentais')
          .select('id, lead_id, aluno_id, emusys_lead_id, nome_aluno, status, data_experimental, professor_experimental_id')
          .in('aluno_id', alunoIds)
      : Promise.resolve({ data: [] }),
    emusysLeadIdsComLeads.length
      ? supabase
          .from('lead_experimentais')
          .select('id, lead_id, aluno_id, emusys_lead_id, nome_aluno, status, data_experimental, professor_experimental_id')
          .in('emusys_lead_id', emusysLeadIdsComLeads)
      : Promise.resolve({ data: [] }),
    leadIds.length
      ? supabase
          .from('lead_experimentais')
          .select('id, lead_id, aluno_id, emusys_lead_id, nome_aluno, status, data_experimental, professor_experimental_id')
          .in('lead_id', leadIds)
      : Promise.resolve({ data: [] }),
  ]);

  const experimentaisCanonicas = Array.from(
    new Map(
      [...(experimentaisPorAluno || []), ...(experimentaisPorEmusys || []), ...(experimentaisPorLead || [])]
        .filter((exp: any) => exp?.id)
        .map((exp: any) => [exp.id, exp])
    ).values()
  );

  const professorIds = Array.from(new Set([
    ...alunos.map((aluno) => aluno.professor_atual_id),
    ...alunos.map((aluno) => aluno.professor_experimental_id),
    ...leadsCanonicos.map((lead: any) => lead.professor_experimental_id),
    ...experimentaisCanonicas.map((exp: any) => exp.professor_experimental_id),
  ].filter(Boolean)));

  const { data: professores, error: professoresError } = professorIds.length
    ? await supabase.from('professores').select('id, nome').in('id', professorIds)
    : { data: [], error: null };

  if (professoresError) throw professoresError;

  const professoresPorId = new Map((professores || []).map((professor: any) => [professor.id, professor.nome]));
  const leadsPorAluno = new Map();
  const leadsPorEmusysLeadId = new Map();
  const leadsPorTelefone = new Map();

  leadsCanonicos.forEach((lead: any) => {
    if (lead.aluno_id && !leadsPorAluno.has(lead.aluno_id)) leadsPorAluno.set(lead.aluno_id, lead);

    const emusysLeadId = Number(lead.emusys_lead_id);
    if (Number.isFinite(emusysLeadId) && emusysLeadId > 0 && !leadsPorEmusysLeadId.has(emusysLeadId)) {
      leadsPorEmusysLeadId.set(emusysLeadId, lead);
    }

    const tel = normalizarTelefoneComercial(lead.telefone);
    if (tel) {
      const key = chaveTelefoneUnidadeComercial(lead.unidade_id, lead.telefone);
      const lista = leadsPorTelefone.get(key) || [];
      lista.push(lead);
      leadsPorTelefone.set(key, lista);
    }
  });

  const experimentaisPorAlunoId = new Map();
  const experimentaisPorEmusysLeadId = new Map();
  const experimentaisPorLeadId = new Map();

  experimentaisCanonicas.forEach((exp: any) => {
    const enriquecida = {
      ...exp,
      professorExperimentalNome: professoresPorId.get(exp.professor_experimental_id) || null,
    };

    if (exp.aluno_id) {
      const lista = experimentaisPorAlunoId.get(exp.aluno_id) || [];
      lista.push(enriquecida);
      experimentaisPorAlunoId.set(exp.aluno_id, lista);
    }

    if (exp.emusys_lead_id) {
      const emusysLeadId = Number(exp.emusys_lead_id);
      const lista = experimentaisPorEmusysLeadId.get(emusysLeadId) || [];
      lista.push(enriquecida);
      experimentaisPorEmusysLeadId.set(emusysLeadId, lista);
    }

    if (exp.lead_id) {
      const lista = experimentaisPorLeadId.get(exp.lead_id) || [];
      lista.push(enriquecida);
      experimentaisPorLeadId.set(exp.lead_id, lista);
    }
  });

  const selecionarLeadParaAluno = (aluno: any) => {
    const candidatos: any[] = [];
    const direto = leadsPorAluno.get(aluno.id);
    if (direto) candidatos.push(direto);

    const emusysLeadId = Number(aluno.emusys_lead_id);
    if (Number.isFinite(emusysLeadId) && leadsPorEmusysLeadId.has(emusysLeadId)) {
      candidatos.push(leadsPorEmusysLeadId.get(emusysLeadId));
    }

    [aluno.telefone, aluno.responsavel_telefone].forEach((tel: string | null) => {
      const normalizado = normalizarTelefoneComercial(tel);
      if (!normalizado) return;
      const porTelefone = leadsPorTelefone.get(chaveTelefoneUnidadeComercial(aluno.unidade_id, tel)) || [];
      candidatos.push(...porTelefone);
    });

    const unicos = Array.from(new Map(candidatos.filter(Boolean).map((lead: any) => [lead.id, lead])).values());
    if (!unicos.length) return null;

    const nomeAluno = normalizarTexto(aluno.nome);
    const dataMatricula = aluno.data_matricula ? new Date(aluno.data_matricula).getTime() : 0;
    const emusysLeadAluno = Number(aluno.emusys_lead_id);

    return unicos.sort((a: any, b: any) => {
      const score = (lead: any) => {
        let s = 0;
        if (lead.aluno_id === aluno.id) s += 100;
        if (Number(lead.emusys_lead_id) === emusysLeadAluno) s += 80;
        if (normalizarTexto(lead.nome) === nomeAluno) s += 35;
        if (normalizarTelefoneComercial(lead.telefone) && [aluno.telefone, aluno.responsavel_telefone].some((tel: string | null) => normalizarTelefoneComercial(tel) === normalizarTelefoneComercial(lead.telefone))) s += 20;
        if (String(lead.status || '').toLowerCase() === 'convertido') s += 15;
        const dataLead = lead.data_contato || lead.data_experimental;
        const timeLead = dataLead ? new Date(dataLead).getTime() : 0;
        if (dataMatricula && timeLead && timeLead <= dataMatricula) s += 5;
        if (dataMatricula && timeLead && timeLead > dataMatricula) s -= 10;
        return s;
      };

      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return String(b.data_contato || b.data_experimental || '').localeCompare(String(a.data_contato || a.data_experimental || ''));
    })[0];
  };

  return alunos.map((aluno: any) => {
    const lead = selecionarLeadParaAluno(aluno);
    const canalAluno = firstRelation(aluno.canais_origem)?.nome;
    const canalLead = firstRelation(lead?.canais_origem)?.nome;
    const emusysLeadId = Number(aluno.emusys_lead_id);
    const experimentaisAluno = [
      ...(experimentaisPorAlunoId.get(aluno.id) || []),
      ...(Number.isFinite(emusysLeadId) ? (experimentaisPorEmusysLeadId.get(emusysLeadId) || []) : []),
      ...(lead?.emusys_lead_id ? (experimentaisPorEmusysLeadId.get(Number(lead.emusys_lead_id)) || []) : []),
      ...(lead?.id ? (experimentaisPorLeadId.get(lead.id) || []) : []),
    ];
    const experimentaisUnicasAluno = Array.from(
      new Map(experimentaisAluno.filter((exp: any) => exp?.id).map((exp: any) => [exp.id, exp])).values()
    );
    const professoresExpNomes = valoresUnicosComercial([
      ...experimentaisUnicasAluno
        .filter((exp: any) => statusExperimentalRealizadaComercial(exp.status))
        .map((exp: any) => exp.professorExperimentalNome || exp.professor_experimental_nome),
      lead?.professor_experimental_id ? professoresPorId.get(lead.professor_experimental_id) : null,
    ]);
    const professorExpFallbackAluno = !lead && !experimentaisUnicasAluno.length && aluno.professor_experimental_id && aluno.professor_experimental_id !== aluno.professor_atual_id
      ? professoresPorId.get(aluno.professor_experimental_id)
      : null;
    const professorExpCanonico = professoresExpNomes.join(' e ') ||
      resolverProfessorExperimentalComercial(experimentaisUnicasAluno, aluno.data_matricula) ||
      professorExpFallbackAluno;

    return {
      ...aluno,
      curso_nome: firstRelation(aluno.cursos)?.nome || '',
      is_banda: Boolean(firstRelation(aluno.cursos)?.is_projeto_banda || String(aluno.modalidade || '').toLowerCase().includes('banda')),
      idade: aluno.idade_atual,
      canal_origem_id: aluno.canal_origem_id || lead?.canal_origem_id,
      canal_nome: canalAluno || canalLead || 'Não informado',
      unidade_codigo: firstRelation(aluno.unidades)?.codigo,
      unidade_nome: firstRelation(aluno.unidades)?.nome,
      hunter_nome: firstRelation(aluno.unidades)?.hunter_nome,
      professor_fixo_nome: professoresPorId.get(aluno.professor_atual_id) || null,
      professor_exp_nome: professorExpCanonico,
      professor_exp_nomes: professoresExpNomes.length ? professoresExpNomes : (professorExpCanonico ? [professorExpCanonico] : []),
      lead_id: lead?.id || null,
      lead_nome: lead?.nome || null,
      forma_pagamento_nome: firstRelation(aluno.formas_pagamento)?.nome || null,
    };
  });
}

function textoTaxaExpMatComercial(resumo: Record<string, unknown>, realizadasConfirmadas: number): string {
  const liberada = resumo.taxa_exp_mat_liberada === true;
  const taxa = n(resumo.taxa_exp_mat_canonica);
  const denominador = n(resumo.denominador_taxa_exp_mat);
  const conversoes = n(resumo.conversoes_exp_mat_canonicas);
  const pendencias = n(resumo.pendencias_taxa_exp_mat);

  if (liberada) return `*${taxa.toFixed(1)}%* (${conversoes}/${denominador})`;
  if (denominador === 0 && pendencias === 0 && realizadasConfirmadas === 0) {
    return '*SEM BASE* (0 pendencia(s); aguardando experimentais confirmadas)';
  }
  return `*BLOQUEADA* (${pendencias} pendencia(s) de conciliacao)`;
}

async function gerarRelatorioComercialDiario(
  supabase: any,
  unidadeId: string
): Promise<string> {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const dataFim = brt.toISOString().split('T')[0];
  const ano = brt.getFullYear();
  const mes = brt.getMonth() + 1;
  const dia = String(brt.getDate()).padStart(2, '0');
  const mesNome = brt.toLocaleString('pt-BR', { month: 'long' });
  const horaStr = `${String(brt.getHours()).padStart(2, '0')}:${String(brt.getMinutes()).padStart(2, '0')}`;
  const dataInicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;

  const { data: unidadeData, error: unidadeError } = await supabase
    .from('unidades')
    .select('id, nome, hunter_nome')
    .eq('id', unidadeId)
    .single();

  if (unidadeError) throw unidadeError;

  const inicioDiaBRT = `${dataFim}T00:00:00-03:00`;
  const fimDiaBRT = `${dataFim}T23:59:59.999-03:00`;

  const [
    kpisMesResponse,
    kpisDiaResponse,
    conciliacaoMesResponse,
    emusysMesResponse,
    emusysDiaResponse,
    experimentaisAgendadasDiaResponse,
  ] = await Promise.all([
    supabase.rpc('get_kpis_comercial_canonicos_v2', {
      p_unidade_id: unidadeId,
      p_ano: ano,
      p_mes: mes,
      p_periodo: 'mensal',
      p_data: null,
    }),
    supabase.rpc('get_kpis_comercial_canonicos_v2', {
      p_unidade_id: unidadeId,
      p_ano: ano,
      p_mes: mes,
      p_periodo: 'diario',
      p_data: dataFim,
    }),
    supabase.rpc('get_conciliacao_experimentais_v2', {
      p_unidade_id: unidadeId,
      p_ano: ano,
      p_mes: mes,
      p_periodo: 'mensal',
      p_data: null,
    }),
    supabase.rpc('get_experimentais_emusys_operacional_v1', {
      p_unidade_id: unidadeId,
      p_ano: ano,
      p_mes: mes,
      p_periodo: 'mensal',
      p_data: null,
    }),
    supabase.rpc('get_experimentais_emusys_operacional_v1', {
      p_unidade_id: unidadeId,
      p_ano: ano,
      p_mes: mes,
      p_periodo: 'diario',
      p_data: dataFim,
    }),
    supabase
      .from('lead_experimentais')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'experimental_agendada')
      .eq('unidade_id', unidadeId)
      .gte('created_at', inicioDiaBRT)
      .lte('created_at', fimDiaBRT),
  ]);

  if (kpisMesResponse.error) throw kpisMesResponse.error;
  if (kpisDiaResponse.error) throw kpisDiaResponse.error;
  if (conciliacaoMesResponse.error) throw conciliacaoMesResponse.error;
  if (emusysMesResponse.error) throw emusysMesResponse.error;
  if (emusysDiaResponse.error) throw emusysDiaResponse.error;
  if (experimentaisAgendadasDiaResponse.error) throw experimentaisAgendadasDiaResponse.error;

  const kpisMes = (kpisMesResponse.data?.kpis || {}) as Record<string, unknown>;
  const kpisDia = (kpisDiaResponse.data?.kpis || {}) as Record<string, unknown>;
  const resumoConciliacaoMes = (conciliacaoMesResponse.data?.resumo || {}) as Record<string, unknown>;
  const resumoEmusysMes = (emusysMesResponse.data?.resumo || {}) as Record<string, unknown>;
  const resumoEmusysDia = (emusysDiaResponse.data?.resumo || {}) as Record<string, unknown>;

  const leadsPeriodo = n(kpisMes.leads_entrantes);
  const experimentaisRealizadasMes = n(resumoConciliacaoMes.experimentais_realizadas_confirmadas);
  const experimentaisEmusysMes = n(resumoEmusysMes.realizadas_emusys);
  const experimentaisFaltasMes = n(resumoEmusysMes.faltas);
  const totalExpAgendadasDia = n(resumoEmusysDia.linhas_raw);
  const experimentaisAgendadasDia = experimentaisAgendadasDiaResponse.count || 0;
  const visitasDiaTotal = n(kpisDia.visitas);

  const matriculasNovas = agruparMatriculasComerciais(
    await buscarMatriculasComerciaisAlunos(supabase, unidadeId, dataInicioMes, dataFim)
  )
    .filter(ehMatriculaComercialCanonicaEdge)
    .sort((a: any, b: any) => String(a.data_matricula || '').localeCompare(String(b.data_matricula || '')));

  const conversaoLeadExp = leadsPeriodo > 0 ? (experimentaisRealizadasMes / leadsPeriodo) * 100 : 0;
  const conversaoLeadMat = leadsPeriodo > 0 ? (matriculasNovas.length / leadsPeriodo) * 100 : 0;
  const taxaExpMatTexto = textoTaxaExpMatComercial(resumoConciliacaoMes, experimentaisRealizadasMes);

  let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `📅 *RELATÓRIO DIÁRIO*\n`;
  texto += `🏢 *${String(unidadeData?.nome || 'Unidade').toUpperCase()}*\n`;
  texto += `📆 ${dia}/${mesNome}/${ano}\n`;
  texto += `👤 ${unidadeData?.hunter_nome || 'Comercial'}\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  texto += `🎯 Leads no mês: *${leadsPeriodo}*\n`;
  texto += `🎸 Experimentais realizadas no mês (Emusys): *${experimentaisEmusysMes}*\n`;
  texto += `✅ Presença + vínculo confirmados: *${experimentaisRealizadasMes}*\n`;
  texto += `❌ Faltas em experimentais no mês (Emusys): *${experimentaisFaltasMes}*\n`;
  texto += `📆 Experimentais no dia (Emusys): *${totalExpAgendadasDia}*\n`;
  texto += `🗓️ Experimentais agendadas no dia: *${experimentaisAgendadasDia}*\n`;
  texto += `🏫 Visitas: *${visitasDiaTotal}*\n\n`;
  texto += `✅ Matrículas no período: *${matriculasNovas.length}*\n\n`;
  texto += `📊 *FUNIL DO MÊS*\n`;
  texto += `Lead → Experimental: *${conversaoLeadExp.toFixed(1)}%* (${experimentaisRealizadasMes}/${leadsPeriodo})\n`;
  texto += `Experimental → Matrícula: ${taxaExpMatTexto}\n`;
  texto += `Lead → Matrícula: *${conversaoLeadMat.toFixed(1)}%* (${matriculasNovas.length}/${leadsPeriodo})\n\n`;

  if (matriculasNovas.length > 0) {
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📝 *LISTA DETALHADA*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    matriculasNovas.forEach((mat: any, i: number) => {
      const dataFormatada = formatarDataCurtaComercial(mat.data_matricula || mat.data_contato);
      texto += `MAT. ${(i + 1).toString().padStart(2, '0')}\n`;
      texto += `📅 Data: ${dataFormatada}\n`;
      texto += `👤 Aluno: ${mat.nome || 'Não informado'}`;
      if (mat.idade) texto += ` (${mat.idade} anos)`;
      texto += `\n`;
      texto += `🎵 Curso: ${mat.cursos_relatorio || mat.curso_nome || 'Não informado'}\n`;
      texto += `👨‍🏫 Professor: ${mat.professores_relatorio || mat.professor_fixo_nome || 'Não informado'}\n`;
      texto += `🎸 Prof. Experimental: ${mat.professores_exp_relatorio || mat.professor_exp_nome || 'Não teve'}\n`;
      texto += `📱 Canal: ${mat.canal_nome || 'Não informado'}\n`;
      texto += `👤 Hunter: ${mat.hunter_nome || unidadeData?.hunter_nome || 'Comercial'}\n`;
      texto += `💵 Pass: R$ ${formatarMoedaComercial(Number(mat.valor_passaporte) || 0)}`;
      if (mat.forma_pagamento_passaporte_nome) texto += ` (${mat.forma_pagamento_passaporte_nome})`;
      texto += `\n`;
      texto += `💵 Parc: ${formatarParcelasMatriculaComercial(mat)}`;
      if (mat.formas_pagamento_relatorio || mat.forma_pagamento_nome) {
        texto += ` (${mat.formas_pagamento_relatorio || mat.forma_pagamento_nome})`;
      }
      texto += `\n\n`;
    });
  }

  texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `📅 Gerado em: ${dia}/${String(mes).padStart(2, '0')}/${ano} às ${horaStr}\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━`;

  return texto;
}

/**
 * Modo CRON: gera relatórios e enfileira na fila_relatorios_whatsapp com 1 min de intervalo
 * O processamento real é feito pelo cron processar-mensagens-agendadas (a cada minuto)
 */
async function processarCron(
  supabase: any
): Promise<{ unidades_processadas: number; unidades_admin_processadas: number; unidades_comercial_processadas: number; resultados: any[] }> {
  console.log('[relatorio-admin-whatsapp] 🕐 Modo CRON iniciado — enfileirando');

  const { data: unidades } = await supabase
    .from('unidades')
    .select('id, nome')
    .eq('relatorio_diario_cron_ativo', true)
    .order('nome');

  const { data: unidadesComerciais } = await supabase
    .from('unidades')
    .select('id, nome')
    .eq('relatorio_comercial_diario_cron_ativo', true)
    .order('nome');

  const unidadesAdmin = unidades || [];
  const unidadesComercial = unidadesComerciais || [];

  if (unidadesAdmin.length === 0 && unidadesComercial.length === 0) {
    console.log('[relatorio-admin-whatsapp] Nenhuma unidade com cron ativo');
    return { unidades_processadas: 0, unidades_admin_processadas: 0, unidades_comercial_processadas: 0, resultados: [] };
  }

  console.log(`[relatorio-admin-whatsapp] Admin: ${unidadesAdmin.length} unidade(s). Comercial: ${unidadesComercial.length} unidade(s).`);

  const agora = new Date();
  const resultados: any[] = [];
  let offsetFilaMinutos = 0;

  for (let i = 0; i < unidadesAdmin.length; i++) {
    const unidade = unidadesAdmin[i];

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
      const agendadaPara = new Date(agora.getTime() + offsetFilaMinutos * 60_000);
      offsetFilaMinutos += 1;

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
          resultados.push({ tipo: 'relatorio_admin', unidade: unidade.nome, grupo: dest.nome, status: 'erro_fila', error: error.message });
        } else {
          console.log(`[relatorio-admin-whatsapp] ✅ ${unidade.nome} → ${dest.nome} enfileirado para ${agendadaPara.toISOString()}`);
          resultados.push({ tipo: 'relatorio_admin', unidade: unidade.nome, grupo: dest.nome, status: 'enfileirado', agendada_para: agendadaPara.toISOString() });
        }
      }
    } catch (error) {
      console.error(`[relatorio-admin-whatsapp] ❌ Erro ao processar ${unidade.nome}:`, error);
      resultados.push({
        tipo: 'relatorio_admin',
        unidade: unidade.nome,
        status: 'error',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  for (let i = 0; i < unidadesComercial.length; i++) {
    const unidade = unidadesComercial[i];

    try {
      let { data: destinatarios } = await supabase
        .from('whatsapp_destinatarios_relatorio')
        .select('jid, nome')
        .eq('tipo', 'relatorio_comercial')
        .eq('ativo', true)
        .eq('unidade_id', unidade.id);

      if (!destinatarios || destinatarios.length === 0) {
        const fallback = await supabase
          .from('whatsapp_destinatarios_relatorio')
          .select('jid, nome')
          .eq('tipo', 'relatorio_admin')
          .eq('ativo', true)
          .eq('unidade_id', unidade.id);
        destinatarios = fallback.data || [];
      }

      if (!destinatarios || destinatarios.length === 0) {
        console.warn(`[relatorio-admin-whatsapp] ⚠️ Comercial ${unidade.nome}: sem destinatários, pulando`);
        resultados.push({ tipo: 'relatorio_comercial', unidade: unidade.nome, status: 'skip', motivo: 'sem_destinatarios' });
        continue;
      }

      const texto = await gerarRelatorioComercialDiario(supabase, unidade.id);
      const agendadaPara = new Date(agora.getTime() + offsetFilaMinutos * 60_000);
      offsetFilaMinutos += 1;

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
          console.error(`[relatorio-admin-whatsapp] ❌ Erro ao enfileirar comercial ${unidade.nome}:`, error.message);
          resultados.push({ tipo: 'relatorio_comercial', unidade: unidade.nome, grupo: dest.nome, status: 'erro_fila', error: error.message });
        } else {
          console.log(`[relatorio-admin-whatsapp] ✅ Comercial ${unidade.nome} → ${dest.nome} enfileirado para ${agendadaPara.toISOString()}`);
          resultados.push({ tipo: 'relatorio_comercial', unidade: unidade.nome, grupo: dest.nome, status: 'enfileirado', agendada_para: agendadaPara.toISOString() });
        }
      }
    } catch (error) {
      console.error(`[relatorio-admin-whatsapp] ❌ Erro ao processar comercial ${unidade.nome}:`, error);
      resultados.push({
        tipo: 'relatorio_comercial',
        unidade: unidade.nome,
        status: 'error',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  console.log(`[relatorio-admin-whatsapp] 🕐 Modo CRON finalizado. ${resultados.length} item(ns) enfileirado(s)`);
  return {
    unidades_processadas: unidadesAdmin.length + unidadesComercial.length,
    unidades_admin_processadas: unidadesAdmin.length,
    unidades_comercial_processadas: unidadesComercial.length,
    resultados,
  };
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

    if (payload.modo === 'dry_run_comercial') {
      if (!payload.unidade || payload.unidade === 'todos') {
        return new Response(
          JSON.stringify({ success: false, error: 'Unidade obrigatória para dry_run_comercial' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const texto = await gerarRelatorioComercialDiario(supabase, payload.unidade);
      return new Response(
        JSON.stringify({ success: true, dry_run: true, tipo: 'relatorio_comercial', unidade: payload.unidade, texto }),
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
    const destinoRelatorio = String(payload.tipoRelatorio || '').startsWith('comercial_')
      ? 'relatorio_comercial'
      : 'relatorio_admin';

    let destQuery = supabase
      .from('whatsapp_destinatarios_relatorio')
      .select('jid, nome, unidade_id')
      .eq('tipo', destinoRelatorio)
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
