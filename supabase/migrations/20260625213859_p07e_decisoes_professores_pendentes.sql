-- P07E - Human decisions for remaining professor-unit reconciliation.
-- Decisions validated by Luciano on 2026-06-25.

with decisoes as (
  select * from (values
    ('CG', 'Elliabh Henrique', 'ignorado_professor_inativo', 'Professor nao trabalha mais na escola.'),
    ('CG', 'Leonardo Castro', 'ignorado_nao_atua_na_unidade', 'Professor atua na Barra, nao em Campo Grande.'),
    ('CG', 'Lucas Amorim Souza', 'ignorado_duplicidade_unidade', 'Mesma pessoa de Lucas Souza dos Santos; em CG usar cadastro LA 51 com Emusys 3223.'),
    ('CG', 'Miqueias de Oliveira', 'ignorado_professor_inativo', 'Professor nao trabalha mais na escola.'),
    ('REC', 'Jonathan de Lima Santos (JOHN)', 'pendente_buscar_emusys_professor_id', 'Professor ativo no Recreio, mas endpoint /professores nao retornou ID.')
  ) as t(unidade_codigo, nome_professor, decisao, detalhe)
), alvo as (
  select pu.id as professores_unidade_id,
         pu.professor_id,
         pu.unidade_id,
         d.decisao,
         d.detalhe
  from decisoes d
  join public.unidades u on u.codigo = d.unidade_codigo
  join public.professores p on p.nome = d.nome_professor
  join public.professores_unidades pu on pu.unidade_id = u.id and pu.professor_id = p.id
)
update public.professores_unidades pu
   set emusys_ativo = case when a.decisao like 'ignorado%' then false else pu.emusys_ativo end,
       validacao_status = case when a.decisao like 'ignorado%' then 'ignorado' else 'pendente' end,
       origem = case when a.decisao like 'ignorado%' then 'validacao_humana_ignorado_p07' else 'validacao_humana_sem_id_emusys_p07' end,
       validado_em = coalesce(pu.validado_em, now()),
       validado_por = coalesce(pu.validado_por, 'Luciano/Codex P07'),
       updated_at = now()
  from alvo a
 where pu.id = a.professores_unidade_id;

with decisoes as (
  select * from (values
    ('CG', 'Elliabh Henrique', 'ignorado_professor_inativo', 'Professor nao trabalha mais na escola.'),
    ('CG', 'Leonardo Castro', 'ignorado_nao_atua_na_unidade', 'Professor atua na Barra, nao em Campo Grande.'),
    ('CG', 'Lucas Amorim Souza', 'ignorado_duplicidade_unidade', 'Mesma pessoa de Lucas Souza dos Santos; em CG usar cadastro LA 51 com Emusys 3223.'),
    ('CG', 'Miqueias de Oliveira', 'ignorado_professor_inativo', 'Professor nao trabalha mais na escola.'),
    ('REC', 'Jonathan de Lima Santos (JOHN)', 'pendente_buscar_emusys_professor_id', 'Professor ativo no Recreio, mas endpoint /professores nao retornou ID.')
  ) as t(unidade_codigo, nome_professor, decisao, detalhe)
), alvo as (
  select pu.id as professores_unidade_id,
         pu.professor_id,
         pu.unidade_id,
         d.decisao,
         d.detalhe
  from decisoes d
  join public.unidades u on u.codigo = d.unidade_codigo
  join public.professores p on p.nome = d.nome_professor
  join public.professores_unidades pu on pu.unidade_id = u.id and pu.professor_id = p.id
)
update public.professores_emusys_divergencias d
   set resolvido = case when a.decisao like 'ignorado%' then true else false end,
       decisao = a.decisao,
       sugestao = case
         when a.decisao = 'pendente_buscar_emusys_professor_id'
           then jsonb_build_object('acao','buscar_emusys_professor_id','validacao_humana',a.detalhe)
         else jsonb_build_object('acao','nenhuma','validacao_humana',a.detalhe)
       end,
       severidade = case when a.decisao = 'pendente_buscar_emusys_professor_id' then 'alta' else d.severidade end,
       decidido_por = coalesce(d.decidido_por, 'Luciano/Codex P07'),
       decidido_em = coalesce(d.decidido_em, now()),
       updated_at = now()
  from alvo a
 where d.unidade_id = a.unidade_id
   and d.professor_id = a.professor_id
   and d.tipo_divergencia = 'sem_vinculo_la';
