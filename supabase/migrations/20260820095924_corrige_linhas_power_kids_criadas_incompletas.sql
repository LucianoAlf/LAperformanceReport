-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrige as 2 linhas de Power Kids que EU criei em 19/08 (migration
-- 20260819_cria_matriculas_power_kids_ausentes_do_emusys) sem data de nascimento e sem
-- status de pagamento — e que por isso geraram divergência nova no sync da madrugada.
-- Erro meu: criei a matrícula com o mínimo e não com o que o Emusys já tinha no payload.

-- 1) data_nascimento a partir do payload do Emusys
update alunos a
   set data_nascimento = (
         select (jsonb_path_query_first(e.payload_snapshot,'$.aluno.data_nascimento'))#>>'{}'
         from emusys_matriculas_estado_atual e
         where e.emusys_matricula_id::text = a.emusys_matricula_id
           and e.unidade_id = a.unidade_id
           and jsonb_path_query_first(e.payload_snapshot,'$.aluno.data_nascimento') is not null
         order by e.sincronizado_em desc limit 1
       )::date,
       updated_at = now()
 where a.emusys_matricula_id in ('1765','2128')
   and a.data_nascimento is null;

-- 2) atividade extra não emite parcela: o status financeiro correto e 'sem_parcela',
--    que e exatamente o que o Emusys devolve para esses contratos.
update alunos a
   set status_pagamento = 'sem_parcela', updated_at = now()
  from cursos c
 where c.id = a.curso_id
   and c.is_projeto_banda is true
   and a.status = 'ativo'
   and coalesce(a.valor_parcela,0) = 0
   and a.status_pagamento is distinct from 'sem_parcela'
   and not exists (select 1 from matriculas_campos_fixados f
                    where f.aluno_id = a.id and f.campo = 'status_pagamento');

-- 3) Emusys manda no status financeiro (regra do Alf, 18/08). Aplica as divergencias
--    reais que sobraram — Erica Batista de Castro e Isabela Correa Pena, na Barra, estao
--    'inadimplente' aqui e 'em_dia' no Emusys.
with alvo as (
  select d.id, d.aluno_id, btrim(d.valor_emusys->>'status_pagamento') as novo
  from alunos_emusys_atributos_divergencias d
  where d.tipo_divergencia = 'status_financeiro_divergente'
    and coalesce(d.resolvido,false) = false
    and nullif(btrim(d.valor_emusys->>'status_pagamento'),'') is not null
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = d.aluno_id and f.campo = 'status_pagamento')
),
aplicado as (
  update alunos a set status_pagamento = alvo.novo, updated_at = now()
  from alvo where a.id = alvo.aluno_id
  returning alvo.id
)
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260820', decidido_em = now(), updated_at = now()
 where d.id in (select id from aplicado);

-- 4) fecha as divergencias de data de nascimento que o passo 1 resolveu
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260820', decidido_em = now(), updated_at = now()
  from alunos a
 where a.id = d.aluno_id
   and d.tipo_divergencia = 'data_nascimento_divergente'
   and coalesce(d.resolvido,false) = false
   and a.data_nascimento is not null
   and a.data_nascimento::text = btrim(d.valor_emusys->>'data_nascimento');
