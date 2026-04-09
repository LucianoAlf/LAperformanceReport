// Edge Function: processar-matricula-emusys
// Processa webhooks de matrícula do Emusys: nova, renovação, trancamento, evasão
// Substitui a lógica de banco do workflow n8n WF_Matricula_Funcional

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== MAPEAMENTOS ====================

const ESCOLA_UNIDADE: Record<number, { id: string; nome: string }> = {
  39: { id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Campo Grande' },
  40: { id: '95553e96-971b-4590-a6eb-0201d013c14d', nome: 'Recreio' },
  316: { id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Barra' },
};

// ==================== HELPERS ====================

function normalizarTelefone(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function calcularIdade(dataNascimento: string | null): number | null {
  if (!dataNascimento) return null;
  const hoje = new Date();
  const nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function calcularClassificacao(dataNascimento: string | null): string | null {
  const idade = calcularIdade(dataNascimento);
  if (idade === null) return null;
  return idade <= 12 ? 'LAMK' : 'EMLA';
}

interface Payload {
  evento: string;
  unidadeId: string;
  unidadeNome: string;
  escolaId: number;
  emusysLeadId: number | null;
  nomeAluno: string;
  telefoneAluno: string | null;
  emailAluno: string | null;
  nomeResponsavel: string | null;
  telefoneResponsavel: string | null;
  dataNascimento: string | null;
  dataMatricula: string | null;
  nomeCurso: string | null;
  diaAula: string | null;
  horarioAula: string | null;
  dataInicioContrato: string | null;
  dataFimContrato: string | null;
  valorMensalidade: number | null;
  classificacao: string | null;
  idade: number | null;
  professorNome: string | null;
  professorEmusysId: number | null;
  trancamentoMotivo: string | null;
  trancamentoDataInicial: string | null;
  trancamentoDataFinal: string | null;
  finalizacaoMotivo: string | null;
  finalizacaoObservacoes: string | null;
  emusysCursoId: number | null;
  fotoAlunoUrl: string | null;
  instagram: string | null;
  rawPayload: any; // payload completo para debug
}

function parsePayload(body: any): Payload | null {
  if (!body?.evento || !body?.matricula) return null;

  const escola = ESCOLA_UNIDADE[body.escola_id];
  if (!escola) return null;

  const m = body.matricula;
  const disc = m.disciplinas?.[0];
  const agend = disc?.agendamentos?.[0];
  const tranc = body.trancamento;
  const finaliz = body.finalizacao;

  return {
    evento: body.evento,
    unidadeId: escola.id,
    unidadeNome: escola.nome,
    escolaId: body.escola_id,
    emusysLeadId: m.lead_id || null,
    nomeAluno: (m.nome_aluno || '').trim(),
    telefoneAluno: normalizarTelefone(m.telefone_aluno),
    emailAluno: m.email_aluno || null,
    nomeResponsavel: m.nome_responsavel || m.nome_aluno || null,
    telefoneResponsavel: normalizarTelefone(m.telefone_responsavel || m.telefone_aluno),
    dataNascimento: m.data_nascimento_aluno || null,
    dataMatricula: m.data_matricula || null,
    nomeCurso: m.nome_curso?.trim() || null,
    diaAula: agend?.dia_da_semana_nome || null,
    horarioAula: agend?.horario || null,
    dataInicioContrato: disc?.data_hora_primeira_aula || null,
    dataFimContrato: disc?.data_hora_ultima_aula || null,
    valorMensalidade: m.valor || null,
    classificacao: calcularClassificacao(m.data_nascimento_aluno),
    idade: calcularIdade(m.data_nascimento_aluno),
    professorNome: disc?.nome_professor || null,
    professorEmusysId: disc?.id_professor || null,
    trancamentoMotivo: tranc?.motivo || null,
    trancamentoDataInicial: tranc?.data_inicial || null,
    trancamentoDataFinal: tranc?.data_final || null,
    finalizacaoMotivo: finaliz?.motivo || null,
    finalizacaoObservacoes: finaliz?.observacoes || null,
    emusysCursoId: m.curso_id ? Number(m.curso_id) : null,
    fotoAlunoUrl: m.foto_aluno_url || null,
    instagram: m.campos_personalizados_aluno?.find((c: any) => c.nome === 'Instagram')?.valor || null,
    rawPayload: body,
  };
}

// ==================== RESOLVERS ====================

async function resolverCursoId(supabase: any, nomeCurso: string | null, emusysCursoId: number | null = null): Promise<number | null> {
  // 1. Tentar match por emusys_curso_id (exato)
  if (emusysCursoId) {
    const { data } = await supabase
      .from('cursos')
      .select('id')
      .contains('emusys_ids', [emusysCursoId])
      .limit(1);
    if (data?.[0]?.id) return data[0].id;
  }

  // 2. Fallback: match por nome
  if (!nomeCurso) return null;
  const nome = nomeCurso.trim();
  const { data } = await supabase
    .from('cursos')
    .select('id, emusys_ids')
    .or(`nome.ilike.${nome},nome.ilike.${nome}%`)
    .order('nome')
    .limit(1);

  const curso = data?.[0];
  if (!curso) return null;

  // 3. Auto-preencher emusys_ids se encontrou por nome e temos o emusys_curso_id
  if (emusysCursoId && curso.id) {
    const idsAtuais = curso.emusys_ids || [];
    if (!idsAtuais.includes(emusysCursoId)) {
      await supabase
        .from('cursos')
        .update({ emusys_ids: [...idsAtuais, emusysCursoId] })
        .eq('id', curso.id);
    }
  }

  return curso.id;
}

async function resolverProfessorId(supabase: any, emusysId: number | null, unidadeId: string): Promise<number | null> {
  if (!emusysId) return null;
  const { data } = await supabase
    .from('professores_unidades')
    .select('professor_id')
    .eq('emusys_id', emusysId)
    .eq('unidade_id', unidadeId)
    .limit(1);
  return data?.[0]?.professor_id || null;
}

async function buscarAluno(supabase: any, nome: string, unidadeId: string): Promise<{ id: number; professor_atual_id: number | null; curso_id: number | null; valor_parcela: number | null; numero_renovacoes: number | null } | null> {
  const { data } = await supabase
    .from('alunos')
    .select('id, professor_atual_id, curso_id, valor_parcela, numero_renovacoes')
    .eq('unidade_id', unidadeId)
    .ilike('nome', nome.trim())
    .limit(1);
  return data?.[0] || null;
}

// ==================== CONVERTER LEAD ====================

async function converterLead(supabase: any, p: Payload): Promise<{ leadId: number | null; action: string }> {
  let leadId: number | null = null;

  // 1. Buscar por emusys_lead_id + unidade
  if (p.emusysLeadId) {
    const { data } = await supabase.from('leads').select('id')
      .eq('emusys_lead_id', p.emusysLeadId).eq('unidade_id', p.unidadeId).limit(1);
    leadId = data?.[0]?.id || null;
  }

  // 2. Buscar por telefone + unidade
  if (!leadId && p.telefoneAluno) {
    const { data } = await supabase.from('leads').select('id')
      .eq('telefone', p.telefoneAluno).eq('unidade_id', p.unidadeId).eq('arquivado', false).limit(1);
    leadId = data?.[0]?.id || null;
  }

  // 3. Buscar por nome + unidade
  if (!leadId && p.nomeAluno) {
    const { data } = await supabase.from('leads').select('id')
      .ilike('nome', p.nomeAluno.trim()).eq('unidade_id', p.unidadeId).eq('arquivado', false)
      .order('created_at', { ascending: false }).limit(1);
    leadId = data?.[0]?.id || null;
  }

  if (!leadId) return { leadId: null, action: 'lead_nao_encontrado' };

  const hoje = new Date().toISOString().split('T')[0];
  const updates: any = {
    status: 'convertido',
    etapa_pipeline_id: 10,
    converteu: true,
    data_conversao: hoje,
    updated_at: new Date().toISOString(),
  };
  if (p.emusysLeadId) updates.emusys_lead_id = p.emusysLeadId;

  await supabase.from('leads').update(updates).eq('id', leadId);

  return { leadId, action: 'lead_convertido' };
}

// ==================== MOVIMENTAÇÃO (com dedup) ====================

async function registrarMovimentacao(
  supabase: any, tipo: string, p: Payload,
  alunoId: number | null, professorId: number | null, cursoId: number | null, motivo: string,
): Promise<boolean> {
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  // Dedup: já existe no mesmo mês?
  const { data: existing } = await supabase.from('movimentacoes_admin')
    .select('id')
    .eq('aluno_nome', p.nomeAluno)
    .eq('unidade_id', p.unidadeId)
    .eq('tipo', tipo)
    .gte('data', inicioMes)
    .limit(1);

  if (existing?.length) return false;

  await supabase.from('movimentacoes_admin').insert({
    unidade_id: p.unidadeId,
    data: new Date().toISOString().split('T')[0],
    tipo,
    aluno_nome: p.nomeAluno,
    aluno_id: alunoId,
    professor_id: professorId,
    curso_id: cursoId,
    motivo,
    created_at: new Date().toISOString(),
  });
  return true;
}

// ==================== HANDLERS ====================

async function handleMatriculaNova(supabase: any, p: Payload) {
  const cursoId = await resolverCursoId(supabase, p.nomeCurso, p.emusysCursoId);
  const professorId = await resolverProfessorId(supabase, p.professorEmusysId, p.unidadeId);
  const alunoExistente = await buscarAluno(supabase, p.nomeAluno, p.unidadeId);

  let alunoId: number | null;
  let action: string;

  if (alunoExistente) {
    await supabase.from('alunos').update({
      status: 'ativo',
      telefone: p.telefoneAluno || undefined,
      email: p.emailAluno || undefined,
      data_matricula: p.dataMatricula || undefined,
      valor_parcela: p.valorMensalidade || undefined,
      data_nascimento: p.dataNascimento || undefined,
      idade_atual: p.idade || undefined,
      classificacao: p.classificacao || undefined,
      data_inicio_contrato: p.dataInicioContrato || undefined,
      data_fim_contrato: p.dataFimContrato || undefined,
      dia_aula: p.diaAula || undefined,
      horario_aula: p.horarioAula || undefined,
      curso_id: cursoId || undefined,
      professor_atual_id: professorId || undefined,
      foto_url: p.fotoAlunoUrl || undefined,
      instagram: p.instagram || undefined,
      updated_at: new Date().toISOString(),
    }).eq('id', alunoExistente.id);

    alunoId = alunoExistente.id;
    action = 'atualizado';
  } else {
    const { data: newAluno } = await supabase.from('alunos').insert({
      nome: p.nomeAluno,
      unidade_id: p.unidadeId,
      status: 'ativo',
      telefone: p.telefoneAluno,
      email: p.emailAluno,
      data_matricula: p.dataMatricula,
      valor_parcela: p.valorMensalidade,
      data_nascimento: p.dataNascimento,
      idade_atual: p.idade,
      classificacao: p.classificacao,
      data_inicio_contrato: p.dataInicioContrato,
      data_fim_contrato: p.dataFimContrato,
      dia_aula: p.diaAula,
      horario_aula: p.horarioAula,
      curso_id: cursoId,
      professor_atual_id: professorId,
      professor_experimental_id: professorId,
      foto_url: p.fotoAlunoUrl,
      instagram: p.instagram,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single();

    alunoId = newAluno?.id || null;
    action = 'inserido';
  }

  // Converter lead
  const leadResult = await converterLead(supabase, p);

  return {
    action,
    aluno_id: alunoId,
    lead_action: leadResult.action,
    lead_id: leadResult.leadId,
    professor_id: professorId,
    curso_id: cursoId,
    sem_professor: !professorId,
  };
}

async function handleRenovacao(supabase: any, p: Payload) {
  const aluno = await buscarAluno(supabase, p.nomeAluno, p.unidadeId);

  if (!aluno) {
    return {
      action: 'erro_aluno_nao_encontrado',
      motivo: `Aluno "${p.nomeAluno}" não encontrado na unidade ${p.unidadeNome}`,
    };
  }

  const professorId = await resolverProfessorId(supabase, p.professorEmusysId, p.unidadeId);
  const cursoId = await resolverCursoId(supabase, p.nomeCurso, p.emusysCursoId);
  const hoje = new Date().toISOString().split('T')[0];

  // Atualizar aluno: status, renovações, professor, curso, contrato
  const alunoUpdate: any = {
    status: 'ativo',
    data_ultima_renovacao: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (professorId) alunoUpdate.professor_atual_id = professorId;
  if (cursoId) alunoUpdate.curso_id = cursoId;
  if (p.diaAula) alunoUpdate.dia_aula = p.diaAula;
  if (p.horarioAula) alunoUpdate.horario_aula = p.horarioAula;
  if (p.dataInicioContrato) alunoUpdate.data_inicio_contrato = p.dataInicioContrato;
  if (p.dataFimContrato) alunoUpdate.data_fim_contrato = p.dataFimContrato;
  if (p.fotoAlunoUrl) alunoUpdate.foto_url = p.fotoAlunoUrl;
  if (p.instagram) alunoUpdate.instagram = p.instagram;

  await supabase.from('alunos').update(alunoUpdate).eq('id', aluno.id);

  // Incrementar numero_renovacoes via RPC
  await supabase.rpc('execute_bi_query_lamusic', {
    query_text: `UPDATE alunos SET numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1 WHERE id = ${aluno.id}`,
    p_unidade_id: null, max_rows: 1,
  });

  // Dedup: verificar se já existe renovação deste aluno no mesmo mês
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const { data: existente } = await supabase.from('renovacoes')
    .select('id')
    .eq('aluno_id', aluno.id)
    .gte('data_renovacao', inicioMes)
    .limit(1);

  let renovacaoInserida = false;
  if (!existente?.length) {
    await supabase.from('renovacoes').insert({
      aluno_id: aluno.id,
      unidade_id: p.unidadeId,
      data_renovacao: hoje,
      valor_parcela_anterior: aluno.valor_parcela || null,
      status: 'renovado',
      professor_id: professorId || aluno.professor_atual_id || null,
      observacoes: `Automático via Emusys — ${p.nomeCurso || 'curso não informado'}`,
    });
    renovacaoInserida = true;
  }

  return {
    action: 'renovado',
    aluno_id: aluno.id,
    professor_id: professorId,
    curso_id: cursoId,
    renovacao_inserida: renovacaoInserida,
    dedup: !renovacaoInserida,
  };
}

async function handleTrancamento(supabase: any, p: Payload) {
  const aluno = await buscarAluno(supabase, p.nomeAluno, p.unidadeId);

  if (!aluno) {
    return {
      action: 'erro_aluno_nao_encontrado',
      motivo: `Aluno "${p.nomeAluno}" não encontrado na unidade ${p.unidadeNome}`,
    };
  }

  const trancUpdate: any = {
    status: 'trancado',
    updated_at: new Date().toISOString(),
  };
  if (p.fotoAlunoUrl) trancUpdate.foto_url = p.fotoAlunoUrl;
  if (p.instagram) trancUpdate.instagram = p.instagram;

  await supabase.from('alunos').update(trancUpdate).eq('id', aluno.id);

  const motivo = p.trancamentoMotivo || 'Via Emusys (automação)';
  const movRegistrada = await registrarMovimentacao(supabase, 'trancamento', p, aluno.id, aluno.professor_atual_id, aluno.curso_id, motivo);

  return {
    action: 'status_trancado',
    aluno_id: aluno.id,
    motivo,
    data_inicial: p.trancamentoDataInicial,
    data_final: p.trancamentoDataFinal,
    movimentacao_registrada: movRegistrada,
  };
}

async function handleEvasao(supabase: any, p: Payload) {
  const aluno = await buscarAluno(supabase, p.nomeAluno, p.unidadeId);

  if (!aluno) {
    return {
      action: 'erro_aluno_nao_encontrado',
      motivo: `Aluno "${p.nomeAluno}" não encontrado na unidade ${p.unidadeNome}`,
    };
  }

  const evasaoUpdate: any = {
    status: 'evadido',
    data_saida: new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  };
  if (p.fotoAlunoUrl) evasaoUpdate.foto_url = p.fotoAlunoUrl;
  if (p.instagram) evasaoUpdate.instagram = p.instagram;

  await supabase.from('alunos').update(evasaoUpdate).eq('id', aluno.id);

  const motivo = p.finalizacaoMotivo || 'Via Emusys (automação)';
  const movRegistrada = await registrarMovimentacao(supabase, 'evasao', p, aluno.id, aluno.professor_atual_id, aluno.curso_id, motivo);

  return {
    action: 'status_evadido',
    aluno_id: aluno.id,
    motivo,
    observacoes: p.finalizacaoObservacoes,
    movimentacao_registrada: movRegistrada,
  };
}

// ==================== SERVE ====================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const p = parsePayload(body);

    if (!p) {
      return new Response(JSON.stringify({ error: 'Payload inválido ou escola não mapeada', escola_id: body?.escola_id }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[processar-matricula] Evento: ${p.evento} | Aluno: ${p.nomeAluno} | Unidade: ${p.unidadeNome}`);

    let result: any;

    switch (p.evento) {
      case 'matricula_nova':
        result = await handleMatriculaNova(supabase, p);
        break;
      case 'matricula_renovacao':
        result = await handleRenovacao(supabase, p);
        break;
      case 'matricula_trancamento':
        result = await handleTrancamento(supabase, p);
        break;
      case 'matricula_finalizacao':
        result = await handleEvasao(supabase, p);
        break;
      default:
        result = { action: 'evento_ignorado', motivo: `Evento não tratado: ${p.evento}` };
    }

    // Log na automacao_log com payload completo para debug
    await supabase.from('automacao_log').insert({
      aluno_nome: p.nomeAluno,
      unidade_nome: p.unidadeNome,
      evento: p.evento,
      acao: result.action || 'processado',
      detalhes: {
        ...result,
        curso: p.nomeCurso,
        professor: p.professorNome,
        telefone: p.telefoneAluno,
        emusys_lead_id: p.emusysLeadId,
        payload_completo: p.rawPayload,
      },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, evento: p.evento, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[processar-matricula] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
