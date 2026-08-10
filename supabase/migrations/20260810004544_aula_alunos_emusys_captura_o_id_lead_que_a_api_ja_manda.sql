-- A API do Emusys passou a devolver `id_lead` dentro de `AlunoNaAula` em 21/06/2026
-- (junto com `id_aluno` e o `id` do professor). O tipo `AlunoNaAulaEmusys` no nosso
-- `_shared/emusys-aulas.ts` JA DECLARA `id_lead` — mas `montarVinculosAulaAlunos` nunca leu
-- o campo. O dado chegava e era descartado.
--
-- Consequencia: a unica forma de casar uma experimental do CRM com a aula real era
-- (unidade + data + nome do aluno). Nome e chave fraca — foi o que deixou 362 experimentais
-- com o id errado e o que produz duplicata em `lead_experimentais`.
--
-- Cobertura medida em `lead_experimentais.emusys_lead_id`:
--   antes de 21/06/2026 .... 90% (952 de 1057 no total)
--   desde  21/06/2026 ..... 100% (464 de 464)
-- Ou seja: para tudo que a API entrega hoje, o lead vem sempre.
--
-- ⚠️ NAO mexemos em `criarAlunoChave`. Seria tentador passar a chave para `lead:<id>`, mas
-- isso reescreveria a chave de TODAS as linhas existentes e criaria uma terceira forma de
-- chave, exatamente o problema que a migration `20260809234852` acabou de resolver. A
-- coluna nova e aditiva; a chave continua como esta.
--
-- ⚠️ `id_lead` vem 0 quando a pessoa ja e aluno cadastrado (nao e lead). Normalizamos 0
-- para NULL: 0 nao e um lead, e guardar 0 faria join casar coisa errada.
--
-- VALIDADO em transacao revertida: uma experimental foi ligada a aula certa com o nome
-- escrito de forma COMPLETAMENTE diferente nos dois lados — prova de que casou pelo lead.
do $mig$
begin
  if exists (select 1 from information_schema.columns
              where table_name='aula_alunos_emusys' and column_name='emusys_lead_id') then
    raise exception 'ABORTADO: coluna emusys_lead_id ja existe';
  end if;

  alter table public.aula_alunos_emusys
    add column emusys_lead_id integer;

  comment on column public.aula_alunos_emusys.emusys_lead_id is
    'id_lead que GET /aulas devolve em AlunoNaAula (desde 21/06/2026). NULL quando a pessoa ja e aluno cadastrado (a API manda 0 nesse caso, normalizado para NULL). E a chave canonica para casar experimental do CRM com a aula real, no lugar de nome+data.';

  -- Indice parcial: so as linhas de lead interessam para a costura.
  create index if not exists idx_aula_alunos_emusys_lead
    on public.aula_alunos_emusys (unidade_id, emusys_lead_id)
    where emusys_lead_id is not null;

  ---------------------------------------------------------------------------
  -- A costura da experimental passa a PREFERIR o lead, caindo para nome so quando
  -- o lead nao estiver disponivel (linhas antigas, anteriores a 21/06).
  ---------------------------------------------------------------------------
  create or replace function public.fn_experimental_recebe_id_da_aula()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
  as $fn$
  declare
    v_aula record;
    v_alvo bigint;
    v_qtd int;
  begin
    select a.emusys_id, a.unidade_id, a.data_aula, a.categoria
      into v_aula
      from public.aulas_emusys a
     where a.id = new.aula_emusys_id;

    if v_aula.categoria is distinct from 'experimental' then
      return new;
    end if;

    -- Trava anti-colisao: a UNIQUE (unidade_id, emusys_aula_id) existe e ha duplicata
    -- historica em `lead_experimentais`. Se a aula ja esta tomada, nao mexe.
    if exists (
      select 1 from public.lead_experimentais o
       where o.unidade_id = v_aula.unidade_id and o.emusys_aula_id = v_aula.emusys_id
    ) then
      return new;
    end if;

    -- CAMINHO CANONICO: casar pelo lead. Exato, nao depende de grafia de nome.
    if new.emusys_lead_id is not null then
      select count(*), min(le.id) into v_qtd, v_alvo
        from public.lead_experimentais le
       where le.unidade_id = v_aula.unidade_id
         and le.emusys_lead_id = new.emusys_lead_id
         and le.data_experimental = v_aula.data_aula
         and (le.emusys_aula_id is null
              or not exists (select 1 from public.aulas_emusys x where x.emusys_id = le.emusys_aula_id));

      if v_qtd = 1 then
        update public.lead_experimentais set emusys_aula_id = v_aula.emusys_id where id = v_alvo;
        return new;
      end if;
      if v_qtd > 1 then
        return new;   -- ambiguo mesmo com lead: curadoria
      end if;
      -- v_qtd = 0: cai para o nome (experimental antiga, sem emusys_lead_id)
    end if;

    -- FALLBACK: nome + data. Mantido so para as linhas anteriores a 21/06/2026, quando a
    -- API ainda nao devolvia id_lead.
    select count(*), min(le.id) into v_qtd, v_alvo
      from public.lead_experimentais le
     where le.unidade_id = v_aula.unidade_id
       and le.data_experimental = v_aula.data_aula
       and lower(unaccent(btrim(le.nome_aluno))) = new.aluno_nome_normalizado
       and (le.emusys_aula_id is null
            or not exists (select 1 from public.aulas_emusys x where x.emusys_id = le.emusys_aula_id));

    if v_qtd = 1 then
      update public.lead_experimentais set emusys_aula_id = v_aula.emusys_id where id = v_alvo;
    end if;

    return new;
  end;
  $fn$;

  comment on function public.fn_experimental_recebe_id_da_aula() is
    'Liga a experimental do CRM ao id REAL da aula quando ela chega pelo sync. PREFERE casar por emusys_lead_id (canonico desde 21/06/2026); cai para nome+data so nas linhas antigas. Recusa agir quando a aula ja esta tomada ou quando ha mais de uma candidata.';
end
$mig$;
