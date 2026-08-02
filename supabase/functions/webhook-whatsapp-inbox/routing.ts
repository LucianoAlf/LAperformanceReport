export interface EncaminharPesquisaPrimeiraAulaParams {
  payload: unknown;
  mensagem: { buttonOrListid?: string | null };
  invocar: (
    nome: string,
    body: unknown,
  ) => Promise<{ error?: unknown | null }>;
  diagnosticar: (resultado: "accepted" | "error") => void;
}

export async function encaminharPesquisaPrimeiraAula(
  params: EncaminharPesquisaPrimeiraAulaParams,
): Promise<{ handled: boolean; processado: boolean }> {
  if (!params.mensagem.buttonOrListid) {
    return { handled: false, processado: false };
  }

  try {
    const { error } = await params.invocar(
      "processar-resposta-pesquisa",
      params.payload,
    );
    if (error) throw error;

    params.diagnosticar("accepted");
    return { handled: true, processado: true };
  } catch {
    params.diagnosticar("error");
    return { handled: true, processado: false };
  }
}

export function deveProcessarRespostaEvasao(
  mensagem: { buttonOrListid?: string | null },
): boolean {
  return !mensagem.buttonOrListid;
}
