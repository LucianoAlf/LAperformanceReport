// Lista "Recebimentos em aberto" da Maria (09/10/2026): a Sol ignora a lista, as
// respostas da recepção citando a lista e as anotações da Maria. Pagamento e "pode"
// de card fora desse fluxo seguem normais.
const fs = require('fs'); const path = require('path');
const { fluxoRecebimentosDaMaria: f } = require('../../vps/la-hq/sol/runtime/recebimentos-maria.cjs');
const falhas = []; const checar = (c, m) => { if (!c) falhas.push(m); };
const g = (body, quotedPreview = '') => ({ isGroup: true, body, quotedPreview, quotedMessageId: quotedPreview ? 'Q' : null });
const lista = '*Recebimentos em aberto Campo Grande* 🚩⚠️\n1. Maria Flor — R$ 357,00 (Pix 07/10)\n2. Pedro — R$ 447,00';

checar(f(g(lista)) === 'lista_da_maria', 'a lista da Maria deveria ser ignorada');
checar(f(g('baixei a Maria Flor', lista)) === 'cita_lista_da_maria', '"baixei a Maria Flor" citando a lista deveria ser ignorado');
for (const t of ['baixei todos', '✅', 'feito', 'pode', 'Pode lançar']) {
  checar(f(g(t, lista)) === 'cita_lista_da_maria', `"${t}" citando a lista deveria ser ignorado`);
}
checar(f({ isGroup: true, body: 'baixei', quotedBody: 'Recebimentos em aberto Barra 🚩' }) === 'cita_lista_da_maria', 'citado em quotedBody também conta');
for (const t of ['📝 Anotei: Maria Flor', '✅ Maria Flor — baixa confirmada', '⚠️ Pedro ainda aberto no Emusys', '⚠️ Pedro ainda está aberto no Emusys', 'Faltam 2']) {
  checar(f(g(t, 'baixei a Maria Flor')) === 'resposta_da_maria', `resposta da Maria "${t}" deveria ser ignorada`);
}
// Fluxo normal da Sol continua intacto.
checar(f(g('Pode', 'Comprovante recebido — R$ 357,00\nAluno: Maria Flor')) === null, '"Pode" citando card da Sol não pode ser ignorado');
checar(f(g('PG pix parcela 10/2026 aluna Maria Flor - R$ 357,00')) === null, 'pagamento novo não pode ser ignorado');
checar(f(g('baixei a Maria Flor')) === null, '"baixei" sem citar a lista segue o caminho normal');
checar(f(g('Sol, quais recebimentos em aberto hoje?')) === null, 'pergunta à Sol não pode ser ignorada');
checar(f({ isGroup: false, body: lista }) === null, 'só vale em grupo');

// A ponte chama o filtro antes de todo o caminho do caixa (e do Jev).
const ponte = fs.readFileSync(path.join(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8');
const iFiltro = ponte.indexOf("step: 'ignorado_recebimentos_maria'");
const iCaixa = ponte.indexOf('if (SOL_CAIXA_LIVE && FINANCE_GROUPS.has(chatId))');
checar(iFiltro > 0 && iCaixa > iFiltro, 'filtro deveria vir antes do caminho do caixa');
checar(/recebimentos-maria\.cjs/.test(ponte), 'ponte deveria carregar recebimentos-maria.cjs');

if (falhas.length) { console.error('FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1); }
console.log('ok recebimentos-maria-e2e');
