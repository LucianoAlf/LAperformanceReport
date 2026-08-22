-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

with correcao (aluno_id, nome_esperado, de, para) as (
  values
    -- criança gravada como adulta — cruza a fronteira dos 15 anos
    (1669, 'Milena Americo Paiva',                      date '1977-07-24', date '2016-12-22'),
    (1466, 'Heitor Muniz Martis Da Silva',              date '1983-04-21', date '2019-02-09'),
    (1469, 'Laiane Marins Lazaro',                      date '1980-12-16', date '2014-11-03'),
    -- adulto gravado como bebê — também cruza a fronteira
    (1457, 'Tiago Dos Santos Manoel',                   date '2026-02-18', date '1989-02-18'),
    -- erram a idade sem cruzar a fronteira dos 15
    (1585, 'Matheus Lopes de Medeiros',                 date '2026-03-24', date '2021-06-04'),
    (1551, 'Matheus Lopes de Medeiros',                 date '2018-06-04', date '2021-06-04'),
    (1518, 'Giselle Gomes Marques',                     date '1989-06-11', date '1986-07-16'),
    (1089, 'Claudio Luiz de Carvalho Mascarenhas Neto', date '2013-01-25', date '2013-05-21'),
    ( 730, 'Beatriz Dolavale Assed',                    date '2023-02-20', date '2022-12-22'),
    ( 955, 'Bruno Ricardo da Silva',                    date '1982-02-03', date '1982-03-03'),
    ( 956, 'Dante Custódio de Almeida Marques',         date '2012-07-13', date '2012-07-31')
)
update alunos a
   set data_nascimento = c.para
  from correcao c
 where a.id = c.aluno_id
   and a.nome = c.nome_esperado
   and a.data_nascimento = c.de;

do $$
declare
  v_divergentes integer;
begin
  with emusys as (
    select distinct on (p.emusys_student_id, p.aluno_nome)
           p.emusys_student_id, p.aluno_nome,
           (p.payload->'aluno'->>'data_nascimento')::date as data_emusys
      from emusys_api_payload p
     where p.payload->'aluno'->>'data_nascimento' ~ '^\d{4}-\d{2}-\d{2}$'
     order by p.emusys_student_id, p.aluno_nome, p.synced_at desc
  )
  select count(*) into v_divergentes
    from alunos a
    join emusys e
      on e.emusys_student_id::text = a.emusys_student_id
     and e.aluno_nome = a.nome
   where a.data_nascimento is distinct from e.data_emusys;

  if v_divergentes <> 0 then
    raise exception 'ABORTADO: restam % divergencia(s) de data contra o Emusys', v_divergentes;
  end if;
  raise notice 'OK: zero divergencia contra o Emusys';
end $$;
