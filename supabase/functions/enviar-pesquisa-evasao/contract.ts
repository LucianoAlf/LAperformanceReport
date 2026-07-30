export interface TelefonePesquisaInput {
  telefoneOverride?: string | null;
  telefoneSnapshot?: string | null;
  whatsappAluno?: string | null;
  telefoneAluno?: string | null;
}

export function resolverTelefonePesquisa(input: TelefonePesquisaInput): string {
  const origem = [
    input.telefoneOverride,
    input.telefoneSnapshot,
    input.whatsappAluno,
    input.telefoneAluno,
  ].find((valor) => typeof valor === 'string' && valor.trim().length > 0);

  let digitos = String(origem ?? '').replace(/\D/g, '');

  if ((digitos.length === 10 || digitos.length === 11) && !digitos.startsWith('55')) {
    digitos = `55${digitos}`;
  }

  return digitos;
}

export function telefonePesquisaValido(telefone: string): boolean {
  return /^55\d{10,11}$/.test(telefone);
}
