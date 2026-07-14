/// <reference lib="deno.ns" />

// Edge Function: sync-professores-emusys v2
// Reconcilia identidades de professor por (unidade_id, emusys_id).
// Nomes servem apenas como sugestao para revisao humana; nunca criam vinculo.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const SUPABASE_URL = requiredEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UNIDADES = [
  {
    id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    codigo: 'CG',
    nome: 'Campo Grande',
    token: requiredEnv('EMUSYS_TOKEN_CG'),
  },
  {
    id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
    codigo: 'BARRA',
    nome: 'Barra',
    token: requiredEnv('EMUSYS_TOKEN_BARRA'),
  },
  {
    id: '95553e96-971b-4590-a6eb-0201d013c14d',
    codigo: 'REC',
    nome: 'Recreio',
    token: requiredEnv('EMUSYS_TOKEN_RECREIO'),
  },
] as const;

const EMUSYS_BASE = 'https://api.emusys.com.br/v1';

function normalizar(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function primeiraRelacao<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface EmusysProfessor {
  id: number;
  nome: string;
  [key: string]: unknown;
}

interface ProfessorLocal {
  id: number;
  nome: string;
  ativo: boolean;
}

interface VinculoProfessor {
  id: number;
  professor_id: number;
  emusys_id: number | null;
  emusys_ativo: boolean;
  validacao_status: string;
  identidade_historica_valida: boolean;
  origem: string;
  professores: ProfessorLocal | ProfessorLocal[] | null;
}

interface SyncStats {
  unidade: string;
  total_emusys: number;
  vinculos_por_id: number;
  reativados_por_id: number;
  desativados_ausentes: number;
  divergencias_abertas: number;
  erros: number;
}

async function fetchProfessoresEmusys(token: string): Promise<EmusysProfessor[]> {
  const response = await fetch(`${EMUSYS_BASE}/professores`, {
    method: 'GET',
    headers: { token, 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Emusys retornou ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return Array.isArray(data?.professores) ? data.professores : [];
}

async function logEvento(
  supabase: any,
  evento: string,
  dados: {
    unidadeId: string;
    professorId?: number | null;
    emusysId?: number | null;
    nomeEmusys?: string | null;
    detalhes?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from('professores_sync_log').insert({
    evento,
    unidade_id: dados.unidadeId,
    professor_id: dados.professorId ?? null,
    emusys_id: dados.emusysId ?? null,
    nome_emusys: dados.nomeEmusys ?? null,
    detalhes: dados.detalhes || null,
  });

  if (error) console.error('[sync-professores-emusys] Falha ao registrar log:', error);
}

async function registrarDivergencia(
  supabase: any,
  dados: {
    unidadeId: string;
    tipo: 'so_no_emusys' | 'so_no_la' | 'conflito_unidade';
    professorId?: number | null;
    professoresUnidadeId?: number | null;
    emusysProfessorId?: number | null;
    nomeLa?: string | null;
    nomeEmusys?: string | null;
    valorNosso?: Record<string, unknown>;
    valorEmusys?: Record<string, unknown>;
    sugestao?: Record<string, unknown>;
    severidade?: 'baixa' | 'media' | 'alta';
  },
): Promise<void> {
  let busca = supabase
    .from('professores_emusys_divergencias')
    .select('id')
    .eq('unidade_id', dados.unidadeId)
    .eq('tipo_divergencia', dados.tipo)
    .eq('resolvido', false);

  busca = dados.emusysProfessorId == null
    ? busca.is('emusys_professor_id', null)
    : busca.eq('emusys_professor_id', dados.emusysProfessorId);
  busca = dados.professorId == null
    ? busca.is('professor_id', null)
    : busca.eq('professor_id', dados.professorId);

  const { data: existente, error: buscaError } = await busca.maybeSingle();
  if (buscaError) throw buscaError;

  const payload = {
    unidade_id: dados.unidadeId,
    professor_id: dados.professorId ?? null,
    professores_unidade_id: dados.professoresUnidadeId ?? null,
    emusys_professor_id: dados.emusysProfessorId ?? null,
    tipo_divergencia: dados.tipo,
    nome_la: dados.nomeLa ?? null,
    nome_emusys: dados.nomeEmusys ?? null,
    valor_nosso: dados.valorNosso || {},
    valor_emusys: dados.valorEmusys || {},
    sugestao: dados.sugestao || {},
    severidade: dados.severidade || 'media',
  };

  const operacao = existente?.id
    ? supabase.from('professores_emusys_divergencias').update(payload).eq('id', existente.id)
    : supabase.from('professores_emusys_divergencias').insert(payload);
  const { error } = await operacao;
  if (error) throw error;
}

async function syncUnidade(
  supabase: any,
  unidade: typeof UNIDADES[number],
): Promise<SyncStats> {
  const stats: SyncStats = {
    unidade: unidade.codigo,
    total_emusys: 0,
    vinculos_por_id: 0,
    reativados_por_id: 0,
    desativados_ausentes: 0,
    divergencias_abertas: 0,
    erros: 0,
  };

  let listaEmusys: EmusysProfessor[];
  try {
    listaEmusys = await fetchProfessoresEmusys(unidade.token);
  } catch (error) {
    await logEvento(supabase, 'erro', {
      unidadeId: unidade.id,
      detalhes: {
        erro: error instanceof Error ? error.message : String(error),
        step: 'fetch_emusys',
      },
    });
    stats.erros++;
    return stats;
  }
  stats.total_emusys = listaEmusys.length;

  const { data: vinculosData, error: vinculosError } = await supabase
    .from('professores_unidades')
    .select(`
      id,
      professor_id,
      emusys_id,
      emusys_ativo,
      validacao_status,
      identidade_historica_valida,
      origem,
      professores(id, nome, ativo)
    `)
    .eq('unidade_id', unidade.id);
  if (vinculosError) throw vinculosError;

  const { data: professoresData, error: professoresError } = await supabase
    .from('professores')
    .select('id, nome, ativo');
  if (professoresError) throw professoresError;

  const vinculos = (vinculosData || []) as VinculoProfessor[];
  const professores = (professoresData || []) as ProfessorLocal[];
  const vinculosPorEmusysId = new Map<number, VinculoProfessor>();
  for (const vinculo of vinculos) {
    if (vinculo.emusys_id != null) vinculosPorEmusysId.set(vinculo.emusys_id, vinculo);
  }

  const professoresPorNome = new Map<string, ProfessorLocal[]>();
  for (const professor of professores) {
    const chave = normalizar(professor.nome);
    if (!chave) continue;
    const candidatos = professoresPorNome.get(chave) || [];
    candidatos.push(professor);
    professoresPorNome.set(chave, candidatos);
  }

  const idsAtuais = new Set<number>();
  for (const professorEmusys of listaEmusys) {
    if (!Number.isInteger(professorEmusys.id) || professorEmusys.id <= 0) continue;
    idsAtuais.add(professorEmusys.id);

    try {
      const vinculo = vinculosPorEmusysId.get(professorEmusys.id);
      if (!vinculo) {
        const candidatos = professoresPorNome.get(normalizar(professorEmusys.nome)) || [];
        await registrarDivergencia(supabase, {
          unidadeId: unidade.id,
          tipo: 'so_no_emusys',
          emusysProfessorId: professorEmusys.id,
          nomeEmusys: professorEmusys.nome,
          valorEmusys: professorEmusys,
          sugestao: {
            regra: 'nome_apenas_sugestao_requer_validacao_humana',
            candidatos: candidatos.map((candidato) => ({
              professor_id: candidato.id,
              nome: candidato.nome,
              ativo: candidato.ativo,
            })),
          },
          severidade: 'alta',
        });
        stats.divergencias_abertas++;
        continue;
      }

      const professorLocal = primeiraRelacao(vinculo.professores);
      const podeSerOperacional = Boolean(
        professorLocal?.ativo &&
        vinculo.validacao_status !== 'ignorado' &&
        !vinculo.identidade_historica_valida
      );
      const reativado = podeSerOperacional && !vinculo.emusys_ativo;

      const { error: updateError } = await supabase
        .from('professores_unidades')
        .update({
          emusys_nome: professorEmusys.nome,
          emusys_nome_normalizado: normalizar(professorEmusys.nome),
          emusys_ativo: podeSerOperacional,
          payload_emusys: professorEmusys,
          last_seen_em: new Date().toISOString(),
        })
        .eq('id', vinculo.id);
      if (updateError) throw updateError;

      if (!podeSerOperacional) {
        await registrarDivergencia(supabase, {
          unidadeId: unidade.id,
          tipo: 'conflito_unidade',
          professorId: vinculo.professor_id,
          professoresUnidadeId: vinculo.id,
          emusysProfessorId: professorEmusys.id,
          nomeLa: professorLocal?.nome,
          nomeEmusys: professorEmusys.nome,
          valorNosso: {
            professor_ativo: professorLocal?.ativo ?? false,
            validacao_status: vinculo.validacao_status,
            identidade_historica_valida: vinculo.identidade_historica_valida,
            origem: vinculo.origem,
          },
          valorEmusys: professorEmusys,
          sugestao: { acao: 'revisar_vinculo_sem_reativacao_automatica' },
          severidade: 'alta',
        });
        stats.divergencias_abertas++;
      } else if (reativado) {
        await logEvento(supabase, 'vinculo_operacional_reativado_por_id', {
          unidadeId: unidade.id,
          professorId: vinculo.professor_id,
          emusysId: professorEmusys.id,
          nomeEmusys: professorEmusys.nome,
          detalhes: { regra: 'unidade_id_mais_emusys_id' },
        });
        stats.reativados_por_id++;
      }

      stats.vinculos_por_id++;
    } catch (error) {
      await logEvento(supabase, 'erro', {
        unidadeId: unidade.id,
        emusysId: professorEmusys.id,
        nomeEmusys: professorEmusys.nome,
        detalhes: {
          erro: error instanceof Error ? error.message : String(error),
          step: 'processar_professor_por_id',
        },
      });
      stats.erros++;
    }
  }

  for (const vinculo of vinculos) {
    if (
      vinculo.emusys_id == null ||
      !vinculo.emusys_ativo ||
      idsAtuais.has(vinculo.emusys_id)
    ) {
      continue;
    }

    try {
      const professorLocal = primeiraRelacao(vinculo.professores);
      const { error: updateError } = await supabase
        .from('professores_unidades')
        .update({
          emusys_ativo: false,
          identidade_historica_valida: true,
        })
        .eq('id', vinculo.id)
        .eq('emusys_ativo', true);
      if (updateError) throw updateError;

      await registrarDivergencia(supabase, {
        unidadeId: unidade.id,
        tipo: 'so_no_la',
        professorId: vinculo.professor_id,
        professoresUnidadeId: vinculo.id,
        emusysProfessorId: vinculo.emusys_id,
        nomeLa: professorLocal?.nome,
        valorNosso: {
          emusys_id: vinculo.emusys_id,
          validacao_status: vinculo.validacao_status,
          origem: vinculo.origem,
        },
        valorEmusys: { presente_na_lista_atual: false },
        sugestao: { acao: 'confirmar_saida_ou_inatividade_na_unidade' },
        severidade: 'media',
      });
      await logEvento(supabase, 'vinculo_operacional_desativado_ausente_api', {
        unidadeId: unidade.id,
        professorId: vinculo.professor_id,
        emusysId: vinculo.emusys_id,
        nomeEmusys: professorLocal?.nome,
        detalhes: {
          identidade_historica_preservada: true,
          regra: 'id_ausente_no_get_professores_da_unidade',
        },
      });
      stats.desativados_ausentes++;
      stats.divergencias_abertas++;
    } catch (error) {
      await logEvento(supabase, 'erro', {
        unidadeId: unidade.id,
        professorId: vinculo.professor_id,
        emusysId: vinculo.emusys_id,
        detalhes: {
          erro: error instanceof Error ? error.message : String(error),
          step: 'desativar_ausente',
        },
      });
      stats.erros++;
    }
  }

  const { error: cleanupError } = await supabase.rpc(
    'limpar_professores_emusys_divergencias_obsoletas',
  );
  if (cleanupError) {
    await logEvento(supabase, 'erro', {
      unidadeId: unidade.id,
      detalhes: { erro: cleanupError.message, step: 'limpar_divergencias_obsoletas' },
    });
    stats.erros++;
  }

  return stats;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('[sync-professores-emusys v2] Iniciando sync canonico das 3 unidades');

    const resultados: SyncStats[] = [];
    for (const unidade of UNIDADES) {
      const stats = await syncUnidade(supabase, unidade);
      resultados.push(stats);
      console.log(`[sync-professores-emusys v2] ${unidade.codigo}:`, JSON.stringify(stats));
    }

    return new Response(JSON.stringify({ success: true, resultados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[sync-professores-emusys v2] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
