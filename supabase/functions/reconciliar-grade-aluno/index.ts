/// <reference lib="deno.ns" />

// Edge Function: reconciliar-grade-aluno
//
// Remove da nossa Agenda as aulas FUTURAS de um aluno que o Emusys nao reconhece
// mais ("fantasmas").
//
// POR QUE ISSO PRECISA EXISTIR
// Ao mudar a data da 1a aula em "Alterar matricula", o Emusys APAGA a ocorrencia do
// dia antigo e regera o cronograma — `data_primeira_aula` e parametro do contrato,
// nao uma aula. A aula apagada simplesmente PARA DE VIR no GET /aulas, sem marcacao
// nenhuma. Upsert so age sobre o que chega: ele nunca enxerga uma ausencia, entao a
// linha antiga fica viva e indistinguivel de aula real.
//
// Reagendamento NAO passa por aqui e nem precisa: o Emusys preserva o emusys_id e o
// upsert move a linha sozinho (medido: 357 reagendamentos desde julho, zero duplicata).
//
// Quem dispara: `processar-matricula-emusys`, no evento `matricula_alterada`.
// Antes disto, o unico caminho que removia fantasma era o soft-cancel do
// `sync-grade-futura-emusys` — 1x por dia e com filtro `data_aula > hoje`, que
// justamente PULA a aula de hoje (e amanha ela ja e passado, fora da janela).
//
// ESCOPO: so o futuro. Decisao do Hugo em 13/08/2026 — o passado fica como esta.
// A trava dura mora na RPC `reconciliar_grade_aluno_v1`, nao aqui.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMUSYS_API = 'https://api.emusys.com.br/v1';

const VERSAO = 'v1';

// Mesmo mapa de `processar-matricula-emusys`. Duplicado de proposito: sao duas
// edges independentes e um import compartilhado criaria acoplamento de deploy
// entre elas por tres linhas de constante.
const ESCOLA_UNIDADE: Record<number, { id: string; nome: string }> = {
  39: { id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Campo Grande' },
  40: { id: '95553e96-971b-4590-a6eb-0201d013c14d', nome: 'Recreio' },
  316: { id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Barra' },
};

function tokenApiEmusys(escolaId: number): string | null {
  if (escolaId === 39) return Deno.env.get('EMUSYS_TOKEN_CG') ?? null;
  if (escolaId === 40) return Deno.env.get('EMUSYS_TOKEN_RECREIO') ?? null;
  if (escolaId === 316) return Deno.env.get('EMUSYS_TOKEN_BARRA') ?? null;
  return null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Worker interno: `verify_jwt = false` no config.toml porque o gateway do Supabase
 * NAO aceita a service key opaca usada entre Edges (mesmo motivo documentado em
 * `transcrever-mensagem-evasao`). A autorizacao acontece aqui, comparando o bearer
 * com a service role key em tempo constante.
 */
export function autenticarServiceRole(
  cabecalho: string | null,
  serviceRoleKey: string,
): boolean {
  if (!cabecalho || !serviceRoleKey) return false;
  const recebido = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
  if (recebido.length !== serviceRoleKey.length) return false;
  let diferenca = 0;
  for (let i = 0; i < recebido.length; i++) {
    diferenca |= recebido.charCodeAt(i) ^ serviceRoleKey.charCodeAt(i);
  }
  return diferenca === 0;
}

function hojeBRT(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split('T')[0];
}

/**
 * Busca as aulas de UMA pessoa na janela. O filtro `pessoa_id` existe no GET /aulas
 * desde a v1.2.0 da API — sem ele seria preciso varrer a unidade inteira (milhares
 * de aulas) para conferir o cronograma de um aluno so.
 */
async function buscarAulasDoAluno(
  token: string,
  pessoaId: number,
  dataIni: string,
  dataFim: string,
): Promise<number[]> {
  const ids: number[] = [];
  let cursor: string | null = null;

  for (let pagina = 0; pagina < 50; pagina++) {
    let url = `${EMUSYS_API}/aulas/?pessoa_id=${pessoaId}`
      + `&data_hora_inicial=${dataIni}T00:00:00&data_hora_final=${dataFim}T23:59:59&limite=100`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const resposta = await fetch(url, { headers: { token } });
    // Erro vira excecao de proposito: quem chama NAO pode tratar falha de rede como
    // "o aluno nao tem aulas". Uma foto parcial cancelaria a grade dele inteira.
    if (!resposta.ok) throw new Error(`Emusys API ${resposta.status} em ${url}`);

    const json = await resposta.json();
    for (const aula of json.items || []) {
      if (typeof aula?.id === 'number') ids.push(aula.id);
    }
    if (json.paginacao?.tem_mais !== true) return ids;
    cursor = json.paginacao?.proximo_cursor || null;
    if (!cursor) return ids;
  }

  // Estourar o teto de paginas significa foto incompleta — mesmo risco de cancelar
  // aula viva. Melhor falhar do que reconciliar com dado pela metade.
  throw new Error('EMUSYS_AULAS_PAGINACAO_EXCEDIDA');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!autenticarServiceRole(req.headers.get('authorization'), SUPABASE_SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: 'nao_autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let corpo: Record<string, unknown> = {};

  try {
    corpo = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'corpo JSON obrigatorio' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const alunoEmusysId = Number(corpo.aluno_emusys_id);
  const escolaId = Number(corpo.escola_id);
  const dias = Math.min(Math.max(Number(corpo.dias ?? 60), 1), 120);
  // Default SEGURO: sem `dry_run: false` explicito, nada e escrito.
  const dryRun = corpo.dry_run !== false;

  const escola = ESCOLA_UNIDADE[escolaId];
  const token = tokenApiEmusys(escolaId);

  if (!Number.isFinite(alunoEmusysId) || alunoEmusysId <= 0 || !escola || !token) {
    return new Response(
      JSON.stringify({ error: 'aluno_emusys_id e escola_id validos sao obrigatorios', escola_id: escolaId }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const dataInicio = hojeBRT();
  const dataFim = somarDias(dataInicio, dias);

  try {
    const idsVivos = await buscarAulasDoAluno(token, alunoEmusysId, dataInicio, dataFim);

    const { data, error } = await supabase.rpc('reconciliar_grade_aluno_v1', {
      p_aluno_emusys_id: alunoEmusysId,
      p_unidade_id: escola.id,
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
      p_ids_vivos: idsVivos,
      p_dry_run: dryRun,
    });
    if (error) throw new Error(`RPC reconciliar_grade_aluno_v1: ${error.message}`);

    const resultado = data as Record<string, unknown>;
    const aplicadas = Number(resultado?.aplicadas ?? 0);

    // So loga quando houve veredito sobre algum slot. Alteracao de matricula que nao
    // mexe em aula (troca de turma, de curso) e o caso MAIS COMUM — 128 de 210
    // eventos em 5 semanas — e encheria o automacao_log de linha vazia.
    const slotsAvaliados = Number(resultado?.slots_avaliados ?? 0);
    if (slotsAvaliados > 0) {
      await supabase.from('automacao_log').insert({
        evento: 'matricula_alterada',
        acao: aplicadas > 0 ? 'grade_reconciliada' : 'grade_avaliada_sem_alteracao',
        aluno_nome: '(omitido)',
        unidade_nome: escola.nome,
        workflow_id: 'reconciliar-grade-aluno',
        execution_id: new Date().toISOString(),
        detalhes: { version: VERSAO, aluno_emusys_id: alunoEmusysId, dry_run: dryRun, ...resultado },
      });
    }

    console.log(
      `[${VERSAO}] aluno ${alunoEmusysId} (${escola.nome}) | vivos=${idsVivos.length} `
      + `slots=${slotsAvaliados} aplicadas=${aplicadas} dry_run=${dryRun}`,
    );

    return new Response(JSON.stringify({ success: true, ...resultado }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`[${VERSAO}] falha para aluno ${alunoEmusysId} (${escola.nome}): ${mensagem}`);

    // Falha aqui NAO pode derrubar o webhook de matricula que chamou. Responde 200
    // com o erro no corpo para o chamador (fire-and-forget) seguir a vida.
    await supabase.from('automacao_log').insert({
      evento: 'matricula_alterada',
      acao: 'grade_reconciliacao_erro',
      aluno_nome: '(omitido)',
      unidade_nome: escola.nome,
      workflow_id: 'reconciliar-grade-aluno',
      execution_id: new Date().toISOString(),
      detalhes: { version: VERSAO, aluno_emusys_id: alunoEmusysId, erro: mensagem },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ success: false, erro: mensagem }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
