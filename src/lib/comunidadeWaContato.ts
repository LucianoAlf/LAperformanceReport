/**
 * Como descrever O CONTATO do aluno que está na comunidade WhatsApp (LAPE-34).
 *
 * Fonte única: a coluna da Lista de Alunos e o badge da Ficha leem daqui. Reimplementar
 * o rótulo num dos dois é o padrão que gerou as duplicatas de renovação — o mesmo aluno
 * apareceria como "responsável" numa tela e "aluno" na outra.
 *
 * A view `vw_aluno_comunidade_wa_v1` resolve de quem é o número comparando o que casou
 * no grupo contra os campos do cadastro. Medido em 14/09, nos 705 números de 680 alunos
 * que estão na comunidade:
 *   responsavel          269 (38%)
 *   aluno_e_responsavel  217 (31%)
 *   aluno                217 (31%)
 *   contato_extra          2
 */

export type ComunidadeWaDeQuem =
  | 'aluno'
  | 'responsavel'
  | 'aluno_e_responsavel'
  | 'contato_extra';

export interface ComunidadeWaContato {
  telefone: string | null;
  de_quem: ComunidadeWaDeQuem | null;
  nome: string | null;
  parentesco: string | null;
}

/**
 * ⚠️ `aluno_e_responsavel` NÃO é indecisão nossa: é o fato de o cadastro guardar o MESMO
 * número no campo do aluno e no do responsável (31% dos casos). Escolher um dos dois ali
 * seria inventar informação que o cadastro não tem — mesma régua de `sem_captura`, que a
 * LAPE-33 mostra como "não sei" em vez de "fora".
 */
export function rotuloDeQuem(de_quem: ComunidadeWaDeQuem | null | undefined): string {
  switch (de_quem) {
    case 'aluno': return 'do aluno';
    case 'responsavel': return 'do responsável';
    case 'aluno_e_responsavel': return 'do aluno e do responsável';
    case 'contato_extra': return 'de um contato cadastrado';
    default: return 'de origem não identificada';
  }
}

/** Versão curta, para caber na célula da tabela. */
export function rotuloDeQuemCurto(de_quem: ComunidadeWaDeQuem | null | undefined): string {
  switch (de_quem) {
    case 'aluno': return 'aluno';
    case 'responsavel': return 'responsável';
    case 'aluno_e_responsavel': return 'aluno/resp.';
    case 'contato_extra': return 'contato';
    default: return '—';
  }
}

/**
 * Nome de quem atende naquele número, quando o cadastro sabe. Só `aluno_contatos` traz
 * nome e parentesco; os campos soltos de `alunos` não têm dono declarado, e é por isso
 * que a maioria volta `null` aqui em vez de repetir o nome do aluno — dizer "Maria (mãe)"
 * sem que alguém tenha cadastrado isso seria chute.
 */
export function nomeDoContato(contato: Pick<ComunidadeWaContato, 'nome' | 'parentesco'>): string | null {
  const nome = contato.nome?.trim();
  if (!nome) return null;
  const parentesco = contato.parentesco?.trim();
  // 'proprio' é o parentesco que o cadastro usa para o número do próprio aluno; repeti-lo
  // ao lado do nome dele não acrescenta nada.
  if (!parentesco || parentesco.toLocaleLowerCase('pt-BR') === 'proprio') return nome;
  return `${nome} (${parentesco})`;
}

/** Linha completa para a Ficha: "(21) 99999-0000 — do responsável · Maria (mãe)". */
export function descreverContato(contato: ComunidadeWaContato): string {
  const partes: string[] = [];
  if (contato.telefone) partes.push(contato.telefone);
  partes.push(rotuloDeQuem(contato.de_quem));
  const nome = nomeDoContato(contato);
  if (nome) partes.push(nome);
  return partes.join(' · ');
}

/**
 * A view devolve `contatos_no_grupo` como jsonb. Vem do banco, então pode chegar como
 * string, array, null ou (se alguém mudar a view) algo fora do formato — nunca confiar
 * na forma sem checar, senão a tela quebra no lugar mais visível da Lista.
 */
export function normalizarContatos(bruto: unknown): ComunidadeWaContato[] {
  let valor = bruto;
  if (typeof valor === 'string') {
    try { valor = JSON.parse(valor); } catch { return []; }
  }
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      telefone: typeof item.telefone === 'string' ? item.telefone : null,
      de_quem: ehDeQuem(item.de_quem) ? item.de_quem : null,
      nome: typeof item.nome === 'string' ? item.nome : null,
      parentesco: typeof item.parentesco === 'string' ? item.parentesco : null,
    }));
}

function ehDeQuem(valor: unknown): valor is ComunidadeWaDeQuem {
  return valor === 'aluno' || valor === 'responsavel'
    || valor === 'aluno_e_responsavel' || valor === 'contato_extra';
}
