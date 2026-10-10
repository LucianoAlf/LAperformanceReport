-- MODULO EVENTOS — aluno TRANCADO passa a ser elegivel ao recital, marcado (LAPE-39)
--
-- Pedido da Fernanda (09/10/2026): "no recital nao aparecem os alunos trancados para
-- escolher". Nao aparecia por desenho: `vw_evento_aluno_elegivel_v1` nasceu com
-- `where a.status = 'ativo'`, e `evento_apresentacao_adicionar_v1` exige matricula ATIVA
-- daquele curso para gravar a apresentacao. Eram os dois UNICOS filtros de `alunos.status`
-- no modulo inteiro (conferido em `pg_get_functiondef` das 33 funcoes de evento em 09/10):
-- participacao, check-in, grade, palco e relatorios nunca olharam status.
--
-- 🔴 TRANCAR NAO E SAIR. A regra da casa diz que trancado nao conta como aluno ativo nos
-- KPIs (REGRAS-DE-NEGOCIO §3), e isso continua valendo — o recital nao e KPI: e convite.
-- Quem trancou por um mes segue sendo aluno da escola, tem professor, e e justamente quem
-- a coordenacao quer trazer de volta ao palco. A mesma distincao que o caixa teve de fazer
-- em 25/09 (`sol_caixa_aluno_pode_pagar_v1`): trancado nao e ex-aluno.
--
-- MEDIDO em 09/10/2026 (producao):
--   • 20 matriculas trancadas = 19 pessoas (Barra 2, Campo Grande 10, Recreio 7).
--     Raquel de Cassia tem duas: Bateria e "Minha Banda Para Sempre" — entra por Bateria,
--     porque banda filtra CURSO e segue fora do recital.
--   • lista de elegiveis 994 -> 1013 pessoas; as 19 novas TODAS com curso que vai ao palco
--     (nenhuma cai em `motivo_sem_curso`).
--   • quem ja estava: 0 pessoa desaparece, 0 divergencia nas 10 colunas antigas, 0
--     divergencia no conjunto (curso, professor) do jsonb `cursos`.
--   • nenhuma das 19 tem OUTRA matricula ativa — hoje nao existe pessoa meio-ativa
--     meio-trancada. O codigo trata o caso misto de qualquer forma (ver abaixo).
--
-- ⚠️ ENTRA MARCADO, NUNCA EM SILENCIO. A coluna nova `trancado` (pessoa) e o campo
-- `trancado` em cada item de `cursos` existem para a tela dizer o que esta oferecendo:
-- convidar quem parou e decisao da coordenacao, e ela precisa saber que parou. Esconder
-- seria o defeito de hoje; mostrar sem marca seria pior, porque a cobranca de ingresso e
-- o aviso ao professor sairiam como se o aluno estivesse em aula.
--
-- ⚠️ O GRAO DE `cursos` PASSA A SER (pessoa, curso), agregado antes do jsonb. A v1 fazia
-- `jsonb_agg(distinct objeto)`: com o campo `trancado` dentro do objeto, a pessoa que tem
-- o MESMO curso em duas matriculas (uma ativa, uma trancada) apareceria com o curso DUAS
-- vezes — uma trancada e outra nao —, quebrando "duas matriculas do mesmo curso geram uma
-- apresentacao so" na leitura e no `alocacaoPorCurso.get(curso_id)` da tela. Hoje o caso
-- nao existe (0 pessoas), e e exatamente por isso que ele passaria sem ninguem ver.
-- Por curso: ativa manda sobre trancada no nome/professor, e `trancado` = NENHUMA ativa.
--
-- ⚠️ `trancado` E A ULTIMA COLUNA de proposito: `create or replace view` nao permite
-- inserir coluna no meio nem renomear. `evento_visitantes_v1` faz `to_jsonb(el)` da view
-- inteira, entao ganha o campo sozinho.

-- ─────────────── 1. a lista de elegiveis aceita trancado, marcado ───────────────

create or replace view public.vw_evento_aluno_elegivel_v1
with (security_invoker = true) as
with matricula as (
  select
    a.id                                              as aluno_id,
    a.unidade_id,
    pc.pessoa_chave,
    a.nome,
    a.data_nascimento,
    a.curso_id,
    c.nome                                            as curso_nome,
    coalesce(c.is_projeto_banda, false)               as curso_e_banda,
    a.professor_atual_id                              as professor_id,
    p.nome                                            as professor_nome,
    (a.status = 'ativo')                              as matricula_ativa
  from public.alunos a
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  left join public.cursos c       on c.id = a.curso_id
  left join public.professores p  on p.id = a.professor_atual_id
  where a.status in ('ativo', 'trancado')
),
-- Grao (pessoa, curso): duas matriculas do mesmo curso continuam sendo UM curso. Sem este
-- nivel, o `trancado` dentro do objeto faria o jsonb_agg(distinct) devolver o curso duas
-- vezes para quem tem o mesmo curso ativo e trancado.
curso as (
  select
    m.unidade_id,
    m.pessoa_chave,
    m.curso_id,
    (array_agg(m.curso_nome     order by m.matricula_ativa desc, m.aluno_id desc))[1] as curso_nome,
    (array_agg(m.professor_id   order by m.matricula_ativa desc, m.aluno_id desc))[1] as professor_id,
    (array_agg(m.professor_nome order by m.matricula_ativa desc, m.aluno_id desc))[1] as professor_nome,
    bool_or(m.curso_e_banda)                                                          as curso_e_banda,
    not bool_or(m.matricula_ativa)                                                    as curso_trancado
  from matricula m
  where m.curso_id is not null
  group by m.unidade_id, m.pessoa_chave, m.curso_id
),
pessoa as (
  select
    m.unidade_id,
    m.pessoa_chave,
    -- Banda por ULTIMO e, entre as do recital, a ATIVA antes da trancada: a referencia e a
    -- porta de entrada da identidade e fica melhor ancorada numa matricula viva.
    (array_agg(m.aluno_id
       order by m.curso_e_banda, m.matricula_ativa desc, m.aluno_id desc))[1] as aluno_id_referencia,
    (array_agg(m.nome    order by m.aluno_id desc))[1]                        as nome,
    max(m.data_nascimento)                                                    as data_nascimento,
    bool_or(m.curso_e_banda)                                                  as faz_banda,
    -- Pessoa trancada = nenhuma matricula ativa. Quem tem um curso ativo e outro trancado
    -- NAO e "trancada": o selo dela sai por curso.
    not bool_or(m.matricula_ativa)                                            as trancado
  from matricula m
  group by m.unidade_id, m.pessoa_chave
)
select
  p.unidade_id,
  p.pessoa_chave,
  p.aluno_id_referencia,
  p.nome,
  p.data_nascimento,
  case
    when p.data_nascimento is null then null
    else extract(year from age(p.data_nascimento))::integer
  end                                                      as idade_anos,
  coalesce(cc.cursos_no_recital, 0)                         as cursos_no_recital,
  coalesce(cc.cursos, '[]'::jsonb)                          as cursos,
  p.faz_banda,
  case
    when coalesce(cc.cursos_no_recital, 0) > 0    then null
    when coalesce(cc.cursos_matriculados, 0) > 0  then 'so_atividade_extra'
    else                                               'curso_nao_cadastrado'
  end                                                      as motivo_sem_curso,
  p.trancado
from pessoa p
left join lateral (
  select
    count(*) filter (where not c.curso_e_banda)             as cursos_no_recital,
    count(*)                                                as cursos_matriculados,
    coalesce(
      jsonb_agg(jsonb_build_object(
        'curso_id',       c.curso_id,
        'curso_nome',     c.curso_nome,
        'professor_id',   c.professor_id,
        'professor_nome', c.professor_nome,
        'trancado',       c.curso_trancado
      ) order by c.curso_nome) filter (where not c.curso_e_banda),
      '[]'::jsonb
    )                                                       as cursos
  from curso c
  where c.unidade_id = p.unidade_id
    and c.pessoa_chave = p.pessoa_chave
) cc on true;

comment on view public.vw_evento_aluno_elegivel_v1 is
  'Candidatos ao recital por PESSOA (unidade_id, pessoa_chave): matricula ATIVA ou TRANCADA. '
  'trancado (pessoa) = nenhuma matricula ativa; cursos[].trancado = aquele curso sem matricula ativa. '
  'Trancar nao e sair: o recital e convite, nao KPI — mas entra marcado, nunca em silencio. '
  'Banda filtra CURSO, nunca pessoa, e nunca e a matricula de referencia quando ha outra. '
  'cursos tem grao (pessoa, curso): duas matriculas do mesmo curso sao um curso so. '
  'motivo_sem_curso separa a regra (so_atividade_extra) do defeito (curso_nao_cadastrado). '
  'security_invoker: herda a RLS de alunos.';

revoke all on table public.vw_evento_aluno_elegivel_v1 from public, anon, authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to service_role;

-- ────────── 2. o filtro "Familia" do seletor olha o mesmo universo ──────────
--
-- Ela responde "quem, entre os candidatos, tem familiar tambem candidato" — e o universo
-- de candidatos acabou de mudar. Mantida ativa, o irmao trancado entraria na lista e nao
-- casaria com o irmao ativo no agrupamento por familia, que e justo o caso de usar.
-- MEDIDO: 88 -> 94 linhas (3 pares novos). O CTE deixou de se chamar `ativo` porque nao e.

create or replace view public.vw_evento_familia_v1
with (security_invoker = true) as
with candidato as (
  select a.unidade_id,
         pc.pessoa_chave,
         a.nome,
         a.data_nascimento,
         a.telefone_key,
         a.whatsapp_key,
         a.responsavel_telefone_key,
         lower(public.unaccent(split_part(trim(coalesce(a.responsavel_nome, '')), ' ', 1))) as resp_primeiro,
         lower(public.unaccent(split_part(trim(a.nome), ' ', 1))) as primeiro
  from public.alunos a
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  where a.status in ('ativo', 'trancado')
), par as (
  select distinct
         f.unidade_id,
         f.pessoa_chave as dependente_chave,
         f.nome         as dependente_nome,
         r.pessoa_chave as responsavel_chave,
         r.nome         as responsavel_nome
  from candidato f
  join candidato r
    on r.unidade_id = f.unidade_id
   and r.pessoa_chave <> f.pessoa_chave
   and f.responsavel_telefone_key is not null
   and f.responsavel_telefone_key in (r.telefone_key, r.whatsapp_key)
   and f.resp_primeiro <> ''
   and f.resp_primeiro = r.primeiro
   and r.data_nascimento <= (current_date - interval '18 years')
)
select unidade_id, dependente_chave as pessoa_chave, responsavel_chave as familiar_chave,
       responsavel_nome as familiar_nome, 'responsavel'::text as familiar_papel
from par
union all
select unidade_id, responsavel_chave, dependente_chave, dependente_nome, 'dependente'::text
from par;

comment on view public.vw_evento_familia_v1 is
  'Candidatos ao recital (matricula ativa ou trancada) com familiar tambem candidato na mesma '
  'unidade: telefone do responsavel = telefone do adulto E primeiro nome bate. Uma linha por '
  '(pessoa, familiar), nos dois sentidos. familiar_papel: responsavel = o familiar e o '
  'responsavel cadastrado desta pessoa; dependente = esta pessoa e a responsavel do familiar. '
  'Inclui conjuge: o rotulo e familia.';

revoke all on public.vw_evento_familia_v1 from public, anon, authenticated;
grant select on public.vw_evento_familia_v1 to authenticated, service_role;

-- ────────── 3. a apresentacao aceita matricula trancada, preferindo a ativa ──────────
--
-- 🔴 PATCH GUARDADO SOBRE A DEFINICAO VIVA, nunca `create or replace` transcrito do repo.
-- A funcao viva ganhou, depois da migration que a criou, a guarda de escopo
-- (`fn_evento_pode_ver`) e a trava do aluno de outra unidade; reescreve-la a partir de um
-- arquivo antigo apagaria as duas em silencio — a mesma armadilha que a anamnese
-- documenta ("manter a linha da trava"). Cada ancora declara QUANTAS vezes espera casar:
-- numero diferente aborta a migration inteira em vez de corromper o corpo.

do $do$
declare
  v_def  text;
  v_novo text;
  v_n    int;
  v_de   text;
  v_para text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'evento_apresentacao_adicionar_v1';

  if v_def is null then
    raise exception 'evento_apresentacao_adicionar_v1 nao existe — nada a corrigir';
  end if;
  if position('fn_evento_pode_ver' in v_def) = 0 then
    raise exception 'a funcao viva nao tem a guarda de escopo: corpo inesperado, abortando';
  end if;

  v_novo := v_def;

  -- A1: o filtro que recusava a matricula trancada.
  v_de   := 'and a.status        = ''ativo''';
  v_para := 'and a.status        in (''ativo'', ''trancado'')';
  v_n := (length(v_novo) - length(replace(v_novo, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'ancora A1 (filtro de status) esperava 1 ocorrencia, achou %', v_n;
  end if;
  v_novo := replace(v_novo, v_de, v_para);

  -- A2: com as duas, a ATIVA manda. Sem isto, `id desc` escolheria a trancada quando ela
  -- for a matricula mais nova — e o professor gravado na apresentacao sairia dela.
  v_de   := 'order by a.id desc';
  v_para := 'order by (a.status <> ''ativo''), a.id desc';
  v_n := (length(v_novo) - length(replace(v_novo, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'ancora A2 (desempate da matricula) esperava 1 ocorrencia, achou %', v_n;
  end if;
  v_novo := replace(v_novo, v_de, v_para);

  -- A3: a recusa continua existindo (curso que a pessoa nao faz), mas "matricula ativa"
  -- passou a ser falso — ela recusa quem nao tem matricula NENHUMA daquele curso.
  v_de   := '% não tem matrícula ativa de %.';
  v_para := '% não tem matrícula de %.';
  v_n := (length(v_novo) - length(replace(v_novo, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'ancora A3 (mensagem de recusa) esperava 1 ocorrencia, achou %', v_n;
  end if;
  v_novo := replace(v_novo, v_de, v_para);

  v_de   := 'A apresentação é sempre de um curso que a pessoa cursa hoje.';
  v_para := 'A apresentação é de um curso em que a pessoa tem matrícula — ativa ou trancada.';
  v_n := (length(v_novo) - length(replace(v_novo, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'ancora A4 (hint da recusa) esperava 1 ocorrencia, achou %', v_n;
  end if;
  v_novo := replace(v_novo, v_de, v_para);

  execute v_novo;

  -- Prova depois de aplicar: o que entrou e o que NAO podia sair.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'evento_apresentacao_adicionar_v1';
  if position('in (''ativo'', ''trancado'')' in v_def) = 0
     or position('fn_evento_pode_ver' in v_def) = 0
     or position('ainda não foi adicionado a este evento' in v_def) = 0 then
    raise exception 'corpo resultante perdeu alguma trava — revertendo';
  end if;
end
$do$;

comment on function public.evento_apresentacao_adicionar_v1(bigint, integer, integer) is
  'Adiciona apresentacao resolvendo a matricula e o professor DO CURSO pedido, pela pessoa. '
  'Aceita matricula ativa ou trancada (trancar nao e sair, e o recital e convite), preferindo '
  'a ativa quando a pessoa tem as duas no mesmo curso. '
  'p_aluno_id e so a porta de entrada da identidade, nunca a procedencia gravada.';

-- Grants reemitidos: `create or replace` os preserva, mas recriar funcao e o caminho
-- classico de reabrir EXECUTE para `anon` neste projeto (3 incidentes documentados).
revoke execute on function public.evento_apresentacao_adicionar_v1(bigint, integer, integer)
  from public, anon;
grant execute on function public.evento_apresentacao_adicionar_v1(bigint, integer, integer)
  to authenticated, service_role;
