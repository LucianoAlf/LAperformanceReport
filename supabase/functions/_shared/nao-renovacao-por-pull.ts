/**
 * Não-renovação que chega por PULL, e não por webhook.
 *
 * A regra de negócio da não-renovação já existe e está certa: `handleNaoRenovacao`
 * em `processar-matricula-emusys` grava a movimentação, marca `alunos.status='inativo'`
 * com `data_saida`, registra a passagem em `alunos_historico`, tem chave de idempotência,
 * log e invariantes.
 *
 * O que faltava era o GATILHO. Ela depende do webhook `matricula_finalizacao`, e o Emusys
 * não dispara webhook quando o contrato apenas chega ao fim — não renovar é um NÃO-EVENTO.
 * Medido de jun a ago/2026: 196 renovações (99 via webhook) contra 16 não-renovações,
 * ZERO via webhook. O numerador chega sozinho; o denominador só cresce se alguém digitar.
 * Em 2026, 99 contratos concluíram e apenas 51 viraram lançamento.
 *
 * Desde 21/08/2026 o `sync-matriculas-emusys` enxerga a conclusão: quando uma matrícula
 * some da foto operacional, ele consulta `/matriculas?aluno_id=N&status=todas` e recebe
 * `motivo_inativa: "concluida"`. Este módulo traduz esse item da API para o formato do
 * webhook, para que a MESMA regra rode — em vez de uma segunda implementação.
 *
 * ⚠️ Duas fontes de escrita com regras próprias para o mesmo campo foi a causa-raiz das
 * duplicatas de renovação neste projeto (o `FormRenovacao` calculava a competência de um
 * jeito e a edge de outro). Por isso aqui só existe TRADUÇÃO de formato, nunca decisão
 * de negócio: quem decide continua sendo o handler do webhook.
 *
 * ⚠️ Forward-only por construção. O disparo acontece na TRANSIÇÃO detectada pelo caminho
 * de ausentes, que só seleciona linhas ainda `ativa`/`trancada` no nosso espelho. Depois
 * da primeira reidratação a linha vira `inativa` e nunca mais é selecionada — então não
 * há backfill dos 408 `concluida` históricos, nem risco de disparo repetido a cada noite.
 */

export const ESCOLA_ID_POR_UNIDADE: Record<string, number> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 39, // Campo Grande
  '95553e96-971b-4590-a6eb-0201d013c14d': 40, // Recreio
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 316, // Barra
};

/**
 * Texto do motivo enviado ao handler. Ele vira `movimentacoes_admin.motivo`, e o trigger
 * `trg_resolver_motivo_saida_movimentacao_admin` casa por `motivos_saida.nome_normalizado`
 * e preenche a FK — hoje o id 18, categoria `conclusao`, `conta_score_professor = false`
 * (contrato que chegou ao fim não penaliza o professor).
 *
 * ⚠️ Deixar a resolução com o trigger é de propósito: cravar o id 18 aqui criaria uma
 * segunda fonte para a mesma tradução, e o trigger já cobre todo caminho de escrita.
 */
export const MOTIVO_CONTRATO_CONCLUIDO = 'Concluído e não vai renovar';

/**
 * `true` só quando a matrícula recuperada diz, ela mesma, que o contrato chegou ao fim.
 *
 * ⚠️ `interrompida` NÃO entra: alguém fechou o contrato antes da hora, e isso é evasão —
 * classificação que o handler do webhook já faz por outro caminho. Medido nas 58
 * não-renovações lançadas à mão em 2026: 46 são `concluida` (cobertas aqui) e 5 são
 * `interrompida`, que a fonte classifica como evasão. Divergência de processo no Emusys,
 * não de código.
 */
export function ehContratoConcluido(matricula: Record<string, unknown> | null | undefined): boolean {
  if (!matricula) return false;
  const status = String((matricula as { status?: unknown }).status ?? '').trim().toLowerCase();
  const motivo = String((matricula as { motivo_inativa?: unknown }).motivo_inativa ?? '')
    .trim()
    .toLowerCase();
  return status === 'inativa' && motivo === 'concluida';
}

/**
 * A data da saída é a da ÚLTIMA AULA do contrato, não a de hoje nem a da detecção.
 * O sync roda de madrugada e pode achar a conclusão dias depois; datar pelo dia da
 * descoberta jogaria a movimentação para a competência errada.
 */
export function dataFimDoContrato(matricula: Record<string, unknown>): string | null {
  const contrato = (matricula as { contrato_atual?: Record<string, unknown> })?.contrato_atual;
  const bruto = contrato?.data_original_ultima_aula ?? contrato?.data_ultima_aula ?? null;
  if (!bruto) return null;
  const texto = String(bruto).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

/**
 * Traduz o item de `GET /matriculas` para o corpo que `parsePayload` espera.
 *
 * Os dois formatos divergem de propósito no Emusys — a API usa `id`/`aluno.nome` e o
 * webhook usa `matricula_id`/`nome_aluno` —, então a tradução precisa ser explícita.
 * Devolve `null` quando falta o que o handler exige, para o sync não disparar chamada
 * que viraria `erro_aluno_nao_encontrado` do outro lado.
 */
export function montarWebhookFinalizacao(
  matricula: Record<string, unknown>,
  unidadeId: string,
): Record<string, unknown> | null {
  if (!ehContratoConcluido(matricula)) return null;

  const escolaId = ESCOLA_ID_POR_UNIDADE[unidadeId];
  if (!escolaId) return null;

  const matriculaId = Number((matricula as { id?: unknown }).id);
  if (!Number.isFinite(matriculaId)) return null;

  const dataEvento = dataFimDoContrato(matricula);
  if (!dataEvento) return null;

  const aluno = (matricula as { aluno?: Record<string, unknown> }).aluno || {};
  const nomeAluno = String(aluno.nome ?? '').trim();
  if (!nomeAluno) return null;

  const responsavel = (matricula as { responsavel?: Record<string, unknown> }).responsavel || {};
  const contrato = (matricula as { contrato_atual?: Record<string, unknown> }).contrato_atual || {};
  const disciplinas = Array.isArray(contrato.disciplinas) ? contrato.disciplinas : [];
  const primeira = (disciplinas[0] || {}) as Record<string, unknown>;

  return {
    evento: 'matricula_finalizacao',
    escola_id: escolaId,
    // Marca a origem no payload bruto, que é gravado no log do handler — sem isso, um
    // registro vindo do pull ficaria indistinguível de um webhook real do Emusys.
    origem_sync: 'sync-matriculas-emusys',
    matricula: {
      matricula_id: matriculaId,
      aluno_id: aluno.id ?? null,
      lead_id: aluno.lead_id ?? null,
      nome_aluno: nomeAluno,
      telefone_aluno: aluno.telefone ?? null,
      email_aluno: aluno.email ?? null,
      data_nascimento_aluno: aluno.data_nascimento ?? null,
      data_matricula: (matricula as { data_matricula?: unknown }).data_matricula ?? null,
      nome_curso: primeira.nome ?? null,
      valor: contrato.valor_mensalidade ?? null,
      nome_responsavel: responsavel.nome ?? null,
      telefone_responsavel: responsavel.telefone ?? null,
      status: 'inativa',
      motivo_inativa: 'concluida',
      disciplinas,
    },
    finalizacao: {
      data_finalizacao: dataEvento,
      motivo: MOTIVO_CONTRATO_CONCLUIDO,
      motivo_inativa: 'concluida',
    },
  };
}
