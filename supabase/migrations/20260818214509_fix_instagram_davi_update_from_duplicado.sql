-- Correção da migration anterior: `update ... from alvo` com DUAS linhas do mesmo
-- aluno (foto + instagram do Davi Lima Queiroz) aplica só UMA — o Postgres escolhe
-- arbitrariamente. A foto entrou, o instagram não. Aplicado em bloco separado por tipo.
--
-- ⚠️ Lição para migrations de backfill: `UPDATE ... FROM cte` NÃO itera. Se a CTE tem
-- mais de uma linha para a mesma chave do alvo, só uma é aplicada e nenhuma erro é
-- levantado. Quando o backfill puder ter 2+ linhas por aluno, separar por tipo de campo
-- (ou agregar a CTE por aluno antes do update).
with alvo as (
  select d.id, d.aluno_id, nullif(btrim(d.valor_emusys->>'instagram'),'') as insta
  from alunos_emusys_atributos_divergencias d
  where d.tipo_divergencia = 'instagram_ausente'
    and coalesce(d.resolvido,false) = false
    and nullif(btrim(d.valor_emusys->>'instagram'),'') is not null
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = d.aluno_id and f.campo = 'instagram')
),
aplicado as (
  update alunos a set instagram = alvo.insta, updated_at = now()
  from alvo where a.id = alvo.aluno_id
  returning alvo.id
)
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260818', decidido_em = now(), updated_at = now()
 where d.id in (select id from aplicado);
