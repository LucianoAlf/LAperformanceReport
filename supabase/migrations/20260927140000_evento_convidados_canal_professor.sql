-- 27/09/2026 — Eventos: convidados, certificado por CURSO e o canal do professor.
--
-- Três mudanças numa migration só porque nascem da mesma decisão (Alf, 27/09, depois da
-- resposta do LA Teacher em `prompt-la-report-recital-canal-professor-2026-09-27.md`):
--
--   1. `convidados` em evento_participacao — o campo que a planilha da equipe tem e o
--      módulo não tinha. Fica por PESSOA (check-in também é por pessoa: quem faz dois
--      cursos chega uma vez e traz os convidados uma vez).
--   2. `certificado_status` sai de evento_participacao e vai para evento_apresentacao —
--      decisão fechada: "um certificado por curso" ("se ele faz teclado e violão, se
--      apresenta duas vezes"). A coluna antiga NUNCA foi escrita (medido em produção:
--      0 linhas preenchidas), então o drop não perde dado nenhum.
--   3. O canal professor→evento. O professor lança música/artista/duração/link/playback/
--      rider no LA Teacher (cartão "Música e palco do recital"); nós PUXAMOS pela view
--      fechada `vw_relatorio_anual_recital_v1` (service_role only). Como a tela roda como
--      `authenticated`, a ponte é a RPC `evento_recital_sincronizar_v1` (definer), que:
--        • grava o SNAPSHOT cru da view em `evento_apresentacao.professor` (jsonb);
--        • copia os campos efetivos (musica, artista, link, playback_path, duracao,
--          tem_playback) quando a apresentação ainda é virgem OU pertence ao professor;
--        • espelha o rider em `evento_apresentacao_item` com `origem='professor'`;
--        • devolve o placar do casamento pessoa×curso (quantos casaram, quais não).
--
-- ⚠️ POSSE: `detalhes_origem` diz quem escreveu por último nos campos de detalhe.
--    'professor' = o LA Teacher é a fonte e o próximo sync sobrescreve de novo;
--    'adm' = alguém editou aqui — o sync preenche só o que estiver vazio e a tela acusa
--    a divergência contra o snapshot. O flip para 'adm' é feito por TRIGGER checando o
--    GUC `evento.sync`: depender do chamador lembrar de marcar a origem é exatamente o
--    tipo de invariante que se perde em silêncio (uma escrita nova esquece e o campo do
--    professor é sobrescrito sem ninguém saber).
--
-- Casamento pessoa×curso (contrato LA Teacher):
--   pessoa: fn_pessoa_chave_aluno(v.aluno_id) = evento_apresentacao.pessoa_chave
--   curso:  fn_curso_base(cursos.nome) = v.curso_chave   ("Teclado IND" → 'teclado')

-- ─────────────────────────── 1. convidados ───────────────────────────
alter table public.evento_participacao
  add column if not exists convidados integer not null default 0
    check (convidados >= 0);
comment on column public.evento_participacao.convidados is
  'Quantos convidados a pessoa leva ao recital. Por PESSOA, como o check-in.';

-- ────────────────── 2. certificado: pessoa → (pessoa, curso) ──────────────────
alter table public.evento_apresentacao
  add column if not exists certificado_status text not null default 'pendente'
    check (certificado_status in ('pendente', 'emitido')),
  add column if not exists certificado_em timestamptz;
alter table public.evento_participacao drop column if exists certificado_status;
comment on column public.evento_apresentacao.certificado_status is
  'Um certificado por CURSO (decisão do Alf, 27/09): o grão é a apresentação.';

-- ─────────────── 3. campos do canal do professor ───────────────
alter table public.evento_apresentacao
  add column if not exists musica_artista text,
  add column if not exists musica_link text,
  add column if not exists playback_path text,   -- objeto no bucket recital-playback (LA Teacher)
  add column if not exists detalhes_origem text not null default 'adm'
    check (detalhes_origem in ('adm', 'professor')),
  add column if not exists professor jsonb,      -- snapshot cru da vw_relatorio_anual_recital_v1
  add column if not exists professor_em timestamptz;

alter table public.evento_apresentacao_item
  add column if not exists origem text not null default 'adm'
    check (origem in ('adm', 'professor')),
  add column if not exists codigo text;          -- id estável do rider do LA Teacher
-- Um código por apresentação: o sync espelha a lista do professor inteira a cada vez.
create unique index if not exists uq_evento_item_codigo
  on public.evento_apresentacao_item (apresentacao_id, codigo) where codigo is not null;

-- Escrita manual nos campos de detalhe toma posse deles ('adm'). O sync roda com o GUC
-- `evento.sync=1` no caminho e não vira posse — senão a 1ª escrita humana que passasse
-- por um caminho novo seria sobrescrita pelo professor sem rastro.
create or replace function public.fn_evento_apresentacao_origem_adm()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_setting('evento.sync', true) = '1' then
    return new;
  end if;
  if (new.musica, new.musica_artista, new.musica_link, new.playback_path,
      new.duracao_segundos, new.tem_playback)
     is distinct from
     (old.musica, old.musica_artista, old.musica_link, old.playback_path,
      old.duracao_segundos, old.tem_playback)
  then
    new.detalhes_origem := 'adm';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_evento_apresentacao_origem_adm() from public, anon, authenticated;

drop trigger if exists trg_evento_apresentacao_origem_adm on public.evento_apresentacao;
create trigger trg_evento_apresentacao_origem_adm
  before update on public.evento_apresentacao
  for each row execute function public.fn_evento_apresentacao_origem_adm();

-- ─────────── 4. acesso: a mesma regra das policies do módulo ───────────
-- O definer lê a view deles como DONO; a RLS não o protege sozinho porque o papel é
-- julgado por `auth.uid()` do CHAMADOR — sem este check, qualquer autenticado puxaria o
-- recital de outra unidade.
create or replace function public.fn_evento_pode_ver(p_evento_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.role(), '') = 'service_role'
     or exists (
          select 1 from public.evento e
           where e.id = p_evento_id
             and ((select public.is_admin())
                  or e.unidade_id in (select public.get_user_unidade_ids()))
        );
$$;
revoke all on function public.fn_evento_pode_ver(bigint) from public, anon, authenticated;
grant execute on function public.fn_evento_pode_ver(bigint) to authenticated, service_role;

-- ───────────── 5. sync: LA Teacher → evento_apresentacao ─────────────
create or replace function public.evento_recital_sincronizar_v1(p_evento_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_ap_id bigint;
  v_pessoa text;
  v_casadas integer := 0;
  v_nao_casadas jsonb := '[]'::jsonb;
  v_campos integer := 0;
  v_itens integer := 0;
  v_sem_mapa text[] := '{}';
  v_codigo text;
  v_tipo text;
  v_nome text;
  v_todos_adm_vazios boolean;
begin
  if not public.fn_evento_pode_ver(p_evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;

  -- Toda escrita que esta função faz nos campos de detalhe é do professor.
  perform set_config('evento.sync', '1', true);

  for v in
    select * from public.vw_relatorio_anual_recital_v1 where evento_id = p_evento_id
  loop
    v_pessoa := public.fn_pessoa_chave_aluno(v.aluno_id);

    select a.id into v_ap_id
      from public.evento_apresentacao a
      join public.cursos c on c.id = a.curso_id
     where a.evento_id = p_evento_id
       and a.pessoa_chave = v_pessoa
       and public.fn_curso_base(c.nome) = v.curso_chave
     limit 1;

    if v_ap_id is null then
      v_nao_casadas := v_nao_casadas || jsonb_build_object(
        'aluno_id', v.aluno_id, 'curso', v.curso, 'relatorio_id', v.relatorio_id);
      continue;
    end if;

    v_casadas := v_casadas + 1;

    -- O snapshot atualiza SEMPRE: é o que alimenta o painel de relatórios e a
    -- divergência, mesmo quando o professor ainda não lançou a música.
    update public.evento_apresentacao
       set professor = to_jsonb(v), professor_em = v.atualizado_em, updated_at = now()
     where id = v_ap_id;

    -- Só copia os detalhes depois que o professor LANÇOU o cartão (musica_lancada_em).
    if v.musica_lancada_em is not null then
      select (a.musica is null and a.musica_artista is null and a.musica_link is null
              and a.playback_path is null and a.duracao_segundos is null)
        into v_todos_adm_vazios
        from public.evento_apresentacao a where a.id = v_ap_id;

      if v_todos_adm_vazios or exists (
        select 1 from public.evento_apresentacao a
         where a.id = v_ap_id and a.detalhes_origem = 'professor'
      ) then
        -- Apresentação virgem → o professor toma posse; já do professor → ele é a fonte.
        update public.evento_apresentacao a
           set musica = v.musica_titulo,
               musica_artista = v.musica_artista,
               musica_link = v.musica_link,
               playback_path = v.musica_playback_path,
               duracao_segundos = v.musica_duracao_segundos,
               tem_playback = not coalesce(v.musica_ao_vivo, false)
                              and (v.musica_link is not null or v.musica_playback_path is not null),
               detalhes_origem = 'professor',
               updated_at = now()
         where a.id = v_ap_id;
        v_campos := v_campos + 1;
      else
        -- O ADM já escreveu algo: só o que estiver VAZIO é preenchido. O que divergir
        -- fica como está e a tela acusa comparando com o snapshot.
        update public.evento_apresentacao a
           set musica = coalesce(a.musica, v.musica_titulo),
               musica_artista = coalesce(a.musica_artista, v.musica_artista),
               musica_link = coalesce(a.musica_link, v.musica_link),
               playback_path = coalesce(a.playback_path, v.musica_playback_path),
               duracao_segundos = coalesce(a.duracao_segundos, v.musica_duracao_segundos),
               updated_at = now()
         where a.id = v_ap_id;
      end if;

      -- Rider: a lista do professor é a fonte — espelhada por inteiro a cada sync.
      delete from public.evento_apresentacao_item
       where apresentacao_id = v_ap_id and origem = 'professor';

      if not coalesce(v.rider_nada, false) then
        foreach v_codigo in array coalesce(v.rider_itens, '{}'::text[]) loop
          v_tipo := 'equipamento';
          v_nome := replace(v_codigo, '_', ' ');
          case v_codigo
            when 'microfone_voz'         then v_nome := 'Microfone de voz';
            when 'pedestal_microfone'    then v_nome := 'Pedestal de microfone';
            when 'microfone_instrumento' then v_nome := 'Microfone de instrumento';
            when 'teclado'               then v_tipo := 'instrumento'; v_nome := 'Teclado';
            when 'bateria'               then v_tipo := 'instrumento'; v_nome := 'Bateria';
            when 'amp_guitarra'          then v_nome := 'Amplificador de guitarra';
            when 'amp_baixo'             then v_nome := 'Amplificador de baixo';
            when 'cabo_p10'              then v_nome := 'Cabo P10';
            when 'banco'                 then v_nome := 'Banco';
            when 'estante'               then v_nome := 'Estante';
            when 'instrumento_proprio'   then v_tipo := 'instrumento'; v_nome := 'Instrumento próprio';
            else v_sem_mapa := v_sem_mapa || v_codigo;
          end case;
          insert into public.evento_apresentacao_item
            (apresentacao_id, tipo, nome, quantidade, origem, codigo)
          values (v_ap_id, v_tipo, v_nome, 1, 'professor', v_codigo);
          v_itens := v_itens + 1;
        end loop;

        if nullif(btrim(coalesce(v.rider_outros, '')), '') is not null then
          insert into public.evento_apresentacao_item
            (apresentacao_id, tipo, nome, quantidade, origem, codigo)
          values (v_ap_id, 'equipamento', btrim(v.rider_outros), 1, 'professor', 'outro');
          v_itens := v_itens + 1;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'evento_id', p_evento_id,
    'relatorios_lidos', (select count(*) from public.vw_relatorio_anual_recital_v1
                          where evento_id = p_evento_id),
    'casadas', v_casadas,
    'nao_casadas', v_nao_casadas,
    'apresentacoes_atualizadas', v_campos,
    'itens_professor', v_itens,
    'codigos_sem_mapa', to_jsonb(v_sem_mapa),
    'sincronizado_em', now()
  );
end;
$$;
revoke all on function public.evento_recital_sincronizar_v1(bigint) from public, anon;
grant execute on function public.evento_recital_sincronizar_v1(bigint) to authenticated, service_role;
comment on function public.evento_recital_sincronizar_v1(bigint) is
  'Puxa o cartão "Música e palco" do LA Teacher (vw_relatorio_anual_recital_v1) para as
   apresentações do evento: snapshot em `professor`, campos efetivos respeitando
   `detalhes_origem`, rider espelhado em itens origem=professor. Idempotente.';

-- ─────────── 6. painel: relatórios do evento (leitura) ───────────
create or replace function public.evento_relatorios_v1(p_evento_id bigint)
returns table (
  relatorio_id bigint,
  apresentacao_id bigint,
  aluno_id integer,
  aluno_nome text,
  pessoa_chave text,
  curso text,
  professor_id integer,
  professor_nome text,
  relatorio_status text,
  musica_lancada boolean,
  enviado_em timestamptz,
  aprovado_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.relatorio_id,
         a.id as apresentacao_id,
         v.aluno_id,
         al.nome as aluno_nome,
         public.fn_pessoa_chave_aluno(v.aluno_id) as pessoa_chave,
         v.curso,
         v.professor_id,
         pf.nome as professor_nome,
         v.relatorio_status,
         (v.musica_lancada_em is not null) as musica_lancada,
         v.enviado_em,
         v.aprovado_em
    from public.vw_relatorio_anual_recital_v1 v
    left join public.alunos al on al.id = v.aluno_id
    left join public.professores pf on pf.id = v.professor_id
    left join lateral (
      select ap.id
        from public.evento_apresentacao ap
        join public.cursos c on c.id = ap.curso_id
       where ap.evento_id = v.evento_id
         and ap.pessoa_chave = public.fn_pessoa_chave_aluno(v.aluno_id)
         and public.fn_curso_base(c.nome) = v.curso_chave
       limit 1
    ) a on true
   where v.evento_id = p_evento_id
     and public.fn_evento_pode_ver(p_evento_id)
   order by pf.nome, al.nome;
$$;
revoke all on function public.evento_relatorios_v1(bigint) from public, anon;
grant execute on function public.evento_relatorios_v1(bigint) to authenticated, service_role;
comment on function public.evento_relatorios_v1(bigint) is
  'Painel "relatórios na sala": uma linha por relatório do LA Teacher com o status e a
   apresentação casada (null = professor lançou para alguém fora da grade).';
