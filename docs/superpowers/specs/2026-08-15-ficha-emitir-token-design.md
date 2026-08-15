# Spec: gerar link da Ficha no painel Time

## Objetivo

Permitir que uma pessoa autorizada do painel Time gere, dentro da ficha de um
colaborador existente, o link da Ficha Técnica sem criar uma nova pessoa.
Professores existentes devem receber um token com `cargo_contexto =
'PROFESSOR'`; o fluxo de criação de pessoa continua separado.

## Escopo aprovado

- Nova Edge Function `ficha-emitir-token` autenticada por JWT.
- Consulta de estado separada da emissão:
  - `GET ?colaborador_id=<id>` consulta sem criar token.
  - `POST` com `{ colaborador_id }` emite ou reaproveita token.
- Autorização server-side:
  - usuário ativo com `perfil = 'admin'` pode atuar em qualquer unidade;
  - usuário ativo com `perfil = 'unidade'` só pode atuar quando
    `usuarios.unidade_id = colaboradores.unidade_id`.
- Cargo derivado exclusivamente de `colaboradores.departamento`:
  - `Professores` -> `PROFESSOR`;
  - `Atendimento` -> `ATENDIMENTO`;
  - qualquer outro departamento é rejeitado sem fallback.
- RPC protegida por `SECURITY DEFINER`, `search_path = public`, ACL somente
  para `service_role`, com lock transacional por colaborador e índice único
  parcial para tokens ativos.
- Idempotência:
  - token ativo sem resposta é devolvido novamente;
  - token ativo usado devolve o mesmo link com `ja_respondeu = true`;
  - resposta já existente sem token ativo não cria outro token;
  - ausência de token e de resposta cria exatamente um token.
- UI da `FichaColaborador` com estados sem token, token pendente e ficha
  respondida.
- Copiar link usando o helper de clipboard existente.
- WhatsApp abre somente `wa.me` com telefone normalizado e mensagem definida;
  não envia mensagem automaticamente.
- `Professores` habilitado no modal “Adicionar pessoa”; `Administrativo`
  permanece bloqueado.
- O atalho na listagem fica fora desta versão para evitar botão aninhado no
  card e consultas de token por todos os cards.

## Contrato da Edge Function

Resposta de sucesso:

```json
{
  "token": "...",
  "link": "https://la-performance-report.vercel.app/ficha-tecnica/?t=...",
  "ja_existia": false,
  "ja_respondeu": false,
  "gerado_em": "2026-08-15T00:00:00.000Z"
}
```

Quando já houve resposta e não há token ativo, `token` e `link` podem ser
`null`, `ja_respondeu` é `true` e `gerado_em` é `null`. O token cru existe
somente no retorno interno da Edge para montagem do link; o frontend descarta
esse campo e nunca o renderiza, grava em log ou inclui em mensagem de erro.

Erros esperados: `400` para entrada inválida, `401` para sessão ausente ou
inválida, `403` para unidade não autorizada, `404` para colaborador inexistente,
`409` para departamento sem banco de cenários e `405` para método não aceito.
As mensagens são seguras e não contêm token ou link.

## Contrato de persistência

A RPC recebe o colaborador e o usuário autorizador. Dentro da mesma transação:

1. adquire `pg_advisory_xact_lock` por `colaborador_id`;
2. lê a pessoa e deriva o cargo pelo departamento armazenado;
3. procura token ativo e eventual resposta;
4. insere token somente quando permitido;
5. retorna token, estado e `criado_em`.

O índice único parcial `ficha_tokens(colaborador_id) WHERE ativo` é uma segunda
barreira contra concorrência. Antes da migração, a implantação deve confirmar
que não existem duplicidades ativas.

## Fluxo da interface

Ao abrir uma ficha pendente, a tela chama apenas o `GET` e mostra:

- sem token: botão `Gerar link da Ficha`;
- token sem resposta: link, `Copiar link`, `Abrir WhatsApp` e data de geração;
- resposta registrada: nenhuma ação de geração.

O POST atualiza o estado local e pode ser repetido; o segundo clique deve
mostrar exatamente o mesmo link. O botão WhatsApp fica desabilitado quando não
há telefone válido. A mensagem usa o primeiro nome e:

> Oi, {primeiro nome}! Tudo bem? Queria te pedir pra preencher a Ficha Técnica
> da LA. São uns 20 minutos e não tem resposta certa nem errada — é pra gente
> te conhecer melhor e trabalhar melhor com você. Segue o link: {link}

Telefone: remover tudo que não for dígito e prefixar `55` apenas quando o DDI
não estiver presente.

## Testes e gate de publicação

O desenvolvimento segue TDD, começando por testes vermelhos para:

- contrato da migração/RPC, lock, índice e ACL;
- autenticação, autorização por unidade e rejeição de departamento;
- separação GET/POST e ausência de insert no GET;
- idempotência e estado de resposta;
- normalização de telefone e mensagem do WhatsApp;
- estados da ficha e mapeamento de `Professores` no modal.

Depois dos testes locais e build, a migração e a Edge Function serão publicadas.
O E2E usará Pedro Sérgio como caso sem token e Ana Beatriz como caso já
existente. A validação final exige segundo clique com o mesmo link e abertura
da ficha pública mostrando os cenários de professor. O departamento não será
liberado além do escopo aprovado antes dessa prova.
