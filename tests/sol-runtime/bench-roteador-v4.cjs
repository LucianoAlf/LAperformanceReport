#!/usr/bin/env node
// BANCADA DO ROTEADOR V4 — compara modelos com o MESMO prompt e os MESMOS casos.
//
// 🔴 POR QUE NAO E' UM REPLAY DO SHADOW: o `caixa.log` **nao guarda o corpo das
// mensagens** (nem o `bridge.log`, nem `sol_caixa_lancamento_auditoria`, e a
// `sol_caixa_ingestao_recebimentos.raw_text` parou de ser escrita em 15/08).
// Rodar o shadow historico de novo e' impossivel: o texto nao existe em lugar
// nenhum. O que existe e' melhor para decidir: um conjunto ROTULADO, montado a
// partir dos casos reais da auditoria de 03-05/09 — inclusive os que a gramatica
// errou. Conjunto rotulado mede ACERTO; replay so mede concordancia.
// (A partir de agora o shadow grava o texto truncado, entao daqui pra frente o
//  replay de verdade passa a ser possivel.)
//
// Uso:
//   node bench-roteador-v4.cjs                      # todos os modelos
//   node bench-roteador-v4.cjs deepseek-v4-flash    # um so
'use strict';
const fs = require('fs');

// 🔴 A BANCADA CHAMA O ROTEADOR DE PRODUCAO, nao uma copia do prompt. Manter um
// prompt paralelo aqui seria o mesmo erro que ja produziu as duplicatas de
// renovacao e as duas regex de multi-aluno: duas fontes da mesma regra.
// O modelo troca por env (SOL_CAIXA_V4_MODELO), que e' como producao escolhe.
const RUNTIME = process.env.SOL_CAIXA_RUNTIME
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
const M = require(RUNTIME);

const MODELOS = process.argv[2] ? [process.argv[2]] : [
  'deepseek-v4-flash',
  'glm-5.3-flash',
  // ⚠️ `quen-3.8-flash` e `muse-spark-1.3-contributor` NAO existem nesta conta:
  // a API responde 401 `Model X is not supported` (testadas tambem as grafias
  // qwen-3.8-flash / qwen3.8-flash / muse-spark-1.3). Ficam fora da bancada.
];

// ── os casos, todos vindos dos grupos ───────────────────────────────────────
const CARD_PARCELA = [{ card: 1, valor: 377, forma: 'cartao', categoria: 'parcela', aluno: 'Moisés Martins Francisco Ribeiro', competencia: '09/2026' }];
const CARD_MULTI = [{ card: 1, valor: 395, forma: 'pix', categoria: 'parcela', aluno: "Márcio Sant'Anna", competencia: '09/2026' }];
const SEM_CARD = [];

const CASOS = [
  // ── os que a gramatica errou em 05/09 (o motivo desta bancada) ──
  { id: 'multi-vitoria-1', ctx: CARD_MULTI, esperado: 'lancamento_multi_aluno',
    texto: "sol, são pagamentos de 3 parcelas juntas, Márcio Sant'Anna - R$395,00\nValentina Cortes Santanna - R$468,16\nMaria Luiza Cortes Sant'Anna - R$385,00" },
  { id: 'multi-vitoria-2', ctx: CARD_MULTI, esperado: 'lancamento_multi_aluno',
    texto: "sol, são 3 parcelas de alunos diferente mas o valor esta unificado.\nos alunos e parcela de cada são:\nMárcio Sant'Anna - R$395,00\nValentina Cortes Santanna - R$468,16\nMaria Luiza Cortes Sant'Anna - R$385,00\n\nque da o total do comprovante enviado, R$1.248,16" },
  { id: 'corrige-forma-jhon', ctx: CARD_PARCELA, esperado: 'corrigir_forma',
    texto: 'Muda a forma de pagamento, foi Pix sol' },
  { id: 'corrige-forma-curta', ctx: CARD_PARCELA, esperado: 'corrigir_forma',
    texto: 'Sol, foi pix' },
  { id: 'corrige-competencia', ctx: [{ card: 1, valor: 640, forma: 'pix', categoria: 'parcela', aluno: 'Francisco Adilson Costa Ribeiro', competencia: '08/2026' }],
    esperado: 'corrigir_competencia', texto: 'é a parcela de 08/26 e 09/26 juntas' },

  // ── a maior lacuna medida: saida de dinheiro ditada por texto ──
  { id: 'saida-compra', ctx: SEM_CARD, esperado: 'saida_dinheiro', texto: 'comprei água pro bebedouro, 45 reais' },
  { id: 'saida-motoboy', ctx: SEM_CARD, esperado: 'saida_dinheiro', texto: 'paguei o motoboy 30' },
  { id: 'saida-retirada', ctx: SEM_CARD, esperado: 'saida_dinheiro', texto: 'retirei 200 do caixa pro cofre' },
  { id: 'saida-vale', ctx: SEM_CARD, esperado: 'saida_dinheiro', texto: 'vale de R$ 100 pra Ana, desconta depois' },

  // ── aprovacao: SO conta quando ainda ha card na mesa ──
  { id: 'aprovar-pode', ctx: CARD_PARCELA, esperado: 'aprovar', texto: 'Pode' },
  { id: 'aprovar-pode-card', ctx: CARD_PARCELA, esperado: 'aprovar', texto: 'pode lançar o card 1' },
  // ⚠️ O rotulo aqui e' `conversa`, nao `nada`: e' o que o proprio prompt manda
  // ("sem card, 'pode' sozinho e conversa"). Rotular `nada` era contradizer a
  // regra que estamos avaliando — o modelo acertava e a bancada dizia que errou.
  { id: 'aprovar-sem-card', ctx: SEM_CARD, esperado: 'conversa', texto: 'Pode' },

  // ── lancamento por texto (o formato que a equipe usa o dia inteiro) ──
  { id: 'texto-moises', ctx: SEM_CARD, esperado: 'lancamento_por_texto',
    texto: 'PG parcela 09/26\nAluno: Moisés Martins Francisco Ribeiro\nLA CG - R$377,00' },
  { id: 'texto-heiton', ctx: SEM_CARD, esperado: 'lancamento_por_texto',
    texto: 'PG parcela 09/26\nAluno: Heiton Fernando Alves Da Paixão\nLA CG - R$387,00' },

  // ── correcoes de aluno e descarte ──
  { id: 'corrige-aluno', ctx: [{ card: 1, valor: 734, forma: 'pix', categoria: 'outro', aluno: null }],
    esperado: 'corrigir_aluno', texto: 'aluno: Kamilly Azevedo da Silva' },
  { id: 'descartar', ctx: CARD_PARCELA, esperado: 'descartar', texto: 'esquece esse aí, mandei errado' },
  { id: 'contesta-fatura', ctx: [{ card: 1, valor: 460, forma: 'pix', categoria: 'parcela', aluno: 'Sérgio Guerrera', competencia: '08/2026' }],
    esperado: 'contestar_fatura', texto: 'essa parcela não está vencida, já foi corrigido no sistema' },

  // ── caixa ──
  { id: 'consulta', ctx: SEM_CARD, esperado: 'consulta_caixa', texto: 'sol, quanto entrou hoje?' },
  { id: 'fechar', ctx: SEM_CARD, esperado: 'fechar_caixa', texto: 'sol, pode fechar o caixa' },
  { id: 'reabrir', ctx: SEM_CARD, esperado: 'reabrir_caixa', texto: 'sol, pode abrir o caixa novamente' },

  // ── e o que NAO pode virar comando (o lado caro do erro) ──
  { id: 'conversa-elogio', ctx: SEM_CARD, esperado: 'conversa', texto: 'Caraca, a Sol ta ficando braba hein' },
  { id: 'conversa-bug', ctx: CARD_PARCELA, esperado: 'conversa', texto: 'Só tá dando pequenos bugs, mas pô, tá braba' },
  { id: 'conversa-erros', ctx: CARD_PARCELA, esperado: 'conversa', texto: 'Erros acontecem, mas ela ta corrigindo rapido uns ne, mt bom' },
  { id: 'nada-alheio', ctx: SEM_CARD, esperado: 'nada', texto: 'bom dia gente, alguém viu a chave da sala 3?' },
  // 🔴 O caso de 31/08: prosa com valor NAO pode virar lancamento nem saida.
  { id: 'prosa-com-valor', ctx: SEM_CARD, esperado: 'conversa',
    texto: 'vale confirmar com o Arthur, mas acho que o fechamento de ontem deu R$ 633 a menos do que a gente esperava, depois eu confiro com calma' },
];

// 🔴 VARIANCIA DO PROVEDOR, medida em 05/09: a MESMA requisicao ao
// deepseek-v4-flash levou 1,1s / 13,8s / 20,5s / 45,3s em 4 tentativas seguidas.
// Nao e' tamanho de prompt (comprimir de 1900 para 1171 chars nao mudou, e
// separar system/user PIOROU) nem e' o modelo — e' fila do lado do provedor.
// Por isso a MEDIANA e' a leitura util aqui e a CAUDA e' o que decide o flip:
// em sombra um p99 gordo custa uma observacao; na frente, congela o grupo.
// Uma medida = uma chamada ao roteador REAL, com o modelo em env.
async function medir(caso, modelo) {
  process.env.SOL_CAIXA_V4_MODELO = modelo;
  const t0 = Date.now();
  let r = null, erro = null;
  try { r = await M.rotearMensagemV4(caso.texto, caso.ctx); }
  catch (e) { erro = String(e.message || e).slice(0, 40); }
  const ms = Date.now() - t0;
  if (!r && !erro) erro = 'sem_resposta';
  return { ...caso, ms, erro, got: r && String(r.intencao || ''), conf: r && r.confianca,
           acertou: !!r && String(r.intencao || '') === caso.esperado };
}

async function emLotes(itens, n, fn) {
  const out = [];
  const pausa = Number(process.env.BENCH_PAUSA_MS || 0);
  for (let i = 0; i < itens.length; i += n) {
    out.push(...await Promise.all(itens.slice(i, i + n).map(fn)));
    if (pausa) await new Promise((r) => setTimeout(r, pausa));
  }
  return out;
}

(async () => {
  const placar = [];
  for (const modelo of MODELOS) {
    process.stdout.write('\n### ' + modelo + '\n');
    // ⚠️ concorrencia 2: producao chama UMA vez por mensagem. Com 4 em paralelo
    // a cauda inflava (p90 21,5s contra 3-9s medidos em chamada isolada).
    const conc = Number(process.env.BENCH_CONC || 2);
    const res = await emLotes(CASOS, conc, (c) => medir(c, modelo));
    for (const r of res) {
      if (!r.acertou) {
        console.log('  XX ' + r.id.padEnd(20) + ' esperado=' + r.esperado.padEnd(22)
          + ' veio=' + String(r.got || ('(' + r.erro + ')')).padEnd(24) + (r.ms / 1000).toFixed(1) + 's');
      }
    }
    const ok = res.filter((r) => r.acertou).length;
    const tempos = res.map((r) => r.ms).sort((a, b) => a - b);
    const p = (q) => tempos[Math.min(tempos.length - 1, Math.floor(q * tempos.length))];
    console.log('  --> ' + ok + '/' + res.length + ' (' + (100 * ok / res.length).toFixed(0) + '%)'
      + '  ·  mediana ' + (p(0.5) / 1000).toFixed(1) + 's  p90 ' + (p(0.9) / 1000).toFixed(1) + 's'
      + '  max ' + (tempos[tempos.length - 1] / 1000).toFixed(1) + 's  ·  falhas de transporte: '
      + res.filter((r) => r.erro).length);
    const motivos = {};
    for (const r of res) if (r.erro) motivos[r.erro] = (motivos[r.erro] || 0) + 1;
    if (Object.keys(motivos).length) console.log('      motivos:', JSON.stringify(motivos));
    placar.push({ modelo, ok, total: res.length, p50: p(0.5), p90: p(0.9), erros: res.filter((r) => r.erro).length, res });
  }

  console.log('\n' + '='.repeat(74));
  console.log('modelo'.padEnd(30) + 'acerto'.padStart(8) + 'mediana'.padStart(10) + 'p90'.padStart(10) + 'falhas'.padStart(8));
  for (const x of placar.sort((a, b) => b.ok - a.ok || a.p50 - b.p50)) {
    console.log(x.modelo.padEnd(30) + (x.ok + '/' + x.total).padStart(8)
      + ((x.p50 / 1000).toFixed(1) + 's').padStart(10) + ((x.p90 / 1000).toFixed(1) + 's').padStart(10)
      + String(x.erros).padStart(8));
  }
  console.log('\nreferencia hoje em producao: hermes_cli / gpt-5.6-luna — mediana 21,8s, p90 44,5s');
  if (process.env.BENCH_JSON) fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(placar, null, 1));
})();
