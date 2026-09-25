// Matriz de decisao do escritor de presenca no Emusys — pura, sem IO.
// Desenho: docs/plans/2026-09-25-presenca-escrita-emusys-desenho.md
//
// Precedencia por FONTE, nos dois sentidos:
//  - agenda_secretaria pode corrigir marca humana la (presente <-> falta);
//  - professor_la_teacher/fabio_audio so preenche "sem resposta"; marca humana
//    que nao e nossa vira conflito_marca_humana, nunca escrita;
//  - "marca nossa" = ultimo 'escrito' do livro para o par cujo valor bate com
//    o que esta la — se difere, alguem mexeu depois de nos (marca humana).

export type FonteDecisao =
  | 'agenda_secretaria'
  | 'professor_la_teacher'
  | 'fabio_audio'
  | 'emusys'
  | 'legado'
  | string;

export type MarcaEmusys = 'presente' | 'ausente_marcada' | 'sem_resposta';

export type DecisaoEscrita =
  | { acao: 'escrever'; presente: boolean; motivo: string }
  | {
      acao: 'pular';
      decisao:
        | 'ja_coerente'
        | 'conflito_marca_humana'
        | 'pulado_linha_protegida'
        | 'pulado_identidade_divergente'
        | 'pulado_sem_estado'
        | 'pulado_sem_canal_justificada'
        | 'pulado_fonte_emusys';
      motivo: string;
    };

/** Estado operacional da linha lida no GET /aula. */
export function classificarMarcaEmusys(
  presenca: string | null | undefined,
  horarioPresenca: string | null | undefined,
): MarcaEmusys {
  if (presenca === 'presente') return 'presente';
  // `ausente` sem horario e o DEFAULT do Emusys: ninguem fechou a chamada.
  // So vira falta humana quando existe horario carimbado.
  if (presenca === 'ausente' && horarioPresenca) return 'ausente_marcada';
  return 'sem_resposta';
}

/** A marca la confere com o ultimo 'escrito' nosso para o mesmo par? */
export function marcaEhNossa(
  marca: MarcaEmusys,
  ultimaEscrita: { presente: boolean } | null,
): boolean {
  if (!ultimaEscrita) return false;
  if (marca === 'presente') return ultimaEscrita.presente === true;
  if (marca === 'ausente_marcada') return ultimaEscrita.presente === false;
  return false;
}

/**
 * Regras que dispensam o GET /aula: dependem so do estado vigente + fonte.
 * O escritor usa isto como pre-filtro (economiza chamada na API) e
 * decidirEscritaAluno o repete internamente — fonte unica, sem divergencia.
 */
export function decisaoPrecoceAluno(
  estadoVigente: string | null,
  fonte: FonteDecisao | null,
): DecisaoEscrita | null {
  const vigente = (estadoVigente ?? '').toLowerCase();

  if (!vigente) {
    return { acao: 'pular', decisao: 'pulado_sem_estado', motivo: 'sem_resposta_vigente' };
  }
  if (fonte === 'emusys') {
    return { acao: 'pular', decisao: 'pulado_fonte_emusys', motivo: 'anti_laco' };
  }
  if (vigente === 'falta_justificada' || vigente === 'justificada') {
    // A API 1.7.0 nao tem flag de justificada: escrever 'ausente' apagaria o
    // estatuto. Fora do escritor; a sombra mede o volume para o Alf decidir.
    return { acao: 'pular', decisao: 'pulado_sem_canal_justificada', motivo: vigente };
  }
  if (vigente === 'aula_cancelada' || vigente === 'cancelada') {
    return { acao: 'pular', decisao: 'pulado_linha_protegida', motivo: vigente };
  }
  if (vigente !== 'presente' && vigente !== 'falta') {
    return { acao: 'pular', decisao: 'pulado_sem_estado', motivo: `vigente_${vigente}` };
  }
  return null;
}

export function decidirEscritaAluno(input: {
  estadoVigente: string | null;
  fonte: FonteDecisao | null;
  linhaJustificada: boolean;
  linhaCancelada: boolean;
  aulaCancelada: boolean;
  identidadeOk: boolean;
  marca: MarcaEmusys;
  ultimaEscrita: { presente: boolean } | null;
}): DecisaoEscrita {
  const vigente = (input.estadoVigente ?? '').toLowerCase();

  const precoce = decisaoPrecoceAluno(input.estadoVigente, input.fonte);
  if (precoce) return precoce;

  if (input.aulaCancelada || input.linhaCancelada || input.linhaJustificada) {
    return { acao: 'pular', decisao: 'pulado_linha_protegida', motivo: 'linha_justificada_ou_cancelada' };
  }
  if (!input.identidadeOk) {
    return { acao: 'pular', decisao: 'pulado_identidade_divergente', motivo: 'id_aluno_divergente' };
  }

  const desejado = vigente === 'presente';

  if (input.marca === 'sem_resposta') {
    // Medido 25/09: a API nunca carimba horario_presenca num 'ausente' —
    // nem quando o PATCH manda `horario` explicito. Uma falta que NOS
    // escrevemos rele como 'sem_resposta'; sem este atalho cada varredura
    // repetiria o mesmo PATCH (o 23505 do livro absorve a linha, mas a
    // chamada contra o Emusys acontece de verdade a cada 5 min).
    if (input.ultimaEscrita?.presente === false && !desejado) {
      return { acao: 'pular', decisao: 'ja_coerente', motivo: 'ausente_proprio_sem_carimbo' };
    }
    return { acao: 'escrever', presente: desejado, motivo: 'preenche_sem_resposta' };
  }

  const nossa = marcaEhNossa(input.marca, input.ultimaEscrita);
  const marcaLaValor = input.marca === 'presente';

  if (nossa) {
    if (marcaLaValor === desejado) {
      return { acao: 'pular', decisao: 'ja_coerente', motivo: 'marca_propria_igual' };
    }
    return { acao: 'escrever', presente: desejado, motivo: 'corrige_marca_propria' };
  }

  // Marca humana la (presente ou falta com horario) que nao saiu do nosso livro.
  if (marcaLaValor === desejado) {
    return { acao: 'pular', decisao: 'ja_coerente', motivo: 'marca_humana_igual' };
  }
  if (input.fonte === 'agenda_secretaria') {
    // A propria secretaria mudando de ideia: corrige nos dois sentidos.
    return { acao: 'escrever', presente: desejado, motivo: 'correcao_secretaria_sobre_marca' };
  }
  return { acao: 'pular', decisao: 'conflito_marca_humana', motivo: 'marca_humana_divergente' };
}

export function decidirEscritaProfessor(input: {
  aulaCancelada: boolean;
  identidadeOk: boolean;
  marca: MarcaEmusys;
  ultimaEscrita: { presente: boolean } | null;
}): DecisaoEscrita {
  // Professor so entra na fila pela ficha confirmada: o alvo e sempre presente.
  if (input.aulaCancelada) {
    return { acao: 'pular', decisao: 'pulado_linha_protegida', motivo: 'aula_cancelada' };
  }
  if (!input.identidadeOk) {
    return { acao: 'pular', decisao: 'pulado_identidade_divergente', motivo: 'professor_id_divergente' };
  }
  if (input.marca === 'sem_resposta') {
    return { acao: 'escrever', presente: true, motivo: 'preenche_sem_resposta' };
  }
  if (input.marca === 'presente') {
    return { acao: 'pular', decisao: 'ja_coerente', motivo: 'professor_ja_presente' };
  }
  // ausente_marcada: nunca desmarca presenca/falta registrada pela equipe —
  // exceto se a marca for nossa e o vigente pedir correcao (aqui sempre presente).
  if (marcaEhNossa(input.marca, input.ultimaEscrita)) {
    return { acao: 'escrever', presente: true, motivo: 'corrige_marca_propria' };
  }
  return { acao: 'pular', decisao: 'conflito_marca_humana', motivo: 'marca_humana_divergente' };
}
