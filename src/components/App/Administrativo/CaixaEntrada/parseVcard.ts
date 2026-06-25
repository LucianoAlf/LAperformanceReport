// Extrai nome, telefones e organização de uma string vCard (.vcf) OU de um nome simples.
// Tolerante: se não for vCard, devolve o texto como fullName e telefones vazio.
export function parseVcard(conteudo: string | null): { fullName: string; telefones: string[]; organizacao: string | null } {
  const texto = (conteudo || '').trim();
  if (!texto.toUpperCase().includes('BEGIN:VCARD')) {
    return { fullName: texto, telefones: [], organizacao: null };
  }
  const fnMatch = texto.match(/^(?:item\d+\.)?FN:(.*)$/im);
  const orgMatch = texto.match(/^(?:item\d+\.)?ORG:(.*)$/im);
  // TEL pode vir como "TEL;...:valor" ou "item1.TEL;waid=...:valor" (formato real UAZAPI)
  const telefones = Array.from(texto.matchAll(/TEL[^:\n]*:([^\n\r]+)/gi)).map(m => m[1].trim()).filter(Boolean);
  return {
    fullName: (fnMatch?.[1] || '').trim(),
    telefones,
    organizacao: (orgMatch?.[1] || '').trim() || null,
  };
}
