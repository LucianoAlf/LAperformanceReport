/// <reference lib="deno.ns" />

// Edge Function: presenca-emusys-escritor
// Escritor unico de presenca no Emusys (API 1.7.0).
// Gatilhos: item_aplicado de aluno (presenca_acao_eventos) e ficha confirmada
// (fabio_registros_aula). O valor escrito e o ESTADO VIGENTE de (aluno, aula),
// nunca o valor do evento. Modo 'sombra' so registra no livro; 'canonico_v2'
// chama o PATCH de verdade. Desenho:
// docs/plans/2026-09-25-presenca-escrita-emusys-desenho.md

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buscarAulaEmusys,
  gravarPresencaAlunoEmusys,
  gravarPresencaProfessorEmusys,
  type EmusysAulaDetalhe,
  type EmusysRespostaAula,
} from '../_shared/emusys-presenca-escrita.ts';
import {
  classificarMarcaEmusys,
  decisaoPrecoceAluno,
  decidirEscritaAluno,
  decidirEscritaProfessor,
  type DecisaoEscrita,
  type MarcaEmusys,
} from '../_shared/presenca-escrita-decisao.ts';
import { EmusysApiError } from '../_shared/emusys-aulas.ts';
import { tokensIguaisEmTempoConstante } from '../_shared/sync-presenca-authorization.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const UNIDADES = [
  { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', tokenEnv: 'EMUSYS_TOKEN_CG' },
  { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', tokenEnv: 'EMUSYS_TOKEN_BARRA' },
  { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', tokenEnv: 'EMUSYS_TOKEN_RECREIO' },
] as const;

const INTERVALO_CHAMADAS_MS = 1100;
const LIMITE_GATILHOS_POR_UNIDADE = 200;
const LOOKBACK_DIAS_PADRAO = 7;
// A edge morre aos ~150s. Para de abrir gatilho novo aos 120s e devolve
// truncado:true — a proxima chamada (cron/loop) continua de onde parou,
// porque o gatilho so sai da fila quando grava linha no livro.
const ORCAMENTO_MS = 120_000;

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A API do Emusys responde 500 em rajada (~120 chamadas). Pausa fixa entre
// chamadas + recuo exponencial em 5xx/429. Erro transitorio NAO grava linha
// no livro — o gatilho volta na proxima varredura.
let ultimoToque = 0;
async function comRitmoERetry<T>(chamada: () => Promise<T>): Promise<T> {
  const tentativas = [0, 2000, 5000, 10000];
  let ultimoErro: unknown;
  for (const esperaExtra of tentativas) {
    const agora = Date.now();
    const pausa = INTERVALO_CHAMADAS_MS - (agora - ultimoToque) + esperaExtra;
    if (pausa > 0) await sleep(pausa);
    try {
      const resultado = await chamada();
      ultimoToque = Date.now();
      return resultado;
    } catch (erro) {
      ultimoToque = Date.now();
      ultimoErro = erro;
      const transitorio =
        erro instanceof EmusysApiError && (erro.status >= 500 || erro.status === 429);
      if (!transitorio) throw erro;
    }
  }
  throw ultimoErro;
}

type EventoAluno = {
  id: number;
  request_id: string;
  unidade_id: string;
  aula_id: number;
  aluno_id: number;
  fonte: string;
  status_novo: string;
};

type FichaProfessor = {
  id: string;
  aula_id: number;
  professor_id: number;
  unidade_id: string;
  status: string;
};

function linhaAlunoDaAula(aula: EmusysAulaDetalhe, alunoEmusysId: number | null) {
  const alunos = Array.isArray(aula.alunos) ? aula.alunos : [];
  if (alunoEmusysId == null) return { linha: null, identidadeOk: false };
  const linha = alunos.find((item) => item?.id_aluno === alunoEmusysId) ?? null;
  return { linha, identidadeOk: linha !== null };
}

function marcaDaLinha(linha: {
  presenca?: string | null;
  horario_presenca?: string | null;
} | null): MarcaEmusys {
  return classificarMarcaEmusys(linha?.presenca, linha?.horario_presenca);
}

// O PATCH sem `horario` escreve presenca/ausente mas NAO carimba
// horario_presenca — a linha continuaria lendo como "sem resposta" para o
// nosso proprio classificador. Mandamos o horario AGENDADO da aula
// (data_hora_inicio, "2026-09-25 10:00" -> "10:00"), mesmo carimbo que a
// tela do Emusys grava numa marca humana.
function horarioAgendado(aula: EmusysAulaDetalhe): string | undefined {
  const dh = aula.data_hora_inicio;
  if (typeof dh !== 'string') return undefined;
  return dh.match(/\b(\d{2}:\d{2})/)?.[1];
}

// A agenda gera varios item_aplicado por marca (um por sub-tarefa da ficha)
// e o GET /aula fica cacheado com o estado ANTERIOR ao PATCH: sem refletir
// a escrita, o proximo evento do mesmo par nesta execucao rele
// 'sem_resposta' e repete o PATCH — producao mediu ate 8 escritas iguais
// por marca. Copiado o estado novo para a linha cacheada, o evento seguinte
// cai em ja_coerente: 'presente' direto pela marca; 'ausente' (que a API
// nunca carimba) via ultimaEscritaNossa no livro.
function refletirEscritaAluno(
  cache: Map<number, EmusysRespostaAula | EmusysApiError>,
  aulaApiId: number,
  alunoEmusysId: number,
  resposta: EmusysRespostaAula,
  presente: boolean,
): void {
  const hit = cache.get(aulaApiId);
  if (!hit || hit instanceof EmusysApiError) return;
  const linha = (hit.aula.alunos ?? []).find((i) => i?.id_aluno === alunoEmusysId);
  if (!linha) return;
  const linhaResp = (resposta.aula.alunos ?? [])
    .find((i) => i?.id_aluno === alunoEmusysId);
  linha.presenca = linhaResp?.presenca ?? (presente ? 'presente' : 'ausente');
  // O horario em si nao importa — so alimenta o classificador. 'ausente'
  // nunca carimba na API; em 'presente' sem carimbo na resposta usamos um
  // placeholder para o cache ler 'presente' e nao 'sem_resposta'.
  linha.horario_presenca = linhaResp?.horario_presenca ?? (presente ? '00:00' : null);
}

function refletirEscritaProfessor(
  cache: Map<number, EmusysRespostaAula | EmusysApiError>,
  aulaApiId: number,
  professorEmusysId: number,
  resposta: EmusysRespostaAula,
  presente: boolean,
): void {
  const hit = cache.get(aulaApiId);
  if (!hit || hit instanceof EmusysApiError) return;
  const alvo = [hit.aula.professor, ...(hit.aula.professores ?? [])]
    .find((p) => p?.id === professorEmusysId);
  if (!alvo) return;
  const profResp = [resposta.aula.professor, ...(resposta.aula.professores ?? [])]
    .find((p) => p?.id === professorEmusysId);
  alvo.presenca = profResp?.presenca ?? (presente ? 'presente' : 'ausente');
  alvo.horario_presenca = profResp?.horario_presenca ?? (presente ? '00:00' : null);
}

// "Marca nossa" = ultimo 'escrito' do livro para o mesmo ALVO de PATCH
// (linha_emusys_id). Gatilhos distintos (mestre x individual) convergem na
// mesma linha, entao a chave e o alvo, nao a aula do gatilho.
async function ultimaEscritaNossa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  alvoEmusysId: number,
  alunoId: number | null,
  professorId: number | null,
): Promise<{ presente: boolean } | null> {
  let query = supabase
    .from('presenca_emusys_escrita')
    .select('presente')
    .eq('linha_emusys_id', alvoEmusysId)
    .eq('decisao', 'escrito')
    .order('id', { ascending: false })
    .limit(1);
  if (alunoId != null) query = query.eq('aluno_id', alunoId);
  if (professorId != null) query = query.eq('professor_id', professorId).is('aluno_id', null);
  const { data } = await query;
  const linha = Array.isArray(data) ? data[0] : null;
  return linha && typeof linha.presente === 'boolean' ? { presente: linha.presente } : null;
}

async function registrarLivro(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  linha: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('presenca_emusys_escrita').insert(linha);
  if (error) {
    // unique do gatilho: outra execucao ja registrou — idempotencia, nao erro.
    if (String(error.code) === '23505') return;
    throw new Error(`LIVRO_GRAVACAO_FALHOU:${error.message}`);
  }
}

async function processarEventosAluno(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  unidade: (typeof UNIDADES)[number],
  token: string,
  modo: 'sombra' | 'ativo',
  lookbackIso: string,
  resumo: Record<string, number>,
  inicio: number,
): Promise<void> {
  // Fila correta: primeiro os ids da janela (barato), depois corta os que ja
  // tem linha no livro e SO ENTAO limita. Sem isso, quando os 200 mais
  // antigos estivessem processados a funcao nao veria nunca os eventos 201+.
  const { data: idRows } = await supabase
    .from('presenca_acao_eventos')
    .select('id')
    .eq('tipo', 'item_aplicado')
    .eq('unidade_id', unidade.id)
    .not('aluno_id', 'is', null)
    .not('aula_id', 'is', null)
    .gte('criado_em', lookbackIso)
    .order('id', { ascending: true })
    .limit(2000);
  const todosIds = (idRows ?? []).map((r: { id: number }) => r.id);
  if (!todosIds.length) return;

  const { data: jaLancados } = await supabase
    .from('presenca_emusys_escrita')
    .select('presenca_evento_id,decisao')
    .eq('unidade_id', unidade.id)
    .not('presenca_evento_id', 'is', null)
    .gte('criado_em', lookbackIso);
  // Em modo ativo, 'seria_escrito' NAO encerra o gatilho: a sombra previu a
  // escrita mas nao a fez — o item volta a ser pendente e desta vez vai de
  // verdade. As demais decisoes (escrito, ja_coerente, pulado_*, conflito)
  // sao terminais nos dois modos.
  const processados = new Set(
    (jaLancados ?? [])
      .filter((l: { decisao: string }) => modo !== 'ativo' || l.decisao !== 'seria_escrito')
      .map((l: { presenca_evento_id: number }) => l.presenca_evento_id),
  );
  const pendentesIds = todosIds.filter((id: number) => !processados.has(id))
    .slice(0, LIMITE_GATILHOS_POR_UNIDADE);
  if (!pendentesIds.length) return;

  const { data: eventos } = await supabase
    .from('presenca_acao_eventos')
    .select('id,request_id,unidade_id,aula_id,aluno_id,fonte,status_novo')
    .in('id', pendentesIds)
    .order('id', { ascending: true });
  const pendentes = (eventos ?? []) as EventoAluno[];

  const alunoIds = [...new Set(pendentes.map((i) => i.aluno_id))];
  const aulaIds = [...new Set(pendentes.map((i) => i.aula_id))];

  const { data: presencas } = await supabase
    .from('aluno_presenca')
    .select('aluno_id,aula_emusys_id,status_presenca,respondido_por')
    .in('aluno_id', alunoIds)
    .in('aula_emusys_id', aulaIds);
  const vigente = new Map<string, { status_presenca: string | null; respondido_por: string | null }>();
  for (const p of presencas ?? []) {
    vigente.set(`${p.aluno_id}:${p.aula_emusys_id}`, {
      status_presenca: p.status_presenca,
      respondido_por: p.respondido_por,
    });
  }

  // O aula_id do evento e o id INTERNO de aulas_emusys (convencao de
  // aluno_presenca). O Emusys so conhece aulas_emusys.emusys_id.
  const { data: aulasRows } = await supabase
    .from('aulas_emusys')
    .select('id,emusys_id')
    .in('id', aulaIds);
  const emusysPorAula = new Map<number, number>(
    (aulasRows ?? []).filter((a: { emusys_id: number | null }) => a.emusys_id != null)
      .map((a: { id: number; emusys_id: number }) => [a.id, a.emusys_id]),
  );

  // O aluno_id do evento e o id interno de alunos. O id_aluno do payload
  // Emusys mora no vinculo canonico aula_alunos_emusys (mesma aula interna).
  const { data: vinculos } = await supabase
    .from('aula_alunos_emusys')
    .select('aula_emusys_id,aluno_id,aluno_emusys_id')
    .in('aula_emusys_id', aulaIds)
    .in('aluno_id', alunoIds);
  const emusysPorPar = new Map<string, number>();
  for (const v of vinculos ?? []) {
    if (v.aluno_emusys_id != null) {
      emusysPorPar.set(`${v.aluno_id}:${v.aula_emusys_id}`, v.aluno_emusys_id);
    }
  }

  // Flags da linha individual (justificada/cancelada) moram no espelho
  // aulas_emusys da linha — busca preguiçosa por emusys_id quando a linha
  // alvo difere da aula lida (turma -> individual). emusys_id se repete
  // entre unidades (tenants separados): SEMPRE filtrar a unidade, e sem
  // espelho da linha o retorno e null — na duvida, o chamador protege.
  const flagsLinhaCache = new Map<number, { justificada: boolean; cancelada: boolean } | null>();
  async function flagsDaLinha(
    linhaAulaId: number,
  ): Promise<{ justificada: boolean; cancelada: boolean } | null> {
    if (flagsLinhaCache.has(linhaAulaId)) return flagsLinhaCache.get(linhaAulaId) ?? null;
    const { data } = await supabase
      .from('aulas_emusys')
      .select('justificada,cancelada')
      .eq('emusys_id', linhaAulaId)
      .eq('unidade_id', unidade.id)
      .maybeSingle();
    const flags = data == null
      ? null
      : { justificada: Boolean(data.justificada), cancelada: Boolean(data.cancelada) };
    flagsLinhaCache.set(linhaAulaId, flags);
    return flags;
  }

  // GET /aula cacheado por aulaApiId: uma turma com N alunos faz UM GET.
  // Erro <500 tambem cacheia (mesma aula = mesmo 400), sem re-chamar a API.
  const aulaCache = new Map<number, EmusysRespostaAula | EmusysApiError>();
  async function lerAula(aulaApiId: number): Promise<EmusysRespostaAula> {
    const hit = aulaCache.get(aulaApiId);
    if (hit) {
      if (hit instanceof EmusysApiError) throw hit;
      return hit;
    }
    try {
      const leitura = await comRitmoERetry(() => buscarAulaEmusys({ token, aulaId: aulaApiId }));
      aulaCache.set(aulaApiId, leitura);
      return leitura;
    } catch (erro) {
      if (erro instanceof EmusysApiError) aulaCache.set(aulaApiId, erro);
      throw erro;
    }
  }

  for (const evento of pendentes) {
    if (Date.now() - inicio > ORCAMENTO_MS) {
      resumo.truncado = 1;
      return;
    }
    const atual = vigente.get(`${evento.aluno_id}:${evento.aula_id}`) ?? null;
    const estadoVigente = atual?.status_presenca ?? null;
    const fonte = atual?.respondido_por ?? evento.fonte;

    const base = {
      request_id: evento.request_id,
      presenca_evento_id: evento.id,
      unidade_id: evento.unidade_id,
      aula_emusys_id: evento.aula_id,
      aluno_id: evento.aluno_id,
      alvo: 'aluno',
      estado_vigente: estadoVigente,
      fonte_decisao: fonte,
      modo,
    };

    // Estado vigente que ja exclui escrita dispensa ate o GET: nao ha PATCH
    // possivel para justificada/cancelada e anti-laco nao le o Emusys.
    const precoce = decisaoPrecoceAluno(estadoVigente, fonte);
    if (precoce && precoce.acao === 'pular') {
      await registrarLivro(supabase, { ...base, decisao: precoce.decisao, motivo: precoce.motivo });
      resumo[precoce.decisao] = (resumo[precoce.decisao] ?? 0) + 1;
      continue;
    }

    const aulaApiId = emusysPorAula.get(evento.aula_id) ?? null;
    const alunoEmusysId = emusysPorPar.get(`${evento.aluno_id}:${evento.aula_id}`) ?? null;
    if (aulaApiId == null || alunoEmusysId == null) {
      const motivo = aulaApiId == null ? 'aula_sem_emusys_id' : 'aluno_sem_vinculo_emusys';
      await registrarLivro(supabase, {
        ...base, decisao: 'pulado_identidade_divergente', motivo,
      });
      resumo.pulado_identidade_divergente = (resumo.pulado_identidade_divergente ?? 0) + 1;
      continue;
    }

    let leitura: EmusysRespostaAula;
    try {
      leitura = await lerAula(aulaApiId);
    } catch (erro) {
      if (erro instanceof EmusysApiError && erro.status < 500) {
        await registrarLivro(supabase, { ...base, decisao: 'erro', motivo: `get_aula_http_${erro.status}` });
        resumo.erro = (resumo.erro ?? 0) + 1;
        continue;
      }
      throw erro;
    }

    const aula = leitura.aula;
    const { linha } = linhaAlunoDaAula(aula, alunoEmusysId);
    // O alvo do PATCH e a LINHA do aluno (alunos[].aula_id), nunca a mestre.
    // Sem linha ou sem aula_id na linha nao existe alvo: identidade falha.
    const linhaAulaId = linha?.aula_id ?? null;
    const identidadeOk = linha !== null && linhaAulaId != null;
    const linhaEhPropriaAula = linhaAulaId != null && linhaAulaId === aula.id;
    const flagsLinha = linhaAulaId == null || linhaEhPropriaAula
      ? { justificada: Boolean(aula.justificada), cancelada: Boolean(aula.cancelada) }
      : await flagsDaLinha(linhaAulaId);
    // Sem espelho confiavel da linha nao da para saber se ela e justificada/
    // cancelada — na duvida a linha e protegida e nada se escreve.
    if (flagsLinha === null) {
      await registrarLivro(supabase, {
        ...base, decisao: 'pulado_linha_protegida', motivo: 'espelho_linha_indefinido',
        linha_emusys_id: linhaAulaId,
      });
      resumo.pulado_linha_protegida = (resumo.pulado_linha_protegida ?? 0) + 1;
      continue;
    }

    const estadoAntes = {
      aula_get_id: aulaApiId,
      aula_cancelada: Boolean(aula.cancelada),
      aula_justificada: Boolean(aula.justificada),
      linha,
      linha_flags: flagsLinha,
    };
    const marca = marcaDaLinha(linha);
    const ultima = linhaAulaId == null
      ? null
      : await ultimaEscritaNossa(supabase, linhaAulaId, evento.aluno_id, null);

    const decisao = decidirEscritaAluno({
      estadoVigente,
      fonte,
      linhaJustificada: flagsLinha.justificada,
      linhaCancelada: flagsLinha.cancelada,
      aulaCancelada: Boolean(aula.cancelada),
      identidadeOk,
      marca,
      ultimaEscrita: ultima,
    });

    if (decisao.acao === 'pular') {
      await registrarLivro(supabase, {
        ...base, decisao: decisao.decisao, motivo: decisao.motivo,
        linha_emusys_id: linhaAulaId, estado_antes: estadoAntes,
      });
      resumo[decisao.decisao] = (resumo[decisao.decisao] ?? 0) + 1;
      continue;
    }

    if (modo === 'sombra') {
      await registrarLivro(supabase, {
        ...base, decisao: 'seria_escrito', motivo: decisao.motivo,
        presente: decisao.presente, linha_emusys_id: linhaAulaId, estado_antes: estadoAntes,
      });
      resumo.seria_escrito = (resumo.seria_escrito ?? 0) + 1;
      continue;
    }

    try {
      const resposta = await comRitmoERetry(() =>
        gravarPresencaAlunoEmusys({
          token, aulaId: linhaAulaId!, presente: decisao.presente,
          horario: horarioAgendado(aula),
        }));
      await registrarLivro(supabase, {
        ...base, decisao: 'escrito', motivo: decisao.motivo,
        presente: decisao.presente, linha_emusys_id: linhaAulaId,
        estado_antes: estadoAntes, resposta: resposta.bruto,
      });
      resumo.escrito = (resumo.escrito ?? 0) + 1;
      refletirEscritaAluno(aulaCache, aulaApiId, alunoEmusysId, resposta, decisao.presente);
    } catch (erro) {
      if (erro instanceof EmusysApiError && erro.status < 500) {
        await registrarLivro(supabase, {
          ...base, decisao: 'erro', motivo: `patch_aluno_http_${erro.status}`,
          presente: decisao.presente, linha_emusys_id: linhaAulaId, estado_antes: estadoAntes,
        });
        resumo.erro = (resumo.erro ?? 0) + 1;
        continue;
      }
      throw erro;
    }
  }
}

async function processarFichasProfessor(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  unidade: (typeof UNIDADES)[number],
  token: string,
  modo: 'sombra' | 'ativo',
  lookbackIso: string,
  resumo: Record<string, number>,
  inicio: number,
): Promise<void> {
  // Mesma fila correta do aluno: ids da janela -> corta processados -> limita.
  const { data: idRows } = await supabase
    .from('fabio_registros_aula')
    .select('id')
    .eq('unidade_id', unidade.id)
    .in('status', ['confirmado', 'gravado_emusys'])
    .not('aula_id', 'is', null)
    .gte('atualizado_em', lookbackIso)
    .order('id', { ascending: true })
    .limit(2000);
  const todosIds = (idRows ?? []).map((r: { id: string }) => r.id);
  if (!todosIds.length) return;

  const { data: jaLancados } = await supabase
    .from('presenca_emusys_escrita')
    .select('ficha_id,decisao')
    .eq('unidade_id', unidade.id)
    .not('ficha_id', 'is', null)
    .gte('criado_em', lookbackIso);
  const processados = new Set(
    (jaLancados ?? [])
      .filter((l: { decisao: string }) => modo !== 'ativo' || l.decisao !== 'seria_escrito')
      .map((l: { ficha_id: string }) => l.ficha_id),
  );
  const pendentesIds = todosIds.filter((id: string) => !processados.has(id))
    .slice(0, LIMITE_GATILHOS_POR_UNIDADE);
  if (!pendentesIds.length) return;

  const { data: fichas } = await supabase
    .from('fabio_registros_aula')
    .select('id,aula_id,professor_id,unidade_id,status')
    .in('id', pendentesIds)
    .order('id', { ascending: true });
  const pendentes = (fichas ?? []) as FichaProfessor[];

  const professorIds = [...new Set(pendentes.map((i) => i.professor_id).filter(Boolean))];
  const aulaIds = [...new Set(pendentes.map((i) => i.aula_id))];

  // aula_id da ficha e id INTERNO de aulas_emusys; o Emusys usa emusys_id.
  const { data: aulasRows } = await supabase
    .from('aulas_emusys')
    .select('id,emusys_id')
    .in('id', aulaIds);
  const emusysPorAula = new Map<number, number>(
    (aulasRows ?? []).filter((a: { emusys_id: number | null }) => a.emusys_id != null)
      .map((a: { id: number; emusys_id: number }) => [a.id, a.emusys_id]),
  );

  // professor_id da ficha e id interno; o id do professor no Emusys mora no
  // vinculo por unidade (professores_unidades via vw_professores_emusys_vinculos).
  const { data: vinculosProf } = await supabase
    .from('vw_professores_emusys_vinculos')
    .select('professor_id,emusys_professor_id,qualidade_vinculo')
    .eq('unidade_id', unidade.id)
    .in('professor_id', professorIds);
  const emusysPorProfessor = new Map<number, number>(
    (vinculosProf ?? [])
      .filter((v: { emusys_professor_id: number | null; qualidade_vinculo: string }) =>
        v.emusys_professor_id != null && v.qualidade_vinculo === 'vinculo_utilizavel')
      .map((v: { professor_id: number; emusys_professor_id: number }) => [v.professor_id, v.emusys_professor_id]),
  );

  const aulaCache = new Map<number, EmusysRespostaAula | EmusysApiError>();
  async function lerAula(aulaApiId: number): Promise<EmusysRespostaAula> {
    const hit = aulaCache.get(aulaApiId);
    if (hit) {
      if (hit instanceof EmusysApiError) throw hit;
      return hit;
    }
    try {
      const leitura = await comRitmoERetry(() => buscarAulaEmusys({ token, aulaId: aulaApiId }));
      aulaCache.set(aulaApiId, leitura);
      return leitura;
    } catch (erro) {
      if (erro instanceof EmusysApiError) aulaCache.set(aulaApiId, erro);
      throw erro;
    }
  }

  for (const ficha of pendentes) {
    if (Date.now() - inicio > ORCAMENTO_MS) {
      resumo.truncado = 1;
      return;
    }
    const professorEmusysId = emusysPorProfessor.get(ficha.professor_id) ?? null;
    const aulaApiId = emusysPorAula.get(ficha.aula_id) ?? null;
    const base = {
      ficha_id: ficha.id,
      unidade_id: ficha.unidade_id,
      aula_emusys_id: ficha.aula_id,
      professor_id: ficha.professor_id,
      alvo: 'professor',
      estado_vigente: 'ficha_confirmada',
      fonte_decisao: 'fabio_registros_aula',
      modo,
    };

    if (professorEmusysId == null || aulaApiId == null) {
      const motivo = professorEmusysId == null
        ? 'professor_sem_vinculo_utilizavel'
        : 'aula_sem_emusys_id';
      await registrarLivro(supabase, {
        ...base, decisao: 'pulado_identidade_divergente', motivo,
      });
      resumo.pulado_identidade_divergente = (resumo.pulado_identidade_divergente ?? 0) + 1;
      continue;
    }

    let leitura: EmusysRespostaAula;
    try {
      leitura = await lerAula(aulaApiId);
    } catch (erro) {
      if (erro instanceof EmusysApiError && erro.status < 500) {
        await registrarLivro(supabase, { ...base, decisao: 'erro', motivo: `get_aula_http_${erro.status}` });
        resumo.erro = (resumo.erro ?? 0) + 1;
        continue;
      }
      throw erro;
    }

    const aula = leitura.aula;
    const professorNaAula = aula.professor?.id === professorEmusysId
      ? aula.professor
      : (Array.isArray(aula.professores)
        ? aula.professores.find((p) => p?.id === professorEmusysId) ?? null
        : null);
    const identidadeOk = professorNaAula?.id === professorEmusysId;
    const estadoAntes = {
      aula_get_id: aulaApiId,
      aula_cancelada: Boolean(aula.cancelada),
      professor: professorNaAula,
    };
    const marca = marcaDaLinha(professorNaAula);
    const ultima = await ultimaEscritaNossa(supabase, aulaApiId, null, ficha.professor_id);

    const decisao: DecisaoEscrita = decidirEscritaProfessor({
      aulaCancelada: Boolean(aula.cancelada),
      identidadeOk,
      marca,
      ultimaEscrita: ultima,
    });

    if (decisao.acao === 'pular') {
      await registrarLivro(supabase, {
        ...base, decisao: decisao.decisao, motivo: decisao.motivo,
        linha_emusys_id: aulaApiId, estado_antes: estadoAntes,
      });
      resumo[decisao.decisao] = (resumo[decisao.decisao] ?? 0) + 1;
      continue;
    }

    if (modo === 'sombra') {
      await registrarLivro(supabase, {
        ...base, decisao: 'seria_escrito', motivo: decisao.motivo,
        presente: decisao.presente, linha_emusys_id: aulaApiId, estado_antes: estadoAntes,
      });
      resumo.seria_escrito = (resumo.seria_escrito ?? 0) + 1;
      continue;
    }

    try {
      const resposta = await comRitmoERetry(() =>
        gravarPresencaProfessorEmusys({
          token, aulaId: aulaApiId, professorId: professorEmusysId,
          presente: decisao.presente, horario: horarioAgendado(aula),
        }));
      await registrarLivro(supabase, {
        ...base, decisao: 'escrito', motivo: decisao.motivo,
        presente: decisao.presente, linha_emusys_id: aulaApiId,
        estado_antes: estadoAntes, resposta: resposta.bruto,
      });
      resumo.escrito = (resumo.escrito ?? 0) + 1;
      refletirEscritaProfessor(aulaCache, aulaApiId, professorEmusysId, resposta, decisao.presente);
    } catch (erro) {
      if (erro instanceof EmusysApiError && erro.status < 500) {
        await registrarLivro(supabase, {
          ...base, decisao: 'erro', motivo: `patch_professor_http_${erro.status}`,
          presente: decisao.presente, linha_emusys_id: aulaApiId, estado_antes: estadoAntes,
        });
        resumo.erro = (resumo.erro ?? 0) + 1;
        continue;
      }
      throw erro;
    }
  }
}

serve(async (requisicao) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth interna (mesmo padrao do sync-presenca-emusys):
  // 1) Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
  // 2) x-sync-token do vault (sync_presenca_edge_token), validado por RPC —
  //    e o caminho usado por pg_cron e n8n.
  const bearer = requisicao.headers.get('authorization')?.match(/^Bearer[\t ]+([^\s]+)$/i)?.[1] ?? '';
  const syncToken = requisicao.headers.get('x-sync-token')?.trim() ?? '';
  let autorizado = bearer.length > 0 && await tokensIguaisEmTempoConstante(bearer, SERVICE_KEY);
  if (!autorizado && syncToken) {
    const { data, error } = await supabase.rpc(
      'validar_token_sync_presenca_interno_v1',
      { p_token: syncToken },
    );
    autorizado = !error && data === true;
  }
  if (!autorizado) {
    return respostaJson({ erro: 'NAO_AUTENTICADO' }, 401);
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = await requisicao.json();
  } catch {
    corpo = {};
  }
  const lookbackDias = typeof corpo.lookback_dias === 'number' && corpo.lookback_dias > 0
    ? corpo.lookback_dias
    : LOOKBACK_DIAS_PADRAO;
  const lookbackIso = new Date(Date.now() - lookbackDias * 86400_000).toISOString();
  const unidadeFiltro = typeof corpo.unidade_id === 'string' ? corpo.unidade_id : null;
  const inicio = Date.now();

  const { data: config } = await supabase
    .from('presenca_rollout_config')
    .select('unidade_id,modo')
    .eq('superficie', 'emusys_escrita');
  const modoPorUnidade = new Map<string, string>(
    (config ?? []).map((c: { unidade_id: string; modo: string }) => [c.unidade_id, c.modo]),
  );

  const resultado: Record<string, unknown> = {};
  for (const unidade of UNIDADES) {
    if (unidadeFiltro && unidade.id !== unidadeFiltro) continue;
    const modoConfig = modoPorUnidade.get(unidade.id);
    if (!modoConfig) continue; // sem linha de rollout: unidade fora do escritor
    const modo = modoConfig === 'canonico_v2' ? 'ativo' : 'sombra';
    const token = Deno.env.get(unidade.tokenEnv)?.trim();
    if (!token) {
      resultado[unidade.nome] = { erro: `TOKEN_AUSENTE:${unidade.tokenEnv}` };
      continue;
    }
    // Lease por unidade: o trigger dispara uma execucao por marca, entao duas
    // invocacoes podem se sobrepor. Sem trava, as duas varrem a mesma fila e
    // mandam o mesmo PATCH (o segundo some no 23505 e ainda conta na rajada
    // do Emusys). Lease com expiracao: se o dono morrer, a trava vence sozinha
    // e o sweeper retoma. Nao usar advisory lock de sessao — o pool do
    // PostgREST pode soltar o unlock em outra conexao.
    const dono = crypto.randomUUID();
    const { data: travou } = await supabase.rpc('fn_presenca_escritor_trava', {
      p_unidade: unidade.id,
      p_dono: dono,
      p_ttl_segundos: 200,
    });
    if (travou !== true) {
      resultado[unidade.nome] = { modo, em_execucao: 1 };
      continue;
    }
    try {
      const resumo: Record<string, number> = {};
      await processarEventosAluno(supabase, unidade, token, modo, lookbackIso, resumo, inicio);
      if (resumo.truncado) {
        resultado[unidade.nome] = { modo, ...resumo };
        break;
      }
      await processarFichasProfessor(supabase, unidade, token, modo, lookbackIso, resumo, inicio);
      resultado[unidade.nome] = { modo, ...resumo };
      if (resumo.truncado) break;
    } finally {
      await supabase.rpc('fn_presenca_escritor_destrava', {
        p_unidade: unidade.id,
        p_dono: dono,
      });
    }
  }

  return respostaJson({ ok: true, lookback_dias: lookbackDias, unidades: resultado });
});
