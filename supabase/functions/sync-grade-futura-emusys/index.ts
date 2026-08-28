/// <reference lib="deno.ns" />

// Edge Function: sync-grade-futura-emusys
// Popula aulas_emusys com a grade futura sem escrever presencas dos alunos.
// Converge com sync-presenca-emusys pela chave (emusys_id, unidade_id).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  carregarMapaProfessoresEmusys,
  resolverProfessorDaAula,
  type EmusysProfessorRef,
} from '../_shared/professor-emusys.ts';
import {
  buscarPaginaAulasEmusys,
  buscarTodasAulasEmusys,
  montarVinculosAulaAlunos,
  gravarVinculosAulaAlunos,
  type AlunoNaAulaEmusys,
} from '../_shared/emusys-aulas.ts';
import {
  montarSnapshotGradeEmusys,
  reconciliarGradeSnapshotEmusys,
  verificarIntegridadeMapaAulas,
  type ResultadoReconciliacaoGradeSnapshot,
} from '../_shared/reconciliacao-grade-snapshot.ts';
import { prepararExecucaoSyncGrade } from '../_shared/sync-grade-authorization.ts';
import {
  executarSyncPresencaComLease,
  redigirErroCodigo,
  type ContagensPresencaSync,
} from '../_shared/presenca-sync-run.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
}

const UNIDADES = [
  { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: requiredEnv('EMUSYS_TOKEN_CG') },
  { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: requiredEnv('EMUSYS_TOKEN_BARRA') },
  { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: requiredEnv('EMUSYS_TOKEN_RECREIO') },
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface AulaEmusys extends Record<string, unknown> {
  id: number;
  nr_da_aula: number | null;
  tipo: string;
  categoria: string;
  turma_nome: string | null;
  curso_id: number | null;
  curso_nome: string;
  cancelada: boolean;
  reagendada?: boolean;
  justificada?: boolean;
  data_hora_inicio: string;
  data_hora_inicio_original?: string | null;
  data_hora_fim: string | null;
  duracao_minutos: number | null;
  sala_nome: string | null;
  professores: Array<EmusysProfessorRef & { nome: string; presenca?: string | null }>;
  alunos: AlunoNaAulaEmusys[];
  anotacoes: string | null;
}

function parseDataHoraEmusys(dataHora: string): string {
  return dataHora.replace(' ', 'T') + ':00-03:00';
}

async function fetchAulasRange(
  token: string,
  dataIni: string,
  dataFim: string,
): Promise<AulaEmusys[]> {
  return buscarTodasAulasEmusys<AulaEmusys>({
    dataInicio: dataIni,
    dataFim,
    fetchPage: ({ cursor, limite }) =>
      buscarPaginaAulasEmusys<AulaEmusys>({
        token,
        dataInicio: dataIni,
        dataFim,
        cursor,
        limite,
      }),
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let autorizacao;
  try {
    autorizacao = await prepararExecucaoSyncGrade(
      {
        authorization: req.headers.get('authorization'),
        xSyncToken: req.headers.get('x-sync-token'),
      },
      {
        chaveServiceRole: SUPABASE_SERVICE_ROLE_KEY,
        validarTokenInterno: async (token) => {
          const validador = createClient(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
          );
          const { data, error } = await validador.rpc(
            'validar_token_sync_grade_interno_v1',
            { p_token: token },
          );
          return !error && data === true;
        },
      },
    );
  } catch {
    autorizacao = {
      permitido: false,
      status: 401,
      codigo: 'NAO_AUTENTICADO',
    };
  }

  if (autorizacao.permitido === false) {
    return new Response(
      JSON.stringify({ error: autorizacao.codigo }),
      {
        status: autorizacao.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let janelaDias = 35;
    let unidadeIndex: number | null = null;

    try {
      const body = await req.json();
      janelaDias = Math.min(Math.max(body.janela_dias ?? 35, 1), 60);
      unidadeIndex = body.unidade_index ?? null;
    } catch {
      // Mantem os valores padrao para chamadas sem corpo.
    }

    const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const hoje = brt.toISOString().split('T')[0];
    const dataFim = new Date(brt.getTime() + janelaDias * 86400000)
      .toISOString()
      .split('T')[0];
    const unidades = unidadeIndex !== null ? [UNIDADES[unidadeIndex]] : UNIDADES;

    const resultados: Array<Record<string, unknown>> = [];
    const requestIdSync = crypto.randomUUID();

    for (const unidade of unidades) {
      const execucao = await executarSyncPresencaComLease({
        cliente: supabase,
        unidadeId: unidade.id,
        modo: 'metadados',
        dataAlvo: hoje,
        requestId: requestIdSync,
        leaseSegundos: 1200,
        trabalho: async ({ heartbeat, syncRunId }) => {
          const mapaProfessores = await carregarMapaProfessoresEmusys(supabase, unidade.id);
          let aulas: AulaEmusys[];
          try {
            aulas = await fetchAulasRange(unidade.token, hoje, dataFim);
          } catch (error) {
            console.error('[sync-grade-futura] Falha ao buscar fotografia completa do Emusys');
            throw error;
          }

          const linhas: Record<string, unknown>[] = [];
          for (const aula of aulas) {
            const dataAula = aula.data_hora_inicio?.split(' ')[0] || hoje;
            if (dataAula < hoje) continue;

            const profNome = aula.professores?.[0]?.nome || null;
            const professor = resolverProfessorDaAula(aula.professores, mapaProfessores);
            linhas.push({
              emusys_id: aula.id,
              unidade_id: unidade.id,
              data_aula: dataAula,
              data_hora_inicio: parseDataHoraEmusys(aula.data_hora_inicio),
              data_hora_inicio_original: aula.data_hora_inicio_original
                ? parseDataHoraEmusys(aula.data_hora_inicio_original)
                : null,
              data_hora_fim: aula.data_hora_fim
                ? parseDataHoraEmusys(aula.data_hora_fim)
                : null,
              duracao_minutos: aula.duracao_minutos,
              tipo: aula.tipo,
              categoria: aula.categoria,
              turma_nome: aula.turma_nome,
              curso_emusys_id: aula.curso_id,
              curso_nome: aula.curso_nome,
              sala_nome: aula.sala_nome,
              professor_nome: profNome,
              emusys_professor_id: professor.emusysProfessorId,
              professor_id: professor.professorId,
              sem_acompanhamento: professor.semAcompanhamento,
              cancelada: aula.cancelada === true,
              reagendada: aula.reagendada === true,
              justificada: aula.justificada === true,
              professor_presenca: aula.professores?.[0]?.presenca ?? null,
              nr_da_aula: aula.nr_da_aula,
              qtd_alunos: aula.alunos?.length || 0,
              anotacoes: aula.anotacoes || null,
            });
          }

          let gravadas = 0;
          const chunkSize = 500;
          const idPorEmusysId = new Map<number, number>();
          for (let offset = 0; offset < linhas.length; offset += chunkSize) {
            const lote = linhas.slice(offset, offset + chunkSize);
            const { data: loteGravado, error } = await supabase
              .from('aulas_emusys')
              .upsert(lote, { onConflict: 'emusys_id,unidade_id', ignoreDuplicates: false })
              .select('id, emusys_id');
            if (error) {
              console.error('[sync-grade-futura] Upsert de aula falhou; reconciliacao preservada');
              throw new Error('PRESENCA_SYNC_AULA_GRAVACAO_FALHOU');
            }
            gravadas += lote.length;
            for (const linhaGravada of loteGravado || []) {
              idPorEmusysId.set(linhaGravada.emusys_id as number, linhaGravada.id as number);
            }
          }

          const integridadeMapaAulas = verificarIntegridadeMapaAulas(linhas, idPorEmusysId);
          if (!integridadeMapaAulas.completo) {
            throw new Error('PRESENCA_SYNC_MAPA_AULAS_INCOMPLETO');
          }

          const vinculos = montarVinculosAulaAlunos(
            aulas,
            idPorEmusysId,
            unidade.id,
            normalizarNome,
          );
          const resultado = await gravarVinculosAulaAlunos(supabase, vinculos, chunkSize);
          if (resultado.erros.length > 0) {
            console.error('[sync-grade-futura] Upsert de roster falhou; reconciliacao preservada');
            throw new Error('PRESENCA_SYNC_ROSTER_GRAVACAO_FALHOU');
          }

          const snapshotGrade = montarSnapshotGradeEmusys(
            aulas.filter((aula) =>
              aula.categoria === 'normal'
              && aula.data_hora_inicio.split(' ')[0] >= hoje
              && aula.data_hora_inicio.split(' ')[0] <= dataFim
            ),
            normalizarNome,
          );
          const reconciliacaoDual = await reconciliarGradeSnapshotEmusys(supabase, {
            syncRunId,
            unidadeId: unidade.id,
            dataInicio: hoje,
            dataFim,
            snapshot: snapshotGrade,
          });
          const reconciliacao = reconciliacaoDual.resultado as ResultadoReconciliacaoGradeSnapshot;
          if (
            reconciliacao.status !== 'ok'
            || reconciliacao.estados_gravados !== snapshotGrade.length
          ) {
            throw new Error('PRESENCA_SYNC_RECONCILIACAO_ROSTER_FALHOU');
          }
          console.log(
            `[sync-grade-futura] reconciliacao_grade unidade_id=${unidade.id} data_inicio=${hoje} data_fim=${dataFim} sync_run_id=${syncRunId} contrato=${reconciliacaoDual.contrato} aulas_snapshot=${snapshotGrade.length} estados_gravados=${reconciliacao.estados_gravados}`,
          );

          const valor = {
            unidade: unidade.nome,
            status: 'ok',
            janela: { inicio: hoje, fim: dataFim, dias: janelaDias },
            aulas_recebidas: aulas.length,
            aulas_gravadas: gravadas,
            reconciliacao_grade: {
              contrato: reconciliacaoDual.contrato,
              status: reconciliacao.status,
              aulas_canceladas: reconciliacao.aulas_canceladas ?? 0,
              vinculos_inativados: reconciliacao.vinculos_inativados ?? 0,
              vinculos_reativados: reconciliacao.vinculos_reativados ?? 0,
            },
            vinculos_gravados: resultado.gravados,
            vinculos_com_erro: resultado.erros.length,
          };
          const contagens: ContagensPresencaSync = {
            paginas_lidas: Math.max(1, Math.ceil(aulas.length / 100)),
            aulas_lidas: aulas.length,
            presencas_lidas: 0,
          };
          await heartbeat(contagens);
          return {
            valor,
            contagens,
            snapshot: {
              unidade_id: unidade.id,
              data_inicio: hoje,
              data_fim: dataFim,
              contrato_reconciliacao: reconciliacaoDual.contrato,
              aulas_recebidas: aulas.length,
              aulas_gravadas: gravadas,
              vinculos_gravados: resultado.gravados,
              estados_gravados: reconciliacao.estados_gravados,
            },
          };
        },
      });

      if (execucao.status === 'deduplicada') {
        resultados.push({
          unidade: unidade.nome,
          status: 'deduplicada',
          motivo: execucao.motivo,
        });
        continue;
      }
      resultados.push(execucao.valor);
    }

    return new Response(
      JSON.stringify({ success: true, hoje, resultados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const codigo = redigirErroCodigo(error);
    console.error(`[sync-grade-futura] Erro geral: ${codigo}`);
    return new Response(
      JSON.stringify({ error: codigo }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
