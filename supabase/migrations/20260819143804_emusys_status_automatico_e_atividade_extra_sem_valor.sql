-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- "Se o Emusys já entregou, por que eu tenho que lançar aqui?" — Alf, 2026-08-19.
-- Resposta: não tem que lançar. Eram dois defeitos nossos, os dois com a resposta
-- já dentro do payload do Emusys.

-- ── 1. STATUS: o Emusys já resolveu e a gente não aplicou ───────────────────
-- `emusys_matriculas_estado_atual` guarda status_local_resolvido ('ativo'/'inativo'/
-- 'evadido') e transicao_automatica. Nos 7 casos da fila, transicao_automatica = TRUE
-- (ou seja: o proprio sistema classificou sozinho, sem duvida) e mesmo assim `alunos.status`
-- ficou defasado, virando tarefa manual para a equipe.
-- Exemplos: Benjamin da Silva Barbosa e Wagner Amaral (motivo_inativa='concluida',
-- resolvido como 'inativo' desde 12/08) seguiam contando como ALUNO ATIVO.
-- ⚠️ So aplica quando transicao_automatica = true. Transicao ambigua continua humana.
with alvo as (
  select distinct on (a.id)
         a.id as aluno_id, a.status as status_atual, e.status_local_resolvido as status_novo
  from alunos a
  join emusys_matriculas_estado_atual e
    on e.emusys_matricula_id::text = a.emusys_matricula_id
   and e.unidade_id = a.unidade_id
  where e.transicao_automatica is true
    and e.status_local_resolvido is not null
    and a.status is distinct from e.status_local_resolvido
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = a.id and f.campo = 'status')
  order by a.id, e.sincronizado_em desc
)
update alunos a
   set status = alvo.status_novo, updated_at = now()
  from alvo where a.id = alvo.aluno_id;

-- ── 2. ATIVIDADE EXTRA NÃO TEM MENSALIDADE ─────────────────────────────────
-- Power Kids, banda e afins sao `cursos.is_projeto_banda = true`. O Emusys manda
-- valor_mensalidade preenchido nesses contratos, mas com **nr_faturas = 0** e sem
-- cobranca automatica — ou seja, nao cobra. A gente estava lendo o valor_mensalidade e
-- ignorando o nr_faturas, e isso virou MRR fantasma.
-- Medido: 4 alunos de Power Kids em CG (matriculados 17/08) com R$ 520 cada = R$ 2.080.
-- Em 2 deles (Alexandre Ayres, Gabriel Gomes) a linha estava ainda classificada como
-- REGULAR, competindo com o curso pagante de verdade (Teclado, 12 faturas) — a
-- "inversao" relatada pelo Alf.
update alunos a
   set valor_parcela = 0, valor_cheio = 0, updated_at = now()
  from cursos c
 where c.id = a.curso_id
   and c.is_projeto_banda is true
   and a.status = 'ativo'
   and coalesce(a.valor_parcela,0) > 0
   and not exists (select 1 from matriculas_campos_fixados f
                    where f.aluno_id = a.id and f.campo = 'valor_parcela');

-- ── 3. Fecha as divergências que estes dois blocos resolveram ───────────────
update matriculas_divergencias md
   set resolvido = true, updated_at = now(),
       analise_sol = 'Resolvida: status aplicado direto do Emusys (transicao automatica).'
 where md.resolvido = false
   and md.tipo_divergencia = 'status_divergente'
   and exists (
     select 1 from alunos a
     join emusys_matriculas_estado_atual e
       on e.emusys_matricula_id::text = a.emusys_matricula_id and e.unidade_id = a.unidade_id
     where a.id = md.aluno_id and a.status = e.status_local_resolvido
   );

update matriculas_divergencias md
   set resolvido = true, updated_at = now(),
       analise_sol = 'Resolvida: atividade extra (is_projeto_banda) nao tem mensalidade; contrato Emusys com nr_faturas = 0.'
 where md.resolvido = false
   and md.tipo_divergencia = 'valor_divergente'
   and exists (
     select 1 from alunos a join cursos c on c.id = a.curso_id
      where a.id = md.aluno_id and c.is_projeto_banda is true and coalesce(a.valor_parcela,0) = 0
   );
