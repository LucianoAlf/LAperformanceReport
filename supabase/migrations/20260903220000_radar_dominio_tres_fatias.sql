-- Mapa de Sinais: o motor é um só, mas as FATIAS são três.
--
-- Correção de rumo do Luciano (03/09): eu construí o alicerce na horizontal
-- (canais, identidade, extrator — servem os dois mundos) e depois subi os três
-- andares só do lado do ALUNO. A medição confirma: das 14 regras ativas, 12 são
-- de aluno, 1 de família, 1 de professor e **zero de comercial**; dos 147 sinais
-- abertos, 138 são de aluno e **1 é lead**.
--
-- O defeito ficava visível na entrega: **R8 estava listado para `mila/consultora`
-- E para `sol/secretaria` ao mesmo tempo**. É a mesma regra com dois donos, porque
-- a regra não sabe de que mundo ela é. Um ALUNO sem resposta é da secretaria; um
-- LEAD sem resposta é da consultora.
--
-- POR QUE NÃO SEPARAR EM DOIS MOTORES: duplicaria idempotência, guarda de regra
-- de negócio, triagem e desfecho — e mataria o 2º andar. O aprendizado que
-- interessa ATRAVESSA os mundos: "esse lead veio do Instagram, demorou 3 dias
-- para ser respondido, fez experimental, matriculou e saiu em 4 meses" é UMA
-- história. Com duas caixas, ninguém conta ela.
--
-- POR QUE O DOMÍNIO É DO SINAL E NÃO DA REGRA: para as regras de conversa
-- (R7/R8/R9/R10/R2/R14) o mundo depende de QUEM está do outro lado, não da
-- regra. Só as regras estruturalmente de um mundo (aviso prévio, frequência)
-- declaram domínio fixo.
--
-- POR QUE TRIGGER E NÃO NA EDGE: é a lição do `motivo_saida_id`, que morava só
-- dentro de `processar-matricula-emusys` e por isso valia para um caminho de
-- escrita só. Aqui já existem dois (detector SQL e extrator LLM) e vão existir
-- mais.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) as três fatias
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.radar_sinais
  add column if not exists dominio text;

alter table public.radar_sinais
  drop constraint if exists radar_sinais_dominio_check;
alter table public.radar_sinais
  add constraint radar_sinais_dominio_check
  check (dominio is null or dominio in ('comercial','aluno','historico'));

comment on column public.radar_sinais.dominio is
  'Fatia: comercial (Mila + consultoras: lead ate a matricula) | aluno (Sol/Lia/guardias/TOM: matriculado) | historico (ex-aluno — MEDICAO, nunca tarefa). Preenchido por trigger; nao escrever a mao.';

-- Domínio FIXO da regra. NULL = derivar de quem é a pessoa (regras de conversa).
alter table public.radar_regras
  add column if not exists dominio text;

alter table public.radar_regras
  drop constraint if exists radar_regras_dominio_check;
alter table public.radar_regras
  add constraint radar_regras_dominio_check
  check (dominio is null or dominio in ('comercial','aluno','historico'));

comment on column public.radar_regras.dominio is
  'Domínio FIXO da regra, quando ela pertence estruturalmente a um mundo (ex.: R13 aviso previo e sempre do aluno). NULL = o dominio vem da ENTIDADE do sinal, que e o caso das regras de conversa: R8 num lead e comercial, no aluno e da secretaria.';

-- Regras estruturalmente do mundo do aluno (não dependem de quem escreveu).
update public.radar_regras set dominio = 'aluno'
 where codigo in ('R1','R3','R4','R5','R6','R11','R12','R13');
-- R2, R7, R8, R9, R10, R14 ficam NULL: são de conversa, o mundo vem da pessoa.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) quem decide a fatia
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.radar_dominio_do_sinal(
  p_regra_codigo  text,
  p_entidade_tipo text,
  p_entidade_id   bigint
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- 1) regra com mundo próprio manda
    (select r.dominio from public.radar_regras r where r.codigo = p_regra_codigo),
    -- 2) senão, quem está do outro lado decide
    case
      when p_entidade_tipo = 'lead' then 'comercial'
      when p_entidade_tipo = 'professor' then 'aluno'
      when p_entidade_tipo in ('aluno','familia') then
        case
          when p_entidade_id is null then 'aluno'   -- família: id nulo por design
          when exists (select 1 from public.alunos a
                        where a.id = p_entidade_id::int
                          and a.status ilike 'ativo%') then 'aluno'
          else 'historico'                          -- já saiu: mede, não cobra
        end
      else 'aluno'
    end
  );
$$;

comment on function public.radar_dominio_do_sinal(text,text,bigint) is
  'Fatia do sinal. Regra com dominio proprio manda; senao decide a entidade — lead vira comercial, aluno que ja saiu vira historico. Fonte unica: nao reimplementar no consumidor.';

revoke all on function public.radar_dominio_do_sinal(text,text,bigint) from public, anon;
grant execute on function public.radar_dominio_do_sinal(text,text,bigint) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) a guarda de elegibilidade passa a SEPARAR dois "nãos" que eram um só
-- ─────────────────────────────────────────────────────────────────────────────
-- Até aqui `radar_aluno_elegivel_v1` misturava dois motivos de recusa:
--   (a) bolsista / banda -> "nao conta em nada, em nada" (decisao do Alf)
--   (b) aluno que ja saiu -> nao da para RETER, mas o dado vale MEDICAO
-- Tratar os dois como descarte matava o caso Theo Arruda (aluno 689, inativo):
-- o extrator ACHOU a declaracao de saida dele — "informou que nao continuara e
-- a escola confirmou o encerramento" — e o trigger jogou fora. E o caso que a
-- frente inteira usa como exemplo, e a pesquisa de evasao tem 5 respostas contra
-- 86 saidas: o motivo estava escrito e morria.
-- Agora (a) segue descartando e (b) vira `dominio='historico'`.

create or replace function public.radar_guarda_elegibilidade()
returns trigger
language plpgsql
as $$
begin
  -- Bolsista e banda continuam FORA do radar inteiro — inclusive do histórico.
  if new.entidade_tipo = 'aluno' and new.entidade_id is not null then
    if not coalesce(
         (select public.movimentacao_conta_nos_kpis_v1(a.curso_id, a.tipo_matricula_id)
            from public.alunos a where a.id = new.entidade_id::int),
         false) then
      return null;  -- descarta: não é erro, é regra de negócio
    end if;
  end if;

  -- A fatia é resolvida aqui, e não em cada gravador.
  if new.dominio is null then
    new.dominio := public.radar_dominio_do_sinal(
      new.regra_codigo, new.entidade_tipo, new.entidade_id);
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) backfill do que já existe
-- ─────────────────────────────────────────────────────────────────────────────

update public.radar_sinais s
   set dominio = public.radar_dominio_do_sinal(s.regra_codigo, s.entidade_tipo, s.entidade_id)
 where s.dominio is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) a entrega passa a filtrar por fatia
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem isto, tudo que for construído para a Mila vaza para as guardiãs — que é
-- exatamente o risco que a coexistência de R8 nos dois destinatários já criava.

alter table public.radar_destinatarios
  add column if not exists dominio text not null default 'aluno';

alter table public.radar_destinatarios
  drop constraint if exists radar_destinatarios_dominio_check;
alter table public.radar_destinatarios
  add constraint radar_destinatarios_dominio_check
  check (dominio in ('comercial','aluno','historico'));

comment on column public.radar_destinatarios.dominio is
  'Qual fatia este destinatario atende. A consultora nunca ve aviso previo e a guardia nunca ve lead parado.';

update public.radar_destinatarios set dominio = 'comercial' where agente = 'mila';
update public.radar_destinatarios set dominio = 'aluno'     where agente in ('lia','sol');

create index if not exists idx_radar_sinais_dominio_status
  on public.radar_sinais (dominio, status, severidade);
