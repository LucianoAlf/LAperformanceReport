#!/usr/bin/env node
/**
 * Reenvio dos briefings de anamnese que nunca chegaram ao professor (2026-09-04).
 *
 * CONTEXTO: de junho a 31/08/2026 o canal de WhatsApp da Sol entregou apenas ~18%
 * dos briefings (36 de 201). O envio foi corrigido em 31/08 e desde então está em
 * 100%, mas 160 briefings ficaram para trás. Este script os reenvia escalonados.
 *
 * O QUE ELE FAZ:
 *   1. lê o escopo de `candidatos.sql` (fonte única — não reimplementar a regra aqui)
 *   2. calcula um cronograma respeitando DOIS tetos: por dia e por professor/dia
 *   3. chama a edge `notificar-anamnese` para cada um, com `modo: "reenvio"` e o
 *      `agendada_para` já calculado
 *
 * POR QUE `agendada_para` VAI NA CHAMADA, e não num UPDATE depois:
 *   a edge cria a linha com `agendada_para = now()`, e o worker roda a cada minuto
 *   pegando 10 por vez. Criar as linhas e só depois agendar abriria uma janela de
 *   segundos em que o worker despacharia as primeiras — exatamente a rajada que
 *   estamos tentando evitar. Por isso o parâmetro é obrigatório, e o script ABORTA
 *   se a edge em produção não o respeitar (versão antiga, sem o patch).
 *
 * MODOS:
 *   (default)     plano: lê, calcula, grava o CSV. Não toca em nada.
 *   --preview[=N] chama a edge com dry_run em N amostras (default 3) e mostra o texto.
 *   --executar    cria as linhas de verdade. Exige também --confirmo-envio.
 *
 * FLAGS:
 *   --inicio=YYYY-MM-DD   primeiro dia do cronograma (default: amanhã; pula fim de semana)
 *   --por-dia=N           teto diário global (default 50)
 *   --por-professor=N     teto por professor por dia (default 3)
 *   --intervalo=N         minutos entre mensagens (default 10)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const SQL_CANDIDATOS = path.join(AQUI, 'candidatos.sql');
const EDGE = 'notificar-anamnese';

const JANELA = { horaInicio: 9, horaFim: 18 }; // BRT
const TZ_OFFSET_BRT = 3; // BRT = UTC-3

function carregarEnv() {
  for (const arquivo of ['.env.local', '.env']) {
    const caminho = path.join(RAIZ, arquivo);
    if (!fs.existsSync(caminho)) continue;
    for (const linha of fs.readFileSync(caminho, 'utf8').split(/\r?\n/u)) {
      const m = linha.match(/^([A-Z0-9_]+)=(.*)$/u);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/gu, '');
    }
  }
}

function arg(nome, padrao) {
  const achado = process.argv.find((a) => a === `--${nome}` || a.startsWith(`--${nome}=`));
  if (!achado) return padrao;
  const [, valor] = achado.split('=');
  return valor === undefined ? true : valor;
}

function ehDiaUtil(d) {
  const dia = d.getUTCDay();
  return dia >= 1 && dia <= 5;
}

function proximoDiaUtil(d) {
  const r = new Date(d);
  while (!ehDiaUtil(r)) r.setUTCDate(r.getUTCDate() + 1);
  return r;
}

/** Converte dia (YYYY-MM-DD) + hora/minuto BRT em instante UTC. */
function slotParaUtc(diaISO, hora, minuto) {
  const horaUtc = String(hora + TZ_OFFSET_BRT).padStart(2, '0');
  return new Date(`${diaISO}T${horaUtc}:${String(minuto).padStart(2, '0')}:00.000Z`);
}

/**
 * Aloca cada candidato num horário respeitando os dois tetos.
 * A ordem de entrada manda (saúde primeiro, depois mais recente).
 * O rodízio por professor evita que alguém receba tudo no mesmo dia.
 */
function montarCronograma(candidatos, opcoes) {
  const { inicio, porDia, porProfessor, intervaloMin } = opcoes;
  const slotsPorDia = Math.floor(((JANELA.horaFim - JANELA.horaInicio) * 60) / intervaloMin);
  const tetoDia = Math.min(porDia, slotsPorDia);

  const porProf = new Map();
  for (const c of candidatos) {
    if (!porProf.has(c.professor_id)) porProf.set(c.professor_id, []);
    porProf.get(c.professor_id).push(c);
  }
  const fila = [];
  const maxRodadas = Math.max(...[...porProf.values()].map((v) => v.length));
  for (let rodada = 0; rodada < maxRodadas; rodada += 1) {
    for (const lista of porProf.values()) {
      if (lista[rodada]) fila.push({ ...lista[rodada], rodada: rodada + 1 });
    }
  }

  const agendados = [];
  const usoNoDia = new Map();
  const usoProfNoDia = new Map();
  const primeiroDia = proximoDiaUtil(new Date(`${inicio}T00:00:00.000Z`));

  for (const item of fila) {
    const cursor = new Date(primeiroDia);
    let colocado = false;
    let tentativas = 0;
    while (!colocado) {
      if (tentativas > 400) throw new Error('cronograma nao fechou em 400 dias — revise os tetos');
      const diaISO = cursor.toISOString().slice(0, 10);
      const totalDia = usoNoDia.get(diaISO) ?? 0;
      const chaveProf = `${diaISO}|${item.professor_id}`;
      const totalProf = usoProfNoDia.get(chaveProf) ?? 0;

      if (ehDiaUtil(cursor) && totalDia < tetoDia && totalProf < porProfessor) {
        const minutosDesdeInicio = totalDia * intervaloMin;
        const hora = JANELA.horaInicio + Math.floor(minutosDesdeInicio / 60);
        const minuto = minutosDesdeInicio % 60;
        agendados.push({
          ...item,
          dia_iso: diaISO,
          agendada_para: slotParaUtc(diaISO, hora, minuto).toISOString(),
        });
        usoNoDia.set(diaISO, totalDia + 1);
        usoProfNoDia.set(chaveProf, totalProf + 1);
        colocado = true;
      } else {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        tentativas += 1;
      }
    }
  }
  agendados.sort((a, b) => a.agendada_para.localeCompare(b.agendada_para));
  return agendados;
}

function novoCliente() {
  return new pg.Client({
    host: process.env.SUPABASE_DB_HOST,
    port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
    database: process.env.SUPABASE_DB_NAME ?? 'postgres',
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

async function chamarEdge(anamneseId, { dryRun, agendadaPara }) {
  const url = `${process.env.VITE_SUPABASE_URL}/functions/v1/${EDGE}`;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}`, apikey: chave },
    body: JSON.stringify({
      anamnese_id: anamneseId,
      dry_run: Boolean(dryRun),
      modo: 'reenvio',
      ...(agendadaPara ? { agendada_para: agendadaPara } : {}),
    }),
  });
  const texto = await resposta.text();
  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch {
    corpo = { _bruto: texto.slice(0, 500) };
  }
  if (!resposta.ok) throw new Error(`edge HTTP ${resposta.status}: ${texto.slice(0, 400)}`);
  return corpo;
}

async function main() {
  carregarEnv();
  const inicio = arg('inicio', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const porDia = Number(arg('por-dia', 50));
  const porProfessor = Number(arg('por-professor', 3));
  const intervaloMin = Number(arg('intervalo', 10));
  const executar = arg('executar', false);
  const confirmado = arg('confirmo-envio', false);
  const preview = arg('preview', false);

  if (!process.env.SUPABASE_DB_HOST || !process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('faltam SUPABASE_DB_* no .env.local');
  }

  const leitura = novoCliente();
  await leitura.connect();
  const { rows: candidatos } = await leitura.query(fs.readFileSync(SQL_CANDIDATOS, 'utf8'));
  await leitura.end();

  console.log(`candidatos: ${candidatos.length}`);
  console.log(`  com informacao de saude: ${candidatos.filter((c) => c.tem_info_saude).length}`);
  console.log(`  professores: ${new Set(candidatos.map((c) => c.professor_id)).size}`);

  const semTelefone = candidatos.filter((c) => !String(c.professor_telefone ?? '').trim());
  if (semTelefone.length) {
    console.error(`\nABORTADO: ${semTelefone.length} candidato(s) com professor sem telefone:`);
    for (const c of semTelefone) console.error(`  anamnese ${c.anamnese_id} — ${c.professor_nome}`);
    process.exit(1);
  }

  const cronograma = montarCronograma(candidatos, { inicio, porDia, porProfessor, intervaloMin });

  const resumo = new Map();
  for (const item of cronograma) {
    const atual = resumo.get(item.dia_iso) ?? { total: 0, saude: 0, profs: new Set() };
    atual.total += 1;
    if (item.tem_info_saude) atual.saude += 1;
    atual.profs.add(item.professor_id);
    resumo.set(item.dia_iso, atual);
  }
  console.log('\ncronograma:');
  for (const [dia, r] of [...resumo.entries()].sort()) {
    console.log(`  ${dia}  ${String(r.total).padStart(3)} msgs  (${r.saude} com saude, ${r.profs.size} professores)`);
  }

  const csv = ['agendada_para_utc,dia,anamnese_id,aluno,professor,unidade,tem_saude,anamnese_criada_em']
    .concat(cronograma.map((c) => [
      c.agendada_para,
      c.dia_iso,
      c.anamnese_id,
      JSON.stringify(c.nome_aluno),
      JSON.stringify(c.professor_nome),
      JSON.stringify(c.unidade ?? ''),
      c.tem_info_saude ? 'sim' : 'nao',
      new Date(c.anamnese_criada_em).toISOString().slice(0, 10),
    ].join(',')));
  const destinoCsv = path.join(AQUI, 'cronograma.csv');
  fs.writeFileSync(destinoCsv, csv.join('\n'), 'utf8');
  console.log(`\ncronograma salvo em ${destinoCsv}`);

  if (preview) {
    const quantos = preview === true ? 3 : Number(preview);
    console.log(`\n--- preview de ${quantos} (dry_run: nada e gravado) ---`);
    for (const item of cronograma.slice(0, quantos)) {
      const r = await chamarEdge(item.anamnese_id, { dryRun: true });
      console.log(`\n=== anamnese ${item.anamnese_id} — ${item.nome_aluno} -> ${item.professor_nome} ===`);
      console.log(r.message_preview ?? JSON.stringify(r).slice(0, 400));
    }
    return;
  }

  if (!executar) {
    console.log('\nmodo plano. Nada foi enviado nem gravado.');
    console.log('Ver o texto: --preview=3   |   Executar: --executar --confirmo-envio');
    return;
  }
  if (!confirmado) {
    console.error('\n--executar exige tambem --confirmo-envio. Nada foi feito.');
    process.exit(1);
  }

  // Prova de que a edge respeita `agendada_para`. Sem isso, criar as linhas
  // significaria disparo imediato pelo worker.
  const piloto = cronograma[0];
  const r0 = await chamarEdge(piloto.anamnese_id, { agendadaPara: piloto.agendada_para });
  if (!r0.queue_id) throw new Error(`piloto nao enfileirou: ${JSON.stringify(r0)}`);

  const escrita = novoCliente();
  await escrita.connect();
  const { rows: linhaPiloto } = await escrita.query(
    'select agendada_para from fila_anamnese_sol_hermes where id = $1',
    [r0.queue_id],
  );
  const respeitou = linhaPiloto[0]
    && new Date(linhaPiloto[0].agendada_para).getTime() > Date.now() + 60000;
  if (!respeitou) {
    await escrita.query(
      "update fila_anamnese_sol_hermes set agendada_para = $2 where id = $1 and status = 'sol_pendente'",
      [r0.queue_id, piloto.agendada_para],
    );
    await escrita.end();
    console.error('\nABORTADO: a edge em producao ignorou `agendada_para` (versao antiga).');
    console.error(`A linha ${r0.queue_id} foi reagendada a forca e NAO sera enviada agora.`);
    console.error('Aplique o patch do modo reenvio antes de continuar.');
    process.exit(1);
  }
  console.log(`piloto ok (fila ${r0.queue_id}, agendada para ${linhaPiloto[0].agendada_para}).`);

  let criadas = 1;
  const falhas = [];
  for (const item of cronograma.slice(1)) {
    try {
      const r = await chamarEdge(item.anamnese_id, { agendadaPara: item.agendada_para });
      if (r.queue_id) criadas += 1;
      else falhas.push({ anamnese_id: item.anamnese_id, resposta: r });
    } catch (e) {
      falhas.push({ anamnese_id: item.anamnese_id, erro: String(e).slice(0, 300) });
    }
  }
  await escrita.end();

  console.log(`\nenfileiradas: ${criadas}/${cronograma.length}`);
  if (falhas.length) {
    const destinoFalhas = path.join(AQUI, 'falhas.json');
    fs.writeFileSync(destinoFalhas, JSON.stringify(falhas, null, 2), 'utf8');
    console.error(`falhas: ${falhas.length} (detalhe em ${destinoFalhas})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
