// Regras puras do envio ao Meta (Conversions API, pixel). Sem rede, para testar sem Deno Deploy.

export type ItemFila = {
  lead_id: number;
  aluno_id: number | null;
  tipo: 'experimental' | 'matricula';
  event_name: string;
  ocorrido_em: string;
  valor: number | string | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  /** 'Kids' | 'School' | null (sem classificacao: o evento vai sem a marca). */
  marca?: string | null;
};

// Experimental e matricula acontecem NA ESCOLA, nao no site nem no chat: physical_store e o
// action_source verdadeiro. E e o unico que o Meta aceita com ate 62 dias de atraso; os demais
// aceitam 7. O Meta aceita ate 62 dias, mas no teste de 06/10 a experimental com 61,8 dias sumiu da
// lista de Eventos de teste (descartada na beirada). 60 deixa folga para o relogio do Meta.
export const ACTION_SOURCE = 'physical_store';
export const JANELA_DIAS = 60;

export async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Telefone no formato que o Meta exige antes do hash: so digitos, com DDI.
 * O cadastro tem "21 98765-4321", "5521987654321" e "+55 (21)...": os tres viram 5521987654321.
 * Devolve null quando nao parece telefone brasileiro -- mandar lixo em hash nao casa com ninguem
 * e ainda conta como evento "sem correspondencia" no Gerenciador.
 */
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  const cru = (bruto ?? '').trim();
  // "+" explicito com outro DDI: estrangeiro. Sem o "+", 1978... seria lido como DDD 19.
  if (cru.startsWith('+') && !cru.replace(/[^\d+]/g, '').startsWith('+55')) return null;
  let d = cru.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return null;
  return d;
}

/**
 * Primeiro e ultimo nome, minusculos. O cadastro tem nome "." e " " (ver nomeDoLead no LA-OS):
 * so letras contam. Nome de responsavel ou de crianca casa igual mal; o peso do casamento esta
 * no telefone, o nome so ajuda.
 */
export function partesDoNome(nome: string | null | undefined): { fn: string | null; ln: string | null } {
  const partes = (nome ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ''))
    .filter((p) => p.length >= 2);
  if (partes.length === 0) return { fn: null, ln: null };
  return { fn: partes[0], ln: partes.length > 1 ? partes[partes.length - 1] : null };
}

export function eventId(item: Pick<ItemFila, 'tipo' | 'lead_id' | 'aluno_id'>): string {
  return item.tipo === 'matricula' && item.aluno_id
    ? `lareport-matricula-aluno-${item.aluno_id}`
    : `lareport-${item.tipo}-lead-${item.lead_id}`;
}

export type Descarte = { item: ItemFila; motivo: string };

/** Separa quem pode ir de quem nao pode, com o motivo de cada descarte. */
export function triar(fila: ItemFila[], agoraMs: number): { elegiveis: ItemFila[]; descartes: Descarte[] } {
  const elegiveis: ItemFila[] = [];
  const descartes: Descarte[] = [];
  const alunosVistos = new Set<number>();

  for (const item of fila) {
    const t = new Date(item.ocorrido_em).getTime();
    if (!Number.isFinite(t)) {
      descartes.push({ item, motivo: 'sem data valida' });
      continue;
    }
    if (t > agoraMs) {
      descartes.push({ item, motivo: 'data no futuro' });
      continue;
    }
    const idade = (agoraMs - t) / 86400_000;
    if (idade > JANELA_DIAS) {
      descartes.push({ item, motivo: `fora da janela (${Math.floor(idade)} dias > ${JANELA_DIAS})` });
      continue;
    }
    if (!normalizarTelefone(item.telefone)) {
      descartes.push({ item, motivo: 'sem telefone valido' });
      continue;
    }
    // Dois leads (um por unidade) apontando para o mesmo aluno: a matricula vai uma vez.
    if (item.tipo === 'matricula' && item.aluno_id) {
      if (alunosVistos.has(item.aluno_id)) {
        descartes.push({ item, motivo: `matricula do aluno ${item.aluno_id} ja esta neste lote por outro lead` });
        continue;
      }
      alunosVistos.add(item.aluno_id);
    }
    elegiveis.push(item);
  }
  return { elegiveis, descartes };
}

/** Evento no formato da Conversions API. Tudo que identifica a pessoa vai em hash. */
export async function montarEvento(item: ItemFila): Promise<Record<string, unknown>> {
  const tel = normalizarTelefone(item.telefone)!;
  const { fn, ln } = partesDoNome(item.nome);
  const email = (item.email ?? '').trim().toLowerCase();

  const user_data: Record<string, unknown> = {
    ph: [await sha256(tel)],
    country: [await sha256('br')],
    external_id: [await sha256(`lead-${item.lead_id}`)],
  };
  if (fn) user_data.fn = [await sha256(fn)];
  if (ln) user_data.ln = [await sha256(ln)];
  if (email.includes('@')) user_data.em = [await sha256(email)];

  const evento: Record<string, unknown> = {
    event_name: item.event_name,
    event_time: Math.floor(new Date(item.ocorrido_em).getTime() / 1000),
    event_id: eventId(item),
    action_source: ACTION_SOURCE,
    user_data,
  };
  const custom: Record<string, unknown> = {};
  if (item.tipo === 'matricula' && item.valor != null && Number(item.valor) > 0) {
    custom.currency = 'BRL';
    custom.value = Number(item.valor);
  }
  // Marca (Kids/School) para separar no Gerenciador de Eventos. Sem classificacao, nao manda.
  if (item.marca === 'Kids' || item.marca === 'School') custom.content_category = item.marca;
  if (Object.keys(custom).length > 0) evento.custom_data = custom;
  return evento;
}
