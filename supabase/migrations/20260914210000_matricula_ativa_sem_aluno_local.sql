-- 🔴 O PROBLEMA (medido em 14/09/2026): matrícula ATIVA no Emusys sem linha em `alunos`
-- não acusava em lugar nenhum.
--
-- Caso que revelou: Lara Boldrine Lima dos Santos (Barra, matrícula 870, aluna desde
-- 08/09/2026). O webhook `matricula_nova` chegou e foi processado, mas o INSERT em `alunos`
-- foi revertido por exceção num AFTER trigger (`sync_aluno_to_leads` com `origem_registro`
-- fora de ordem — corrigido em `20260908215238`). A edge não lia o `error` do supabase-js,
-- então gravou `acao='inserido'`, `status='ok'`, `aluno_id: null`, e respondeu 200 ao n8n.
--
-- O `sync-matriculas-emusys` VIU a matrícula todos os dias — `emusys_matriculas_estado_atual`
-- tinha a linha `status_emusys='ativa'` com `aluno_id = NULL` — mas ele só VINCULA aluno que
-- já existe, nunca cria. E não gera divergência na Conciliação: `ausente_api` é o caso
-- inverso (temos aluno, o Emusys não tem matrícula). A aluna ficou 6 dias fora do LA Report
-- e só apareceu porque alguém foi procurá-la à mão.
--
-- Esta view é o predicado canônico dessa pergunta. Não reimplementar em consumidor novo —
-- duas fontes para a mesma regra é a causa-raiz documentada das duplicatas de renovação.
--
-- ⚠️ `security_invoker = false` (roda como o dono) porque `emusys_matriculas_estado_atual`
-- tem RLS com policy só para `service_role`; com invoker a view devolveria zero linhas para
-- todo usuário do app. O escopo por unidade fica no predicado, no mesmo formato das views da
-- aba Contratos (`vw_contratos_vencendo` etc.).
--
-- ⚠️ `auth.role()` NÃO serve aqui: conexão que só faz `SET ROLE` (service_role direto,
-- `pg_cron` como postgres) não tem claim no JWT e a view devolveria vazio justamente para
-- quem vai vigiar. Por isso `current_user`.
--
-- ⚠️ O ramo `is_admin()` vem antes do de unidade porque os admins têm vínculo global
-- (`unidade_id NULL`) e `get_user_unidade_ids()` devolve vazio para eles.

create or replace view public.vw_matriculas_ativas_sem_aluno_local
with (security_invoker = false) as
select
  e.unidade_id,
  u.nome                                                   as unidade,
  e.emusys_matricula_id,
  e.emusys_aluno_id,
  e.payload_snapshot -> 'aluno'  ->> 'nome'                as aluno_nome,
  e.payload_snapshot             ->> 'data_matricula'      as data_matricula,
  (e.payload_snapshot -> 'contrato_atual' -> 'disciplinas' -> 0 ->> 'nome')      as curso_emusys,
  (e.payload_snapshot -> 'contrato_atual' -> 'disciplinas' -> 0 ->> 'nome_professor') as professor_emusys,
  e.sincronizado_em,
  -- há quanto tempo a matrícula existe no Emusys sem existir aqui. Em dias, para a
  -- mensagem do vigia poder dizer "há N dias" em vez de só listar.
  (current_date - (e.payload_snapshot ->> 'data_matricula')::date)               as dias_sem_aluno_local
from public.emusys_matriculas_estado_atual e
join public.unidades u on u.id = e.unidade_id
where e.status_emusys = 'ativa'
  and e.aluno_id is null
  and not exists (
    select 1 from public.alunos a
    where a.unidade_id = e.unidade_id
      and a.emusys_matricula_id = e.emusys_matricula_id::text
  )
  and (
    (select current_user) in ('service_role', 'postgres')
    or (select public.is_admin())
    or e.unidade_id in (select public.get_user_unidade_ids())
  );

comment on view public.vw_matriculas_ativas_sem_aluno_local is
  'Matrícula ATIVA no Emusys que não tem linha correspondente em `alunos` — aluno que existe na escola e não existe no LA Report. Linha aqui é sempre defeito: ou o webhook `matricula_nova` falhou ao gravar, ou o aluno foi apagado sem a matrícula ser encerrada na origem. Deve ficar em ZERO. Nasceu do caso Lara Boldrine/Barra (matrícula 870, 08/09/2026), em que o INSERT foi revertido por um AFTER trigger e nada acusou por 6 dias. Ver migration 20260914210000.';

-- ⚠️ `ALTER DEFAULT PRIVILEGES` neste schema dá TODOS os privilégios a `authenticated` em
-- relação nova — inclusive em view. `grant select` depois não tira o resto. Por isso o
-- revoke nominal vem primeiro (mesma armadilha registrada no CLAUDE.md para
-- `vw_disciplinas_modalidade`).
--
-- ⚠️ Os papéis dos agentes (`mila_acesso_restrito`, `fabio_agent`, `lia_acesso_restrito`)
-- também ganham leitura por default privileges. Esta view é diagnóstico de integração, não
-- superfície de agente — e ela expõe nome de aluno. Revoke nominal também neles: o padrão é
-- conceder quando alguém precisar, não deixar aberto porque o default abriu.
revoke all on public.vw_matriculas_ativas_sem_aluno_local
  from public, anon, authenticated, mila_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant select on public.vw_matriculas_ativas_sem_aluno_local to authenticated, service_role;
