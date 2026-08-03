# Rollout — prévia editável da pesquisa de evasão

**Data do pacote local:** 03/08/2026  
**Projeto de produção:** `ouqwbbermlzqqvtqwlul`  
**Estado:** Tasks 1 a 7 concluídas localmente; nenhum item deste pacote foi aplicado ou publicado em produção

## 1. Escopo e invariantes

Esta entrega permite editar somente o corpo da mensagem na última prévia. O
servidor continua resolvendo e congelando operador, destinatário, telefone,
caixa, template e modo de teste.

`pesquisa_evasao` permanece o cabeçalho canônico da pesquisa enviada.
`pesquisa_evasao_previews` preserva a prévia e o rastro auditável do texto
original/final; seus snapshots não viram fonte de identidade ou roteamento.

Não publicar nem alterar neste rollout:

- `webhook-whatsapp-inbox` (v85 é o baseline produtivo aprovado);
- `processar-conversa-evasao` ou o motor multipartes;
- `processar-alertas-lia`, sua configuração ou o cron a cada minuto;
- templates V2, respostas, transcrições ou análises existentes.

## 2. Pré-requisito separado — opt-out

O commit `3826c22` contém a proteção de reenvio após opt-out do Subprojeto B e
não faz parte conceitual da edição. Ele deve ser publicado e validado em um gate
próprio antes da Edge editável.

Lacuna conhecida antes desse gate: a Edge `enviar-pesquisa-evasao` v43 não
consulta `resposta_status='recusada_opt_out'`. O webhook já marca a recusa, mas
um novo envio ainda pode ser confirmado. No baseline de 03/08/2026 não havia
opt-out registrado.

Critério do gate:

1. comparar o artefato exato de `3826c22` com a versão ativa;
2. manter `verify_jwt=true`;
3. provar que uma pesquisa recusada bloqueia novo preview/envio;
4. provar que uma pesquisa sem recusa continua no fluxo antigo;
5. parar se qualquer mudança além do opt-out aparecer no diff.

## 3. Preflight obrigatório

1. Reconfirmar o project ref:

```powershell
supabase projects list
```

2. Confirmar o arquivo e guardar seu hash:

```powershell
Get-FileHash -Algorithm SHA256 supabase/migrations/20260803220000_pesquisa_evasao_preview_editavel.sql
```

3. Confirmar `verify_jwt=true` em `supabase/config.toml` e na função publicada.
4. Confirmar exatamente um template V2 ativo por público e preservar V1:

```sql
select publico, versao, ativo, count(*)
from public.pesquisa_evasao_templates
group by publico, versao, ativo
order by publico, versao;
```

5. Fotografar, sem conteúdo privado, as contagens de pesquisas por
`resposta_ingestao_versao` e `resposta_status`.
6. Confirmar que o cron da Lia está saudável, sem pausar ou reconfigurar.
7. Comparar a Edge local com a versão ativa; depois do gate anterior, o diff
deve conter somente a prévia editável.

## 4. Ordem sem janela de quebra

### Gate 0 — publicar somente o opt-out

Publicar e validar `3826c22` conforme a seção 2. Parar e obter aceite.

### Gate 1 — migration aditiva

Aplicar somente:

```text
20260803220000_pesquisa_evasao_preview_editavel.sql
```

A migration adiciona auditoria, mantém a RPC antiga e instala o trigger
`trg_pesquisa_evasao_preview_original_insert`. Esse trigger preenche original e
hash para inserts da Edge antiga, portanto o intervalo migration → Edge não
interrompe a tela publicada.

Conferir depois da aplicação:

```sql
select
  count(*) filter (where mensagem_template_original is null) as sem_original,
  count(*) filter (where payload_hash_original is null) as sem_hash_original
from public.pesquisa_evasao_previews;

select has_function_privilege(
  'service_role',
  'public.claim_pesquisa_evasao_preview_editavel(uuid,uuid,text,text)',
  'execute'
) as service_pode,
has_function_privilege(
  'authenticated',
  'public.claim_pesquisa_evasao_preview_editavel(uuid,uuid,text,text)',
  'execute'
) as usuario_pode;
```

Esperado: `0/0`, `service_pode=true`, `usuario_pode=false`.

### Gate 2 — Edge compatível

Publicar `enviar-pesquisa-evasao` com `verify_jwt=true`. A versão deve conter a
proteção de opt-out já aprovada e acrescentar somente:

- confirmação antiga: `preview_id` sem `mensagem_final`;
- confirmação nova: `preview_id` com `mensagem_final`;
- hash final calculado no servidor;
- provider recebendo somente o texto devolvido pelo claim atômico.

Antes do frontend, gerar e confirmar uma prévia pelo contrato antigo, em modo
teste. A tela ainda publicada deve funcionar sem alteração.

### Gate 3 — frontend

Publicar o editor somente depois dos gates anteriores. Confirmar:

- rótulo explícito `Você pode ajustar o texto antes de enviar.`;
- contador visível de `0` a `2.000` caracteres Unicode;
- vazio ou excesso bloqueia a confirmação no navegador e no servidor;
- editor mostra os marcadores canônicos, enquanto a visualização apresenta
  citação, negrito e itálico sem marcadores crus;
- remover um marcador altera apenas a apresentação resultante, sem o reinserir.

O problema visual dos marcadores crus fica resolvido por esta entrega.

## 5. Smoke no número interno

Não usar família real.

1. Gerar uma prévia e confirmar sem editar.
2. Confirmar que o texto recebido é idêntico ao original.
3. Gerar outra prévia, alterar uma palavra e confirmar.
4. Confirmar que o texto recebido é idêntico ao editor.
5. Repetir a confirmação da mesma prévia com o mesmo texto: nenhuma segunda
   mensagem deve sair.
6. Repetir com texto divergente: deve retornar conflito e não enviar.
7. Confirmar que nenhuma pesquisa, mensagem multipartes ou entrega da Lia fora
   do teste foi alterada.

## 6. Auditoria pós-smoke

Usar somente o UUID da pesquisa de teste:

```sql
select
  id,
  preview_id,
  mensagem_editada,
  mensagem_editada_por_usuario_id,
  mensagem_editada_por_auth_user_id,
  mensagem_editada_em,
  payload_hash_original_snapshot,
  payload_hash_snapshot,
  executado_por_usuario_id,
  executado_por_auth_user_id,
  enviado_em
from public.pesquisa_evasao
where id = :pesquisa_teste_id;

select
  id,
  mensagem_editada,
  editado_por_usuario_id,
  editado_por_auth_user_id,
  editado_em,
  payload_hash_original,
  payload_hash,
  consumido_em
from public.pesquisa_evasao_previews
where id = :preview_teste_id;
```

O texto original/final é dado privado. Não copiá-lo para log, comentário de PR
ou evidência externa. A consulta textual só deve ocorrer na sessão controlada
de verificação.

## 7. Critérios de parada

Parar sem correção improvisada se ocorrer qualquer um:

- project ref diferente de `ouqwbbermlzqqvtqwlul`;
- `verify_jwt` desligado;
- diff do webhook, multipartes ou Lia;
- ausência da proteção de opt-out após seu gate;
- usuário comum com EXECUTE na RPC service-only;
- frontend antigo deixa de confirmar entre migration e Edge;
- provider recebe texto diferente do claim;
- segundo envio no clique duplo;
- alteração de telefone, caixa, destinatário ou operador pelo navegador;
- cron da Lia apresenta erro ou duplicidade durante a janela.

## 8. Recuperação por camada

- **Frontend:** reverter somente o deploy. A Edge nova continua aceitando o
  contrato antigo.
- **Edge editável:** republicar a versão do gate de opt-out. As colunas e a RPC
  aditivas podem permanecer sem uso.
- **Opt-out:** só reverter com autorização explícita; registrar que a lacuna de
  reenvio volta a existir.
- **Migration:** não remover colunas nem auditoria já gravada. Se houver defeito
  na RPC, retirar seu uso pela Edge e corrigir por migration posterior.
- **Webhook/Lia:** não fazem parte do rollback desta entrega.

## 9. Evidência local antes do rollout

- Edge: 75 testes Deno aprovados;
- visualização: 3 testes Deno aprovados;
- suíte focada Node: 30 aprovados e 1 fixture marcada para execução externa;
- fixture PostgreSQL 17 real: marcador
  `PESQUISA_EVASAO_PREVIEW_EDITAVEL_PG17_OK`, transação encerrada em `ROLLBACK`;
- frontend de listagem: 21 testes aprovados;
- build Vite aprovado, com avisos preexistentes de chunks/Recharts.

A suíte ampla executou 1.102 testes: 1.088 passaram e 8 falharam fora do diff
desta entrega. Falhas registradas, sem correção nesta frente:

- `emusysMatriculasStatusV131Frontend.test.mjs` — estoque atual x trancamento;
- `healthScoreProfessorV3ConfigSegmentadaFrontend.test.mjs` — contrato do hook;
- `healthScoreProfessorV3MetricasSegmentadas.test.mjs` — dois casos de
  fechamento/imutabilidade;
- `passagemBastaoBackend.test.mjs` — contexto mínimo do Gate 3;
- `processarMatriculaLifecycleV131.test.mjs` — finalização ambígua;
- `professoresCarteiraSegmentosCanonicos.test.mjs` — hash do artefato vivo;
- `syncMatriculasEmusysStatusV131.test.mjs` — GET sem data real.

O diff da implementação, iniciado após `95da7d7`, não altera esses arquivos ou
seus domínios. Nenhuma falha focada da prévia editável permanece.

## 10. Melhoria futura

Assistente de IA na prévia para sugerir redação, mantendo aprovação humana e o
mesmo rastro de original/final. Não faz parte deste rollout.
