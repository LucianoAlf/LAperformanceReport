// Por que uma anamnese pode não ter perfil de temperamento — e o que a tela diz.
//
// CASO (Jessica, 15/09/2026): "essa questão de anamnese incompleta aconteceu em
// mais 3 casos no Recreio e todos eram bebês de 1 ano. É bug ou é pq eles ainda
// não tem idade para terem perfil de temperamento?". Foi a SEGUNDA pessoa a
// perguntar a mesma coisa. Não é bug: o formulário da anamnese
// (repo anamnese-la-music, `FormWizard.tsx`) REMOVE o bloco de perfil para
// LAMK com até 24 meses — `steps = isBaby ? baseSteps.slice(0, -1) : baseSteps`
// —, então as 11 perguntas nunca são exibidas. O que faltava era a ficha contar
// isso: ela mostrava `🧠 - / 🧠 -` e quatro barras zeradas, sem uma palavra.
//
// Acima de 24 meses o bloco aparece, e cada pergunta tem uma 5ª alternativa
// ("Não se aplica (baby)"). Quem marca 9+ delas cai em menos de 3 respostas
// válidas, e a regra final — a mesma no cálculo do wizard e na RPC
// `salvar_anamnese_online` — grava `perfil_baby = true`:
//
//     if v_n_validos < 3 then v_perfil_baby := true;
//
// ⚠️ Essa regra NÃO olha idade nem tipo de formulário. Por isso o texto daqui
// nunca crava "bebê (até 24 meses)" como faz o perfil público: no dia em que
// uma anamnese EMLA chegar com menos de 3 respostas válidas, a ficha de um
// aluno de 32 anos exibiria "bebê". O motivo é sempre DERIVADO do dado, e
// quando o dado não sustenta, o texto fica no genérico.
//
// ⚠️ A idade é medida na DATA DA ANAMNESE, não hoje. Usar `now()` faria a ficha
// de um bebê de 13 meses dizer "4 anos" daqui a três anos, e o motivo viraria
// mentira sozinho com o tempo.

/** Até 24 meses (inclusive) o formulário LAMK não exibe o bloco de perfil. */
export const LIMITE_MESES_PERFIL_BABY = 24;

/** Alternativa "Não se aplica (baby)", a 5ª de cada pergunta. As válidas são 1 a 4. */
export const POSICAO_NAO_SE_APLICA = 5;

export interface RespostaPerfilPosicao {
  resposta_posicao?: number | null;
}

export interface EntradaPerfilTemperamento {
  temperamentoPrimario?: string | null;
  perfilBaby?: boolean | null;
  tipoFormulario?: string | null;
  dataNascimento?: string | Date | null;
  /** Quando a anamnese foi respondida — referência para a idade. */
  dataAnamnese?: string | Date | null;
  respostasPerfil?: RespostaPerfilPosicao[] | null;
}

export type MotivoPerfilAusente =
  /** Bloco não foi exibido: criança com até 24 meses no LAMK. */
  | 'idade'
  /** Bloco foi exibido e marcado como "não se aplica". */
  | 'nao_se_aplica'
  /** Sem perfil, mas o dado não diz qual dos dois caminhos foi. */
  | 'indeterminado'
  /** Sem perfil e sem o flag de bebê — anomalia, não é caso de idade. */
  | 'nao_preenchido';

export interface PerfilTemperamentoAusente {
  avaliado: false;
  motivo: MotivoPerfilAusente;
  idadeMeses: number | null;
  titulo: string;
  detalhe: string | null;
  /** true = merece ser investigado, não é o comportamento esperado. */
  anomalia: boolean;
}

export type EstadoPerfilTemperamento = { avaliado: true } | PerfilTemperamentoAusente;

function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Meses completos entre duas datas — mesma semântica do `getAgeMonths` do
 * formulário da anamnese, que é quem decide se o bloco aparece. Reimplementar
 * com arredondamento diferente faria a ficha discordar do formulário na
 * fronteira exata dos 24 meses, que é justamente onde estão os casos.
 */
export function idadeEmMesesCompletos(
  nascimento: string | Date | null | undefined,
  referencia: string | Date | null | undefined,
): number | null {
  const nasc = paraData(nascimento);
  const ref = paraData(referencia);
  if (!nasc || !ref) return null;
  let meses = (ref.getFullYear() - nasc.getFullYear()) * 12 + (ref.getMonth() - nasc.getMonth());
  if (ref.getDate() < nasc.getDate()) meses -= 1;
  return meses < 0 ? null : meses;
}

export function formatarIdadeMeses(meses: number | null): string | null {
  if (meses === null) return null;
  if (meses === 0) return 'menos de 1 mês';
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  if (resto === 0) return parteAnos;
  return `${parteAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`;
}

export function avaliarPerfilTemperamento(
  entrada: EntradaPerfilTemperamento,
): EstadoPerfilTemperamento {
  if ((entrada.temperamentoPrimario ?? '').trim() !== '') {
    return { avaliado: true };
  }

  const idadeMeses = idadeEmMesesCompletos(entrada.dataNascimento, entrada.dataAnamnese);
  const idadeTexto = formatarIdadeMeses(idadeMeses);
  const titulo = 'Perfil de temperamento não avaliado';

  // Sem o flag de bebê, a ausência não tem explicação conhecida. O formulário
  // trava o avanço até as 11 perguntas estarem marcadas, então isto não deveria
  // existir — e, se existir, não pode se disfarçar de caso de idade.
  if (!entrada.perfilBaby) {
    return {
      avaliado: false,
      motivo: 'nao_preenchido',
      idadeMeses,
      titulo: 'Perfil de temperamento não preenchido',
      detalhe:
        'A anamnese foi salva sem as respostas do bloco de perfil, e não é um caso de bebê. Vale conferir com quem preencheu.',
      anomalia: true,
    };
  }

  if (idadeMeses !== null && idadeMeses <= LIMITE_MESES_PERFIL_BABY) {
    return {
      avaliado: false,
      motivo: 'idade',
      idadeMeses,
      titulo,
      detalhe: `A criança tinha ${idadeTexto} quando a anamnese foi respondida. O bloco de perfil não é aplicado até ${LIMITE_MESES_PERFIL_BABY} meses.`,
      anomalia: false,
    };
  }

  // Prova direta: as marcações de "não se aplica" ficaram gravadas. Só acontece
  // no preenchimento presencial — a RPC do link online descarta a posição 5
  // (`where v ~ '^[1-4]$'`), então lá esta lista chega vazia.
  const marcouNaoSeAplica = (entrada.respostasPerfil ?? []).some(
    (r) => Number(r?.resposta_posicao) === POSICAO_NAO_SE_APLICA,
  );

  // Sem as marcações, a idade ainda decide: acima de 24 meses o formulário LAMK
  // exibiu as 11 perguntas e só libera o envio com todas marcadas, então chegar
  // aqui sem resposta válida significa que foram marcadas como "não se aplica".
  const blocoFoiExibido =
    idadeMeses !== null &&
    idadeMeses > LIMITE_MESES_PERFIL_BABY &&
    (entrada.tipoFormulario ?? '').toUpperCase() === 'LAMK';

  if (marcouNaoSeAplica || blocoFoiExibido) {
    const idadeEntre = idadeTexto ? ` (${idadeTexto} na anamnese)` : '';
    // Só afirma a marcação quando ela está gravada. Pelo link online não está —
    // ali a idade diz que o bloco apareceu, e mais do que isso seria inferência
    // apresentada como fato.
    const detalhe = marcouNaoSeAplica
      ? `As perguntas do bloco de perfil foram apresentadas${idadeEntre} e marcadas como "não se aplica".`
      : `As perguntas do bloco de perfil foram apresentadas${idadeEntre} e não receberam resposta válida.`;
    return {
      avaliado: false,
      motivo: 'nao_se_aplica',
      idadeMeses,
      titulo,
      detalhe,
      anomalia: false,
    };
  }

  // Nem idade nem marcação sustentam um motivo. O texto fica no genérico de
  // propósito: é aqui que cairia uma anamnese EMLA de adulto com menos de 3
  // respostas válidas, e "a criança tinha 32 anos" seria pior que não explicar.
  return {
    avaliado: false,
    motivo: 'indeterminado',
    idadeMeses,
    titulo,
    detalhe: 'O bloco de perfil não foi respondido.',
    anomalia: false,
  };
}

/**
 * Linha única para o briefing de WhatsApp do professor. Antes o texto saía com
 * `- + -` e `Col 0 · San 0 · Fle 0 · Mel 0`: quatro zeros parecem uma medição
 * que deu zero, e o professor não tem a quem perguntar.
 */
export function textoPerfilAusenteWhatsapp(estado: PerfilTemperamentoAusente): string {
  const rotulo = estado.motivo === 'nao_preenchido' ? 'Não preenchido' : 'Não avaliado';
  return estado.detalhe ? `${rotulo} — ${estado.detalhe}` : rotulo;
}
