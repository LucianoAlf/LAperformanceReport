# Plano: botão Gerar link da Ficha

> Executar no worktree `D:\2026\LA-performance-report\.worktrees\ficha-professor-funcao`, branch `feature/ficha-professor-funcao`. Não publicar produção antes do gate final.

## Resultado esperado

Usuário autenticado e autorizado abre uma ficha pendente, consulta o estado
sem criar token, emite um único token para o colaborador existente, copia ou
abre o link no WhatsApp e consegue repetir a operação sem duplicar o token.
Professores usam `PROFESSOR` tanto no modal quanto na ficha interna.

## Tarefa 1 — contrato e testes vermelhos do domínio

Arquivos:

- criar `tests/fichaEmitirTokenContract.test.mjs`;
- criar futuramente `src/lib/fichaLink.ts` e seu teste;
- usar a migração gerada pelo CLI, não inventar timestamp de migration.

Passos:

1. Escrever testes que falhem para o contrato da RPC/migração: lock por
   colaborador, índice único parcial, `SECURITY DEFINER`, `search_path`, ACL
   apenas `service_role`, derivação dos dois departamentos, rejeição de outro
   departamento e retorno dos estados.
2. Escrever testes vermelhos para a separação GET/POST da Edge, exigência de
   Bearer JWT, autorização admin/unidade, ausência de inserção no GET e
   respostas sem token em erro.
3. Escrever testes vermelhos para normalização do telefone, mensagem do
   WhatsApp, montagem do link e descarte do token cru no mapeamento de UI.
4. Rodar cada arquivo diretamente com `node --test` e registrar o vermelho
   antes de implementar.

## Tarefa 2 — migração/RPC idempotente

Arquivos:

- `supabase/migrations/<timestamp>_ficha_emitir_token_existente.sql`;
- `tests/fichaEmitirTokenContract.test.mjs`.

Passos:

1. Gerar o nome da migration com `supabase migration new
   ficha_emitir_token_existente`.
2. Confirmar, antes de criar o índice, que a base remota não possui mais de um
   token ativo por colaborador.
3. Criar o índice único parcial em `ficha_tokens(colaborador_id) WHERE ativo`.
4. Criar RPC restrita a `service_role`, com `SET search_path = public` e
   `pg_advisory_xact_lock(hashtextextended(...))`.
5. Derivar o cargo do `departamento` dentro da RPC; jamais aceitar cargo do
   cliente. Retornar token existente, resposta já concluída ou token recém-
   criado, com `ja_existia`, `ja_respondeu` e `criado_em`.
6. Revogar execução de `public`, `anon` e `authenticated`; conceder somente a
   `service_role`.
7. Rodar os testes contratuais novamente até verde.

## Tarefa 3 — Edge Function autenticada

Arquivos:

- `supabase/functions/ficha-emitir-token/index.ts`;
- `supabase/functions/ficha-emitir-token/deno.json`;
- `supabase/config.toml`;
- `tests/fichaEmitirTokenContract.test.mjs`.

Passos:

1. Criar a função com `verify_jwt = true`, CORS limitado aos métodos GET/POST
   e OPTIONS, e parsing estrito do `colaborador_id`.
2. Validar `auth.getUser()` com o bearer do cliente, buscar usuário ativo em
   `usuarios` por `auth_user_id` e autorizar admin global ou unidade coincidente.
3. Buscar o colaborador no service client, rejeitar inexistente/desligado e
   deixar a RPC derivar o cargo.
4. Implementar GET status-only e POST emissor, ambos sem logar body, token ou
   link. Montar o link somente no retorno de sucesso.
5. Mapear erros conhecidos para status seguros; não vazar erro de banco nem
   credencial.
6. Rodar contrato e checagem local de TypeScript/build da função conforme a
   estrutura existente.

## Tarefa 4 — helper de WhatsApp e hook

Arquivos:

- criar `src/lib/fichaLink.ts`;
- criar `tests/fichaLink.test.mjs`;
- alterar `src/components/App/Time/types.ts`;
- alterar `src/hooks/useFichaColaborador.ts`.

Passos:

1. Reutilizar `normalizarTelefone` existente; adicionar montagem da mensagem,
   URL `wa.me` e formatação segura de data.
2. Adicionar `whatsapp` ao colaborador/ficha e um estado de token que contenha
   somente link, flags e data, nunca o token cru.
3. Consultar a Edge por GET quando a ficha abrir, em paralelo com os dados já
   existentes, sem esconder a ficha caso o status falhe.
4. Expor uma ação POST idempotente para o componente e atualizar o estado local
   sem recarregar a página.

## Tarefa 5 — UI da ficha e modal

Arquivos:

- alterar `src/components/App/Time/FichaColaborador.tsx`;
- alterar `src/components/App/Time/ModalAdicionarPessoa.tsx`;
- eventualmente alterar `src/lib/clipboard.ts` somente se os testes mostrarem
  necessidade.

Passos:

1. Criar o estado vazio com botão `Gerar link da Ficha`.
2. Renderizar link, `Copiar link`, data e `Abrir WhatsApp` desabilitado sem
   telefone válido; abrir nova aba/janela apenas com URL codificada.
3. Mostrar erro seguro da emissão e loading no botão; impedir cliques
   concorrentes no cliente sem confiar nisso como proteção de servidor.
4. Preservar a ficha normal para quem já respondeu e nunca mostrar botão de
   geração nesse estado.
5. Habilitar `Professores -> PROFESSOR` no modal, manter Administrativo em
   breve e eliminar fallback para `ATENDIMENTO` quando o cargo não estiver
   mapeado.
6. Rodar testes da UI/contrato e build.

## Tarefa 6 — revisão e publicação controlada

1. Executar testes novos, suíte existente, build e revisão do diff.
2. Verificar novamente branch, migration local e estado remoto; aplicar a
   migration aprovada somente depois de confirmar a ausência de duplicidades.
3. Publicar `ficha-emitir-token` com JWT obrigatório e confirmar configuração
   remota.
4. Publicar frontend no projeto correto após a Edge/migration estarem prontas.
5. No navegador autenticado, usar Pedro Sérgio para: abrir ficha, confirmar
   que o GET não cria, clicar para gerar, clicar novamente e comparar o mesmo
   link. Usar Ana Beatriz para confirmar reaproveitamento do token existente.
6. Abrir o link público de Pedro e confirmar no DOM que o cenário é de
   professor; verificar console sem erros e estabilidade após reload.
7. Não liberar nenhum fluxo de Administrativo e não criar pessoas novas.

## Critérios de conclusão

- testes vermelhos foram observados antes da implementação e estão verdes;
- `npm test` e `npm run build` passam, além dos testes novos explícitos;
- migration/RPC e Edge estão protegidas contra acesso anônimo e duplicidade;
- UI não expõe token cru, não duplica DDI e não cria colaborador;
- E2E real comprova emissão, idempotência e banco de cenários `PROFESSOR`.
