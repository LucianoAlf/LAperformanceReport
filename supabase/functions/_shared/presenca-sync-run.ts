export type ModoPresencaSyncRun = 'presenca' | 'agenda' | 'metadados';

export type ContagensPresencaSync = {
  paginas_lidas: number;
  aulas_lidas: number;
  presencas_lidas: number;
};

type RespostaRpc = {
  data: unknown;
  error: unknown;
};

export type ClientePresencaSyncRun = {
  rpc: (
    nome: string,
    parametros: Record<string, unknown>,
  ) => PromiseLike<RespostaRpc>;
};

type ResultadoTrabalho<T> = {
  valor: T;
  contagens: ContagensPresencaSync;
  snapshot: unknown;
};

type ContextoTrabalho = {
  syncRunId: string;
  heartbeat: (contagens: ContagensPresencaSync) => Promise<void>;
};

type ExecucaoAdquirida<T> = {
  status: 'concluida';
  valor: T;
  snapshotHash: string;
  publicavel: true;
};

type ExecucaoDeduplicada = {
  status: 'deduplicada';
  motivo: string;
};

const CONTAGENS_ZERADAS: ContagensPresencaSync = {
  paginas_lidas: 0,
  aulas_lidas: 0,
  presencas_lidas: 0,
};

const CODIGOS_SEGUROS = new Set([
  'EMUSYS_AULAS_CURSOR_AUSENTE',
  'EMUSYS_AULAS_CURSOR_REPETIDO',
  'EMUSYS_AULAS_JSON_INVALIDO',
  'EMUSYS_AULAS_PAYLOAD_INVALIDO',
  'PRESENCA_SYNC_AULA_GRAVACAO_FALHOU',
  'PRESENCA_SYNC_ROSTER_GRAVACAO_FALHOU',
  'PRESENCA_SYNC_ADMINISTRATIVO_GRAVACAO_FALHOU',
  'PRESENCA_SYNC_RAW_GRAVACAO_FALHOU',
  'PRESENCA_SYNC_EXPERIMENTAL_RAW_GRAVACAO_FALHOU',
  'PRESENCA_SYNC_RECONCILIACAO_ROSTER_FALHOU',
  'PRESENCA_SYNC_LOG_GRAVACAO_FALHOU',
  'PRESENCA_SYNC_MAPA_AULAS_INCOMPLETO',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validarContagens(
  contagens: ContagensPresencaSync,
): ContagensPresencaSync {
  const normalizada = { ...contagens };
  for (const valor of Object.values(normalizada)) {
    if (!Number.isSafeInteger(valor) || valor < 0) {
      throw new Error('CONTAGENS_SYNC_INVALIDAS');
    }
  }
  return normalizada;
}

async function chamarRpc(
  cliente: ClientePresencaSyncRun,
  nome: string,
  parametros: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await cliente.rpc(nome, parametros);
  if (error) throw new Error(`RPC_${nome.toUpperCase()}_FALHOU`);
  return data;
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function ordenarDatasSync(datas: string[], hoje: string): string[] {
  return [...new Set(datas)].sort((a, b) => {
    if (a === hoje) return -1;
    if (b === hoje) return 1;
    return b.localeCompare(a);
  });
}

export function dataAlvoSyncNaJanela(
  dataInicio: string,
  dataFim: string,
  referencia: string,
): string {
  if (dataInicio > dataFim) throw new Error('janela de sync invalida');
  if (referencia < dataInicio) return dataInicio;
  if (referencia > dataFim) return dataFim;
  return referencia;
}

export function redigirErroCodigo(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'SYNC_TIMEOUT';
  }
  if (isRecord(error) && error.name === 'TimeoutError') {
    return 'SYNC_TIMEOUT';
  }
  if (error instanceof Error && CODIGOS_SEGUROS.has(error.message)) {
    return error.message;
  }
  if (
    isRecord(error) &&
    typeof error.status === 'number' &&
    Number.isInteger(error.status)
  ) {
    return 'EMUSYS_HTTP_FALHOU';
  }
  return 'SYNC_FALHA_INTERNA';
}

export async function executarSyncPresencaComLease<T>(input: {
  cliente: ClientePresencaSyncRun;
  unidadeId: string;
  modo: ModoPresencaSyncRun;
  dataAlvo: string;
  requestId: string;
  leaseSegundos?: number;
  trabalho: (contexto: ContextoTrabalho) => Promise<ResultadoTrabalho<T>>;
}): Promise<ExecucaoAdquirida<T> | ExecucaoDeduplicada> {
  const inicio = await chamarRpc(
    input.cliente,
    'presenca_sync_iniciar_v1',
    {
      p_unidade_id: input.unidadeId,
      p_modo: input.modo,
      p_data_alvo: input.dataAlvo,
      p_request_id: input.requestId,
      p_lease_segundos: input.leaseSegundos ?? 180,
    },
  );

  if (!isRecord(inicio) || typeof inicio.adquirida !== 'boolean') {
    throw new Error('PRESENCA_SYNC_INICIO_INVALIDO');
  }
  if (!inicio.adquirida) {
    return {
      status: 'deduplicada',
      motivo: typeof inicio.motivo === 'string' ? inicio.motivo : 'lease_ativo',
    };
  }
  if (typeof inicio.run_id !== 'string' || inicio.run_id.length === 0) {
    throw new Error('PRESENCA_SYNC_RUN_ID_INVALIDO');
  }

  const runId = inicio.run_id;
  let ultimasContagens = { ...CONTAGENS_ZERADAS };
  const heartbeat = async (contagens: ContagensPresencaSync): Promise<void> => {
    ultimasContagens = validarContagens(contagens);
    const resposta = await chamarRpc(
      input.cliente,
      'presenca_sync_heartbeat_v1',
      { p_run_id: runId, p_contagens: ultimasContagens },
    );
    if (!isRecord(resposta) || resposta.ok !== true) {
      throw new Error('PRESENCA_SYNC_HEARTBEAT_REJEITADO');
    }
  };

  try {
    const resultado = await input.trabalho({
      heartbeat,
      syncRunId: runId,
    });
    await heartbeat(resultado.contagens);
    const snapshotHash = await sha256Hex(resultado.snapshot);
    const finalizacao = await chamarRpc(
      input.cliente,
      'presenca_sync_finalizar_v1',
      {
        p_run_id: runId,
        p_status: 'concluida',
        p_snapshot_hash: snapshotHash,
        p_contagens: ultimasContagens,
        p_erro_codigo: null,
      },
    );
    if (
      !isRecord(finalizacao) ||
      finalizacao.ok !== true ||
      finalizacao.status !== 'concluida' ||
      finalizacao.publicavel !== true
    ) {
      throw new Error('PRESENCA_SYNC_FINALIZACAO_REJEITADA');
    }
    return {
      status: 'concluida',
      valor: resultado.valor,
      snapshotHash,
      publicavel: true,
    };
  } catch (error) {
    try {
      await chamarRpc(
        input.cliente,
        'presenca_sync_finalizar_v1',
        {
          p_run_id: runId,
          p_status: 'falhou',
          p_snapshot_hash: null,
          p_contagens: ultimasContagens,
          p_erro_codigo: redigirErroCodigo(error),
        },
      );
    } catch {
      // Preserva a causa original; o lease expira e permite retomada segura.
    }
    throw error;
  }
}
