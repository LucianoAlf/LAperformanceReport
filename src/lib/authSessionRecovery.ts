type ErroComMensagem = { message?: unknown };

export interface RecuperarSessaoRevogadaInput {
  erro: unknown;
  limparSessaoLocal: () => Promise<void>;
  limparEstado: () => void;
}

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === 'object' && typeof (erro as ErroComMensagem).message === 'string') {
    return (erro as ErroComMensagem).message as string;
  }
  return '';
}

export function isRefreshTokenRevogado(erro: unknown): boolean {
  return /invalid\s+refresh\s+token/i.test(mensagemDoErro(erro));
}

export async function recuperarSessaoRevogada({
  erro,
  limparSessaoLocal,
  limparEstado,
}: RecuperarSessaoRevogadaInput): Promise<boolean> {
  if (!isRefreshTokenRevogado(erro)) return false;

  try {
    await limparSessaoLocal();
  } catch {
    // A credencial já foi recusada; limpar o estado local continua sendo seguro.
  } finally {
    limparEstado();
  }

  return true;
}
