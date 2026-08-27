// Extraido de enviar-pesquisa-evasao/contract.ts na Task 6 (fix round 1):
// renderizacao de template compartilhada entre o 1o toque e a repescagem.
// Nenhuma mudanca de comportamento — o contract.ts original reexporta daqui.

export interface RenderInput {
  template: string;
  valores: Record<string, string | null | undefined>;
}

const PLACEHOLDERS_PERMITIDOS = new Set([
  "aluno_primeiro_nome",
  "responsavel_primeiro_nome",
  "assinatura_nome",
  "assinatura_com_artigo",
  "aluno_com_preposicao",
]);

export function renderizarMensagem(input: RenderInput): string {
  if (typeof input.template !== "string" || input.template.length === 0) {
    throw new Error("Template invalido");
  }

  const renderizada = input.template.replace(
    /{{\s*([a-z][a-z0-9_]*)\s*}}/gi,
    (_placeholder, nome: string) => {
      if (!PLACEHOLDERS_PERMITIDOS.has(nome)) {
        throw new Error(`Placeholder invalido: ${nome}`);
      }

      const valor = input.valores[nome];
      if (typeof valor !== "string" || valor.trim().length === 0) {
        throw new Error(`Placeholder ausente: ${nome}`);
      }

      return valor;
    },
  );

  if (renderizada.includes("{{") || renderizada.includes("}}")) {
    throw new Error("Placeholder invalido no template");
  }

  return renderizada;
}
