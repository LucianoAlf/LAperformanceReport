-- Fase 3 do rastreio do Google: devolver a matricula ao Google Ads.
--
-- POR QUE EXISTE: hoje a conta declara 2.510 conversoes (clique no botao de WhatsApp) contra
-- ~23 matriculas reais no mesmo periodo. O Smart Bidding persegue o que a gente declara, entao
-- ele esta otimizando para clique em botao -- que nao paga salario. Mandar de volta "este
-- clique virou matricula, R$ X" troca a regua do algoritmo.
--
-- ⚠️ ESTA MIGRATION NAO ENVIA NADA. Ela cria o registro do que foi (ou sera) enviado e a fila.
-- Quem envia e a edge `enviar-conversoes-google-ads`, e ela nasce em dry run.
--
-- ⚠️ O VALOR e `passaporte + 12 mensalidades`, medido em 17/09/2026 e nao estimado:
--   parcela mediana R$ 387 (desvio R$ 56,85 -- CV de 14,6%, o ticket quase nao varia)
--   passaporte medio R$ 409,54, presente em 428 de 725 matriculas
--   permanencia de quem JA SAIU (n=307): mediana 12 meses, media 15,6
-- Doze meses porque e a mediana medida E a duracao do contrato -- fato assinado, nao projecao.
-- A media de 15,6 e coorte fechada (so quem saiu), entao subestima o LTV real: para valor de
-- conversao essa e a direcao certa do erro. Superestimar faz o Google gastar o que o caixa nao
-- aguenta; subestimar so deixa oportunidade na mesa.

create table if not exists public.google_ads_conversoes (
  id           bigserial primary key,
  aluno_id     integer      not null references public.alunos(id) on delete cascade,
  gclid        text         not null,
  tipo         text         not null default 'matricula',
  valor        numeric(12,2) not null,
  moeda        text         not null default 'BRL',
  ocorrido_em  timestamptz  not null,
  via          text,
  clique_em    timestamptz,
  enviado_em   timestamptz,
  tentativas   integer      not null default 0,
  ultimo_erro  text,
  resposta     jsonb,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now(),

  -- Idempotencia: um aluno gera no maximo UMA conversao de matricula. Sem isso, um cron que
  -- rode duas vezes ensina o Google que a escola matriculou o dobro -- e conversao enviada
  -- nao se apaga, so se retrata por outra chamada de API.
  constraint google_ads_conversoes_unica unique (aluno_id, tipo)
);

create index if not exists idx_google_ads_conversoes_fila
  on public.google_ads_conversoes (created_at)
  where enviado_em is null;

comment on table public.google_ads_conversoes is
  'Registro das conversoes offline enviadas ao Google Ads (UploadClickConversions). Uma linha por aluno+tipo. `enviado_em` nulo = ainda na fila; `ultimo_erro` preenchido com `enviado_em` nulo = tentou e falhou.';

comment on column public.google_ads_conversoes.via is
  'Como o gclid foi alcancado: `lead_origem` (aluno.lead_origem_id -> leads.gclid, cobre 91,6% das matriculas) ou `telefone` (rede de seguranca pelos ultimos 8 digitos, para os 8,4% sem lead_origem_id).';

comment on column public.google_ads_conversoes.ocorrido_em is
  'Instante que vai no conversion_date_time. E o `alunos.created_at`, nao a `data_matricula`: a data pura nao tem hora, e o Google DEDUPLICA conversoes do mesmo gclid com o mesmo timestamp -- dois irmaos matriculados no mesmo dia pelo mesmo clique virariam um so.';

comment on column public.google_ads_conversoes.valor is
  'passaporte + (parcela x 12). Ver o cabecalho desta migration para a medicao que sustenta o 12.';

-- Mesma politica do resto do projeto: a tabela nunca e exposta na API.
-- Quem escreve e a edge function com service_role, que ignora RLS.
alter table public.google_ads_conversoes enable row level security;


-- A FILA: aluno matriculado, com gclid alcancavel, que ainda nao foi enviado.
--
-- ⚠️ DUAS PORTAS, e a segunda nao e preciosismo: `lead_origem_id` cobre 91,6% das matriculas
-- dos ultimos 90 dias (185 de 202). Sem a porta do telefone, 1 em cada 12 matriculas pagas
-- pelo Google seria invisivel para o algoritmo -- e o erro seria silencioso, porque um aluno
-- que nao entra na fila nao gera linha, nao gera log e nao gera alarme.
--
-- ⚠️ A porta do telefone casa por SUFIXO de 8 digitos e so vale quando a porta 1 nao existe.
--
-- O sufixo de 8 foi MEDIDO nesta base antes de ser adotado (17/09/2026): entre 1.151 alunos
-- ha 165 sufixos repetidos, e ao abrir cada um, 126 sao o mesmo telefone completo (irmaos,
-- que dividem o numero do responsavel) e os outros 39 sao o MESMO numero gravado com e sem o
-- prefixo 55 -- `21964441961` contra `5521964441961`. Nenhum e pessoa diferente.
-- Aumentar o sufixo para 9, 10 ou 11 digitos nao muda nada (38 grupos em todos), o que
-- confirma que a variacao e de FORMATO, nao de numero. Endurecer aqui perderia os casos com
-- 55 sem ganhar precisao nenhuma.
--
-- ⚠️ Irmaos entrando os dois e o comportamento CERTO: um clique que matriculou dois filhos
-- gerou duas matriculas de receita, e o Google precisa saber das duas. Por isso `ocorrido_em`
-- usa `alunos.created_at` (com hora) e nao `data_matricula` -- ver o comentario da coluna.
create or replace view public.google_ads_conversoes_fila as
select a.id                                   as aluno_id,
       a.nome,
       a.data_matricula,
       a.created_at                           as ocorrido_em,
       round(coalesce(a.valor_passaporte, 0)
             + coalesce(a.valor_parcela, 0) * 12, 2) as valor,
       g.gclid,
       g.via,
       g.clique_em
  from public.alunos a
 cross join lateral (
   select gclid, via, clique_em
     from (
       -- Porta 1: o lead que originou o aluno carrega o gclid.
       select l.gclid,
              'lead_origem'::text as via,
              coalesce(c.conversa_criada_em, c.created_at) as clique_em,
              1 as prio
         from public.leads l
         left join public.google_ads_cliques c on c.lead_id = l.id
        where l.id = a.lead_origem_id
          and l.gclid is not null

       union all

       -- Porta 2: rede de seguranca pelo telefone, so para quem nao tem lead de origem.
       select c.gclid,
              'telefone'::text,
              coalesce(c.conversa_criada_em, c.created_at),
              2
         from public.google_ads_cliques c
        where a.lead_origem_id is null
          and c.gclid is not null
          and length(regexp_replace(coalesce(a.telefone, ''), '\D', '', 'g')) >= 8
          and right(regexp_replace(c.telefone, '\D', '', 'g'), 8)
            = right(regexp_replace(a.telefone, '\D', '', 'g'), 8)
     ) portas
    order by prio
    limit 1
 ) g
 where a.arquivado_em is null
   and a.data_matricula is not null
   and coalesce(a.valor_parcela, 0) > 0
   and not exists (
     select 1
       from public.google_ads_conversoes e
      where e.aluno_id = a.id
        and e.tipo = 'matricula'
   );

comment on view public.google_ads_conversoes_fila is
  'Matriculas que tem gclid e ainda nao foram devolvidas ao Google. Fila da edge `enviar-conversoes-google-ads`. A view NAO filtra por janela de lookback de proposito: quem esta velho demais para ser aceito precisa aparecer e ser contado como descartado, nao sumir em silencio.';

revoke all on public.google_ads_conversoes_fila from anon, authenticated;
