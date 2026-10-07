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

export interface ComunidadeWaNomeCadastrado {
  nome: string;
  parentesco: string | null;
}

export interface ComunidadeWaContato {
  telefone: string | null;
  de_quem: ComunidadeWaDeQuem | null;
  nome: string | null;
  parentesco: string | null;
  /**
   * TODOS os cadastros daquele numero, nao so o primeiro. O mesmo telefone costuma estar
   * cadastrado duas vezes -- como do proprio aluno e como do responsavel (medido: 371 dos
   * 391 casos). Ate 22/09/2026 a view escolhia UM deles pela ordem fisica do plano, ou
   * seja no sorteio, e o nome exibido mudava sozinho quando o plano mudava.
   */
  nomes?: ComunidadeWaNomeCadastrado[] | null;
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
export function nomeDoContato(
  contato: Pick<ComunidadeWaContato, 'nome' | 'parentesco'> & { nomes?: ComunidadeWaNomeCadastrado[] | null },
): string | null {
  // Quando o numero tem mais de um cadastro, declara TODOS em vez de escolher: e a mesma
  // regra do `de_quem` dizer "do aluno e do responsavel" em vez de eleger um lado. O
  // primeiro item sem rotulo e o proprio aluno (mesmo nome da linha); o rotulo aparece
  // justamente em quem acrescenta informacao.
  const lista = (contato.nomes ?? []).filter((n) => !!n?.nome?.trim());
  if (lista.length > 1) {
    return lista.map((n) => rotularNome(n.nome, n.parentesco)).filter(Boolean).join(' e ');
  }
  if (lista.length === 1) return rotularNome(lista[0].nome, lista[0].parentesco);
  return rotularNome(contato.nome, contato.parentesco);
}

function rotularNome(nome: string | null | undefined, parentesco: string | null | undefined): string | null {
  const limpo = nome?.trim();
  if (!limpo) return null;
  const grau = parentesco?.trim();
  // 'proprio' e o parentesco que o cadastro usa para o numero do proprio aluno; repeti-lo
  // ao lado do nome dele nao acrescenta nada.
  if (!grau || grau.toLocaleLowerCase('pt-BR') === 'proprio') return limpo;
  return `${limpo} (${grau})`;
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
      nomes: normalizarNomesCadastrados(item.nomes),
    }));
}

function ehDeQuem(valor: unknown): valor is ComunidadeWaDeQuem {
  return valor === 'aluno' || valor === 'responsavel'
    || valor === 'aluno_e_responsavel' || valor === 'contato_extra';
}

/**
 * `nomes` tambem vem do banco como jsonb: mesma desconfianca de `normalizarContatos` --
 * pode chegar string, null ou fora do formato, e a tela nao pode quebrar por isso.
 */
export function normalizarNomesCadastrados(bruto: unknown): ComunidadeWaNomeCadastrado[] {
  let valor = bruto;
  if (typeof valor === 'string') {
    try { valor = JSON.parse(valor); } catch { return []; }
  }
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      nome: typeof item.nome === 'string' ? item.nome : '',
      parentesco: typeof item.parentesco === 'string' ? item.parentesco : null,
    }))
    .filter((n) => n.nome.trim().length > 0);
}

/**
 * Estados que a view devolve. `sem_telefone_cadastrado` (22/09/2026) existe porque
 * "Fora" AFIRMA que a pessoa nao esta no grupo -- e para quem nao tem um telefone
 * cadastrado isso e falso: nao ha numero para procurar, logo nao se sabe. Medido: 53
 * alunos, 10 deles ativos. Mesma regua de `sem_captura` nunca virar "fora".
 */
export type ComunidadeWaEstado =
  | 'na_comunidade'
  | 'fora_da_comunidade'
  | 'sem_telefone_cadastrado'
  | 'sem_captura'
  | 'captura_desatualizada'
  | 'sem_grupo_configurado';

/** true quando o estado e um "nao sei", e nao uma resposta sobre estar no grupo. */
export function estadoEhIndeterminado(estado: string | null | undefined): boolean {
  return estado === 'sem_telefone_cadastrado' || estado === 'sem_captura'
    || estado === 'captura_desatualizada' || estado === 'sem_grupo_configurado';
}

/**
 * O rotulo do estado na coluna e na Ficha.
 *
 * "Fora" sozinho nao diz fora DE QUE: na Lista ele aparece ao lado de status, contrato e
 * inadimplencia, e a palavra solta e lida como "fora da escola". Escrito por extenso, o
 * badge diz de qual pergunta ele e a resposta -- e fica simetrico com "Na comunidade",
 * que e o rotulo do outro lado.
 *
 * Fonte unica pelo mesmo motivo de `nomeDoContato`: coluna e ficha nao podem divergir
 * sobre a mesma pessoa. `na_comunidade` NAO entra aqui porque o texto dele carrega o nome
 * do grupo, que e dado, nao rotulo.
 */
export function rotuloEstadoComunidade(estado: string | null | undefined): string | null {
  if (estado === 'fora_da_comunidade') return 'Fora da comunidade';
  return explicarEstadoComunidade(estado)?.rotulo ?? null;
}

/** O que a tela mostra, e POR QUE - a pendencia de cada "nao sei" e diferente. */
export function explicarEstadoComunidade(estado: string | null | undefined): { rotulo: string; motivo: string } | null {
  switch (estado) {
    case 'sem_telefone_cadastrado':
      return {
        rotulo: 'Sem telefone',
        motivo: 'Não há telefone cadastrado para esta pessoa, então não há número para procurar no grupo. A pendência é cadastrar o contato, não entrar na comunidade.',
      };
    case 'sem_captura':
      return { rotulo: '—', motivo: 'A comunidade ainda não foi capturada.' };
    case 'captura_desatualizada':
      return { rotulo: '—', motivo: 'A última captura da comunidade está desatualizada.' };
    case 'sem_grupo_configurado':
      return { rotulo: '—', motivo: 'Nenhum grupo de comunidade configurado para esta unidade.' };
    default:
      return null;
  }
}
