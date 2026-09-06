#!/usr/bin/env node
// A TOOL DA AGENDA DA ESCOLA (06/09/2026).
//
// O guard nos crons ja impede a Mila de falar em dia sem expediente, e o
// envelope ja a faz avisar ANTES. Falta o terceiro caso: alguem PERGUNTAR.
// "amanha tem aula?", "a escola abre no feriado?", "semana que vem tem
// recesso?" — sem esta tool ela responderia de intuicao, que e exatamente o
// erro que a base de conhecimento existe para nao repetir.
//
// 🔴 A FONTE E A GRADE, nao uma tabela de feriado. `escola_agenda_v1` compara
//    as aulas vivas do dia com a mediana do mesmo dia da semana nas 8 semanas
//    anteriores. 07/09/2026: 1 aula viva contra tipico de 319.
//
// ⚠️ `tem_expediente: null` significa **nao sei** (data fora do horizonte do
//    sync), NUNCA "fechado". A descricao diz isso com todas as letras porque o
//    erro natural do modelo e ler null como false e anunciar feriado que nao
//    existe.
//
// ⚠️ Fica em LEITURA (todo mundo do time ve): saber se a escola abre nao e
//    material sensivel, e a consultora precisa disso tanto quanto a diretoria.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-tool-agenda-escola-06set.mjs <mila-gestao-tools-mcp.mjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── declaracao, no fim de LEITURA ───────────────────────────────────────────
trocar(
  `    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao hoje).' } } } },
];`,
  `    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao hoje).' } } } },
  { name: 'agenda_da_escola',
    description: 'A ESCOLA ABRE? Responde se ha expediente num dia ou num intervalo — cobre FERIADO, RECESSO ESCOLAR e ponte. Use sempre que perguntarem "amanha tem aula?", "a escola abre no feriado?", "tem aula na semana que vem?", ou antes de prometer qualquer coisa marcada para uma data. Devolve por dia: aulas_vivas, tipico (o normal daquele dia da semana) e situacao (normal | expediente_reduzido | sem_expediente | desconhecido). 🔴 `+"`tem_expediente: null`"+` quer dizer NAO SEI (data alem do horizonte da grade) — NUNCA leia como fechado e nunca anuncie feriado com base nisso; diga que nao consegue ver tao longe. ⚠️ A fonte e a GRADE de aulas, nao um calendario cadastrado: por isso ela sabe de recesso e ponte tambem, mas nao sabe o NOME do feriado — nao invente o motivo, diga apenas que nao ha aula.',
    inputSchema: { type: 'object', properties: {
      de: { type: 'string', description: 'YYYY-MM-DD (padrao hoje).' },
      ate: { type: 'string', description: 'YYYY-MM-DD (padrao = igual a "de"). Use para varrer a semana.' } } } },
];`,
  'declaracao de agenda_da_escola');

// ── despacho ────────────────────────────────────────────────────────────────
trocar(
  `    case 'consultar_base_comercial':`,
  `    case 'agenda_da_escola':
      // ⚠️ Sem p_unidade_id: feriado nacional fecha as tres. Unidade so
      //    importaria para fechamento isolado (obra, falta de luz), e ai a
      //    pergunta e outra.
      return j(await rpc('escola_agenda_v1', {
        ...(a.de ? { p_de: a.de } : {}), ...(a.ate ? { p_ate: a.ate } : {}), p_unidade_id: null }));
    case 'consultar_base_comercial':`,
  'despacho de agenda_da_escola');

fs.writeFileSync(alvo, src);
console.log(`\nescrito ${alvo}  (${antes} -> ${src.length} bytes)`);
