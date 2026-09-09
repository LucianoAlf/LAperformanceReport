-- Seed SINTÉTICO do ensaio isolado, no volume medido em produção.
--
-- 🔴 POR QUE SINTÉTICO E NÃO UM DUMP. O benchmark precisa de VOLUME, não de
--    nomes de alunos reais — e nome de criança não sai do banco de produção
--    para uma máquina de teste. Além disso, seed versionado é reproduzível:
--    quem rodar daqui a um mês mede a mesma coisa que eu medi hoje.
--
-- ALVO (medido em produção, CG, competência 09/2026):
--    envelope de faturas .......... 1.318 itens
--    custo de UMA construção ...... 1.266 ms (cache quente)
--
--    Se o seed não reproduzir ordem de grandeza parecida, o benchmark não vale
--    e o próprio ensaio diz isso — ver a asserção de fidelidade no fim.
--
-- ⚠️ COLISÃO DE PRIMEIRO NOME É DE PROPÓSITO: o pool de primeiros nomes é
--    pequeno, então há dezenas de "Alex ..." diferentes. É o que exercita a
--    recusa por ambiguidade, que é a correção central desta frente.
--
-- ⚠️ ALUNO COM 2 E COM 4 CURSOS também é de propósito: é o caso composto (a
--    Mayra), o que a ferramenta antiga não fechava.
--
--   docker exec sol-ensaio psql -U postgres -d ensaio -v ON_ERROR_STOP=1 -f ensaio-seed.sql

\set ON_ERROR_STOP on

truncate table public.emusys_faturas, public.caixa_movimentacoes,
  public.sol_caixa_lote_itens_v1, public.sol_caixa_lotes_v1,
  public.sol_caixa_lancamento_auditoria, public.sol_caixa_ingestao_recebimentos,
  public.caixas_diarios restart identity cascade;
-- ⚠️ NAO apaga unidades/alunos de outras origens: as migrations semeiam dados
--    proprios e ha FK apontando para eles (aulas_emusys, por exemplo). O seed
--    trabalha SO na unidade do ensaio — e assim rodar duas vezes e seguro.
delete from public.alunos where unidade_id = '11111111-1111-1111-1111-111111111111';

insert into public.unidades (id, nome, codigo)
values ('11111111-1111-1111-1111-111111111111', 'Ensaio Campo Grande', 'ENS')
on conflict (id) do nothing;

insert into public.cursos (nome) select v from (values
  ('Violao'),('Guitarra'),('Teclado'),('Canto'),('Bateria'),('Harmonia'))
  as t(v)
on conflict do nothing;

-- ⚠️ TRIGGERS DE USUARIO DESLIGADOS DURANTE A CARGA. O replay das migrations traz
--    junto os triggers de producao (`calcular_campos_aluno`,
--    `sync_aluno_to_leads_diarios`, ...), que esperam tabelas fora do escopo
--    deste ensaio. O seed FABRICA dado; ele nao exercita o caminho de escrita do
--    app — quem e testado aqui e a LEITURA do caixa. Religados logo abaixo.
alter table public.alunos disable trigger user;
alter table public.emusys_faturas disable trigger user;

-- 1.200 alunos. Primeiro nome vem de um pool de 20 → ~60 homônimos por nome,
-- que é a ordem de grandeza real (medido: 10 "Davi" em Campo Grande).
-- 🔴 `alunos` E MATRICULA, NAO PESSOA (regra da casa). Quem faz 4 cursos tem 4
--    linhas, cada uma com seu `emusys_matricula_id`. Meu seed criava UMA linha
--    por pessoa e deixava a matricula NULA — e o composto exige `aluno.id` no
--    item do envelope, que so aparece pelo vinculo
--    `alunos.emusys_matricula_id = emusys_faturas.emusys_matricula_id`. Sem
--    isso ele descartava TODAS as faturas e recusava com
--    `composicao_exige_duas_faturas` mesmo com 4 na competencia.
insert into public.alunos (nome, unidade_id, status, emusys_student_id, emusys_matricula_id,
                           valor_parcela, responsavel_nome, data_matricula)
select
  (array['Alex','Bruna','Caio','Dani','Elis','Fabio','Gabi','Hugo','Ines','Joao',
         'Karla','Lucas','Maju','Nina','Otto','Paula','Rafa','Sofia','Tiago','Vera'])
    [1 + (i % 20)]
  || ' ' ||
  (array['Almeida','Barbosa','Cardoso','Dias','Esteves','Farias','Gomes','Horta',
         'Iglesias','Junqueira'])[1 + ((i/20) % 10)]
  || ' ' || to_char(i, 'FM0000'),
  '11111111-1111-1111-1111-111111111111',
  'ativo',
  (900000 + i)::text,
  (500000 + i * 10)::text,
  350 + (i % 12) * 25,
  'Responsavel ' || to_char(i, 'FM0000'),
  current_date - ((i % 700) || ' days')::interval
from generate_series(1, 1200) i;

-- Faturas: uma por aluno em cada uma das 3 competências da janela, mais cursos
-- extras para 100 alunos (2 cursos) e 20 alunos (4 cursos).
insert into public.emusys_faturas (
  unidade_id, unidade_codigo, emusys_fatura_id, emusys_matricula_id,
  emusys_contrato_id, emusys_student_id, descricao, status,
  data_vencimento, data_pagamento, competencia, valor_original, valor_pago)
select
  '11111111-1111-1111-1111-111111111111', 'ENS',
  (row_number() over ())::bigint,
  (500000 + a.id * 10 + k)::bigint,
  (700000 + a.id)::bigint,
  a.emusys_student_id::bigint,
  'Parcela ' || to_char(comp.d, 'MM/YYYY') || ' do curso de ' ||
    (array['Violao','Guitarra','Teclado','Canto'])[1 + k],
  case when comp.d = date_trunc('month', current_date)::date then 'paga' else 'paga' end,
  (comp.d + interval '4 days')::date,
  (comp.d + interval '3 days')::date,
  comp.d,
  a.valor_parcela + k * 30,
  a.valor_parcela + k * 30
from public.alunos a
cross join lateral (
  select generate_series(
    date_trunc('month', current_date - interval '2 months')::date,
    date_trunc('month', current_date)::date,
    interval '1 month')::date as d) comp
cross join lateral (
  -- 0 = curso principal (todos) · 1 = segundo curso (100) · 2,3 = extras (20)
  select generate_series(0, case when a.id % 12 = 0 then 3
                                 when a.id % 12 = 1 then 1
                                 else 0 end) as k) cursos_do_aluno
-- ⚠️ SO 1 EM CADA 3 ALUNOS TEM FATURA NA JANELA. Medido em producao: CG tem
--    ~1.170 alunos ativos e o envelope de `janela_3` traz 1.318 itens — ou seja,
--    a maioria das faturas nao entra na janela. Semear uma por aluno por mes
--    dava 4.800 itens (3,6x o real) e inflava o benchmark inteiro.
where a.unidade_id = '11111111-1111-1111-1111-111111111111'
  and a.id % 3 = 0;

-- 🔴 O ENVELOPE E FAIL-CLOSED: sem um RUN PUBLICADO fresco ele devolve ZERO
--    faturas, e o caixa recusa lancar. Esse e o desenho certo ("nao lanco sem
--    confirmar na fonte oficial") e foi o que este ensaio me ensinou — eu tinha
--    semeado `emusys_faturas` achando que bastava.
--    As condicoes vem do proprio `financeiro_enriquecer_tipos_fatura_v1`:
--    run_type='live', status='succeeded', snapshot_complete, unidades_concluidas=3.
-- ⚠️ O `ultimo_run_por_competencia` da enriquecedora elege o run de
--    `completed_at` MAIS RECENTE. As migrations semeiam runs proprios; se um
--    deles for mais novo que o meu, ele vence, vem SEM itens, e o `tipo_fatura`
--    sai NULO — foi exatamente o que aconteceu na 1a tentativa, e sem tipo a
--    composta nunca acha "parcela".
--    Nao dá para apagar os concorrentes: ha um guard de producao
--    (`FINANCEIRO_SYNC_IMUTAVEL: sync_runs nunca podem ser apagados`) e ele vale
--    aqui tambem — o que esta certo. A saida e ganhar a eleicao: `completed_at`
--    = now(), entao o run do ensaio e sempre o mais recente.
insert into public.sync_runs (
  competencia, run_type, status, trigger_source, started_at, completed_at,
  stale_after, unidades_concluidas, snapshot_complete, total_emusys)
select comp.d, 'live', 'succeeded', 'ensaio',
       now() - interval '10 minutes', now(),
       now() + interval '2 days', 3, true,
       (select count(*) from public.emusys_faturas f where f.competencia = comp.d)
from (select generate_series(
        date_trunc('month', current_date - interval '2 months')::date,
        date_trunc('month', current_date)::date,
        interval '1 month')::date as d) comp;

insert into public.sync_run_items (
  run_id, canonical_fatura_id, competencia, unidade_id, unidade_codigo,
  emusys_fatura_id, emusys_matricula_id, emusys_contrato_id, emusys_student_id,
  descricao, status, data_vencimento, data_pagamento,
  valor_original, valor_pago, juros_e_multa, desconto_aplicado,
  desconto_fixo, desconto_condicional, payload)
select r.id, f.id, f.competencia, f.unidade_id, f.unidade_codigo,
       f.emusys_fatura_id, f.emusys_matricula_id, f.emusys_contrato_id, f.emusys_student_id,
       f.descricao, f.status, f.data_vencimento, f.data_pagamento,
       f.valor_original, f.valor_pago, 0, 0, 0, 0,
       jsonb_build_object('descricao', f.descricao, 'status', f.status,
                          'numero_parcela', 1, 'total_parcelas_contrato', 12)
from public.emusys_faturas f
join public.sync_runs r on r.competencia = f.competencia and r.trigger_source = 'ensaio';

-- Uma linha de `alunos` por curso ADICIONAL, espelhando a matricula da fatura.
insert into public.alunos (nome, unidade_id, status, emusys_student_id, emusys_matricula_id,
                           valor_parcela, responsavel_nome, data_matricula, is_segundo_curso)
select distinct a.nome, a.unidade_id, 'ativo', a.emusys_student_id,
       f.emusys_matricula_id::text,
       coalesce(f.valor_pago, f.valor_original), a.responsavel_nome, a.data_matricula, true
from public.emusys_faturas f
join public.alunos a on a.emusys_student_id = f.emusys_student_id::text
                    and a.unidade_id = f.unidade_id
where f.unidade_id = '11111111-1111-1111-1111-111111111111'
  and f.competencia = date_trunc('month', current_date)::date
  and f.emusys_matricula_id::text <> a.emusys_matricula_id;

alter table public.alunos enable trigger user;
alter table public.emusys_faturas enable trigger user;

analyze public.alunos;
analyze public.emusys_faturas;
analyze public.sync_runs;
analyze public.sync_run_items;

-- Fidelidade: se o volume fugir da ordem de grandeza de produção, o benchmark
-- que vier depois não vale — melhor falhar aqui do que publicar número bonito.
do $seed$
declare
  v_faturas_comp int;
  v_alunos int;
  v_multi int;
begin
  select count(*) into v_faturas_comp from public.emusys_faturas
   where competencia = date_trunc('month', current_date)::date;
  select count(*) into v_alunos from public.alunos
   where unidade_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into v_multi from (
    select emusys_student_id from public.emusys_faturas
     where competencia = date_trunc('month', current_date)::date
     group by 1 having count(*) >= 2) x;

  raise notice 'seed: % alunos · % faturas na competencia · % alunos com 2+ faturas',
    v_alunos, v_faturas_comp, v_multi;

  if v_faturas_comp not between 350 and 700 then
    raise exception 'SEED FORA DA ORDEM DE GRANDEZA: % faturas/competencia (alvo ~440, para dar ~1.320 na janela_3 como producao)',
      v_faturas_comp;
  end if;
  if v_multi < 50 then
    raise exception 'SEED SEM CASO COMPOSTO SUFICIENTE: so % alunos com 2+ faturas', v_multi;
  end if;
end $seed$;
