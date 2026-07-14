/// <reference lib="deno.ns" />

// Edge Function: sync-grade-futura-emusys
// Popula aulas_emusys com a grade futura sem escrever presencas dos alunos.
// Converge com sync-presenca-emusys pela chave (emusys_id, unidade_id).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMUSYS_API = 'https://api.emusys.com.br/v1';

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

interface AulaEmusys {
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
  professores: { nome: string; presenca?: string | null }[];
  alunos: { nome_aluno: string }[];
  anotacoes: string | null;
}

function matchProfessor(
  nomeEmusys: string,
  profMapa: Map<string, number>,
  profNomes: string[],
): number | null {
  const norm = normalizarNome(nomeEmusys);
  if (profMapa.has(norm)) return profMapa.get(norm)!;

  for (const profNorm of profNomes) {
    if (norm.startsWith(`${profNorm} `) || profNorm.startsWith(`${norm} `)) {
      return profMapa.get(profNorm)!;
    }
  }

  const parts = norm.split(' ');
  if (parts.length >= 2) {
    const primeiro = parts[0];
    const ultimo = parts[parts.length - 1];
    for (const profNorm of profNomes) {
      const profParts = profNorm.split(' ');
      if (
        profParts.length >= 2 &&
        profParts[0] === primeiro &&
        profParts[profParts.length - 1] === ultimo
      ) {
        return profMapa.get(profNorm)!;
      }
    }
  }

  return null;
}

function parseDataHoraEmusys(dataHora: string): string {
  return dataHora.replace(' ', 'T') + ':00-03:00';
}

async function fetchAulasRange(
  token: string,
  dataIni: string,
  dataFim: string,
): Promise<AulaEmusys[]> {
  const todas: AulaEmusys[] = [];
  let cursor: string | null = null;
  let temMais = true;

  while (temMais) {
    let url = `${EMUSYS_API}/aulas/?data_hora_inicial=${dataIni}T00:00:00&data_hora_final=${dataFim}T23:59:59&limite=100`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const response = await fetch(url, { headers: { token } });
    if (!response.ok) throw new Error(`Emusys API ${response.status} em ${url}`);

    const json = await response.json();
    todas.push(...(json.items || []));
    temMais = json.paginacao?.tem_mais === true;
    cursor = json.paginacao?.proximo_cursor || null;
  }

  return todas;
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

    const { data: professoresDB } = await supabase
      .from('professores')
      .select('id, nome')
      .eq('ativo', true);
    const profMapa = new Map<string, number>();
    const profNomes: string[] = [];
    for (const professor of professoresDB || []) {
      const nomeNormalizado = normalizarNome(professor.nome);
      profMapa.set(nomeNormalizado, professor.id);
      profNomes.push(nomeNormalizado);
    }

    const resultados: Array<Record<string, unknown>> = [];

    for (const unidade of unidades) {
      let aulas: AulaEmusys[];
      try {
        aulas = await fetchAulasRange(unidade.token, hoje, dataFim);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : String(error);
        console.error(`[sync-grade-futura] ${unidade.nome}: fetch falhou, unidade preservada - ${mensagem}`);
        resultados.push({ unidade: unidade.nome, status: 'fetch_falhou_preservado', erro: mensagem });
        continue;
      }

      const vivosEmusysId = new Set<number>();
      const linhas: Record<string, unknown>[] = [];

      for (const aula of aulas) {
        const dataAula = aula.data_hora_inicio?.split(' ')[0] || hoje;
        if (dataAula < hoje) continue;

        vivosEmusysId.add(aula.id);
        const profNome = aula.professores?.[0]?.nome || null;
        const professorId = profNome
          ? matchProfessor(profNome, profMapa, profNomes)
          : null;

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
          professor_id: professorId,
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
      for (let offset = 0; offset < linhas.length; offset += chunkSize) {
        const lote = linhas.slice(offset, offset + chunkSize);
        const { error } = await supabase
          .from('aulas_emusys')
          .upsert(lote, { onConflict: 'emusys_id,unidade_id', ignoreDuplicates: false });
        if (error) {
          console.error(`[sync-grade-futura] upsert lote (${unidade.nome}) offset ${offset}: ${error.message}`);
          continue;
        }
        gravadas += lote.length;
      }

      const { data: existentesFuturas } = await supabase
        .from('aulas_emusys')
        .select('emusys_id')
        .eq('unidade_id', unidade.id)
        .gt('data_aula', hoje)
        .lte('data_aula', dataFim)
        .eq('cancelada', false);

      const fantasmas = (existentesFuturas || [])
        .map((row) => row.emusys_id as number)
        .filter((id) => !vivosEmusysId.has(id));

      let canceladas = 0;
      for (let offset = 0; offset < fantasmas.length; offset += chunkSize) {
        const bloco = fantasmas.slice(offset, offset + chunkSize);
        const { error } = await supabase
          .from('aulas_emusys')
          .update({ cancelada: true })
          .eq('unidade_id', unidade.id)
          .gt('data_aula', hoje)
          .in('emusys_id', bloco);
        if (error) {
          console.error(`[sync-grade-futura] soft-cancel (${unidade.nome}): ${error.message}`);
        } else {
          canceladas += bloco.length;
        }
      }

      resultados.push({
        unidade: unidade.nome,
        status: 'ok',
        janela: { inicio: hoje, fim: dataFim, dias: janelaDias },
        aulas_recebidas: aulas.length,
        aulas_gravadas: gravadas,
        fantasmas_canceladas: canceladas,
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
