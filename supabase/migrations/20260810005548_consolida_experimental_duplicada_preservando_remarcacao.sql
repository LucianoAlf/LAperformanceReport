-- Consolida a DUPLICATA PURA de `lead_experimentais` — aprovado pelo Alf em 09/08/2026,
-- ciente de que a conversao e o score dos professores sobem.
--
-- POR QUE EXISTE: ate 21/06/2026 a API do Emusys nao devolvia `id_lead` em `AlunoNaAula`.
-- Sem o lead nao havia chave estavel para reconhecer a mesma experimental, e cada reentrega
-- do webhook virava linha nova. Nao e bug de logica nossa — e ausencia de chave na origem,
-- agora resolvida (migration `20260810004544`).
--
-- ⚠️ TRES CORRECOES DE CRITERIO ao longo do trabalho, todas expostas por recusa do banco ou
-- por verificacao da propria migration. Ficam registradas porque a regra final so faz
-- sentido com elas:
--
--   (1) FK de `lead_experimental_aulas` (23503): filha nao pode ficar orfa. Passou a ser
--       repontada para o sobrevivente.
--   (2) UNIQUE `uq_lead_exp_aula_vigente` (23505): o sobrevivente ja tinha filha. Ao abrir o
--       caso (Luana Ferreira, 08/08) apareceu que o RANKING estava errado — a linha 1930
--       venceria so por ser mais antiga, mas a filha dela tinha `aula_local_id` NULL
--       enquanto a 1933 tinha o vinculo REAL. O criterio passou a olhar a filha ANTES da
--       idade.
--   (3) A medicao inicial (85 grupos) agrupava por (unidade, data, nome) e SO DEPOIS
--       filtrava pureza, perdendo duplicata escondida em dia misto. Com a chave fina
--       (unidade, data, nome, lead, curso, professor) sao 109 grupos.
--
-- ⚠️ E O ACHADO QUE MUDOU O ESCOPO: 2 grupos tem DUAS OU MAIS linhas apontando para aulas
-- DIFERENTES. Nao sao duplicata — sao CANCELAMENTO E REMARCACAO. Os irmaos Antonio e Maria
-- Fernanda Soares de Moura e Silva, 10/08/2026, com sequencia
-- `cancelada` -> `cancelada` -> `experimental_agendada` ligada a aulas distintas
-- (18393265, 18393249, 18393231). Consolidar apagaria o historico de remarcacao. Ficam
-- INTOCADOS.
--
-- ESCOPO FINAL: 107 grupos consolidaveis / 174 linhas excedentes.
-- FICAM DE FORA: cursos diferentes (multi-instrumento — o projeto corrigiu em 2026-06-23
-- para dois cursos no mesmo dia pararem de colapsar), professores diferentes (troca
-- legitima) e os 2 grupos de remarcacao acima.
--
-- COMO: lixeira + DELETE, na convencao de `alunos_arquivados`. Soft-delete obrigaria TODO
-- consumidor a aprender a filtrar, e a RPC de conversao do professor le a tabela direto.
--
-- QUEM SOBREVIVE, nesta ordem:
--   1. tem filha com `aula_local_id` preenchido (vinculo real de aula)
--   2. tem `emusys_aula_id` que resolve numa aula real
--   3. status mais avancado (convertido > realizada > agendada > faltou > cancelada)
--   4. a mais antiga (menor id) — preserva o historico, como pediu o Alf
--
-- MEDIDO: 1057 -> 883 experimentais; 57 -> 55 filhas; denominador da conversao desde junho
-- 377 -> 233.
do $mig$
declare v_n int; v_antes int; v_grupos int; v_repontadas int := 0; v_filhas_arq int := 0;
begin
  create table if not exists public.lead_experimentais_arquivadas (
    like public.lead_experimentais including defaults,
    arquivado_em timestamptz not null default now(),
    arquivado_por text not null,
    motivo text not null,
    consolidado_no_id bigint not null
  );
  comment on table public.lead_experimentais_arquivadas is
    'Lixeira de lead_experimentais, no padrao de alunos_arquivados. Guarda a linha inteira + quem absorveu (consolidado_no_id). A duplicata nasceu porque a API do Emusys so passou a devolver id_lead em 21/06/2026.';

  create table if not exists public.lead_experimental_aulas_arquivadas (
    like public.lead_experimental_aulas including defaults,
    arquivado_em timestamptz not null default now(),
    motivo text not null,
    consolidado_no_id bigint not null
  );
  comment on table public.lead_experimental_aulas_arquivadas is
    'Filhas descartadas na consolidacao, quando o sobrevivente ja tinha a sua. So entra aqui filha SEM aula_local_id — vinculo real nunca e descartado.';

  revoke all on table public.lead_experimentais_arquivadas from public, anon, authenticated;
  revoke all on table public.lead_experimental_aulas_arquivadas from public, anon, authenticated;
  grant select on table public.lead_experimentais_arquivadas to authenticated;
  grant select on table public.lead_experimental_aulas_arquivadas to authenticated;

  select count(*) into v_antes from public.lead_experimentais;

  create temporary table _consolidacao on commit drop as
  with base as (
    select le.id, le.unidade_id, le.data_experimental,
           lower(unaccent(btrim(le.nome_aluno))) as nome_norm,
           le.lead_id, le.curso_interesse_id, le.professor_experimental_id, le.status,
           le.emusys_aula_id,
           (select count(distinct f.aula_local_id) from public.lead_experimental_aulas f
             where f.lead_experimental_id = le.id and f.aula_local_id is not null) as aulas_vinc
      from public.lead_experimentais le
  ), com_grupo as (
    select b.*,
           count(*) over w as linhas_no_grupo,
           count(*) filter (where b.aulas_vinc > 0) over w as linhas_com_aula
      from base b
    window w as (partition by b.unidade_id, b.data_experimental, b.nome_norm,
                              b.lead_id, b.curso_interesse_id, b.professor_experimental_id)
  ), elegiveis as (
    -- linhas_com_aula > 1 => remarcacao, NAO duplicata. Fica de fora.
    select * from com_grupo where linhas_no_grupo > 1 and linhas_com_aula <= 1
  ), ranqueado as (
    select e.*,
           row_number() over (
             partition by e.unidade_id, e.data_experimental, e.nome_norm,
                          e.lead_id, e.curso_interesse_id, e.professor_experimental_id
             order by
               (case when e.aulas_vinc > 0 then 0 else 1 end),
               (case when e.emusys_aula_id is not null
                      and exists (select 1 from public.aulas_emusys a where a.emusys_id = e.emusys_aula_id)
                     then 0 else 1 end),
               (case e.status
                  when 'convertido' then 0
                  when 'experimental_realizada' then 1
                  when 'experimental_agendada' then 2
                  when 'experimental_faltou' then 3
                  when 'cancelada' then 4
                  else 5 end),
               e.id
           ) as posicao
      from elegiveis e
  )
  select r.id,
         first_value(r.id) over (
           partition by r.unidade_id, r.data_experimental, r.nome_norm,
                        r.lead_id, r.curso_interesse_id, r.professor_experimental_id
           order by r.posicao
         ) as sobrevivente_id,
         r.posicao
    from ranqueado r;

  select count(distinct sobrevivente_id) into v_grupos from _consolidacao;
  if v_grupos <> 107 then
    raise exception 'ABORTADO: esperava 107 grupos consolidaveis, achei %', v_grupos;
  end if;

  select count(*) into v_n from _consolidacao where posicao > 1;
  if v_n <> 174 then
    raise exception 'ABORTADO: esperava 174 linhas excedentes, achei %', v_n;
  end if;

  if exists (select 1 from _consolidacao c where c.posicao > 1
              and c.id in (select sobrevivente_id from _consolidacao)) then
    raise exception 'ABORTADO: uma linha seria arquivada E sobrevivente ao mesmo tempo';
  end if;

  if exists (
    select 1 from public.lead_experimental_aulas lea
      join _consolidacao c on c.id = lea.lead_experimental_id and c.posicao > 1
     where lea.aula_local_id is not null
       and exists (select 1 from public.lead_experimental_aulas s
                    where s.lead_experimental_id = c.sobrevivente_id)
  ) then
    raise exception 'ABORTADO: filha COM vinculo real seria descartada';
  end if;

  insert into public.lead_experimental_aulas_arquivadas
  select lea.*, now(),
         'filha redundante: o sobrevivente ja tinha a sua, e esta estava sem aula_local_id',
         c.sobrevivente_id
    from public.lead_experimental_aulas lea
    join _consolidacao c on c.id = lea.lead_experimental_id and c.posicao > 1
   where exists (select 1 from public.lead_experimental_aulas s
                  where s.lead_experimental_id = c.sobrevivente_id);
  get diagnostics v_filhas_arq = row_count;

  delete from public.lead_experimental_aulas lea
   using _consolidacao c
   where lea.lead_experimental_id = c.id and c.posicao > 1
     and exists (select 1 from public.lead_experimental_aulas s
                  where s.lead_experimental_id = c.sobrevivente_id);

  update public.lead_experimental_aulas lea
     set lead_experimental_id = c.sobrevivente_id
    from _consolidacao c
   where lea.lead_experimental_id = c.id and c.posicao > 1;
  get diagnostics v_repontadas = row_count;

  insert into public.lead_experimentais_arquivadas
  select le.*, now(),
         'Alf/Claude 09-08-2026',
         'duplicata pura (mesmo lead+curso+professor+dia); API do Emusys so passou a devolver id_lead em 21/06/2026',
         c.sobrevivente_id
    from public.lead_experimentais le
    join _consolidacao c on c.id = le.id
   where c.posicao > 1;
  get diagnostics v_n = row_count;
  if v_n <> 174 then
    raise exception 'ABORTADO: arquivei % linhas, esperava 174', v_n;
  end if;

  delete from public.lead_experimentais le
   using _consolidacao c
   where c.id = le.id and c.posicao > 1;
  get diagnostics v_n = row_count;
  if v_n <> 174 then
    raise exception 'ABORTADO: apaguei % linhas, esperava 174', v_n;
  end if;

  if (select count(*) from public.lead_experimentais) <> v_antes - 174 then
    raise exception 'ABORTADO: contagem final nao fechou';
  end if;

  -- So podem sobrar duplicatas de REMARCACAO (2 grupos, 6 linhas)
  if (select count(*) from (
        select 1 from public.lead_experimentais le
         group by le.unidade_id, le.data_experimental, lower(unaccent(btrim(le.nome_aluno))),
                  le.lead_id, le.curso_interesse_id, le.professor_experimental_id
        having count(*) > 1) z) <> 2 then
    raise exception 'ABORTADO: esperava sobrar exatamente 2 grupos (remarcacao)';
  end if;

  if exists (
    select 1 from public.lead_experimental_aulas lea
     where not exists (select 1 from public.lead_experimentais le where le.id = lea.lead_experimental_id)
  ) then
    raise exception 'ABORTADO: sobrou filha orfa';
  end if;

  raise notice '107 grupos consolidados; 174 arquivadas; % filhas repontadas; % filhas arquivadas; 2 grupos de remarcacao preservados',
    v_repontadas, v_filhas_arq;
end
$mig$;
