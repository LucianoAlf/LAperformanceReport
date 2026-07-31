# Pesquisa de evasão — runbook do Subprojeto A

Data-base: 2026-07-31

Estado: Plano A, hardening local de `whatsapp_caixas` e ensaio DDL descartável
concluídos; homologação operacional pendente; produção não executada

Projeto de produção confirmado somente para leitura: `ouqwbbermlzqqvtqwlul`

Projeto de homologação confirmado: branch persistente `p01c-staging`, project
ref `nzwqjepncrtufpykjita`, branch id
`d18ef383-db7f-4598-9a0d-62bbb48eb308`, criada em 12/06/2026 com cópia de
dados. Ela estava `ACTIVE_HEALTHY` antes da atualização e ficou
`MIGRATIONS_FAILED` depois das tentativas de rebase descritas abaixo.

## Ambiente de homologação e contenção de WhatsApp

Antes do alinhamento, a última migration da staging era `20260614131323`; a
produção terminava em `20260730161312`. A diferença apurada foi de 555
migrations remotas. A staging precisa ser rebaseada sobre produção antes das
migrations locais do Plano A, e o resultado deve terminar pelo menos em
`20260730161312_pesquisa_evasao_movimentacao_canonica`.

### Bloqueio encontrado no rebase de 31/07/2026

O rebase oficial avançou a staging até `20260630203458` e parou. Duas
tentativas foram encerradas com `MIGRATIONS_FAILED`; nenhuma migration do Plano
A foi aplicada. O diagnóstico transacional, sempre com rollback, encontrou
drift de schema já materializado na branch sem o histórico correspondente:

1. `20260630204217_seguranca_c2_tokens_whatsapp_mila` encontrou sete policies
   já existentes em `whatsapp_caixas` e `mila_config`;
2. depois de simular a reconciliação dessas policies, a migration
   `20260701000701_seguranca_rls_grupo_b_enable_policies` encontrou nove
   policies já existentes, todas idênticas às canônicas de produção;
3. depois de simular também a segunda reconciliação, a sequência falhou em
   `20260702024506_fideliza_renovacoes_trim_movimentacoes_admin`: o patch exige
   a CTE antiga `renovacoes_trim`, mas ela não existe no corpo encontrado na
   staging.

Isso demonstra drift estrutural, não um conflito isolado. Não usar
`migration repair`, não marcar versões como aplicadas e não resetar/recriar a
branch sem autorização explícita e um plano que mantenha o WhatsApp sem saída.
As sete policies removidas durante a primeira investigação foram restauradas
exatamente ao estado pré-rebase; as nove do segundo lote nunca foram removidas
fora da transação de diagnóstico. A verificação final confirmou:

- staging ainda em `20260630203458`;
- sete policies restauradas;
- três tokens UAZAPI e a única chave WAHA preenchida continuam exatamente com
  `HOMOLOG-DESATIVADO-NAO-ENVIA`;
- produção continua em `20260730161312` e não recebeu o marcador de
  homologação.

Até decidir a reconstrução segura do ambiente, não criar o terceiro usuário,
não aplicar as migrations locais e não iniciar smoke test.

### Substituição por ambiente limpo — decisão técnica pendente

Em 31/07/2026 foi autorizada a criação de um ambiente permanente chamado
`homolog-limpo`, sem dados reais e sem credenciais de WhatsApp. A criação ainda
não foi executada porque existe uma incompatibilidade entre o tipo de ambiente
pedido e o método de bootstrap aprovado:

- uma branch Supabase é criada pela reaplicação sequencial das migrations do
  projeto principal; a operação não oferece um estado vazio para depois receber
  apenas um `pg_dump --schema-only`;
- o defeito do `supabase start` local não prova sozinho que essa criação remota
  falhará: no Git, `20260109_fase1_seed_dados.sql` ordena antes de
  `20260109_fase1_tabelas_mestras.sql`, mas o histórico remoto registra a criação
  das tabelas como `20260109125533` e o seed de professores como
  `20260109125543`, na ordem correta;
- portanto, criar a branch exige retirar explicitamente a proibição de replay;
  manter a proibição exige um projeto Supabase vazio separado, que não é uma
  branch e possui contrato operacional e custo diferentes.

Nenhuma branch ou projeto novo foi criado e nenhum custo novo foi iniciado.
Antes de seguir, registrar uma destas autorizações: tentativa controlada de
branch com o replay nativo, ou projeto separado com restauração `schema-only`.

### Decisão superveniente — ensaio DDL em projeto descartável

O ambiente permanente `homolog-limpo` foi cancelado. Foi autorizado um projeto Supabase descartável,
separado e sem dados reais, com a finalidade exclusiva de
provar que as migrations `20260730170000`, `20260730173000` e
`20260730180100` aplicam limpo contra o schema real de produção.

O ensaio deve usar `pg_dump --schema-only` de produção, que permanece somente
leitura. Antes do restore, criar sem login e sem senha os roles estruturais
`fabio_agent`, `lia_acesso_restrito`, `maria_lareport_rpc`,
`mila_acesso_restrito`, `ml_jobs` e `sol_acesso_restrito`, e habilitar as
mesmas extensões nos mesmos schemas: `pg_cron` em `pg_catalog`, `pg_net`,
`pg_trgm` e `unaccent` em `public`, `pgcrypto`, `uuid-ossp` e
`pg_stat_statements` em `extensions`, `supabase_vault` em `vault`, além de
`plpgsql`.

Depois do restore, marcar o histórico como aplicado por `migration repair`,
aplicar somente as três migrations novas, executar
`scripts/verify-pesquisa-evasao-schema.sql` e gerar os tipos em arquivo
temporário para comparar somente as tabelas e RPCs deste domínio. Essa etapa não
regenera nem substitui `src/types/supabase.ts`. O verificador
`scripts/verify-pesquisa-evasao-rls.sql` fica preservado
para a homologação operacional posterior, pois depende de identidades e dados
nominais.

Não copiar dados de aluno, movimentações, caixas de WhatsApp ou Edge Functions;
o projeto deve permanecer sem segredos. O dump deve ser inspecionado e saneado antes do restore. Registrar o
project ref, os resultados e a evidência de destruição; o projeto precisa ser
derrubado ao final mesmo se o ensaio falhar. A `p01c-staging` antiga permanece
intocada.

#### Resultado do ensaio descartável de 31/07/2026

Ensaio concluído com sucesso no projeto `ddl-evasao-2396d7`, project ref
`vnuzjephkwgcyvioiele`, região `sa-east-1`, tamanho `micro`. O projeto foi
apagado ao final e a listagem posterior confirmou zero projetos remanescentes
com nome `ddl-evasao-*`.

Evidências do bootstrap:

- dump `public` somente-schema extraído de `ouqwbbermlzqqvtqwlul`, sem qualquer
  escrita em produção: 3.103.190 bytes, SHA-256
  `72BDDB92E9768FD19AFFC4528BFFE0300D477D69E962B5F986BB05EB5FF99EEB`;
- Gitleaks `8.30.1` examinou o dump original e o saneado e não encontrou segredo;
- três URLs de saída embutidas foram substituídas por
  `https://disabled.invalid/homolog-ddl`; o artefato saneado ficou sem project
  ref de produção, sem URL externa ativa, sem `COPY` e sem `INSERT` fora de
  corpos de função. SHA-256 saneado:
  `35F9A6CB0BFCA019730F86936EE16743272E5B548640A602CE5E9BFC087A75FB`;
- os seis roles estruturais foram criados sem login e sem senha;
- as nove extensões ficaram nos mesmos schemas e versões de produção. Projetos
  novos trazem `pg_net 0.20.4`; o ensaio precisou recriá-la explicitamente como
  `0.19.5` antes do restore para reproduzir produção;
- o restore terminou limpo e as contagens de `alunos`, `usuarios`,
  `movimentacoes_admin`, `pesquisa_evasao` e `whatsapp_caixas` foram
  `0 | 0 | 0 | 0 | 0`;
- 1.132 versões remotas, de `20260106025222` a `20260730161312`, foram marcadas
  como aplicadas por `migration repair`, usando placeholders vazios somente
  para satisfazer o contrato do CLI; nenhuma migration histórica foi executada;
- `20260730170000`, `20260730173000` e `20260730180100` aplicaram limpo;
- o log de `20260730170000` contém o `NOTICE` exato
  `backfill ignorado: pesquisa_evasao vazia`;
- `scripts/verify-pesquisa-evasao-schema.sql` passou dentro de transação com
  `ROLLBACK`;
- os tipos gerados contêm todos os contratos do domínio. O arquivo bruto do
  projeto descartável diferiu por 782 adições e 511 remoções, incluindo drift de
  plataforma (`PostgREST 14.15` e `graphql_public`). A comparação semântica
  confirmou a tabela `whatsapp_caixas_credenciais_auditoria`, as FKs reais e as
  assinaturas RPC geradas. Esse artefato bruto foi usado como evidência do
  ensaio e não foi mantido no repositório.

Houve ciclos preparatórios abortados antes de completar o ensaio por tratamento
de `stderr`, latência do pooler e pré-condições do CLI. Todos executaram cleanup;
a conferência final encontrou zero projetos descartáveis remanescentes. A
`p01c-staging` permaneceu no mesmo estado e não foi usada no ensaio.

### Automação de deploy e bloqueio de merge

Verificação realizada em 31/07/2026 antes da abertura do PR:

- **a `main` tem deploy automático de frontend para produção pela Vercel.** O
  GitHub registra deployments sucessivos do ambiente `Production` criados por
  `vercel[bot]`. O deployment mais recente observado, id `5675574365`, aponta
  para o SHA atual da `main`,
  `4e2584a775b59c5e5a4ee5c6d99233af3d1dd93a`, e terminou com sucesso. O mesmo
  commit possui o status externo `Vercel`. O único workflow versionado em
  `.github/workflows` é o Gitleaks; portanto, a publicação vem da integração
  externa da Vercel, não de GitHub Actions;
- **não existe integração Supabase–GitHub ativa neste projeto.** Em
  `ouqwbbermlzqqvtqwlul`, a tela `Settings > Integrations` exibe a ação
  `Connect GitHub`, isto é, nenhum repositório está conectado. O repositório
  também não possui workflow, webhook visível, secret ou variable de Actions
  para aplicar migrations. Assim, no estado conferido, merge na `main` não
  aplica migrations do Supabase automaticamente em produção nem em outro
  ambiente;
- a existência manual das branches Supabase `main` e `p01c-staging` não muda
  essa conclusão: a `p01c-staging` continua `MIGRATIONS_FAILED` e não está
  vinculada ao fluxo deste PR.

Consequência operacional: **este PR não pode ser mergeado antes do rollout das
migrations em produção**. A ordem obrigatória é: autorização explícita do Alf
com ele presente, aplicação e postflight das migrations, deploy/verificação da
Edge Function e somente depois merge/deploy do frontend. Enquanto isso, o PR
permanece aberto para revisão do Hugo, sem merge. O hardening separado de
`movimentacoes_admin` e a homologação operacional continuam gates abertos.

### Conclusão do Gitleaks no PR 16

O check de `push` (job `91202081133`) passou, enquanto o check de
`pull_request` (job `91202344040`) encontrou quatro ocorrências históricas ao
varrer o intervalo da branch. A hipótese de tokens sintéticos no fixture de
`whatsapp_caixas` não se confirmou: nenhum dos quatro alertas veio desse
arquivo.

Todos os achados usam a regra `generic-api-key` em
`supabase/functions/enviar-pesquisa-evasao/contract.test.ts`, nas linhas
históricas 27, 262 e 500 dos commits `61b7a2a`, `70a8fd8` e `1052d24`. São duas
UUIDs sintéticas usadas como `authUserId` em objetos de teste. Uma consulta
somente leitura em produção confirmou zero correspondências tanto em
`auth.users.id` quanto em `public.usuarios.auth_user_id`.

O arquivo `.gitleaksignore` permite somente os quatro fingerprints exatos,
incluindo commit, caminho, regra e linha. Não existe allowlist genérica para
UUID, `authUserId`, arquivo ou diretório. A reprodução local com Gitleaks
`8.24.3` e o mesmo intervalo/log-options do job terminou com `no leaks found`.

### Inventário da `p01c-staging` antes de eventual remoção

Levantamento somente leitura em 31/07/2026 para o ref
`nzwqjepncrtufpykjita`:

- nenhuma variável do processo local e nenhum arquivo `.env*` do projeto aponta
  para o ref;
- nenhum workflow, variable ou secret visível do repositório GitHub aponta para
  o ref; os quatro environments do GitHub também não possuem variable visível
  com esse valor;
- no banco da staging, não há referência ao próprio ref em configurações de
  agentes, caixas, funções SQL, views, `cron.job` ou Vault;
- as ocorrências versionadas fora deste runbook são dois relatórios históricos
  de 13/06/2026; não são configuração executável;
- a branch continua persistente, com dados copiados e status
  `MIGRATIONS_FAILED`;
- existem 67 Edge Functions ativas na branch, incluindo
  `webhook-whatsapp-inbox`, `enviar-pesquisa-evasao`, `agente-webhook`,
  `mila-processar-mensagem` e `bi-agent-lamusic`;
- a branch possui `GEMINI_API_KEY` com a mesma fingerprint de produção. Nenhum
  valor de secret foi lido ou registrado.

O inventário local não consegue provar se UAZAPI, Vercel, VPS ou outro serviço
externo ainda chama as URLs dessas Edge Functions. Conferir esses quatro pontos
com os respectivos responsáveis antes de excluir a branch. Não apagar, rotacionar
ou desativar a staging antiga sem decisão do Alf.

A branch contém dados reais copiados de produção: a fotografia de 31/07/2026
encontrou 1.355 registros em `movimentacoes_admin`. Portanto, homologação não
pode depender apenas do botão “Modo teste” para impedir destinatário real.

Em 31/07/2026, com autorização do Alf, as três caixas da staging tiveram
`uazapi_token` e, quando existente, `waha_api_key` substituídos por
`HOMOLOG-DESATIVADO-NAO-ENVIA`. A verificação independente confirmou três
caixas neutralizadas e fingerprints diferentes das credenciais de produção.
O host ainda é `lamusic.uazapi.com`, então a neutralização das credenciais é o
controle efetivo de contenção.

Regras obrigatórias:

- não restaurar credenciais de produção na staging;
- não copiar token, API key, secret ou variável de produção para a branch;
- revalidar as três caixas antes e depois de rebase, migration ou smoke test;
- se surgir credencial válida de produção, parar imediatamente a homologação;
- a falha na chamada ao provedor é esperada e obrigatória na staging.

Na staging, validar somente o caminho até a tentativa externa: autenticação,
permissão, prévia, snapshot, hash, idempotência, claim e gravação de estado. A
falha esperada do provedor não pode ser convertida em sucesso nem provocar
retry automático.

A comparação da prévia com a mensagem recebida byte a byte fica fora da
homologação. Ela será executada apenas no smoke de produção, em modo teste e
exclusivamente para o número interno autorizado.

## Regra de parada

Nenhuma migração, concessão, seed, Edge Function ou frontend deste subprojeto
pode ser aplicado em produção antes de:

1. revisar o diff completo da branch;
2. confirmar novamente o project ref `ouqwbbermlzqqvtqwlul`;
3. registrar a evidência da homologação;
4. resolver os bloqueadores de segurança deste documento;
5. obter autorização humana explícita para a escrita e para o deploy.

Até essa autorização, produção é somente leitura. Não executar parcialmente os
blocos SQL de rollout e não usar o perfil `admin` como atalho.
Nenhuma migração e nenhum deploy podem ocorrer sem essa autorização explícita.
Na staging, interromper a homologação se qualquer caixa deixar de usar a
credencial inválida ou voltar a coincidir com uma credencial de produção.
Também interromper se o rebase retornar `MIGRATIONS_FAILED` ou se exigir
falsificação do histórico para contornar drift.

## Artefatos

- Migration canônica já registrada em produção como versão `20260730161312`:
  `supabase/migrations/20260730161312_pesquisa_evasao_movimentacao_canonica.sql`
- Migration de fundação e RLS:
  `supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql`
- Migration de claim e resultado:
  `supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql`
- Migration independente do cofre de WhatsApp:
  `supabase/migrations/20260730180100_whatsapp_caixas_credenciais_privadas.sql`
- Edge:
  `supabase/functions/enviar-pesquisa-evasao`
- Verificação transacional:
  `scripts/verify-pesquisa-evasao-rls.sql`
- Tipos explícitos consumidos pelo frontend:
  `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`

`src/types/supabase.ts` tinha 532 linhas antes deste trabalho: era um contrato
manual e parcial, sem views nem funções, e não é consumido pelo código de
produção. A geração completa do schema `public` elevava o arquivo para 46.762
linhas e respondia por 71% do PR. Como a aplicação usa os tipos explícitos acima,
o arquivo parcial foi restaurado à baseline da `main`; o artefato completo do
ensaio não foi mantido no diff.

Os tipos completos foram gerados em modo somente leitura a partir do projeto
confirmado `ouqwbbermlzqqvtqwlul` e do projeto descartável já migrado. A
comparação serviu para validar o schema, as FKs e assinaturas RPC, sem transformar
este PR em uma atualização global de tipos. Depois de aplicar as migrations em
homologação, repetir a geração em arquivo temporário e comparar apenas as tabelas,
relações e assinaturas RPC alteradas pelas três migrations. Não exigir diff global
contra o contrato manual parcial e não substituir `src/types/supabase.ts`. Em
outras palavras: tipos consultaram produção somente
em leitura e o frontend permanece governado pelo contrato explícito revisável.

Em 2026-07-30, `list_migrations` confirmou no projeto
`ouqwbbermlzqqvtqwlul` a versão remota
`20260730161312_pesquisa_evasao_movimentacao_canonica`. O arquivo local usa
essa mesma versão para que `db push` não tente reaplicar o DDL canônico sob um
timestamp diferente. No rollout, as migrations novas deste subprojeto são
somente `20260730170000` e `20260730173000`.

## Gates antes da homologação e do rollout

### 1. Cofre das caixas de WhatsApp

Verificação somente leitura em 2026-07-30 confirmou que
`public.whatsapp_caixas` contém `uazapi_token` e `waha_api_key`,
`authenticated` possui `SELECT` e a policy `whatsapp_caixas_select` usa
`qual = true`. Portanto, qualquer usuário autenticado pode obter os tokens.

Isso bloqueia o início da homologação. O hardening local foi separado na
migration `20260730180100_whatsapp_caixas_credenciais_privadas.sql`: tabela
bruta apenas para `service_role`, projeção operacional sem credenciais,
projeção administrativa sem valores secretos e rotação write-only. Antes de
homologar, revisar o diff, aplicar no projeto de homologação e provar que um
usuário `authenticated` não lê `uazapi_token` nem `waha_api_key`.

#### Inventário de consumidores de `whatsapp_caixas`

Busca estática concluída em 31/07/2026 antes do fechamento:

| Consumidor no navegador | Operação anterior | Contrato depois do hardening |
|---|---|---|
| `src/components/App/PreAtendimento/hooks/useWhatsAppCaixas.ts` | listagem direta, inclusive token | `listar_whatsapp_caixas_seguras` |
| `src/components/App/Administrativo/CaixaEntrada/NovaConversaModal.tsx` | seleção direta de caixa | `listar_whatsapp_caixas_seguras`, com precedência da caixa da unidade sobre a global |
| `src/components/App/PreAtendimento/components/chat/CaixasManager.tsx` | leitura, escrita e exclusão diretas | RPCs administrativas sem leitura de segredo e mutação write-only |

Depois da migração dos três consumidores, a busca em `src/**/*.ts(x)` retorna
zero acesso direto a `.from('whatsapp_caixas')`.

Há 16 consumidores diretos server-side em `supabase/functions`: `_shared/uazapi`,
`buscar-foto-perfil`, `caixa-financeiro-whatsapp`, `configurar-webhook-caixa`,
`disparar-pesquisa-1a-aula-auto`, `enviar-boas-vindas-equipe`,
`enviar-boas-vindas-matricula`, `enviar-pesquisa-evasao`,
`enviar-pesquisa-pos-primeira-aula`, `monitor-saude-webhook`,
`notificar-primeira-aula-fabi`, `processar-mensagens-agendadas`,
`processar-resposta-pesquisa`, `relatorio-admin-whatsapp`,
`webhook-whatsapp-inbox` e `whatsapp-status`. Os pontos de entrada que criam o
cliente foram conferidos com `SUPABASE_SERVICE_ROLE_KEY`; o helper compartilhado
recebe esse cliente dos chamadores. Eles permanecem no contrato bruto
server-only e devem entrar no smoke test de homologação.

### 2. Escopo de `movimentacoes_admin`

Verificação somente leitura em 2026-07-30 e reconfirmada em 2026-07-31 mostrou
que
`public.movimentacoes_admin` possui policy `ALL` com `qual = true` e
`with_check = true` para `authenticated`. O papel autenticado também possui
grants amplos de `SELECT`, `INSERT`, `UPDATE` e `DELETE`. Assim que o novo
trigger começar a preencher `telefone_snapshot`, qualquer usuário autenticado
do LA Report poderá ler os snapshots de todas as unidades pela tabela bruta.

Existe ainda a policy `lume_readonly_select`, com `SELECT USING (true)` para
`sol_acesso_restrito`. Por isso, o DoD do Plano A afirma somente que Mila e Sol
não leem respostas privadas de `pesquisa_evasao` e tabelas filhas; ele não
afirma que a Sol deixou de ler os campos legados desta fonte canônica.

Esse hardening virou projeto separado e **não bloqueia a homologação do Plano
A**. Há pelo menos 20 consumidores no frontend e 83 referências em arquivos
TypeScript/TSX, então uma revogação isolada pode quebrar fluxos administrativos,
de retenção e dashboards. O projeto deve entrar depois da homologação do Plano
A e antes do Subprojeto C.

Risco residual de produção: a fotografia reconfirmada em 2026-07-31 encontrou
somente 3 snapshots de telefone em 385 saídas dos últimos 180 dias. Portanto,
o trigger do Plano A aumenta sistematicamente a densidade desse dado na tabela
ampla. Isso não bloqueia homologação, mas o diff final de produção precisa
registrar aceite explícito desse risco ou concluir o hardening separado antes
de habilitar o trigger. Não descrever esse ponto como “o Plano A não piora”.

### 3. Snapshots históricos de telefone

A auditoria inicial registrou 144 saídas válidas com contato atual e snapshot
ausente. Uma nova consulta canônica, executada em 2026-07-30 com janela de 180
dias e incluindo `evasao` e `nao_renovacao`, encontrou:

- 245 saídas;
- 237 saídas válidas para retenção;
- 2 com `telefone_snapshot`;
- 140 sem snapshot, mas com WhatsApp/telefone atual;
- 103 sem snapshot e sem contato atual;
- 136 válidas, sem snapshot e com contato atual.

As contagens são fotografias de auditoria e devem ser recalculadas no dia da
homologação. A diferença entre fotografias não autoriza backfill.

Não fazer backfill com `alunos.whatsapp` ou `alunos.telefone`: contato atual não
prova o destino correto na data da saída. Esses históricos permanecem
visualmente bloqueados. A função
`capturar_telefone_snapshot_movimentacao_retencao` captura o contato apenas no
INSERT de uma nova saída ou na primeira transição para
`evasao`/`nao_renovacao`; atualizar uma saída antiga não a preenche.

Consulta de revalidação, sem PII:

```sql
with saidas as (
  select
    m.id,
    public.is_movimentacao_admin_retencao_valida(m.id) as retencao_valida,
    nullif(regexp_replace(coalesce(m.telefone_snapshot, ''), '\D', '', 'g'), '')
      as snapshot_digits,
    nullif(
      regexp_replace(
        coalesce(nullif(a.whatsapp, ''), nullif(a.telefone, ''), ''),
        '\D',
        '',
        'g'
      ),
      ''
    ) as contato_atual_digits
  from public.movimentacoes_admin m
  left join public.alunos a on a.id = m.aluno_id
  where m.tipo in ('evasao', 'nao_renovacao')
    and m.data >= current_date - interval '180 days'
)
select
  count(*) as saidas_180d,
  count(*) filter (where retencao_valida) as saidas_validas_180d,
  count(*) filter (where snapshot_digits is not null) as com_snapshot,
  count(*) filter (
    where snapshot_digits is null and contato_atual_digits is not null
  ) as sem_snapshot_com_contato_atual,
  count(*) filter (
    where snapshot_digits is null and contato_atual_digits is null
  ) as sem_snapshot_sem_contato_atual,
  count(*) filter (
    where retencao_valida
      and snapshot_digits is null
      and contato_atual_digits is not null
  ) as validas_sem_snapshot_com_contato_atual
from saidas;
```

### 4. Público interno

`pesquisa_evasao_publicos_internos` é a fonte service-only para professor,
colaborador e outros públicos que não devem receber a pesquisa.

Popular somente com `aluno_id` confirmado individualmente, fonte verificável,
operador e evidência em `audit_metadata`. Não inferir por nome, telefone,
email, `tipo_aluno` ou categoria financeira. Os seis testes históricos e o
exemplo de Ana Beatriz não podem alimentar esse cadastro, indicadores de
professor ou encaminhamento à coordenação.

### 5. Decisões que continuam fora do Subprojeto A

O momento do disparo (`imediato` versus `D+X`) e a política de lembrete são
decisões abertas do Subprojeto C. Não introduzir regra D+3 neste rollout.

Autenticação do webhook inbound, conversa multipartes, opt-out e expurgo do
`webhook_debug_log` pertencem ao Subprojeto B. O B deve preservar
`processar-resposta-pesquisa`, inclusive a pesquisa pós-primeira aula.

Exceção declarada neste PR: `webhook-whatsapp-inbox/index.ts` remove o fallback
de depuração que, sem encontrar o telefone recebido, aceitava qualquer estado
ativo de evasão e podia gravar a resposta na pesquisa de outra família. Essa
correção preexistente está explicitamente listada entre os arquivos a preservar
no Plano A e é coberta por `pesquisaEvasaoCanonica.test.mjs`. Ela precisa entrar
agora para garantir a integridade das respostas criadas pela fundação do Plano
A. O arquivo não recebe aqui autenticação inbound, agregação multipartes,
opt-out nem política de logs; esses contratos continuam integralmente no
Subprojeto B.

### 6. Baseline local do Supabase

Em 2026-07-30, `supabase start` falhou antes de chegar às migrations deste
subprojeto: `20260109_fase1_seed_dados.sql` é ordenada antes da migration que
cria `professores`, e o primeiro `INSERT INTO professores` não encontra a
tabela. Por isso, `supabase db lint --local` também não conecta.

É um defeito preexistente da baseline local, não uma falha das migrations de
evasão. Não renomear ou reordenar 395 migrations históricas dentro deste
rollout. Corrigir a baseline em trabalho separado ou validar o lint em uma
homologação reconstruída e documentada antes do deploy.

## Identidade e matriz nominal

Identificar sempre por ID ou email exato. Nunca usar `LIKE`/`ILIKE` no nome:
Jessica, Jessyca e Jéssica aparecem com grafias diferentes.

Consulta obrigatória:

```sql
select id, auth_user_id, nome, email, perfil, unidade_id, ativo
from public.usuarios
where (id, lower(email)) in (
  (29, 'jessyca@lamusic.com.br'),
  (30, 'fabi@gmail.com')
)
order by id;
```

Resultado esperado:

| Pessoa | ID | Email exato |
|---|---:|---|
| Jessica | 29 | `jessyca@lamusic.com.br` |
| Fabi | 30 | `fabi@gmail.com` |

Identidades fixas para os gates: `id = 29`,
`email = jessyca@lamusic.com.br`; `id = 30`, `email = fabi@gmail.com`.

Cada titular precisa estar ativa, possuir exatamente um `auth_user_id` e
exatamente uma assinatura ativa. A assinatura é resolvida automaticamente pelo
login; não existe seletor de identidade operacional.

As duas atendem as três unidades:

| Unidade | ID |
|---|---|
| Barra | `368d47f5-2d88-4475-bc14-ba084a9a348e` |
| Campo Grande | `2ec861f6-023f-4d7b-9927-3960ad8c2a92` |
| Recreio | `95553e96-971b-4590-a6eb-0201d013c14d` |

O perfil exato `Sucesso do Aluno - Evasao` deve conter somente:

- `sucesso_aluno.evasao.ver`
- `sucesso_aluno.evasao.enviar`
- `sucesso_aluno.evasao.revisar`
- `sucesso_aluno.evasao.gerir_acoes`
- `sucesso_aluno.evasao.modo_teste`

Não conceder `sucesso_aluno.evasao.relatorios` implicitamente. O resultado
nominal são seis vínculos ativos, 2 × 3, em
`usuario_perfis.unidade_id`. Qualquer vínculo desse perfil com
`unidade_id is null`, unidade extra ou contagem diferente de seis aborta o
rollout. O `admin` legado não é atalho: sem esses vínculos, o helper estrito
precisa retornar `false`.

## Terceiro usuário de homologação

Fabi e Jessica cobrem as três unidades, então o teste “usuário de outra unidade
não envia” usa um terceiro usuário **dedicado** de homologação com permissão em
apenas uma unidade. Não reutilizar conta de colaborador.

Antes do teste, reconfirmar o project ref da homologação e criar a identidade
pela operação administrativa suportada do Supabase Auth nesse ambiente. Em
seguida, vincular um registro ativo de `public.usuarios`, perfil `unidade` e uma
única unidade. Registrar neste runbook o `usuarios.id`, email exato,
`auth_user_id`, unidade única e perfil. Ele não pode ser 29 ou 30, não pode ter
vínculo global e não pode ser identificado pelo nome.

| Campo | Valor da homologação |
|---|---|
| Project ref da homologação | `nzwqjepncrtufpykjita` |
| `usuarios.id` | PENDENTE — não criado; gate de schema bloqueado |
| Email exato | PENDENTE — não criado; gate de schema bloqueado |
| `auth_user_id` | PENDENTE — não criado; gate de schema bloqueado |
| Unidade única | PENDENTE — não criado; gate de schema bloqueado |
| Perfil | `unidade` |

Enquanto esses campos estiverem pendentes, a homologação de isolamento não está
concluída.

O usuário dedicado deve ser desativado ao final da homologação em
`public.usuarios`,
revogar seus vínculos/permissões temporários e desativar a identidade no
Supabase Auth de homologação. Registrar operador e horário. Não executar esse
provisionamento no project ref de produção
`ouqwbbermlzqqvtqwlul`.

## SQL de atribuição nominal — não executar sem o gate

O bloco abaixo é idempotente e deliberadamente não está em migration. Revisar a
cópia das mensagens e executar primeiro em homologação.

```sql
begin;

do $identidades$
begin
  if (
    select count(*)
    from public.usuarios u
    where (u.id, lower(u.email)) in (
      (29, 'jessyca@lamusic.com.br'),
      (30, 'fabi@gmail.com')
    )
      and u.ativo = true
      and u.auth_user_id is not null
  ) <> 2 then
    raise exception 'Identidades de Fabi/Jessica nao conferem';
  end if;
end
$identidades$;

update public.usuario_perfis up
set ativo = false,
    updated_at = now()
from public.perfis p
where up.perfil_id = p.id
  and p.nome = 'Sucesso do Aluno - Evasao'
  and up.usuario_id in (29, 30)
  and (
    up.unidade_id is null
    or up.unidade_id not in (
      '368d47f5-2d88-4475-bc14-ba084a9a348e',
      '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
      '95553e96-971b-4590-a6eb-0201d013c14d'
    )
  );

insert into public.usuario_perfis (
  usuario_id, perfil_id, unidade_id, ativo
)
select
  titular.usuario_id,
  p.id,
  unidade.unidade_id,
  true
from (values (29), (30)) titular(usuario_id)
cross join (
  values
    ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid),
    ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid),
    ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid)
) unidade(unidade_id)
join public.perfis p on p.nome = 'Sucesso do Aluno - Evasao'
on conflict (usuario_id, perfil_id, unidade_id)
  where unidade_id is not null
do update set ativo = true, updated_at = now();

update public.pesquisa_evasao_assinaturas s
set ativo = false,
    valido_ate = now()
from public.usuarios u
where s.usuario_id = u.id
  and u.id in (29, 30)
  and s.ativo = true
  and (
    s.nome_assinatura is distinct from u.nome
    or s.cargo_assinatura is distinct from 'Sucesso do Aluno'
  );

insert into public.pesquisa_evasao_assinaturas (
  usuario_id, nome_assinatura, cargo_assinatura, ativo
)
select u.id, u.nome, 'Sucesso do Aluno', true
from public.usuarios u
where u.id in (29, 30)
  and not exists (
    select 1
    from public.pesquisa_evasao_assinaturas s
    where s.usuario_id = u.id
      and s.ativo = true
  );

-- Antes de executar, a equipe deve aprovar estas duas cópias exatamente.
update public.pesquisa_evasao_templates
set ativo = false
where publico in ('direto', 'responsavel')
  and ativo = true;

insert into public.pesquisa_evasao_templates (
  chave, versao, publico, corpo, ativo, criado_por_usuario_id
)
values
  (
    'evasao_aberta',
    1,
    'direto',
    E'Oi, {{aluno_primeiro_nome}}! Aqui é a {{assinatura_nome}}, do Sucesso do Aluno da LA Music. 🎵\n\nQueria agradecer pelo tempo que você passou com a gente. As portas estarão sempre abertas para você!\n\nPosso te fazer uma única pergunta?\n\nSe você pudesse mudar alguma coisa na sua experiência na LA Music, o que mudaria?\n\nPode responder com texto ou áudio, fique à vontade. 🙏',
    true,
    29
  ),
  (
    'evasao_aberta',
    1,
    'responsavel',
    E'Oi, {{responsavel_primeiro_nome}}! Aqui é a {{assinatura_nome}}, do Sucesso do Aluno da LA Music. 🎵\n\nQueria agradecer pelo tempo que {{aluno_primeiro_nome}} passou com a gente. As portas estarão sempre abertas!\n\nPosso te fazer uma única pergunta?\n\nSe você pudesse mudar alguma coisa na experiência de {{aluno_primeiro_nome}} na LA Music, o que mudaria?\n\nPode responder com texto ou áudio, fique à vontade. 🙏',
    true,
    29
  )
on conflict (chave, versao, publico)
do update set
  corpo = excluded.corpo,
  ativo = excluded.ativo,
  criado_por_usuario_id = excluded.criado_por_usuario_id;

-- Não trocar COMMIT por execução automática. Conferir as queries abaixo.
select * from public.usuario_tem_permissao_estrita(
  29,
  'sucesso_aluno.evasao.ver',
  '368d47f5-2d88-4475-bc14-ba084a9a348e'
);
select * from public.usuario_tem_permissao_estrita(
  30,
  'sucesso_aluno.evasao.ver',
  '95553e96-971b-4590-a6eb-0201d013c14d'
);

-- Na primeira execução em homologação, manter ROLLBACK, validar o resultado,
-- e só então repetir com COMMIT em uma execução separada e autorizada.
rollback;
```

## Homologação obrigatória

Executar com cinco identidades:

1. anônimo;
2. usuário autenticado sem permissão;
3. terceiro usuário com permissão em apenas uma unidade;
4. Fabi, `usuarios.id = 30`;
5. Jessica, `usuarios.id = 29`.

Comprovar:

- anônimo recebe `401`;
- sem permissão recebe `403` e não lê respostas;
- terceiro usuário não lista, não pré-visualiza e não envia outra unidade,
  inclusive com `p_unidade_id = NULL`;
- Fabi e Jessica operam Barra, Campo Grande e Recreio;
- cada login mostra sua própria assinatura, sem seletor;
- preview e envio possuem exatamente a mesma mensagem e destino;
- clique duplo não duplica envio;
- modo teste usa somente o telefone de teste, aparece marcado como TESTE e não
  entra em estatísticas;
- histórico sem `telefone_snapshot` permanece bloqueado;
- nova saída recebe snapshot no nascimento do evento;
- `relatorios` sem `ver` não expõe `resposta_texto`;
- `service_role` continua operando;
- `pesquisa_evasao_publicos_internos` bloqueia somente IDs confirmados;
- os seis registros legados permanecem `modo_teste = true`.

Após aplicar em produção, no rollout autorizado, conferir explicitamente que os
seis registros legados foram encontrados e classificados como teste. Esse
postflight amarra o `NOTICE` do caminho de tabela vazia à prova de que produção
não pulou o backfill indevidamente:

```sql
select
  count(*) as total_legado,
  count(*) filter (where modo_teste = true) as total_modo_teste
from public.pesquisa_evasao
where id in (
  '5edc499f-4a91-4ebb-a291-0f052bc16351',
  '416624a9-2d74-4c26-a083-c6aadba21bf2',
  '718fa72e-ca51-4995-960f-575bb00c2b0e',
  '1b918f39-c528-431d-9d7d-3d9160982e6a',
  '61ebbbd0-a8e8-4e77-99ee-d4ff9bcc6f03',
  '147a6632-fccb-4089-9ae0-13db822d7bf9'
);
```

Resultado obrigatório: `total_legado = 6` e `total_modo_teste = 6`. Qualquer
outro resultado interrompe o rollout antes de indicadores ou uso operacional.

Rodar a verificação dentro de uma sessão PostgreSQL de homologação:

```powershell
psql $HOMOLOG_DATABASE_URL -v ON_ERROR_STOP=1 -f scripts/verify-pesquisa-evasao-rls.sql
```

O script abre transação, cria fixtures, usa `set local role`, consulta
`pg_policies`, `has_table_privilege`, `has_function_privilege` e `aclexplode`,
e termina obrigatoriamente em `rollback`.

## Verificação de código

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/contract.test.ts supabase/functions/enviar-pesquisa-evasao/auth.test.ts
node --test tests/pesquisaEvasaoCanonica.test.mjs tests/pesquisaEvasaoFundacaoSegura.test.mjs tests/pesquisaEvasaoEdgeSegura.test.mjs tests/pesquisaEvasaoPreviewFrontend.test.mjs tests/pesquisaEvasaoListagemSegura.test.mjs tests/pesquisaEvasaoRolloutGovernado.test.mjs
npm run build
npx supabase db lint --local
```

Depois das migrations em homologação:

```powershell
npx supabase gen types typescript --local | Out-File -Encoding utf8 $env:TEMP\pesquisa-evasao-homolog.types.ts
```

O artefato temporário precisa manter as duas overloads legadas, a v2 com sete
argumentos, o histórico de testes e as RPCs de claim/resultado. Comparar apenas
o domínio da entrega e não substituir `src/types/supabase.ts` neste PR.

## Smoke manual dos consumidores de caixas

O hardening de `whatsapp_caixas` altera três consumidores operacionais fora da
tela de evasão: `useWhatsAppCaixas.ts`, `CaixasManager.tsx` e
`NovaConversaModal.tsx`. Build e busca estática não encerram esse gate.

Tentativa de 31/07/2026: o deployment preview do PR e o servidor local da branch
foram abertos, mas ambos redirecionaram para login porque não havia sessão
autenticada nesses domínios. Nenhuma senha, sessão ou token foi copiado entre
origens. Portanto, o smoke visual continua **PENDENTE** e não pode ser descrito
como aprovado.

Executar depois que `20260730180100` existir no ambiente alvo e houver uma sessão
autenticada autorizada:

1. em **Configurações > WhatsApp**, confirmar que `CaixasManager` lista as caixas
   e mostra apenas os indicadores de credencial configurada, nunca o token ou a
   chave;
2. no **Pré-Atendimento**, alternar entre uma unidade e o consolidado e confirmar
   que a lista de caixas acompanha o escopo sem ficar vazia ou presa à seleção
   anterior;
3. na **Caixa de Entrada**, abrir **Nova Conversa**, confirmar que busca e modal
   renderizam e fechar sem selecionar contato, criar conversa ou enviar mensagem;
4. conferir os erros do navegador e as respostas das RPCs
   `listar_whatsapp_caixas_seguras` e
   `listar_whatsapp_caixas_administracao`;
5. manter a prova de precedência unidade sobre global no teste executável de
   `selecionarCaixaAdministrativa`; essa escolha acontece somente no comando
   final de criação da conversa e não é exibida pelo modal. Qualquer teste manual
   desse comando exige autorização de escrita, contato dedicado e conferência do
   `caixa_id` persistido — não executar durante este smoke somente leitura.

## Ordem de rollout

1. fechar e validar o cofre de `whatsapp_caixas`;
2. revisar o diff completo e confirmar primeiro o project ref da homologação;
3. aplicar e validar em homologação a migration `20260730180100`;
4. obter backup lógico/DDL das tabelas afetadas pelo Plano A;
5. aplicar as duas migrations do Plano A;
6. validar RLS estrutural;
7. atribuir os seis vínculos, as duas assinaturas e os dois templates;
8. registrar o terceiro usuário e concluir a homologação;
9. validar `scripts/verify-pesquisa-evasao-rls.sql`;
10. abrir/executar o hardening separado de `movimentacoes_admin` ou registrar o
   aceite explícito do risco residual antes do rollout de produção;
11. reconfirmar o project ref de produção `ouqwbbermlzqqvtqwlul`;
12. fazer deploy da Edge com JWT;
13. fazer deploy do frontend;
14. smoke test em modo teste;
15. um envio real autorizado;
16. monitorar falhas, estados `incerto`, volume e taxa de resposta.

Plano B só começa depois de os contratos de persistência e permissão deste
subprojeto estarem fechados.

## Rollback operacional

Se a homologação ou o smoke test falhar:

1. interromper novos envios;
2. reverter frontend e Edge para as versões anteriores;
3. desativar os seis vínculos do perfil dedicado;
4. desativar templates e assinaturas novos sem apagar histórico;
5. preservar pesquisas, previews e evidências já gravadas;
6. restaurar DDL/dados somente a partir do backup revisado;
7. registrar motivo, horário, commit e operador.

Não apagar respostas privadas nem transformar estado `incerto` em falha para
forçar retry.

## Evidência a preencher

| Item | Evidência |
|---|---|
| Commit implantado | PENDENTE |
| Project ref reconfirmado | `nzwqjepncrtufpykjita` em 31/07/2026 |
| Migration de fundação | PENDENTE |
| Migration de claim | PENDENTE |
| Versão da Edge | PENDENTE |
| Terceiro usuário de homologação | NÃO CRIADO — bloqueado pelo gate de schema |
| Saída da verificação RLS | PENDENTE |
| Smoke test em modo teste | PENDENTE |
| Envio real autorizado | PENDENTE |
| Operador e horário | PENDENTE |
