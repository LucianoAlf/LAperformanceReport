// deno-lint-ignore-file no-import-prefix require-await
/// <reference lib="deno.ns" />

import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { type AuthAdapters, resolverContextoOperador } from "./auth.ts";

const unidadeBarra = "368d47f5-2d88-4475-bc14-ba084a9a348e";

function criarAdapters(
  overrides: Partial<AuthAdapters> = {},
): AuthAdapters {
  return {
    authGetUser: async (token) =>
      token === "token-fabi" ? { id: "auth-fabi" } : null,
    buscarUsuariosAtivosPorAuthUserId: async (authUserId) =>
      authUserId === "auth-fabi" ? [{ id: 30, authUserId, nome: "Fabi" }] : [],
    usuarioTemPermissaoEstrita: async () => true,
    buscarAssinaturasAtivas: async (usuarioId) =>
      usuarioId === 30 ? [{ id: "assinatura-fabi", nome: "Fabi" }] : [],
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
    throw new Error("Era esperado um erro HTTP");
  } catch (error) {
    if (
      error instanceof Error && error.message === "Era esperado um erro HTTP"
    ) {
      throw error;
    }

    const erro = error as { status?: number; message?: string };
    assertEquals(erro.status, status);
    assertMatch(String(erro.message), mensagem);
  }
}

Deno.test("token ausente retorna 401 sem consultar identidade interna", async () => {
  let consultouAuth = false;
  const adapters = criarAdapters({
    authGetUser: async () => {
      consultouAuth = true;
      return null;
    },
  });

  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: null,
          unidadeId: unidadeBarra,
          modoTeste: false,
        },
        adapters,
      ),
    401,
    /token ausente/i,
  );
  assertEquals(consultouAuth, false);
});

Deno.test("token invalido retorna 401", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-invalido",
          unidadeId: unidadeBarra,
          modoTeste: false,
        },
        criarAdapters(),
      ),
    401,
    /token invalido/i,
  );
});

Deno.test("token invalido e rejeitado antes de autorizar a unidade", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-invalido",
          unidadeId: "",
          modoTeste: false,
        },
        criarAdapters(),
      ),
    401,
    /token invalido/i,
  );
});

Deno.test("erro de auth.getUser e tratado como token invalido", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-expirado",
          unidadeId: unidadeBarra,
          modoTeste: false,
        },
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

Deno.test("usuario interno inativo ou ausente retorna 403", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-fabi",
          unidadeId: unidadeBarra,
          modoTeste: false,
        },
        criarAdapters({
          buscarUsuariosAtivosPorAuthUserId: async () => [],
        }),
      ),
    403,
    /usuario ativo nao encontrado/i,
  );
});

Deno.test("identidade interna ambigua retorna 403", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-fabi",
          unidadeId: unidadeBarra,
          modoTeste: false,
        },
        criarAdapters({
          buscarUsuariosAtivosPorAuthUserId: async (authUserId) => [
            { id: 30, authUserId, nome: "Fabi" },
            { id: 130, authUserId, nome: "Duplicada" },
          ],
        }),
      ),
    403,
    /usuario ativo nao encontrado de forma unica/i,
  );
});

Deno.test("assinatura ativa ausente ou inativa retorna 403", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-fabi",
          unidadeId: unidadeBarra,
          modoTeste: false,
        },
        criarAdapters({
          buscarAssinaturasAtivas: async () => [],
        }),
      ),
    403,
    /assinatura ativa nao encontrada/i,
  );
});

Deno.test("mais de uma assinatura ativa retorna 403", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-fabi",
          unidadeId: unidadeBarra,
          modoTeste: false,
        },
        criarAdapters({
          buscarAssinaturasAtivas: async () => [
            { id: "assinatura-1", nome: "Fabi" },
            { id: "assinatura-2", nome: "Outra" },
          ],
        }),
      ),
    403,
    /assinatura ativa nao encontrada de forma unica/i,
  );
});

Deno.test("falta de sucesso_aluno.evasao.enviar retorna 403", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-fabi",
          unidadeId: unidadeBarra,
          modoTeste: false,
        },
        criarAdapters({
          usuarioTemPermissaoEstrita: async (_usuarioId, codigo) =>
            codigo !== "sucesso_aluno.evasao.enviar",
        }),
      ),
    403,
    /permissao sucesso_aluno\.evasao\.enviar/i,
  );
});

Deno.test("modo teste sem permissao dedicada retorna 403", async () => {
  await assertErroHttp(
    () =>
      resolverContextoOperador(
        {
          authorization: "Bearer token-fabi",
          unidadeId: unidadeBarra,
          modoTeste: true,
        },
        criarAdapters({
          usuarioTemPermissaoEstrita: async (_usuarioId, codigo) =>
            codigo !== "sucesso_aluno.evasao.modo_teste",
        }),
      ),
    403,
    /permissao sucesso_aluno\.evasao\.modo_teste/i,
  );
});

Deno.test("permissoes usam usuario interno, codigo exato e unidade concreta", async () => {
  const chamadas: Array<[number, string, string]> = [];

  await resolverContextoOperador(
    {
      authorization: "Bearer token-fabi",
      unidadeId: unidadeBarra,
      modoTeste: true,
    },
    criarAdapters({
      usuarioTemPermissaoEstrita: async (usuarioId, codigo, unidadeId) => {
        chamadas.push([usuarioId, codigo, unidadeId]);
        return true;
      },
    }),
  );

  assertEquals(chamadas, [
    [30, "sucesso_aluno.evasao.enviar", unidadeBarra],
    [30, "sucesso_aluno.evasao.modo_teste", unidadeBarra],
  ]);
});

Deno.test("identidade e assinatura derivam de auth.getUser e usuario interno", async () => {
  const chamadas: string[] = [];
  const adapters = criarAdapters({
    authGetUser: async (token) => {
      chamadas.push(`auth:${token}`);
      return { id: "auth-fabi" };
    },
    buscarUsuariosAtivosPorAuthUserId: async (authUserId) => {
      chamadas.push(`usuario:${authUserId}`);
      return [{ id: 30, authUserId, nome: "Fabi" }];
    },
    buscarAssinaturasAtivas: async (usuarioId) => {
      chamadas.push(`assinatura:${usuarioId}`);
      return [{ id: "assinatura-fabi", nome: "Fabi" }];
    },
  });

  const contexto = await resolverContextoOperador(
    {
      authorization: "Bearer token-fabi",
      unidadeId: unidadeBarra,
      modoTeste: false,
    },
    adapters,
  );

  assertEquals(contexto, {
    usuarioId: 30,
    authUserId: "auth-fabi",
    nomeUsuario: "Fabi",
    assinaturaId: "assinatura-fabi",
    assinaturaNome: "Fabi",
  });
  assertEquals(chamadas, [
    "auth:token-fabi",
    "usuario:auth-fabi",
    "assinatura:30",
  ]);
});

Deno.test("Fabi e Jessica recebem cada uma sua propria assinatura", async () => {
  const identidades = {
    "token-fabi": {
      authUserId: "auth-fabi",
      usuarioId: 30,
      email: "fabi@gmail.com",
      nome: "Fabi",
      assinaturaId: "assinatura-fabi",
      assinaturaNome: "Fabi",
    },
    "token-jessica": {
      authUserId: "auth-jessica",
      usuarioId: 29,
      email: "jessyca@lamusic.com.br",
      nome: "Jessica",
      assinaturaId: "assinatura-jessica",
      assinaturaNome: "Jessica",
    },
  } as const;
  const adapters = criarAdapters({
    authGetUser: async (token) => {
      const identidade = identidades[token as keyof typeof identidades];
      return identidade ? { id: identidade.authUserId } : null;
    },
    buscarUsuariosAtivosPorAuthUserId: async (authUserId) => {
      const identidade = Object.values(identidades).find(
        (item) => item.authUserId === authUserId,
      );
      return identidade
        ? [{
          id: identidade.usuarioId,
          authUserId,
          nome: identidade.nome,
        }]
        : [];
    },
    buscarAssinaturasAtivas: async (usuarioId) => {
      const identidade = Object.values(identidades).find(
        (item) => item.usuarioId === usuarioId,
      );
      return identidade
        ? [{
          id: identidade.assinaturaId,
          nome: identidade.assinaturaNome,
        }]
        : [];
    },
  });

  const fabi = await resolverContextoOperador(
    {
      authorization: "Bearer token-fabi",
      unidadeId: unidadeBarra,
      modoTeste: false,
    },
    adapters,
  );
  const jessica = await resolverContextoOperador(
    {
      authorization: "Bearer token-jessica",
      unidadeId: unidadeBarra,
      modoTeste: false,
    },
    adapters,
  );

  assertEquals(
    [
      fabi.usuarioId,
      identidades["token-fabi"].email,
      fabi.assinaturaNome,
    ],
    [30, "fabi@gmail.com", "Fabi"],
  );
  assertEquals(
    [
      jessica.usuarioId,
      identidades["token-jessica"].email,
      jessica.assinaturaNome,
    ],
    [29, "jessyca@lamusic.com.br", "Jessica"],
  );
});

Deno.test("campos forjados no request nao trocam a identidade autenticada", async () => {
  const inputForjado = {
    authorization: "Bearer token-fabi",
    unidadeId: unidadeBarra,
    modoTeste: false,
    usuarioId: 29,
    authUserId: "auth-jessica",
    assinaturaId: "assinatura-jessica",
    assinaturaNome: "Jessica",
  };

  const contexto = await resolverContextoOperador(
    inputForjado,
    criarAdapters(),
  );

  assertEquals(contexto, {
    usuarioId: 30,
    authUserId: "auth-fabi",
    nomeUsuario: "Fabi",
    assinaturaId: "assinatura-fabi",
    assinaturaNome: "Fabi",
  });
});
