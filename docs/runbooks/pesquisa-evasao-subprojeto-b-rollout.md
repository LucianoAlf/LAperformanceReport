# Runbook — Pesquisa de evasão, Subprojeto B

## Estado antes da delimitação por rodada

- Produção: `ouqwbbermlzqqvtqwlul`.
- O webhook, o salvamento append-only, a transcrição, o worker de consolidação e o opt-out já estavam publicados.
- O piloto tinha uma única pesquisa `modo_teste` em `multipartes_v2`; as demais pesquisas permaneciam `legado_v1`.
- O teste controlado provou texto + áudio + texto em eventos separados, áudio salvo/transcrito automaticamente e consolidação em ordem.
- Problema encontrado: rodadas de horários diferentes eram reunidas na mesma análise.

## Contrato da rodada

- Menos de 15 minutos desde a última mensagem: mesma rodada.
- A partir de 15 minutos, ou se a rodada anterior já estiver pronta/em revisão/revisada: nova rodada e nova versão de análise.
- A janela de sete dias só valida o roteamento da resposta para a pesquisa; ela não une rodadas.
- Cada mensagem V2 recebe `analise_versao` imutável.
- Cada análise guarda primeira/última mensagem e horários de início, última mensagem e encerramento.
- Uma análise `revisada` não pode ser atualizada nem removida.
- Mensagem posterior a uma rodada pronta/em revisão/revisada cria nova versão, mantém o cabeçalho em `pronta_para_revisao` e liga `conteudo_novo_desde_revisao`, mesmo enquanto a rodada nova ainda está sendo coletada.
- A fila e a timeline mostram todas as rodadas; o selo **Novo conteúdo** destaca a reabertura.
- Pesquisas `legado_v1` não recebem versão de rodada.
- O início da revisão grava operador e horário em campos próprios; a conclusão grava outro operador e horário, sem sobrescrever a autoria do início.

## Correção após o aceite manual

O teste de 02/08/2026 confirmou as Rodadas 2 e 3, a separação dos eventos, a
transcrição automática e a imutabilidade das rodadas anteriores. Também revelou
dois defeitos no primeiro rollout:

1. `iniciar_revisao_pesquisa_evasao` alterava somente o status, sem autoria nem horário;
2. uma mensagem posterior a uma rodada `em_revisao` mudava o cabeçalho para `coletando`, limpava `pronta_para_revisao_em` e ocultava o caso da fila.

A migration `20260802223000_pesquisa_evasao_revisao_auditavel_fila.sql` corrige
os dois contratos. A única revisão antiga sem autor volta para
`pronta_para_revisao`, porque não existe evidência para atribuir autoria
retroativamente. Nenhuma mensagem, transcrição ou consolidação é reescrita.

## Ordem de publicação

1. Aplicar `20260802213000_pesquisa_evasao_rodadas_revisao.sql`.
2. Confirmar colunas, constraints, triggers e RPCs.
3. Publicar `processar-conversa-evasao` com `verify_jwt=false`; a função é protegida pelo token interno `x-sync-token`.
4. Somente depois publicar o frontend com fila/timeline.
5. Não ativar B3a: o default de novas pesquisas continua `legado_v1` até aceite separado.

## Verificação estrutural

- Ensaio local em PostgreSQL 17: `tests/fixtures/pesquisa_evasao_rodadas_pg17.sql`.
- Casos provados: mesma rodada antes de 15 minutos; nova rodada após 15 minutos; nova rodada após revisão; revisão anterior imutável; retorno à fila com conteúdo novo; legado intacto.
- Testes estáticos: `tests/pesquisaEvasaoRodadasSchema.test.mjs` e `tests/pesquisaEvasaoConversaFrontend.test.mjs`.

## Teste manual de aceite

Usar somente a pesquisa de teste individual já marcada como `multipartes_v2` e o número interno autorizado:

1. enviar abertura + áudio + texto;
2. confirmar três eventos na mesma versão e a transcrição automática;
3. aguardar 15 minutos e confirmar `pronta_para_revisao`;
4. revisar a rodada;
5. enviar outra mensagem;
6. confirmar versão seguinte, versão revisada anterior intacta, pesquisa de volta à fila e selo **Novo conteúdo**.

Nenhuma mensagem real para família faz parte deste rollout.

## Rollback direcionado

Se a migration falhar, ela é transacional. Depois de aplicada, não remover colunas enquanto existirem mensagens versionadas. Em regressão operacional:

1. manter o webhook append-only;
2. retirar somente a UI nova;
3. restaurar a versão anterior de `processar-conversa-evasao`;
4. manter os dados de rodada para diagnóstico;
5. não migrar pesquisas `legado_v1` nem alterar o default.

## Evidências da publicação

- Migration `pesquisa_evasao_rodadas_revisao` aplicada em produção em 02/08/2026 pelo arquivo `20260802213000_pesquisa_evasao_rodadas_revisao.sql`.
- Edge Function `processar-conversa-evasao` publicada como versão 6, ativa e com `verify_jwt=false`; a autenticação interna por `x-sync-token` foi preservada.
- Backend publicado no commit `b1458da`; frontend publicado no commit `a1dafb9`, com deploy Vercel concluído.
- Postflight: uma pesquisa piloto em `multipartes_v2`, nove em `legado_v1`, nove de nove mensagens do piloto vinculadas à versão 1 e nenhuma mensagem V2 sem rodada.
- O default de `resposta_ingestao_versao` permanece `legado_v1`; a ativação B3a não fez parte deste rollout.
- Smoke visual em produção: a tela de Evasão carregou, o histórico da pesquisa piloto de Davi Pedro Palmerini abriu e exibiu `Rodada 1`, os nove eventos em ordem, as transcrições dos áudios e a consolidação da rodada.
- Nenhuma mensagem de WhatsApp foi disparada durante a publicação ou o smoke.
