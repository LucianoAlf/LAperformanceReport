-- T2 (calor do lead) · 1º ANDAR · camada OPERACIONAL
--
-- PARA QUE EXISTE: `leads.temperatura` é 98% "quente" por default e
-- `qtd_mensagens_mila`, `qtd_tentativas_sem_resposta`, `qtd_desmarcacoes` são
-- **zero/null em 100%** dos 2.740 leads de 90 dias. Foram desenhados e nunca
-- alimentados. O calor tem de sair da CONVERSA.
--
-- ⚠️ NÃO inventa score "quente/morno/frio". Guarda FATO: chegou a humano?
--    quanto demorou? quantas mensagens o contato mandou? Score sem evidência de
--    que prediz algo seria número inventado — e a arquitetura aqui é o oposto.
--
-- ⚠️ Espelho do projeto SOL (`vw_atendimento_calor_conversa`), ingerido pela
--    edge `ingerir-calor-atendimento`. SQL não atravessa projeto.

create table if not exists public.atendimento_conversa_estado (
  conversa_id          bigint primary key,
  inbox_id             bigint,
  inbox_nome           text,
  unidade_texto        text,
  unidade_id           uuid,
  departamento         text,
  telefone             text,
  telefone_key         text,
  contato_nome         text,
  assignee_nome        text,
  conversa_status      text,
  ultima_msg_em        timestamptz,
  ultimo_autor         text,
  horas_desde_ultima   int,
  primeiro_contato_em  timestamptz,
  primeiro_humano_em   timestamptz,
  houve_humano         boolean not null default false,
  so_falou_com_bot     boolean not null default false,
  minutos_ate_humano   int,
  msgs_do_contato      int not null default 0,
  msgs_do_bot          int not null default 0,
  atualizado_em        timestamptz not null default now()
);

create index if not exists atendimento_conversa_estado_tel_idx
  on public.atendimento_conversa_estado (telefone_key);
create index if not exists atendimento_conversa_estado_depto_idx
  on public.atendimento_conversa_estado (departamento, ultima_msg_em desc);

alter table public.atendimento_conversa_estado enable row level security;
-- ⚠️ ALTER DEFAULT PRIVILEGES deste schema da `authenticated=arwdDxtm` a toda
--    relacao nova — revogar ANTES de conceder.
revoke all on public.atendimento_conversa_estado from public, anon, authenticated;
grant select on public.atendimento_conversa_estado to authenticated;

drop policy if exists atendimento_conversa_estado_le on public.atendimento_conversa_estado;
create policy atendimento_conversa_estado_le
  on public.atendimento_conversa_estado for select to authenticated
  using ((select public.is_admin())
         or unidade_id in (select public.get_user_unidade_ids()));

comment on table public.atendimento_conversa_estado is
  'T2/1o andar/operacional. Espelho dos FATOS da conversa do Chatwoot (projeto SOL), ingerido pela edge `ingerir-calor-atendimento`. ⚠️ "humano" = agente que nao e Mila. ⚠️ minutos_ate_humano NEGATIVO = nos iniciamos a conversa. ⚠️ departamento comercial so existe desde 03/09/2026.';

-- ── Regra: o lead falou, so o bot respondeu, e ninguem apareceu ──────────────
-- ⚠️ SO esta regra, de proposito. "Lead esperando resposta" ja e coberto pelo
--    extrator semantico (`vw_atendimento_candidatos_sinal` filtra exatamente
--    conversa em que o contato falou por ultimo). Duas regras para o mesmo fato
--    viram dois avisos para a mesma pessoa — e o canal que repete ensina a
--    ignorar. O que so ESTA regra enxerga e o lead que NUNCA chegou a um humano.
insert into public.radar_regras
  (codigo, titulo, descricao, entidade_tipo, origem, severidade_padrao,
   canonico, ativo, orientacao_padrao, versao, dominio, lastro)
values (
  'R18',
  'Lead preso no bot — nunca falou com gente',
  'Conversa comercial em que o contato escreveu, so a Mila respondeu, e ja se passaram 2h ou mais sem nenhum agente humano entrar.',
  'lead', 'sql_atendimento', 'alto', true, true,
  'Entrar na conversa AGORA e assumir. Nao recomecar do zero: ler o que a Mila ja perguntou e continuar dali — repetir a pergunta que a pessoa ja respondeu e o que faz o lead desistir.',
  'v1', 'comercial',
  'Medido em 04/09/2026, primeiros 2 dias do espelho comercial: 117 conversas, 58 (50%) NUNCA tiveram um agente humano. A mediana ate o primeiro humano e negativa (-5 min), o que significa que a maioria das conversas com humano foi INICIADA por nos — quem chega sozinho tende a ficar so com o bot. ⚠️ Base curta: o departamento comercial so entrou no espelho em 03/09.'
)
on conflict (codigo) do update set
  titulo = excluded.titulo, descricao = excluded.descricao,
  orientacao_padrao = excluded.orientacao_padrao, lastro = excluded.lastro,
  ativo = true, atualizada_em = now();
