/**
 * Regras da aba Histórico LTV que o computador e o celular dividem.
 *
 * Por que existe: a tela do desktop guardava busca, filtro, ordenação e a
 * validação do lançamento manual dentro do próprio componente. A versão de
 * celular precisa das MESMAS respostas — e reescrevê-las ali criaria duas
 * definições de "quem aparece nesta lista", que é a família de defeito que
 * produziu as duplicatas de renovação neste repositório.
 *
 * Aqui não há nada de layout: são funções puras, exercitadas por valor.
 */

export interface RegistroLtvParaFiltro {
  nome: string;
  tempo_permanencia_meses: number;
  categoria_saida: string;
  mes_saida: string | null;
  fonte: 'historico' | 'sistema';
}

export const CATEGORIAS_SAIDA_LTV = [
  { value: 'Interrompido', label: 'Interrompido' },
  { value: 'Não renovou', label: 'Não renovou' },
  { value: 'Evadido', label: 'Evadido' },
  { value: 'Transferência', label: 'Transferência' },
] as const;

/**
 * Só registro de fonte `historico` é editável.
 *
 * O que vem do `sistema` é derivado das matrículas — corrigir ali seria
 * escrever por cima de um cálculo, e a correção sumiria no próximo cálculo.
 */
export function registroLtvEditavel(fonte: 'historico' | 'sistema'): boolean {
  return fonte === 'historico';
}

/** O que a linha oferece ao ser tocada. Sem nenhuma, ela não é botão. */
export function acoesDoRegistroLtv(reg: { fonte: 'historico' | 'sistema'; qtd_passagens_pessoa: number }): {
  verPassagens: boolean;
  editar: boolean;
  excluir: boolean;
  temAlguma: boolean;
} {
  const verPassagens = (reg.qtd_passagens_pessoa ?? 0) >= 2;
  const editavel = registroLtvEditavel(reg.fonte);
  return {
    verPassagens,
    editar: editavel,
    excluir: editavel,
    temAlguma: verPassagens || editavel,
  };
}

/** Acento e caixa não podem decidir se alguém aparece na busca. */
export function normalizarNomeLtv(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export interface FiltroLtv {
  busca?: string;
  categoria?: string;
  fonte?: 'todos' | 'historico' | 'sistema';
}

/**
 * O mesmo recorte que a tabela do desktop aplica, na mesma ordem de
 * verificação.
 *
 * ⚠️ A busca aqui é por NOME e só. A lista é de ex-alunos: não há professor
 * nem curso na linha para casar, e procurar dentro da categoria faria "evadido"
 * devolver a base inteira.
 */
export function filtrarRegistrosLtv<T extends RegistroLtvParaFiltro>(
  registros: readonly T[],
  { busca = '', categoria = 'todos', fonte = 'todos' }: FiltroLtv = {},
): T[] {
  const termo = normalizarNomeLtv(busca);
  return registros.filter((r) => {
    if (termo && !normalizarNomeLtv(r.nome).includes(termo)) return false;
    if (categoria !== 'todos' && r.categoria_saida !== categoria) return false;
    if (fonte !== 'todos' && r.fonte !== fonte) return false;
    return true;
  });
}

export type OrdemLtv = 'mais_tempo' | 'menos_tempo' | 'nome';

/**
 * ⚠️ Ordenar por `mes_saida` NÃO está aqui de propósito: a coluna é texto
 * livre ("Abril/2026", às vezes vazio), então a ordem sairia alfabética —
 * Abril antes de Janeiro — e pareceria cronológica.
 */
export function ordenarRegistrosLtv<T extends RegistroLtvParaFiltro>(
  registros: readonly T[],
  ordem: OrdemLtv = 'mais_tempo',
): T[] {
  const copia = [...registros];
  copia.sort((a, b) => {
    if (ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
    const diferenca = a.tempo_permanencia_meses - b.tempo_permanencia_meses;
    if (diferenca !== 0) return ordem === 'menos_tempo' ? diferenca : -diferenca;
    // Empate resolvido pelo nome para a lista não dançar entre renderizações.
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return copia;
}

/**
 * `95.73` vira `95,7`.
 *
 * A tabela do desktop imprime o número cru, então a célula mostra "95.73" —
 * duas casas de precisão que ninguém usa, com ponto decimal, num campo cuja
 * unidade é mês. Aqui a casa é uma só e o separador é o de português.
 */
export function formatarMesesLtv(meses: number): string {
  if (!Number.isFinite(meses)) return '—';
  return meses.toFixed(1).replace('.', ',');
}

/** 12 meses é o ciclo do contrato: quem passou dele cumpriu o ciclo inteiro. */
export function tomDoTempoLtv(meses: number): 'longo' | 'curto' {
  return meses >= 12 ? 'longo' : 'curto';
}

export interface NovoRegistroLtv {
  nome: string;
  tempo: string;
  categoria: string;
  mes_saida: string;
}

/**
 * Valida o lançamento manual.
 *
 * O desktop recusava em silêncio: `if (!nome || isNaN(tempo) || tempo < 1)
 * return` — o modal ficava aberto, nada acontecia e ninguém dizia por quê.
 * Devolver o motivo é o que permite às duas telas explicarem a recusa.
 */
export function validarNovoRegistroLtv(entrada: NovoRegistroLtv): { ok: boolean; erro?: string } {
  const nome = entrada.nome.trim();
  if (!nome) return { ok: false, erro: 'Informe o nome do ex-aluno.' };

  const tempo = Number.parseInt(entrada.tempo, 10);
  if (Number.isNaN(tempo)) return { ok: false, erro: 'Informe os meses de permanência.' };
  if (tempo < 1) return { ok: false, erro: 'A permanência precisa ser de pelo menos 1 mês.' };

  return { ok: true };
}
