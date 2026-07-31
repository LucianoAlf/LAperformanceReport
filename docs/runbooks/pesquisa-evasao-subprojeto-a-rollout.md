# Pesquisa de evasão — runbook do Subprojeto A

Data-base: 2026-07-30

Estado: implementação local concluída; homologação e produção ainda não executadas

Projeto de produção confirmado somente para leitura: `ouqwbbermlzqqvtqwlul`

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

## Artefatos

- Migration de fundação e RLS:
  `supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql`
- Migration de claim e resultado:
  `supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql`
- Edge:
  `supabase/functions/enviar-pesquisa-evasao`
- Verificação transacional:
  `scripts/verify-pesquisa-evasao-rls.sql`
- Tipos:
  `src/types/supabase.ts`

Os tipos foram gerados em modo somente leitura a partir do projeto confirmado
`ouqwbbermlzqqvtqwlul` em 2026-07-30 e receberam o contrato local das duas
migrations ainda não implantadas. Depois de aplicar as migrations em
homologação, regenerar os tipos contra a homologação e exigir diff sem
divergência no domínio antes de aceitar o arquivo definitivo.
Em outras palavras: tipos consultaram produção somente em leitura.

## Bloqueadores antes do rollout

### 1. Cofre das caixas de WhatsApp

Verificação somente leitura em 2026-07-30 confirmou que
`public.whatsapp_caixas` contém `uazapi_token` e `waha_api_key`,
`authenticated` possui `SELECT` e a policy `whatsapp_caixas_select` usa
`qual = true`. Portanto, qualquer usuário autenticado pode obter os tokens.

Isso é bloqueador do rollout. A correção precisa considerar os consumidores
existentes do frontend: retirar o acesso sem substituir esses consumidores
quebra fluxos fora da pesquisa de evasão. Tratar em diff separado, mover o
segredo para acesso server-only e expor ao frontend apenas projeção sem token.
Não liberar a pesquisa apenas porque a nova Edge lê a caixa pelo servidor.

### 2. Snapshots históricos de telefone

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

### 3. Público interno

`pesquisa_evasao_publicos_internos` é a fonte service-only para professor,
colaborador e outros públicos que não devem receber a pesquisa.

Popular somente com `aluno_id` confirmado individualmente, fonte verificável,
operador e evidência em `audit_metadata`. Não inferir por nome, telefone,
email, `tipo_aluno` ou categoria financeira. Os seis testes históricos e o
exemplo de Ana Beatriz não podem alimentar esse cadastro, indicadores de
professor ou encaminhamento à coordenação.

### 4. Decisões que continuam fora do Subprojeto A

O momento do disparo (`imediato` versus `D+X`) e a política de lembrete são
decisões abertas do Subprojeto C. Não introduzir regra D+3 neste rollout.

Autenticação do webhook inbound, conversa multipartes, opt-out e expurgo do
`webhook_debug_log` pertencem ao Subprojeto B. O B deve preservar
`processar-resposta-pesquisa`, inclusive a pesquisa pós-primeira aula.

### 5. Baseline local do Supabase

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
não envia” usa um terceiro usuário de homologação com permissão em apenas uma
unidade.

Antes do teste, registrar neste runbook o `usuarios.id`, email exato,
`auth_user_id`, unidade única e perfil. Ele não pode ser 29 ou 30, não pode ter
vínculo global e não pode ser identificado pelo nome.

| Campo | Valor da homologação |
|---|---|
| `usuarios.id` | PENDENTE |
| Email exato | PENDENTE |
| `auth_user_id` | PENDENTE |
| Unidade única | PENDENTE |

Enquanto esses campos estiverem pendentes, a homologação de isolamento não está
concluída.

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
npx supabase gen types typescript --local | Out-File -Encoding utf8 src/types/supabase.ts
```

O diff regenerado precisa manter as duas overloads legadas, a v2 com sete
argumentos, o histórico de testes e as RPCs de claim/resultado.

## Ordem de rollout

1. resolver o cofre de `whatsapp_caixas`;
2. revisar o diff completo e confirmar o project ref;
3. obter backup lógico/DDL das tabelas afetadas;
4. aplicar as duas migrations;
5. validar RLS estrutural;
6. atribuir os seis vínculos, as duas assinaturas e os dois templates;
7. registrar o terceiro usuário e concluir a homologação;
8. validar `scripts/verify-pesquisa-evasao-rls.sql`;
9. fazer deploy da Edge com JWT;
10. fazer deploy do frontend;
11. smoke test em modo teste;
12. um envio real autorizado;
13. monitorar falhas, estados `incerto`, volume e taxa de resposta.

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
| Project ref reconfirmado | PENDENTE |
| Migration de fundação | PENDENTE |
| Migration de claim | PENDENTE |
| Versão da Edge | PENDENTE |
| Terceiro usuário de homologação | PENDENTE |
| Saída da verificação RLS | PENDENTE |
| Smoke test em modo teste | PENDENTE |
| Envio real autorizado | PENDENTE |
| Operador e horário | PENDENTE |
