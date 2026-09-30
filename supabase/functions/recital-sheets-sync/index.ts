// Edge Function: recital-sheets-sync
// Espelha o recital do LA Report para as planilhas do Drive (Fase 1: leitura).
//
//   - Planilha GERAL por unidade (abas Alunos / Ordem / Convidados / Staff)
//     criada na pasta "Recital 2026" da unidade e compartilhada explicitamente
//     com os e-mails da equipe (evento_sheets_destino.emails_equipe) — a pasta
//     da unidade so tem o dono, heranca NAO basta;
//   - Planilha do PROFESSOR (aba "Meus alunos" + Pendencias) dentro da pasta
//     dele — a pasta e criada quando falta e o share vai para usuarios.email
//     do professor como LEITOR. Sem e-mail -> status 'sem_email' + alerta no
//     automacao_log (nunca falha em silencio);
//   - Planilhas protegidas (so o dono do Drive edita; equipe/professor leem).
//
// ORDEM DO CICLO (decisao do Alf — a mesma que a Fase 2 vai usar):
//   1. LER o estado atual da aba;  2. "aplicar" = na Fase 1 so DETECTAR
//   divergencia (alguem editou por fora?) e logar;  3. REESCREVER a aba.
//   Nenhuma reescrita cega: se o diff da leitura for > 0 fora do rodape, a
//   corrida registra `divergencias_lidas` para a equipe saber que a planilha
//   foi tocada fora do LA Report.
//
// QUEM CHAMA: cron `recital-sheets-sync` a cada 15 min (x-sync-token do Vault)
// ou equipe com JWT proprio (botao "Atualizar planilhas") — dentro da funcao o
// JWT e trocado por usuarios.perfil/unidade: admin sincroniza qualquer evento,
// unidade so o dela. Usuario final nao chama; NUNCA vai service_role pro client.
//
// A ponte e o Apps Script do Alf (RECITAL_DRIVE_URL/TOKEN) — a MESMA do
// recital-drive-sync, que ja roda como a conta dele e protege a pasta raiz.
// As acoes de planilha foram adicionadas na versao 2 da ponte (ver
// ponte-apps-script.gs ao lado — deploy manual do Alf, igual ao playback).
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BRIDGE_URL = Deno.env.get('RECITAL_DRIVE_URL') ?? '';
const BRIDGE_TOKEN = Deno.env.get('RECITAL_DRIVE_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Comparacao em tempo constante — igual a do recital-drive-sync.
async function tokensIguaisEmTempoConstante(a: string, b: string) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const xa = new Uint8Array(ha);
  const xb = new Uint8Array(hb);
  let diff = xa.length ^ xb.length;
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    diff |= (xa[i % xa.length] ?? 0) ^ (xb[i % xb.length] ?? 0);
  }
  return diff === 0;
}

// POST /exec → (302) → GET echo. Mesmo contorno documentado no recital-drive-sync:
// o Google devolve 302 para script.googleusercontent.com/macros/echo, endpoint que
// so aceita GET — redirect:'manual' no POST e GET explicito no Location.
async function chamarPonte(payload: Record<string, unknown>) {
  const r1 = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'manual',
  });
  let resposta = r1;
  const location = r1.headers.get('location');
  if (r1.status >= 300 && r1.status < 400 && location) {
    resposta = await fetch(location);
  }
  const textoResposta = await resposta.text();
  try {
    return JSON.parse(textoResposta) as Record<string, unknown> & { ok?: boolean; erro?: string };
  } catch {
    return { ok: false, erro: `resposta_nao_json:${resposta.status}:${textoResposta.slice(0, 120)}` };
  }
}

// diff de conteudo ignorando o rodape ("espelho de …") — a Fase 1 so conta,
// nao aplica. divergencia > 0 = alguem editou a planilha protegida por fora.
function divergenciasDaAba(antiga: string[][], nova: string[][]) {
  const semRodape = (linhas: string[][]) =>
    (linhas ?? []).filter((l) => !String(l?.[0] ?? '').startsWith('espelho de '));
  const a = semRodape(antiga);
  const n = semRodape(nova);
  let diffs = Math.abs(a.length - n.length);
  const linhas = Math.min(a.length, n.length);
  for (let i = 0; i < linhas; i++) {
    const cols = Math.max(a[i].length, n[i].length);
    for (let j = 0; j < cols; j++) {
      if (String(a[i][j] ?? '') !== String(n[i][j] ?? '')) diffs += 1;
    }
  }
  return diffs;
}

const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
const hhmm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : '');
// timestamptz ISO → hora de Brasilia (check-in na planilha nao pode sair 3h adiantado)
const hhmmBrt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '';
const dur = (s: number | null | undefined) => (s ? Math.round(s) : '');

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth interna (3 portas, mesma familia do recital-drive-sync):
  //  1. Bearer service_role (operador/cron tecnico)
  //  2. x-sync-token validado no Vault (cron pg_cron — sem JWT de usuario)
  //  3. JWT de usuario de equipe (botao "Atualizar planilhas") — depois
  //     restrito ao evento da propria unidade ou admin
  const bearer = req.headers.get('authorization')?.match(/^Bearer[\t ]+([^\s]+)$/i)?.[1] ?? '';
  const syncToken = req.headers.get('x-sync-token')?.trim() ?? '';
  let autorizado = bearer.length > 0 && await tokensIguaisEmTempoConstante(bearer, SERVICE_KEY);
  let unidadeDoUsuario: string | null = null;
  if (!autorizado && syncToken) {
    const { data, error } = await service.rpc('validar_token_recital_drive_v1', { p_token: syncToken });
    autorizado = !error && data === true;
  }
  if (!autorizado && bearer) {
    // caminho do botao: JWT do usuario logado → resolve perfil/unidade no banco
    const { data: usuarioAuth } = await service.auth.getUser(bearer);
    if (usuarioAuth?.user) {
      const { data: u } = await service
        .from('usuarios')
        .select('perfil, unidade_id, ativo')
        .eq('auth_user_id', usuarioAuth.user.id)
        .maybeSingle();
      if (u?.ativo && (u.perfil === 'admin' || u.unidade_id)) {
        autorizado = true;
        unidadeDoUsuario = u.perfil === 'admin' ? null : u.unidade_id; // null = sem filtro
      }
    }
  }
  if (!autorizado) return json({ error: 'NAO_AUTENTICADO' }, 401);

  if (!BRIDGE_URL || !BRIDGE_TOKEN) return json({ error: 'ponte_nao_configurada' }, 500);

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* body vazio = corrida completa */ }
  const origem = corpo.origem === 'manual' ? 'manual' : 'cron';

  // destinos: uma linha por evento espelhado; o botao pode pedir um so
  let qDestino = service
    .from('evento_sheets_destino')
    .select('id, evento_id, unidade_id, pasta_recital_id, emails_equipe, planilha_geral_id')
    .eq('ativo', true);
  if (typeof corpo.evento_id === 'number') qDestino = qDestino.eq('evento_id', corpo.evento_id);
  if (unidadeDoUsuario) qDestino = qDestino.eq('unidade_id', unidadeDoUsuario); // equipe so a dela
  const { data: destinos, error: erroDestino } = await qDestino;
  if (erroDestino) return json({ error: erroDestino.message }, 500);
  if (!destinos?.length) return json({ ok: true, corridas: 0, detalhe: 'nenhum destino ativo' });

  const resumo = { ok: true, corridas: 0, planilhas: 0, professores_ok: 0, erros: [] as unknown[] };

  for (const dest of destinos) {
    const inicio = Date.now();
    const errosCorrida: Record<string, unknown>[] = [];
    let planilhasEscritas = 0;
    let professoresOk = 0;
    let divergencias = 0;

    const falha = (escopo: string, erro: string) => {
      errosCorrida.push({ escopo, erro: String(erro).slice(0, 400) });
      resumo.erros.push({ evento_id: dest.evento_id, escopo, erro: String(erro).slice(0, 400) });
    };

    try {
      const { data: evento } = await service
        .from('evento')
        .select('id, titulo, data_evento, data_fim, unidade_id, unidades(nome)')
        .eq('id', dest.evento_id)
        .single();
      if (!evento) { falha('evento', 'destino sem evento'); continue; }
      const unidadeNome = (evento as any).unidades?.nome ?? 'Unidade';

      // pasta "Recital 2026" da unidade: cacheada no destino; quando falta, a
      // edge resolve a cadeia Raiz → <unidade> → "Recital 2026" (cria o que faltar)
      let pastaRecital = dest.pasta_recital_id;
      if (!pastaRecital) {
        const pastaUnidade = await chamarPonte({ token: BRIDGE_TOKEN, acao: 'garantir_pasta', nome: unidadeNome });
        if (!pastaUnidade.ok || !pastaUnidade.id) { falha('pasta_unidade', pastaUnidade.erro ?? 'falha'); continue; }
        const pastaRec = await chamarPonte({ token: BRIDGE_TOKEN, acao: 'garantir_pasta', pastaPai: pastaUnidade.id, nome: 'Recital 2026' });
        if (!pastaRec.ok || !pastaRec.id) { falha('pasta_recital', pastaRec.erro ?? 'falha'); continue; }
        pastaRecital = pastaRec.id as string;
        await service.from('evento_sheets_destino').update({ pasta_recital_id: pastaRecital }).eq('id', dest.id);
      }

      const [rBlocos, rAps, rPart, rConv, rPonte, rCheckin, rStaff, rRelatorios] = await Promise.all([
        service.from('evento_bloco')
          .select('id, nome, ordem, data, horario_inicial')
          .eq('evento_id', dest.evento_id).order('ordem'),
        service.from('evento_apresentacao')
          .select('id, bloco_id, ordem, tipo, titulo, pessoa_chave, aluno_id, professor_id,' +
            ' musica, musica_artista, musica_link, duracao_segundos, tem_playback,' +
            ' playback_path, observacao_mapa, unidade_origem_id,' +
            ' alunos(nome), cursos(nome),' +
            ' professor:professores!evento_apresentacao_professor_id_fkey(nome),' +
            ' unidade_origem:unidades!unidade_origem_id(nome)')
          .eq('evento_id', dest.evento_id)
          .order('ordem'),
        service.from('evento_participacao')
          .select('id, pessoa_chave, aluno_id, status, convidados, formatura, formatura_tipo,' +
            ' unidade_origem_id, alunos(nome), unidade_origem:unidades!unidade_origem_id(nome)')
          .eq('evento_id', dest.evento_id),
        service.from('evento_convidado')
          .select('id, nome, tipo_entrada, bloco_id')
          .eq('evento_id', dest.evento_id).order('nome'),
        service.from('evento_convidado_participacao')
          .select('convidado_id, evento_participacao!inner(evento_id, alunos(nome))')
          .eq('evento_participacao.evento_id', dest.evento_id),
        service.from('evento_convidado_checkin')
          .select('convidado_id, checkin_em'),
        service.from('evento_staff')
          .select('funcao, funcao_outra, bloco_id, staff_unidade(nome)')
          .eq('evento_id', dest.evento_id),
        service.rpc('evento_relatorios_v1', { p_evento_id: dest.evento_id }),
      ]);
      const erroFonte = rBlocos.error ?? rAps.error ?? rPart.error ?? rConv.error
        ?? rPonte.error ?? rCheckin.error ?? rStaff.error ?? rRelatorios.error;
      if (erroFonte) { falha('leitura_banco', erroFonte.message); continue; }

      const blocoPorId = new Map((rBlocos.data ?? []).map((b) => [b.id, b]));
      const partPorChave = new Map((rPart.data ?? []).map((p) => [p.pessoa_chave, p]));
      const relPorApresentacao = new Map(
        ((rRelatorios.data ?? []) as any[]).map((r) => [r.apresentacao_id, r]),
      );
      const alunosPorConv = new Map<number, string[]>();
      for (const p of (rPonte.data ?? []) as any[]) {
        const nome = p.evento_participacao?.alunos?.nome;
        if (!nome) continue;
        alunosPorConv.set(p.convidado_id, [...(alunosPorConv.get(p.convidado_id) ?? []), nome]);
      }
      const checkinPorConv = new Map<number, string>();
      for (const c of rCheckin.data ?? []) checkinPorConv.set(c.convidado_id, c.checkin_em);

      const relatorioRotulo = (rel: any) =>
        !rel ? '—' : rel.aprovado_em ? 'aprovado' : rel.enviado_em ? 'enviado' : 'em edição';
      const playbackRotulo = (ap: any) =>
        ap.playback_path ? '✅ anexado' : ap.tem_playback ? '⬜ falta' : '—';
      const pendenciasDe = (ap: any, rel: any) => {
        const f = [];
        if (!ap.musica) f.push('música');
        if (!ap.duracao_segundos) f.push('duração');
        if (ap.tem_playback && !ap.playback_path) f.push('playback');
        if (rel && !rel.aprovado_em) f.push('relatório');
        return f.join(', ') || '—';
      };

      // ── abas da planilha GERAL ─────────────────────────────────────────
      const rodape = [[`espelho de ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — LA Report`]];

      const abaAlunos = [
        ['Ordem', 'Aluno', 'Curso', 'Professor', 'Unidade origem', 'Música', 'Artista',
          'Duração (s)', 'Playback', 'Link', 'Rider/Obs mapa', 'Convidados', 'Participa?',
          'Formatura', 'Relatório'],
        ...(rAps.data ?? []).filter((a: any) => a.tipo === 'aluno').map((a: any) => {
          const part = partPorChave.get(a.pessoa_chave);
          const rel = relPorApresentacao.get(a.id);
          return [
            a.ordem ?? '', a.alunos?.nome ?? '', a.cursos?.nome ?? '', a.professor?.nome ?? '',
            a.unidade_origem?.nome ?? '—', a.musica ?? '', a.musica_artista ?? '',
            dur(a.duracao_segundos), playbackRotulo(a), a.musica_link ?? '',
            a.observacao_mapa ?? '', part?.convidados ?? 0,
            part?.status === 'participa' ? 'sim' : part?.status === 'nao' ? 'não' : 'a definir',
            part?.formatura ? `formatura ${part.formatura_tipo}` : '', relatorioRotulo(rel),
          ];
        }),
        ...rodape,
      ];

      const abaOrdem = [
        ['Bloco', 'Data', 'Início', 'Ordem', 'Quem/Número', 'Música', 'Duração', 'Tipo'],
        ...(rAps.data ?? []).map((a: any) => {
          const b = blocoPorId.get(a.bloco_id);
          return [
            b?.nome ?? '', dt(b?.data), hhmm(b?.horario_inicial), a.ordem ?? '',
            a.tipo === 'aluno' ? `${a.alunos?.nome ?? ''} — ${a.cursos?.nome ?? ''}` : (a.titulo ?? a.tipo),
            a.musica ?? '', dur(a.duracao_segundos), a.tipo,
          ];
        }),
        ...rodape,
      ];

      // LGPD: nome + vinculo apenas — contato/documento/venda NUNCA saem
      const abaConvidados = [
        ['Bloco', 'Convidado', 'Aluno(s) vinculado(s)', 'Entrada', 'Check-in'],
        ...(rConv.data ?? []).map((c: any) => [
          blocoPorId.get(c.bloco_id)?.nome ?? '', c.nome,
          (alunosPorConv.get(c.id) ?? []).join(', '), c.tipo_entrada,
          checkinPorConv.get(c.id) ? `✓ ${hhmmBrt(checkinPorConv.get(c.id))}` : '',
        ]),
        ...rodape,
      ];

      const abaStaff = [
        ['Nome', 'Função', 'Bloco'],
        ...(rStaff.data ?? []).map((s: any) => [
          s.staff_unidade?.nome ?? '',
          s.funcao === 'outra' ? (s.funcao_outra ?? 'outra') : s.funcao,
          blocoPorId.get(s.bloco_id)?.nome ?? '',
        ]),
        ...rodape,
      ];

      // ── sincroniza a planilha GERAL da unidade ─────────────────────────
      const nomeGeral = `Recital 2026 — ${unidadeNome} — Geral`;
      let planilhaGeralId = dest.planilha_geral_id;
      if (!planilhaGeralId) {
        const r = await chamarPonte({ token: BRIDGE_TOKEN, acao: 'garantir_planilha', pastaPai: pastaRecital, nome: nomeGeral });
        if (!r.ok || !r.id) { falha('planilha_geral', r.erro ?? 'nao_criada'); continue; }
        planilhaGeralId = r.id as string;
        await service.from('evento_sheets_destino').update({ planilha_geral_id: planilhaGeralId }).eq('id', dest.id);
      }

      for (const [aba, linhas] of Object.entries({
        'Alunos': abaAlunos, 'Ordem': abaOrdem, 'Convidados': abaConvidados, 'Staff': abaStaff,
      })) {
        // ORDEM APROVADA: ler -> detectar -> reescrever (na Fase 1 "aplicar" e so deteccao)
        const leitura = await chamarPonte({ token: BRIDGE_TOKEN, acao: 'ler_aba', planilha: planilhaGeralId, aba });
        if (leitura.ok && Array.isArray(leitura.linhas)) {
          divergencias += divergenciasDaAba(leitura.linhas as string[][], linhas as string[][]);
        }
        const escrita = await chamarPonte({
          token: BRIDGE_TOKEN, acao: 'reescrever_aba',
          planilha: planilhaGeralId, aba, linhas, proteger: true,
        });
        if (!escrita.ok) falha(`aba_${aba}`, escrita.erro ?? 'falha_escrita');
        else planilhasEscritas += 1;
      }
      if (dest.emails_equipe?.length) {
        const share = await chamarPonte({
          token: BRIDGE_TOKEN, acao: 'compartilhar', arquivo: planilhaGeralId,
          emails: dest.emails_equipe, papel: 'reader',
        });
        if (!share.ok) falha('share_geral', share.erro ?? 'falha_share');
      }

      // ── planilha de cada professor ─────────────────────────────────────
      const profIds = [...new Set(
        (rAps.data ?? []).filter((a: any) => a.tipo === 'aluno' && a.professor_id).map((a: any) => a.professor_id),
      )] as number[];
      const { data: profs } = profIds.length
        ? await service.from('professores')
            .select('id, nome, nome_preferido, usuario_id, email_google, usuarios:usuario_id(email)')
            .in('id', profIds)
        : { data: [] };
      const profPorId = new Map((profs ?? []).map((p: any) => [p.id, p]));

      for (const profId of profIds) {
        const prof = profPorId.get(profId);
        const nomeProf = prof?.nome_preferido || prof?.nome || `Professor ${profId}`;
        // compartilhamento do Drive exige conta Google: prefere o email_google
        // do cadastro (a maioria nao tem usuario; quem tem usa @la.internal,
        // login sintetico que o Drive nao aceita — trata como sem_email)
        const emailBruto = (prof?.email_google || prof?.usuarios?.email || '').trim();
        const email = emailBruto && !emailBruto.endsWith('@la.internal') ? emailBruto : null;
        const linhasProf = [
          ['Aluno', 'Curso', 'Música', 'Artista', 'Duração (s)', 'Playback', 'Link', 'Rider', 'Obs', 'Relatório', 'Pendências'],
          ...(rAps.data ?? [])
            .filter((a: any) => a.tipo === 'aluno' && a.professor_id === profId)
            .map((a: any) => {
              const rel = relPorApresentacao.get(a.id);
              return [
                a.alunos?.nome ?? '', a.cursos?.nome ?? '', a.musica ?? '', a.musica_artista ?? '',
                dur(a.duracao_segundos), playbackRotulo(a), a.musica_link ?? '', a.observacao_mapa ?? '',
                '', relatorioRotulo(rel), pendenciasDe(a, rel),
              ];
            }),
          ...rodape,
        ];

        if (!email) {
          await service.from('evento_sheets_professor').upsert({
            evento_id: dest.evento_id, professor_id: profId, unidade_id: dest.unidade_id,
            status: 'sem_email', ultimo_erro: null,
          }, { onConflict: 'evento_id,professor_id' });
          await service.from('automacao_log').insert({
            evento: 'recital_sheets_sync', acao: 'sem_email_professor', status: 'warn',
            detalhes: `Professor ${nomeProf} (id ${profId}) sem usuarios.email — planilha nao compartilhada.`,
            unidade_nome: unidadeNome,
          });
          continue;
        }

        try {
          const pasta = await chamarPonte({
            token: BRIDGE_TOKEN, acao: 'garantir_pasta',
            pastaPai: pastaRecital, nome: nomeProf,
          });
          if (!pasta.ok || !pasta.id) throw new Error(pasta.erro ?? 'pasta_nao_criada');
          const { data: profRow } = await service.from('evento_sheets_professor')
            .select('planilha_id').eq('evento_id', dest.evento_id).eq('professor_id', profId).maybeSingle();
          let planilhaId = profRow?.planilha_id;
          if (!planilhaId) {
            const pl = await chamarPonte({
              token: BRIDGE_TOKEN, acao: 'garantir_planilha',
              pastaPai: pasta.id, nome: `Recital 2026 — ${nomeProf}`,
            });
            if (!pl.ok || !pl.id) throw new Error(pl.erro ?? 'planilha_nao_criada');
            planilhaId = pl.id as string;
          }
          // ler -> detectar -> reescrever (mesma ordem da geral)
          const leituraProf = await chamarPonte({ token: BRIDGE_TOKEN, acao: 'ler_aba', planilha: planilhaId, aba: 'Meus alunos' });
          if (leituraProf.ok && Array.isArray(leituraProf.linhas)) {
            divergencias += divergenciasDaAba(leituraProf.linhas as string[][], linhasProf as string[][]);
          }
          const escritaProf = await chamarPonte({
            token: BRIDGE_TOKEN, acao: 'reescrever_aba',
            planilha: planilhaId, aba: 'Meus alunos', linhas: linhasProf, proteger: true,
          });
          if (!escritaProf.ok) throw new Error(escritaProf.erro ?? 'falha_escrita');
          const share = await chamarPonte({
            token: BRIDGE_TOKEN, acao: 'compartilhar', arquivo: planilhaId,
            emails: [email], papel: 'reader',
          });
          if (!share.ok) throw new Error(share.erro ?? 'falha_share');

          await service.from('evento_sheets_professor').upsert({
            evento_id: dest.evento_id, professor_id: profId, unidade_id: dest.unidade_id,
            pasta_id: pasta.id, planilha_id: planilhaId, email, status: 'ok', ultimo_erro: null,
          }, { onConflict: 'evento_id,professor_id' });
          planilhasEscritas += 1;
          professoresOk += 1;
        } catch (e) {
          const msg = (e as Error).message;
          falha(`prof_${nomeProf}`, msg);
          await service.from('evento_sheets_professor').upsert({
            evento_id: dest.evento_id, professor_id: profId, unidade_id: dest.unidade_id,
            status: 'erro', ultimo_erro: msg.slice(0, 400),
          }, { onConflict: 'evento_id,professor_id' });
          await service.from('automacao_log').insert({
            evento: 'recital_sheets_sync', acao: 'drive_erro', status: 'erro',
            detalhes: `Professor ${nomeProf}: ${msg.slice(0, 300)}`, unidade_nome: unidadeNome,
          });
        }
      }

      resumo.corridas += 1;
      resumo.planilhas += planilhasEscritas;
      resumo.professores_ok += professoresOk;
    } catch (e) {
      falha('corrida', (e as Error).message);
    } finally {
      // corrida grava SEMPRE — inclusive nos `continue` de falha, senao o erro
      // so existe na resposta ao chamador e o cron perde o rastro
      await service.from('evento_sheets_corrida').insert({
        evento_id: dest.evento_id, unidade_id: dest.unidade_id, origem,
        duracao_ms: Date.now() - inicio, planilhas_escritas: planilhasEscritas,
        professores_ok: professoresOk, divergencias_lidas: divergencias,
        erros: errosCorrida,
      });
    }
  }

  resumo.ok = resumo.erros.length === 0;
  return json(resumo);
});
