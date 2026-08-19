-- Duplicata de matrícula: a chave passa a ser a REGRA DE NEGÓCIO (Alf, 2026-08-19).
--
-- Regra canônica (docs/REGRAS-DE-NEGOCIO.md §3.4, validada pelo Alf em 2026-06-07 e
-- refinada em 2026-08-19): duas linhas da mesma pessoa no mesmo curso SÓ são duplicata
-- quando também coincidem PROFESSOR e HORÁRIO. Dois tempos reais do mesmo curso, ou
-- duas bandas diferentes, são vínculos legítimos e pagos separadamente.
--
-- O índice antigo `idx_alunos_telefone_unidade_nome_curso_unique`
-- (telefone, unidade_id, nome, curso_id) NÃO expressa essa regra e barrava justamente
-- o caso legítimo: a mesma pessoa tem o MESMO telefone nas duas linhas do mesmo curso,
-- então gravar o telefone que o Emusys manda era recusado pelo banco.
-- Travou Vitória da Silva Nobre (a aluna citada NOMINALMENTE na exceção da regra),
-- Vicente Pereira Costard (Segunda 09h e 10h) e Vinícius Lopa (três Power Kids na
-- Terça 17h com TRÊS professores diferentes = três bandas).
--
-- ⚠️ Auditoria antes de trocar: pela regra real existe ZERO duplicata ativa. O único
-- grupo que colidia era Gabriel Teixeira Nogueira (CG, Guitarra) — e o Emusys mostra
-- turmas G_Ter_14 e G_Seg_17 (Terça 14h e Segunda 17h), duas aulas legítimas. As duas
-- linhas nossas estavam com "Segunda 18:00" por dia/horário desatualizado, não por
-- duplicidade. Corrigido abaixo a partir do nome_turma do próprio Emusys.
--
-- ⚠️ Era CONSTRAINT, não só índice — por isso o drop é `alter table ... drop constraint`.

update alunos set dia_aula = 'Terça',   horario_aula = '14:00:00', updated_at = now()
 where emusys_matricula_id = '2449' and status = 'ativo';
update alunos set dia_aula = 'Segunda', horario_aula = '17:00:00', updated_at = now()
 where emusys_matricula_id = '2535' and status = 'ativo';

alter table public.alunos drop constraint if exists idx_alunos_telefone_unidade_nome_curso_unique;
drop index if exists idx_alunos_telefone_unidade_nome_curso_unique;

create unique index if not exists idx_alunos_duplicata_matricula_unique
  on public.alunos (unidade_id, nome, curso_id, professor_atual_id, horario_aula)
  where status = 'ativo' and arquivado_em is null;

comment on index public.idx_alunos_duplicata_matricula_unique is
  'Duplicata de matricula = mesma pessoa + mesmo curso + mesmo professor + mesmo horario (REGRAS-DE-NEGOCIO 3.4, Alf 2026-08-19). Dois tempos do mesmo curso ou duas bandas sao legitimos e NAO colidem aqui. Substitui idx_alunos_telefone_unidade_nome_curso_unique, que barrava o caso legitimo porque a mesma pessoa repete o telefone nas duas linhas.';

with alvo as (
  select d.id, d.aluno_id, nullif(btrim(d.valor_emusys->>'telefone'),'') as tel
  from alunos_emusys_atributos_divergencias d
  where d.tipo_divergencia = 'contato_divergente' and d.campo = 'telefone'
    and coalesce(d.resolvido,false) = false
    and nullif(btrim(d.valor_emusys->>'telefone'),'') is not null
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = d.aluno_id and f.campo = 'telefone')
),
aplicado as (
  update alunos a set telefone = alvo.tel, updated_at = now()
  from alvo where a.id = alvo.aluno_id
  returning alvo.id
)
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260819', decidido_em = now(), updated_at = now()
 where d.id in (select id from aplicado);
