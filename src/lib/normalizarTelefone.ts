/**
 * Normaliza telefone para o formato 55XXXXXXXXXXX (DDI+DDD+numero).
 * Espelha a logica usada na edge function processar-matricula-emusys
 * para garantir match consistente entre frontend e webhook.
 *
 * Retorna null se o telefone for invalido (menos de 10 digitos apos limpar).
 */
export function normalizarTelefone(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Diz se dois telefones sao o mesmo contato, comparando os ULTIMOS 8 digitos.
 *
 * Igualdade estrita nao serve aqui: o mesmo numero aparece com e sem DDI, com e sem
 * o 9o digito, e o jid do WhatsApp as vezes traz sufixo (`@s.whatsapp.net`). Os 8
 * finais sobrevivem a todas essas formas.
 *
 * Nao vale para decidir identidade de pessoa — dois numeros distintos podem terminar
 * igual. Use so para casar um contato dentro de um conjunto ja restrito (uma caixa,
 * uma unidade).
 */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const finalDe = (valor: string | null | undefined) => {
    const digitos = (valor ?? '').replace(/\D/g, '');
    return digitos.length >= 8 ? digitos.slice(-8) : null;
  };
  const finalA = finalDe(a);
  const finalB = finalDe(b);
  return finalA !== null && finalA === finalB;
}
