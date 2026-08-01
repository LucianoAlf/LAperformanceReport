# Pesquisa de evasão — runbook do Subprojeto A

**Status:** Plano A aplicado e publicado. Gate 0 do retorno fechado em produção.
Gate 1 da Prosódia V2 fechado com Edge retrocompatível e prévia V1 cancelada sem
envio. Gate 2 aguarda autorização explícita do Alf.

**Produção:** `ouqwbbermlzqqvtqwlul`

**Princípio operacional:** qualquer usuário interno ativo pode ver e enviar em qualquer unidade. O controle é autenticação externa, identidade resolvida no servidor e auditoria completa, não autorização granular.

## 1. Regras de parada

Pare imediatamente se qualquer item ocorrer:

- o project ref ativo não for exatamente o ambiente autorizado por Alf;
- aparecer qualquer intenção de aplicar migration ou deploy sem Alf presente;
- a Edge estiver com `verify_jwt = false`;
- preview ou confirmação aceitarem operador, assinatura livre, caixa, template, mensagem ou telefone produtivo enviados pelo navegador;
- o usuário do JWT não resolver exatamente uma linha ativa em `public.usuarios`;
- o diff reintroduzir catálogo, perfil, vínculo nominal ou autorização por unidade para este domínio;
- a migration de `whatsapp_caixas` divergir do hash registrado;
- um teste de produção apontar para telefone que não seja o número interno aprovado;
- credencial real de WhatsApp aparecer em ambiente de ensaio, log, fixture ou diff;
- a ordem migration antes de frontend não puder ser garantida.

Nenhum passo deste documento autoriza escrita em produção por si só.

## 2. Estado conhecido dos ambientes

### Produção

- project ref: `ouqwbbermlzqqvtqwlul`;
- permanece somente leitura durante preparação e revisão;
- contém seis pesquisas legadas confirmadas por Alf como testes;
- o smoke real futuro deve usar modo teste e exclusivamente o número interno `5521981278047`.

### `p01c-staging`

- project ref: `nzwqjepncrtufpykjita`;
- branch antiga, com cópia de dados reais e histórico divergente;
- tokens de WhatsApp foram neutralizados em 31/07/2026 e não podem ser restaurados;
- não usar para homologar o Plano A;
- não excluir até concluir o inventário independente de referências e segredos compartilhados por fingerprint.

### Ensaio descartável anterior

- project ref: `vnuzjephkwgcyvioiele`;
- recebeu schema-only, roles e extensões estruturais, sem dados ou segredos;
- validou a versão anterior das migrations e depois foi destruído;
- como a migration principal mudou nesta correção de rumo, o resultado anterior não substitui um novo ensaio DDL do diff final;
- qualquer novo ambiente descartável exige autorização específica e deve ser destruído ao final.

## 3. Evidências já fechadas

### Automação de deploy

- a main possui publicação automática na Vercel;
- não foi encontrada automação do repositório que aplique migrations Supabase ao merge;
- consequência: migrations e Edge precisam entrar antes do frontend que chama os contratos novos;
- depois das migrations, o merge/deploy do frontend precisa ocorrer antes do smoke dos consumidores de caixas, pois o frontend antigo não consegue ler a tabela endurecida.

### Gitleaks

- o check de pull request apontou quatro UUIDs sintéticos em teste;
- os valores foram conferidos contra `auth.users` e `public.usuarios` e não eram identidades reais;
- a exceção usa somente quatro fingerprints exatos em `.gitleaksignore`;
- o scanner não foi desligado nem recebeu regra genérica;
- os checks voltaram a verde.

### Hardening de `whatsapp_caixas`

- migration: `20260730180100_whatsapp_caixas_credenciais_privadas.sql`;
- SHA-256 de referência antes desta correção: `F863A22C9F1D8534EAF31F0A7FEDC183DDABF3902E975B620B1F5064F9C381C4`;
- git blob de referência: `814f0345604c024a04ef6d62508e46a9e7689992`;
- esta migration deve permanecer integralmente inalterada;
- Pré-Atendimento, CaixasManager e NovaConversaModal usam contratos sem credencial;
- o smoke manual dessas telas continua necessário porque build e busca estática não provam a seleção correta de caixa;
- esse smoke ocorre dentro da janela de rollout, após as migrations **e depois do deploy do frontend**, pois somente o código novo consome os contratos seguros. Testar antes do deploy reproduz necessariamente a incompatibilidade entre a RLS nova e a leitura direta legada.

### Baseline visual anterior ao rollout

Baseline registrada na `main`, ainda com o código atualmente publicado:

- Pré-Atendimento → Conversas já exibe `WhatsApp desconectado — Lia - Sucesso do Aluno • Caixa undefined não encontrada`; este é um bug preexistente e não uma regressão do PR #16;
- a Caixa de Entrada do Sucesso do Aluno carregou normalmente com 117 conversas, boas-vindas enviadas e resposta recebida, sem erro de caixa.

Critério comparativo durante o rollout:

- o Pré-Atendimento pode continuar mostrando exatamente o erro preexistente acima; erro diferente, ou o mesmo erro aparecendo onde antes não aparecia, é regressão e exige parar;
- qualquer falha na Caixa de Entrada do Sucesso do Aluno é regressão e exige parar;
- abrir também CaixasManager em Pré-Atendimento → Configurações e NovaConversaModal em nova conversa, confirmando a seleção de caixa e que nenhum campo de token aparece preenchido.

## 4. Artefatos do rollout

Migrations, nesta ordem:

1. `20260730170000_pesquisa_evasao_fundacao_segura.sql`;
2. `20260730173000_pesquisa_evasao_claim_seguro.sql`;
3. `20260730180100_whatsapp_caixas_credenciais_privadas.sql`.
4. após o smoke manual do Bloco 3 e com autorização específica de Alf,
   `20260801013000_pesquisa_evasao_backfill_telefone_julho_2026.sql`.
5. após preflight somente leitura e nova confirmação de Alf,
   `20260801023000_pesquisa_evasao_backfill_telefone_responsavel_julho_2026.sql`.
6. após o diagnóstico das saídas criadas na manhã de 01/08 e autorização
   específica de Alf,
   `20260801174500_pesquisa_evasao_backfill_telefone_responsavel_agosto_2026.sql`.

Edge e frontend:

- `supabase/functions/enviar-pesquisa-evasao/`;
- `supabase/functions/webhook-whatsapp-inbox/`;
- `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`;
- `src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx`;
- consumidores de caixas listados no item 3.

Verificadores:

- `scripts/verify-pesquisa-evasao-schema.sql`: estrutural, transacional e sem dados nominais;
- `scripts/verify-pesquisa-evasao-rls.sql`: operacional, transacional, destinado ao rollout assistido;
- ambos terminam em `ROLLBACK`.

## 5. Contrato de acesso que deve ser observado

### Pessoas

Qualquer sessão `authenticated` só é considerada interna quando `auth.uid()` resolve uma linha única com `usuarios.ativo = true`.

Essa pessoa pode:

- listar pesquisas de Barra, Campo Grande, Recreio ou consolidado;
- ler cabeçalho, mensagens, transcrições e análises;
- gerar prévia e confirmar envio, inclusive em modo teste;
- filtrar por unidade sem que o filtro funcione como portão de autorização.

Essa pessoa não recebe escrita direta nas tabelas. A operação passa pela Edge e por RPCs auditadas.

### Agentes

Os roles `mila_acesso_restrito`, `sol_acesso_restrito`, `fabio_agent` e `lia_acesso_restrito` permanecem sem acesso direto às tabelas privadas e sem execução das RPCs operacionais. Integrações futuras usam read models ou contratos governados.

### Identidade e assinatura

- o operador é sempre o usuário resolvido pelo JWT;
- o padrão de exibição é o primeiro nome de `usuarios.nome`;
- uma assinatura ativa pode sobrescrever somente o nome de exibição;
- ausência de assinatura cadastrada não bloqueia envio;
- a confirmação pertence ao mesmo `auth_user_id` que criou a prévia;
- o banco registra `executado_por_usuario_id`, `executado_por_auth_user_id`, `assinatura_id` opcional e `assinatura_nome_snapshot`.

### Templates e governança de configuração

- a migration semeia as duas cópias aprovadas, sem depender de Fabi, Jessica, perfil ou unidade;
- deve existir exatamente um template ativo para `direto` e um para `responsavel`;
- `service_role` possui somente `SELECT` em `pesquisa_evasao_templates` e `pesquisa_evasao_assinaturas`;
- não existe caminho de escrita pela aplicação para essas duas tabelas;
- qualquer troca de texto ou override de assinatura exige migration ou SQL versionado, revisado e aplicado no rollout autorizado;
- abrir escrita para a aplicação só pode ocorrer em projeto futuro com RPC administrativa, autorização própria e auditoria.

## 6. Verificação local antes de qualquer rollout

Executar na worktree do PR:

```powershell
node --test tests/pesquisaEvasaoAcessoInternoAuditavel.test.mjs tests/pesquisaEvasaoFundacaoSegura.test.mjs tests/pesquisaEvasaoListagemSegura.test.mjs tests/pesquisaEvasaoEdgeSegura.test.mjs tests/pesquisaEvasaoPreviewFrontend.test.mjs tests/pesquisaEvasaoRolloutGovernado.test.mjs tests/pesquisaEvasaoEnsaioDescartavel.test.mjs tests/whatsappCaixasCredenciaisPrivadas.test.mjs
deno test supabase/functions/enviar-pesquisa-evasao/*.test.ts
npm run build
git diff --check
```

Também conferir a imutabilidade do hardening de caixas:

```powershell
Get-FileHash -Algorithm SHA256 supabase/migrations/20260730180100_whatsapp_caixas_credenciais_privadas.sql
```

O hash deve ser exatamente o valor do item 3.

Não regenerar nem exigir diff de `src/types/supabase.ts`: o código de produção desta entrega não depende desse arquivo parcial e a geração completa anterior foi removida para evitar drift e inflar a revisão.

## 7. Ensaio estrutural antes da produção

O diff final da migration principal deve ser aplicado fora de produção antes do rollout. O ambiente pode ser descartável e conter apenas schema, roles e extensões necessárias, sem dados, caixas ou segredos.

Resultado esperado:

- as três migrations aplicam sem colisão de policy, função ou grant;
- `verify-pesquisa-evasao-schema.sql` passa e termina em rollback;
- tipos gerados para conferência não introduzem drift no arquivo parcial do repositório;
- o ambiente é destruído e o project ref fica registrado aqui.

Campos a preencher:

| Evidência | Resultado |
|---|---|
| Project ref descartável | `didpawhgvkarzntvktzu` (`ddl-evasao-final-a78ea2`) |
| Schema carregado sem dados | APROVADO — `alunos`, `usuarios`, `movimentacoes_admin`, `pesquisa_evasao` e `whatsapp_caixas` com zero linhas |
| Migrations aplicadas limpo | APROVADO — `20260730170000`, `20260730173000` e `20260730180100` |
| Seed dos templates | APROVADO — reaplicado duas vezes, fingerprint estável, duas linhas e exatamente uma ativa por público |
| Verificador estrutural | APROVADO — executado em transação e finalizado com `ROLLBACK` |
| Ambiente destruído | APROVADO — exclusão confirmada e zero projetos `ddl-evasao-final-*` remanescentes |

### Resultado do ensaio DDL do diff final em 31/07/2026

O ensaio aprovado usou o schema atual de produção, que permaneceu somente
leitura. O histórico remoto lido no início tinha 1.151 versões, de
`20260106025222` a `20260731200406`; nenhuma das três migrations deste rollout
constava como aplicada.

Evidências de origem e saneamento:

- dump `public` somente-schema: 3.198.746 bytes, SHA-256
  `8005F4F4A72920B68E209005FFC5A31EE7EDF50451F528FFA1E8E9C71B0E5977`;
- o dump não continha `COPY` nem `INSERT` de dados no nível superior;
- Gitleaks `8.30.1` examinou o dump original e não encontrou segredo;
- as três URLs estruturais embutidas foram substituídas por
  `https://disabled.invalid/homolog-ddl`; o artefato saneado ficou sem o
  project ref de produção, com 3.198.699 bytes e SHA-256
  `47D76CEBE250A3E2E228FF3DEE86882781A2188A45EAB2DC86FCC61644C529D9`;
- Gitleaks examinou novamente o artefato saneado e não encontrou segredo.

Evidências do banco descartável aprovado:

- projeto `ddl-evasao-final-a78ea2`, ref `didpawhgvkarzntvktzu`, região
  `sa-east-1`, tamanho `micro`;
- os roles `fabio_agent`, `lia_acesso_restrito`, `maria_lareport_rpc`,
  `mila_acesso_restrito`, `ml_jobs` e `sol_acesso_restrito` foram criados sem
  login;
- `pg_cron 1.6.4` em `pg_catalog`, `pg_net 0.19.5`, `pg_trgm 1.6` e
  `unaccent 1.1` em `public`, `pgcrypto 1.3`, `uuid-ossp 1.1` e
  `pg_stat_statements 1.11` em `extensions`, `supabase_vault 0.3.1` em `vault`
  e `plpgsql 1.0` em `pg_catalog` foram conferidas antes do restore;
- o restore terminou com contagem `0|0|0|0|0` para `alunos`, `usuarios`,
  `movimentacoes_admin`, `pesquisa_evasao` e `whatsapp_caixas`;
- as 1.151 versões existentes foram marcadas como aplicadas por
  `migration repair`, sem replay do histórico;
- as três migrations finais aplicaram e a primeira emitiu exatamente
  `backfill ignorado: pesquisa_evasao vazia`;
- o seed exato foi extraído da migration e executado mais duas vezes: o
  fingerprint permaneceu igual e o estado final foi `2|1|1|2` — duas linhas,
  uma ativa para `direto`, uma ativa para `responsavel` e ambas com os
  placeholders esperados;
- `scripts/verify-pesquisa-evasao-schema.sql` passou e terminou com rollback;
- os tipos `public` foram gerados apenas como artefato temporário
  (1.631.565 bytes) e continham os contratos de templates, previews, listagem
  segura de caixas e listagem v2 da evasão; `src/types/supabase.ts` não foi
  alterado;
- o projeto foi destruído, e a listagem posterior confirmou zero projetos com
  prefixo `ddl-evasao-final-*`.

Um ciclo preparatório anterior, `ddl-evasao-final-1f7a5b` ref
`tihdmpdlimgmozsfjmwu`, restaurou o schema vazio mas abortou antes do
`migration repair` porque a pasta local de migrations não existia. Nenhuma das
três migrations foi aplicada nesse ciclo, o projeto foi destruído e ele não
conta como evidência de aprovação.

### Avanço da `main` depois do ensaio

Antes do rollout, a `origin/main` foi integrada à branch do PR. A `main`
avançou 55 commits desde a base original
`4e2584a775b59c5e5a4ee5c6d99233af3d1dd93a`. O único conflito de conteúdo,
em `supabase/config.toml`, foi resolvido preservando simultaneamente:

- `enviar-pesquisa-evasao` com `verify_jwt = true`;
- `sync-presenca-emusys` com `verify_jwt = false` e autenticação interna no
  código da função.

A `main` trouxe 22 migrations: 19 já constavam em produção antes da extração
do schema ensaiado e 3 ainda não constam em produção. Uma nova leitura somente
leitura confirmou o mesmo histórico usado pelo ensaio: 1.151 versões de 14
dígitos, terminando em `20260731200406`. Assim, o projeto
`didpawhgvkarzntvktzu` não ficou defasado e o ensaio DDL não precisa ser
repetido. A lista completa de commits, migrations e arquivos sobrepostos está
em
[`2026-07-31-drift-main-plano-a.md`](../auditorias/2026-07-31-drift-main-plano-a.md).

### Compatibilidade com o RBAC plural do Hugo

Uma verificação final somente leitura foi executada em 31/07/2026 contra
`ouqwbbermlzqqvtqwlul`, depois de a `main` receber as migrations
`perfil_sucesso_do_aluno_departamento`,
`get_user_unidade_ids_plural_com_piloto` e
`policies_unidade_plural_in_get_user_unidade_ids`. O banco possuía 34 vínculos
ativos de usuários a perfis, cobrindo 28 pessoas, e exatamente uma linha em
`perfis` chamada `Sucesso do Aluno`.

Conclusão por migration:

- `perfil_sucesso_do_aluno_departamento` altera somente `perfis` e
  `perfil_permissoes`; não cria nem altera policy ou função usada pelo Plano A;
- `get_user_unidade_ids_plural_com_piloto` cria
  `rbac_piloto_usuarios` e `get_user_unidade_ids()`. Nenhuma função do Plano A
  chama esse helper, `get_user_unidade_id()` ou a tabela de vínculos de
  usuários a perfis;
- `policies_unidade_plural_in_get_user_unidade_ids` apenas altera policies cujo
  texto continha `= get_user_unidade_id()`. Entre `pesquisa_evasao`,
  `movimentacoes_admin`, `alunos`, `cursos`, `professores` e `motivos_saida`, a
  leitura remota encontrou somente quatro policies alteradas, todas em
  `alunos`: SELECT, INSERT, UPDATE e DELETE. Nenhuma policy das outras cinco
  tabelas usa o helper plural.

Isso não muda o resultado das RPCs de listagem após o rollout. As duas
sobrecargas de `listar_evadidos_para_pesquisa`,
`listar_evadidos_para_pesquisa_v2`, `stats_pesquisa_evasao` e
`pode_enviar_pesquisa_evasao` são recriadas pelo Plano A como
`SECURITY DEFINER`, com owner `postgres` e `search_path` fixo. As seis tabelas
inspecionadas possuem RLS sem `FORCE ROW LEVEL SECURITY`; portanto, as leituras
dessas RPCs não são filtradas pelas policies pluralizadas de `alunos`. O
recorte continua sendo o parâmetro `p_unidade_id`, e a autorização continua
sendo apenas `fn_pesquisa_evasao_usuario_interno_ativo()` — sem perfil,
permissão ou unidade.

Também não existe colisão de policy em `pesquisa_evasao`. Antes do rollout, a
única policy da tabela é `pesquisa_evasao_all`; o trabalho do Hugo não criou
policy nessa tabela e sua migration dinâmica não a altera. Durante o rollout,
`20260730170000` remove com `IF EXISTS` `pesquisa_evasao_all`,
`pesquisa_evasao_leitura_estrita` e `pesquisa_evasao_leitura_interna`, e então
cria uma única `pesquisa_evasao_leitura_interna` para `authenticated`, com
`USING (fn_pesquisa_evasao_usuario_interno_ativo())`. O mesmo padrão nominal é
aplicado às tabelas filhas, que também não foram tocadas pelas três migrations
do Hugo.

Há ainda prova dinâmica dessa ordem: o schema-only usado em
`didpawhgvkarzntvktzu` já continha as três migrations do Hugo no histórico
remoto, e `20260730170000`, `20260730173000` e `20260730180100` aplicaram sobre
esse schema sem colisão. A verificação atual confirmou que o histórico de
produção não avançou depois daquele dump.

Estado final esperado e verificado no SQL versionado: qualquer sessão
`authenticated` cujo `auth.uid()` corresponda a uma linha ativa em
`public.usuarios` lê a pesquisa, independentemente de vínculo de perfil ou
unidade. Usuário sem vínculo interno ativo não lê; roles de agentes
continuam revogados. O acesso amplo preexistente de `movimentacoes_admin`
permanece risco separado do projeto de hardening e não altera o resultado das
RPCs do Plano A. Nenhuma escrita foi feita em produção nesta verificação.

As duas conversas antigas de Campo Grande sem `caixa_id` continuam como item
independente, sem correção neste rollout, conforme
[`2026-07-31-pre-atendimento-caixa-undefined.md`](../auditorias/2026-07-31-pre-atendimento-caixa-undefined.md).

## 8. Pré-flight de produção

### Evidência registrada em 31/07/2026

- produção reconfirmada por duas fontes independentes como
  `ouqwbbermlzqqvtqwlul` (`LA Performance Report`, `ACTIVE_HEALTHY`);
- antes da segunda tentativa do Bloco 2, o SQL persistido em
  `supabase_migrations.schema_migrations.statements` foi auditado para
  `20260731235710`, `20260801002522`, `20260801002807` e `20260801003051`;
  nenhuma das quatro migrations menciona `pesquisa_evasao`,
  `whatsapp_caixas`, `movimentacoes_admin` nem as funções recriadas pelo Plano
  A. O avanço concorrente de histórico não colide com este rollout;
- backups físicos estão habilitados, porém o último snapshot retornado foi
  `2026-07-30 06:15:52 UTC` (`03:15:52 BRT`) e `pitr_enabled = false`;
- Alf autorizou seguir sem PITR porque uma restauração integral descartaria
  operação real e não é o rollback indicado para migrations aditivas;
- o rollback desta janela passa a ser cirúrgico, objeto a objeto, pelo artefato
  local e ignorado pelo Git
  `D:\\2026\\LA-performance-report\\.worktrees\\pesquisa-evasao-fundacao-segura\\docs\\runbooks\\pesquisa-evasao-subprojeto-a-rollback-producao.sql.local`;
- SHA-256 do artefato de rollback:
  `AF34440C22F71D9636D220A557F74A290295CEF3130CB1DCBD08DD86CA2B43DC`;
- a captura somente leitura contém as cinco funções preexistentes via
  `pg_get_functiondef`, policies com `USING`/`WITH CHECK`, grants, as 23 colunas
  preexistentes das seis linhas legadas e os três triggers preexistentes de
  `movimentacoes_admin`;
- o artefato contém dados privados dos testes e não pode ser commitado ou
  compartilhado. Antes de qualquer uso, reconfirmar o project ref e revisar o
  SQL completo com Alf presente.
- a primeira tentativa de `20260730170000` recebeu SQL truncado pelo transporte
  e falhou dentro da transação; a checagem imediata confirmou zero objetos,
  colunas ou histórico persistidos. A nova tentativa remontou cada arquivo por
  blocos de bytes e validou tamanho e SHA-256 antes de executar;
- Bloco 2 aplicado isoladamente e conferido após cada migration:
  `20260801003710` (`20260730170000_pesquisa_evasao_fundacao_segura`),
  `20260801003807` (`20260730173000_pesquisa_evasao_claim_seguro`) e
  `20260801003851` (`20260730180100_whatsapp_caixas_credenciais_privadas`);
- hashes executados: `20260730170000` =
  `53993ECA9CD45BC5F8DEBF5E9DAB180E8FC8BAE83D21F1E8D2EE90D6BCC26B7B`,
  `20260730173000` =
  `00C6204BC18E295FDE30E2E1373155EECE3154E6C0F895ECC3795F83F23C036C`
  e `20260730180100` =
  `F863A22C9F1D8534EAF31F0A7FEDC183DDABF3902E975B620B1F5064F9C381C4`;
- os verificadores estrutural e operacional executaram em transação e
  terminaram em `ROLLBACK`; o postflight confirmou 6/6 legados com
  `modo_teste = true`, no único número interno aprovado, e exatamente um
  template ativo `evasao_aberta` versão 1 para cada público.
- Bloco 3 publicou `enviar-pesquisa-evasao` como versão 39, estado `ACTIVE`,
  `verify_jwt = true`, bundle SHA-256
  `9f626bffce1e72b1fe01ec6f562915afed364dae7e0d6fd65e582cb26b894609`;
- POST sem `Authorization` retornou HTTP 401 com
  `UNAUTHORIZED_NO_AUTH_HEADER`; bearer inválido retornou HTTP 401 com
  `UNAUTHORIZED_INVALID_JWT_FORMAT`. O pós-check permaneceu com zero previews,
  zero envios `enviando/incerto`, seis pesquisas no total e 6/6 legados como
  teste. Nenhuma mensagem foi disparada nesses testes negativos.

### Backfill controlado dos contatos de julho/2026

O teste manual do Bloco 3 foi aprovado por Alf: a prévia exibiu destinatário
mascarado e a mensagem exata, a assinatura veio do login (`Luciano`), o envio
chegou somente ao número interno e o registro ficou marcado como teste.

A regra original de não fazer backfill do telefone produtivo foi flexibilizada
somente para as saídas de julho/2026 por decisão explícita de Alf. A
justificativa é o contato recente, haver baixa probabilidade de troca em 30
dias e existir necessidade operacional de entregar uma fila utilizável à
equipe em agosto. O histórico anterior a `2026-07-01` permanece intocado e
bloqueado quando não possui snapshot.

O primeiro preflight somente leitura encontrou 37 saídas canônicas em julho:
uma já possuía snapshot e 23 tinham `whatsapp` ou `telefone` no cadastro do
aluno. A primeira migration versionada congelou os 23 IDs aprovados, repetiu
todos os filtros de negócio e marcou os valores recuperados em
`telefone_snapshot_origem` como `cadastro_atual_backfill_2026_07`.

A conclusão anterior de que as outras 13 saídas não possuíam contato estava
errada: 12 são alunos menores e possuem contato em
`alunos.responsavel_telefone`. O segundo preflight somente leitura confirmou
exatamente 12 snapshots vazios recuperáveis, todos com nome de responsável,
data de nascimento e idade inferior a 18 anos na data da saída.

Decisão permanente de Alf: para aluno menor de idade, o destinatário é sempre o
responsável. A prévia e o envio usam `responsavel_nome`,
`responsavel_telefone` e o template `responsavel`; nunca há fallback para o
telefone próprio do menor. Se nome ou telefone do responsável estiver ausente
ou inválido, o envio fica bloqueado com motivo explícito. Se um snapshot real
divergir do contato atual, ele é sinalizado e preservado; somente snapshots de
origem `cadastro_atual_backfill_2026_07` podem ser substituídos pelo responsável.

O preflight canônico também identificou quatro snapshots do primeiro backfill
que pertenciam ao próprio menor e diferiam do responsável: movimentações
`3305`, `3311`, `3334` e `3367`. A migration complementar substitui somente
essas quatro linhas e registra `cadastro_responsavel_backfill_2026_07`, além de
preencher as 12 linhas vazias com a mesma origem.

A movimentação `3312`, Pedro Gabriel Michel Oliveira, de 02/07/2026, estava com
`aluno_id` nulo e foi
confirmada por Alf como o aluno `1532`, Pedro Gabriel Michel oliveira,
`emusys_student_id = 3460`, Campo Grande. A diferença era apenas a caixa do
"o" em Oliveira. O preflight confirmou que o aluno 1532 não está ligado a outra
saída válida de julho. A mesma migration vincula `3312 → 1532`, usa o telefone
do responsável Matheus e registra a origem própria
`cadastro_responsavel_vinculo_manual_alf_2026_08`.

O fechamento de julho está completo e conferido: 217 movimentações, 32
cancelamentos e 5 não renovações, totalizando as 37 saídas observadas no banco.
A concentração das datas na primeira semana é efeito do ciclo de renovação.

A migration foi aplicada em produção como
`20260801013339_pesquisa_evasao_backfill_telefone_julho_2026`. O postflight
confirmou 23 linhas com origem `cadastro_atual_backfill_2026_07`, 24 saídas de
julho com snapshot no total (as 23 recuperadas mais a original), zero elegíveis
restantes com contato atual, 13 sem contato e zero linhas anteriores a
`2026-07-01` marcadas pelo backfill. A observação antiga de "13 sem contato"
não representa falta de cadastro: 12 têm telefone do responsável e uma era a
movimentação 3312 sem vínculo, agora identificada de forma determinística.

Preflight final antes da migration complementar, somente leitura:

- 12 snapshots vazios a preencher com telefone do responsável;
- 4 snapshots do primeiro backfill a substituir pela regra menor → responsável;
- 1 vínculo manual confirmado (`3312 → 1532`) com telefone do responsável;
- após simulação puramente relacional: 33 saídas de julho aptas e 4 bloqueadas,
  todas por `motivo_nao_catalogado` (`3221`, `3298`, `3300`, `3361`).

O desbloqueio dessas quatro saídas é exclusivamente administrativo: a equipe
deve catalogar o motivo da saída no cadastro. Não existe fallback nem
forçamento em código para contornar `motivo_nao_catalogado`.

Essas contagens devem ser reconfirmadas imediatamente antes da aplicação. A
migration falha fechada se qualquer um dos três conjuntos divergir.

### Backfill controlado dos contatos de agosto/2026

O diagnóstico de 01/08/2026 confirmou uma janela entre o trigger original,
que capturava somente `whatsapp` ou `telefone` do próprio aluno, e a correção
aplicada às `13:04:36`, que passou a capturar `responsavel_telefone` quando o
aluno era menor na data da saída. Dez saídas de menores foram lançadas nessa
janela com o cadastro do responsável completo, mas nasceram sem
`telefone_snapshot`. O backfill de julho era deliberadamente limitado a
`data >= 2026-07-01` dentro da competência de julho e, portanto, não alcançou
essas saídas de agosto.

O preflight somente leitura encontrou exatamente as movimentações `3473`,
`3475`, `3476`, `3477`, `3480`, `3483`, `3484`, `3485`, `3486` e `3488`.
A migration de agosto falha fechada se a contagem ou os IDs mudarem, nunca
sobrescreve snapshot existente, não toca julho e grava a origem
`cadastro_responsavel_backfill_2026_08` para deixar explícito que o valor veio
do cadastro atual do responsável.

O trigger vigente já cobre corretamente novas saídas de menores: calcula a
idade usando `coalesce(new.data, current_date)` e grava exclusivamente
`alunos.responsavel_telefone`. Para adultos, continua usando o contato próprio.
Assim, novas saídas de menores com responsável cadastrado não dependem de um
terceiro backfill em setembro.

Na fila, snapshot ausente passa a ser distinguido de divergência real. O rótulo
`Contato da saída não registrado` descreve a falha técnica sem orientar a
equipe a corrigir um cadastro de aluno que já está completo.

A migration foi aplicada em produção como
`20260801172237_pesquisa_evasao_backfill_telefone_responsavel_agosto_2026`.
O transporte foi conferido antes da execução (4.241 bytes; SHA-256
`94af2cf9aaf3ddc62d3e4990be1d664ce541dbea62bae9f8d1918845481baf92`).
O postflight confirmou 10/10 snapshots preenchidos nos IDs esperados, nenhuma
linha anterior a agosto marcada, nenhum ID inesperado e zero saída de menor
ainda recuperável pelo contato do responsável. A fila de agosto ficou com 13
saídas aptas, cinco bloqueadas por `motivo_nao_catalogado` e duas adultas
bloqueadas por `sem_telefone`.

### Evidência do Bloco 4

O registro do envio manual de teste `87bda8e9-b021-4c91-8070-c63cf65778c6`
foi auditado somente por leitura. O operador é `Luciano Alf` (`usuarios.id = 2`)
e o `auth_user_id` gravado confere com o cadastro ativo. A assinatura `Luciano`
veio do fallback do primeiro nome do login, sem override. O registro está em
modo teste, status `enviado`, caixa 3 (`Lia - Sucesso do Aluno`), destino
mascarado `***8047`, template `evasao_aberta`/`responsavel` versão 1 e sem erro
sanitizado. O texto final tem 346 caracteres, hash SHA-256
`90e549a0c8b79b69392c1923eaa3ce462dc1260c5b41da7bc7788e4043e8e7bf`, não
contém placeholders e é idêntico ao texto da prévia consumida. Preview,
template, caixa, operador, destino, idempotency key e provider message ID
conferem; há exatamente uma pesquisa para a idempotency key.

O primeiro smoke das telas de atendimento foi interrompido no primeiro
consumidor pelo critério de parada então vigente. No baseline da `main`, o
Pré-Atendimento → Conversas exibia
`WhatsApp desconectado — Lia - Sucesso do Aluno • Caixa undefined não
encontrada`. Na prévia do PR, a mesma tela exibiu `WhatsApp desconectado • Caixa
undefined não encontrada`, sem o nome da caixa.

Após revisão do plano, esse resultado foi reclassificado como efeito esperado
da ordem antiga, não como regressão do PR: `20260730180100` já havia bloqueado a
leitura direta de `whatsapp_caixas`, enquanto o frontend publicado continuava
sendo o da `main`. A consulta legada recebeu zero linhas; por isso o nome sumiu.
Essa janela degrada também qualquer outro consumidor ainda publicado que leia a
tabela diretamente, inclusive o NovaConversaModal. A saída aprovada é publicar
o frontend do PR, que usa `listar_whatsapp_caixas_seguras`, e só então repetir o
smoke completo. Nenhuma conversa nova foi enviada no smoke anterior.

### Retorno da pesquisa — correção de estado atual

Em 01/08/2026, Alf informou que `webhook-whatsapp-inbox` continuava sem o
redeploy da correção. Essa verificação operacional mais recente substitui, para
fins de aceite, a anotação anterior de versão 76 e do teste ponta a ponta. O
código da branch contém o contrato correto, mas código local não comprova o
runtime.

Enquanto o gate estiver aberto, a operação real permanece bloqueada porque o
webhook produtivo pode não preencher `resposta_status` e ainda pode conter o
fallback global “Tentativa 2”, capaz de associar uma mensagem à pesquisa de
outra família. O webhook corrigido deve entrar e ser revalidado antes de
qualquer rollout da Prosódia V2.

### Registro histórico do ensaio anterior — não vale como aceite atual

Uma auditoria posterior ao primeiro encerramento confirmou que o rollout havia
publicado somente `enviar-pesquisa-evasao`; o `webhook-whatsapp-inbox` ativo
ainda era a versão 75. Antes de liberar a operação para Fabi e Jessica, o fluxo
de entrada foi tratado como gate bloqueador.

O código que havia sido registrado como versão 76 do webhook:

- grava simultaneamente o legado `status = 'respondido'` e o contrato novo
  `resposta_status = 'pronta_para_revisao'`;
- associa a resposta exclusivamente pelo telefone e pela caixa da conversa
  ativa; o fallback temporário que escolhia qualquer conversa aguardando
  resposta foi removido;
- remove a consulta global de estado usada somente para debug;
- deixa de persistir o payload integral em `webhook_debug_log`;
- preserva os fluxos de inbox administrativa, CRM/Mila, status, reação, edição
  e o encaminhamento de `buttonOrListid` para `processar-resposta-pesquisa`.

O primeiro ensaio real revelou um segundo bloqueio: o modo teste entregava a
mensagem ao número interno, mas não criava `conversa_estado_whatsapp`, pois a
abertura da janela estava condicionada a `modo_teste = false`. O contrato foi
corrigido para abrir a janela sempre que o provedor confirmar `enviado`,
mantendo o destino controlado pelo número interno. `enviar-pesquisa-evasao` foi
publicada como versão 41, com `verify_jwt = true`.

Gate 0 repetido e aprovado em produção em 01/08/2026, com o runtime da versão 77:

- resposta em texto gravada na pesquisa exata, com legado preservado e
  `resposta_status = 'pronta_para_revisao'`;
- resposta em áudio gravada na mesma pesquisa, com arquivo e transcrição;
- mensagem enviada por outro número não alterou nenhuma pesquisa aberta;
- nenhuma outra pesquisa foi marcada como respondida no intervalo;
- o fallback global “Tentativa 2” ficou comprovadamente fora do runtime;
- o payload integral deixou de ser acrescentado a `webhook_debug_log`.

O card produtivo **Respondidos** não deve incrementar nesse teste: a função de
estatísticas exclui deliberadamente `modo_teste = true`. A prova do retorno de
teste é feita pelo histórico marcado como TESTE e pelo registro de auditoria;
respostas produtivas passam a alimentar o card pelo novo `resposta_status`.

Gate 1 aprovado em produção em 01/08/2026:

- `enviar-pesquisa-evasao` versão 42, `ACTIVE`, com `verify_jwt = true`;
- request anônima e bearer inválido rejeitados com HTTP 401;
- 72 testes Deno aprovados e `deno check` sem erro antes do deploy;
- V1 permaneceu ativa, com exatamente um template ativo para `direto` e um para
  `responsavel`, ambos na versão 1;
- prévia `cac3d307-628f-4022-8809-84a6f5fbb6cc` criada em modo teste para o
  responsável de Davi Pedro Palmerini, com destino `***8047`, assinatura
  `Luciano`, template V1 e nenhum placeholder residual;
- a prévia foi cancelada na interface, permaneceu não consumida e não criou
  registro em `pesquisa_evasao`; nenhuma mensagem foi enviada.

### Risco independente do rollout: continuidade do banco

PITR está desativado em `ouqwbbermlzqqvtqwlul` e, no pré-flight, o backup
físico mais recente tinha aproximadamente 42 horas. Esse é um risco permanente
do negócio, fora do escopo do PR #16 e deste rollout. Abrir tratamento próprio
de continuidade/recuperação depois da janela; não considerar o backup antigo
como reversão operacional destas migrations.

Com Alf presente:

1. reconfirmar `ouqwbbermlzqqvtqwlul` por duas fontes independentes;
2. registrar commit e diff aprovados;
3. confirmar backup/PITR e janela de rollback;
4. confirmar que o número de teste é `5521981278047`;
5. confirmar que não haverá merge antes das migrations;
6. verificar o hash da migration de caixas;
7. consultar, sem escrever, a contagem dos seis IDs legados;
8. conferir os templates ativos com a consulta abaixo;
9. confirmar que a Edge ainda publicada está protegida ou suspender o disparo até o novo deploy.

Consulta prévia dos legados:

```sql
select id, modo_teste, aluno_telefone, created_at
from public.pesquisa_evasao
where id in (
  '5edc499f-4a91-4ebb-a291-0f052bc16351',
  '416624a9-2d74-4c26-a083-c6aadba21bf2',
  '718fa72e-ca51-4995-960f-575bb00c2b0e',
  '1b918f39-c528-431d-9d7d-3d9160982e6a',
  '61ebbbd0-a8e8-4e77-99ee-d4ff9bcc6f03',
  '147a6632-fccb-4089-9ae0-13db822d7bf9'
)
order by id;
```

Se a contagem não for seis, parar. A migration falha fechada em banco não vazio.

Consulta obrigatória dos templates:

```sql
select
  publico,
  count(*) as ativos,
  min(chave) as chave,
  min(versao) as versao
from public.pesquisa_evasao_templates
where ativo = true
group by publico
order by publico;
```

O resultado precisa ter somente `direto = 1` e `responsavel = 1`, ambos na chave `evasao_aberta`, versão 1. Qualquer ausência, duplicidade ou público adicional interrompe o rollout.

## 9. Ordem de rollout em produção — registro histórico do Plano A

Bloco 5 autorizado por Alf no rollout original. Merge/deploy do frontend:
AUTORIZADO naquele rollout. Essa autorização histórica não alcança a Prosódia
V2, cujo rollout permanece não autorizado.

Somente após autorização explícita:

1. aplicar `20260730170000`;
2. aplicar `20260730173000`;
3. aplicar `20260730180100`;
4. rodar o verificador estrutural e o operacional em transação;
5. conferir o backfill dos seis testes;
6. antes do smoke, confirmar exatamente um template ativo para `direto` e um para `responsavel`;
7. publicar `enviar-pesquisa-evasao` com `verify_jwt = true`;
8. confirmar que chamada anônima e JWT inválido recebem rejeição;
9. fazer prévia em modo teste com uma pessoa interna ativa;
10. confirmar que a prévia renderiza os placeholders sem sobrar `{{` ou `}}` no texto final;
11. confirmar o envio somente para `5521981278047`;
12. comparar a mensagem aprovada com a recebida;
13. validar que o registro contém usuário, auth UID, assinatura, texto, template, caixa, destino, modo e horários;
14. liberar merge do PR #16 e aguardar a Vercel concluir o deploy do frontend;
15. somente depois do deploy, realizar o smoke comparativo dos consumidores de caixas descrito no baseline: Pré-Atendimento, Caixa de Entrada do Sucesso do Aluno, CaixasManager e NovaConversaModal;
16. confirmar nome e seleção da caixa, precedência da caixa da unidade sobre a global e ausência de campos de token preenchidos;
17. publicar `webhook-whatsapp-inbox` com a versão revisada;
18. confirmar que o webhook grava `resposta_status`, não usa fallback global e não persiste payload em `webhook_debug_log`;
19. executar o retorno ponta a ponta no número interno: envio em modo teste, resposta em texto e associação à pesquisa exata;
20. confirmar que nenhuma outra pesquisa foi alterada e que o debug log não cresceu;
21. observar logs, estados incertos e duplicidade durante a janela combinada;
22. somente então liberar Fabi e Jessica para a operação.

### 9.1 Ordem obrigatória do rollout da Prosódia V2

O rollout da Prosódia V2 exige autorização nova, com Alf presente, e não pode
reutilizar automaticamente o aceite histórico acima.

Pré-flight de impacto informado e verificado por Alf em 01/08/2026:

- fonte canônica: uma saída por `movimentacoes_admin.id`, com idade calculada a
  partir de `alunos.data_nascimento`;
- 57 saídas desde 01/07/2026;
- 45 alunos menores e 12 adultos;
- zero alunos sem `data_nascimento`.

Logo, o bloqueio novo por data ausente não bloqueia nenhuma linha da fila
atual. Essa evidência deve ser reconfirmada no rollout se o conjunto tiver
mudado.

Sequência obrigatória:

1. reconfirmar o project ref e obter autorização do bloco;
2. publicar primeiro `webhook-whatsapp-inbox` com a correção já presente no
   código local;
3. testar de ponta a ponta no número interno: envio em modo teste, resposta em
   texto, `resposta_status = 'pronta_para_revisao'`, associação à pesquisa
   exata, nenhuma outra pesquisa alterada e nenhum novo payload integral no
   debug log;
4. reportar e parar; sem aprovação explícita desse retorno, não iniciar a V2;
5. validar a migration V2 em ensaio DDL descartável contra o schema produtivo
   corrente;
6. publicar a Edge `enviar-pesquisa-evasao` retrocompatível, com
   `verify_jwt = true`, mantendo V1 ativa;
7. provar que uma preview V1 ainda é criada e pode ser cancelada sem envio;
8. aplicar `20260801143000_pesquisa_evasao_prosodia_v2.sql`, que ativa um
   template V2 por público e atualiza a RPC da fila;
9. conferir exatamente um template ativo para `direto` e um para
   `responsavel`, ambos na versão 2;
10. publicar o frontend com o novo motivo de bloqueio;
11. fazer smoke sem envio para um responsável e um adulto, conferindo texto,
    telefone mascarado, formatação e ausência de separador;
12. monitorar e registrar as evidências.

O fallback neutro (`de Nome`) é esperado para a maioria dos nomes fora do
dicionário curto. Por exemplo, `a experiência de Larissa` é aceitável e não
aciona rollback. Aumentar a cobertura é item próprio posterior.

## 10. Checklist operacional

### Autenticação

- [ ] request sem `Authorization` não envia;
- [ ] bearer inválido não envia;
- [ ] JWT válido sem usuário interno ativo não envia;
- [ ] usuário interno ativo consegue listar consolidado;
- [ ] filtro de unidade altera somente o conjunto exibido.

### Assinatura

- [ ] pessoa sem override recebe o primeiro nome do cadastro;
- [ ] pessoa com override recebe o nome configurado;
- [ ] a identidade auditada não muda com o override;
- [ ] campos forjados pelo navegador são rejeitados.

### Templates

- [ ] existe exatamente um template ativo para `direto`;
- [ ] existe exatamente um template ativo para `responsavel`;
- [ ] ambos usam a chave `evasao_aberta`, versão 1, e as cópias aprovadas;
- [ ] a prévia renderiza aluno, responsável quando aplicável e assinatura;
- [ ] não sobra `{{` nem `}}` no texto final;
- [ ] `service_role` continua sem `INSERT`, `UPDATE` ou `DELETE` nas tabelas de configuração.

### Prévia e envio

- [ ] destinatário e mensagem aparecem antes do clique irreversível;
- [ ] confirmação de outra sessão/usuário é rejeitada;
- [ ] clique duplo não dispara duas vezes;
- [ ] telefone produtivo vem do snapshot;
- [ ] modo teste usa somente o número interno;
- [ ] resultado ambíguo fica `incerto` e não é reenviado automaticamente.

### Dados

- [ ] os seis legados estão com `modo_teste = true`;
- [ ] aparecem marcados como `TESTE`;
- [ ] não entram em estatísticas;
- [ ] auditoria contém usuário, mensagem renderizada, template, caixa e horário.

### Retorno

- [ ] resposta atualiza `status = 'respondido'` e `resposta_status = 'pronta_para_revisao'`;
- [ ] resposta é vinculada somente à conversa ativa da mesma caixa e telefone;
- [ ] não existe fallback para outra pesquisa aberta;
- [ ] modo teste abre estado de resposta somente para o número interno;
- [ ] payload integral não é persistido em `webhook_debug_log`;
- [ ] fluxos administrativos, CRM, status, reação, edição e pós-1ª aula permanecem roteados;

### Prosódia V2

- [ ] pré-flight reconfirma a distribuição por idade e as datas ausentes;
- [ ] webhook seguro foi publicado e revalidado antes da V2;
- [ ] V1 continua funcionando antes da ativação da migration;
- [ ] existe exatamente um template V2 ativo por público após a migration;
- [ ] menor usa responsável, telefone do responsável e template `responsavel`;
- [ ] adulto usa o próprio nome e template `direto`;
- [ ] pergunta usa citação e negrito, pedido de sinceridade usa itálico e não há
  separador;
- [ ] nome fora do dicionário usa fallback neutro sem bloquear;
- [ ] data ausente ou inválida bloqueia sem cair para público adulto;

### Caixas

- [ ] `authenticated` não lê `uazapi_token` nem `waha_api_key`;
- [ ] Pré-Atendimento lista caixas;
- [ ] CaixasManager lista e seleciona a caixa correta;
- [ ] NovaConversaModal abre conversa nova;
- [ ] nenhum campo de token aparece preenchido em CaixasManager ou NovaConversaModal;
- [ ] caixa da unidade tem precedência sobre a global;
- [ ] Pré-Atendimento não apresenta erro diferente do baseline preexistente;
- [ ] Caixa de Entrada do Sucesso do Aluno continua sem erro de caixa;
- [ ] Edge Functions por service role continuam funcionando.

## 11. Rollback operacional

Se uma migration falhar, interromper a sequência e não publicar Edge/frontend. Não tentar consertar produção manualmente durante a janela.

Se a Edge falhar antes do provedor:

- não marcar como enviado;
- preservar preview e erro sanitizado;
- corrigir fora da produção e repetir somente após nova autorização.

Se o provedor aceitar e a persistência ficar ambígua:

- manter `incerto`;
- não reenviar automaticamente;
- reconciliar por provider message ID, caixa, telefone e horário.

Se o frontend for publicado fora de ordem:

- interromper o deploy;
- restaurar a versão anterior do frontend;
- não afrouxar JWT, RLS ou grants para fazer a tela funcionar.

## 12. Evidência final a preencher

| Evidência | Resultado |
|---|---|
| Commit aprovado | `da27571e7c5c72de088e059eb5e5022e49c1554f` |
| Project ref reconfirmado | APROVADO — `ouqwbbermlzqqvtqwlul`, duas fontes independentes |
| Backup/PITR | Backup físico concluído em 30/07 03:15 BRT; PITR desativado; risco aceito por Alf |
| Rollback cirúrgico local | `pesquisa-evasao-subprojeto-a-rollback-producao.sql.local` — SHA-256 `AF34440C22F71D9636D220A557F74A290295CEF3130CB1DCBD08DD86CA2B43DC` |
| Novo ensaio DDL do diff final | APROVADO em `didpawhgvkarzntvktzu`, depois destruído |
| Hash de `20260730180100` | APROVADO — `F863A22C9F1D8534EAF31F0A7FEDC183DDABF3902E975B620B1F5064F9C381C4` |
| 1 template ativo por público | APROVADO — `direto = 1`, `responsavel = 1`, chave `evasao_aberta`, versão 1 |
| Prévia sem placeholders residuais | APROVADO — texto final idêntico à prévia, sem `{{ }}` |
| Migrations aplicadas | APROVADO — versões remotas `20260801003710`, `20260801003807`, `20260801003851` |
| Verificadores em rollback | APROVADO — estrutural e operacional |
| 6/6 legados como teste | APROVADO — mesmo número interno confirmado |
| Edge com JWT | APROVADO — `enviar-pesquisa-evasao` versão 42 ativa e retrocompatível V1/V2, `verify_jwt = true`; anônimo e JWT inválido retornam 401 |
| Backfill de telefone de julho/2026 | APROVADO — migration remota `20260801013339`; 23 recuperados e 24 snapshots no total; o diagnóstico posterior identificou 12 contatos de responsável ainda elegíveis e uma movimentação sem vínculo |
| Backfill do telefone do responsável | APROVADO — migration remota `20260801130436`; 12 snapshots vazios preenchidos, 4 snapshots de menores substituídos pela regra do responsável e movimentação `3312` vinculada ao aluno `1532` |
| Backfill do responsável em agosto/2026 | APROVADO — migration remota `20260801172237`; 10/10 snapshots preenchidos nos IDs esperados, nenhuma linha de julho alterada e zero candidato recuperável restante |
| Smoke no número interno | APROVADO — mensagem entregue somente em `***8047`, modo teste |
| Auditoria completa | APROVADO — operador/Auth, assinatura, texto, template, caixa, destino, horários, preview, idempotência e provedor conferidos |
| Fila de julho/2026 | APROVADO — 37 saídas, 33 aptas com ação `Enviar` e 4 bloqueadas exclusivamente por `motivo_nao_catalogado` (`3221`, `3298`, `3300`, `3361`) |
| Prévia de menor | APROVADO — evasão `3400` mostrou o nome e o telefone mascarado da responsável; snapshot persistido com destinatário e template `responsavel`; prévia cancelada sem envio |
| Smoke das telas de atendimento | APROVADO NO ESCOPO — Caixa de Entrada do Sucesso do Aluno permaneceu operacional; Pré-Atendimento continua fora deste aceite por decisão de Alf |
| Merge/deploy do frontend | APROVADO — PR #19, merge `351bd1ade991510dd6a6cd56f811ae33e4a6b1ef`, Vercel produção `dpl_9aoQbKGD2jtrHwfGmC6aPZmLaP7R` pronta |
| Webhook inbound | APROVADO — versão 77 ativa, sem fallback global e sem gravação do payload integral; mensagem de número alheio não alterou pesquisa aberta |
| Retorno ponta a ponta | APROVADO — texto e áudio associados à pesquisa de teste exata; áudio com arquivo e transcrição; `resposta_status = 'pronta_para_revisao'` |
| Indicador de respostas | APROVADO NO MODO TESTE — resposta preenche o contrato novo e o card produtivo não incrementa, como previsto; o primeiro envio real validará o card produtivo |
| Fila de agosto/2026 | 13 aptas; 5 bloqueadas por `motivo_nao_catalogado`; 2 adultas bloqueadas por `sem_telefone` |
| Pré-flight de idade da Prosódia V2 | APROVADO PARA O CONJUNTO VERIFICADO — 57 saídas desde 01/07/2026, 45 menores, 12 adultos e zero sem `data_nascimento` |
| Prosódia V2 | GATE 1 APROVADO — Edge versão 42 publicada; prévia V1 criada e cancelada sem envio; Gate 2 aguarda autorização explícita |
| Código alinhado com produção | APROVADO — PR #21, merge `6a7411de06ce1d42af7db23d004d61ec9e8bdb4f` |
