'use strict';
// Lista diária da Maria nos grupos financeiros (a partir de 09/10/2026, 09h):
// "*Recebimentos em aberto <unidade>* 🚩⚠️" = Pix que caiu no banco e a parcela
// não teve baixa no Emusys. A recepção dá a baixa NO EMUSYS e responde citando a
// lista ("baixei a Maria Flor", "baixei todos", "✅"); a Maria anota e responde na
// própria lista ("📝 Anotei…", "✅ … baixa confirmada", "⚠️ … ainda aberto no
// Emusys", "Faltam N").
//
// Nada disso é com a Sol: não é pagamento novo nem "pode" de card. A ponte para
// antes de qualquer caminho do caixa (não lança, não abre card, não reage, não
// vai ao Jev). Só texto; a decisão é pelo conteúdo, sem depender do número da Maria.

const LISTA = /^[\s*_~]*recebimentos em aberto\b/i;
// Respostas da Maria dentro do fluxo, mesmo quando ela cita a fala da recepção
// em vez da lista. Frases da própria Maria, longe do jeito da equipe lançar.
const RESPOSTA_DA_MARIA = [
  /^[\s*_~]*📝\s*anotei\b/i,
  /^[\s*_~]*✅.*\bbaixa confirmada\b/i,
  /^[\s*_~]*⚠️.*\bainda (est[aá] )?(em )?aberto no emusys\b/i,
  /^[\s*_~]*faltam \d+\b/i,
];

function textoCitado(event) {
  return String((event && (event.quotedPreview || event.quotedBody)) || '');
}

// Devolve o motivo (para o log) ou null quando a mensagem segue o caminho normal.
function fluxoRecebimentosDaMaria(event) {
  if (!event || !event.isGroup) return null;
  const fala = String(event.body || '');
  if (LISTA.test(fala)) return 'lista_da_maria';
  if (LISTA.test(textoCitado(event))) return 'cita_lista_da_maria';
  if (RESPOSTA_DA_MARIA.some((r) => r.test(fala))) return 'resposta_da_maria';
  return null;
}

module.exports = { fluxoRecebimentosDaMaria };
