// Edge Function: sync-presenca-emusys
// Sincroniza aulas e presença dos alunos do Emusys para aulas_emusys + aluno_presenca
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
      .in('status', ['ativo', 'aviso_previo']);

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

        const mapaAlunos = alunosPorUnidade.get(unidade.id) || new Map();
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

          // 2b. Processar presença de cada aluno nesta aula
          for (const aluno of aula.alunos || []) {
            const nome = aluno.nome_aluno?.trim();
            if (!nome) continue;

            totalPresencas++;
            const alunoId = mapaAlunos.get(normalizarNome(nome));

            if (!alunoId) {
              naoEncontrados++;
              if (!nomesNaoEncontrados.includes(nome)) {
                nomesNaoEncontrados.push(nome);
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
