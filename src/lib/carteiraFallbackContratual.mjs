function numero(valor) {
  const numeroConvertido = Number(valor);
  return Number.isFinite(numeroConvertido) ? numeroConvertido : 0;
}

function texto(valor, fallback = '') {
  return typeof valor === 'string' && valor.trim() ? valor : fallback;
}

function lista(valor) {
  return Array.isArray(valor) ? valor.filter((item) => typeof item === 'string') : [];
}

/**
 * Mantém a aba Carteira útil se os KPIs de período não responderem.
 *
 * A origem aqui é a RPC contratual `get_carteira_professores`. Ela não tenta
 * reconstruir nem substituir as métricas canônicas que falharam; apenas expõe
 * a própria linha contratual que já chegou à tela.
 */
export function montarCarteirasFallbackContratual({
  linhasContratuais = [],
  trancadosPorProfessor = new Map(),
  trancadosDisponiveis = true,
  mediaTurmaDisponivel = true,
}) {
  return linhasContratuais
    .map((linha) => {
      const professorId = numero(linha?.professor_id);
      const totalAlunos = numero(linha?.total_alunos);

      return {
        id: professorId,
        nome: texto(linha?.professor_nome, 'Professor sem identificação'),
        foto_url: linha?.foto_url ?? null,
        total_alunos: totalAlunos,
        alunos_lamk: numero(linha?.alunos_lamk),
        alunos_emla: numero(linha?.alunos_emla),
        mrr_total: numero(linha?.mrr_total),
        ticket_medio: numero(linha?.ticket_medio),
        alunos_ticket: numero(linha?.alunos_ticket),
        tempo_medio_meses: numero(linha?.tempo_medio_meses),
        total_turmas: numero(linha?.total_turmas),
        media_alunos_turma: !mediaTurmaDisponivel || linha?.media_alunos_turma === null || linha?.media_alunos_turma === undefined
          ? null
          : numero(linha.media_alunos_turma),
        cursos: lista(linha?.cursos),
        unidades: lista(linha?.unidades),
        health_score: null,
        health_status: null,
        health_score_exibivel: false,
        health_score_estado_publicacao: 'indisponivel',
        health_score_cobertura: null,
        health_score_motivo: 'Dados de performance indisponíveis no momento',
        total_trancados: trancadosDisponiveis
          ? numero(trancadosPorProfessor.get(professorId))
          : null,
      };
    })
    .filter((carteira) => carteira.id > 0 && carteira.total_alunos > 0);
}
