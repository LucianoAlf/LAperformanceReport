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
} from '../_shared/reconciliacao-grade-snapshot.ts';

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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    for (const unidade of unidades) {
      const mapaProfessores = await carregarMapaProfessoresEmusys(supabase, unidade.id);
      let aulas: AulaEmusys[];
      try {
        aulas = await fetchAulasRange(unidade.token, hoje, dataFim);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : String(error);
        console.error(`[sync-grade-futura] ${unidade.nome}: fetch falhou, unidade preservada - ${mensagem}`);
        resultados.push({ unidade: unidade.nome, status: 'fetch_falhou_preservado', erro: mensagem });
        continue;
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

      // idPorEmusysId e construido a partir do retorno do proprio upsert
      // (.select() no upsert), nao de um SELECT separado: um SELECT sem
      // paginacao na tabela inteira da janela (3000+ linhas) estoura o teto
      // padrao de 1000 linhas do PostgREST e trunca o mapa silenciosamente
      // (aula fora do mapa = vinculo descartado sem erro, sem log). Usar o
      // retorno do upsert elimina essa classe de bug e evita a ida extra ao banco.
      let gravadas = 0;
      // IMPORTANTE: chunkSize precisa ficar < 1000. O retorno de cada upsert
      // (.select() abaixo) alimenta idPorEmusysId; se o lote crescer para
      // 1000+ o PostgREST corta a resposta e reintroduz o truncamento
      // silencioso que ja causou vinculos descartados sem erro/log uma vez.
      const chunkSize = 500;
      const idPorEmusysId = new Map<number, number>();
      let upsertAulasIncompleto = false;
      for (let offset = 0; offset < linhas.length; offset += chunkSize) {
        const lote = linhas.slice(offset, offset + chunkSize);
        const { data: loteGravado, error } = await supabase
          .from('aulas_emusys')
          .upsert(lote, { onConflict: 'emusys_id,unidade_id', ignoreDuplicates: false })
          .select('id, emusys_id');
        if (error) {
          console.error(`[sync-grade-futura] ${unidade.nome}: upsert de aula falhou; reconciliação preservada`);
          upsertAulasIncompleto = true;
          break;
        }
        gravadas += lote.length;
        for (const linhaGravada of loteGravado || []) {
          idPorEmusysId.set(linhaGravada.emusys_id as number, linhaGravada.id as number);
        }
      }

      const integridadeMapaAulas = verificarIntegridadeMapaAulas(linhas, idPorEmusysId);
      if (!integridadeMapaAulas.completo) {
        upsertAulasIncompleto = true;
      }
      if (upsertAulasIncompleto) {
        resultados.push({
          unidade: unidade.nome,
          status: 'upsert_aulas_incompleto_preservado',
          janela: { inicio: hoje, fim: dataFim, dias: janelaDias },
          aulas_recebidas: aulas.length,
          aulas_gravadas: gravadas,
        });
        continue;
      }

      // Persiste o alunos[] que a resposta ja traz. Sem isso a grade futura
      // sabe curso/turma/sala mas nao sabe de quem e a aula.

      const vinculos = montarVinculosAulaAlunos(aulas, idPorEmusysId, unidade.id, normalizarNome);
      const resultado = await gravarVinculosAulaAlunos(supabase, vinculos, chunkSize);
      if (resultado.erros.length > 0) {
        console.error(`[sync-grade-futura] ${unidade.nome}: upsert de roster falhou; reconciliação preservada`);
        resultados.push({
          unidade: unidade.nome,
          status: 'roster_incompleto_preservado',
          janela: { inicio: hoje, fim: dataFim, dias: janelaDias },
          aulas_recebidas: aulas.length,
          aulas_gravadas: gravadas,
          vinculos_gravados: resultado.gravados,
          vinculos_com_erro: resultado.erros.length,
        });
        continue;
      }
      console.log(
        `[sync-grade-futura] ${unidade.nome}: ${resultado.gravados} vinculos aluno-aula`,
      );

      // A reconciliacao recebe a foto COMPLETA da API e concentra a regra de
      // seguranca: so hoje/futuro, sem apagar historico e sem tocar em aula ou
      // vinculo que ja tenha decisao terminal de presenca.
      let reconciliacao;
      try {
        reconciliacao = await reconciliarGradeSnapshotEmusys(supabase, {
          unidadeId: unidade.id,
          dataInicio: hoje,
          dataFim,
          snapshot: montarSnapshotGradeEmusys(
            aulas.filter((aula) =>
              aula.categoria === 'normal'
              && aula.data_hora_inicio.split(' ')[0] >= hoje
              && aula.data_hora_inicio.split(' ')[0] <= dataFim
            ),
            normalizarNome,
          ),
        });
      } catch {
        console.error(`[sync-grade-futura] ${unidade.nome}: fotografia inválida; reconciliação preservada`);
        resultados.push({
          unidade: unidade.nome,
          status: 'fotografia_invalida_preservada',
          janela: { inicio: hoje, fim: dataFim, dias: janelaDias },
          aulas_recebidas: aulas.length,
          aulas_gravadas: gravadas,
          vinculos_gravados: resultado.gravados,
        });
        continue;
      }

      resultados.push({
        unidade: unidade.nome,
        status: 'ok',
        janela: { inicio: hoje, fim: dataFim, dias: janelaDias },
        aulas_recebidas: aulas.length,
        aulas_gravadas: gravadas,
        reconciliacao_grade: {
          status: reconciliacao.status,
          aulas_canceladas: reconciliacao.aulas_canceladas ?? 0,
          vinculos_removidos: reconciliacao.vinculos_removidos ?? 0,
        },
        vinculos_gravados: resultado.gravados,
        vinculos_com_erro: resultado.erros.length,
      });
    }

    return new Response(
      JSON.stringify({ success: true, hoje, resultados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[sync-grade-futura] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
