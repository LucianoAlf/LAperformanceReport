-- "Vale o que está no Emusys." Decisão do Alf, 2026-08-18.
--
-- Elimina as pendências que não são pendência de verdade: dado que o Emusys já tem e
-- que a gente só não trouxe. Cada bloco GRAVA o valor do Emusys e só então fecha a
-- tarefa. Anamnese (1.058) NÃO é tocada: é checklist interno nosso, o Emusys não tem.
--
-- Guarda preservada em todos os blocos: matriculas_campos_fixados. Campo travado à
-- mão não é sobrescrito.
--
-- Efeito medido: 4.325 tarefas -> 1.058 (todas anamnese) + 24 pendências reais.

-- ── 1. PRESENÇA ─────────────────────────────────────────────────────────────
-- Ausente do Emusys = falta, em todo o período. Jun/jul ficam congelados como estão
-- (decisão explícita: não reprocessar), agosto em diante é canônico. Sem revisão
-- humana: a fila de 2.997 itens sai.
-- ⚠️ O que ela media era real (8.125 linhas de jun/jul nunca sincronizadas do Emusys;
-- medido: em 08/07 no CG, presentes 53 -> 106 ao re-puxar). A decisão é conviver com o
-- passivo de jun/jul e não arrastar isso como tarefa para a equipe.
update presenca_politicas_confiabilidade
   set ausencia_emusys_resultado = 'falta_confirmada',
       exige_revisao_operacional = false,
       evidencia = 'Decisao Alf 2026-08-18: ausencia do Emusys e falta. Jun/jul congelados como estao; agosto em diante e canonico. Sem fila de revisao operacional.',
       regra_versao = 'presenca-politica-emusys-manda-20260818-v1',
       decidido_por = 'Alf',
       decidido_em = now()
 where ativa;

-- ── 2. DATA DE NASCIMENTO (1.184) ───────────────────────────────────────────
-- 100% tinham valor no Emusys e NULL do nosso lado. É só trazer.
with alvo as (
  select d.id, d.aluno_id, (d.valor_emusys->>'data_nascimento')::date as nascimento
  from alunos_emusys_atributos_divergencias d
  where d.tipo_divergencia = 'data_nascimento_divergente'
    and coalesce(d.resolvido,false) = false
    and nullif(btrim(d.valor_emusys->>'data_nascimento'),'') is not null
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = d.aluno_id and f.campo = 'data_nascimento')
),
aplicado as (
  update alunos a set data_nascimento = alvo.nascimento, updated_at = now()
  from alvo where a.id = alvo.aluno_id
  returning alvo.id
)
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260818', decidido_em = now(), updated_at = now()
 where d.id in (select id from aplicado);

-- ── 3. FORMA DE PAGAMENTO (92) ──────────────────────────────────────────────
with mapa(nome_emusys, forma_id) as (
  values ('Pgto Recorrente',1), ('Cheque Pré Datado',2), ('Cheque a Vista',2), ('Cheque',2),
         ('Pix',3), ('Dinheiro',4), ('Link',5), ('Boleto',6),
         ('Cartão de Débito',7), ('Cartão de Crédito',8)
),
alvo as (
  select d.id, d.aluno_id, m.forma_id
  from alunos_emusys_atributos_divergencias d
  join mapa m on m.nome_emusys = btrim(d.valor_emusys->>'forma_pagamento')
  where d.tipo_divergencia = 'forma_pagamento_divergente'
    and coalesce(d.resolvido,false) = false
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = d.aluno_id and f.campo = 'forma_pagamento_id')
),
aplicado as (
  update alunos a set forma_pagamento_id = alvo.forma_id, updated_at = now()
  from alvo where a.id = alvo.aluno_id
  returning alvo.id
)
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260818', decidido_em = now(), updated_at = now()
 where d.id in (select id from aplicado);

-- ── 4. STATUS FINANCEIRO (45) ───────────────────────────────────────────────
-- Conferido: os 45 sao divergencia real (sem_parcela->em_dia 18, em_dia->inadimplente 12,
-- inadimplente->em_dia 8, em_dia->sem_parcela 7). Emusys manda.
with alvo as (
  select d.id, d.aluno_id, btrim(d.valor_emusys->>'status_pagamento') as status_novo
  from alunos_emusys_atributos_divergencias d
  where d.tipo_divergencia = 'status_financeiro_divergente'
    and coalesce(d.resolvido,false) = false
    and nullif(btrim(d.valor_emusys->>'status_pagamento'),'') is not null
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = d.aluno_id and f.campo = 'status_pagamento')
),
aplicado as (
  update alunos a set status_pagamento = alvo.status_novo, updated_at = now()
  from alvo where a.id = alvo.aluno_id
  returning alvo.id
)
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260818', decidido_em = now(), updated_at = now()
 where d.id in (select id from aplicado);

-- ── 5. CONTATO (6) ──────────────────────────────────────────────────────────
-- ⚠️ Guarda extra: idx_alunos_telefone_unidade_nome_curso_unique. Aluno DUPLICADO
-- (mesma pessoa, mesmo curso, 2 linhas) faz o mesmo telefone colidir. Caso real: Vitória
-- da Silva Nobre (Recreio, Canto IND, ids 705/1006). Esses ficam de fora e continuam na
-- fila — a pendência ali é a duplicata de matrícula, não o contato.
with alvo as (
  select d.id, d.aluno_id, d.campo,
         nullif(btrim(d.valor_emusys->>d.campo),'') as valor_novo
  from alunos_emusys_atributos_divergencias d
  where d.tipo_divergencia = 'contato_divergente'
    and coalesce(d.resolvido,false) = false
    and d.campo in ('telefone','email')
    and nullif(btrim(d.valor_emusys->>d.campo),'') is not null
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = d.aluno_id and f.campo = d.campo)
),
sem_colisao as (
  select alvo.*
  from alvo
  join alunos a on a.id = alvo.aluno_id
  where alvo.campo <> 'telefone'
     or not exists (
       select 1 from alunos outro
        where outro.telefone = alvo.valor_novo
          and outro.unidade_id = a.unidade_id
          and outro.nome = a.nome
          and outro.curso_id is not distinct from a.curso_id
          and outro.id <> a.id
     )
),
aplicado as (
  update alunos a
     set telefone = case when s.campo='telefone' then s.valor_novo else a.telefone end,
         email    = case when s.campo='email'    then s.valor_novo else a.email end,
         updated_at = now()
  from sem_colisao s where a.id = s.aluno_id
  returning s.id
)
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260818', decidido_em = now(), updated_at = now()
 where d.id in (select id from aplicado);
