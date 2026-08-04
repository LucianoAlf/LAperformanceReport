# Runbook — Pesquisa de evasão, Subprojeto C

Data do desenho: 04/08/2026

Ambiente alvo: produção

Project ref obrigatório: `ouqwbbermlzqqvtqwlul`

## Estado deste runbook

Este documento prepara o rollout, mas **não autoriza nenhum gate**. Cada gate
exige autorização explícita do Alf, com ele presente. Não aplicar migrations,
publicar Edge Function, publicar frontend nem classificar caso real durante a
preparação local.

O Subprojeto C preserva três camadas independentes:

1. motivo informado no atendimento;
2. resposta original e suas rodadas multipartes;
3. classificação analítica revisada por uma pessoa.

As colunas `pesquisa_evasao.categoria_resposta` e `sentimento` são legado. Não
há backfill nem promoção automática dessas colunas para o modelo novo.

## Regra de migrations

Migration versionada entra exclusivamente por `supabase db push`, nunca por
`apply_migration` do MCP. Antes de cada escrita:

```powershell
supabase link --project-ref ouqwbbermlzqqvtqwlul
supabase db push --linked --dry-run
```

O dry-run deve listar **somente** as migrations esperadas para o gate. Se
aparecer migration já aplicada sob outro timestamp, arquivo estranho ou
qualquer DDL fora deste runbook, parar. Não usar `migration repair` durante o
rollout.

Como `db push` aplica todas as migrations locais pendentes, cada gate deve ser
executado a partir de um checkout limpo no commit de corte indicado, sem as
migrations dos gates seguintes. Conferir o hash do commit e o conteúdo do
dry-run antes de escrever.

### Evidência do pré-flight de 04/08/2026

O primeiro ensaio do Gate A foi interrompido antes de qualquer escrita. Um
checkout descartável, fora do repositório de trabalho, foi criado no commit de
corte `2298b9bd`. O diretório ativo de migrations desse checkout foi substituído
por 1.268 arquivos obtidos por `supabase migration fetch`, e somente os arquivos
`20260804220000_pesquisa_evasao_subprojeto_c_schema.sql` e
`20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql` foram acrescentados.

O `db push --dry-run` não chegou a listar migrations aplicáveis: tanto o CLI
2.40.7 quanto o 2.111.0 recusaram a comparação porque as versões remotas curtas
`20260626` e `20260627` não são reconhecidas como pares locais, embora o próprio
`migration fetch` tenha criado arquivos com esses prefixos. Não foram usados
`migration repair`, `--include-all` nem `apply_migration` do MCP. O checkout
temporário foi destruído após a prova, e produção permaneceu sem as tabelas,
funções ou alterações de ACL do Subprojeto C.

O bloqueio foi resolvido em 04/08/2026 por normalização transacional das duas
versões curtas para `20260626000000` e `20260627000000`, preservando nomes e
hashes. `000000` é uma normalização determinística de versão que continha
apenas a data, não um horário histórico de execução. Não houve reaplicação de
DDL, `migration repair` ou uso de MCP para migrations.

### Evidência de aplicação do Gate A — 04/08/2026

O checkout descartável `D:\2026\.codex-gate-c-a-correcao-20260804`, montado a
partir de `supabase migration fetch`, foi usado somente para os `db push`.
Cada dry-run listou apenas a migration do respectivo passo. Foram aplicadas:

1. `20260804220000_pesquisa_evasao_subprojeto_c_schema.sql`;
2. `20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql`;
3. `20260804231000_pesquisa_evasao_subprojeto_c_gate_a_correcao.sql`;
4. `20260804232000_pesquisa_evasao_subprojeto_c_gate_a_correcao_tipos.sql`.

As duas corretivas foram necessárias porque a RPC analítica declarava retornos
`text` para três fontes `varchar`: `unidades.nome`, `motivos_saida.categoria`
e `pesquisa_evasao.resposta_tipo`. A prova em PostgreSQL real executou a RPC
com JWT autenticado e retornou `1` caso em `aguardando_classificacao` (rótulo
da tela: **A classificar**) sem escrita de classificação.

O varrimento de toda a árvore de `pesquisa_evasao`, `whatsapp_caixas`, tabelas
da Lia, `webhook_debug_log` e tabelas novas do C retornou zero grants de
`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ou `TRIGGER` para `anon` e
`authenticated`. O cron da Lia permaneceu ativo e com última execução bem
sucedida. Gate B continua exigindo autorização separada.

## Pré-flight e baseline

### 1. Segurança operacional

- confirmar project ref `ouqwbbermlzqqvtqwlul`;
- confirmar backup/PITR disponível ou produzir rollback direcionado;
- confirmar que Fabi e Jéssica não estão no meio de um envio ou revisão;
- confirmar que `webhook-whatsapp-inbox` continua recebendo multipartes;
- confirmar que o cron da Lia está único e sem erro;
- confirmar que nenhum lembrete automático à família está habilitado.

### 2. Fotografar o estado atual

Executar somente leitura e guardar o resultado com horário BRT:

```sql
select
  count(*) filter (where modo_teste = false) as pesquisas_produtivas,
  count(*) filter (
    where modo_teste = false
      and resposta_status in ('pronta_para_revisao', 'em_revisao', 'revisada')
  ) as produtivas_com_resposta,
  count(*) filter (where modo_teste = true) as pesquisas_teste,
  count(*) filter (where categoria_resposta is not null) as legado_categoria,
  count(*) filter (where sentimento is not null) as legado_sentimento
from public.pesquisa_evasao;

select resposta_status, count(*)
from public.pesquisa_evasao
where modo_teste = false
group by resposta_status
order by resposta_status;

select cron.jobid, cron.jobname, cron.schedule, cron.active
from cron.job
where cron.jobname ilike '%lia%'
order by cron.jobid;
```

O rollout pressupõe que `categoria_resposta` e `sentimento` continuem vazias.
Se houver qualquer valor, parar: é preciso decidir como preservar esse dado sem
promovê-lo silenciosamente a classificação oficial.

### 3. Rollback direcionado

Antes do Gate A, salvar em arquivo local versionado fora do Git:

- `pg_get_functiondef` de toda função substituída;
- ACL atual de `aluno_acoes`, `pesquisa_evasao` e funções tocadas;
- policies atuais de `aluno_acoes` com `pg_get_expr` de `USING` e
  `WITH CHECK`;
- comentários atuais de `categoria_resposta` e `sentimento`;
- definição e grants de `classificar_resposta_evasao(uuid, text)`;
- contagem e IDs das classificações, ações e desfechos novos, se existirem.

Registrar caminho e SHA-256 do artefato. O rollback é por camada, nunca por
restauração ampla de um backup antigo.

## Gate A — schema, RLS e RPCs

Autorização separada obrigatória.

Aplicar, por `db push`, somente:

1. `20260804220000_pesquisa_evasao_subprojeto_c_schema.sql`;
2. `20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql`;
3. `20260804231000_pesquisa_evasao_subprojeto_c_gate_a_correcao.sql`;
4. `20260804232000_pesquisa_evasao_subprojeto_c_gate_a_correcao_tipos.sql`.

Verificar:

- tabelas de classificação, categorias e desfechos presentes;
- colunas governadas em `aluno_acoes` presentes;
- escrita direta de `aluno_acoes` fechada para `authenticated`;
- nenhum `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ou `TRIGGER` para papel de
  cliente nas superfícies auditadas;
- leitura interna preservada;
- RPCs com execução apenas para os papéis previstos;
- zero classificação, ação ou desfecho criado pela migration;
- Fase A e Fase B da Lia continuam funcionando;
- recepção multipartes continua sem alteração.

Parar e reportar antes do Gate B.

## Gate B — smoke de contratos sem classificar caso real

Usar uma pesquisa `modo_teste=true` para provar rejeição. Ela não pode receber
classificação oficial.

Em uma pesquisa produtiva com análise revisada, executar apenas os read models
e confirmar o estado `aguardando_classificacao`/“A classificar”. Não chamar a
RPC de gravação ainda.

Critérios:

- modo teste rejeitado;
- pesquisa não revisada rejeitada;
- usuário anônimo e agente sem acesso rejeitados;
- leitura não altera `categoria_resposta` nem `sentimento`;
- nenhuma linha nova nas tabelas analíticas.

Parar e reportar antes do Gate C.

## Gate C — Edge compatível e D+1

Primeiro publicar `enviar-pesquisa-evasao` com `verify_jwt=true`, ainda sob a
definição anterior de `pode_enviar_pesquisa_evasao`. A Edge nova é compatível
com esse contrato e a publicação anterior à migration evita uma janela em que
o frontend permitiria uma prévia que o servidor ainda não validasse.

Depois aplicar somente:

- `20260804233000_pesquisa_evasao_subprojeto_c_d1.sql`.

Verificar:

- `listar_evadidos_para_pesquisa_v2` continua existindo;
- `listar_evadidos_para_pesquisa_v3` retorna `elegivel_a_partir_em`;
- saída antes de D+1 aparece como `aguardando_d1`;
- saída em/apos D+1 pode gerar prévia manual;
- prévia produtiva criada antes do cutover também repete o gate ao confirmar;
- modo teste continua gerando e confirmando prévia;
- não existe cron, `pg_net` ou disparo automático de pesquisa;
- opt-out continua bloqueando reenvio;
- destinatário, caixa e operador continuam resolvidos no servidor.

As 15 pesquisas produtivas que, no baseline de 04/08, já haviam sido enviadas
entre 25,6 e 32,7 dias após a saída permanecem válidas e intocadas. D+1 só
governa novas tentativas; não há atualização retroativa de linhas existentes.

### Evidência de aplicação do D+1 — 04/08/2026

O gate foi aplicado com a Edge `enviar-pesquisa-evasao` na versão 48, com
`verify_jwt=true`, antes da migration. O checkout descartável
`D:\\2026\\.codex-gate-c-d1-20260804`, montado somente a partir de
`supabase migration fetch`, teve dry-run contendo exclusivamente
`20260804233000_pesquisa_evasao_subprojeto_c_d1.sql`. A migration foi aplicada
por `supabase db push`; a versão registrada em produção é exatamente
`20260804233000`.

Postflight: as 15 pesquisas produtivas já enviadas permaneceram com os mesmos
`evasao_id`; todas as 15 saídas de julho continuam elegíveis pelo gate
server-side. Seis saídas válidas lançadas em 04/08 aparecem como
`aguardando_d1`, com liberação em 05/08 às 10:00 BRT. Não houve cron, update
retroativo de `pesquisa_evasao` ou disparo automático de pesquisa. O checkout
temporário foi removido após a verificação.

Parar e reportar antes do Gate D.

## Gate D — frontend

Publicar o frontend apenas depois dos contratos de banco e da Edge estarem
ativos. Inspecionar sem salvar classificação real:

- fila mostra `Aguardando D+1` e o horário em BRT;
- resposta revisada mostra classificação multirrótulo;
- relação com o motivo anterior é obrigatória;
- ações e desfecho estão visíveis;
- histórico textual permanece separado da classificação;
- aba Respostas usa somente o read model novo;
- nenhum valor legado aparece como classificação oficial.

Parar e reportar antes do Gate E.

## Gate E — caso controlado autorizado

Somente com um registro produtivo escolhido e autorizado pelo Alf:

1. registrar classificação multirrótulo;
2. verificar operador, auth UID, versão da análise e horário;
3. registrar uma ação coerente;
4. concluir/cancelar a ação com auditoria;
5. registrar um desfecho;
6. confirmar que a camada anterior permaneceu imutável.

Se uma rodada nova chegar depois, a classificação anterior deve permanecer no
histórico e deixar de ser vigente até nova revisão/classificação.

Parar e reportar antes do Gate F.

## Gate F — desligar escritor legado

Aplicar somente:

- `20260804230000_pesquisa_evasao_subprojeto_c_cutover_legado.sql`.

Antes de aplicar, reconfirmar que `categoria_resposta` e `sentimento` estão
vazias. Depois:

- `authenticated` não executa mais
  `classificar_resposta_evasao(uuid, text)`;
- função e colunas permanecem preservadas para rastreabilidade;
- nenhuma linha de `pesquisa_evasao` foi reescrita;
- classificação nova continua funcionando pelas RPCs versionadas.

## Monitoramento

Por pelo menos 30 minutos após o frontend e novamente no primeiro uso real:

- erros das RPCs de classificação/ação/desfecho;
- regressão no envio ou na recepção multipartes;
- alertas privados da Lia e resumo de follow-up;
- duplicidade de classificação ou ação;
- tentativa de escrita direta em `aluno_acoes`;
- qualquer preenchimento novo das colunas legadas;
- qualquer envio automático de pesquisa ou lembrete à família.

## Critérios de parada

Parar sem improvisar se:

- project ref divergir;
- dry-run trouxer migration inesperada;
- baseline legado deixar de estar vazio;
- Fase A/Fase B da Lia ou o webhook multipartes regressarem;
- pesquisa de teste entrar em analytics produtivo;
- identidade vier do navegador;
- classificação vigente sobreviver indevidamente a uma rodada nova;
- D+1 reescrever ou invalidar pesquisa já enviada;
- aparecer qualquer envio automático à família.

## Recuperação por camada

- Gate A: restaurar policies/grants/funções pelo artefato; conservar dados
  eventualmente criados até decisão explícita, sem `DROP CASCADE`.
- Gate C: restaurar a definição anterior de
  `pode_enviar_pesquisa_evasao`; frontend volta temporariamente à v2.
- Gate D: rollback do deploy do frontend, mantendo contratos aditivos.
- Gate F: restaurar apenas o grant legado se o cutover impedir operação
  autorizada; não apagar tabelas novas.

Toda recuperação exige novo diff, autorização e evidência posterior.
