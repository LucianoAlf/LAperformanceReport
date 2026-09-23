/**
 * Como a tela do Comercial descreve uma VISITA à escola (LAPE-44).
 *
 * Fonte única: o card de totais, a lista do Detalhamento do Funil e os filtros da aba
 * leem daqui. Reimplementar a régua em um dos três é o padrão que gerou as duplicatas
 * de renovação — a mesma pessoa apareceria como "compareceu" num lugar e "aguardando"
 * no outro.
 *
 * ## Existem três jeitos de visitar, e só dois precisam de confirmação
 *
 * A tabela `visitas` guarda o que foi AGENDADO (pela Mila ou à mão): é promessa, a
 * pessoa pode não aparecer, então precisa de alguém confirmar a presença depois.
 *
 * O lead com canal `Visita/Placa` é quem chegou SEM hora marcada — apareceu na porta.
 * Ele não precisa de confirmação porque a visita é a razão de o lead existir: alguém
 * só o cadastrou porque a pessoa estava ali. Medido em 23/09/2026, 180 dias:
 *
 *   Ex-aluno       52,0% viram matrícula
 *   Indicação      40,1%
 *   Visita/Placa   28,5%   <- comportamento de presença física
 *   Google          3,6%
 *   Instagram       2,5%
 *
 * Converter 8x mais que Google não é comportamento de quem viu uma placa na rua e
 * ligou; é de quem esteve na escola. `docs/PRD.md` define o canal como "Passou na
 * frente da escola".
 *
 * ⚠️ Quem é visita E fez experimental realizada não pode contar duas vezes numa SOMA
 * (a estrela SHOW-UP). Aqui não há problema: são eventos distintos e a lista mostra
 * os dois, cada um com seu rótulo.
 */

/** Canal de origem do lead que chegou sem hora marcada. Ver `canais_origem`. */
export const CANAL_VISITA_PLACA = 6;

export type ProcedenciaVisita = 'mila' | 'manual' | 'sem_hora_marcada';

export type PresencaVisita =
  /** Confirmada por alguém, ou dada pela própria natureza do walk-in. */
  | 'compareceu'
  /** Alguém marcou que não apareceu. */
  | 'nao_compareceu'
  /** Agendada e ninguém confirmou ainda. Nunca tratar como "não veio". */
  | 'aguardando';

export interface ItemVisita {
  /** Id na tabela `visitas`. Ausente quando a linha veio do canal Visita/Placa. */
  visita_id?: string | null;
  /** `agendada` | `realizada` | `nao_compareceu` | `cancelada`. */
  visita_status?: string | null;
  /** `mila` | `manual` — só existe para quem tem linha na tabela `visitas`. */
  visita_criado_por?: string | null;
  canal_origem_id?: number | null;
}

/**
 * De onde a visita veio.
 *
 * O discriminador é ter ou não linha na tabela `visitas` — não o canal do lead. Quem
 * agendou pela Mila pode ter qualquer canal de origem (veio do Instagram e marcou uma
 * visita), então olhar o canal primeiro classificaria errado.
 */
export function procedenciaDaVisita(item: ItemVisita): ProcedenciaVisita {
  if (!item.visita_id) return 'sem_hora_marcada';
  return item.visita_criado_por === 'mila' ? 'mila' : 'manual';
}

/**
 * Se a pessoa esteve na escola.
 *
 * ⚠️ `agendada` é "ninguém confirmou", NUNCA "não veio". Traduzir ausência de marcação
 * para falta é o mesmo defeito de `sem_captura` virar "fora da comunidade": o sistema
 * afirmaria um fato que ninguém mediu. Medido em 23/09: as 139 visitas do banco estão
 * 100% em `agendada` — se isso contasse como falta, a escola inteira teria faltado.
 */
export function presencaDaVisita(item: ItemVisita): PresencaVisita {
  if (procedenciaDaVisita(item) === 'sem_hora_marcada') return 'compareceu';
  if (item.visita_status === 'realizada') return 'compareceu';
  if (item.visita_status === 'nao_compareceu') return 'nao_compareceu';
  return 'aguardando';
}

/** Só a visita agendada admite confirmação — o walk-in já aconteceu. */
export function podeConfirmarPresenca(item: ItemVisita): boolean {
  return procedenciaDaVisita(item) !== 'sem_hora_marcada';
}

export function visitaAconteceu(item: ItemVisita): boolean {
  return presencaDaVisita(item) === 'compareceu';
}

export function rotuloProcedencia(p: ProcedenciaVisita): string {
  switch (p) {
    case 'mila': return 'Agendada pela Mila';
    case 'manual': return 'Agendada pela equipe';
    case 'sem_hora_marcada': return 'Sem hora marcada';
  }
}

export function rotuloProcedenciaCurto(p: ProcedenciaVisita): string {
  switch (p) {
    case 'mila': return 'Mila';
    case 'manual': return 'Equipe';
    case 'sem_hora_marcada': return 'Sem hora';
  }
}

export function rotuloPresenca(p: PresencaVisita): string {
  switch (p) {
    case 'compareceu': return 'Compareceu';
    case 'nao_compareceu': return 'Não compareceu';
    case 'aguardando': return 'Aguardando confirmação';
  }
}

export interface ResumoVisitas {
  /** Linhas na lista: agendadas não canceladas + quem chegou sem hora marcada. */
  total: number;
  /** Esteve na escola: walk-in + agendadas confirmadas. */
  aconteceram: number;
  semHoraMarcada: number;
  agendadas: number;
  confirmadas: number;
  naoCompareceram: number;
  aguardando: number;
}

export function resumoVisitas(itens: ItemVisita[]): ResumoVisitas {
  const r: ResumoVisitas = {
    total: itens.length, aconteceram: 0, semHoraMarcada: 0,
    agendadas: 0, confirmadas: 0, naoCompareceram: 0, aguardando: 0,
  };
  for (const item of itens) {
    const procedencia = procedenciaDaVisita(item);
    const presenca = presencaDaVisita(item);
    if (procedencia === 'sem_hora_marcada') r.semHoraMarcada += 1;
    else r.agendadas += 1;
    if (presenca === 'compareceu') {
      r.aconteceram += 1;
      if (procedencia !== 'sem_hora_marcada') r.confirmadas += 1;
    } else if (presenca === 'nao_compareceu') r.naoCompareceram += 1;
    else r.aguardando += 1;
  }
  return r;
}

/**
 * A linha sob o número do card.
 *
 * Existe porque "21 visitas" sozinho não diz que ninguém confirmou nenhuma — e era
 * justamente isso que a tela afirmava por omissão, ao lado de um card chamado
 * "Experimentais CONFIRMADAS". Declarar `0 de 21` é o que cria a pressão de marcar.
 */
export function textoComposicaoVisitas(r: ResumoVisitas): string {
  const partes: string[] = [];
  if (r.semHoraMarcada > 0) partes.push(`${r.semHoraMarcada} sem hora marcada`);
  if (r.agendadas > 0) partes.push(`${r.confirmadas} de ${r.agendadas} agendadas confirmadas`);
  return partes.join(' · ');
}
