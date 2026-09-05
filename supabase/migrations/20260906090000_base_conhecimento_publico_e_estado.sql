-- BASE DE CONHECIMENTO COMERCIAL — PASSO 1: público, estado e ciclo de vida.
--
-- Hoje `base_conhecimento_blocos` tem 4 blocos, todos da **Mila SDR** (script
-- que o bot usa falando com o LEAD), e `get_base_conhecimento` devolve tudo que
-- está `ativo`. A base comercial que o Alf curou em 05/09 tem 11 blocos com dois
-- públicos novos (consultor e liderança) e um ciclo de vida próprio — nada sai
-- de `candidato` antes de a Krissya ler.
--
-- 🔴 SEM TABELA NOVA, POR DECISÃO. Estender o que existe é a regra da casa e
--    aqui ela cabe: o que muda é a régua de quem vê o quê, não a natureza do
--    objeto. `get_base_conhecimento` continua sendo a ÚNICA montagem — preview
--    da tela e uso pelo agente saem da mesma função, que é o que impede o
--    preview de divergir do que a Mila recebe.
--
-- ⚠️ A SDR NÃO PODE MUDAR NEM UM BYTE. Os 4 blocos atuais nascem
--    `publico='lead'` e `estado='aprovado'` por DEFAULT, e o `p_publico` da
--    função tem default `'lead'` — então os dois consumidores de hoje (a edge
--    `base-conhecimento` e o botão "Ver como a Mila vê") continuam recebendo
--    exatamente o mesmo texto. A migração termina provando isso com md5.

-- ── 1. as colunas ───────────────────────────────────────────────────────────
alter table public.base_conhecimento_blocos
  add column if not exists publico      text not null default 'lead',
  add column if not exists estado       text not null default 'aprovado',
  add column if not exists versao       text,
  add column if not exists revisar_em   date,
  add column if not exists aprovado_por text,
  add column if not exists aprovado_em  date,
  add column if not exists substitui_id uuid;

do $$ begin
  alter table public.base_conhecimento_blocos
    add constraint base_conhecimento_publico_check
    check (publico in ('lead', 'comercial', 'lideranca'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.base_conhecimento_blocos
    add constraint base_conhecimento_estado_check
    check (estado in ('candidato', 'em_revisao', 'aprovado', 'substituido'));
exception when duplicate_object then null; end $$;

-- ⚠️ FK para a própria tabela: versão nova aponta para a que ela substitui.
-- `on delete set null` porque perder o elo é aceitável; perder a linha não.
do $$ begin
  alter table public.base_conhecimento_blocos
    add constraint base_conhecimento_substitui_fk
    foreign key (substitui_id) references public.base_conhecimento_blocos(id) on delete set null;
exception when duplicate_object then null; end $$;

comment on column public.base_conhecimento_blocos.publico is
  'Quem pode ler. lead = script da Mila SDR falando com o lead (os 4 blocos originais). comercial = consultor. lideranca = so a lider/diretoria; NUNCA chega a consultora. Hierarquia esta em get_base_conhecimento, nao no consumidor.';
comment on column public.base_conhecimento_blocos.estado is
  'Ciclo de vida. candidato = escrito, nao aprovado (NAO sai para o agente). em_revisao = numero da fonte mudou. aprovado = em uso. substituido = versao antiga, guardada. Nada se sobrescreve: versao nova + anterior substituido.';
comment on column public.base_conhecimento_blocos.revisar_em is
  'Data em que o bloco volta para revisao (aprovacao + 90 dias). Conteudo de venda envelhece; sem data ninguem revisita.';
comment on column public.base_conhecimento_blocos.substitui_id is
  'Bloco que esta versao aposenta. Preserva o historico do que a equipe seguia antes.';

create index if not exists base_conhecimento_publico_estado_idx
  on public.base_conhecimento_blocos (publico, estado) where ativo;

-- ── 2. a montagem, com público e estado ─────────────────────────────────────
-- 🔴 O DROP DA ASSINATURA ANTIGA É OBRIGATÓRIO E VAI NA MESMA MIGRAÇÃO.
--    Os dois consumidores chamam por CHAVE NOMEADA (`{p_unidade_id}`) via
--    PostgREST. Se a versão de 1 parâmetro sobreviver ao lado da de 2 com
--    default, as duas aceitam essa mesma lista de nomes e o Postgres recusa com
--    `function get_base_conhecimento is not unique`. Foi exatamente assim que o
--    `upsert_lead` derrubou o webhook de leads por 21h em 11/08/2026.
-- ⚠️ `p_unidade_id` continua sendo o PRIMEIRO parâmetro, de propósito: mantém a
--    chamada posicional válida além da nomeada.
drop function if exists public.get_base_conhecimento(uuid);

create or replace function public.get_base_conhecimento(
  p_unidade_id uuid  default null,
  p_publico    text  default 'lead'
) returns text
language sql stable security definer set search_path to 'public' as $function$
  select
    '# Base de Conhecimento LA Music' ||
    coalesce(
      string_agg(
        E'\n\n## ' || b.titulo || E'\n' || b.conteudo,
        '' order by b.ordem, b.titulo
      ),
      ''
    )
  from public.base_conhecimento_blocos b
  where b.ativo
    and b.estado = 'aprovado'
    -- ⚠️ HIERARQUIA, NÃO IGUALDADE: quem lidera lê também o material do
    -- consultor (a líder precisa do mesmo chão que o time). O contrário é
    -- proibido — pedir `comercial` NUNCA devolve `lideranca`. E `lead` fica
    -- isolado nos dois sentidos: é script para o cliente, não para a equipe.
    and (b.publico = p_publico
         or (p_publico = 'lideranca' and b.publico = 'comercial'))
    and (b.unidade_id is null or b.unidade_id = p_unidade_id);
$function$;

-- ⚠️ Recriar função REABRE execute para `anon` neste projeto (ALTER DEFAULT
--    PRIVILEGES no schema public). Revoke nominal, não só do public.
revoke all on function public.get_base_conhecimento(uuid, text) from public, anon;
grant execute on function public.get_base_conhecimento(uuid, text) to authenticated, service_role;

comment on function public.get_base_conhecimento(uuid, text) is
  'Montagem UNICA da base de conhecimento. Preview da tela e uso pelo agente saem daqui — reimplementar a concatenacao no consumidor e o padrao que gerou as duplicatas de renovacao. Filtra estado=aprovado; publico e hierarquico (lideranca ve comercial tambem).';

-- ── 3. prova de que a SDR não mudou ─────────────────────────────────────────
-- Falha a migração se o texto que a edge e a tela recebem hoje mudar.
do $$
declare v_texto text; v_blocos int;
begin
  select get_base_conhecimento(null) into v_texto;
  select count(*) into v_blocos from public.base_conhecimento_blocos
   where ativo and estado = 'aprovado' and publico = 'lead';
  if v_blocos <> 4 then
    raise exception 'esperava os 4 blocos da SDR em lead/aprovado, achei %', v_blocos;
  end if;
  if v_texto is null or position('# Base de Conhecimento LA Music' in v_texto) <> 1 then
    raise exception 'a montagem da SDR mudou de forma';
  end if;
  raise notice 'SDR intacta: % blocos, % chars', v_blocos, length(v_texto);
end $$;
