// Edge Function: sync-presenca-emusys
// Sincroniza presença dos alunos do Emusys para aluno_presenca
// Chamada semanalmente via pg_cron (domingo 22h BRT) ou manualmente via botão

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

interface AulaEmusys {
  id: number;
  cancelada: boolean;
  data_hora_inicio: string;
  curso_nome: string;
  professores: { nome: string; presenca: string }[];
  alunos: { nome_aluno: string; presenca: string; horario_presenca: string | null }[];
}

interface PresencaAgrupada {
  nomeOriginal: string;
  nomeNormalizado: string;
  status: 'presente' | 'ausente';
  horario: string | null;
  professorNome: string | null;
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

// Extrair e agrupar presença dos alunos (presente em qualquer aula = presente no dia)
function extrairPresencas(aulas: AulaEmusys[]): Map<string, PresencaAgrupada> {
  const mapa = new Map<string, PresencaAgrupada>();

  for (const aula of aulas) {
    if (aula.cancelada) continue;

    const profNome = aula.professores?.[0]?.nome || null;

    for (const aluno of aula.alunos || []) {
      const nome = aluno.nome_aluno?.trim();
      if (!nome) continue;

      const key = normalizarNome(nome);
      const status = aluno.presenca === 'presente' ? 'presente' : 'ausente';

      const existing = mapa.get(key);
      if (existing) {
        if (status === 'presente') {
          existing.status = 'presente';
          existing.horario = aluno.horario_presenca;
          if (profNome) existing.professorNome = profNome;
        }
      } else {
        mapa.set(key, {
          nomeOriginal: nome,
          nomeNormalizado: key,
          status,
          horario: aluno.horario_presenca,
          professorNome: profNome,
        });
      }
    }
  }

  return mapa;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parâmetros: data (YYYY-MM-DD, default hoje), dias (default 1, cron semanal usa 7)
    let dataFim: string;
    let dias = 1;
    try {
      const body = await req.json();
      dataFim = body.data || '';
      dias = Math.min(Math.max(body.dias || 1, 1), 30); // 1-30 dias
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

    console.log(`[sync-presenca] Iniciando sync para ${dias} dia(s): ${datasProcessar[0]} a ${dataFim}`);

    // Buscar todos os alunos ativos para matching
    const { data: alunosDB, error: alunosError } = await supabase
      .from('alunos')
      .select('id, nome, unidade_id')
      .eq('status', 'ativo');

    if (alunosError) {
      throw new Error(`Erro ao buscar alunos: ${alunosError.message}`);
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

    // Criar mapa de nome normalizado -> aluno_id por unidade
    const alunosPorUnidade = new Map<string, Map<string, number>>();
    for (const aluno of alunosDB || []) {
      const uid = aluno.unidade_id;
      if (!alunosPorUnidade.has(uid)) {
        alunosPorUnidade.set(uid, new Map());
      }
      alunosPorUnidade.get(uid)!.set(normalizarNome(aluno.nome), aluno.id);
    }

    const resultados = [];

    for (const dataAlvo of datasProcessar) {
      console.log(`[sync-presenca] === Processando data: ${dataAlvo} ===`);

      for (const unidade of UNIDADES) {
        console.log(`[sync-presenca] ${dataAlvo} - ${unidade.nome}...`);

        // 1. Buscar aulas do dia no Emusys
        const aulas = await fetchAulasDia(unidade.token, dataAlvo);

        // 2. Extrair e agrupar presença
        const presencas = extrairPresencas(aulas);

        const mapaAlunos = alunosPorUnidade.get(unidade.id) || new Map();
        let matched = 0;
        let naoEncontrados = 0;
        const nomesNaoEncontrados: string[] = [];
        let presentes = 0;
        let ausentes = 0;

        // 3. UPSERT presença para cada aluno
        for (const [_key, presenca] of presencas) {
          const alunoId = mapaAlunos.get(presenca.nomeNormalizado);

          if (!alunoId) {
            naoEncontrados++;
            nomesNaoEncontrados.push(presenca.nomeOriginal);
            continue;
          }

          matched++;
          if (presenca.status === 'presente') presentes++;
          else ausentes++;

          // Match professor
          const professorId = presenca.professorNome
            ? matchProfessor(presenca.professorNome, profMapa, profNomes)
            : null;

          // UPSERT presença
          const { error: upsertError } = await supabase
            .from('aluno_presenca')
            .upsert(
              {
                aluno_id: alunoId,
                professor_id: professorId,
                unidade_id: unidade.id,
                data_aula: dataAlvo,
                horario_aula: presenca.horario,
                status: presenca.status,
                respondido_por: 'emusys',
                respondido_em: new Date().toISOString(),
              },
              {
                onConflict: 'aluno_id,data_aula',
                ignoreDuplicates: false,
              }
            );

          if (upsertError) {
            console.error(`[sync-presenca] Upsert error para ${presenca.nomeOriginal}:`, upsertError.message);
          }
        }

        // 4. Log
        await supabase.from('emusys_sync_log').insert({
          unidade_id: unidade.id,
          unidade_nome: unidade.nome,
          data_sync: dataAlvo,
          total_aulas: aulas.filter(a => !a.cancelada).length,
          total_registros: presencas.size,
          presentes,
          ausentes,
          alunos_matched: matched,
          alunos_nao_encontrados: naoEncontrados,
          nomes_nao_encontrados: nomesNaoEncontrados,
        });

        resultados.push({
          data: dataAlvo,
          unidade: unidade.nome,
          aulas: aulas.length,
          alunos: presencas.size,
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

    return new Response(
      JSON.stringify({ success: true, dias, data_inicio: datasProcessar[0], data_fim: dataFim, resultados }),
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
