# Plano de implementação — Contrato assinado

> Implementar em `feat/contrato-assinado`, mantendo o TOM em shadow até validação humana do legado.

**Objetivo:** Persistir e reconciliar a verdade `contrato_atual.contrato_assinado` do Emusys, expô-la de forma conservadora por pessoa na RPC do TOM e mostrá-la somente leitura na Ficha do Aluno.

**Arquitetura:** Uma Edge Function dedicada busca todas as matrículas ativas de uma unidade, valida o lote inteiro e o entrega a uma RPC transacional. O banco mantém a observação por unidade/matrícula/contrato e uma trilha separada de execuções. A leitura pública exige uma execução bem-sucedida no dia civil BRT; do contrário retorna `nao_verificado`. A regra por pessoa exige todas as matrículas acadêmicas ativas assinadas e dispensa explicitamente cursos com `is_projeto_banda=true`.

## 1. Contratos testáveis da fonte e do schema

**Arquivos:**
- Criar: `supabase/functions/_shared/contrato-assinatura.ts`
- Criar: `supabase/functions/_shared/contrato-assinatura.test.ts`
- Criar: `tests/contratoAssinadoMigration.test.mjs`

1. Escrever testes que exijam validação estrita de `matricula.id`, `contrato_atual.id` e `contrato_assinado:boolean`, incluindo matrícula sem contrato e IDs iguais em unidades diferentes.
2. Escrever teste estrutural da migration: chave por unidade, índices parciais, RLS, logs, backfill sem escrita em `alunos`, RPC aditiva e cron pré-TOM.
3. Executar os testes e confirmar falha pela ausência dos artefatos.
4. Implementar somente o normalizador puro e a migration mínima para fazê-los passar.

## 2. Persistência, backfill e leitura canônica

**Arquivos:**
- Criar por `supabase migration new`: `supabase/migrations/<timestamp>_contrato_assinado_canonico.sql`
- Modificar: `supabase/migrations/<timestamp>_contrato_assinado_canonico.sql`
- Criar: `tests/contratoAssinadoRpcPostgres.test.mjs`

1. Criar `aluno_contratos_emusys` e `contrato_assinatura_sync_execucoes`, RLS fechado e privilégios mínimos.
2. Criar `registrar_contrato_assinatura_lote_v1`, exclusiva de `service_role`, que valida a execução/unidade e grava o lote atomicamente.
3. Fazer backfill idempotente de `emusys_matriculas_estado_atual.payload_snapshot`, usando `sincronizado_em` como observação e sem alterar `alunos`.
4. Recriar `get_situacao_alunos_v1` preservando `tem_data_contrato` e anexando os campos de assinatura/frescura.
5. Criar `get_contrato_assinatura_aluno_v1` para a Ficha retornar status da pessoa e da matrícula, respeitando autorização por unidade.
6. Rodar fixtures PostgreSQL para: todas assinadas, uma falsa, sem contrato, sem observação, sync velho, somente banda/coral e mesmo ID Emusys em unidades diferentes.

## 3. Reconciliação e falha auditável

**Arquivos:**
- Criar: `supabase/functions/sync-contratos-assinatura-emusys/index.ts`
- Criar: `tests/contratoAssinadoSyncContract.test.mjs`
- Modificar: `supabase/config.toml`

1. Testar contrato da Edge: token apenas na query string, `status=ativa`, `limite=50`, paginação por cursor, uma unidade por chamada, ausência de escrita no Emusys e registro de falha.
2. Implementar autenticação técnica igual aos syncs atuais, sem expor token.
3. Buscar todas as páginas antes de persistir; em erro/429 esgotado, encerrar como `failed` sem publicar lote parcial.
4. Validar todos os itens com o normalizador puro e chamar a RPC transacional uma vez.
5. Marcar a execução `succeeded` somente após a RPC concluir.
6. Configurar `verify_jwt` explicitamente em `supabase/config.toml` conforme o padrão técnico existente.

## 4. Agendamento pré-TOM

**Arquivo:** migration criada na tarefa 2.

1. Criar jobs separados por unidade às 05:00, 05:10 e 05:20 BRT.
2. Criar uma segunda tentativa condicional às 05:30, 05:40 e 05:50 BRT; a Edge encerra como `skipped_fresh` se a unidade já teve sucesso no dia.
3. Manter a frescura dependente somente de `succeeded`; cron enfileirado ou execução falha não conta como dado fresco.
4. Testar nomes, horários UTC e cabeçalhos sem incorporar segredos à migration.

## 5. Ficha do Aluno somente leitura

**Arquivos:**
- Criar: `src/lib/contratoAssinatura.ts`
- Criar: `src/hooks/useContratoAssinaturaAluno.ts`
- Criar: `src/components/App/Alunos/ContratoAssinaturaBadge.tsx`
- Modificar: `src/components/App/Alunos/ModalFichaAluno.tsx`
- Criar: `tests/contratoAssinadoFichaFrontend.test.mjs`

1. Testar o mapeamento exato dos estados e garantir que não exista controle de edição.
2. Buscar `get_contrato_assinatura_aluno_v1` quando a ficha abrir.
3. Mostrar o selo no cabeçalho junto de Instagram e Financeiro.
4. Na seção Contrato da aba Acadêmico, mostrar estado da matrícula e `Observado pelo LA Report em ...`, ambos somente leitura.
5. Inserir a frase: “Início e fim representam o período das aulas; não comprovam assinatura.”
6. Garantir estados de loading/erro como `Não verificado`, sem reaproveitar datas do período.

## 6. Documento de operação do TOM

**Arquivo:**
- Criar: `docs/operacao/contrato-assinado-tom.md`

Documentar tabela e RPC, nomes e tipos exatos, semântica e limites de cada estado, regra por pessoa, dispensa de banda/coral, frequência/frescura, falhas conhecidas da API e rollout legado em shadow.

## 7. Verificação e rollout shadow

1. Rodar testes novos serialmente e a suíte Node relevante; registrar separadamente o panic pré-existente do Deno no Windows.
2. Rodar build de produção e checagem de tipos.
3. Subir Supabase local, aplicar a migration e executar as fixtures reais da migration.
4. Aplicar migration/backfill em produção somente após a prova local.
5. Implantar a Edge, invocá-la nas três unidades e conferir páginas, contagens, sucesso, observações e frescura — sem registrar dados pessoais nos logs.
6. Implantar o frontend e validar no navegador real: selo, aba Acadêmico, console limpo e persistência após reload.
7. Não religar o recorte `contrato` do TOM. Registrar como pendentes os dois nomes confirmados pela equipe e a regra de corte do legado.
8. Fazer revisão final, commit, rebase na base remota atual e push do branch, sem misturar alterações externas.
