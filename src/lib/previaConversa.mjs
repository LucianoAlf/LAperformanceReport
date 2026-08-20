/**
 * Prévia da última mensagem na lista de conversas do módulo Campanhas.
 *
 * Puro de propósito: a regra de "quem falou por último" é o que faz a lista ser
 * útil (o bot já respondeu? a pessoa está esperando alguém?), e é o tipo de
 * coisa que se quebra em silêncio numa refatoração de layout.
 */

const ROTULOS_MIDIA = {
  image: ['📷', 'Foto'],
  audio: ['🎤', 'Áudio'],
  video: ['🎬', 'Vídeo'],
  document: ['📎', 'Documento'],
  sticker: ['🏷️', 'Figurinha'],
};

const MIDIA_PADRAO = ['📎', 'Anexo'];

/** Uma linha só: o template do Feirão vem com quebras e apareceria em branco. */
function umaLinha(texto) {
  return (texto ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {{previa_texto?: string|null, previa_tipo?: string|null,
 *   previa_direcao?: string|null, previa_agente_id?: string|null,
 *   previa_campanha_id?: string|null}|null} previa
 * @returns {{prefixo: string|null, texto: string}}
 */
export function formatarPreviaConversa(previa) {
  if (!previa) return { prefixo: null, texto: '' };

  const texto = umaLinha(previa.previa_texto);
  const tipo = previa.previa_tipo ?? null;

  // Prefixo só para o que SAIU daqui. A ordem importa: resposta do bot dentro
  // de uma campanha é do bot — rotular "Campanha" esconderia justamente o que
  // interessa saber de relance.
  let prefixo = null;
  if (previa.previa_direcao === 'outbound') {
    if (previa.previa_agente_id) prefixo = 'Mila:'
    else if (previa.previa_campanha_id) prefixo = '📣 Campanha:'
    else prefixo = 'Você:'
  }

  if (tipo === 'reaction') {
    return { prefixo, texto: texto ? `Reagiu ${texto}` : 'Reagiu' };
  }

  if (tipo && tipo !== 'text') {
    const [emoji, rotulo] = ROTULOS_MIDIA[tipo] ?? MIDIA_PADRAO;
    // Com legenda, ela diz mais que o rótulo — o emoji já entrega o formato.
    return { prefixo, texto: texto ? `${emoji} ${texto}` : `${emoji} ${rotulo}` };
  }

  return { prefixo: texto ? prefixo : null, texto };
}
