/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@1";
import { segmentarPreviewWhatsApp } from "./whatsappPreview.ts";

Deno.test("separa citacao e texto comum preservando linhas", () => {
  assertEquals(
    segmentarPreviewWhatsApp(
      "Posso perguntar?\n\n> *Pergunta importante*\n\n_Pedido sincero_",
    ),
    [
      { tipo: "texto", conteudo: "Posso perguntar?" },
      { tipo: "vazio", conteudo: "" },
      { tipo: "citacao", conteudo: "*Pergunta importante*" },
      { tipo: "vazio", conteudo: "" },
      { tipo: "texto", conteudo: "_Pedido sincero_" },
    ],
  );
});

Deno.test("nao interpreta maior que fora do inicio da linha", () => {
  assertEquals(
    segmentarPreviewWhatsApp("2 > 1"),
    [{ tipo: "texto", conteudo: "2 > 1" }],
  );
});

Deno.test("preserva maior que sem espaco e linha final vazia", () => {
  assertEquals(
    segmentarPreviewWhatsApp(">sem citacao\n"),
    [
      { tipo: "texto", conteudo: ">sem citacao" },
      { tipo: "vazio", conteudo: "" },
    ],
  );
});
