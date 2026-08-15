# Publicacao duravel da ficha do professor

## Contexto

O botão `Gerar link da Ficha` foi implementado no worktree
`feature/ficha-professor-funcao`, mas o domínio de produção voltou a servir um
deploy automático de `main`. Como o branch ainda não estava integrado a
`main`, todos os colaboradores pendentes — inclusive professores válidos de
Campo Grande e Recreio — ficaram sem a ação. Não é uma falha de cadastro nem
de token individual.

Também foi observado um refresh token revogado no navegador. A aplicação deve
limpar a sessão local e voltar ao login, em vez de deixar uma tela protegida
aparentemente utilizável com credenciais inválidas.

## Objetivo

Publicar a funcionalidade de emissão de link dentro do `main`, que é a fonte
do deploy automático de produção, e tornar a recuperação de sessão revogada
determinística.

## Escopo

1. Preservar a emissão idempotente e as regras de cargo já implementadas.
2. Cobrir por teste a identificação de refresh token inválido e a limpeza
   apenas da sessão local.
3. Integrar o branch da ficha sobre o `origin/main` atual, executar a suíte e
   publicar a revisão resultante.
4. Verificar que o HTML/bundle servido pelo alias de produção contém
   `Gerar link da Ficha` e `ficha-emitir-token`.
5. Fazer a validação autenticada final somente após o usuário entrar de novo;
   não usar credenciais nem gerar token para outro colaborador como atalho.

## Fora de escopo

- Criar ou alterar colaboradores.
- Emitir tokens adicionais para diagnosticar a publicação.
- Mudar o JWT da função de emissão.
- Alterar a configuração de deploy do projeto sem necessidade comprovada.

## Testes e verificação

1. Teste unitário inicialmente em falha para o reconhecimento do erro de
   refresh revogado e a chamada de `signOut({ scope: 'local' })`.
2. Teste contratual que garante que `AuthContext` usa a recuperação no caminho
   de erro de `getSession`.
3. `npm test` e `npm run build` no worktree final.
4. Inspeção do deploy de produção e busca dos dois identificadores no bundle
   servido pelo alias.
5. Após novo login, abrir uma ficha pendente de professor e confirmar o botão
   sem emitir/reenviar outro token durante a checagem.
