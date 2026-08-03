export type LinhaPreviewWhatsApp = {
  tipo: "texto" | "citacao" | "vazio";
  conteudo: string;
};

export function segmentarPreviewWhatsApp(
  texto: string,
): LinhaPreviewWhatsApp[] {
  return texto.split("\n").map((linha) => {
    if (linha.length === 0) return { tipo: "vazio", conteudo: "" };
    if (linha.startsWith("> ")) {
      return { tipo: "citacao", conteudo: linha.slice(2) };
    }
    return { tipo: "texto", conteudo: linha };
  });
}
