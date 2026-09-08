#!/usr/bin/env node
// A MILA PASSA A SABER RESPONDER "AGOSTO" (08/09/2026).
//
// 🔴 O CASO — e é o que o Alf de fato perguntou, por áudio, às 14:48:
//    *"quero que você me traga um relatório completo do tráfego pago,
//    comparando Google e Instagram, do mês de agosto INTEIRO."*
//
//    Ela respondeu com os ÚLTIMOS 30 DIAS e escreveu, com todas as letras:
//    *"melhor proxy pro agosto inteiro, já que a tool traz janela móvel"*.
//    Ele respondeu **"tá errado"**.
//
//    Ela estava certa sobre a limitação e errada em entregar assim mesmo.
//    Em 08/09 a janela móvel pega **09/08 a 08/09** — ou seja, **8 dias de
//    setembro dentro de um relatório de agosto**, e faltando os 8 primeiros
//    dias do mês pedido.
//
// 🔴 O QUE MUDA NO NÚMERO (agosto fechado × janela móvel):
//
//                          ela disse      agosto de verdade
//      Instagram leads         465              524
//      Instagram matrículas      4 (0,9%)         7 (1,3%)
//      Instagram custo/matr. R$ 1.185         R$ 639
//      Google leads            129              157
//      Google matrículas         3 (2,3%)         6 (3,8%)
//      Google custo/matr.    R$ 1.051         R$ 508
//
//    O custo por matrícula era quase o DOBRO do real. A direção da conclusão
//    não muda, o tamanho sim — e é com o tamanho que se decide verba.
//
// ⚠️ PROXY NÃO É RESPOSTA. Quando a pessoa pede uma competência, a resposta é
//    a competência. Se a ferramenta não sabe, o certo é dizer que não sabe —
//    nunca entregar outro período com uma ressalva entre parênteses.
//
// ⚠️ Em AGOSTO `leads_imaturos` é **0**: o lead mais novo do mês tem 8 dias, que
//    é exatamente a mediana de conversão. Ou seja, agosto já está maduro e o
//    custo por matrícula dele **não** é teto — diferente da janela móvel, onde
//    109 dos 467 leads ainda não tinham tido chance.
//
// ⚠️ O que continua incompleto em agosto é o GASTO DO META: a captura nasceu em
//    04/08, então são **28 dos 31 dias** (faltam 01, 02 e 03). `gasto_dias_
//    cobertos` diz isso e ela tem de falar — quem lê R$ 4.474,94 como o gasto
//    do mês inteiro está subestimando.
const fs = require('fs');

const alvo = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs';
let s = fs.readFileSync(alvo, 'utf8');

// ⚠️ A marca tem de ser EXCLUSIVA desta tool. A 1a versao checava
//    `p_de: a.de`, que `trafego_por_criativo` JA tinha — o patch dizia "ja
//    aplicado" e nao fazia nada, em silencio. Guarda que casa com outro
//    trecho e pior que guarda nenhuma.
if (s.includes('PEDIU UM MÊS?')) { console.log('ja aplicado'); process.exit(0); }

function trocar(velho, novo, rotulo) {
  const n = s.split(velho).length - 1;
  if (n !== 1) { console.error('ANCORA ' + rotulo + ': esperava 1, achei ' + n); process.exit(1); }
  s = s.split(velho).join(novo);
}

// ── 1. o handler passa o período fechado ───────────────────────────────────
trocar(
  "    case 'trafego_por_canal': gate();\n"
  + "      return j(await rpc('radar_trafego_canal_v1', { p_dias: a.dias || 30, p_maturidade_dias: a.maturidade_dias ?? 0 }));",
  "    case 'trafego_por_canal': gate();\n"
  + "      // 🔴 Periodo FECHADO quando a pessoa pede uma competencia. Ate 08/09 so\n"
  + "      //    havia janela rolante, e ela entregou \"ultimos 30 dias\" para quem\n"
  + "      //    pediu AGOSTO — trazendo 8 dias de setembro e perdendo 8 de agosto.\n"
  + "      //    O custo por matricula saiu quase o dobro do real (R$ 1.185 x R$ 639).\n"
  + "      return j(await rpc('radar_trafego_canal_v1', {\n"
  + "        p_dias: a.dias || 30, p_maturidade_dias: a.maturidade_dias ?? 0,\n"
  + "        p_de: a.de || null, p_ate: a.ate || null }));",
  'handler do trafego_por_canal');

// ── 2. a declaração aceita de/ate e ENSINA quando usar ─────────────────────
const VELHO_SCHEMA = "    inputSchema: { type: 'object', properties: { dias: { type: 'integer' }, maturidade_dias: { type: 'integer' } } } },\n  { name: 'trafego_por_criativo',";
const NOVO_SCHEMA = "    inputSchema: { type: 'object', properties: {\n"
  + "      de: { type: 'string', description: 'Inicio do periodo fechado, YYYY-MM-DD. Use SEMPRE que pedirem um MES ou intervalo nomeado.' },\n"
  + "      ate: { type: 'string', description: 'Fim do periodo fechado, YYYY-MM-DD. Obrigatorio junto com `de`.' },\n"
  + "      dias: { type: 'integer', description: 'Janela ROLANTE a partir de hoje. So quando a pergunta nao tem periodo nomeado.' },\n"
  + "      maturidade_dias: { type: 'integer' } } } },\n  { name: 'trafego_por_criativo',";
trocar(VELHO_SCHEMA, NOVO_SCHEMA, 'inputSchema do trafego_por_canal');

// ── 3. a descrição proíbe entregar proxy ───────────────────────────────────
const MARCA = 'Use dias=30/maturidade=0 para o mês corrente e 180/35 para coorte madura.';
const NOVA_MARCA = '🔴 PEDIU UM MÊS? USE `de`/`ate` (ex.: agosto = de:2026-08-01, ate:2026-08-31). '
  + 'Janela rolante NÃO é proxy de mês e entregá-la como se fosse é o erro de 08/09: '
  + 'ele pediu "agosto inteiro", ela mandou os últimos 30 dias chamando de proxy, e o número '
  + 'saiu quase no dobro (custo por matrícula R$ 1.185 contra R$ 639 do agosto real). '
  + 'Se a ferramenta não souber responder o que foi pedido, diga que não sabe — nunca entregue outro período. '
  + '`dias`/`maturidade_dias` só quando a pergunta não tem período nomeado.';
trocar(MARCA, NOVA_MARCA, 'trecho final da descricao');

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-antes-periodo-fechado');
fs.writeFileSync(alvo, s);
console.log('ok: trafego_por_canal aceita periodo fechado e proibe proxy');
