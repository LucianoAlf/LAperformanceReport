# Runbook — Lia, acompanhamento ativo da pesquisa de evasão — Fase A

## Estado e limite de autoridade

- Produção: `ouqwbbermlzqqvtqwlul`.
- Pacote preparado localmente; nenhuma migration deste bloco foi aplicada.
- Worker e units estão apenas versionados; nada foi instalado ou ativado na VPS.
- `alertas_producao_liberados` nasce `false` e não existe migration de ativação.
- Nenhum alerta foi enviado. O primeiro envio exige o piloto no número governado
  do Alf e autorização separada, com ele presente.
- Esta fase não altera frontend. O alerta abre `/app/sucesso-aluno`; deep link
  para a pesquisa exata é melhoria posterior.

## Contrato entregue pelo pacote local

- Um evento por `pesquisa + rodada + ambiente` para resposta substantiva ou
  rodada nova pós-revisão; opt-out tem chave independente na mesma rodada.
- O destinatário é somente `executado_por_usuario_id` da pesquisa original.
- Não existe fanout para Fabi/Jessica nem fallback para telefone operacional.
- Operador ausente/inativo ou destino ausente/alterado vai para fila
  administrativa sanitizada.
- Produção fica em `aguardando_liberacao`; piloto de teste pode entrar como
  `pendente` sem alterar a configuração produtiva.
- O claim é atômico, usa `FOR UPDATE SKIP LOCKED`, revalida usuário/destino e
  só funciona entre 08:00 e 20:00 BRT.
- Timeout ou confirmação ambígua não volta para pendente. Processamento
  abandonado há mais de 15 minutos vai para fila administrativa.
- Logs do worker contêm somente IDs, tipo, ambiente, status e duração.
- Snapshots de destino e texto em estados terminais são expurgados após 30 dias.

## Artefatos

- Migration estrutural:
  `supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql`.
  Estado local verificado: 26.504 bytes; SHA-256
  `4948b98e0e83ca87ca08cd2c8e0185c37dfac723a9bc5836a8a497409dc5916a`.
- Fixture executável:
  `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql`.
- Testes estáticos/SQL: `tests/liaAlertasPrivadosFaseA.test.mjs`.
- Worker: `scripts/process_lia_alert_queue.py`.
- Units, ainda desativadas:
  `scripts/systemd/lia-alertas-privados.service` e
  `scripts/systemd/lia-alertas-privados.timer`.

## Gate 0 — preflight somente leitura

Antes de qualquer escrita remota, reconfirmar e registrar:

1. project ref exatamente `ouqwbbermlzqqvtqwlul`;
2. usuários 2, 29 e 30 ativos;
3. telefones iguais aos seeds governados:
   - 2: `5521981278047`;
   - 29: `5521984695110`;
   - 30: `5521994696489`;
4. alias estável `https://la-performance-report.vercel.app`;
5. inexistência das quatro tabelas `lia_*` e das RPCs deste pacote;
6. worker/timer ausentes ou desativados na VPS;
7. ausência de outro rollout concorrente sobre pesquisa de evasão, Hermes ou a
   mesma migration.

Qualquer divergência para e volta ao Alf. O preflight não autoriza escrita.

## Gate 1 — DDL estrutural, ainda bloqueado

Somente após autorização explícita:

1. conferir tamanho e SHA-256 da migration;
2. aplicar apenas `20260803090000_lia_alertas_privados_fase_a.sql`;
3. provar RLS e ACL: `anon`, `authenticated` e agentes não leem destinos/outbox;
4. provar os três seeds exatos e com origem/data;
5. provar `alertas_producao_liberados=false`;
6. provar que nenhum alerta está `pendente` em ambiente `producao`;
7. confirmar o cron diário de expurgo, sem ativar transporte.

Não criar nem aplicar migration de ativação neste gate.

## Gate 2 — VPS sem timer, ainda bloqueado

Somente após nova autorização:

1. instalar o worker e as units;
2. manter `lia-alertas-privados.timer` desabilitado;
3. carregar somente `LA_REPORT_SUPABASE_URL` e
   `LA_REPORT_SERVICE_ROLE_KEY` no processo; o helper aceita apenas bridge
   loopback governado;
4. validar health local do endpoint single-message;
5. executar uma chamada sem pendência e confirmar zero envio.

## Gate 3 — piloto Alf, ponto de parada obrigatório

Com o Alf presente e após autorização específica:

1. escolher uma pesquisa `modo_teste=true`;
2. chamar `enfileirar_lia_alerta_piloto`;
3. confirmar `ambiente=teste`, destinatário `usuarios.id=2` e destino governado
   terminado em `8047`;
4. executar somente
   `python scripts/process_lia_alert_queue.py --once --alerta-id <uuid>`;
5. confirmar exatamente uma mensagem no número do Alf;
6. conferir `provider_message_id`, template, versão e horário;
7. confirmar zero entrega para os IDs 29 e 30;
8. parar e aguardar aceite explícito.

## Gate 4 — ativação humana, artefato ainda inexistente

Somente depois do aceite do piloto:

1. criar uma migration nova e pequena que altere
   `alertas_producao_liberados` para `true` e reavalie as entregas em
   `aguardando_liberacao`;
2. revisar diff, hash e contagens;
3. pedir autorização separada para aplicar;
4. somente depois habilitar o timer.

A migration de ativação não deve ser antecipada nem existir antes do piloto.

## Gate 5 — primeiro evento produtivo assistido

- Destinatário precisa ser exatamente o operador original.
- Mensagem contém somente aluno, unidade, natureza do evento e link geral.
- Resposta, áudio, transcrição, telefone e motivo não podem aparecer.
- Nenhum outro operador ou grupo pode receber.
- Resultado ambíguo ou divergência de destino aciona parada, sem correção
  improvisada nem reenvio.

## Fila administrativa

`listar_lia_alertas_pendencias_administrativas` retorna somente IDs, aluno,
unidade, operador, tipo, motivo e horário. Não retorna destino, mensagem nem
conteúdo da família. Casos de operador inativo/ausente, destino ausente/alterado,
processamento abandonado, falha e resultado ambíguo exigem decisão humana.

## Rollback direcionado

Antes do DDL, capturar a lista atual de triggers de
`pesquisa_evasao_mensagens` e o job de expurgo homônimo, se houver. Em rollback:

1. desabilitar o timer na VPS antes de alterar banco;
2. exportar metadados de eventos/entregas já produzidos;
3. remover o cron `lia-alertas-privados-expurgo-diario` pelo `jobid`;
4. executar, na ordem:

```sql
drop trigger if exists trg_lia_evento_pesquisa_evasao
  on public.pesquisa_evasao_mensagens;

drop function if exists public.fn_lia_evento_pesquisa_evasao();
drop function if exists public.enfileirar_lia_alerta_piloto(uuid, text);
drop function if exists public.claim_lia_alerta_privado(uuid, uuid);
drop function if exists public.fn_lia_claim_alerta_privado_em(uuid, uuid, timestamptz);
drop function if exists public.fn_lia_janela_envio_permitida(timestamptz);
drop function if exists public.concluir_lia_alerta_privado(uuid, uuid, text);
drop function if exists public.falhar_lia_alerta_privado(uuid, uuid, text, boolean);
drop function if exists public.listar_lia_alertas_pendencias_administrativas(integer);
drop function if exists public.expurgar_lia_alertas_privados();
drop function if exists public.fn_lia_criar_evento_alerta(
  text, text, uuid, integer, integer, text, uuid, text, timestamptz, text
);
drop function if exists public.fn_lia_renderizar_alerta_pesquisa(text, text, text);

drop table if exists public.lia_alertas_privados;
drop table if exists public.lia_pesquisa_eventos;
drop table if exists public.lia_alertas_configuracao;
drop table if exists public.lia_destinos_privados;
```

Não apagar evidência de entrega antes de exportá-la. Falha da notificação nunca
justifica alterar a pesquisa canônica.

## Evidência local concluída

- Ciclo red/green da fundação, produtor, claim e worker executado.
- PostgreSQL 17 isolado prova RLS/ACL, seeds, bloqueio produtivo, idempotência,
  ausência de notificação cruzada, claim exclusivo, janela BRT, falha fechada,
  resultado ambíguo terminal e piloto exclusivo do Alf.
- Testes Python provam uma chamada ao bridge, ausência de retry, logs
  sanitizados e ausência de fallback para variáveis legadas.
- Nenhum deploy, instalação, migration produtiva ou envio foi realizado.

## Ensaio descartável — pendente

A Task 8 exige projeto Supabase descartável com schema-only de produção,
roles/extensões equivalentes, migration repair, zero dados/caixas/segredos,
aplicação apenas da migration estrutural, evidência e destruição do projeto.
Esse ensaio não autoriza Gate 1 e precisa registrar project ref e confirmação de
destruição aqui.

## Melhorias posteriores, fora da Fase A

1. Deep link autenticado que abre a subaba Evasão e expande a pesquisa exata.
2. Interface da revisão sem duplicar simultaneamente timeline e consolidação;
   considerar consolidação recolhida ou texto corrido para copiar.
