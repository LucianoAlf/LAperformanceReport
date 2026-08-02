// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  autenticarServiceRole,
  type ContextoMensagemAudio,
  ErroTranscricao,
  type ProcessadorMidia,
  processarTranscricao,
  type RepositorioTranscricao,
  type TranscricaoRegistro,
  validarPedidoTranscricao,
} from "./contract.ts";

class FakeRepositorio implements RepositorioTranscricao {
  contexto: ContextoMensagemAudio = {
    mensagemId: "10000000-0000-4000-8000-000000000001",
    pesquisaId: "20000000-0000-4000-8000-000000000001",
    caixaId: 3,
    providerMessageId: "provider-audio-1",
    tipo: "audio",
    audioStoragePath: null,
  };
  ultima: TranscricaoRegistro | null = {
    id: "30000000-0000-4000-8000-000000000001",
    versao: 1,
    status: "pendente",
    texto: null,
  };
  criadas: number[] = [];
  concluidas: Array<{ id: string; texto: string }> = [];
  falhas: Array<{ id: string; codigo: string }> = [];
  paths: string[] = [];
  substantividades: Array<{ mensagemId: string; valor: string }> = [];
  claimed = true;

  carregarMensagem(): Promise<ContextoMensagemAudio | null> {
    return Promise.resolve(this.contexto);
  }
  buscarUltima(): Promise<TranscricaoRegistro | null> {
    return Promise.resolve(this.ultima);
  }
  criarPendente(
    _mensagemId: string,
    versao: number,
  ): Promise<TranscricaoRegistro> {
    this.criadas.push(versao);
    this.ultima = {
      id: `30000000-0000-4000-8000-${String(versao).padStart(12, "0")}`,
      versao,
      status: "pendente",
      texto: null,
    };
    return Promise.resolve(this.ultima);
  }
  claimPendente(): Promise<boolean> {
    return Promise.resolve(this.claimed);
  }
  concluir(id: string, texto: string): Promise<void> {
    this.concluidas.push({ id, texto });
    return Promise.resolve();
  }
  falhar(id: string, codigo: string): Promise<void> {
    this.falhas.push({ id, codigo });
    return Promise.resolve();
  }
  atualizarStoragePath(_mensagemId: string, path: string): Promise<void> {
    this.paths.push(path);
    return Promise.resolve();
  }
  atualizarSubstantividade(mensagemId: string, valor: string): Promise<void> {
    this.substantividades.push({ mensagemId, valor });
    return Promise.resolve();
  }
}

function processador(
  overrides: Partial<ProcessadorMidia> = {},
): ProcessadorMidia {
  return {
    obterDoProvedor: () =>
      Promise.resolve({
        texto: "A professora atrasava bastante.",
        arquivo: new Uint8Array([1, 2, 3]),
        contentType: "audio/mpeg",
      }),
    salvarPrivado: () =>
      Promise.resolve(
        "pesquisa-evasao/20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001.mp3",
      ),
    ...overrides,
  };
}

Deno.test("somente service role autentica o worker", () => {
  assertEquals(
    autenticarServiceRole("Bearer service-secret", "service-secret"),
    true,
  );
  assertEquals(autenticarServiceRole("Bearer anon", "service-secret"), false);
  assertEquals(autenticarServiceRole(null, "service-secret"), false);
});

Deno.test("pedido aceita somente mensagem_id UUID", () => {
  assertEquals(
    validarPedidoTranscricao({
      mensagem_id: "10000000-0000-4000-8000-000000000001",
    }),
    "10000000-0000-4000-8000-000000000001",
  );
  assertThrows(
    () =>
      validarPedidoTranscricao({
        mensagem_id: "10000000-0000-4000-8000-000000000001",
        url: "https://privado",
      }),
    Error,
    "pedido_invalido",
  );
});

Deno.test("processa pendente, salva mídia privada e conclui a mesma versão", async () => {
  const repo = new FakeRepositorio();
  const resultado = await processarTranscricao(
    repo.contexto.mensagemId,
    repo,
    processador(),
  );

  assertEquals(resultado, { status: "concluida", versao: 1 });
  assertEquals(repo.paths.length, 1);
  assertEquals(repo.concluidas, [{
    id: repo.ultima!.id,
    texto: "A professora atrasava bastante.",
  }]);
  assertEquals(repo.substantividades, [{
    mensagemId: repo.contexto.mensagemId,
    valor: "conteudo_substantivo",
  }]);
  assertEquals(repo.falhas, []);
});

Deno.test("classifica a substantividade do áudio a partir da transcrição", async () => {
  const repo = new FakeRepositorio();
  await processarTranscricao(
    repo.contexto.mensagemId,
    repo,
    processador({
      obterDoProvedor: () =>
        Promise.resolve({
          texto: "Oi, deixa eu te contar uma coisa",
          arquivo: new Uint8Array([1, 2, 3]),
          contentType: "audio/mpeg",
        }),
    }),
  );

  assertEquals(repo.substantividades, [{
    mensagemId: repo.contexto.mensagemId,
    valor: "abertura",
  }]);
});

Deno.test("versão concluída torna reexecução idempotente", async () => {
  const repo = new FakeRepositorio();
  repo.ultima = { ...repo.ultima!, status: "concluida", texto: "Pronto" };
  let chamadas = 0;
  const resultado = await processarTranscricao(
    repo.contexto.mensagemId,
    repo,
    processador({
      obterDoProvedor: () => {
        chamadas += 1;
        return Promise.reject(new Error("não deveria chamar"));
      },
    }),
  );

  assertEquals(resultado, { status: "concluida", versao: 1, cached: true });
  assertEquals(chamadas, 0);
});

Deno.test("falha anterior abre nova versão pendente antes de reprocessar", async () => {
  const repo = new FakeRepositorio();
  repo.ultima = { ...repo.ultima!, status: "falhou" };

  const resultado = await processarTranscricao(
    repo.contexto.mensagemId,
    repo,
    processador(),
  );

  assertEquals(resultado, { status: "concluida", versao: 2 });
  assertEquals(repo.criadas, [2]);
});

Deno.test("transcrição vazia falha com código fechado e não conclui", async () => {
  const repo = new FakeRepositorio();
  const resultado = await processarTranscricao(
    repo.contexto.mensagemId,
    repo,
    processador({
      obterDoProvedor: () =>
        Promise.resolve({
          texto: "   ",
          arquivo: new Uint8Array([1]),
          contentType: "audio/mpeg",
        }),
    }),
  );

  assertEquals(resultado, {
    status: "falhou",
    versao: 1,
    codigo: "transcricao_vazia",
  });
  assertEquals(repo.concluidas, []);
  assertEquals(repo.falhas[0].codigo, "transcricao_vazia");
});

Deno.test("erro externo vira código sanitizado sem persistir mensagem", async () => {
  const repo = new FakeRepositorio();
  const resultado = await processarTranscricao(
    repo.contexto.mensagemId,
    repo,
    processador({
      obterDoProvedor: () =>
        Promise.reject(
          new ErroTranscricao("provedor_indisponivel", "token e URL privados"),
        ),
    }),
  );

  assertEquals(resultado, {
    status: "falhou",
    versao: 1,
    codigo: "provedor_indisponivel",
  });
  assertEquals(repo.falhas[0].codigo, "provedor_indisponivel");
});
