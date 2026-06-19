// Edge Function: marcos-jornada
// Retorna grupos de alunos em marcos da jornada (para envio de pesquisas), olhando
// as aulas AGENDADAS no Emusys, na janela informada (futura por padrão, OU período customizado
// retroativo via data_inicio/data_fim no body):
//   - primeiras_aulas: aluno com 1a aula (nr_da_aula=1) na janela + matricula recente + ativo + nao-banda
//   - marco_aula (so calouros): TODOS os calouros com aula na janela, COM o nr de cada aula.
//     calouro = matriculado ate 12 meses antes da data da aula (alinhado ao selo "Veterano" >=12m da
//     TabelaAlunos; trocado de numero_renovacoes=0, que vinha furado pois o webhook nunca incrementava).
//     O filtro do "Nº da aula" alvo é aplicado no CLIENT — mudar o alvo não rebusca o Emusys.
// Ignora a presenca (o Emusys pre-marca futuro como 'ausente'); usa so a existencia da aula + nr_da_aula.
// A duplicata individual+turma do Emusys e deduplicada por (aluno, dia, curso) priorizando individual.

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

// Mesma normalizacao do sync-presenca-emusys (matching consistente)
function normalizarNome(nome: string): string {
  return nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
}
function normalizarCurso(nome: string): string {
  return nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+para\s+instrumento$/, '').replace(/\s+(t|ind)$/, '')
    .replace(/\s+/g, ' ').trim();
}

interface AlunoEmusys {
  nome_aluno: string;
  data_nascimento_aluno?: string;
}
interface AulaEmusys {
  id: number;
  nr_da_aula: number | null;
  tipo: string;
  categoria: string;
  curso_nome: string;
  cancelada: boolean;
  data_hora_inicio: string;
  professores: { nome: string }[];
  alunos: AlunoEmusys[];
}

// Busca todas as aulas de um intervalo (paginado)
async function fetchAulasRange(token: string, dataIni: string, dataFim: string): Promise<AulaEmusys[]> {
  const todas: AulaEmusys[] = [];
  let cursor: string | null = null;
  let temMais = true;
  while (temMais) {
    let url = `${EMUSYS_API}/aulas/?data_hora_inicial=${dataIni}T00:00:00&data_hora_final=${dataFim}T23:59:59&limite=100`;
    if (cursor) url += `&cursor=${cursor}`;
    const resp = await fetch(url, { headers: { token } });
    if (!resp.ok) {
      console.error(`[marcos-jornada] Emusys API error: ${resp.status}`);
      break;
    }
    const json = await resp.json();
    todas.push(...(json.items || []));
    const pag = json.paginacao || {};
    temMais = pag.tem_mais === true;
    cursor = pag.proximo_cursor || null;
  }
  return todas;
}

interface MarcoItem {
  aluno_id: number;
  nome: string;
  curso_nome: string;
  professor_nome: string | null;
  data_marco: string;
  horario: string | null;
  nr: number | null;
  telefone: string | null;
  whatsapp: string | null;
  responsavel_telefone: string | null;
}

// data (YYYY-MM-DD) menos N meses, em YYYY-MM-DD
function subtrairMeses(dataISO: string, meses: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().split('T')[0];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let unidadeIdReq: string | null = null;
    let janelaDias = 7;
    let dataInicioReq: string | null = null;
    let dataFimReq: string | null = null;
    try {
      const body = await req.json();
      unidadeIdReq = body.unidade_id ?? null;
      janelaDias = Math.min(Math.max(body.janela_dias ?? 7, 1), 30);
      // Periodo customizado (aceita retroativo): YYYY-MM-DD. Sobrescreve a janela "pra frente".
      dataInicioReq = typeof body.data_inicio === 'string' ? body.data_inicio.slice(0, 10) : null;
      dataFimReq = typeof body.data_fim === 'string' ? body.data_fim.slice(0, 10) : null;
    } catch { /* defaults */ }

    // Datas em BRT (UTC-3)
    const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const hoje = brt.toISOString().split('T')[0];
    // Range de busca de aulas: periodo customizado (se válido) ou hoje → hoje+janela
    const usaPeriodo = !!(dataInicioReq && dataFimReq && dataInicioReq <= dataFimReq);
    const dataIni = usaPeriodo ? dataInicioReq! : hoje;
    const dataFim = usaPeriodo
      ? dataFimReq!
      : new Date(brt.getTime() + janelaDias * 86400000).toISOString().split('T')[0];
    // "1a aula" só conta se a matrícula é recente: até 45 dias antes do início do período buscado
    // (evita pegar aula 1 reagendada muito depois da matrícula). Relativo ao período, funciona retroativo.
    const matriculaLimite = new Date(
      new Date(`${dataIni}T00:00:00Z`).getTime() - 45 * 86400000
    ).toISOString().split('T')[0];

    const unidades = unidadeIdReq ? UNIDADES.filter(u => u.id === unidadeIdReq) : UNIDADES;
    if (unidades.length === 0) {
      return new Response(JSON.stringify({ error: 'Unidade desconhecida' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mapa de cursos: nome normalizado -> { id, is_projeto_banda }
    const { data: cursosDB } = await supabase.from('cursos').select('id, nome, is_projeto_banda').eq('ativo', true);
    const cursoMapa = new Map<string, { id: number; banda: boolean }>();
    for (const c of cursosDB || []) {
      cursoMapa.set(normalizarCurso(c.nome), { id: c.id, banda: c.is_projeto_banda === true });
    }

    const primeiras_aulas: MarcoItem[] = [];
    const marco_aula: MarcoItem[] = [];

    for (const unidade of unidades) {
      // Alunos ativos da unidade (paginado p/ superar limite de 1000 do PostgREST)
      const alunosDB: any[] = [];
      const PAGE = 1000;
      let offset = 0, hasMore = true;
      while (hasMore) {
        const { data: page } = await supabase
          .from('alunos')
          .select('id, nome, data_nascimento, curso_id, data_matricula, numero_renovacoes, telefone, whatsapp, responsavel_telefone')
          .eq('unidade_id', unidade.id)
          .in('status', ['ativo', 'aviso_previo'])
          .range(offset, offset + PAGE - 1);
        alunosDB.push(...(page || []));
        hasMore = (page?.length || 0) === PAGE;
        offset += PAGE;
      }

      const alunoById = new Map<number, any>();
      const mapaComposto = new Map<string, number[]>();
      const mapaSimples = new Map<string, number>();
      for (const a of alunosDB) {
        alunoById.set(a.id, a);
        const nomeNorm = normalizarNome(a.nome);
        const chave = `${nomeNorm}|${a.data_nascimento ?? ''}|${a.curso_id ?? ''}`;
        const arr = mapaComposto.get(chave) ?? [];
        arr.push(a.id);
        mapaComposto.set(chave, arr);
        mapaSimples.set(nomeNorm, a.id);
      }

      const aulas = await fetchAulasRange(unidade.token, dataIni, dataFim);

      // Dedup individual+turma: 1 candidato por (aluno_id, data, curso), priorizando individual
      const cands = new Map<string, { aluno_id: number; data: string; curso: string; nr: number | null; tipo: string; horario: string | null; prof: string | null }>();
      for (const aula of aulas) {
        if (aula.cancelada || aula.categoria !== 'normal') continue;
        const cursoInfo = cursoMapa.get(normalizarCurso(aula.curso_nome || ''));
        const cursoIdLocal = cursoInfo?.id ?? null;
        const horario = (aula.data_hora_inicio?.split(' ')[1] || '').slice(0, 5) || null;
        const profNome = aula.professores?.[0]?.nome || null;
        const dataAula = aula.data_hora_inicio?.split(' ')[0] || hoje;
        for (const al of aula.alunos || []) {
          const nome = al.nome_aluno?.trim();
          if (!nome) continue;
          const nomeNorm = normalizarNome(nome);
          let alunoId: number | undefined;
          if (cursoIdLocal != null) {
            const chave = `${nomeNorm}|${al.data_nascimento_aluno ?? ''}|${cursoIdLocal}`;
            const c = mapaComposto.get(chave) ?? [];
            if (c.length === 1) alunoId = c[0];
          }
          if (alunoId == null) alunoId = mapaSimples.get(nomeNorm);
          if (!alunoId) continue;

          const key = `${alunoId}|${dataAula}|${aula.curso_nome}`;
          const novo = { aluno_id: alunoId, data: dataAula, curso: aula.curso_nome, nr: aula.nr_da_aula, tipo: aula.tipo, horario, prof: profNome };
          const atual = cands.get(key);
          if (!atual) cands.set(key, novo);
          else if (novo.tipo === 'individual' && atual.tipo !== 'individual') cands.set(key, novo);
        }
      }

      // Classificar nos marcos
      for (const cand of cands.values()) {
        const a = alunoById.get(cand.aluno_id);
        if (!a) continue;
        const cursoInfo = cursoMapa.get(normalizarCurso(cand.curso || ''));
        const isBanda = cursoInfo?.banda === true;
        if (isBanda) continue;

        const item: MarcoItem = {
          aluno_id: a.id,
          nome: a.nome,
          curso_nome: cand.curso,
          professor_nome: cand.prof,
          data_marco: cand.data,
          horario: cand.horario,
          nr: cand.nr,
          telefone: a.telefone,
          whatsapp: a.whatsapp,
          responsavel_telefone: a.responsavel_telefone,
        };

        // 1a aula: nr=1 + matricula recente
        if (cand.nr === 1 && a.data_matricula && a.data_matricula >= matriculaLimite) {
          primeiras_aulas.push(item);
        }
        // marco de aula: todos os calouros (matriculado até 12 meses antes da data da aula) com aula
        // na janela, COM o nr. O filtro do "Nº da aula" alvo é aplicado no client (evita rebuscar o Emusys).
        if (cand.nr != null && a.data_matricula && a.data_matricula >= subtrairMeses(cand.data, 12)) {
          marco_aula.push(item);
        }
      }
    }

    const ordenar = (arr: MarcoItem[]) => arr.sort((x, y) => (x.data_marco + (x.horario || '')).localeCompare(y.data_marco + (y.horario || '')));

    return new Response(
      JSON.stringify({
        janela: { inicio: dataIni, fim: dataFim, dias: janelaDias, periodo: usaPeriodo },
        primeiras_aulas: ordenar(primeiras_aulas),
        marco_aula: ordenar(marco_aula),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[marcos-jornada] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
