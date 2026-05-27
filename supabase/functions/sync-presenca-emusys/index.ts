// Edge Function: sync-presenca-emusys
// Sincroniza aulas e presença dos alunos do Emusys para aulas_emusys + aluno_presenca
// Chamada diariamente via pg_cron (22h BRT) com janela de 7 dias

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EMUSYS_API = 'https://api.emusys.com.br/v1';

const UNIDADES = [
  { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: 'nEAlBC5gjtqojA7qberYVOttD1lXdx' },
  { nome: 'Barra',        id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: '4reVMLdiBmdNTOBQKa4m7WGYQaRDKI' },
  { nome: 'Recreio',      id: '95553e96-971b-4590-a6eb-0201d013c14d', token: 'rUI85cQTePX1ecpLwWLbAWY9UM9yiF' },
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalizar nome para matching (mesmo padrão do parseEmusysFile.ts)
function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalizar nome de curso: lowercase + sem acentos + remove sufixos do Emusys
// (" t" — turma, " para instrumento" — variante de Musicalizacao Preparatoria)
function normalizarCurso(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+para\s+instrumento$/, '')
    .replace(/\s+t$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrair dia da semana em portugues sem sufixo "-feira" (BRT)
function extrairDiaSemana(isoDate: string): string {
  const dia = new Date(isoDate).toLocaleDateString('pt-BR', {
    weekday: 'long',
    timeZone: 'America/Sao_Paulo',
  });
  const cap = dia.charAt(0).toUpperCase() + dia.slice(1);
  return cap.replace('-feira', '');
}

// Extrair horario HH:MM:SS em BRT
function extrairHorarioBRT(isoDate: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(isoDate));
}

interface AlunoEmusys {
  nome_aluno: string;
  presenca: string;
  horario_presenca: string | null;
  data_nascimento_aluno?: string;
  email_aluno?: string;
  telefone_aluno?: string;
  nome_responsavel?: string;
  email_responsavel?: string;
  telefone_responsavel?: string;
}

interface AulaEmusys {
  id: number;
  nr_da_aula: number | null;
  qtd_aulas_contrato: number | null;
  tipo: string;
  categoria: string;
  turma_nome: string | null;
  curso_id: number | null;
  curso_nome: string;
  cancelada: boolean;
  data_hora_inicio: string;
  data_hora_fim: string | null;
  duracao_minutos: number | null;
  sala_id: number | null;
  sala_nome: string | null;
  professores: { nome: string; presenca: string }[];
  alunos: AlunoEmusys[];
  anotacoes: string | null;
}

// Match professor: exato → prefixo → primeiro+último nome
function matchProfessor(
  nomeEmusys: string,
  profMapa: Map<string, number>,
  profNomes: string[]
): number | null {
  const norm = normalizarNome(nomeEmusys);

  // 1. Match exato
  if (profMapa.has(norm)) return profMapa.get(norm)!;

  // 2. Match por prefixo (nome DB é prefixo do nome Emusys)
  for (const profNorm of profNomes) {
    if (norm.startsWith(profNorm + ' ') || profNorm.startsWith(norm + ' ')) {
      return profMapa.get(profNorm)!;
    }
  }

  // 3. Match por primeiro + último nome
  const partsEmusys = norm.split(' ');
  if (partsEmusys.length >= 2) {
    const primeiro = partsEmusys[0];
    const ultimo = partsEmusys[partsEmusys.length - 1];
    for (const profNorm of profNomes) {
      const partsBD = profNorm.split(' ');
      if (partsBD.length >= 2 && partsBD[0] === primeiro && partsBD[partsBD.length - 1] === ultimo) {
        return profMapa.get(profNorm)!;
      }
    }
  }

  return null;
}

// Buscar todas as aulas de um dia no Emusys (com paginação)
async function fetchAulasDia(token: string, data: string): Promise<AulaEmusys[]> {
  const todas: AulaEmusys[] = [];
  let cursor: string | null = null;
  let temMais = true;

  while (temMais) {
    let url = `${EMUSYS_API}/aulas/?data_hora_inicial=${data}T00:00:00&data_hora_final=${data}T23:59:59&limite=100`;
    if (cursor) url += `&cursor=${cursor}`;

    const resp = await fetch(url, { headers: { token } });
    if (!resp.ok) {
      console.error(`[sync-presenca] Emusys API error: ${resp.status}`);
      break;
    }

    const json = await resp.json();
    const items = json.items || [];
    todas.push(...items);

    const pag = json.paginacao || {};
    temMais = pag.tem_mais === true;
    cursor = pag.proximo_cursor || null;
  }

  return todas;
}

// Converter data_hora_inicio do Emusys ("2026-03-04 14:00") para ISO com timezone BRT
function parseDataHoraEmusys(dataHora: string): string {
  // Emusys retorna "YYYY-MM-DD HH:mm" em horário local (BRT = UTC-3)
  return dataHora.replace(' ', 'T') + ':00-03:00';
}

// Dados coletados de aulas experimentais para reconciliação
interface ExperimentalParaReconciliar {
  dataAula: string;
  horario: string;
  professorId: number | null;
  unidadeId: string;
  cancelada: boolean;
  alunos: AlunoEmusys[];
}

// Normalizar telefone para formato do banco (55XXXXXXXXXXX)
function normalizarTelefone(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : '55' + digits;
}

// Rede de segurança: reconciliar experimentais que o webhook não atualizou
// Parte das aulas experimentais do Emusys e busca leads correspondentes por telefone/nome
// Insere na lead_experimentais (não nas colunas legadas do lead)
async function reconciliarExperimentaisOrfas(
  supabase: any,
  experimentais: ExperimentalParaReconciliar[]
) {
  const logs: { lead_id: number; lead_nome: string; unidade: string; data: string; status: string; motivo: string }[] = [];
  const unidadeNomes = new Map(UNIDADES.map(u => [u.id, u.nome]));

  for (const exp of experimentais) {
    // Cancelada: atualizar registros existentes para 'cancelada' e pular
    if (exp.cancelada) {
      for (const aluno of exp.alunos) {
        const nomeAluno = aluno.nome_aluno?.trim();
        if (!nomeAluno) continue;
        await supabase
          .from('lead_experimentais')
          .update({ status: 'cancelada', updated_at: new Date().toISOString() })
          .eq('nome_aluno', nomeAluno)
          .eq('data_experimental', exp.dataAula)
          .eq('unidade_id', exp.unidadeId)
          .neq('status', 'cancelada');
      }
      continue;
    }

    for (const aluno of exp.alunos) {
      const nomeAluno = aluno.nome_aluno?.trim();
      if (!nomeAluno) continue;

      const unidadeNome = unidadeNomes.get(exp.unidadeId) || exp.unidadeId;
      const telNorm = normalizarTelefone(aluno.telefone_aluno) || normalizarTelefone(aluno.telefone_responsavel);

      const presente = aluno.presenca === 'presente';
      const novoStatus = presente ? 'experimental_realizada' : 'experimental_faltou';

      // Verificar se já existe registro na lead_experimentais para esse aluno+data
      const { data: expExistente } = await supabase
        .from('lead_experimentais')
        .select('id, status')
        .eq('nome_aluno', nomeAluno)
        .eq('data_experimental', exp.dataAula)
        .eq('unidade_id', exp.unidadeId)
        .neq('status', 'cancelada')
        .limit(1)
        .maybeSingle();

      if (expExistente) {
        // Reconciliação bidirecional: corrigir se status diverge do Emusys
        if (expExistente.status !== novoStatus) {
          await supabase.from('lead_experimentais').update({
            status: novoStatus,
            etapa_pipeline_id: presente ? 7 : 9,
            updated_at: new Date().toISOString()
          }).eq('id', expExistente.id);
        }
        continue;
      }

      // Buscar lead por telefone
      let leadId: number | null = null;
      let matchadoPorNome = false;
      if (telNorm) {
        const { data: leadPorTel } = await supabase
          .from('leads')
          .select('id')
          .eq('telefone', telNorm)
          .eq('unidade_id', exp.unidadeId)
          .eq('arquivado', false)
          .limit(1)
          .maybeSingle();
        if (leadPorTel) leadId = leadPorTel.id;
      }

      // Fallback por nome normalizado
      if (!leadId) {
        const nomeNorm = normalizarNome(nomeAluno);
        const { data: leads } = await supabase
          .from('leads')
          .select('id, nome, data_experimental')
          .eq('unidade_id', exp.unidadeId)
          .eq('arquivado', false)
          .limit(100);

        const match = (leads || []).find((l: any) => l.nome && normalizarNome(l.nome) === nomeNorm);
        if (match) {
          // Guard: match por nome só é aceito se o lead tem data_experimental definida
          // (evita falso positivo ao criar registro para lead diferente com nome parecido)
          if (!match.data_experimental) continue;
          leadId = match.id;
          matchadoPorNome = true;
        }
      }

      if (!leadId) continue;

      // Inserir na lead_experimentais direto no estado final
      const status = novoStatus;

      const { error } = await supabase
        .from('lead_experimentais')
        .insert({
          lead_id: leadId,
          nome_aluno: nomeAluno,
          unidade_id: exp.unidadeId,
          data_experimental: exp.dataAula,
          horario_experimental: exp.horario + ':00',
          professor_experimental_id: exp.professorId,
          status,
          etapa_pipeline_id: presente ? 7 : 9,
        });

      logs.push({
        lead_id: leadId,
        lead_nome: nomeAluno,
        unidade: unidadeNome,
        data: exp.dataAula,
        status: error ? 'erro' : (presente ? 'reconciliada_presente' : 'reconciliada_faltou'),
        motivo: error
          ? error.message
          : `Experimental ${presente ? 'realizada' : 'faltou'} via reconciliação (matchadoPorNome=${matchadoPorNome})`
      });
    }
  }

  // Gravar logs
  for (const log of logs) {
    await supabase.from('leads_automacao_log').insert({
      lead_id: log.lead_id,
      lead_nome: log.lead_nome,
      unidade_nome: log.unidade,
      evento: 'sync_experimental_reconciliacao',
      acao: log.status,
      detalhes: { data: log.data, motivo: log.motivo },
      workflow_id: 'sync-presenca-emusys',
      execution_id: new Date().toISOString()
    });
  }

  const reconciliadas = logs.filter(l => l.status.startsWith('reconciliada_'));
  console.log(`[sync-presenca] Reconciliação experimentais: ${reconciliadas.length} reconciliadas de ${logs.length} processadas`);

  return logs;
}

// Confirmar experimentais: cruzar aulas_emusys (categoria=experimental) com lead_experimentais agendadas
async function confirmarExperimentais(
  supabase: any,
  _datasProcessar: string[]
) {
  const logs: { lead_id: number; lead_nome: string; unidade: string; data: string; professor: string; status: string; motivo: string }[] = [];

  const hoje = new Date();
  const hojeBRT = new Date(hoje.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  const limiteAntiguidadeDias = 14;
  const limiteAutoFaltouDias = 7;
  const dataLimite = new Date(hoje.getTime() - limiteAntiguidadeDias * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dataAutoFaltou = new Date(hoje.getTime() - limiteAutoFaltouDias * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Auto-marcar como "faltou" experimentais com mais de 7 dias sem confirmação
  const { data: expExpiradas } = await supabase
    .from('lead_experimentais')
    .select('id, lead_id, nome_aluno, unidade_id')
    .eq('status', 'experimental_agendada')
    .lt('data_experimental', dataAutoFaltou);

  if (expExpiradas?.length) {
    for (const exp of expExpiradas) {
      await supabase.from('lead_experimentais').update({
        status: 'experimental_faltou', updated_at: new Date().toISOString()
      }).eq('id', exp.id);
      // NUNCA regredir lead já convertido
      await supabase.from('leads').update({
        faltou_experimental: true, status: 'experimental_faltou', etapa_pipeline_id: 9, updated_at: new Date().toISOString()
      }).eq('id', exp.lead_id).not('status', 'in', '("convertido","matriculado")');
    }
    console.log(`[sync-presenca] Auto-faltou: ${expExpiradas.length} experimentais com mais de ${limiteAutoFaltouDias} dias`);
  }

  // Buscar experimentais pendentes dos últimos 14 dias (não mais antigas)
  const { data: expPendentes } = await supabase
    .from('lead_experimentais')
    .select('id, lead_id, nome_aluno, data_experimental, horario_experimental, professor_experimental_id, unidade_id')
    .eq('status', 'experimental_agendada')
    .gte('data_experimental', dataLimite)
    .lte('data_experimental', hojeBRT);

  if (!expPendentes?.length) return logs;

  const unidadeNomes = new Map(UNIDADES.map(u => [u.id, u.nome]));

  for (const exp of expPendentes) {
    if (!exp.professor_experimental_id) {
      logs.push({
        lead_id: exp.lead_id,
        lead_nome: exp.nome_aluno || 'Sem nome',
        unidade: unidadeNomes.get(exp.unidade_id) || exp.unidade_id,
        data: exp.data_experimental,
        professor: 'sem_professor',
        status: 'nao_encontrada',
        motivo: 'Experimental sem professor vinculado'
      });
      continue;
    }

    // Buscar aula experimental no aulas_emusys
    let { data: aulasMatch } = await supabase
      .from('aulas_emusys')
      .select('id, data_hora_inicio, cancelada')
      .eq('data_aula', exp.data_experimental)
      .eq('professor_id', exp.professor_experimental_id)
      .eq('unidade_id', exp.unidade_id)
      .eq('categoria', 'experimental')
      .limit(5);

    // Fallback: se não encontrou com professor, buscar por data+unidade+categoria
    // (professor pode ter mudado no reagendamento)
    if (!aulasMatch?.length && exp.horario_experimental) {
      const { data: aulasFallback } = await supabase
        .from('aulas_emusys')
        .select('id, data_hora_inicio, cancelada')
        .eq('data_aula', exp.data_experimental)
        .eq('unidade_id', exp.unidade_id)
        .eq('categoria', 'experimental')
        .limit(10);

      if (aulasFallback?.length) {
        const horaExp = exp.horario_experimental.slice(0, 5);
        const matchHorario = aulasFallback.find((a: any) => {
          const horaAula = new Date(a.data_hora_inicio).toISOString().slice(11, 16);
          return horaAula === horaExp;
        });
        if (matchHorario) aulasMatch = [matchHorario];
      }
    }

    const unidadeNome = unidadeNomes.get(exp.unidade_id) || exp.unidade_id;

    if (!aulasMatch?.length) {
      logs.push({
        lead_id: exp.lead_id,
        lead_nome: exp.nome_aluno || 'Sem nome',
        unidade: unidadeNome,
        data: exp.data_experimental,
        professor: String(exp.professor_experimental_id),
        status: 'nao_encontrada',
        motivo: 'Aula experimental não encontrada no Emusys'
      });
      continue;
    }

    // Filtrar por horário
    let aulaFinal = aulasMatch[0];
    if (exp.horario_experimental && aulasMatch.length > 1) {
      const horaExp = exp.horario_experimental.slice(0, 5);
      const matchHorario = aulasMatch.find((a: any) => {
        const horaAula = new Date(a.data_hora_inicio).toISOString().slice(11, 16);
        return horaAula === horaExp;
      });
      if (matchHorario) aulaFinal = matchHorario;
    }

    if (aulaFinal.cancelada) {
      await supabase
        .from('lead_experimentais')
        .update({ status: 'cancelada', updated_at: new Date().toISOString() })
        .eq('id', exp.id);
      logs.push({
        lead_id: exp.lead_id,
        lead_nome: exp.nome_aluno || 'Sem nome',
        unidade: unidadeNome,
        data: exp.data_experimental,
        professor: String(exp.professor_experimental_id),
        status: 'cancelada',
        motivo: 'Aula experimental cancelada no Emusys'
      });
      continue;
    }

    // Atualizar na lead_experimentais
    const { error: expError } = await supabase
      .from('lead_experimentais')
      .update({
        status: 'experimental_realizada',
        etapa_pipeline_id: 7,
        updated_at: new Date().toISOString()
      })
      .eq('id', exp.id);

    // Atualizar colunas legadas do lead (compatibilidade)
    // NUNCA regredir lead já convertido — só atualizar se não está convertido
    await supabase
      .from('leads')
      .update({
        experimental_realizada: true,
        status: 'experimental_realizada',
        etapa_pipeline_id: 7,
        updated_at: new Date().toISOString()
      })
      .eq('id', exp.lead_id)
      .not('status', 'in', '("convertido","matriculado")');

    logs.push({
      lead_id: exp.lead_id,
      lead_nome: exp.nome_aluno || 'Sem nome',
      unidade: unidadeNome,
      data: exp.data_experimental,
      professor: String(exp.professor_experimental_id),
      status: expError ? 'erro' : 'confirmada',
      motivo: expError ? expError.message : 'Experimental confirmada via sync Emusys'
    });
  }

  // Gravar logs
  for (const log of logs) {
    await supabase.from('leads_automacao_log').insert({
      lead_id: log.lead_id,
      lead_nome: log.lead_nome,
      unidade_nome: log.unidade,
      evento: 'sync_experimental_presenca',
      acao: log.status,
      detalhes: { data: log.data, professor_id: log.professor, motivo: log.motivo },
      workflow_id: 'sync-presenca-emusys',
      execution_id: new Date().toISOString()
    });
  }

  console.log(`[sync-presenca] Experimentais: ${logs.filter(l => l.status === 'confirmada').length} confirmadas, ${logs.filter(l => l.status === 'nao_encontrada').length} não encontradas, ${logs.filter(l => l.status === 'cancelada').length} canceladas`);

  return logs;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parâmetros: data (YYYY-MM-DD, default hoje), dias (default 1), unidade_index (0-2, default todas)
    let dataFim: string;
    let dias = 1;
    let unidadeIndex: number | null = null;
    try {
      const body = await req.json();
      dataFim = body.data || '';
      dias = Math.min(Math.max(body.dias || 1, 1), 30); // 1-30 dias
      unidadeIndex = body.unidade_index ?? null;
    } catch {
      dataFim = '';
    }

    if (!dataFim) {
      const now = new Date();
      const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      dataFim = brt.toISOString().split('T')[0];
    }

    // Gerar lista de datas a processar
    const datasProcessar: string[] = [];
    for (let d = dias - 1; d >= 0; d--) {
      const dt = new Date(dataFim + 'T12:00:00');
      dt.setDate(dt.getDate() - d);
      datasProcessar.push(dt.toISOString().split('T')[0]);
    }

    const unidadesProcessar = unidadeIndex !== null ? [UNIDADES[unidadeIndex]] : UNIDADES;
    console.log(`[sync-presenca] Iniciando sync para ${dias} dia(s): ${datasProcessar[0]} a ${dataFim}, unidade: ${unidadeIndex !== null ? unidadesProcessar[0]?.nome : 'todas'}`);

    // Buscar todos os alunos ativos para matching (paginado para contornar limite de 1000 rows do PostgREST)
    const alunosDB: { id: number; nome: string; unidade_id: string; data_nascimento: string | null; curso_id: number | null }[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('alunos')
        .select('id, nome, unidade_id, data_nascimento, curso_id')
        .in('status', ['ativo', 'aviso_previo'])
        .range(offset, offset + PAGE_SIZE - 1);
      if (pageError) throw new Error(`Erro ao buscar alunos: ${pageError.message}`);
      alunosDB.push(...(page || []));
      hasMore = (page?.length || 0) === PAGE_SIZE;
      offset += PAGE_SIZE;
    }
    console.log(`[sync-presenca] ${alunosDB.length} alunos ativos carregados`);

    if (alunosDB.length === 0) {
      throw new Error('Nenhum aluno ativo encontrado');
    }

    // Buscar professores ativos para matching
    const { data: professoresDB } = await supabase
      .from('professores')
      .select('id, nome')
      .eq('ativo', true);

    const profMapa = new Map<string, number>();
    const profNomes: string[] = [];
    for (const prof of professoresDB || []) {
      const norm = normalizarNome(prof.nome);
      profMapa.set(norm, prof.id);
      profNomes.push(norm);
    }

    // Mapa de cursos: nome_normalizado -> curso_id (nossa base)
    const { data: cursosDB } = await supabase
      .from('cursos')
      .select('id, nome')
      .eq('ativo', true);
    const cursoMapa = new Map<string, number>();
    for (const curso of cursosDB || []) {
      cursoMapa.set(normalizarCurso(curso.nome), curso.id);
    }

    // Criar mapa de aluno por unidade com chave composta (nome + data_nasc + curso_id)
    // Entrada contem array de ids para detectar ambiguidade (nao atualizar se >1 match)
    // Tambem mantem um mapa de fallback com chave simples (nome) para compatibilidade do match de presenca.
    const alunosPorUnidadeComposta = new Map<string, Map<string, number[]>>();
    const alunosPorUnidadeSimples = new Map<string, Map<string, number>>();
    for (const aluno of alunosDB || []) {
      const uid = aluno.unidade_id;
      if (!alunosPorUnidadeComposta.has(uid)) alunosPorUnidadeComposta.set(uid, new Map());
      if (!alunosPorUnidadeSimples.has(uid)) alunosPorUnidadeSimples.set(uid, new Map());

      const nomeNorm = normalizarNome(aluno.nome);
      const chaveComposta = `${nomeNorm}|${aluno.data_nascimento ?? ''}|${aluno.curso_id ?? ''}`;
      const mapaComp = alunosPorUnidadeComposta.get(uid)!;
      const arr = mapaComp.get(chaveComposta) ?? [];
      arr.push(aluno.id);
      mapaComp.set(chaveComposta, arr);

      alunosPorUnidadeSimples.get(uid)!.set(nomeNorm, aluno.id);
    }

    const resultados = [];
    const experimentaisColetadas: ExperimentalParaReconciliar[] = [];

    for (const dataAlvo of datasProcessar) {
      console.log(`[sync-presenca] === Processando data: ${dataAlvo} ===`);

      for (const unidade of unidadesProcessar) {
        console.log(`[sync-presenca] ${dataAlvo} - ${unidade.nome}...`);

        // 1. Buscar aulas do dia no Emusys
        const aulas = await fetchAulasDia(unidade.token, dataAlvo);

        const mapaAlunos = alunosPorUnidadeSimples.get(unidade.id) || new Map();
        const mapaAlunosComposto = alunosPorUnidadeComposta.get(unidade.id) || new Map();
        let totalPresencas = 0;
        let matched = 0;
        let naoEncontrados = 0;
        const nomesNaoEncontrados: string[] = [];
        let presentes = 0;
        let ausentes = 0;
        let aulasProcessadas = 0;

        // 2. Processar aula por aula (não mais agrupado por dia)
        for (const aula of aulas) {
          if (aula.cancelada) continue;
          aulasProcessadas++;

          const profNome = aula.professores?.[0]?.nome || null;
          const professorId = profNome ? matchProfessor(profNome, profMapa, profNomes) : null;

          // Coletar aulas experimentais para reconciliação
          if (aula.categoria === 'experimental') {
            const horario = aula.data_hora_inicio?.split(' ')[1] || '00:00';
            experimentaisColetadas.push({
              dataAula: dataAlvo,
              horario,
              professorId,
              unidadeId: unidade.id,
              cancelada: aula.cancelada,
              alunos: aula.alunos || [],
            });
          }

          // 2a. UPSERT dados da aula na aulas_emusys
          const { data: aulaDB, error: aulaError } = await supabase
            .from('aulas_emusys')
            .upsert(
              {
                emusys_id: aula.id,
                unidade_id: unidade.id,
                data_aula: dataAlvo,
                data_hora_inicio: parseDataHoraEmusys(aula.data_hora_inicio),
                data_hora_fim: aula.data_hora_fim ? parseDataHoraEmusys(aula.data_hora_fim) : null,
                duracao_minutos: aula.duracao_minutos,
                tipo: aula.tipo,
                categoria: aula.categoria,
                turma_nome: aula.turma_nome,
                curso_emusys_id: aula.curso_id,
                curso_nome: aula.curso_nome,
                sala_nome: aula.sala_nome,
                professor_nome: profNome,
                professor_id: professorId,
                cancelada: false,
                nr_da_aula: aula.nr_da_aula,
                qtd_alunos: aula.alunos?.length || 0,
                anotacoes: aula.anotacoes || null,
              },
              { onConflict: 'emusys_id,unidade_id', ignoreDuplicates: false }
            )
            .select('id')
            .single();

          if (aulaError) {
            console.error(`[sync-presenca] Upsert aula ${aula.id} error:`, aulaError.message);
            continue;
          }

          const aulaLocalId = aulaDB.id;

          // Resolver curso_id local da aula (para match composto)
          const cursoIdAula = cursoMapa.get(normalizarCurso(aula.curso_nome || '')) ?? null;

          // 2b. Processar presença de cada aluno nesta aula
          for (const aluno of aula.alunos || []) {
            const nome = aluno.nome_aluno?.trim();
            if (!nome) continue;

            totalPresencas++;
            const nomeNorm = normalizarNome(nome);
            const alunoId = mapaAlunos.get(nomeNorm);

            if (!alunoId) {
              naoEncontrados++;
              if (!nomesNaoEncontrados.includes(nome)) {
                nomesNaoEncontrados.push(nome);
                // Log individual para alunos não encontrados
                await supabase.from('automacao_log').insert({
                  aluno_nome: nome,
                  aluno_id: null,
                  unidade_nome: unidade.nome,
                  evento: 'sync_presenca',
                  acao: 'nao_encontrado',
                  detalhes: { curso: aula.curso_nome, professor: profNome, data: dataAlvo },
                  workflow_id: 'sync-presenca-emusys',
                  execution_id: new Date().toISOString()
                });
              }
              continue;
            }

            matched++;
            const status = aluno.presenca === 'presente' ? 'presente' : 'ausente';
            if (status === 'presente') presentes++;
            else ausentes++;

            // UPSERT presença vinculada à aula
            const { error: upsertError } = await supabase
              .from('aluno_presenca')
              .upsert(
                {
                  aluno_id: alunoId,
                  aula_emusys_id: aulaLocalId,
                  professor_id: professorId,
                  unidade_id: unidade.id,
                  data_aula: dataAlvo,
                  horario_aula: aluno.horario_presenca,
                  status,
                  curso_nome: aula.curso_nome,
                  turma_nome: aula.turma_nome,
                  sala_nome: aula.sala_nome,
                  respondido_por: 'emusys',
                  respondido_em: new Date().toISOString(),
                },
                {
                  onConflict: 'aluno_id,aula_emusys_id',
                  ignoreDuplicates: false,
                }
              );

            if (upsertError) {
              console.error(`[sync-presenca] Upsert presença ${nome} aula ${aula.id}:`, upsertError.message);
            }

            // 2c. Atualizar dia_aula/horario_aula do aluno — so se aula recorrente
            // (categoria 'normal', nunca reposicao/experimental/extra/avulsa) e match composto inequivoco
            if (aula.categoria === 'normal') {
              const chaveComposta = `${nomeNorm}|${aluno.data_nascimento_aluno ?? ''}|${cursoIdAula ?? ''}`;
              const candidatos = mapaAlunosComposto.get(chaveComposta) ?? [];
              if (candidatos.length === 1) {
                const alunoIdUnico = candidatos[0];
                const diaAula = extrairDiaSemana(aula.data_hora_inicio);
                const horarioAula = extrairHorarioBRT(aula.data_hora_inicio);
                const { error: updErr } = await supabase
                  .from('alunos')
                  .update({ dia_aula: diaAula, horario_aula: horarioAula })
                  .eq('id', alunoIdUnico);
                if (updErr) {
                  console.error(`[sync-presenca] Update horario ${nome} aluno ${alunoIdUnico}:`, updErr.message);
                }
              }
              // Se candidatos.length !== 1 (ambiguo ou nao encontrado na chave composta):
              // preserva horario atual para evitar sobrescrever aluno errado (caso de 2o curso sem curso_id mapeado).
            }
          }
        }

        // 3. Log
        await supabase.from('emusys_sync_log').insert({
          unidade_id: unidade.id,
          unidade_nome: unidade.nome,
          data_sync: dataAlvo,
          total_aulas: aulasProcessadas,
          total_registros: totalPresencas,
          presentes,
          ausentes,
          alunos_matched: matched,
          alunos_nao_encontrados: naoEncontrados,
          nomes_nao_encontrados: nomesNaoEncontrados,
        });

        resultados.push({
          data: dataAlvo,
          unidade: unidade.nome,
          aulas: aulasProcessadas,
          registros_presenca: totalPresencas,
          matched,
          nao_encontrados: naoEncontrados,
          presentes,
          ausentes,
        });
      }
    }

    // Recalcular percentual_presenca para todas as unidades (uma vez no final)
    for (const unidade of UNIDADES) {
      await supabase.rpc('atualizar_percentual_presenca', { p_unidade_id: unidade.id });
    }

    // Reconciliar experimentais órfãs (rede de segurança do webhook)
    const logsReconciliacao = await reconciliarExperimentaisOrfas(supabase, experimentaisColetadas);
    console.log(`[sync-presenca] Reconciliação experimentais: ${logsReconciliacao.length}`);

    // Confirmar experimentais com base nas aulas sincronizadas
    const logsExperimentais = await confirmarExperimentais(supabase, datasProcessar);
    console.log(`[sync-presenca] Experimentais processadas: ${logsExperimentais.length}`);

    return new Response(
      JSON.stringify({ success: true, dias, data_inicio: datasProcessar[0], data_fim: dataFim, resultados, experimentais_reconciliadas: logsReconciliacao, experimentais_confirmadas: logsExperimentais }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-presenca] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
