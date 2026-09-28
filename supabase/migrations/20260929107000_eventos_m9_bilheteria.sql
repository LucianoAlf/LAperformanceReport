-- lotacao por bloco (NULL = sem teto — espaco aberto)
alter table public.evento_bloco
  add column if not exists capacidade integer
  check (capacidade is null or capacidade > 0);

-- qual maquininha/conta recebe — so etiqueta para a Sol casar no extrato, sem integracao
alter table public.evento
  add column if not exists provedor_pagamento text
    check (provedor_pagamento in ('rede', 'pagbank')),
  add column if not exists provedor_conta text;

-- tabela de preco: unitario + meia + pacotes (tudo parametro da equipe)
create table public.evento_ingresso_preco (
  evento_id      bigint primary key references public.evento(id) on delete cascade,
  preco_unitario numeric(10,2) not null check (preco_unitario >= 0),
  preco_meia     numeric(10,2) check (preco_meia is null or preco_meia >= 0),
  updated_at     timestamptz not null default now()
);
comment on table public.evento_ingresso_preco is
  'Preco do ingresso por evento. Decisao do Alf (28/09): todos pagam meia — ex.: unitario '
  'R$100, meia R$50 cobrada de todos. Os dois campos ficam para o papel/relatorio mostrar '
  'os dois valores.';

create table public.evento_ingresso_pacote (
  id                bigint generated always as identity primary key,
  evento_id         bigint not null references public.evento(id) on delete cascade,
  quantidade_minima integer not null check (quantidade_minima > 1),
  desconto_pct      numeric(5,2) not null check (desconto_pct > 0 and desconto_pct <= 100),
  unique (evento_id, quantidade_minima)
);
comment on table public.evento_ingresso_pacote is
  'Pacotes de desconto por evento: a partir de N ingressos, X% off (ex.: 10+ -> 20%).';

-- a venda: TODOS os canais na mesma tabela, registrados pela equipe
create table public.evento_ingresso_venda (
  id                bigint generated always as identity primary key,
  evento_id         bigint not null references public.evento(id) on delete cascade,
  unidade_id        uuid   not null references public.unidades(id),
  -- a venda e de lugares de UM bloco — a RPC de venda trava essa linha para
  -- conferir a lotacao antes de gravar
  bloco_id          bigint not null references public.evento_bloco(id) on delete restrict,
  participacao_id   bigint references public.evento_participacao(id) on delete set null,
  -- pacote que gerou o desconto (null = sem pacote / desconto manual)
  pacote_id         bigint references public.evento_ingresso_pacote(id) on delete set null,
  comprador_nome    text   not null,
  comprador_contato text,
  quantidade        integer not null check (quantidade > 0),
  meia_entrada      integer not null default 0
    check (meia_entrada >= 0 and meia_entrada <= quantidade),
  valor_unitario    numeric(10,2) not null check (valor_unitario >= 0),
  valor_meia        numeric(10,2) check (valor_meia is null or valor_meia >= 0),
  desconto_pct      numeric(5,2) not null default 0 check (desconto_pct between 0 and 100),
  valor_bruto       numeric(10,2) generated always as (
    (quantidade - meia_entrada) * valor_unitario + meia_entrada * coalesce(valor_meia, 0)
  ) stored,
  -- valor_final gravado (nao gerado): a equipe pode ajustar centavos na hora sem mentir o pct
  valor_final       numeric(10,2) not null check (valor_final >= 0),
  forma_pagamento   text not null
    check (forma_pagamento in ('pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'outro')),
  -- canal = onde a venda aconteceu: link mandado pela equipe, balcao, ou a porta no dia
  canal             text not null check (canal in ('online', 'balcao', 'porta')),
  -- qual maquininha/conta recebeu — para a Sol casar com o extrato certo
  provedor          text check (provedor in ('rede', 'pagbank')),
  -- SEM status automatico: pendente -> pago -> cancelado/reembolsado, tudo pela equipe
  status            text not null default 'pendente'
    check (status in ('pendente', 'pago', 'cancelado', 'reembolsado')),
  -- quando o dinheiro de fato caiu — e o que a Sol casa com o extrato
  pago_em                  timestamptz,
  -- NSU / codigo de autorizacao do cartao, ou ID do comprovante Pix.
  -- Sem ele a Sol so chuta pelo valor: obrigatorio ao marcar pago, exceto dinheiro.
  pagamento_identificador  text,
  -- ponte com o caixa diario do Super Folha (a Sol escreve via RPC abaixo)
  -- 'estornado' = a venda foi reembolsada/cancelada DEPOIS de conciliada, e a Sol
  -- ja lancou o estorno no caixa.
  conciliacao_status       text not null default 'pendente'
    check (conciliacao_status in ('pendente', 'conciliado', 'divergente', 'estornado')),
  conciliado_em            timestamptz,
  conciliacao_ref          text,   -- id do lancamento no caixa do Super Folha
  conciliacao_obs          text,   -- motivo da divergencia, quando houver
  observacao        text,
  registrado_por    uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- pago sempre com identificador + horario real — so o dinheiro dispensa o identificador
  constraint evento_ingresso_venda_pago_identificado check (
    status <> 'pago'
    or (forma_pagamento = 'dinheiro' and pago_em is not null)
    or (pagamento_identificador is not null and pago_em is not null)
  ),
  -- conciliacao so faz sentido em quem ja foi pago. 'reembolsado'/'cancelado' precisam
  -- conviver com conciliacao ja feita — senao a equipe fica sem registrar o estorno
  -- (bug apontado na v3). 'estornado' so vale depois que a venda terminou assim.
  constraint evento_ingresso_venda_conciliacao_coerente check (
       conciliacao_status = 'pendente'
    or (conciliacao_status in ('conciliado', 'divergente')
        and status in ('pago', 'reembolsado', 'cancelado'))
    or (conciliacao_status = 'estornado'
        and status in ('reembolsado', 'cancelado'))
  )
);
comment on table public.evento_ingresso_venda is
  'Toda venda de ingresso, registrada pela equipe (link enviado a mao, maquininha, Pix, '
  'dinheiro). A Sol concilia cada venda paga com o que caiu no banco e lanca no caixa '
  'diario do Super Folha — o LA Report so expoe a lista e recebe o veredito.';

create or replace function public.fn_evento_ingresso_venda_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  if new.unidade_id is null then
    raise exception 'evento_ingresso_venda: evento % nao existe', new.evento_id
      using errcode = 'P0001';
  end if;
  -- participacao vinculada, quando ha, e deste evento
  if new.participacao_id is not null and
     (select p.evento_id from public.evento_participacao p where p.id = new.participacao_id)
       is distinct from new.evento_id
  then
    raise exception 'evento_ingresso_venda: participacao nao e deste evento'
      using errcode = 'P0001';
  end if;
  -- o bloco vendido tem que ser deste evento
  if (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
     is distinct from new.evento_id
  then
    raise exception 'evento_ingresso_venda: bloco nao e deste evento'
      using errcode = 'P0001';
  end if;
  new.registrado_por := coalesce(new.registrado_por, auth.uid());
  new.provedor       := coalesce(new.provedor,
                         (select e.provedor_pagamento from public.evento e
                           where e.id = new.evento_id));
  return new;
end;
$$;
create trigger trg_evento_ingresso_venda_deriva
  before insert or update of evento_id, participacao_id, bloco_id on public.evento_ingresso_venda
  for each row execute function public.fn_evento_ingresso_venda_deriva();
create trigger trg_evento_ingresso_venda_touch
  before update on public.evento_ingresso_venda
  for each row execute function public.fn_evento_touch();
create trigger trg_audit_evento_ingresso_venda
  after insert or update or delete on public.evento_ingresso_venda
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_ingresso_preco
  after insert or update or delete on public.evento_ingresso_preco
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_ingresso_pacote
  after insert or update or delete on public.evento_ingresso_pacote
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_ingresso_venda enable row level security;
create policy evento_ingresso_venda_escopada on public.evento_ingresso_venda
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
-- preco/pacote: leitura e escrita por unidade do evento
alter table public.evento_ingresso_preco enable row level security;
alter table public.evento_ingresso_pacote enable row level security;
create policy evento_ingresso_preco_escopada on public.evento_ingresso_preco
  for all using (
    is_admin() or exists (select 1 from public.evento e
      where e.id = evento_id and e.unidade_id in (select get_user_unidade_ids())))
  with check (
    is_admin() or exists (select 1 from public.evento e
      where e.id = evento_id and e.unidade_id in (select get_user_unidade_ids())));
create policy evento_ingresso_pacote_escopada on public.evento_ingresso_pacote
  for all using (
    is_admin() or exists (select 1 from public.evento e
      where e.id = evento_id and e.unidade_id in (select get_user_unidade_ids())))
  with check (
    is_admin() or exists (select 1 from public.evento e
      where e.id = evento_id and e.unidade_id in (select get_user_unidade_ids())));

-- o ingresso vendido e um convidado nominal — cortesia e venda na mesma lista da porta
alter table public.evento_convidado
  add column if not exists tipo_entrada text not null default 'cortesia'
    check (tipo_entrada in ('cortesia', 'vendido')),
  add column if not exists venda_id bigint
    references public.evento_ingresso_venda(id) on delete set null,
  add column if not exists meia_entrada boolean not null default false,
  -- bloco que a pessoa vai assistir (NULL = ainda sem credenciamento definido)
  add column if not exists bloco_id bigint references public.evento_bloco(id) on delete set null,
  add constraint evento_convidado_entrada_coerente check (
    (tipo_entrada = 'vendido'  and venda_id is not null and bloco_id is not null)
    or (tipo_entrada = 'cortesia' and venda_id is null)
  );

-- cortesia sem bloco herda o bloco da PRIMEIRA apresentacao do aluno no evento
-- (irmao vinculado depois nao puxa o convidado pro bloco dele: o primeiro vinculo ganha)
create or replace function public.fn_evento_convidado_herda_bloco()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  update public.evento_convidado c
     set bloco_id = (
       select ap.bloco_id
         from public.evento_participacao p
         join public.evento_apresentacao ap
           on ap.evento_id = p.evento_id and ap.pessoa_chave = p.pessoa_chave
        where p.id = new.participacao_id
          and ap.bloco_id is not null
        order by ap.ordem
        limit 1
     )
   where c.id = new.convidado_id
     and c.bloco_id is null
     and c.tipo_entrada = 'cortesia';
  return new;
end;
$$;

create trigger trg_evento_convidado_herda_bloco
  after insert on public.evento_convidado_participacao
  for each row execute function public.fn_evento_convidado_herda_bloco();

-- deriva v2 do convidado: unidade do evento + bloco e venda do MESMO evento quando ligados
create or replace function public.fn_evento_convidado_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  if new.unidade_id is null then
    raise exception 'evento_convidado: evento % nao existe', new.evento_id using errcode = 'P0001';
  end if;
  if new.bloco_id is not null and
     (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
       is distinct from new.evento_id
  then
    raise exception 'evento_convidado: bloco nao e deste evento' using errcode = 'P0001';
  end if;
  if new.venda_id is not null and
     (select v.evento_id from public.evento_ingresso_venda v where v.id = new.venda_id)
       is distinct from new.evento_id
  then
    raise exception 'evento_convidado: venda nao e deste evento' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- o check-in da M3 ganha a regra do vendido: ingresso vendido so entra com a venda PAGA
create or replace function public.fn_evento_convidado_checkin_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if (select c.evento_id from public.evento_convidado c where c.id = new.convidado_id)
     is distinct from
     (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
  then
    raise exception 'evento_convidado_checkin: bloco nao e do evento do convidado'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.evento_convidado c
      join public.evento_ingresso_venda v on v.id = c.venda_id
     where c.id = new.convidado_id
       and v.status <> 'pago'
  ) then
    raise exception 'Ingresso vendido so entra com a venda paga.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- lotacao por bloco: cortesias + vendas vivas (pendente segura lugar; cancelado libera)
create or replace view public.vw_evento_bloco_lotacao as
select b.id as bloco_id,
       b.evento_id,
       b.capacidade,
       count(*) filter (where c.tipo_entrada = 'cortesia')                       as cortesias,
       count(*) filter (where v.status = 'pago')                                 as vendidos_pagos,
       count(*) filter (where v.status = 'pendente')                             as pendentes,
       b.capacidade
         - count(*) filter (where c.tipo_entrada = 'cortesia')
         - count(*) filter (where v.status in ('pago', 'pendente'))              as livres
  from public.evento_bloco b
  left join public.evento_convidado c on c.bloco_id = b.id
  left join public.evento_ingresso_venda v on v.id = c.venda_id
 group by b.id, b.evento_id, b.capacidade;
comment on view public.vw_evento_bloco_lotacao is
  'Lugares por bloco. Convidado sem bloco_id (ainda nao credenciado) nao conta em bloco '
  'nenhum. livres NULL = sem teto. Cancelado/reembolsado libera o lugar na hora.';

create or replace function public.evento_bilheteria_vender_v1(
  p_evento_id        bigint,
  p_bloco_id         bigint,
  p_comprador_nome   text,
  p_quantidade       integer,
  p_forma_pagamento  text,
  p_canal            text,
  p_comprador_contato text default null,
  p_participacao_id  bigint default null,
  p_pacote_id        bigint default null,
  p_convidados       jsonb default '[]'::jsonb,   -- [{nome, documento?}] — nome vazio vira "Convidado N de <comprador>"
  p_marcar_pago      boolean default false,
  p_pagamento_identificador text default null,
  p_observacao       text default null
)
returns bigint  -- venda_id
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_unidade    uuid;
  v_capacidade integer;
  v_livres     integer;
  v_preco      public.evento_ingresso_preco%rowtype;
  v_desconto   numeric(5,2) := 0;
  v_bruto      numeric(10,2);
  v_final      numeric(10,2);
  v_venda_id   bigint;
  v_conv       record;
  v_meias      integer;
begin
  -- evento e bloco do mesmo evento
  select e.unidade_id into v_unidade from public.evento e where e.id = p_evento_id;
  if v_unidade is null then
    raise exception 'evento % nao existe', p_evento_id using errcode = 'P0001';
  end if;

  -- SECURITY DEFINER ignora a RLS da venda — o escopo da unidade e conferido
  -- aqui dentro, na mesma regra das policies (is_admin / get_user_unidade_ids).
  -- anon cai neste raise: auth.uid() nulo devolve lista vazia.
  if not (public.is_admin() or v_unidade in (select public.get_user_unidade_ids())) then
    raise exception 'Sem acesso a este evento.' using errcode = 'P0001';
  end if;
  select b.capacidade into v_capacidade
    from public.evento_bloco b
   where b.id = p_bloco_id and b.evento_id = p_evento_id
   for update of b;                       -- trava o bloco ate o fim da transacao
  if not found then
    raise exception 'bloco % nao e do evento %', p_bloco_id, p_evento_id using errcode = 'P0001';
  end if;

  -- lugares livres, mesma regra da view (cortesia + pendente/pago ocupam)
  if v_capacidade is not null then
    select v_capacidade
           - count(*) filter (where c.tipo_entrada = 'cortesia')
           - count(*) filter (where v.status in ('pago', 'pendente'))
      into v_livres
      from public.evento_convidado c
      left join public.evento_ingresso_venda v on v.id = c.venda_id
     where c.bloco_id = p_bloco_id;
    if coalesce(v_livres, v_capacidade) < p_quantidade then
      raise exception 'Bloco lotado: % lugares livres, % pedidos.',
        coalesce(v_livres, v_capacidade), p_quantidade using errcode = 'P0001';
    end if;
  end if;

  -- convidados nominais: a lista tem que bater com a quantidade (nome pode vir
  -- vazio — vira "Convidado N de <comprador>", editavel ate o dia)
  if jsonb_array_length(p_convidados) <> p_quantidade then
    raise exception 'Informe os % nomes dos convidados.', p_quantidade using errcode = 'P0001';
  end if;

  -- preco do evento + pacote
  select * into v_preco from public.evento_ingresso_preco p where p.evento_id = p_evento_id;
  if not found then
    raise exception 'Evento % sem tabela de preco cadastrada.', p_evento_id using errcode = 'P0001';
  end if;
  if p_pacote_id is not null then
    select p.desconto_pct into v_desconto
      from public.evento_ingresso_pacote p
     where p.id = p_pacote_id and p.evento_id = p_evento_id
       and p.quantidade_minima <= p_quantidade;
    if not found then
      raise exception 'Pacote % nao vale para este evento/quantidade.', p_pacote_id
        using errcode = 'P0001';
    end if;
  else
    -- melhor pacote automatico: maior desconto que a quantidade habilita
    select max(p.desconto_pct) into v_desconto
      from public.evento_ingresso_pacote p
     where p.evento_id = p_evento_id and p.quantidade_minima <= p_quantidade;
    v_desconto := coalesce(v_desconto, 0);
  end if;

  -- decisao do Alf: TODOS pagam o preco cobrado (preco_meia) quando ele esta
  -- cadastrado; o unitario fica so de referencia. Sem meia cadastrada, todos
  -- pagam a inteira.
  v_meias := case when v_preco.preco_meia is not null then p_quantidade else 0 end;

  v_bruto := (p_quantidade - v_meias) * v_preco.preco_unitario
           + v_meias * coalesce(v_preco.preco_meia, 0);
  v_final := round(v_bruto * (1 - v_desconto / 100), 2);

  insert into public.evento_ingresso_venda (
    evento_id, bloco_id, participacao_id, comprador_nome, comprador_contato,
    quantidade, meia_entrada, pacote_id,
    valor_unitario, valor_meia, desconto_pct, valor_final,
    forma_pagamento, canal, status,
    pagamento_identificador, pago_em, observacao
  ) values (
    p_evento_id, p_bloco_id, p_participacao_id, p_comprador_nome, p_comprador_contato,
    p_quantidade, v_meias, p_pacote_id,
    v_preco.preco_unitario, v_preco.preco_meia, v_desconto, v_final,
    p_forma_pagamento, p_canal,
    case when p_marcar_pago then 'pago' else 'pendente' end,
    case when p_marcar_pago then p_pagamento_identificador end,
    case when p_marcar_pago then now() end,
    p_observacao
  ) returning id into v_venda_id;

  -- um convidado nominal por ingresso; nome vazio vira placeholder editavel
  for v_conv in
    select row_number() over () as i, value
      from jsonb_array_elements(p_convidados)
  loop
    insert into public.evento_convidado (
      evento_id, nome, documento, tipo_entrada, venda_id, bloco_id, meia_entrada
    ) values (
      p_evento_id,
      coalesce(nullif(btrim(v_conv.value->>'nome'), ''),
               'Convidado ' || v_conv.i || ' de ' || p_comprador_nome),
      v_conv.value->>'documento',
      'vendido',
      v_venda_id,
      p_bloco_id,
      v_meias = p_quantidade
    );
  end loop;

  return v_venda_id;
end;
$$;

-- a UI (equipe logada) chama; o escopo da unidade e conferido dentro da RPC
-- (SECURITY DEFINER ignora RLS). Revogar anon/public: sem o revoke o default
-- de privileges do Supabase deixaria a funcao executavel sem login.
revoke all on function public.evento_bilheteria_vender_v1(
  bigint, bigint, text, integer, text, text, text, bigint, bigint, jsonb, boolean, text, text
) from public, anon;
grant execute on function public.evento_bilheteria_vender_v1(
  bigint, bigint, text, integer, text, text, text, bigint, bigint, jsonb, boolean, text, text
) to authenticated;

-- o que a Sol le: vendas PAGAS ainda nao conciliadas, por unidade/periodo
create or replace function public.evento_bilheteria_pendentes_v1(
  p_unidade_id uuid default null,
  p_de         timestamptz default null,
  p_ate        timestamptz default null
)
returns table (
  venda_id bigint, evento_id bigint, unidade_id uuid,
  comprador_nome text, quantidade integer, valor_final numeric,
  forma_pagamento text, canal text, provedor text,
  pagamento_identificador text, pago_em timestamptz
)
language sql stable security definer
set search_path = 'public', 'pg_temp'
as $$
  select v.id, v.evento_id, v.unidade_id, v.comprador_nome, v.quantidade, v.valor_final,
         v.forma_pagamento, v.canal, v.provedor, v.pagamento_identificador, v.pago_em
    from public.evento_ingresso_venda v
   where v.status = 'pago'
     and v.conciliacao_status = 'pendente'
     and (p_unidade_id is null or v.unidade_id = p_unidade_id)
     and (p_de  is null or v.pago_em >= p_de)
     and (p_ate is null or v.pago_em <  p_ate)
   order by v.pago_em;
$$;

-- o veredito da Sol: 'conciliado' (com o id do lancamento no Super Folha), 'divergente',
-- ou 'estornado' depois que a venda foi reembolsada/cancelada
create or replace function public.evento_bilheteria_conciliar_v1(
  p_venda_id bigint,
  p_status   text,           -- 'conciliado' | 'divergente' | 'estornado'
  p_ref      text default null,
  p_obs      text default null
)
returns void language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_status  text;
  v_conc    text;
begin
  if p_status not in ('conciliado', 'divergente', 'estornado') then
    raise exception 'status de conciliacao invalido: %', p_status using errcode = 'P0001';
  end if;
  select status, conciliacao_status into v_status, v_conc
    from public.evento_ingresso_venda where id = p_venda_id;
  if v_status is null then
    raise exception 'venda % nao existe', p_venda_id using errcode = 'P0001';
  end if;
  -- estorno so existe depois da baixa financeira: a venda tem que ter terminado
  -- reembolsada/cancelada E ja ter sido conciliada antes
  if p_status = 'estornado' and
     not (v_status in ('reembolsado', 'cancelado') and v_conc = 'conciliado') then
    raise exception 'venda % so pode ser estornada depois de conciliada e reembolsada/cancelada',
      p_venda_id using errcode = 'P0001';
  end if;
  if p_status <> 'estornado' and v_status <> 'pago' then
    raise exception 'venda % nao esta paga', p_venda_id using errcode = 'P0001';
  end if;
  perform set_config('app.origem_escrita', 'sol', true);  -- audit registra origem sol
  update public.evento_ingresso_venda
     set conciliacao_status = p_status,
         conciliado_em      = now(),
         conciliacao_ref    = coalesce(p_ref, conciliacao_ref),
         conciliacao_obs    = coalesce(p_obs, conciliacao_obs),
         updated_at         = now()
   where id = p_venda_id;
end;
$$;

-- o feed de estorno: vendas que foram reembolsadas/canceladas DEPOIS de conciliadas.
-- A Sol le, lanca o estorno no caixa e devolve conciliar_v1(p_status='estornado').
create or replace function public.evento_bilheteria_estornos_v1(
  p_unidade_id uuid default null,
  p_de         timestamptz default null,
  p_ate        timestamptz default null
)
returns table (
  venda_id bigint, evento_id bigint, unidade_id uuid,
  comprador_nome text, quantidade integer, valor_final numeric,
  forma_pagamento text, canal text, provedor text,
  pagamento_identificador text, pago_em timestamptz,
  conciliacao_ref text, status text, updated_at timestamptz
)
language sql stable security definer
set search_path = 'public', 'pg_temp'
as $$
  select v.id, v.evento_id, v.unidade_id, v.comprador_nome, v.quantidade, v.valor_final,
         v.forma_pagamento, v.canal, v.provedor, v.pagamento_identificador, v.pago_em,
         v.conciliacao_ref, v.status, v.updated_at
    from public.evento_ingresso_venda v
   where v.conciliacao_status = 'conciliado'
     and v.status in ('reembolsado', 'cancelado')
     and (p_unidade_id is null or v.unidade_id = p_unidade_id)
     and (p_de  is null or v.updated_at >= p_de)
     and (p_ate is null or v.updated_at <  p_ate)
   order by v.updated_at;
$$;

-- so a edge da Sol (service_role) chama — nem usuario logado escreve conciliacao
revoke all on function public.evento_bilheteria_pendentes_v1(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.evento_bilheteria_pendentes_v1(uuid, timestamptz, timestamptz)
  to service_role;
revoke all on function public.evento_bilheteria_conciliar_v1(bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.evento_bilheteria_conciliar_v1(bigint, text, text, text)
  to service_role;
revoke all on function public.evento_bilheteria_estornos_v1(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.evento_bilheteria_estornos_v1(uuid, timestamptz, timestamptz)
  to service_role;
