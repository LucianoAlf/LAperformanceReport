// Edge Function: processar-matricula-emusys v19
// Processa webhooks de matrícula do Emusys: nova, renovação, trancamento, evasão
//
// MUDANÇAS v18 (2026-05-21):
// - Corrige falsos positivos nas invariantes checarMatricula/Renovacao/Trancamento/Finalizacao
//   que esperavam estrutura antiga do payload (aluno.nome, id_matricula, matricula.motivo,
//   valor_passaporte). Agora prioriza estrutura real do Emusys (matricula.nome_aluno,
//   matricula.matricula_id, trancamento.motivo, finalizacao.motivo, valor_taxa_matricula)
//   mantendo caminhos antigos como fallback. Sem mudança de comportamento da edge function.
//
// MUDANÇAS v17 (2026-05-20):
// - Cada handler agora chama o helper de invariantes (gravarLog + checar*) ao final
// - Gera idempotency_key via SHA-256 no início de cada handler
// - try/catch externo em cada handler: exceção grava log com invariante 'processamento_falhou_excecao'
// - Removida a chamada central de automacao_log.insert no serve() — agora cada handler grava o próprio log
// - Bloco gravarLog grava também em automacao_invariantes (1 linha por regra detectada)
// - status derivado: 'erro' se alguma invariante crítica, 'warn' se só aviso, 'ok' caso contrário
// - Lógica de resolução de aluno/professor/curso permanece intacta
//
// MUDANÇAS v16 (2026-05-20):
// - resolverProfessorId ganha CAMADA 2 (fallback por nome+unidade)
// - Quando emusys_id não bate, tenta match por nome normalizado dentro da unidade
// - Auto-cura: ao achar por nome, grava o emusys_id pra próxima requisição
// - Resolve problema dos professores cadastrados sem emusys_id (3 alunos órfãos em Maio/2026)
//
// MUDANÇAS v12 (2026-05-07):
// - handleEvasao grava passagem em alunos_historico quando o aluno saiu de TODAS as matrículas
//   (data_entrada=MIN(data_matricula), data_saida=hoje, aluno_ids=array de matrículas válidas)
// - UNIQUE constraint (aluno_id, data_saida) garante idempotência em webhook reenviado
// - Bolsistas (BOLSISTA_INT/PARC) e BANDA são excluídos de aluno_ids/contagem, mas não impedem gravação
//   se a pessoa também tinha matrícula EMLA/LAMK
//
// MUDANÇAS v11 (2026-05-06):
// - buscarAluno() em 3 camadas: emusys_matricula_id → nome+unidade+curso → nome+unidade priorizado
// - Backfill automático de emusys_matricula_id em qualquer match (auto-corretivo)
// - Normalização de nomes (acentos, espaços, caixa)
// - handleMatriculaNova detecta corretamente segundo curso vs re-execução
// - Logs incluem fonte do match (matricula_id|nome_curso|nome_unico|nome_priorizado|segundo_curso_detectado|aluno_novo)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  checarMatricula,
  checarRenovacao,
  checarTrancamento,
  checarFinalizacao,
  comFallback,
  computarHash,
  gravarLog,
  type ResultadoMatricula,
} from '../_shared/invariantes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const VERSAO = 'v19';

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

function normalizar(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

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
  matriculaIdEmusys: string | null;
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
  valorPassaporte: number | null;
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
  rawPayload: any;
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
    matriculaIdEmusys: m.matricula_id != null ? String(m.matricula_id) : null,
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
    valorPassaporte: m.valor_taxa_matricula || null,
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
  // 1. Match por emusys_curso_id (exato)
  if (emusysCursoId) {
    const { data } = await supabase
      .from('cursos')
      .select('id')
      .contains('emusys_ids', [emusysCursoId])
      .limit(1);
    if (data?.[0]?.id) return data[0].id;
  }

  // 2. Fallback: match por nome normalizado
  if (!nomeCurso) return null;
  const nomeNorm = normalizar(nomeCurso);

  const { data: todos } = await supabase
    .from('cursos')
    .select('id, nome, emusys_ids');

  const curso = (todos || []).find((c: any) => normalizar(c.nome) === nomeNorm)
    || (todos || []).find((c: any) => normalizar(c.nome).startsWith(nomeNorm));

  if (!curso) return null;

  // 3. Auto-preencher emusys_ids se encontrou por nome
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

async function resolverProfessorId(
  supabase: any,
  emusysId: number | null,
  unidadeId: string,
  payloadNome: string | null = null,
): Promise<number | null> {
  // CAMADA 1: match exato por emusys_id + unidade (caminho feliz)
  if (emusysId) {
    const { data } = await supabase
      .from('professores_unidades')
      .select('professor_id')
      .eq('emusys_id', emusysId)
      .eq('unidade_id', unidadeId)
      .limit(1);
    if (data?.[0]?.professor_id) return data[0].professor_id;
  }

  // CAMADA 2: fallback por nome normalizado + unidade (auto-cura)
  // Protege contra professores cadastrados sem emusys_id ou novos sem mapeamento.
  // Ao achar, grava o emusys_id no vínculo pra próximas chamadas baterem na camada 1.
  if (payloadNome) {
    const nomeNorm = normalizar(payloadNome);
    if (nomeNorm) {
      const { data: candidatos } = await supabase
        .from('professores_unidades')
        .select('professor_id, professores(nome)')
        .eq('unidade_id', unidadeId);
      const match = (candidatos || []).find((pu: any) =>
        normalizar(pu.professores?.nome) === nomeNorm
      );
      if (match?.professor_id) {
        if (emusysId) {
          await supabase
            .from('professores_unidades')
            .update({ emusys_id: emusysId })
            .eq('professor_id', match.professor_id)
            .eq('unidade_id', unidadeId);
        }
        return match.professor_id;
      }
    }
  }

  return null;
}

const ALUNO_SELECT = 'id, professor_atual_id, curso_id, valor_parcela, numero_renovacoes, status, is_segundo_curso, emusys_matricula_id, nome';

async function buscarAluno(
  supabase: any,
  payload: Payload,
  cursoIdResolvido: number | null
): Promise<{ aluno: any; fonte: string } | null> {
  const matriculaId = payload.matriculaIdEmusys;
  const nomeNorm = normalizar(payload.nomeAluno);

  // CAMADA 1: match exato por emusys_matricula_id + unidade_id
  // IMPORTANTE: IDs de matrícula são sequenciais por escola no Emusys — escolas diferentes
  // podem ter o mesmo matricula_id. Sem filtro de unidade, o sistema sobrescrevia dados de
  // alunos de outra unidade que tivessem o mesmo ID (ex: Recreio 791 sobrescreveu Barra 791).
  if (matriculaId) {
    const { data } = await supabase.from('alunos')
      .select(ALUNO_SELECT)
      .eq('emusys_matricula_id', matriculaId)
      .eq('unidade_id', payload.unidadeId)
      .maybeSingle();
    if (data) return { aluno: data, fonte: 'matricula_id' };
  }

  // CAMADA 2: nome + unidade + curso (regra: 1 aluno × 1 curso = 1 matrícula)
  if (cursoIdResolvido) {
    const { data } = await supabase.from('alunos')
      .select(ALUNO_SELECT)
      .eq('unidade_id', payload.unidadeId)
      .eq('curso_id', cursoIdResolvido);
    const match = (data || []).find((a: any) => normalizar(a.nome) === nomeNorm);
    if (match) return { aluno: match, fonte: 'nome_curso' };
  }

  // CAMADA 3: nome + unidade (último recurso, com priorização)
  const { data: candidatos } = await supabase.from('alunos')
    .select(ALUNO_SELECT)
    .eq('unidade_id', payload.unidadeId);

  const filtrados = (candidatos || [])
    .filter((a: any) => normalizar(a.nome) === nomeNorm);

  if (filtrados.length === 0) return null;
  if (filtrados.length === 1) return { aluno: filtrados[0], fonte: 'nome_unico' };

  // Múltiplos: priorizar matrícula principal e status ativo
  const statusRank: Record<string, number> = { ativo: 0, trancado: 1, evadido: 2, inativo: 3 };
  filtrados.sort((a: any, b: any) => {
    if (a.is_segundo_curso !== b.is_segundo_curso) return a.is_segundo_curso ? 1 : -1;
    return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
  });
  return { aluno: filtrados[0], fonte: 'nome_priorizado' };
}

async function backfillMatriculaId(supabase: any, alunoId: number, matriculaId: string | null, atual: string | null) {
  if (!matriculaId) return;
  if (atual === matriculaId) return;
  await supabase.from('alunos')
    .update({ emusys_matricula_id: matriculaId })
    .eq('id', alunoId);
}

// ==================== CONVERTER LEAD ====================

async function converterLead(supabase: any, p: Payload, alunoId: number | null): Promise<{ leadId: number | null; action: string }> {
  let leadId: number | null = null;

  if (p.emusysLeadId) {
    const { data } = await supabase.from('leads').select('id')
      .eq('emusys_lead_id', p.emusysLeadId).eq('unidade_id', p.unidadeId).limit(1);
    leadId = data?.[0]?.id || null;
  }

  const telefoneBusca = p.telefoneAluno || p.telefoneResponsavel;
  if (!leadId && telefoneBusca) {
    const { data } = await supabase.from('leads').select('id')
      .eq('telefone', telefoneBusca).eq('unidade_id', p.unidadeId).eq('arquivado', false).limit(1);
    leadId = data?.[0]?.id || null;
  }

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
  if (alunoId) updates.aluno_id = alunoId;

  await supabase.from('leads').update(updates).eq('id', leadId);

  return { leadId, action: 'lead_convertido' };
}

// ==================== MOVIMENTAÇÃO (com dedup) ====================

async function registrarMovimentacao(
  supabase: any, tipo: string, p: Payload,
  alunoId: number | null, professorId: number | null, cursoId: number | null, motivo: string,
  valores: {
    valorParcelaAnterior?: number | null;
    valorParcelaNovo?: number | null;
    valorParcelaEvasao?: number | null;
  } = {},
): Promise<boolean> {
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const { data: existing } = await supabase.from('movimentacoes_admin')
    .select('id')
    .eq('aluno_nome', p.nomeAluno)
    .eq('unidade_id', p.unidadeId)
    .eq('tipo', tipo)
    .gte('data', inicioMes)
    .limit(1);

  if (existing?.length) return false;

  let motivoSaidaId: number | null = null;
  if (motivo && !motivo.startsWith('Via Emusys') && !motivo.startsWith('Renovação automática')) {
    const { data: motivoMatch } = await supabase
      .from('motivos_saida')
      .select('id')
      .ilike('nome', motivo)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();
    motivoSaidaId = motivoMatch?.id || null;
  }

  const payload: any = {
    unidade_id: p.unidadeId,
    data: new Date().toISOString().split('T')[0],
    tipo,
    aluno_nome: p.nomeAluno,
    aluno_id: alunoId,
    professor_id: professorId,
    curso_id: cursoId,
    motivo,
    motivo_saida_id: motivoSaidaId,
    created_at: new Date().toISOString(),
  };

  if (tipo === 'renovacao') {
    payload.valor_parcela_anterior = valores.valorParcelaAnterior ?? null;
    payload.valor_parcela_novo = valores.valorParcelaNovo ?? null;
  }

  if (tipo === 'evasao' || tipo === 'nao_renovacao') {
    payload.valor_parcela_evasao = valores.valorParcelaEvasao ?? valores.valorParcelaAnterior ?? null;
    payload.valor_parcela_anterior = valores.valorParcelaAnterior ?? null;
  }

  await supabase.from('movimentacoes_admin').insert(payload);
  return true;
}

// ==================== HANDLERS ====================

async function handleMatriculaNova(supabase: any, p: Payload) {
  const idempotency_key = await computarHash(
    `matricula_nova:${p.matriculaIdEmusys ?? ''}:${p.unidadeId}:${p.dataMatricula ?? ''}`
  );

  try {
    const cursoId = await resolverCursoId(supabase, p.nomeCurso, p.emusysCursoId);
    const professorId = await resolverProfessorId(supabase, p.professorEmusysId, p.unidadeId, p.professorNome);

    // Tenta encontrar aluno EXATO (por matricula_id ou nome+curso)
    const found = await buscarAluno(supabase, p, cursoId);

    let alunoId: number | null;
    let action: string;
    let fonte = found?.fonte;

    if (found?.aluno) {
      if (found.fonte === 'nome_unico' || found.fonte === 'nome_priorizado') {
        // Aluno existe em outro curso → criar registro de segundo curso
        const { data: novoSegundo } = await supabase.from('alunos').insert({
          nome: p.nomeAluno,
          unidade_id: p.unidadeId,
          status: 'ativo',
          is_segundo_curso: true,
          telefone: p.telefoneAluno || p.telefoneResponsavel,
          email: p.emailAluno,
          data_matricula: p.dataMatricula,
          valor_parcela: p.valorMensalidade,
          valor_passaporte: p.valorPassaporte,
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
          emusys_matricula_id: p.matriculaIdEmusys,
          foto_url: p.fotoAlunoUrl,
          instagram: p.instagram,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).select('id').single();

        alunoId = novoSegundo?.id || null;
        action = 'inserido_segundo_curso';
        fonte = 'segundo_curso_detectado';
      } else {
        // matricula_id ou nome_curso → mesma matrícula, apenas atualiza
        await supabase.from('alunos').update({
          status: 'ativo',
          telefone: (p.telefoneAluno || p.telefoneResponsavel) || undefined,
          email: p.emailAluno || undefined,
          data_matricula: p.dataMatricula || undefined,
          valor_parcela: p.valorMensalidade || undefined,
          valor_passaporte: p.valorPassaporte || undefined,
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
          emusys_matricula_id: p.matriculaIdEmusys || undefined,
          updated_at: new Date().toISOString(),
        }).eq('id', found.aluno.id);

        alunoId = found.aluno.id;
        action = 'atualizado';
      }
    } else {
      const { data: newAluno } = await supabase.from('alunos').insert({
        nome: p.nomeAluno,
        unidade_id: p.unidadeId,
        status: 'ativo',
        is_segundo_curso: false,
        telefone: p.telefoneAluno || p.telefoneResponsavel,
        email: p.emailAluno,
        data_matricula: p.dataMatricula,
        valor_parcela: p.valorMensalidade,
        valor_passaporte: p.valorPassaporte,
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
        emusys_matricula_id: p.matriculaIdEmusys,
        foto_url: p.fotoAlunoUrl,
        instagram: p.instagram,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('id').single();

      alunoId = newAluno?.id || null;
      action = 'inserido';
      fonte = 'aluno_novo';
    }

    const leadResult = await converterLead(supabase, p, alunoId);

    const result = {
      action,
      aluno_id: alunoId,
      matched_via: fonte,
      lead_action: leadResult.action,
      lead_id: leadResult.leadId,
      professor_id: professorId,
      curso_id: cursoId,
      sem_professor: !professorId,
    };

    // ===== invariantes + gravarLog =====
    const resultado: ResultadoMatricula = {
      aluno_id: alunoId ?? null,
      curso_id: cursoId ?? null,
      professor_id: professorId ?? null,
      lead_id: leadResult.leadId ?? null,
      unidade_id: p.unidadeId ?? null,
      payload: p.rawPayload,
    };

    const invariantes = comFallback(() => checarMatricula(p.rawPayload, resultado));

    await gravarLog(supabase, {
      evento: 'matricula_nova',
      acao: action,
      aluno_id: alunoId ?? undefined,
      aluno_nome: p.nomeAluno || '(desconhecido)',
      lead_id: leadResult.leadId ?? undefined,
      unidade_nome: p.unidadeNome ?? undefined,
      payload_bruto: p.rawPayload,
      idempotency_key,
      invariantes,
      detalhes: {
        ...result,
        curso: p.nomeCurso,
        professor: p.professorNome,
        telefone: p.telefoneAluno,
        emusys_lead_id: p.emusysLeadId,
        emusys_matricula_id: p.matriculaIdEmusys,
        version: VERSAO,
      },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });

    return result;
  } catch (e: any) {
    await gravarLog(supabase, {
      evento: 'matricula_nova',
      acao: 'erro',
      aluno_nome: p.nomeAluno || '(desconhecido)',
      unidade_nome: p.unidadeNome ?? undefined,
      payload_bruto: p.rawPayload,
      idempotency_key,
      invariantes: [{
        regra: 'processamento_falhou_excecao',
        severidade: 'critico',
        mensagem: `Exceção em handleMatriculaNova: ${e?.message ?? e}`,
      }],
      detalhes: { version: VERSAO, erro: e?.message ?? String(e) },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });
    throw e;
  }
}

async function handleRenovacao(supabase: any, p: Payload) {
  const idempotency_key = await computarHash(
    `matricula_renovacao:${p.matriculaIdEmusys ?? ''}:${p.unidadeId}:${p.dataMatricula ?? ''}`
  );

  try {
    const cursoId = await resolverCursoId(supabase, p.nomeCurso, p.emusysCursoId);
    const found = await buscarAluno(supabase, p, cursoId);

    if (!found?.aluno) {
      const result = {
        action: 'erro_aluno_nao_encontrado',
        motivo: `Aluno "${p.nomeAluno}" não encontrado na unidade ${p.unidadeNome}`,
      };

      const resultado: ResultadoMatricula = {
        aluno_id: null,
        curso_id: cursoId ?? null,
        professor_id: null,
        lead_id: null,
        unidade_id: p.unidadeId ?? null,
        payload: p.rawPayload,
      };
      const invariantes = comFallback(() => checarRenovacao(p.rawPayload, resultado));

      await gravarLog(supabase, {
        evento: 'matricula_renovacao',
        acao: result.action,
        aluno_nome: p.nomeAluno || '(desconhecido)',
        unidade_nome: p.unidadeNome ?? undefined,
        payload_bruto: p.rawPayload,
        idempotency_key,
        invariantes,
        detalhes: { ...result, version: VERSAO, curso: p.nomeCurso, emusys_matricula_id: p.matriculaIdEmusys },
        workflow_id: 'processar-matricula-emusys',
        execution_id: new Date().toISOString(),
      });

      return result;
    }

    const aluno = found.aluno;
    const professorId = await resolverProfessorId(supabase, p.professorEmusysId, p.unidadeId, p.professorNome);
    const hoje = new Date().toISOString().split('T')[0];

    await backfillMatriculaId(supabase, aluno.id, p.matriculaIdEmusys, aluno.emusys_matricula_id);

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

    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { data: existente } = await supabase.from('renovacoes')
      .select('id')
      .eq('aluno_id', aluno.id)
      .gte('data_renovacao', inicioMes)
      .limit(1);

    let renovacaoLegadaPendente = false;
    if (!existente?.length) {
      await supabase.from('renovacoes').insert({
        aluno_id: aluno.id,
        unidade_id: p.unidadeId,
        data_renovacao: hoje,
        valor_parcela_anterior: aluno.valor_parcela || null,
        valor_parcela_novo: p.valorMensalidade || null,
        status: 'pendente',
        professor_id: professorId || aluno.professor_atual_id || null,
        observacoes: `Pendente de validação DM via Emusys — ${p.nomeCurso || 'curso não informado'}`,
      });
      renovacaoLegadaPendente = true;
    }

    const movRegistrada = await registrarMovimentacao(
      supabase, 'renovacao', p, aluno.id,
      professorId || aluno.professor_atual_id || null,
      cursoId || aluno.curso_id || null,
      `Renovação automática via Emusys — ${p.nomeCurso || 'curso não informado'}`,
      {
        valorParcelaAnterior: aluno.valor_parcela || null,
        valorParcelaNovo: p.valorMensalidade || null,
      }
    );

    const result = {
      action: 'renovacao_pendente_validacao_dm',
      aluno_id: aluno.id,
      matched_via: found.fonte,
      professor_id: professorId,
      curso_id: cursoId,
      renovacao_legada_pendente: renovacaoLegadaPendente,
      movimentacao_registrada: movRegistrada,
      dedup: !renovacaoLegadaPendente,
    };

    const resultado: ResultadoMatricula = {
      aluno_id: aluno.id ?? null,
      curso_id: cursoId ?? null,
      professor_id: professorId ?? null,
      lead_id: null,
      unidade_id: p.unidadeId ?? null,
      payload: p.rawPayload,
    };
    const invariantes = comFallback(() => checarRenovacao(p.rawPayload, resultado));

    await gravarLog(supabase, {
      evento: 'matricula_renovacao',
      acao: result.action,
      aluno_id: aluno.id ?? undefined,
      aluno_nome: p.nomeAluno || '(desconhecido)',
      unidade_nome: p.unidadeNome ?? undefined,
      payload_bruto: p.rawPayload,
      idempotency_key,
      invariantes,
      detalhes: {
        ...result,
        curso: p.nomeCurso,
        professor: p.professorNome,
        emusys_matricula_id: p.matriculaIdEmusys,
        version: VERSAO,
      },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });

    return result;
  } catch (e: any) {
    await gravarLog(supabase, {
      evento: 'matricula_renovacao',
      acao: 'erro',
      aluno_nome: p.nomeAluno || '(desconhecido)',
      unidade_nome: p.unidadeNome ?? undefined,
      payload_bruto: p.rawPayload,
      idempotency_key,
      invariantes: [{
        regra: 'processamento_falhou_excecao',
        severidade: 'critico',
        mensagem: `Exceção em handleRenovacao: ${e?.message ?? e}`,
      }],
      detalhes: { version: VERSAO, erro: e?.message ?? String(e) },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });
    throw e;
  }
}

async function handleTrancamento(supabase: any, p: Payload) {
  const idempotency_key = await computarHash(
    `matricula_trancamento:${p.matriculaIdEmusys ?? ''}:${p.unidadeId}:${p.trancamentoDataInicial ?? ''}`
  );

  try {
    const cursoId = await resolverCursoId(supabase, p.nomeCurso, p.emusysCursoId);
    const found = await buscarAluno(supabase, p, cursoId);

    if (!found?.aluno) {
      const result = {
        action: 'erro_aluno_nao_encontrado',
        motivo: `Aluno "${p.nomeAluno}" não encontrado na unidade ${p.unidadeNome}`,
      };

      const resultado: ResultadoMatricula = {
        aluno_id: null,
        curso_id: cursoId ?? null,
        professor_id: null,
        lead_id: null,
        unidade_id: p.unidadeId ?? null,
        payload: p.rawPayload,
      };
      const invariantes = comFallback(() => checarTrancamento(p.rawPayload, resultado));

      await gravarLog(supabase, {
        evento: 'matricula_trancamento',
        acao: result.action,
        aluno_nome: p.nomeAluno || '(desconhecido)',
        unidade_nome: p.unidadeNome ?? undefined,
        payload_bruto: p.rawPayload,
        idempotency_key,
        invariantes,
        detalhes: { ...result, version: VERSAO, curso: p.nomeCurso, emusys_matricula_id: p.matriculaIdEmusys },
        workflow_id: 'processar-matricula-emusys',
        execution_id: new Date().toISOString(),
      });

      return result;
    }

    const aluno = found.aluno;
    await backfillMatriculaId(supabase, aluno.id, p.matriculaIdEmusys, aluno.emusys_matricula_id);

    const trancUpdate: any = {
      status: 'trancado',
      updated_at: new Date().toISOString(),
    };
    if (p.fotoAlunoUrl) trancUpdate.foto_url = p.fotoAlunoUrl;
    if (p.instagram) trancUpdate.instagram = p.instagram;

    await supabase.from('alunos').update(trancUpdate).eq('id', aluno.id);

    const motivo = p.trancamentoMotivo || 'Via Emusys (automação)';
    const movRegistrada = await registrarMovimentacao(supabase, 'trancamento', p, aluno.id, aluno.professor_atual_id, aluno.curso_id, motivo);

    const result = {
      action: 'status_trancado',
      aluno_id: aluno.id,
      matched_via: found.fonte,
      motivo,
      data_inicial: p.trancamentoDataInicial,
      data_final: p.trancamentoDataFinal,
      movimentacao_registrada: movRegistrada,
    };

    const resultado: ResultadoMatricula = {
      aluno_id: aluno.id ?? null,
      curso_id: aluno.curso_id ?? cursoId ?? null,
      professor_id: aluno.professor_atual_id ?? null,
      lead_id: null,
      unidade_id: p.unidadeId ?? null,
      payload: p.rawPayload,
    };
    const invariantes = comFallback(() => checarTrancamento(p.rawPayload, resultado));

    await gravarLog(supabase, {
      evento: 'matricula_trancamento',
      acao: result.action,
      aluno_id: aluno.id ?? undefined,
      aluno_nome: p.nomeAluno || '(desconhecido)',
      unidade_nome: p.unidadeNome ?? undefined,
      payload_bruto: p.rawPayload,
      idempotency_key,
      invariantes,
      detalhes: {
        ...result,
        curso: p.nomeCurso,
        emusys_matricula_id: p.matriculaIdEmusys,
        version: VERSAO,
      },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });

    return result;
  } catch (e: any) {
    await gravarLog(supabase, {
      evento: 'matricula_trancamento',
      acao: 'erro',
      aluno_nome: p.nomeAluno || '(desconhecido)',
      unidade_nome: p.unidadeNome ?? undefined,
      payload_bruto: p.rawPayload,
      idempotency_key,
      invariantes: [{
        regra: 'processamento_falhou_excecao',
        severidade: 'critico',
        mensagem: `Exceção em handleTrancamento: ${e?.message ?? e}`,
      }],
      detalhes: { version: VERSAO, erro: e?.message ?? String(e) },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });
    throw e;
  }
}

// v12: ao finalizar uma matrícula, verifica se o aluno saiu de TODAS as matrículas dele
// (mesmo nome+unidade) e, se sim, grava 1 linha em alunos_historico representando a passagem
// completa: data_entrada=MIN(data_matricula), data_saida=hoje, aluno_ids=array.
// Idempotência garantida pela UNIQUE constraint (aluno_id, data_saida) WHERE anulado=false.
async function registrarPassagemFinalizada(
  supabase: any,
  alunoCorrente: { id: number; nome: string },
  p: Payload,
): Promise<any> {
  const nomeNorm = normalizar(alunoCorrente.nome);
  const hoje = new Date().toISOString().split('T')[0];

  // 1. Todas as matrículas dessa pessoa (nome+unidade)
  const { data: candidatos } = await supabase.from('alunos')
    .select('id, nome, status, data_matricula, data_saida, tipo_matricula_id, is_segundo_curso')
    .eq('unidade_id', p.unidadeId);

  const matriculasPessoa = (candidatos || []).filter((a: any) => normalizar(a.nome) === nomeNorm);

  // 2. Se alguma matrícula (exceto a corrente) ainda está ativa/trancada, não grava passagem
  const aindaAtivas = matriculasPessoa.filter((a: any) =>
    a.id !== alunoCorrente.id && (a.status === 'ativo' || a.status === 'trancado')
  );
  if (aindaAtivas.length > 0) {
    return { gravou_historico: false, motivo: 'pessoa_tem_outra_matricula_viva', count_ativas: aindaAtivas.length };
  }

  // 3. Excluir bolsistas/banda da contagem
  const { data: tiposExcluir } = await supabase.from('tipos_matricula')
    .select('id, codigo')
    .in('codigo', ['BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA']);
  const idsExcluir = new Set((tiposExcluir || []).map((t: any) => t.id));

  const validas = matriculasPessoa.filter((a: any) =>
    !idsExcluir.has(a.tipo_matricula_id) && a.data_matricula
  );

  if (validas.length === 0) {
    return { gravou_historico: false, motivo: 'todas_matriculas_excluidas_bolsista_ou_banda' };
  }

  // 4. Calcular data_entrada e tempo
  const datasMatricula = validas.map((a: any) => a.data_matricula).filter(Boolean).sort();
  const dataEntrada = datasMatricula[0];

  const diffDays = Math.floor(
    (new Date(hoje + 'T12:00:00').getTime() - new Date(dataEntrada + 'T12:00:00').getTime())
    / (1000 * 60 * 60 * 24)
  );
  const tempoMeses = Math.round((diffDays / 30.44) * 100) / 100;

  if (tempoMeses < 4) {
    return { gravou_historico: false, motivo: 'tempo_menor_que_4_meses', tempo: tempoMeses };
  }

  // 5. Categoria: Evadido se algum tem status evadido, senão Interrompido
  const algumEvadido = matriculasPessoa.some((a: any) => a.status === 'evadido');
  const categoria = algumEvadido ? 'Evadido' : 'Interrompido';

  // 6. mes_saida formato "Maio/2026"
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const dataSaidaObj = new Date(hoje + 'T12:00:00');
  const mesSaida = `${meses[dataSaidaObj.getMonth()]}/${dataSaidaObj.getFullYear()}`;

  // 7. INSERT (UNIQUE constraint cobre idempotência)
  const { data: inserido, error } = await supabase.from('alunos_historico').insert({
    nome: alunoCorrente.nome,
    unidade_id: p.unidadeId,
    aluno_id: alunoCorrente.id,
    aluno_ids: validas.map((a: any) => a.id),
    data_entrada: dataEntrada,
    data_saida: hoje,
    tempo_permanencia_meses: tempoMeses,
    categoria_saida: categoria,
    mes_saida: mesSaida,
    motivo_saida: p.finalizacaoMotivo || null,
  }).select('id').maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return { gravou_historico: false, motivo: 'duplicate_idempotencia' };
    }
    return { gravou_historico: false, motivo: 'erro_insert', erro: error.message };
  }

  return {
    gravou_historico: true,
    historico_id: inserido?.id,
    data_entrada: dataEntrada,
    data_saida: hoje,
    tempo_meses: tempoMeses,
    aluno_ids: validas.map((a: any) => a.id),
    categoria_saida: categoria,
  };
}

async function handleEvasao(supabase: any, p: Payload) {
  const idempotency_key = await computarHash(
    `matricula_finalizacao:${p.matriculaIdEmusys ?? ''}:${p.unidadeId}:${new Date().toISOString().split('T')[0]}`
  );

  try {
    const cursoId = await resolverCursoId(supabase, p.nomeCurso, p.emusysCursoId);
    const found = await buscarAluno(supabase, p, cursoId);

    if (!found?.aluno) {
      const result = {
        action: 'erro_aluno_nao_encontrado',
        motivo: `Aluno "${p.nomeAluno}" não encontrado na unidade ${p.unidadeNome}`,
      };

      const resultado: ResultadoMatricula = {
        aluno_id: null,
        curso_id: cursoId ?? null,
        professor_id: null,
        lead_id: null,
        unidade_id: p.unidadeId ?? null,
        payload: p.rawPayload,
      };
      const invariantes = comFallback(() => checarFinalizacao(p.rawPayload, resultado));

      await gravarLog(supabase, {
        evento: 'matricula_finalizacao',
        acao: result.action,
        aluno_nome: p.nomeAluno || '(desconhecido)',
        unidade_nome: p.unidadeNome ?? undefined,
        payload_bruto: p.rawPayload,
        idempotency_key,
        invariantes,
        detalhes: { ...result, version: VERSAO, curso: p.nomeCurso, emusys_matricula_id: p.matriculaIdEmusys },
        workflow_id: 'processar-matricula-emusys',
        execution_id: new Date().toISOString(),
      });

      return result;
    }

    const aluno = found.aluno;
    await backfillMatriculaId(supabase, aluno.id, p.matriculaIdEmusys, aluno.emusys_matricula_id);

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

    // v12: gravar passagem em alunos_historico se aluno saiu de TODAS as matrículas
    const passagem = await registrarPassagemFinalizada(supabase, { id: aluno.id, nome: aluno.nome }, p);

    const result = {
      action: 'status_evadido',
      aluno_id: aluno.id,
      matched_via: found.fonte,
      motivo,
      observacoes: p.finalizacaoObservacoes,
      movimentacao_registrada: movRegistrada,
      passagem,
    };

    const resultado: ResultadoMatricula = {
      aluno_id: aluno.id ?? null,
      curso_id: aluno.curso_id ?? cursoId ?? null,
      professor_id: aluno.professor_atual_id ?? null,
      lead_id: null,
      unidade_id: p.unidadeId ?? null,
      payload: p.rawPayload,
    };
    const invariantes = comFallback(() => checarFinalizacao(p.rawPayload, resultado));

    await gravarLog(supabase, {
      evento: 'matricula_finalizacao',
      acao: result.action,
      aluno_id: aluno.id ?? undefined,
      aluno_nome: p.nomeAluno || '(desconhecido)',
      unidade_nome: p.unidadeNome ?? undefined,
      payload_bruto: p.rawPayload,
      idempotency_key,
      invariantes,
      detalhes: {
        ...result,
        curso: p.nomeCurso,
        emusys_matricula_id: p.matriculaIdEmusys,
        version: VERSAO,
      },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });

    return result;
  } catch (e: any) {
    await gravarLog(supabase, {
      evento: 'matricula_finalizacao',
      acao: 'erro',
      aluno_nome: p.nomeAluno || '(desconhecido)',
      unidade_nome: p.unidadeNome ?? undefined,
      payload_bruto: p.rawPayload,
      idempotency_key,
      invariantes: [{
        regra: 'processamento_falhou_excecao',
        severidade: 'critico',
        mensagem: `Exceção em handleEvasao: ${e?.message ?? e}`,
      }],
      detalhes: { version: VERSAO, erro: e?.message ?? String(e) },
      workflow_id: 'processar-matricula-emusys',
      execution_id: new Date().toISOString(),
    });
    throw e;
  }
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

    console.log(`[${VERSAO}] ${p.evento} | Aluno: ${p.nomeAluno} | Unidade: ${p.unidadeNome} | matricula_id: ${p.matriculaIdEmusys}`);

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
        // Evento ignorado: ainda registra para visibilidade (sem invariantes)
        await gravarLog(supabase, {
          evento: p.evento,
          acao: result.action,
          aluno_nome: p.nomeAluno || '(desconhecido)',
          unidade_nome: p.unidadeNome ?? undefined,
          payload_bruto: p.rawPayload,
          idempotency_key: null,
          invariantes: [],
          detalhes: { ...result, version: VERSAO },
          workflow_id: 'processar-matricula-emusys',
          execution_id: new Date().toISOString(),
        });
    }

    // Nota v17: o gravarLog ocorre dentro de cada handler. Aqui não inserimos mais
    // em automacao_log para evitar duplicidade.

    return new Response(JSON.stringify({ success: true, evento: p.evento, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(`[${VERSAO}] Erro:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
