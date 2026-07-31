# Pesquisa de Evasão — Subprojeto A: Fundação Segura Implementation Plan

> **Status em 31/07/2026:** escopo corrigido e aprovado por Alf. Este plano não cria nem depende de RBAC do domínio.

**Objetivo:** impedir disparos externos, resolver a identidade de quem envia pelo login, exigir prévia, separar teste de produção e preservar uma trilha completa de auditoria, permitindo que qualquer usuário interno ativo veja e envie pesquisas em qualquer unidade.

**Arquitetura:** o navegador envia somente a intenção (`previsualizar` ou `confirmar`). A Edge exige JWT, resolve um único `public.usuarios` ativo, carrega movimentação, telefone, template, caixa e assinatura no servidor e persiste o snapshot antes de qualquer envio. A confirmação consome a prévia pertencente ao mesmo `auth.uid()`. O banco mantém leitura interna ampla, escrita operacional via service role e acesso direto revogado para roles de agentes.

**Stack:** React, TypeScript, Supabase Edge Functions, PostgreSQL/RLS, Node test runner e Deno tests.

## 1. Decisões vinculantes

1. Qualquer usuário interno ativo do LA Report pode ver e enviar pesquisas de qualquer unidade.
2. Unidade continua sendo filtro de interface e dado de auditoria, não fronteira de autorização.
3. O endpoint `enviar-pesquisa-evasao` exige `verify_jwt = true` e também valida o JWT dentro da função.
4. O operador nunca vem do request. Ele é resolvido por `auth.getUser(token)` e por uma linha única e ativa em `public.usuarios`.
5. A assinatura padrão é o primeiro nome de `usuarios.nome`.
6. `pesquisa_evasao_assinaturas` é somente override opcional de exibição. Ausência de linha ativa não bloqueia envio.
7. A prévia mostra texto e destinatário exatos e precisa pertencer ao mesmo `auth_user_id` que confirma.
8. Modo teste usa telefone explícito, fica marcado e não entra em estatísticas ou baseline.
9. Telefone produtivo vem apenas do snapshot da movimentação; não há fallback para cadastro atual.
10. Idempotência, claim atômico e trava de interface impedem clique duplo e reenvio ambíguo.
11. O controle operacional é confiança com rastro: usuário, auth UID, assinatura exibida, mensagem, template, caixa, destino, modo e horário ficam registrados.
12. Mila, Sol, Fábio e Lia não recebem acesso direto às tabelas privadas por seus roles de agente.
13. `20260730180100_whatsapp_caixas_credenciais_privadas.sql` permanece integralmente inalterada.
14. Nenhuma migration, função ou frontend será aplicado em produção sem revisão do diff e autorização explícita de Alf com o project ref `ouqwbbermlzqqvtqwlul` reconfirmado.

## 2. Fora do escopo

- catálogo de permissões do domínio;
- perfil dedicado de sucesso do aluno;
- vínculos nominais de Fabi ou Jessica;
- autorização por unidade;
- usuário dedicado para testar isolamento de unidade;
- classificação, ações e analytics do Subprojeto C;
- conversa inbound multipartes, opt-out e expurgo do debug log do Subprojeto B;
- hardening de `movimentacoes_admin`, que continua como projeto independente e não bloqueia a homologação deste plano.

## 3. Contrato de segurança

### Ameaça original

Sem JWT, qualquer pessoa que descubra a URL da Edge consegue pedir um disparo de WhatsApp em nome da LA Music. Esse é o achado crítico e o motivo do Subprojeto A.

### Invariantes

- chamada sem JWT ou com JWT inválido falha antes de carregar destinatário ou provedor;
- JWT válido sem usuário interno ativo e único falha com `403`;
- request não aceita operador, nome de assinatura, telefone produtivo, caixa, template ou mensagem;
- confirmação só consome prévia do mesmo `auth_user_id`;
- override de assinatura não troca a identidade auditada;
- credenciais UAZAPI/WAHA nunca são retornadas ao navegador;
- roles de agentes continuam sem acesso direto às respostas privadas.

## 4. Task 1 — Fixar o novo contrato em testes

**Arquivos:**

- `tests/pesquisaEvasaoAcessoInternoAuditavel.test.mjs`
- `tests/pesquisaEvasaoFundacaoSegura.test.mjs`
- `tests/pesquisaEvasaoListagemSegura.test.mjs`
- `tests/pesquisaEvasaoEdgeSegura.test.mjs`
- `tests/pesquisaEvasaoRolloutGovernado.test.mjs`
- `supabase/functions/enviar-pesquisa-evasao/auth.test.ts`
- `supabase/functions/enviar-pesquisa-evasao/contract.test.ts`

### Passos

1. Provar que migration, Edge, spec, plano e runbook não contêm os artefatos de autorização granular removidos.
2. Provar `verify_jwt = true`, `auth.getUser(token)` e resolução de usuário interno ativo único.
3. Provar leitura e execução das RPCs por qualquer usuário interno ativo, inclusive com filtro consolidado.
4. Provar que ausência de override usa o primeiro nome do cadastro.
5. Provar que override ativo muda apenas o nome exibido e que múltiplos overrides falham fechados.
6. Provar que roles de agentes continuam revogados.
7. Executar os testes antes da implementação e registrar a falha esperada do contrato antigo.

## 5. Task 2 — Reconciliar banco e RLS sem RBAC

**Arquivos:**

- `supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql`
- `supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql`
- `scripts/verify-pesquisa-evasao-schema.sql`
- `scripts/verify-pesquisa-evasao-rls.sql`

### Passos

1. Remover criação de catálogo, perfil e helpers de autorização granular.
2. Manter RLS ativa e trocar as policies de leitura por `EXISTS` de uma linha única e ativa em `public.usuarios` vinculada a `auth.uid()`.
3. Manter `SELECT` para `authenticated` apenas nas tabelas operacionais que a tela lê.
4. Manter inserts e updates operacionais em service role/RPC; não reabrir escrita direta a pessoas.
5. Manter `REVOKE` explícito de `anon`, Mila, Sol, Fábio e Lia nas tabelas e RPCs privadas.
6. Nas RPCs de listagem e estatística, validar somente service role ou usuário interno ativo. `p_unidade_id` continua filtro opcional.
7. Tornar `pesquisa_evasao_previews.assinatura_id` anulável para suportar fallback sem provisionamento.
8. Preservar o backfill fail-closed dos seis registros legados; banco vazio emite `NOTICE`, banco não vazio exige exatamente os seis testes.
9. Preservar snapshot de telefone, status, idempotência, claim e trilha de auditoria.

### Aceite

- usuário interno ativo lista consolidado e qualquer unidade;
- usuário autenticado sem cadastro interno ativo não lê e não opera;
- `anon` não executa RPCs;
- agents não leem respostas diretamente;
- nenhuma tabela de RBAC é alterada.

## 6. Task 3 — Identidade e assinatura confiáveis na Edge

**Arquivos:**

- `supabase/config.toml`
- `supabase/functions/enviar-pesquisa-evasao/auth.ts`
- `supabase/functions/enviar-pesquisa-evasao/index.ts`
- `supabase/functions/enviar-pesquisa-evasao/contract.ts`

### Passos

1. Manter o gateway com `verify_jwt = true`.
2. Extrair somente bearer token válido e chamar `supabase.auth.getUser(token)`.
3. Resolver exatamente um usuário interno ativo pelo `auth_user_id`.
4. Derivar o primeiro nome de `usuarios.nome`.
5. Consultar zero ou um override ativo em `pesquisa_evasao_assinaturas`.
6. Se não houver override, usar o primeiro nome; se houver mais de um, falhar fechado.
7. Remover qualquer chamada de permissão ou unidade da autenticação do operador.
8. Manter a allowlist de campos do request, impedindo operador ou mensagem forjados.
9. Persistir `usuario_id`, `auth_user_id`, `assinatura_id` anulável e `assinatura_nome_snapshot`.

## 7. Task 4 — Prévia, envio e auditoria

**Arquivos:**

- `supabase/functions/enviar-pesquisa-evasao/index.ts`
- `supabase/functions/enviar-pesquisa-evasao/contract.ts`
- `supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql`
- `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- `src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx`

### Passos

1. `previsualizar` recebe apenas evasão, modo e telefone de teste opcional.
2. O servidor resolve movimentação canônica, snapshot de telefone, público, template, assinatura e caixa.
3. O preview persiste todos os snapshots, hash, ownership, TTL e idempotency key.
4. O modal mostra destinatário mascarado, modo, unidade, aluno, curso, professor, assinatura e mensagem exata.
5. `confirmar` recebe somente `preview_id`, verifica ownership e consome claim atômico.
6. O provedor recebe exatamente o snapshot aprovado.
7. Resultado enviado, falho ou incerto é persistido sem reenvio automático.
8. A UI usa trava síncrona para impedir clique duplo.

## 8. Task 5 — Modo teste e dados legados

1. Os seis IDs confirmados por Alf recebem `modo_teste = true`.
2. Eles aparecem com badge `TESTE` e histórico separado.
3. Não contam em taxa de resposta, causas, baseline, ações ou indicador de professor.
4. Modo teste exige telefone explícito e nunca altera aluno ou movimentação.
5. Produção usa somente `movimentacoes_admin.telefone_snapshot`.
6. O rollout confere explicitamente que os seis registros ficaram marcados.

## 9. Task 6 — Hardening independente de `whatsapp_caixas`

**Arquivo imutável nesta correção de rumo:**

- `supabase/migrations/20260730180100_whatsapp_caixas_credenciais_privadas.sql`

Manter integralmente:

- revogação da leitura direta de credenciais pelo frontend;
- RPCs/read models sem token;
- consumidores migrados no Pré-Atendimento e Caixa de Entrada;
- Edge Functions usando service role;
- teste explícito de que `authenticated` não lê `uazapi_token` nem `waha_api_key`.

Registrar e comparar o hash do arquivo antes e depois desta refatoração.

## 10. Task 7 — Documentação e verificação

**Arquivos:**

- `docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md`
- este plano
- `docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md`

### Verificação mínima

```powershell
node --test tests/pesquisaEvasaoAcessoInternoAuditavel.test.mjs tests/pesquisaEvasaoFundacaoSegura.test.mjs tests/pesquisaEvasaoListagemSegura.test.mjs tests/pesquisaEvasaoEdgeSegura.test.mjs tests/pesquisaEvasaoPreviewFrontend.test.mjs tests/pesquisaEvasaoRolloutGovernado.test.mjs tests/whatsappCaixasCredenciaisPrivadas.test.mjs
deno test supabase/functions/enviar-pesquisa-evasao/*.test.ts
npm run build
git diff --check
```

Também executar o verificador estrutural no ambiente descartável/isolado quando um novo ensaio for autorizado. O verificador operacional com dados reais pertence ao rollout assistido em produção e deve terminar em rollback.

## 11. Ordem obrigatória de rollout

1. Hugo revisa o PR draft.
2. Alf autoriza o rollout e confirma o project ref de produção.
3. Revisar o diff SQL final e o hash da migration de caixas.
4. Aplicar migrations antes do frontend, porque a main publica automaticamente na Vercel.
5. Rodar verificações de schema, ACL, RLS, RPCs e backfill.
6. Fazer smoke em produção somente em modo teste e no número interno de Alf.
7. Só depois liberar o merge/deploy do frontend.
8. Observar logs e auditoria; qualquer divergência aciona o rollback operacional do runbook.

## 12. Definition of Done

- chamadas externas sem JWT não alcançam o fluxo de envio;
- qualquer usuário interno ativo pode ver e enviar em qualquer unidade;
- o nome exibido vem do login, com fallback automático e override opcional;
- o navegador não escolhe operador, texto, caixa ou telefone produtivo;
- prévia e envio usam o mesmo snapshot;
- teste e produção permanecem isolados;
- clique duplo e resultado ambíguo não duplicam disparo;
- cada envio registra pessoa, auth UID, assinatura, mensagem, template, caixa, destino, modo e horário;
- os seis registros legados estão marcados como teste;
- Mila, Sol, Fábio e Lia não leem diretamente as tabelas privadas por seus roles de agente;
- credenciais de WhatsApp não chegam ao navegador;
- nenhum artefato de RBAC granular do domínio existe neste plano;
- PR permanece draft e sem merge até rollout autorizado.
