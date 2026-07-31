# Pesquisa de evasão — runbook do Subprojeto A

**Status:** PR #16 em draft. Não aplicar, não fazer merge e não publicar sem Alf presente e autorização explícita.

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
- o PR permanece draft e não pode ser mergeado antecipadamente.

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
- esse smoke ocorre dentro da janela de rollout, após as migrations e antes da liberação do merge do frontend, pois os contratos seguros ainda não existem em produção.

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

Edge e frontend:

- `supabase/functions/enviar-pesquisa-evasao/`;
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

As duas conversas antigas de Campo Grande sem `caixa_id` continuam como item
independente, sem correção neste rollout, conforme
[`2026-07-31-pre-atendimento-caixa-undefined.md`](../auditorias/2026-07-31-pre-atendimento-caixa-undefined.md).

## 8. Pré-flight de produção

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

## 9. Ordem de rollout em produção

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
14. ainda na janela, realizar o smoke comparativo dos consumidores de caixas descrito no baseline: Pré-Atendimento, Caixa de Entrada do Sucesso do Aluno, CaixasManager e NovaConversaModal;
15. somente então liberar merge/deploy do frontend;
16. observar logs, estados incertos e duplicidade durante a janela combinada.

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
| Commit aprovado | PENDENTE |
| Project ref reconfirmado | PENDENTE |
| Novo ensaio DDL do diff final | APROVADO em `didpawhgvkarzntvktzu`, depois destruído |
| Hash de `20260730180100` | APROVADO — `F863A22C9F1D8534EAF31F0A7FEDC183DDABF3902E975B620B1F5064F9C381C4` |
| 1 template ativo por público | PENDENTE |
| Prévia sem placeholders residuais | PENDENTE |
| Migrations aplicadas | PENDENTE |
| Verificadores em rollback | PENDENTE |
| 6/6 legados como teste | PENDENTE |
| Edge com JWT | PENDENTE |
| Smoke no número interno | PENDENTE |
| Auditoria completa | PENDENTE |
| Smoke das telas de atendimento | PENDENTE |
| Merge/deploy do frontend | BLOQUEADO até os itens anteriores |
