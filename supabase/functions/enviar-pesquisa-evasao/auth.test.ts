// deno-lint-ignore-file no-import-prefix require-await
/// <reference lib="deno.ns" />

import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  autenticarUsuarioAtivoUnico,
  type AuthAdapters,
  primeiroNomeDoUsuario,
  resolverAssinaturaAtivaParaNovaPreview,
  resolverContextoOperador,
} from "./auth.ts";

function criarAdapters(
  overrides: Partial<AuthAdapters> = {},
): AuthAdapters {
  return {
    authGetUser: async (token) =>
      token === "token-fabi" ? { id: "auth-fabi" } : null,
    buscarUsuariosAtivosPorAuthUserId: async (authUserId) =>
      authUserId === "auth-fabi"
        ? [{ id: 30, authUserId, nome: "Fabi Oliveira" }]
        : [],
    buscarAssinaturasAtivas: async () => [],
    ...overrides,
  };
}

async function assertErroHttp(
  executar: () => Promise<unknown>,
  status: number,
  mensagem: RegExp,
): Promise<void> {
  try {
    await executar();
    throw new Error("esperava falha");
  } catch (error) {
    if (!(error instanceof Error) || error.message === "esperava falha") {
      throw error;
    }
    assertEquals((error as { status?: number }).status, status);
    assertMatch(error.message, mensagem);
  }
}

Deno.test("authorization ausente ou malformada retorna 401", async () => {
  for (const authorization of [null, "", "token-fabi", "Basic token-fabi"]) {
    await assertErroHttp(
      () =>
        autenticarUsuarioAtivoUnico(
          { authorization },
          criarAdapters(),
        ),
      401,
      /token/i,
    );
  }
});

Deno.test("JWT invalido e erro do provedor de auth retornam 401", async () => {
  await assertErroHttp(
    () =>
      autenticarUsuarioAtivoUnico(
        { authorization: "Bearer token-invalido" },
        criarAdapters(),
      ),
    401,
    /token invalido/i,
  );

  await assertErroHttp(
    () =>
      autenticarUsuarioAtivoUnico(
        { authorization: "Bearer token-fabi" },
        criarAdapters({
          authGetUser: async () => {
            throw new Error("JWT expired");
          },
        }),
      ),
    401,
    /token invalido/i,
  );
});

Deno.test("usuario interno ausente, inativo ou ambiguo retorna 403", async () => {
  await assertErroHttp(
    () =>
      autenticarUsuarioAtivoUnico(
        { authorization: "Bearer token-fabi" },
        criarAdapters({ buscarUsuariosAtivosPorAuthUserId: async () => [] }),
      ),
    403,
    /usuario ativo nao encontrado/i,
  );

  await assertErroHttp(
    () =>
      autenticarUsuarioAtivoUnico(
        { authorization: "Bearer token-fabi" },
        criarAdapters({
          buscarUsuariosAtivosPorAuthUserId: async () => [
            { id: 30, authUserId: "auth-fabi", nome: "Fabi" },
            { id: 31, authUserId: "auth-fabi", nome: "Duplicada" },
          ],
        }),
      ),
    403,
    /forma unica/i,
  );
});

Deno.test("identidade vem do JWT e do cadastro interno ativo", async () => {
  const identidade = await autenticarUsuarioAtivoUnico(
    { authorization: "Bearer token-fabi" },
    criarAdapters(),
  );

  assertEquals(identidade.usuarioId, 30);
  assertEquals(identidade.authUserId, "auth-fabi");
  assertEquals(identidade.nomeUsuario, "Fabi Oliveira");
});

Deno.test("primeiro nome normaliza espacos e rejeita nome vazio", async () => {
  assertEquals(primeiroNomeDoUsuario("  Jéssica   Souza "), "Jéssica");
  await assertErroHttp(
    async () => primeiroNomeDoUsuario("   "),
    403,
    /sem nome valido/i,
  );
});

Deno.test("sem override a assinatura usa primeiro nome do usuario", async () => {
  const contexto = await resolverContextoOperador(
    { authorization: "Bearer token-fabi" },
    criarAdapters(),
  );

  assertEquals(contexto.assinaturaId, null);
  assertEquals(contexto.assinaturaNome, "Fabi");
});

Deno.test("override ativo substitui somente o nome de exibicao", async () => {
  const contexto = await resolverContextoOperador(
    { authorization: "Bearer token-fabi" },
    criarAdapters({
      buscarAssinaturasAtivas: async () => [{
        id: "6a77c6d4-6090-43ad-bfe9-da4bf5f468a8",
        nome: "Fabíola Sucesso",
      }],
    }),
  );

  assertEquals(
    contexto.assinaturaId,
    "6a77c6d4-6090-43ad-bfe9-da4bf5f468a8",
  );
  assertEquals(contexto.assinaturaNome, "Fabíola Sucesso");
  assertEquals(contexto.usuarioId, 30);
  assertEquals(contexto.authUserId, "auth-fabi");
});

Deno.test("mais de um override ativo falha fechado", async () => {
  const identidade = await autenticarUsuarioAtivoUnico(
    { authorization: "Bearer token-fabi" },
    criarAdapters(),
  );

  await assertErroHttp(
    () =>
      resolverAssinaturaAtivaParaNovaPreview(
        identidade,
        {
          buscarAssinaturasAtivas: async () => [
            { id: "assinatura-1", nome: "Fabi" },
            { id: "assinatura-2", nome: "Outra" },
          ],
        },
      ),
    403,
    /forma unica/i,
  );
});

Deno.test("nao existe chamada de permissao ou unidade para resolver operador", async () => {
  const chamadas: string[] = [];
  const contexto = await resolverContextoOperador(
    { authorization: "Bearer token-fabi" },
    criarAdapters({
      authGetUser: async () => {
        chamadas.push("jwt");
        return { id: "auth-fabi" };
      },
      buscarUsuariosAtivosPorAuthUserId: async () => {
        chamadas.push("usuario");
        return [{ id: 30, authUserId: "auth-fabi", nome: "Fabi Oliveira" }];
      },
      buscarAssinaturasAtivas: async () => {
        chamadas.push("override-opcional");
        return [];
      },
    }),
  );

  assertEquals(chamadas, ["jwt", "usuario", "override-opcional"]);
  assertEquals(contexto.assinaturaNome, "Fabi");
});
