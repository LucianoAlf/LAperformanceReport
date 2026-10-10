export const FICHA_URL_BASE = 'https://la-performance-report.vercel.app/ficha-tecnica/';

export function montarLinkFicha(token: string): string {
  return `${FICHA_URL_BASE}?t=${encodeURIComponent(token)}`;
}

export function montarMensagemFicha(primeiroNome: string, link: string): string {
  return `Oi, ${primeiroNome}! Tudo bem? Queria te pedir pra preencher a Ficha Técnica da LA. São uns 20 minutos e não tem resposta certa nem errada — é pra gente te conhecer melhor e trabalhar melhor com você. Segue o link: ${link}`;
}

/**
 * Mensagem para quem JÁ respondeu a ficha: o mesmo link volta com o bloco novo
 * "Minha carreira na música" aberto, sem repetir o teste.
 */
export function montarMensagemFichaCarreira(primeiroNome: string, link: string): string {
  return `Oi, ${primeiroNome}! Tudo bem? A Ficha Técnica ganhou um bloco novo: Minha carreira na música — sua história como músico(a), pra gente celebrar seu trabalho no site, nas redes sociais e na Dica do Mestre. É o mesmo link de antes, já com a sua ficha salva: ${link}`;
}

/**
 * Recebe o telefone já normalizado para DDI+DDD+numero.
 * A normalização de entrada fica em normalizarTelefone.ts, que é compartilhada
 * com os demais fluxos de WhatsApp do painel.
 */
export function montarLinkWhatsAppFicha(
  primeiroNome: string,
  telefoneNormalizado: string | null,
  link: string,
): string | null {
  if (!telefoneNormalizado) return null;
  const mensagem = montarMensagemFicha(primeiroNome, link);
  return `https://wa.me/${telefoneNormalizado}?text=${encodeURIComponent(mensagem)}`;
}

/** Variante de reenvio para quem já respondeu (bloco Minha carreira na música). */
export function montarLinkWhatsAppFichaCarreira(
  primeiroNome: string,
  telefoneNormalizado: string | null,
  link: string,
): string | null {
  if (!telefoneNormalizado) return null;
  const mensagem = montarMensagemFichaCarreira(primeiroNome, link);
  return `https://wa.me/${telefoneNormalizado}?text=${encodeURIComponent(mensagem)}`;
}

export function formatarDataGeracaoFicha(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
