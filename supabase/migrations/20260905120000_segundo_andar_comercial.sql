-- 2º ANDAR DO COMERCIAL: padrões → aprendizados → estratégia.
--
-- 🧱 ALICERCE  motor de dados · 1️⃣ contexto→interpretação→orientação
-- 2️⃣ padrões→aprendizados→estratégia · 3️⃣ ação e execução
-- Os andares são CAPACIDADE, não persona: a pilha inteira se repete para cada
-- agente. Esta migration é o 2º andar da Mila do CONSULTOR.
--
-- 🔴 O andar já existia e estava MUDO. Em 03/09 mediu-se `radar_padroes` com
-- cinco padrões puramente comerciais (PC1..PC5) e `radar_estrategias` com as
-- ações dimensionadas (EC1..EC3) — e nada disso chegava à conversa:
--   · `radar_sinais.padrao_codigo` é NULL em 100% dos sinais comerciais (122
--     abertos hoje), então o `radar_pauta_v1`, que JÁ sabe juntar sinal+padrão,
--     nunca tinha padrão para juntar;
--   · `radar_padrao_estrategia` liga P1..P7 → E1..E9 (aluno) e estava VAZIA
--     para o comercial;
--   · nenhuma tool da Mila lia padrão ou estratégia.
-- Ou seja: não falta medir, falta LIGAR. É o que esta migration faz.
--
-- ⚠️ POR QUE O MAPA VAI NA REGRA E NÃO NO DETECTOR: pôr `padrao_codigo` dentro
-- de `radar_detectar_sinais_comercial_v1` obrigaria a mexer no detector a cada
-- remedição e deixaria os 122 sinais JÁ EMITIDOS sem padrão até o próximo run.
-- Na regra o mapa é DADO (editável por UPDATE) e vale retroativamente, porque a
-- resolução é `coalesce(sinal.padrao_codigo, regra.padrao_codigo)` na leitura.
--
-- 🔴 VISIBILIDADE NÃO É DETALHE — É O VAZAMENTO QUE JÁ ACONTECEU. O padrão P7
-- diz, com nome e sobrenome, quem prometeu retorno e não voltou. Mostrá-lo a uma
-- consultora repete o incidente de 04/09, quando a Mila contou à Vitória o
-- ranking das três unidades. Por isso `visibilidade`: 'rede' é conhecimento de
-- todos, 'gestao' só alcança quem lidera (unidade_id nulo na governança).

-- ── 1. o padrão ganha domínio e visibilidade ────────────────────────────────
alter table public.radar_padroes
  add column if not exists dominio text not null default 'aluno',
  add column if not exists visibilidade text not null default 'rede';

do $$ begin
  alter table public.radar_padroes add constraint radar_padroes_visibilidade_check
    check (visibilidade in ('rede','gestao'));
exception when duplicate_object then null; end $$;

comment on column public.radar_padroes.dominio is
  'De que assunto o padrão fala: aluno | comercial. Define quem o recebe.';
comment on column public.radar_padroes.visibilidade is
  'rede = qualquer pessoa do domínio pode ver. gestao = só quem lidera (unidade_id nulo na governança). Padrão que NOMEIA pessoa é sempre gestao.';

update public.radar_padroes set dominio = 'comercial' where codigo in ('PC1','PC2','PC3','PC4','PC5');
-- P7 fala de churn por unidade E cita atendente por nome ("prometeu 38, deixou 8")
update public.radar_padroes set dominio = 'comercial', visibilidade = 'gestao' where codigo = 'P7';

-- ── 2. a regra aponta para o padrão que a explica ───────────────────────────
alter table public.radar_regras add column if not exists padrao_codigo text;

do $$ begin
  alter table public.radar_regras add constraint radar_regras_padrao_fkey
    foreign key (padrao_codigo) references public.radar_padroes(codigo) on delete set null;
exception when duplicate_object then null; end $$;

comment on column public.radar_regras.padrao_codigo is
  'Qual aprendizado explica esta regra. Vale como PADRÃO da regra; o sinal pode trazer o seu próprio em radar_sinais.padrao_codigo, que tem precedência. Mapa é dado, não código: editar por UPDATE quando o padrão for remedido.';

-- R15/R16/R17 são as três faces do mesmo aprendizado: quem chega à aula fecha
-- (40-50% em TODOS os canais). Quem já veio é o ativo mais valioso do funil.
update public.radar_regras set padrao_codigo = 'PC1' where codigo in ('R15','R16','R17') and dominio = 'comercial';
-- R18 (preso no bot) é literalmente o vazamento que o PC2 mediu no Instagram
update public.radar_regras set padrao_codigo = 'PC2' where codigo = 'R18' and dominio = 'comercial';
-- ⚠️ R7/R8 NÃO são mapeados para P7 de propósito: P7 é 'gestao' e o aprendizado
-- dele nomeia consultoras. Ligar aqui faria o sinal da Kailane carregar o
-- desempenho da Vitória. Quando houver um padrão 'rede' sobre tempo de resposta,
-- é aqui que ele entra.

-- ── 3. a estratégia aponta para o público que a dimensiona ──────────────────
-- `radar_publico_reativacao_v1(unidade)` já mede os 5 públicos POR UNIDADE. Sem
-- esse elo a Mila só teria o número da REDE ("179 pessoas"), que não é acionável
-- por quem atende uma unidade só.
alter table public.radar_estrategias add column if not exists publico_codigo text;
comment on column public.radar_estrategias.publico_codigo is
  'Público de radar_publico_reativacao_v1 que dimensiona esta ação NA UNIDADE. NULL = demanda só existe no nível da rede.';

update public.radar_estrategias set publico_codigo = 'experimental_sem_matricula' where codigo = 'EC1';
update public.radar_estrategias set publico_codigo = 'lead_nunca_agendou'         where codigo = 'EC2';
update public.radar_estrategias set publico_codigo = 'ex_alunos'                  where codigo = 'EC3';

insert into public.radar_estrategias
  (codigo, titulo, descricao, tipo, responsavel_papel, viabilidade, custo_relativo,
   capacidade_conhecida, evidencia_eficacia, ativo, publico_codigo, observacao_operacional)
values
  ('EC5','Campanha de indicação com as famílias ativas',
   'Pedir indicação a quem já é da casa. A indicação é o canal que mais leva gente à aula experimental — 77,4% dos indicados chegam, contra 9,6% do Instagram.',
   'comercial','gerente','disponivel','baixo', true, null, true, 'familias_ativas_indicacao',
   'Público é FAMÍLIA ATIVA, não lead. Falar com quem está satisfeito; evitar quem tem sinal de risco aberto.'),
  ('EC6','Remarcar quem faltou à experimental',
   'Quem agendou e faltou demonstrou interesse e não voltou a ser procurado. Oferecer DUAS opções de horário em vez de perguntar "quando pode".',
   'comercial','consultora','disponivel','baixo', true, null, true, 'faltou_experimental',
   'Sem cobrança pela falta. Se remarcar e vier, entra na faixa de 40-50% de conversão do PC1.')
on conflict (codigo) do update set
  publico_codigo = excluded.publico_codigo, ativo = excluded.ativo, atualizada_em = now();

-- ── 4. o elo padrão → estratégia, que existia só para o aluno ───────────────
insert into public.radar_padrao_estrategia (padrao_codigo, estrategia_codigo, prioridade, condicao) values
  ('PC1','EC1',1,'Sempre — quem fez a aula está na melhor faixa do funil e não foi fechado.'),
  ('PC1','EC6',2,'Faltou: trazer à aula é o passo que decide, não a aula em si.'),
  ('PC1','EC5',3,'Indicação é o canal que mais leva gente à aula (77,4% contra 9,6% do Instagram).'),
  ('PC2','EC2',1,'O Instagram perde 90% antes da aula: o ganho está no agendamento, não na aula.'),
  ('PC3','EC3',1,'Ex-aluno converte 68,2% — a maior taxa medida — e ninguém prospecta.')
on conflict (padrao_codigo, estrategia_codigo) do update set
  prioridade = excluded.prioridade, condicao = excluded.condicao;

-- ── 5. O QUE APRENDEMOS (2º andar, leitura) ─────────────────────────────────
-- ⚠️ Devolve `medido_em` e `envelhecido` SEMPRE. Padrão que não se remede vira
-- folclore: sem a data, alguém repete "ex-aluno converte 68%" em dezembro sem
-- saber que a amostra eram 28 pessoas de junho.
create or replace function public.mila_padroes_v1(
  p_solicitante_telefone text, p_codigo text default null
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare q record; v_lidera boolean; v_out jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_lidera := (q.unidade_id is null);   -- líder e diretoria não têm unidade única

  select jsonb_build_object(
    'ok', true,
    'solicitante', q.nome,
    've_padrao_de_gestao', v_lidera,
    'padroes', coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb),
    'como_usar', 'Cite o aprendizado quando ele mudar a decisão dela, com a amostra junto. '
              || 'Padrão de confiança baixa é direção, não número: diga isso. '
              || 'Nunca invente causa que o padrão não mediu.'
  ) into v_out
  from (
    select
      case p.confianca when 'alta' then 1 when 'media' then 2 else 3 end
        + case when (current_date - p.medido_em::date) > 45 then 10 else 0 end as ord,
      jsonb_build_object(
        'codigo', p.codigo, 'titulo', p.titulo, 'pergunta', p.pergunta,
        'aprendizado', p.aprendizado,
        'amostra', p.amostra_n, 'confianca', p.confianca,
        'medido_em', p.medido_em::date,
        'idade_dias', (current_date - p.medido_em::date),
        'envelhecido', (current_date - p.medido_em::date) > 45,
        'o_que_fazer', (
          select jsonb_agg(jsonb_build_object('codigo', e.codigo, 'titulo', e.titulo, 'quando', pe.condicao)
                           order by pe.prioridade)
          from radar_padrao_estrategia pe
          join radar_estrategias e on e.codigo = pe.estrategia_codigo and e.ativo
          where pe.padrao_codigo = p.codigo)
      ) item
    from radar_padroes p
    where p.ativo
      and p.dominio = 'comercial'
      and (v_lidera or p.visibilidade = 'rede')
      and (p_codigo is null or upper(p.codigo) = upper(p_codigo))
  ) x;

  return v_out;
end $function$;

-- ── 6. ONDE FOCAR (2º andar, estratégia com demanda DA UNIDADE) ─────────────
-- A tabela guarda a demanda da REDE. Quem atende uma unidade precisa do número
-- dela — senão a orientação é verdadeira e inútil ("179 pessoas" não diz a quem
-- ligar hoje no Recreio).
create or replace function public.mila_estrategias_v1(p_solicitante_telefone text)
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare q record; v_out jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;

  select jsonb_build_object(
    'ok', true,
    'solicitante', q.nome,
    'escopo', case when q.unidade_id is null then 'todas as unidades'
                   else (select nome from unidades where id = q.unidade_id) end,
    'unidades', coalesce(jsonb_agg(u.bloco order by u.nome), '[]'::jsonb),
    'como_usar', 'Estes são TAMANHOS de público medidos agora nesta unidade, nunca lista de telefone. '
              || 'Ordene por quente → morno → frio. Ofereça UMA ação por vez, com o porquê junto.'
  ) into v_out
  from (
    select un.nome,
      jsonb_build_object(
        'unidade', un.nome,
        'acoes', (
          select jsonb_agg(jsonb_build_object(
                   'codigo', e.codigo, 'titulo', e.titulo,
                   'responsavel', e.responsavel_papel,
                   'viabilidade', e.viabilidade, 'esforco', e.custo_relativo,
                   'pessoas_nesta_unidade', (pp.pubs #>> array[e.publico_codigo,'pessoas'])::int,
                   'temperatura', pp.pubs #>> array[e.publico_codigo,'temperatura'],
                   'criterio', pp.pubs #>> array[e.publico_codigo,'criterio'],
                   'porque', (select p.titulo || ' — ' || p.aprendizado
                                from radar_padroes p
                                join radar_padrao_estrategia pe
                                  on pe.padrao_codigo = p.codigo and pe.estrategia_codigo = e.codigo
                               where p.ativo and p.visibilidade = 'rede'
                               order by pe.prioridade limit 1),
                   'como', e.observacao_operacional
                 ) order by case pp.pubs #>> array[e.publico_codigo,'temperatura']
                              when 'quente' then 1 when 'morno' then 2 else 3 end,
                          (pp.pubs #>> array[e.publico_codigo,'pessoas'])::int desc)
          from radar_estrategias e
          where e.ativo and e.tipo = 'comercial' and e.publico_codigo is not null
            and pp.pubs ? e.publico_codigo)
      ) bloco
    from unidades un
    cross join lateral (
      -- uma chamada por unidade (a função é cara); o resto resolve no jsonb
      select coalesce(jsonb_object_agg(r.publico, to_jsonb(r)), '{}'::jsonb) pubs
      from public.radar_publico_reativacao_v1(un.id) r
    ) pp
    where un.ativo and (q.unidade_id is null or un.id = q.unidade_id)
  ) u;

  return v_out;
end $function$;

revoke all on function public.mila_padroes_v1(text,text)    from public, anon, authenticated;
revoke all on function public.mila_estrategias_v1(text)      from public, anon, authenticated;
grant execute on function public.mila_padroes_v1(text,text)  to service_role, mila_acesso_restrito;
grant execute on function public.mila_estrategias_v1(text)   to service_role, mila_acesso_restrito;
