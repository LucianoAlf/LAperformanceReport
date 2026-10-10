// Codigo invisivel do rastreador de WhatsApp. Compartilhado entre `ir-whatsapp` (gera) e
// `rastreador-casar` (le), para que os dois lados nunca divirjam no alfabeto.
//
// 4 caracteres de largura zero = 1 digito base-4. 10 digitos = ~1 milhao de codigos. Basta:
// o casamento so olha cliques recentes e ainda nao casados.

export const ZW = ['\u200B', '\u200C', '\u200D', '\u2060'] as const; // largura zero
export const TAMANHO_CODIGO = 10;
const REPETICOES = 3; // o texto pode ser cortado/editado; o codigo vai 3x para sobreviver a isso

const DIGITO_POR_ZW = new Map<string, string>(ZW.map((c, i) => [c, String(i)]));

export function gerarCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TAMANHO_CODIGO));
  return Array.from(bytes, (b) => String(b % 4)).join('');
}

export function codigoInvisivel(codigo: string): string {
  const um = codigo.split('').map((d) => ZW[Number(d)]).join('');
  return um.repeat(REPETICOES);
}

/** Todas as janelas de TAMANHO_CODIGO digitos formadas pelos caracteres de largura zero do texto. */
export function candidatosDoTexto(texto: string): string[] {
  let digitos = '';
  for (const ch of texto ?? '') {
    const d = DIGITO_POR_ZW.get(ch);
    if (d !== undefined) digitos += d;
  }
  const out = new Set<string>();
  for (let i = 0; i + TAMANHO_CODIGO <= digitos.length; i++) out.add(digitos.slice(i, i + TAMANHO_CODIGO));
  return [...out];
}

// Mesma regra de telefone das edges de atribuicao (com/sem 9o digito).
export function candidatosTelefone(raw: string): string[] {
  const d = (raw || '').toString().replace(/\D/g, '');
  if (!d) return [];
  const set = new Set<string>();
  const com55 = d.startsWith('55') && d.length >= 12 ? d : (d.length >= 10 && d.length <= 11 ? '55' + d : d);
  set.add(com55);
  if (/^55\d{10}$/.test(com55)) set.add(com55.replace(/^(55\d{2})(\d{8})$/, '$19$2'));
  if (/^55(\d{2})9(\d{8})$/.test(com55)) set.add(com55.replace(/^55(\d{2})9(\d{8})$/, '55$1$2'));
  return [...set];
}
