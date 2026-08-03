# Runbook — Lia, acompanhamento ativo da pesquisa de evasão — Fase A

## Estado e limite de autoridade

- Produção: `ouqwbbermlzqqvtqwlul`.
- Migration estrutural aplicada em produção em 03/08/2026, registrada remotamente
  como `20260803124754_lia_alertas_privados_fase_a`; produção continua bloqueada.
- A auditoria de transporte confirmou que a caixa 3 já entrega notificações
  privadas para Fabi e Jéssica. A Fase A usará o mesmo caminho direto
  Edge → UAZAPI; worker, units e rota nova no bridge foram rejeitados.
- `alertas_producao_liberados` nasce `false` e não existe migration de ativação.
- Em 03/08/2026, Jéssica fez dois envios produtivos, às 10:52 e 10:55 BRT,
  ambos `multipartes_v2` e inicialmente `sem_resposta`. Durante a implementação,
  o primeiro recebeu conteúdo e passou a `coletando`: o trigger criou um evento
  `resposta_nova` e uma entrega para o operador 29 em
  `aguardando_liberacao`, sem `provider_message_id`. O segundo permaneceu
  `sem_resposta`.
- Nenhum alerta da Fase A foi enviado. O primeiro exige o piloto no número
  governado do Alf e autorização separada, com ele presente.
- Esta fase não altera frontend. O alerta abre `/app/sucesso-aluno`; deep link
  para a pesquisa exata é melhoria posterior.

## Contrato entregue pelo pacote local

- Um evento por `pesquisa + rodada + ambiente` para resposta substantiva ou
  rodada nova pós-revisão; opt-out tem chave independente na mesma rodada.
- O destinatário é somente `executado_por_usuario_id` da pesquisa original.
- Não existe fanout para Fabi/Jéssica nem fallback para telefone operacional.
- Operador ausente/inativo ou destino ausente/alterado vai para fila
  administrativa sanitizada.
- Produção fica em `aguardando_liberacao`; piloto de teste pode entrar como
  `pendente` sem alterar a configuração produtiva.
- O claim é atômico, usa `FOR UPDATE SKIP LOCKED`, revalida usuário/destino e
  só funciona entre 08:00 e 20:00 BRT.
- Timeout ou confirmação ambígua não volta para pendente. Processamento
  abandonado há mais de 15 minutos vai para fila administrativa.
- Logs do dispatcher contêm somente IDs, tipo, ambiente, status e duração.
- Snapshots de destino e texto em estados terminais são expurgados após 30 dias.

## Artefatos

- Migration estrutural:
  `supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql`.
  Estado local verificado: 26.504 bytes; SHA-256
  `4948b98e0e83ca87ca08cd2c8e0185c37dfac723a9bc5836a8a497409dc5916a`.
- Fixture executável:
  `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql`.
- Testes estáticos/SQL: `tests/liaAlertasPrivadosFaseA.test.mjs`.
- Migration complementar implementada localmente, ainda não aplicada:
  `supabase/migrations/20260803210000_lia_alertas_dispatcher_edge.sql`.
- Dispatcher implementado e testado localmente, ainda não publicado:
  `supabase/functions/processar-alertas-lia/`.
- Contrato do dispatcher implementado e verde:
  `tests/liaAlertasDispatcherEdge.test.mjs`.
- `scripts/process_lia_alert_queue.py`, units systemd e rota `/send-alert`
  foram removidos do pacote. Não os reinstalar neste rollout.

## Janela temporária até a ativação

- Respostas produtivas continuam entrando normalmente pelo
  `webhook-whatsapp-inbox`; a Fase A não altera nem publica essa função.
- Até a ativação, respostas reais não geram alerta privado. Fabi e Jéssica
  precisam abrir a tela do Sucesso do Aluno para acompanhar os casos.
- As entregas produzidas nesse intervalo ficam em `aguardando_liberacao`. A
  migration de ativação só poderá promovê-las a `pendente` depois de revalidar
  usuário ativo, destino governado e vínculo com o operador original.
- A ausência temporária do alerta é conhecida e não autoriza envio manual pela
  Sol, pelo Fábio, pelo bridge da Lia ou por outro canal.

## Gate 0 — preflight somente leitura

Antes de qualquer escrita remota, reconfirmar e registrar:

1. project ref exatamente `ouqwbbermlzqqvtqwlul`;
2. usuários 2, 29 e 30 ativos;
3. telefones iguais aos seeds governados:
   - 2: `5521981278047`;
   - 29: `5521984695110`;
   - 30: `5521994696489`;
4. alias estável `https://la-performance-report.vercel.app`;
5. as quatro tabelas `lia_*` e as RPCs da fundação presentes;
6. `alertas_producao_liberados=false`, nenhuma entrega produtiva em `pendente`,
   `processando` ou `enviada`, e nenhum cron chamado
   `lia-alertas-privados-dispatcher-minuto`; entregas em
   `aguardando_liberacao` são esperadas se alguma família já tiver respondido;
7. caixa 3 ativa, nome `Lia - Sucesso do Aluno`, origem
   `+55 21 2342-5316`, webhook com `caixa_id=3` e fingerprint do token igual ao
   da instância auditada, ainda rotulada `Sol - Sucesso do Aluno` na UAZAPI;
8. Maria Financeiro, Fábio Pedagógico e Tom LA Organizer continuam como
   instâncias separadas, e a caixa 2 Sol continua em WAHA com outro número;
9. ausência de outro rollout concorrente sobre pesquisa de evasão, caixa 3 ou a
   mesma migration.
10. as pesquisas produtivas enviadas às 10:52 e 10:55 BRT continuam
    `multipartes_v2`; o evento já criado está retido e não enviado.

Qualquer divergência para e volta ao Alf. O preflight não autoriza escrita.

## Gate 1 — fundação concluída; adaptação DDL ainda pendente

Fundação já confirmada em 03/08/2026: seeds 2/29/30 exatos, RLS/ACL fechadas,
configuração produtiva `false`, zero evento e zero entrega.

Após nova autorização, aplicar somente
`20260803210000_lia_alertas_dispatcher_edge.sql` e provar:

1. `lia_alertas_privados.caixa_id` existe, é `NOT NULL`, referencia
   `whatsapp_caixas(id)` e tem default 3;
2. nenhuma linha existente foi criada, removida ou enviada;
3. `falhar_lia_alerta_privado` aceita somente códigos `provider_*` definidos no
   plano e rejeita códigos `bridge_*`;
4. `alertas_producao_liberados` continua `false`;
5. não existe cron de consumo e a migration de ativação continua inexistente.

### Dívida de reconciliação do histórico remoto

O conteúdo do arquivo local
`20260803090000_lia_alertas_privados_fase_a.sql` foi registrado pelo canal de
migration remoto como versão `20260803124754`. O mesmo tipo de divergência já
ocorreu com os arquivos `20260730170000` e `20260730173000`. Um `db push` futuro
pode interpretar os arquivos locais como pendentes e tentar reaplicá-los.

Não reconciliar durante o piloto. Agendar uma janela própria para comparar
conteúdo e hashes, confirmar os registros equivalentes e reparar o histórico de
forma explícita, sem reaplicar DDL nem forjar uma versão sem evidência.

## Gate 2 — dispatcher Edge, ainda sem cron

Somente após o Gate 1 validado e nova autorização:

1. publicar `processar-alertas-lia` com `verify_jwt=true`;
2. confirmar que chamadas anônima, com JWT inválido e com JWT comum são
   rejeitadas;
3. confirmar que somente `service_role` consegue invocar o dispatcher;
4. com a outbox vazia, invocar uma vez e receber `sem_pendencia`, sem contato
   com o provedor;
5. provar por teste e revisão de log que cada chamada reclama no máximo uma
   entrega e faz no máximo um `POST /send/text`;
6. exigir resposta HTTP aceita e `message_id` não vazio para concluir;
7. tratar timeout, corpo inválido e confirmação ambígua como estado terminal,
   sem retry automático;
8. confirmar que a Edge busca exclusivamente `whatsapp_caixas.id=3`, não aceita
   caixa, destino, texto ou política de retry no payload e não possui fallback;
9. confirmar que logs não contêm número, conteúdo, token ou URL com segredo;
10. manter ausentes o segredo de invocação no Vault, o cron de consumo e a
    migration de ativação.

O dispatcher não usa `127.0.0.1:3001`, não instala processo na VPS e não toca
nos bridges da Lia, Sol ou Fábio. Ele reaproveita o contrato produtivo já
comprovado: Edge backend-only → credencial da caixa 3 → UAZAPI `/send/text`.

## Gate 3 — piloto Alf, ponto de parada obrigatório

Com o Alf presente e após autorização específica:

1. escolher uma pesquisa `modo_teste=true`;
2. chamar `enfileirar_lia_alerta_piloto`;
3. confirmar `ambiente=teste`, destinatário `usuarios.id=2` e destino governado
   terminado em `8047`;
4. invocar `processar-alertas-lia` uma única vez com somente
   `{ "alerta_id": "<uuid>" }` e credencial `service_role`;
5. confirmar exatamente uma mensagem no número do Alf;
6. conferir `caixa_id=3`, `provider_message_id`, template, versão e horário;
7. confirmar zero entrega para os IDs 29 e 30;
8. parar e aguardar aceite explícito.

## Execução assistida dos Gates 1 e 2 em 03/08/2026

O Gate 1 foi aplicado em `ouqwbbermlzqqvtqwlul` e registrado remotamente como
`20260803151525_lia_alertas_dispatcher_edge`:

- `lia_alertas_privados.caixa_id` ficou `integer NOT NULL DEFAULT 3`, com FK;
- a entrega de Miguel Santos Borges continuou em `aguardando_liberacao`, caixa
  3, destinada somente à operadora 29 e sem `provider_message_id`;
- `alertas_producao_liberados=false`, zero cron e zero entrega produtiva
  liberada ou enviada;
- o contrato de falha contém somente códigos `provider_*`.

A Edge `processar-alertas-lia` versão 1 foi publicada com `verify_jwt=true` e
sem cron. Os bloqueios externos funcionaram: chamada anônima e JWT malformado
receberam 401; JWT legado válido de papel não privilegiado recebeu 403. O teste
backend revelou um bloqueio antes do piloto: o JWT legado atual de
`service_role` atravessa o gateway, mas recebe `service_role_required` no
handler. A auditoria comparou somente fingerprints e claims sanitizados e
confirmou que o digest de `SUPABASE_SERVICE_ROLE_KEY` injetado no runtime não
coincide com o digest da chave legada atual retornada pela API de gestão.

Nenhuma entrega foi reclamada ou enviada. Antes do piloto, corrigir o contrato
para continuar com `verify_jwt=true`, confiar somente no JWT cuja assinatura já
foi validada pelo gateway e exigir também `role=service_role` e o project ref
exato no handler. O mesmo bearer validado deve criar o cliente administrativo,
eliminando a dependência da variável global divergente. Essa correção exige
teste e novo deploy autorizado; não alterar nem rotacionar o segredo global,
pois outras Edge Functions dependem dele.

## Gate 4 — ativação humana e cron, artefato ainda inexistente

Somente depois do aceite do piloto:

1. provisionar manualmente no Vault o segredo
   `lia_alertas_service_role_key`, sem imprimi-lo nem gravá-lo em arquivo ou
   migration;
2. criar `20260803213000_lia_alertas_privados_fase_a_ativacao.sql` para alterar
   `alertas_producao_liberados` para `true`, reavaliar as entregas em
   `aguardando_liberacao` e agendar
   `lia-alertas-privados-dispatcher-minuto`;
3. o job deve chamar `processar-alertas-lia` via `net.http_post`, lendo a chave
   somente de `vault.decrypted_secrets` e sem literal sensível no SQL;
4. revisar diff, hash, conteúdo do job e contagens;
5. pedir autorização separada para aplicar;
6. depois da aplicação, confirmar um único job ativo e a ausência de erros de
   invocação.

A migration de ativação não deve ser antecipada nem existir antes do piloto.
O segredo de invocação também não é necessário antes desse gate.

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

1. remover o cron `lia-alertas-privados-dispatcher-minuto` pelo `jobid` e
   alterar `alertas_producao_liberados` para `false`;
2. exportar metadados de eventos/entregas já produzidos;
3. remover o cron `lia-alertas-privados-expurgo-diario` pelo `jobid`;
4. manter a Edge publicada, mas inerte, enquanto houver evidência a preservar;
5. se o rollback for somente do adaptador Edge, restaurar a assinatura anterior
   de `falhar_lia_alerta_privado` e remover a constraint/coluna `caixa_id`
   apenas depois de provar que nenhuma entrega depende dela;
6. somente se a decisão for desfazer toda a Fase A, executar, na ordem:

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

- Ciclo red/green da fundação, produtor e claim executado.
- PostgreSQL 17 isolado prova RLS/ACL, seeds, bloqueio produtivo, idempotência,
  ausência de notificação cruzada, claim exclusivo, janela BRT, falha fechada,
  resultado ambíguo terminal e piloto exclusivo do Alf.
- A auditoria somente leitura do transporte comprovou 88 notificações para
  Fabi/Jéssica com `whatsapp_message_id`, todas pela caixa 3 e pelo número da
  Lia. Nenhuma depende do bridge da Sol ou da fila do Fábio.
- A adaptação DDL e o dispatcher Edge foram implementados localmente. O núcleo
  cobre envio único, `message_id` obrigatório, falhas terminais e log
  sanitizado; nenhum desses artefatos foi aplicado ou publicado.
- O pacote da Fase A não modifica `webhook-whatsapp-inbox`. Qualquer publicação
  futura desta fase se limita a `processar-alertas-lia`.
- A fundação foi aplicada em produção com o bloqueio ativo; nenhum alerta da
  Fase A, deploy de dispatcher ou ativação foi realizado.
- O primeiro retorno produtivo ocorrido durante esta implementação comprovou a
  janela segura: entrega `58a64f22-ff43-4a8c-a597-c74a4aa0b642` ficou em
  `aguardando_liberacao`, destinada ao operador 29, sem `provider_message_id`.
  `processar-alertas-lia` permanece ausente em produção e não há cron de consumo.
- `usuarios.id=29` foi corrigido de `Jessica` para `Jéssica` em 03/08/2026. Os
  dois envios produtivos anteriores preservaram `assinatura_nome_snapshot` e
  mensagem renderizada com o nome antigo, como exige a imutabilidade histórica.

## Ensaio descartável — concluído em 03/08/2026

O ensaio da Task 8 foi executado no projeto Supabase descartável
`ophoqjodoltvbqwqrzeb` (`lia-fase-a-ddl-20260803-090844`), sem copiar dados,
caixas ou segredos e sem escrever no projeto de produção.

Evidências registradas:

- dump somente do schema `public` de produção: `3.536.759` bytes, SHA-256
  `688a8b7a907acfcfaecfde34bb56754ef4f086a1a4971fe725c5fc125c6ed608`;
- migration ensaiada:
  `20260803090000_lia_alertas_privados_fase_a.sql`, `26.504` bytes, SHA-256
  `4948b98e0e83ca87ca08cd2c8e0185c37dfac723a9bc5836a8a497409dc5916a`;
- roles e extensões estruturais foram criadas antes do restore;
- o schema produtivo foi restaurado sem replay do histórico;
- `1.206` versões remotas de migration foram registradas como baseline exato;
- a migration estrutural foi aplicada isoladamente; nenhuma migration de
  ativação foi criada ou aplicada;
- verificação estrutural: quatro tabelas, três destinos governados ativos,
  zero evento, zero alerta e um job de expurgo;
- `alertas_producao_liberados = false` após a aplicação;
- `anon` e `authenticated` não leem destinos/outbox;
- `service_role` executa o claim e `authenticated` não o executa;
- a fixture PostgreSQL 17 cobre os IDs e telefones exatos de 2/29/30,
  idempotência por pesquisa/rodada/tipo, ausência de notificação cruzada,
  isolamento do modo teste comum e piloto exclusivo do Alf.

Limitação documentada: o checkout não possui arquivos locais para parte das
versões antigas que constam no histórico remoto. Por isso a CLI recusa
`migration repair` para essas versões. Como o schema já havia sido restaurado
integralmente, o ensaio gravou diretamente as `1.206` versões remotas exatas em
`supabase_migrations.schema_migrations`, apenas como baseline e sem replayar ou
inventar migrations. Essa adaptação vale somente para o projeto descartável.

O projeto `ophoqjodoltvbqwqrzeb` foi destruído ao final. Uma consulta posterior
à lista de projetos retornou zero projeto com esse ref ou com o prefixo
`lia-fase-a-ddl-*`.

Este ensaio não autoriza a migration complementar, o deploy da Edge, o piloto
ou a ativação.

## Ensaio da adaptação do dispatcher — concluído em 03/08/2026

A Task 9 foi validada no projeto Supabase descartável
`oksvzkcxjijruonfzfzj` (`lia-fase-a-dispatcher-ddl-20260803-114823`). O projeto
foi destruído ao final; a listagem posterior retornou zero projeto com esse ref
ou com o prefixo `lia-fase-a-dispatcher-ddl-*`.

Evidências:

- dump somente do schema `public` atual de produção: `3.584.428` bytes,
  SHA-256 `8ef0afe0d578b7bee50b14dc802e955b6a92b2c583f121664666081316fc13c2`;
- migration `20260803210000_lia_alertas_dispatcher_edge.sql`: `7.522` bytes,
  SHA-256 `c79244d60bd9c1fa811e9707f73973097acd1b3511163ffe3fffbade9429e51d`;
- o artefato executado no ensaio estava em LF. Depois do rebase, o checkout
  Windows materializa o mesmo SQL em CRLF (`7.792` bytes, SHA-256 bruto
  `cc4d942967eaa3684ec4323c377535ae080707d870aa01aadcb5edc970cd2325`).
  Normalizado para LF, ele volta a `7.522` bytes e ao SHA-256 do ensaio acima;
  `git diff` entre o commit ensaiado e o atual confirma zero mudança semântica.
  No rollout, calcular o hash dos bytes efetivamente transportados e registrar
  também a forma de terminação de linha usada;
- `1.213` versões remotas foram registradas apenas como baseline de versões,
  terminando em `20260803142013`, sem replay do histórico;
- as seis roles estruturais foram criadas sem login;
- extensões reproduzidas nos schemas produtivos: `pg_cron` em `pg_catalog`,
  `pg_net`, `pg_trgm` e `unaccent` em `public`, `pgcrypto`, `uuid-ossp` e
  `pg_stat_statements` em `extensions`, e `supabase_vault` em `vault`;
- nenhuma linha de aluno, pesquisa, conversa ou telefone foi copiada; a única
  caixa criada foi a fixture sintética `id=3`, com URL `.invalid` e credencial
  propositalmente inválida;
- projetos Supabase novos aplicam default privileges diferentes aos objetos
  restaurados. Como o `pg_dump` não serializa a ausência de grants, o laboratório
  revogou explicitamente acesso de `anon`, `authenticated` e agentes às duas
  tabelas `lia_*`, reproduzindo o estado confirmado por leitura em produção;
- a migration aplicou sem colisão e criou `caixa_id NOT NULL DEFAULT 3`, FK para
  `whatsapp_caixas(id)`, retorno do claim com `caixa_id` e contrato de falhas
  `provider_*`; `bridge_timeout` foi rejeitado;
- `service_role` executou o claim vazio; `anon` e `authenticated` não receberam
  acesso ao claim nem às tabelas privadas;
- `alertas_producao_liberados=false` permaneceu intacto; nenhuma entrega,
  mensagem, cron de consumo, migration de ativação ou deploy foi criado.

Três tentativas preparatórias também foram destruídas automaticamente:
`mqocfkxigsbslacqaqnl` parou antes do restore por parsing do usuário do pooler,
`wloxqlslpcfbvclwgkyu` revelou a diferença de default privileges do projeto
novo, e `bcicwucycbiclenioisy` encontrou atraso de propagação do tenant no
pooler. Nenhuma delas tocou produção; os dois achados foram incorporados ao
procedimento que passou no ref final.

Este ensaio autoriza somente avançar ao pedido de autorização da Task 10. Ele
não autoriza aplicar a adaptação em produção, publicar a Edge, enviar o piloto
ou criar a migration de ativação.

## Melhorias posteriores, fora da Fase A

1. Deep link autenticado que abre a subaba Evasão e expande a pesquisa exata.
2. Interface da revisão sem duplicar simultaneamente timeline e consolidação;
   considerar consolidação recolhida ou texto corrido para copiar.
3. Substituir os números hoje escritos diretamente em
   `notificar-primeira-aula-fabi`, `disparar-pesquisa-1a-aula-auto` e
   `enviar-boas-vindas-matricula` por leitura governada de
   `lia_destinos_privados`, depois que a Fase A estiver estável.
4. Renomear na UAZAPI a instância `552123425316` de
   `Sol - Sucesso do Aluno` para Lia e a instância `teste sol` para refletir a
   caixa 1. Alterar somente rótulos, sem trocar sessão, número ou credencial.
5. Rotacionar de forma coordenada o instance token da caixa 3, pois ele foi
   exibido integralmente em um print desta auditoria. Atualizar todos os
   consumidores da credencial na mesma janela e provar o envio da Lia depois da
   rotação; não executar durante este rollout sem autorização própria.
