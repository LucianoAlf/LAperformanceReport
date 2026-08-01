export interface ResultadoCapturaResposta {
  capturaRespostaPreparada: boolean;
  warning?: string;
}

const WARNING_CAPTURA_NAO_PREPARADA =
  "Mensagem enviada, mas a captura da resposta nao foi preparada";

export async function persistirOuConfirmarResultadoEnviado(adapters: {
  registrar: () => Promise<void>;
  confirmarPersistido: () => Promise<boolean>;
}): Promise<boolean> {
  try {
    await adapters.registrar();
    return true;
  } catch {
    return await adapters.confirmarPersistido();
  }
}

export async function prepararCapturaRespostaBestEffort(
  executarUpsert: () => Promise<{
    error: { message: string } | null;
  }>,
): Promise<ResultadoCapturaResposta> {
  try {
    const { error } = await executarUpsert();
    if (!error) return { capturaRespostaPreparada: true };
  } catch {
    // O envio ja foi confirmado; a captura de resposta e best-effort.
  }

  return {
    capturaRespostaPreparada: false,
    warning: WARNING_CAPTURA_NAO_PREPARADA,
  };
}
