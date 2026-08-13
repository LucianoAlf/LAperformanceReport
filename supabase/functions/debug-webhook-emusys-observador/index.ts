/// <reference lib="deno.ns" />

// Edge Function: debug-webhook-emusys-observador
//
// [v1] Observador temporário: recebia webhooks do Emusys (matrícula, lead ou
// experimental) em paralelo ao n8n e SÓ gravava o payload bruto em automacao_log.
//
// [v2 — 2026-07-28] Passou a também PROCESSAR os eventos de lead e de aula
// experimental, reimplementando em TypeScript o que o n8n faz. Matrícula NÃO é
// processada aqui — o webhook CHEGA e vira log bruto, mas quem processa é a edge
// `processar-matricula-emusys` (o Emusys dispara para os dois endereços).
// ⚠️ Até 12/08/2026 este comentário dizia "segue no n8n", o que era falso: a edge
// dedicada assumiu matrícula e o log prova (`workflow_id='processar-matricula-emusys'`
// em 100% das ações reais de matrícula).
//
// [v3 — 2026-07-29] A reimplementação foi DESFEITA. Dois dias de sombra mostraram
// que ela regredia em três frentes (50% das experimentais sem lead, curso NULL em
// toda Campo Grande, chave de upsert errada). Lidos os workflows na fonte, o n8n
// não tem lógica própria: ele chama duas RPCs canônicas. Agora o observador chama
// AS MESMAS RPCs, com os mesmos argumentos — a única diferença é o resolvedor de
// professor. Assim a paridade é por construção, não por transcrição.
//
//   lead        -> upsert_lead(..., 'emusys', ...)      [workflow EB0LibpOJCLhKp7M]
//   experimental-> registrar_experimental(...)          [workflow j41tPbyjGXUQUxrN]
//
// O que o observador ADICIONA sobre o n8n (regra do dono: "pode adicionar, remover não"):
//   1. Professor por TELEFONE + ativo=true. O n8n usa
//      `professores.nome ILIKE '%'||$1||'%'` sem filtrar ativo, e cai em cadastro
//      mesclado/inativo (Erick 54 em vez de 52).
//   2. Campos que o n8n descarta: agente_comercial (nome_atendente),
//      motivo_arquivamento e etapa_pipeline_id derivada do estágio do funil.
//      Aplicados DEPOIS da RPC, como delta, sem tocar no que ela gravou.
//   3. Etapa do pipeline nunca regride (ORDEM_ETAPA): webhook atrasado não rebaixa lead.
//   4. [v5] Professor por `aula.professor_id` (emusys_id) quando vier — match exato,
//      antes de cair na heurística de telefone/nome.
//   5. [v5] `observacoes` da experimental gravada em lead_experimentais (coluna existia e
//      estava 0 de 311 preenchida; a RPC não tem parâmetro para ela).
//
// [v4 — 2026-07-30] Adicionado lead_arquivado (workflow EB0LibpOJCLhKp7M, nó "Arquivar
// Lead no Supabase"). Esse nó não chama nenhuma RPC — é um UPDATE direto (arquivado=true,
// status='arquivado', etapa=11, motivo, data), casando por unidade + status NOT IN
// (convertido, matriculado) + (emusys_lead_id OU telefone). Mesmo critério aqui, via
// client parametrizado do Supabase (o nó do n8n monta o SQL por interpolação de string —
// risco de injection que não é replicado). Objetivo: fechar a paridade dos 3 eventos de
// lead pra eventualmente tirar todos do n8n juntos, não só lead_criado/lead_editado.
//
// [v5 — 2026-08-04] LIBERAÇÃO POR EVENTO. Antes o interruptor era tudo-ou-nada:
// OBSERVADOR_DRY_RUN=false ligava a escrita de lead + experimental + arquivamento de
// uma vez. Como a migração do n8n vai ser gradual (começando pela experimental, que é
// 8% do volume), agora dá para liberar evento por evento — sem redeploy, só variável.
//
//   OBSERVADOR_ESCREVE ausente/vazio ....... nada escreve (comportamento de hoje)
//   OBSERVADOR_ESCREVE=aula_experimental_criada,aula_experimental_reagendada,
//                      aula_experimental_cancelada ..... só experimental escreve
//   OBSERVADOR_ESCREVE=*  (ou 'todos') ..... tudo escreve
//
// Compatibilidade: se OBSERVADOR_ESCREVE não existir e OBSERVADOR_DRY_RUN=false,
// vale o comportamento antigo (escreve tudo). O default segue sendo NÃO escrever.
//
// ⚠️ Ordem da virada: liberar aqui PRIMEIRO, confirmar que gravou, e só então desligar
// o ramo correspondente no n8n. O inverso abre uma janela sem ninguém escrevendo, e o
// Emusys não reenvia. Durante a sobreposição os dois escrevem e isso é seguro — o
// dedup da registrar_experimental é por (lead, data, horário, curso) e o
// emusys_aula_id usa COALESCE, então o segundo a chegar vira UPDATE.
//
// [v6 — 2026-08-04] REAGENDAMENTO PASSA A ENCERRAR A LINHA QUE SUBSTITUIU. Até aqui,
// `aula_experimental_reagendada` era tratado como um agendamento qualquer: a RPC não
// achava a chave (porque foi justamente ela que mudou), inseria linha nova e a antiga
// ficava viva e agendada. Dois casos reais na agenda desta semana — Rafael Alberigi
// (05/08 -> 12/08) e Beatriz Romero (Teclado -> Guitarra no mesmo horário) — apareciam
// duas vezes, uma delas numa aula que não vai acontecer. Ver
// `encerrarExperimentaisSubstituidas` para a regra e por que a grade é quem decide.
//
// OBSERVADOR_TOKEN (opcional): quando definido, exige o mesmo valor em
// `x-observador-token` (header) ou `?token=` (query). Enquanto NÃO estiver definido, a
// verificação fica desligada — de propósito, para o deploy não derrubar o webhook antes
// de a gente saber se o Emusys consegue mandar header custom.
// ⚠️ Sem token e escrevendo de verdade, o endereço é público e grava em `leads`.
//
// Em modo sombra roda um preview só de leitura, que replica o matching das RPCs para o
// diff, e registra em automacao_log o que faria.
// ⚠️ O preview é diagnóstico; quem escreve é a RPC. Se os dois divergirem, a RPC vale.
//
// [v7 — 2026-08-05] FALLBACK DE LEAD SEM TELEFONE NA EXPERIMENTAL. Uma
// aula_experimental_criada sem telefone (nem do aluno, nem do responsável) e sem lead
// pra vincular era descartada silenciosamente (mesma regra do n8n). Agora cria um lead
// mínimo pelo emusys_lead_id da própria aula e tenta de novo, garantindo que a
// experimental sempre seja registrada. Adiciona também detecção pós-RPC de colisão de
// telefone em processarLead (upsert_lead nunca lança exceção nesse caso, só mantém o
// telefone atual em silêncio) — vira status=warn pra revisão manual.
// Ver docs/superpowers/specs/2026-08-05-experimental-sem-telefone-lead-fallback-design.md
//
// [v8 — 2026-08-06] RETRY CONTRA A CORRIDA COM O WEBHOOK DE LEAD. O Emusys às vezes manda a
// experimental ANTES do evento do lead (quem cadastra a pessoa e marca a aula no mesmo gesto),
// e a `registrar_experimental` recusa com `lead_not_found` porque o lead ainda não existe do
// nosso lado — não por falta de dado no payload (`aula.lead_id` vem em 153 de 155 entregas dos
// últimos 30 dias). Caso real: Herika Galiza, Recreio, 05/08/2026 — experimental às
// 17:44:46.787, lead criado às 17:44:47.579, 0,46s depois de a RPC rodar. A aula se perdeu em
// silêncio e foi reinserida à mão (lead_experimentais 1670).
//
// ⚠️ O n8n cobria isso e a migração de 04/08 não percebeu: o sub-workflow `j41tPbyjGXUQUxrN`
// tem um nó `Delay 5s` ANTES de chamar a RPC. A migração seguiu o critério "mesmas RPCs, mesmos
// argumentos" — e o delay não é nem RPC nem argumento, é ordenação. Por isso a corrida só
// apareceu depois de o n8n ser desligado e o observador virar o único a escrever.
//
// Agora `registrarExperimentalComRetry` reespera 2s/4s/8s SÓ quando a RPC recusa por
// `lead_not_found` (o caminho normal não paga nada, e a janela fica ~3× a do n8n). Esgotado o
// retry, o fallback de criação de lead deixa de exigir `!telefone`: passa a valer para qualquer
// recusa com `emusys_lead_id`, gravando o telefone do payload — com guarda, se o telefone já
// pertence a um lead da unidade (INCLUSIVE arquivado, que a RPC não casa) não cria nada e
// reporta `lead_existente_nao_casado` como warn, para decisão humana.

// [v9 — 2026-08-07] O ENCERRAMENTO DE SUBSTITUÍDAS (v6) FOI DESLIGADO. Ele rodou uma única
// vez em produção — 05/08, lead 11164, irmãos Antônio e Maria Fernanda (Recreio) — encerrou
// 10 linhas e 7 tinham par real na grade. Duas causas independentes:
//   (a) CORRIDA COM O SYNC DA GRADE. As aulas 829555-829558 entraram em `aulas_emusys` às
//       18:10:34; os encerramentos rodaram 18:02-18:05. `sem_par_na_grade` era FALSO — a
//       grade sincroniza a cada 15 min e o webhook sempre chega antes. Atinge qualquer
//       aluno, não só irmãos.
//   (b) `mesmoSlot` CRUZA IRMÃOS. O filtro é `.eq('lead_id', leadId)`, e `lead_id` é o
//       telefone: 2 irmãos (emusys_lead_id 8128 e 8129) casam no mesmo lead nosso. Um evento
//       do Antônio cancelou a linha da irmã que JÁ tinha par na grade (18:15:52). Há 17 leads
//       com 2 emusys_lead_id desde junho — não é caso isolado.
//
// ⚠️ E a grade é a fonte errada por construção: `aulas_emusys` é alimentada por upsert e
// NUNCA remove. Ela sabe o que existe, não sabe o que deixou de existir. Quem sabe isso é o
// snapshot (`emusys_experimentais_raw.snapshot_ativo` + `emusys_experimentais_snapshot_execucoes`,
// no ar desde 30/07). Medido em 07/08: as duas fontes concordam em 27 de 28 experimentais
// futuras, e na única divergência (Amelie Fontoura, CG 08/08) o snapshot é quem está certo.
//
// Desligar devolve o comportamento que vigorou até 04/08 — NÃO é regressão perante o n8n, que
// nunca encerrou nada (os fantasmas Rafael Alberigi e Beatriz Romero, que motivaram a v6, foram
// criados por ELE). O fantasma volta a existir; é erro por omissão, visível e reversível, contra
// erro por ação, silencioso e destrutivo.
//
// A solução definitiva é reconciliar contra o snapshot, dentro do sync, com 4 travas:
//   1. só julgar linha ANTERIOR ao início da execução (senão cancela o que o webhook acabou de
//      criar — a mesma corrida, pelo espelho; CG chegou a ficar 4h com foto velha em 07/08);
//   2. só execução `status='completo'` e recusando queda brusca vs. a anterior (foto parcial);
//   3. casar por `emusys_lead_id` (100% de cobertura dos dois lados), nunca por slot;
//   4. não julgar experimental de origem manual/fallback — nunca esteve na foto do Emusys.
// Entrar em SOMBRA primeiro. Ver daily-notes/2026-08-07.md.
//
// [v11 — 2026-08-12] UNIDADE PASSA A SAIR DO `escola_id`, e o observador se prepara para
// ASSUMIR O LEAD no lugar do n8n (decisão do Hugo).
//
// Contexto: em 11/08 às 15h uma migration criou um OVERLOAD de `upsert_lead` (11 args, com
// `p_data_nascimento DEFAULT NULL`) sem remover a de 10. Chamada com 10 argumentos passou a
// casar nas duas e o Postgres recusou: "function upsert_lead(...) is not unique". O nó
// "Upsert Lead1" do workflow EB0LibpOJCLhKp7M falhou em 100% das execuções por ~21h e 22
// leads não entraram na base — existem só como payload em `automacao_log`.
//
// O observador NÃO caía nesse erro: ele chama a RPC pelo PostgREST com as 11 chaves
// NOMEADAS, o que resolve para a função nova sem ambiguidade. Ele registrou os 40 leads do
// período em sombra, com a unidade certa e os args certos — teria absorvido a queda inteira
// se a escrita estivesse ligada. Foi o que motivou a virada.
//
// Mudança desta versão: `resolverUnidade` usa `escola_id` (mapa fixo, igual ao n8n) e só cai
// no nome como reserva. Motivo: o ID não muda quando renomeiam a escola. Sem default de
// unidade — ver UNIDADE_POR_ESCOLA_ID.
//
// ⚠️ Ordem da virada (a mesma da v5, e vale repetir porque é contraintuitivo): ligar a escrita
// AQUI primeiro, confirmar em evento real, e só ENTÃO desligar o ramo de lead no n8n. O
// inverso abre uma janela sem ninguém escrevendo — e o Emusys não reenvia. Com os dois
// ligados não há duplicata: a RPC casa por `emusys_lead_id`+unidade e o segundo vira UPDATE.
//
// ⚠️ Antes de ligar a escrita de lead, DEFINIR `OBSERVADOR_TOKEN`. Sem ele a verificação fica
// desligada e este endereço aceita POST de qualquer origem — hoje inofensivo (só grava log),
// mas gravando em `leads` vira porta aberta para injetar lead no funil. Os headers do Emusys
// foram medidos e não trazem nada custom, então o caminho é `?token=` na URL cadastrada lá.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN_ESPERADO = (Deno.env.get('OBSERVADOR_TOKEN') ?? '').trim();

/** Eventos liberados para escrita. Vazio = sombra em tudo (default). '*' = tudo escreve. */
const EVENTOS_LIBERADOS: Set<string> = (() => {
  const bruto = (Deno.env.get('OBSERVADOR_ESCREVE') ?? '').trim();
  if (bruto === '*' || bruto.toLowerCase() === 'todos') return new Set(['*']);
  if (bruto) return new Set(bruto.split(',').map(s => s.trim()).filter(Boolean));
  // sem a variável nova: honra o interruptor antigo, cujo default é NÃO escrever
  const dryRunLegado = (Deno.env.get('OBSERVADOR_DRY_RUN') ?? 'true') === 'true';
  return dryRunLegado ? new Set<string>() : new Set(['*']);
})();

function escreveDeVerdade(evento: string): boolean {
  return EVENTOS_LIBERADOS.has('*') || EVENTOS_LIBERADOS.has(evento);
}

/** Token só é exigido quando configurado — ver comentário no cabeçalho. */
function autorizado(req: Request): boolean {
  if (!TOKEN_ESPERADO) return true;
  const doHeader = req.headers.get('x-observador-token') ?? '';
  if (doHeader && doHeader === TOKEN_ESPERADO) return true;
  try {
    return new URL(req.url).searchParams.get('token') === TOKEN_ESPERADO;
  } catch (_e) {
    return false;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extrairNome(body: any): string {
  return (
    body?.matricula?.nome_aluno ||
    body?.lead?.nome_aluno ||
    body?.aula?.nome_aluno ||
    '(observador)'
  );
}

function extrairUnidade(body: any): string | null {
  return body?.escola_nome ?? null;
}

/** Headers sempre chegaram em `req.headers` — nunca foram lidos, então nunca soubemos o que o
 *  Emusys manda. Isso importa para decidir a autenticação: se ele mandasse header custom, o
 *  `x-observador-token` bastaria; se não manda, sobra o `?token=` na URL (ou allowlist de IP,
 *  via `x-real-ip`/`x-forwarded-for`).
 *
 *  ⚠️ Valores de header de credencial NÃO são gravados. O log é lido por gente e por outras
 *  automações; escrever segredo ali repetiria o problema do token do Chatwoot em `agentes`,
 *  que está em texto puro e qualquer SELECT expõe. Sensível vira '***', o resto vai inteiro —
 *  `x-real-ip` e `user-agent` só servem se der para ler o valor. */
const HEADERS_SENSIVEIS = ['authorization', 'apikey', 'api-key', 'cookie', 'x-observador-token', 'token'];

/** Diagnóstico do token ANTES de exigi-lo, para não derrubar a captação ao ligar a trava.
 *
 *  Motivo: o campo de URL do Emusys mostra o endereço truncado na tela, e se ele cortar o
 *  token no cadastro, ativar `OBSERVADOR_TOKEN` faria a edge rejeitar 100% dos webhooks —
 *  e o Emusys NÃO reenvia. Então primeiro medimos o que está chegando, depois exigimos.
 *
 *  ⚠️ NÃO grava o valor: só a origem, o comprimento e os 12 primeiros hex do SHA-256. O hash
 *  basta para provar identidade contra o token esperado (comparando com o sha256 do que
 *  guardamos), sem escrever credencial num log que é lido por gente e por automação — a
 *  mesma regra do HEADERS_SENSIVEIS logo acima. */
async function diagnosticarToken(req: Request): Promise<Record<string, unknown>> {
  let bruto = '';
  let via: string | null = null;
  const doHeader = req.headers.get('x-observador-token') ?? '';
  if (doHeader) {
    bruto = doHeader;
    via = 'header';
  } else {
    try {
      const daQuery = new URL(req.url).searchParams.get('token') ?? '';
      if (daQuery) {
        bruto = daQuery;
        via = 'query';
      }
    } catch (_e) {
      // URL inválida não deve derrubar o log
    }
  }
  if (!via) return { via: null, len: 0, sha256_12: null };

  let sha = null;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bruto));
    sha = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 12);
  } catch (_e) {
    // ambiente sem WebCrypto: o comprimento sozinho já denuncia truncamento
  }
  return { via, len: bruto.length, sha256_12: sha };
}

function coletarHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((valor, nome) => {
    const chave = nome.toLowerCase();
    out[chave] = HEADERS_SENSIVEIS.indexOf(chave) >= 0 ? '***' : valor;
  });
  return out;
}

// ---------------------------------------------------------------- de-para ---

// estágio do funil no Emusys -> etapa do pipeline no LA Report (crm_pipeline_etapas)
const ETAPA_POR_ESTAGIO_EMUSYS: Record<string, number> = {
  '1': 1,  // Novo / Novo Lead             -> Novo Lead
  '3': 5,  // Aula experimental marcada    -> Experimental Agendada
  '4': 7,  // Aula experimental realizada  -> Experimental Realizada
  '5': 10, // Matriculados                 -> Matriculado
  '8': 9,  // Experimental não realizada   -> Faltou
};

// A etapa só avança: webhook atrasado não rebaixa lead que já progrediu por outro caminho.
const ORDEM_ETAPA: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 0,
};

// ------------------------------------------------------------- utilitários ---

/** "(21) 98872-3386" -> "5521988723386" — mesmo formato que o n8n grava hoje. */
function normalizarTelefone(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  const d = String(bruto).replace(/\D/g, '');
  if (!d) return null;
  if (d.length >= 12 && d.slice(0, 2) === '55') return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}

function semAcento(s: unknown): string {
  const base = String(s ?? '').normalize('NFD');
  let out = '';
  for (const ch of base) {
    // apos NFD os diacriticos ficam fora do ASCII; manter so o basico
    if (ch.charCodeAt(0) < 128) out += ch;
  }
  return out;
}

/** "LA Music School Campo Grande" -> "Campo Grande" */
function nomeUnidade(escolaNome: unknown): string | null {
  const s = String(escolaNome ?? '').trim();
  if (!s) return null;
  return s.replace(/^LA Music School\s*/i, '').trim() || null;
}

/** Campo personalizado "Como conheceu a escola" — o valor vem como string ou como
 *  objeto {id, valor}; os dois formatos aparecem em produção. Devolve o texto CRU:
 *  o de-para de canal (com acento: 'LOJA DE MÚSICA', 'RÁDIO') é da upsert_lead. */
function comoConheceu(lead: any): string | null {
  const campos = lead?.campos_personalizados;
  if (!Array.isArray(campos)) return null;
  const c = campos.find((x: any) => semAcento(x?.nome).toUpperCase().indexOf('CONHECEU') >= 0);
  if (!c) return null;
  const v = c.valor;
  const bruto = v && typeof v === 'object' ? v.valor : v;
  const s = String(bruto ?? '').trim();
  return s || null;
}

function textoOuNulo(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

/** "2026-03-27 14:25:46" -> ISO em BRT. É o que o n8n faz com
 *  ($8::timestamp AT TIME ZONE 'America/Sao_Paulo') ao passar p_created_at. */
function dataHoraBRT(bruto: unknown): string | null {
  const s = String(bruto ?? '').trim();
  if (!s) return null;
  return s.replace(' ', 'T') + '-03:00';
}

// --------------------------------------------------------------- resolvers ---

/** `escola_id` do Emusys -> unidade. Mesmo mapa do n8n (nó "Preparar Dados Lead1").
 *
 *  O ID é a chave estável: o Emusys mandou `escola_id` em 100% dos webhooks reais dos
 *  últimos 30 dias (3.752 eventos), e ele não muda quando alguém renomeia a escola no
 *  cadastro — o `escola_nome` muda.
 *
 *  ⚠️ Unidade nova exige acrescentar a linha aqui. É de propósito que não exista default:
 *  o n8n manda todo `escola_id` desconhecido para a BARRA
 *  (`... : '368d47f5-...'`), então uma unidade nova entraria como Barra em silêncio e o
 *  erro só apareceria no funil, semanas depois. Aqui, ID desconhecido cai no fallback por
 *  nome e, se nem isso resolver, o evento é registrado como `ignorado` com status `warn`. */
const UNIDADE_POR_ESCOLA_ID: Record<string, string> = {
  '39': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',  // LA Music School Campo Grande
  '40': '95553e96-971b-4590-a6eb-0201d013c14d',  // LA Music School Recreio
  '316': '368d47f5-2d88-4475-bc14-ba084a9a348e', // LA Music School Barra
};

/** ID primeiro, nome como reserva. O fallback por nome é o comportamento que valeu de
 *  29/07 a 12/08 e resolveu certo todos os leads observados em sombra — fica como rede
 *  para o caso de o payload vir sem `escola_id` (só visto em testes manuais nossos). */
async function resolverUnidade(sb: any, body: any): Promise<string | null> {
  const escolaId = String(body?.escola_id ?? '').trim();
  if (escolaId && UNIDADE_POR_ESCOLA_ID[escolaId]) return UNIDADE_POR_ESCOLA_ID[escolaId];

  const nome = nomeUnidade(body?.escola_nome);
  if (!nome) return null;
  const { data } = await sb.from('unidades').select('id').eq('nome', nome).maybeSingle();
  return data ? data.id : null;
}

/** Professor, em 3 camadas.
 *
 *  1) emusys_id do payload (`aula.professor_id`) — match EXATO, sem heurística.
 *     ⚠️ SEMPRE filtrando unidade: `professores_unidades.emusys_id` NÃO é único
 *     (o 1002 aparece em 2 unidades apontando para professores diferentes, 7 e 8).
 *     ⚠️ Campo novo: apareceu pela 1ª vez em 04/08/2026 e só num evento. Enquanto não
 *     vier, esta camada simplesmente não roda e vale o comportamento antigo.
 *  2) TELEFONE (identidade da pessoa) + ativo.
 *  3) nome como aparece NA UNIDADE + ativo.
 *
 *  Nunca por nome solto: a mesma pessoa tem nomes diferentes por unidade e há cadastros
 *  mesclados inativos com nome quase igual (Erick Osmy 54 x Erick Cosme da Silva 52). */
async function resolverProfessor(sb: any, aula: any, unidadeId: string) {
  const emusysProfId = aula?.professor_id != null && aula.professor_id !== ''
    ? Number(aula.professor_id)
    : null;
  if (emusysProfId && Number.isFinite(emusysProfId)) {
    const { data } = await sb
      .from('professores_unidades')
      .select('professor_id, professores!inner(ativo)')
      .eq('emusys_id', emusysProfId)
      .eq('unidade_id', unidadeId)
      .eq('professores.ativo', true)
      .limit(1);
    if (data && data.length) return { id: data[0].professor_id as number, via: 'emusys_professor_id' };
  }

  const tel = normalizarTelefone(aula?.telefone_professor);
  if (tel) {
    const { data } = await sb
      .from('professores')
      .select('id')
      .eq('telefone_whatsapp', tel)
      .eq('ativo', true)
      .limit(1);
    if (data && data.length) return { id: data[0].id as number, via: 'telefone' };
  }
  // fallback: nome como aparece NA UNIDADE — distingue os homônimos entre escolas
  const nome = String(aula?.nome_professor ?? '').trim();
  if (!nome) return { id: null, via: 'nao_resolvido' };
  const { data } = await sb
    .from('professores_unidades')
    .select('professor_id, professores!inner(ativo)')
    .eq('emusys_nome', nome)
    .eq('unidade_id', unidadeId)
    .eq('professores.ativo', true)
    .limit(1);
  if (data && data.length) return { id: data[0].professor_id as number, via: 'emusys_nome_da_unidade' };
  return { id: null, via: 'nao_resolvido' };
}

// -------------------------------------- preview (só quando NÃO escreve) ---

/** Replica a normalização de curso da registrar_experimental para o preview.
 *  Na escrita real quem resolve é a RPC — isto aqui é diagnóstico. */
function normalizarCurso(nomeCurso: unknown): string {
  return semAcento(nomeCurso)
    .toLowerCase()
    .replace(/\s+para\s+instrumento$/g, '')
    .replace(/\s+(t|ind)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function previewCurso(sb: any, nomeCurso: unknown): Promise<number | null> {
  const alvo = normalizarCurso(nomeCurso);
  if (!alvo) return null;
  const { data } = await sb.from('cursos').select('id, nome').order('id');
  if (!data) return null;
  const candidatos = data.filter((c: any) => normalizarCurso(c.nome) === alvo);
  if (!candidatos.length) return null;
  // mesmo desempate da RPC: quem NÃO termina em ' IND' primeiro, depois menor id
  candidatos.sort((a: any, b: any) => {
    const ai = /\sIND$/i.test(a.nome) ? 1 : 0;
    const bi = /\sIND$/i.test(b.nome) ? 1 : 0;
    return ai - bi || a.id - b.id;
  });
  return candidatos[0].id;
}

/** Espelha o match de lead da upsert_lead (source_type 'emusys'). */
async function previewLead(sb: any, unidadeId: string, emusysLeadId: number | null, telefone: string | null) {
  if (emusysLeadId) {
    const { data } = await sb
      .from('leads').select('id')
      .eq('emusys_lead_id', emusysLeadId).eq('unidade_id', unidadeId).limit(1);
    if (data && data.length) return { lead_id: data[0].id as number, via: 'emusys_lead_id' };
  }
  if (telefone) {
    const { data } = await sb
      .from('leads').select('id')
      .eq('telefone', telefone).eq('unidade_id', unidadeId).eq('arquivado', false).limit(1);
    if (data && data.length) return { lead_id: data[0].id as number, via: 'telefone' };
  }
  return { lead_id: null, via: 'sera_criado' };
}

/** Espelha o match de lead da registrar_experimental: emusys_lead_id -> telefone -> nome.
 *  ⚠️ A camada 1 da RPC NÃO filtra unidade (bug conhecido — emusys_lead_id colide entre
 *  escolas). O preview reproduz isso de propósito e sinaliza quando acontece. */
async function previewLeadExperimental(
  sb: any, unidadeId: string, emusysLeadId: number | null, telefone: string | null, nomeAluno: string | null,
) {
  if (emusysLeadId) {
    const { data } = await sb.from('leads').select('id, unidade_id').eq('emusys_lead_id', emusysLeadId).limit(1);
    if (data && data.length) {
      const fora = data[0].unidade_id !== unidadeId;
      return {
        lead_id: data[0].id as number,
        via: 'emusys_lead_id',
        ...(fora ? { alerta: 'emusys_lead_id casou em OUTRA unidade (colisão entre escolas)' } : {}),
      };
    }
  }
  if (telefone && telefone.replace(/\D/g, '').length >= 10) {
    const { data } = await sb
      .from('leads').select('id')
      .eq('telefone', telefone).eq('unidade_id', unidadeId).eq('arquivado', false).limit(1);
    if (data && data.length) return { lead_id: data[0].id as number, via: 'telefone' };
  }
  if (nomeAluno) {
    const { data } = await sb
      .from('leads').select('id')
      .ilike('nome', nomeAluno).eq('unidade_id', unidadeId).eq('arquivado', false)
      .order('created_at', { ascending: false }).limit(1);
    if (data && data.length) return { lead_id: data[0].id as number, via: 'nome' };
  }
  return { lead_id: null, via: 'nao_encontrado' };
}

// ---------------------------------------------------------------- handlers ---

/** Campos que a upsert_lead não conhece. Aplicados DEPOIS dela, só onde há valor,
 *  e a etapa só quando avança. Nunca apaga: chave ausente não entra no UPDATE. */
async function aplicarDeltaLead(sb: any, leadId: number, lead: any) {
  const delta: Record<string, unknown> = {};
  const agente = textoOuNulo(lead?.nome_atendente);
  if (agente) delta.agente_comercial = agente;
  const motivo = textoOuNulo(lead?.arquivamento?.motivo_nome);
  if (motivo) delta.motivo_arquivamento = motivo;

  const etapaAlvo = ETAPA_POR_ESTAGIO_EMUSYS[String(lead?.estagio_funil?.id ?? '')] ?? null;
  if (etapaAlvo !== null) {
    const { data: atual } = await sb.from('leads').select('etapa_pipeline_id').eq('id', leadId).maybeSingle();
    const ordemAtual = atual?.etapa_pipeline_id ? ORDEM_ETAPA[atual.etapa_pipeline_id] ?? 0 : 0;
    if ((ORDEM_ETAPA[etapaAlvo] ?? 0) > ordemAtual) delta.etapa_pipeline_id = etapaAlvo;
  }

  if (!Object.keys(delta).length) return null;
  await sb.from('leads').update(delta).eq('id', leadId);
  return delta;
}

async function processarLead(sb: any, body: any, unidadeId: string, escrever: boolean) {
  const lead = body?.lead ?? {};
  const emusysLeadId = lead?.id ? Number(lead.id) : null;
  if (!emusysLeadId) return { acao: 'ignorado', motivo: 'sem lead.id' };

  const telefone = normalizarTelefone(lead?.telefone);
  // v10 — 2026-08-11: NÃO descarta mais por falta de telefone. O Emusys às vezes
  // cria o lead sem telefone (a secretaria preenche depois), mas já manda email,
  // data_nascimento, canal e instrumento. Antes jogávamos tudo fora ("mesma regra
  // do n8n"), e o lead ficava pelado na base. Agora importamos o que vier — a
  // upsert_lead já lida com telefone null (match por emusys_lead_id, não telefone).

  const dataNascimento = textoOuNulo(lead?.data_nascimento_aluno);
  const args = {
    p_nome: textoOuNulo(lead?.nome_aluno),
    p_telefone: telefone,
    p_email: textoOuNulo(lead?.email),
    p_unidade_id: unidadeId,
    p_curso: textoOuNulo(lead?.instrumento),
    p_canal: comoConheceu(lead),
    p_source_id: emusysLeadId,
    p_source_type: 'emusys',
    p_arquivar: false,
    p_data_contato: String(lead?.data_hora_criacao ?? '').trim().substring(0, 10) || null,
    p_data_nascimento: dataNascimento ? dataNascimento.substring(0, 10) : null,
  };

  if (!escrever) {
    const achado = await previewLead(sb, unidadeId, emusysLeadId, telefone);
    return { acao: `upsert_lead(dry) -> ${achado.lead_id ? 'update' : 'insert'}`, match: achado, args };
  }

  const { data, error } = await sb.rpc('upsert_lead', args);
  if (error) return { acao: 'erro_rpc', rpc: 'upsert_lead', erro: error.message, args };

  const leadId = data?.lead_id ?? null;

  // upsert_lead nunca lança exceção na colisão de telefone: se `telefone` já pertence a outro
  // lead ativo na unidade, ela mantém o telefone atual em silêncio (COALESCE, ver corpo da
  // RPC). Só dá pra perceber relendo o lead e comparando com o que foi enviado.
  if (leadId && telefone) {
    const { data: leadAtual } = await sb.from('leads').select('telefone').eq('id', leadId).maybeSingle();
    if (leadAtual && leadAtual.telefone !== telefone) {
      // Colisão de telefone não deve suprimir o delta (etapa_pipeline_id etc.) — só afeta
      // o `acao`/`status` reportados. Ver finding #2 da revisão final.
      const deltaColisao = await aplicarDeltaLead(sb, leadId, lead);
      return {
        acao: 'colisao_telefone_familia',
        motivo: 'telefone ja pertence a outro lead ativo na unidade',
        telefone_recusado: telefone,
        resultado: data,
        delta_observador: deltaColisao,
        args,
      };
    }
  }

  const delta = leadId ? await aplicarDeltaLead(sb, leadId, lead) : null;
  return { acao: 'upsert_lead', resultado: data, delta_observador: delta, args };
}

/** `observacoes` chega em 100% dos payloads de experimental (preenchida em ~70%) e hoje é
 *  descartada pelos dois lados: a `registrar_experimental` não tem parâmetro para ela,
 *  embora `lead_experimentais` TENHA a coluna — que está 0 de 311 preenchida.
 *
 *  Gravamos como delta DEPOIS da RPC, em vez de mudar a RPC: ela é compartilhada com o
 *  n8n e ganhar um parâmetro novo mexeria num objeto com consumidor ativo em produção.
 *  Só preenche quando está vazia — nunca sobrescreve o que já existir. */
async function aplicarDeltaExperimental(sb: any, expId: number, observacoes: string | null) {
  if (!expId || !observacoes) return null;
  const { data: atual } = await sb
    .from('lead_experimentais')
    .select('observacoes')
    .eq('id', expId)
    .maybeSingle();
  if (atual && String(atual.observacoes ?? '').trim()) return { observacoes: 'preservada (ja tinha)' };
  await sb.from('lead_experimentais').update({ observacoes }).eq('id', expId);
  return { observacoes };
}

/** ⚠️⚠️ NÃO CHAMAR — DESLIGADA EM 07/08/2026 (v9). Mantida só como registro do que foi
 *  tentado e por que falhou; a explicação está no cabeçalho do arquivo. Em resumo: ela
 *  pergunta "a aula sumiu?" para `aulas_emusys`, que é upsert-only e NUNCA remove nada, e
 *  ainda pergunta antes de o sync de 15 min ter chegado. Encerrou 7 aulas reais de 10.
 *  O substituto é a reconciliação contra o snapshot, no sync — não aqui, não por evento.
 *
 *  O Emusys manda `aula_experimental_reagendada` com o estado NOVO e ZERO referência ao
 *  antigo — sem id de aula, sem a data anterior (conferido nas 20 entregas já observadas).
 *  Como a chave de dedup da RPC é (lead, data, horário, curso), tudo que o reagendamento
 *  muda faz a chave escapar: nasce linha nova e a anterior fica viva e agendada. Rafael
 *  Alberigi remarcado de 05/08 pro 12/08 (mudou a data) e Beatriz Romero trocada de
 *  Teclado pra Guitarra (mudou curso e professor) apareciam DUAS vezes na Agenda, uma
 *  delas numa aula que não vai acontecer.
 *
 *  Quem decide qual morreu é a GRADE (`aulas_emusys`, espelho da API com soft-cancel: aula
 *  que some da origem é marcada `cancelada`). Verificação contra a fonte, não palpite.
 *
 *  Dois desfechos encerram a candidata, e só eles:
 *    (a) SEM par na grade — a aula não existe mais no Emusys (caso Rafael);
 *    (b) COM par, mas ocupando o MESMO slot da linha que acabou de chegar — as duas
 *        disputam uma aula só, e a vigente é a do webhook (caso Beatriz).
 *
 *  ⚠️ O professor ficou FORA do casamento de propósito. Incluí-lo separaria a Beatriz
 *  direto, mas ao testar contra as 18 agendadas futuras acusou o Felipe Salgado como
 *  fantasma com a aula dele existindo: nossa base diz professor 57, a grade diz 46. Ou
 *  seja, divergência de cadastro viraria cancelamento de aula real. O desempate do slot
 *  em (b) resolve a Beatriz sem correr esse risco.
 *
 *  Preserva o multi-instrumento legítimo: Isadora Rabelo, com Canto 16h e Teclado 15h no
 *  mesmo dia, tem par para as duas e slots distintos — nenhuma é encerrada.
 *
 *  Nunca toca em linha já realizada/faltou/cancelada, nem na que acabou de ser gravada. */
async function encerrarExperimentaisSubstituidas(
  sb: any,
  leadId: number,
  expIdNovo: number | null,
  slotNovo: { data: string | null; horario: string | null },
) {
  const { data: candidatas } = await sb
    .from('lead_experimentais')
    .select('id, unidade_id, nome_aluno, data_experimental, horario_experimental')
    .eq('lead_id', leadId)
    .eq('status', 'experimental_agendada');
  if (!candidatas?.length) return null;

  const encerradas: unknown[] = [];
  for (const c of candidatas) {
    if (expIdNovo && Number(c.id) === Number(expIdNovo)) continue;
    if (!c.data_experimental || !c.horario_experimental) continue;

    const { data: temPar, error } = await sb.rpc('experimental_tem_par_na_grade', {
      p_unidade_id: c.unidade_id,
      p_nome_aluno: c.nome_aluno,
      p_data: c.data_experimental,
      p_horario: c.horario_experimental,
    });
    // Falha na checagem = não sabemos. Preservar é o único erro reversível aqui.
    if (error) continue;

    const mesmoSlot = !!slotNovo.data
      && c.data_experimental === slotNovo.data
      && String(c.horario_experimental).slice(0, 5) === String(slotNovo.horario ?? '').slice(0, 5);

    if (temPar === true && !mesmoSlot) continue;

    await sb.from('lead_experimentais')
      .update({ status: 'cancelada', updated_at: new Date().toISOString() })
      .eq('id', c.id)
      .eq('status', 'experimental_agendada');
    encerradas.push({
      id: c.id,
      data: c.data_experimental,
      horario: c.horario_experimental,
      motivo: temPar === true ? 'mesmo_slot_da_nova' : 'sem_par_na_grade',
    });
  }
  return encerradas.length ? { encerradas } : null;
}

/** A RPC recusou por não achar lead? O motivo vem DENTRO do retorno, não em `error`. */
function recusouPorLeadNaoEncontrado(data: any): boolean {
  return data?.success === false && data?.reason === 'lead_not_found';
}

const dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Esperas entre as retentativas da RPC. Somadas dão ~14s — quase 3× a janela que o
 *  `Delay 5s` do n8n cobria (ver `registrarExperimentalComRetry`). */
const ESPERAS_RETRY_MS = [2000, 4000, 8000];

/** O Emusys às vezes manda a experimental ANTES do evento do lead: quem cadastra a pessoa e
 *  marca a aula no mesmo gesto dispara `aula_experimental_criada` primeiro, e o `lead_criado`/
 *  `lead_editado` chega um pouco depois. Aconteceu com a Herika Galiza em 05/08/2026 —
 *  experimental às 17:44:46.787, lead criado no nosso banco às 17:44:47.579, 0,46s depois da
 *  RPC rodar. As 3 camadas de match da `registrar_experimental` (emusys_lead_id -> telefone ->
 *  nome) falharam juntas, não por falta de dado no payload, mas porque o outro lado ainda não
 *  tinha chegado. A experimental se perdeu em silêncio.
 *
 *  ⚠️ O n8n cobria isso e a migração não percebeu: o sub-workflow `j41tPbyjGXUQUxrN` tem um nó
 *  `Delay 5s` (`setTimeout(5000)`) logo ANTES de chamar a RPC. A migração foi feita com o
 *  critério "chamar as mesmas RPCs com os mesmos argumentos" — e o delay não é nem RPC nem
 *  argumento, é ordenação. Ficou de fora.
 *
 *  Aqui é retry em vez de delay fixo: o caminho normal (~95%) não paga nada, e o caso raro
 *  ganha uma janela maior que a do n8n. Só para agendamento — cancelamento de um lead que
 *  nunca existiu não deve ficar esperando por ele. */
async function registrarExperimentalComRetry(
  sb: any, args: Record<string, unknown>, podeReesperar: boolean,
): Promise<{ data: any; error: any; tentativas: number }> {
  let { data, error } = await sb.rpc('registrar_experimental', args);
  let tentativas = 1;
  if (error || !podeReesperar || !recusouPorLeadNaoEncontrado(data)) {
    return { data, error, tentativas };
  }
  for (const espera of ESPERAS_RETRY_MS) {
    await dormir(espera);
    const nova = await sb.rpc('registrar_experimental', args);
    tentativas++;
    data = nova.data;
    error = nova.error;
    if (error || !recusouPorLeadNaoEncontrado(data)) break;
  }
  return { data, error, tentativas };
}

/** Existe lead com esse telefone na unidade, INCLUSIVE arquivado? A camada de telefone da
 *  `registrar_experimental` filtra `arquivado = false`, então um lead arquivado faz a RPC
 *  recusar sem que o telefone esteja livre — criar outro ali produziria duas linhas com o
 *  mesmo telefone na mesma unidade. Nesse caso a decisão é humana, não automática. */
async function leadExistentePorTelefone(
  sb: any, unidadeId: string, telefone: string | null,
): Promise<{ id: number; arquivado: boolean } | null> {
  if (!telefone) return null;
  const { data } = await sb
    .from('leads')
    .select('id, arquivado')
    .eq('telefone', telefone)
    .eq('unidade_id', unidadeId)
    .limit(1);
  if (!data?.length) return null;
  return { id: data[0].id as number, arquivado: !!data[0].arquivado };
}

/** Esgotado o retry e ainda sem lead, cria um lead mínimo pelo `emusys_lead_id` da própria
 *  aula — só assim a experimental não se perde (o n8n tinha a mesma regra de descarte e perdia
 *  do mesmo jeito). Grava o telefone do payload quando ele veio: 148 de 155 experimentais dos
 *  últimos 30 dias trazem telefone, e deixá-lo null obrigaria um segundo evento pra completar.
 *  Quem chama já garantiu que esse telefone não pertence a outro lead da unidade. */
async function criarLeadFallbackExperimental(
  sb: any, unidadeId: string, emusysLeadId: number | null, nomeAluno: string | null,
  telefone: string | null,
): Promise<{ leadId: number | null; erro: string | null }> {
  if (!emusysLeadId) return { leadId: null, erro: 'sem emusys_lead_id para criar o lead' };
  const { data, error } = await sb
    .from('leads')
    .insert({
      emusys_lead_id: emusysLeadId,
      nome: nomeAluno,
      unidade_id: unidadeId,
      telefone,
      status: 'novo',
      etapa_pipeline_id: 5,
      data_contato: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().substring(0, 10),
    })
    .select('id')
    .single();
  if (error) return { leadId: null, erro: error.message };
  return { leadId: data?.id ?? null, erro: null };
}

async function processarExperimental(sb: any, body: any, unidadeId: string, evento: string, escrever: boolean) {
  const aula = body?.aula ?? {};
  const cancelamento = evento === 'aula_experimental_cancelada';
  const telefone = normalizarTelefone(aula?.telefone);
  const nomeAluno = textoOuNulo(aula?.nome_aluno);
  const emusysLeadId = aula?.lead_id ? Number(aula.lead_id) : null;

  if (!telefone && !emusysLeadId && !nomeAluno) {
    return { acao: 'ignorado', motivo: 'sem telefone, lead_id e nome — nada para casar' };
  }

  const professor = cancelamento
    ? { id: null, via: 'nao_se_aplica' }
    : await resolverProfessor(sb, aula, unidadeId);

  // Cancelamento não traz curso nem observações no payload — nada a preservar.
  const observacoes = cancelamento ? null : textoOuNulo(aula?.observacoes);

  // Mesmos argumentos do nó "Agendar Experimental"/"Cancelar Experimental" do n8n.
  const args: Record<string, unknown> = {
    p_telefone: telefone,
    p_nome_aluno: nomeAluno,
    p_unidade_id: unidadeId,
    p_status: cancelamento ? 'cancelada' : 'experimental_agendada',
    p_etapa: cancelamento ? 1 : 5,
    p_data_experimental: cancelamento ? null : textoOuNulo(aula?.data),
    p_horario_experimental: cancelamento ? null : textoOuNulo(aula?.horario),
    p_professor_id: professor.id,
    p_emusys_lead_id: emusysLeadId,
    p_curso: cancelamento ? null : textoOuNulo(aula?.curso),
    p_emusys_aula_id: body?.id != null ? Number(body.id) : null,
  };
  const criadoEm = dataHoraBRT(body?.data_hora_criacao);
  // omitir p_created_at deixa a RPC aplicar o default now(), como o n8n faz com ''
  if (criadoEm) args.p_created_at = criadoEm;

  if (!escrever) {
    const achado = await previewLeadExperimental(sb, unidadeId, emusysLeadId, telefone, nomeAluno);
    const cursoId = cancelamento ? null : await previewCurso(sb, aula?.curso);
    return {
      acao: `registrar_experimental(dry) -> ${achado.lead_id ? 'registra' : 'lead_not_found'}`,
      match: achado,
      professor_via: professor.via,
      curso_id_previsto: cursoId,
      observacoes_a_gravar: observacoes,
      args,
    };
  }

  // Retry curto antes de qualquer escrita: cobre a corrida com o webhook de lead sem criar nada.
  let { data, error, tentativas } = await registrarExperimentalComRetry(sb, args, !cancelamento);
  if (error) return { acao: 'erro_rpc', rpc: 'registrar_experimental', erro: error.message, args };

  let leadFallback: { lead_id: number } | null = null;
  if (evento === 'aula_experimental_criada' && recusouPorLeadNaoEncontrado(data)) {
    // O lead não apareceu nem depois da espera. Antes de criar, checar se o telefone já é de
    // alguém: se for, criar produziria duplicata e o certo é um humano olhar.
    const jaExiste = await leadExistentePorTelefone(sb, unidadeId, telefone);
    if (jaExiste) {
      return {
        acao: 'lead_existente_nao_casado',
        motivo: jaExiste.arquivado
          ? 'telefone pertence a um lead ARQUIVADO na unidade (a RPC só casa com arquivado=false)'
          : 'telefone pertence a outro lead da unidade que a RPC nao casou',
        lead_conflitante: jaExiste,
        tentativas_rpc: tentativas,
        args,
      };
    }
    const criado = await criarLeadFallbackExperimental(sb, unidadeId, emusysLeadId, nomeAluno, telefone);
    if (criado.erro) {
      // Falta de emusysLeadId é payload insuficiente (nada a chavear), não falha de sistema —
      // acao distinta para cair no ramo 'warn' do serve(). O insert de fato falhando (infra/DB)
      // continua caindo no 'erro_rpc' logo abaixo, que segue como erro real.
      const acaoFallback = criado.erro === 'sem emusys_lead_id para criar o lead'
        ? 'erro_lead_fallback_payload_insuficiente'
        : 'erro_lead_fallback';
      return { acao: acaoFallback, erro: criado.erro, tentativas_rpc: tentativas, args };
    }
    leadFallback = { lead_id: criado.leadId as number };
    const retry = await sb.rpc('registrar_experimental', args);
    data = retry.data;
    error = retry.error;
    if (error) {
      return {
        acao: 'erro_rpc', rpc: 'registrar_experimental', erro: error.message, args,
        lead_fallback: leadFallback,
      };
    }
  }

  // Delta: só o que a RPC não conhece. Nunca bloqueia o resultado principal.
  let delta: unknown = null;
  const expId = data?.experimental_id ?? null;
  if (expId && observacoes) {
    try {
      delta = await aplicarDeltaExperimental(sb, Number(expId), observacoes);
    } catch (e: any) {
      delta = { erro_delta: String(e?.message ?? e) };
    }
  }

  // Data de nascimento a partir da EXPERIMENTAL, não do lead.
  //
  // O payload de experimental traz `aula.data_nascimento_aluno`, e é de longe a melhor fonte:
  // medido em 30 dias, vem preenchido em 88,9% das experimentais (177/199) contra 4,6% do
  // `lead_criado` (36/780) e 22,4% do `lead_editado`. Faz sentido — na criação do lead ninguém
  // pergunta a idade, mas para AGENDAR a experimental a secretaria precisa dela: é o que decide
  // LAMK (até 11 anos) x EMLA (12+) e o professor.
  //
  // Só preenche quando está vazio; o trigger `trg_calcular_faixa_etaria_lead` deriva a
  // `faixa_etaria` sozinho e também não sobrescreve o que foi posto à mão.
  let nascimento: unknown = null;
  const dataNascimento = textoOuNulo(aula?.data_nascimento_aluno);
  const leadIdAlvo = data?.lead_id ?? leadFallback?.lead_id ?? null;
  if (dataNascimento && leadIdAlvo) {
    try {
      const { data: linhas } = await sb
        .from('leads')
        .update({ data_nascimento: dataNascimento.substring(0, 10) })
        .eq('id', Number(leadIdAlvo))
        .is('data_nascimento', null)      // nunca sobrescreve o que já existe
        .select('id, data_nascimento, faixa_etaria');
      nascimento = linhas && linhas.length
        ? { gravado: linhas[0] }
        : { ignorado: 'lead ja tinha data_nascimento' };
    } catch (e: any) {
      nascimento = { erro: String(e?.message ?? e) };
    }
  }

  // Depois de gravar a nova, encerra o que ela substituiu. SÓ no reagendamento: é o
  // evento em que o Emusys declara que a experimental mudou de lugar. Em `criada` a
  // linha nova pode conviver legitimamente com outra (2º instrumento), e a grade ainda
  // nem sincronizou a aula recém-marcada — varrer ali cancelaria aula boa.
  // ⚠️ DESLIGADO em 07/08 (v9). A chamada a `encerrarExperimentaisSubstituidas` ficava aqui e
  // cancelou 7 aulas reais no único dia em que rodou. O campo continua no retorno, sempre null,
  // porque `automacao_log` já tem histórico com ele. Motivo completo e o desenho do substituto
  // (reconciliação por snapshot) no cabeçalho deste arquivo.
  const substituidas: unknown = null;

  return {
    acao: 'registrar_experimental',
    resultado: data,
    professor_via: professor.via,
    delta_observador: delta,
    nascimento_do_lead: nascimento,
    substituidas,
    lead_fallback: leadFallback,
    // >1 significa que a corrida com o webhook de lead aconteceu e o retry a absorveu.
    // Serve para saber se a espera está sendo usada e se a janela está bem dimensionada.
    tentativas_rpc: tentativas,
    args,
  };
}

/** Espelha o nó "Arquivar Lead no Supabase" do n8n: UPDATE direto (sem RPC), casando
 *  por unidade + status ainda não terminal + (emusys_lead_id OU telefone). */
async function processarArquivamento(sb: any, body: any, unidadeId: string, escrever: boolean) {
  const lead = body?.lead ?? {};
  const emusysLeadId = lead?.id ? Number(lead.id) : null;
  const telefone = normalizarTelefone(lead?.telefone);

  if (!emusysLeadId && !telefone) {
    return { acao: 'ignorado', motivo: 'sem lead.id e sem telefone — nada para casar' };
  }

  const motivo = textoOuNulo(lead?.arquivamento?.motivo_nome) ?? 'Arquivado via Emusys';
  const dataArquivamento =
    String(lead?.arquivamento?.data_hora ?? '').trim().substring(0, 10) ||
    new Date().toISOString().substring(0, 10);

  const ors: string[] = [];
  if (emusysLeadId) ors.push(`emusys_lead_id.eq.${emusysLeadId}`);
  if (telefone) ors.push(`telefone.eq.${telefone}`);
  const args = { emusys_lead_id: emusysLeadId, telefone, motivo, data_arquivamento: dataArquivamento };

  if (!escrever) {
    const { data } = await sb
      .from('leads')
      .select('id, nome, status')
      .eq('unidade_id', unidadeId)
      .not('status', 'in', '(convertido,matriculado)')
      .or(ors.join(','))
      .limit(1);
    const achado = data && data.length ? data[0] : null;
    return {
      acao: `arquivar_lead(dry) -> ${achado ? 'arquiva' : 'lead_not_found'}`,
      match: achado ? { lead_id: achado.id, nome: achado.nome, status_atual: achado.status } : null,
      args,
    };
  }

  const { data, error } = await sb
    .from('leads')
    .update({
      arquivado: true,
      status: 'arquivado',
      etapa_pipeline_id: 11,
      motivo_arquivamento: motivo,
      data_arquivamento: dataArquivamento,
      updated_at: new Date().toISOString(),
    })
    .eq('unidade_id', unidadeId)
    .not('status', 'in', '(convertido,matriculado)')
    .or(ors.join(','))
    .select('id, nome, status');

  if (error) return { acao: 'erro_update', erro: error.message, args };
  return { acao: 'arquivar_lead', resultado: data, args };
}

// -------------------------------------------------------------------- main ---

const EVENTOS_LEAD = ['lead_criado', 'lead_editado'];
const EVENTOS_EXP = ['aula_experimental_criada', 'aula_experimental_reagendada', 'aula_experimental_cancelada'];
const EVENTOS_ARQUIVAMENTO = ['lead_arquivado'];

// Eventos de MATRICULA que o observador recebe e repassa para quem processa.
//
// POR QUE ISSO EXISTE (incidente 13/08/2026)
// Ha DOIS cadastros de webhook por unidade no Emusys, com listas de eventos independentes:
//   Emusys --> este observador                      (direto)
//   Emusys --> webhook_matricula (n8n) --> processar-matricula-emusys
// Quando um evento e marcado no primeiro e esquecido no segundo, o payload chega aqui e
// **nada acontece no sistema**. Foi o que aconteceu com `matricula_aviso_previo_adicionado`
// na Barra: Catarina Perim e Liv Ribeiro Oliveira avisaram em 13/08 que sairiam em 01/10,
// o payload ficou no log e as duas seguiram `status='ativo'` sem nenhuma movimentacao.
// Ja tinha acontecido em 03/08 com `matricula_alterada` e `matricula_finalizacao` (20 evasoes
// do Recreio perdidas). O cadastro e manual e por unidade, entao repete a cada evento NOVO
// que o Emusys lanca — os 3 de aviso previo sao da v1.4.0, de 03/08, nasceram DEPOIS daquele
// acerto e por isso ficaram de fora.
//
// ⚠️ POR QUE REPASSAR EM VEZ DE PROCESSAR AQUI
// `handleAvisoPrevio` (processar-matricula-emusys) nao e um insert simples: resolve curso,
// casa o aluno em camadas, faz backfill de `emusys_matricula_id`, mapeia `motivos_saida`,
// deduplica por `emusys_aviso_previo_id` e ainda **adota** o lancamento manual equivalente
// (mesmo aluno + mes_saida sem id do Emusys) em vez de criar duplicata. Reimplementar isso
// aqui duplicaria regra de negocio pesada em duas edges, que divergiriam na primeira mudanca.
//
// ⚠️ SO OS 3 DE AVISO PREVIO, de proposito. O repasse e seguro porque `handleAvisoPrevio` e
// idempotente (busca `existente` por `emusys_aviso_previo_id` e faz UPDATE). Se um cadastro
// for corrigido no painel, o evento passa a chegar pelos dois caminhos e a edge recebe 2x —
// sem efeito. **Ampliar esta lista exige auditar a idempotencia do handler correspondente**;
// repassar `matricula_nova`/`matricula_renovacao` as cegas poderia duplicar matricula.
const EVENTOS_REPASSADOS_PARA_MATRICULA = [
  'matricula_aviso_previo_adicionado',
  'matricula_aviso_previo_editado',
  'matricula_aviso_previo_removido',
];

// Repassa o payload ORIGINAL para a edge que processa matricula.
//
// ⚠️ A chamada usa `Bearer SUPABASE_SERVICE_ROLE_KEY` e a edge de destino tem
// `verify_jwt = true` — funciona porque a chave injetada no runtime das edges e valida
// (confirmado em 13/08: `processar-matricula-emusys` chama `enviar-boas-vindas-matricula`
// pelo mesmo padrao, e as boas-vindas sairam as 11:43, 13:17, 15:00 e 18:13 do mesmo dia).
// ⚠️ NAO testar esse caminho com a chave de um `.env.local`: a chave legada foi desativada no
// projeto e devolve `401 UNAUTHORIZED_LEGACY_JWT`, o que parece falha de permissao e nao e.
//
// Nunca lanca: falha de repasse nao pode derrubar o observador, que ja gravou o payload bruto
// (passo 1) e portanto mantem o evento recuperavel de qualquer forma.
async function repassarParaProcessamentoMatricula(
  supabase: any,
  evento: string,
  body: any,
): Promise<void> {
  if (EVENTOS_REPASSADOS_PARA_MATRICULA.indexOf(evento) < 0) return;

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  let acao = 'repassado';
  let detalhes: any = {};

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/processar-matricula-emusys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const texto = await resp.text();
    if (!resp.ok) acao = 'repasse_falhou';
    detalhes = {
      destino: 'processar-matricula-emusys',
      http_status: resp.status,
      // o corpo diz QUAL desfecho o handler deu (aviso_previo_registrado / _adotado /
      // erro_aluno_nao_encontrado...), que e o que interessa para auditar depois
      resposta: texto.slice(0, 600),
    };
  } catch (e: any) {
    acao = 'repasse_falhou';
    detalhes = { destino: 'processar-matricula-emusys', erro: String(e?.message ?? e) };
    console.error('[observador/repasse] falha:', e?.message ?? e);
  }

  try {
    await supabase.from('automacao_log').insert({
      evento,
      acao,
      status: acao === 'repassado' ? 'ok' : 'erro',
      aluno_nome: extrairNome(body),
      unidade_nome: extrairUnidade(body),
      detalhes,
      workflow_id: 'observador-repasse',
      execution_id: new Date().toISOString(),
      idempotency_key: body?.id != null ? String(body.id) : null,
    });
  } catch (e: any) {
    console.error('[observador/repasse] falha ao gravar log:', e?.message ?? e);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // (0) TOKEN — só barra quando OBSERVADOR_TOKEN está configurado. Enquanto não estiver,
  // nada muda. Rejeição não grava payload (senão vira vetor de flood no log).
  if (!autorizado(req)) {
    console.warn('[observador] requisição sem token válido rejeitada');
    return new Response(JSON.stringify({ status: 'nao_autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any = null;
  let rawText = '';
  try {
    rawText = await req.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch (_e) {
    body = null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // (1) LOG BRUTO — idêntico à v1. Sempre primeiro.
  try {
    await supabase.from('automacao_log').insert({
      evento: body?.evento ?? 'observador_desconhecido',
      acao: 'webhook_observado_direto',
      aluno_nome: extrairNome(body),
      unidade_nome: extrairUnidade(body),
      payload_bruto: body ?? { raw_nao_json: rawText },
      detalhes: {
        headers_recebidos: coletarHeaders(req),
        // temporário: mede o token que está chegando antes de a trava ser ativada
        token_diagnostico: await diagnosticarToken(req),
      },
      workflow_id: 'debug-webhook-emusys-observador',
      execution_id: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[debug-webhook-emusys-observador] falha ao gravar log:', e?.message ?? e);
  }

  // (2) PROCESSAMENTO — lead, experimental e arquivamento. Matrícula só vira log bruto
  // aqui; quem processa é a edge `processar-matricula-emusys`.
  const evento: string = body?.evento ?? 'observador_desconhecido';
  const ehLead = EVENTOS_LEAD.indexOf(evento) >= 0;
  const ehExp = EVENTOS_EXP.indexOf(evento) >= 0;
  const ehArquivamento = EVENTOS_ARQUIVAMENTO.indexOf(evento) >= 0;

  if (ehLead || ehExp || ehArquivamento) {
    let resultado: any = null;
    const escrever = escreveDeVerdade(evento);
    let acao = escrever ? 'processado' : 'processado_sombra';
    try {
      const unidadeId = await resolverUnidade(supabase, body);
      if (!unidadeId) {
        resultado = {
          acao: 'ignorado',
          motivo: 'unidade nao resolvida',
          escola: body?.escola_nome ?? null,
          // sem o id não dá para saber QUAL linha falta em UNIDADE_POR_ESCOLA_ID
          escola_id: body?.escola_id ?? null,
        };
      } else if (ehLead) {
        resultado = await processarLead(supabase, body, unidadeId, escrever);
      } else if (ehExp) {
        resultado = await processarExperimental(supabase, body, unidadeId, evento, escrever);
      } else {
        resultado = await processarArquivamento(supabase, body, unidadeId, escrever);
      }
    } catch (e: any) {
      acao = 'erro_processamento';
      resultado = { erro: String(e?.message ?? e) };
      console.error('[observador/worker] falha ao processar:', e?.message ?? e);
    }
    // `status` alimenta o filtro da tela de Automações. Em sombra fica sempre 'ok'
    // (não escreveu, não há o que alertar); escrevendo de verdade, falha vira 'erro' e
    // "não achei em quem escrever" vira 'warn' — senão sumiria no meio do log.
    const acaoInterna = String(resultado?.acao ?? '');
    // ⚠️ Na escrita real o "não achei o lead" NÃO vem em `acao` — vem dentro do retorno
    // da RPC (`{success:false, reason:'lead_not_found'}`). A 1ª versão só olhava `acao`,
    // que é o formato do modo sombra, e deixava passar como 'ok' justamente o caso que
    // este campo existe para denunciar. Pego no smoke test do deploy (04/08).
    const rpcRecusou = resultado?.resultado != null
      && typeof resultado.resultado === 'object'
      && resultado.resultado.success === false;
    let status: 'ok' | 'warn' | 'erro' = 'ok';
    // 'erro_lead_fallback_payload_insuficiente' fica de fora do bucket genérico 'erro_*':
    // não é falha de sistema, é payload sem telefone/lead_id — nada para chavear a
    // criação do lead. Cai no ramo 'warn' logo abaixo, junto com 'colisao_telefone_familia'.
    if (
      acao === 'erro_processamento'
      || (acaoInterna.indexOf('erro_') === 0 && acaoInterna !== 'erro_lead_fallback_payload_insuficiente')
    ) {
      status = 'erro';
    } else if (
      escrever
      && (acaoInterna === 'ignorado'
        || acaoInterna === 'colisao_telefone_familia'
        || acaoInterna === 'erro_lead_fallback_payload_insuficiente'
        // telefone já é de outro lead: o fallback recuou de propósito, precisa de humano
        || acaoInterna === 'lead_existente_nao_casado'
        || acaoInterna.indexOf('lead_not_found') >= 0
        || rpcRecusou)
    ) {
      status = 'warn';
    }

    try {
      await supabase.from('automacao_log').insert({
        evento,
        acao,
        status,
        aluno_nome: extrairNome(body),
        unidade_nome: extrairUnidade(body),
        detalhes: resultado && typeof resultado === 'object'
          ? { ...resultado, modo: escrever ? 'escrita' : 'sombra' }
          : resultado,
        workflow_id: 'observador-worker',
        execution_id: new Date().toISOString(),
        idempotency_key: body?.id != null ? String(body.id) : null,
      });
    } catch (e: any) {
      console.error('[observador/worker] falha ao gravar resultado:', e?.message ?? e);
    }
  }

  // (3) REPASSE — evento de matrícula que chega aqui e não chega em quem processa.
  // Ver comentário em EVENTOS_REPASSADOS_PARA_MATRICULA. Nunca lança.
  await repassarParaProcessamentoMatricula(supabase, evento, body);

  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
