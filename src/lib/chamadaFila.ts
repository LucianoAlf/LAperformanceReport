import type { AulaAgenda, PresencaEnvelopeAgenda } from '@/hooks/useAgendaDia';
import { chamadaCompleta } from '@/components/App/Agenda/Chamada/chamadaUtils';
import { adaptarPresencaProfessorCanonica } from '@/lib/presencaCanonica';
import { aulaJaOcorreu, minutosDeHHMM } from '@/lib/agenda';

export interface PendenciaAula {
  aula: AulaAgenda;
  /** Quantos alunos vinculados ainda não têm destino nesta aula. */
  alunosSemDestino: number;
}

export interface PendenciaProfessor {
  professorId: number;
  nome: string;
  /** Ids das aulas do dia desse professor — o que a marcação do dia cobre. */
  aulaIds: number[];
  primeiraHora: string;
  ultimaHora: string;
  qtdAulas: number;
}

export interface FilaDaChamada {
  professores: PendenciaProfessor[];
  aulas: PendenciaAula[];
  total: number;
}

/**
 * O que falta fechar no dia — professores sem marcação e aulas já terminadas
 * sem chamada.
 *
 * 🔴 **Esta função não decide nada sobre presença.** Ela COMPÕE as regras que
 * já existem: `chamadaCompleta` diz se a aula está fechada (a mesma que o
 * desktop usa) e `adaptarPresencaProfessorCanonica` diz o estado do professor.
 * Reescrever qualquer uma das duas aqui criaria uma segunda resposta para a
 * pergunta que o relatório diário das 9h também faz — e a tela e o relatório
 * passariam a discordar sobre quem está devendo.
 *
 * A ordem é por hora de TÉRMINO crescente: quem está esperando há mais tempo
 * vem primeiro. É o inverso da Agenda, que é uma leitura do dia; aqui é uma
 * fila de trabalho, e o topo é o mais atrasado.
 */
export function montarFilaDaChamada(
  aulas: AulaAgenda[],
  data: string,
  agora: Date,
  envelope: PresencaEnvelopeAgenda,
): FilaDaChamada {
  const pendentes = aulas.filter(
    (aula) =>
      // ⚠️ Aula que ainda não terminou NÃO é redundante com `chamadaCompleta`,
      // embora pareça: aquela função devolve `false` para aula sem nenhum
      // aluno vinculado, e sem esta linha um horário vago do fim da tarde
      // entraria na fila de manhã, cobrando uma chamada que ainda não existe.
      // Provado por mutação — a primeira versão deste teste não pegava.
      aulaJaOcorreu(data, aula.hora_fim, agora) &&
      // "Está fechada?" vem de `chamadaCompleta` e SÓ dela. Cancelada já sai
      // por lá (`if (aula.cancelada) return true`), então repetir a checagem
      // aqui seria um segundo lugar dizendo a mesma coisa — e o dia em que os
      // dois discordassem, esta tela e o relatório das 9h discordariam junto.
      !chamadaCompleta(aula, data, agora),
  );

  const filaAulas: PendenciaAula[] = pendentes
    .map((aula) => ({
      aula,
      alunosSemDestino: aula.alunos.filter((a) => a.aluno_id != null).length,
    }))
    .sort(
      (a, b) =>
        minutosDeHHMM(a.aula.hora_fim) - minutosDeHHMM(b.aula.hora_fim) ||
        a.aula.chave.localeCompare(b.aula.chave),
    );

  const professores = professoresSemMarcacao(aulas, envelope);
  return { professores, aulas: filaAulas, total: professores.length + filaAulas.length };
}

/**
 * Professores do dia que ninguém marcou como presente nem ausente.
 *
 * ⚠️ `dados_desatualizados` e `roster_em_revisao` NÃO entram na fila. Eles
 * querem dizer "não sei", não "ninguém marcou" — cobrar a equipe por causa de
 * um sincronismo atrasado é a mesma inversão que a régua de `sem_captura` já
 * proíbe do outro lado do sistema. Quando o dado volta, o professor reaparece
 * na fila se de fato estiver faltando marcação.
 *
 * ⚠️ Isso NÃO é checado aqui: `adaptarPresencaProfessorCanonica` já devolve
 * esses dois como estado próprio, e só `indeterminado` passa no filtro. Uma
 * checagem local de `dados_status` seria um segundo lugar decidindo o mesmo —
 * a mutação que a removia não quebrava teste nenhum, que é o sintoma.
 */
function professoresSemMarcacao(
  aulas: AulaAgenda[],
  envelope: PresencaEnvelopeAgenda,
): PendenciaProfessor[] {
  const porProfessor = new Map<number, PendenciaProfessor>();
  for (const aula of aulas) {
    if (aula.professor_id == null || aula.cancelada) continue;
    const atual = porProfessor.get(aula.professor_id);
    if (atual === undefined) {
      porProfessor.set(aula.professor_id, {
        professorId: aula.professor_id,
        nome: aula.professor_nome ?? 'sem professor',
        aulaIds: [...aula.aula_ids],
        primeiraHora: aula.hora_inicio,
        ultimaHora: aula.hora_fim,
        qtdAulas: 1,
      });
      continue;
    }
    atual.aulaIds.push(...aula.aula_ids);
    atual.qtdAulas += 1;
    if (minutosDeHHMM(aula.hora_inicio) < minutosDeHHMM(atual.primeiraHora)) {
      atual.primeiraHora = aula.hora_inicio;
    }
    if (minutosDeHHMM(aula.hora_fim) > minutosDeHHMM(atual.ultimaHora)) {
      atual.ultimaHora = aula.hora_fim;
    }
  }

  return [...porProfessor.values()]
    .filter((p) => {
      const decisao = adaptarPresencaProfessorCanonica({
        professorId: p.professorId,
        aulaIds: p.aulaIds,
        envelope,
      });
      return decisao.estado === 'indeterminado';
    })
    .sort(
      (a, b) =>
        minutosDeHHMM(a.primeiraHora) - minutosDeHHMM(b.primeiraHora) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}
