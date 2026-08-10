-- Backfill do `emusys_lead_id` em `aula_alunos_emusys` para as aulas experimentais dos 48
-- dias que ainda tinham experimental sem vinculo, e RELIGACAO das experimentais por LEAD.
--
-- O `id_lead` foi buscado direto do Emusys (`GET /aulas`, 48 pares unidade+dia, 151 pares
-- unicos aula+aluno+lead). A coluna existe desde a migration `20260810004544`, mas so e
-- preenchida em sync novo — o historico precisava deste backfill.
--
-- POR QUE ISSO IMPORTA: as 93 experimentais que ainda apontavam para id de AGENDAMENTO sao
-- todas de 24/06 em diante, ou seja, 100% posteriores a 21/06/2026, quando a API passou a
-- devolver `id_lead`. E `lead_experimentais.emusys_lead_id` esta preenchido em 93 de 93.
-- Faltava so o lado da aula.
--
-- ⚠️ O nome NAO resolvia parte dos casos. Exemplos que so o lead fecha:
--   Alice Iribarne Franca Viana ..... aula real 825416 (lead 8062); as duas linhas dela
--                                     apontavam para id de agendamento (69254 e 69261)
--   Benjamin Duarte ................. aula real 824059 (lead 8015)
--   Bernardo Duarte ................. aula real 824060 (lead 8016)
-- Sao irmaos com sobrenome igual e aula no mesmo dia — casar por nome escolheria errado.
--
-- Medido: 20 -> 143 vinculos aula-aluno com lead; 19 experimentais religadas nesta rodada
-- (93 -> 74 quebradas). O restante e tratado nas migrations seguintes.
--
-- ⚠️ A lista de 151 pares (aula, nome normalizado, lead) vem da API e esta no corpo do
-- INSERT abaixo. Nao e reprodutivel por consulta ao nosso banco — e por isso que fica
-- versionada literalmente.
do $mig$
declare v_n int; v_antes int;
begin
  create temporary table _leads_api (aula_emusys bigint, nome_norm text, lead_id integer)
    on commit drop;

  insert into _leads_api values
(251900,$$isabela correa pena$$,6688),
(252109,$$luigi rodrigues pereira$$,6759),
(252110,$$thomas amadeo candido$$,6765),
(252112,$$theo ferreira$$,6773),
(252113,$$beatriz von glehn herkenhoff$$,6775),
(252114,$$lhays marinho de lima$$,6778),
(252116,$$ketlen caune de moura martins dos santos$$,6792),
(252117,$$kairos gustavo martins da sailva$$,6793),
(252119,$$beatriz von glehn herkenhoff$$,6775),
(252121,$$lucca porto de oliveira$$,6797),
(252122,$$fatima santa cruz da silva$$,6798),
(252123,$$davi pinheiro mesquita$$,6799),
(253116,$$johny paiva$$,6807),
(254176,$$alice pereira brugger siqueira$$,6842),
(254183,$$isaias oliveira guimaraes$$,6855),
(254409,$$roberta alanna dos santos lima de oliveira$$,6809),
(254410,$$ana paula dos santos lima de oliveira$$,6873),
(254567,$$theo martiniano$$,6889),
(254568,$$noah martiniano$$,6890),
(254724,$$davi pinheiro mesquita$$,6799),
(254725,$$alice maldonado batista$$,6893),
(254726,$$davi maldonado batista$$,6894),
(254727,$$miguel b b g cortines laxe$$,6895),
(254728,$$roberta alanna dos santos lima de oliveira$$,6809),
(254729,$$carlos roberto de oliveira$$,6896),
(254730,$$ana paula dos santos lima de oliveira$$,6873),
(254731,$$renan hozumi barbieri$$,6897),
(254732,$$alice de oliveira mansur$$,6902),
(254733,$$felipe de oliveira mansur$$,6903),
(254734,$$rael fernandez do valle$$,6904),
(256105,$$lucas pereira lassance meira$$,6922),
(256106,$$gabrielly de lima$$,6924),
(256107,$$gabrielly de lima$$,6924),
(256990,$$ingrid$$,7015),
(256991,$$helena da silva freitas$$,7018),
(256998,$$sofia martins guerreiro$$,7038),
(256999,$$joaquim moura diniz$$,7039),
(257610,$$rayane braga de lima$$,7063),
(257611,$$isadora rabelo cottini$$,7064),
(257612,$$isadora rabelo cottini$$,7064),
(257613,$$arthur de brito staeblein$$,7065),
(257615,$$vitor santanna$$,7077),
(257621,$$pedro e miguel barzani ventura chaves$$,6828),
(257623,$$vanice vianna chaves amaral$$,7090),
(257624,$$maria eduarda vianna chaves amaral$$,7088),
(257625,$$alexandre neves$$,7091),
(257676,$$luiza p caruso$$,7093),
(257677,$$bento brasil$$,7098),
(257679,$$manuela fernandez barbosa$$,7102),
(257680,$$manuela fernandez barbosa$$,7102),
(257681,$$samuel fernandez barbosa$$,7103),
(257682,$$samuel fernandez barbosa$$,7103),
(257683,$$olivia delduque goncalves$$,7104),
(258231,$$manuela dantas de carvalho$$,7123),
(258667,$$theo galvao saloes paes de oliveira$$,7137),
(728301,$$giovanna oliveira rocha da conceicao$$,14209),
(728302,$$bento$$,14185),
(728475,$$mateus oreiro tarrela maio$$,14118),
(728752,$$willy da conceicao costa$$,14160),
(731592,$$fabio bastos soares$$,14257),
(731593,$$theo da silva ribeiro$$,14064),
(731685,$$enrico tonelli costa$$,10360),
(731686,$$heitor andrade tuffy felippe$$,8033),
(731687,$$bruno de lima correia$$,14277),
(732326,$$sara nunes marchiori$$,14298),
(732328,$$yuri gomes pereira$$,14233),
(732329,$$isaque dias de lima$$,14306),
(732549,$$caio$$,14310),
(732662,$$maria eduarda vianna nascimento$$,14300),
(732663,$$joao evangelista soares carmo$$,14090),
(732665,$$manuela rodrigues$$,14335),
(734039,$$theo moreno passarelles$$,14324),
(734189,$$mateus oreiro tarrela maio$$,14118),
(734284,$$samuel muniz de oliveira$$,14308),
(735631,$$arthur abilio greco$$,14560),
(737817,$$amelie fontoura pinheiro$$,14638),
(740108,$$liz helena oliveira de freitas$$,14678),
(805319,$$lucas aguiar dos santos$$,7603),
(805320,$$mateus aguiar dos santos$$,7650),
(806563,$$martin felipe$$,7671),
(808307,$$guilherme rodriguez machado$$,7692),
(808676,$$beatriz affonso$$,7714),
(808679,$$malu moreira$$,7716),
(808680,$$julliana carmo bantim$$,7717),
(808681,$$julliana carmo bantim$$,7717),
(808730,$$carlos tairone$$,7698),
(808731,$$sophia$$,7721),
(810146,$$pedro emanoel$$,7726),
(811374,$$arthur pontes rodriguez$$,7743),
(812143,$$enzo baptista franco de lima$$,7755),
(813604,$$guilherme augusto$$,7776),
(814504,$$levi pinheiro marques$$,7797),
(814597,$$arantza lia$$,7799),
(814598,$$andre jaime romero$$,7800),
(814642,$$pedro paulo bernardo parreira$$,7802),
(814643,$$carlos eduardo ferreira$$,7803),
(814958,$$davi dos santos$$,7813),
(815542,$$catarina westin$$,7817),
(815545,$$enrico tonelli costa$$,7821),
(815546,$$julia leite$$,7829),
(816048,$$theo$$,7836),
(816311,$$nina sellos$$,7840),
(816564,$$mel de oliveira cotilha$$,7858),
(816907,$$alice maldonado batista$$,7866),
(817512,$$rebeca teixeira soares de barros$$,7870),
(817953,$$matheus lima$$,7872),
(820870,$$gustavo barbosa carvalho$$,7879),
(821163,$$alice maldonado batista$$,4035),
(822891,$$henrique supriano$$,7956),
(822892,$$sophie grimaud$$,7957),
(822893,$$raphael padua santos$$,7958),
(822894,$$rafael$$,7961),
(823112,$$manuela vieira gomes$$,7965),
(823157,$$laura$$,7968),
(823639,$$isabela villarinho$$,7985),
(823968,$$julia leite$$,7829),
(824057,$$pedro mello$$,8009),
(824058,$$luisa mello$$,8010),
(824059,$$benjamin duarte$$,8015),
(824060,$$bernardo duarte$$,8016),
(824497,$$samuel ferreira costa$$,8020),
(824498,$$joaquim moura$$,8024),
(824500,$$lucia cassar$$,8027),
(824501,$$daniela andrade$$,8028),
(824502,$$pedro andrade$$,8029),
(824507,$$vitor barros pontes rodrigues$$,8037),
(824508,$$daniel barros pontes rodrigues$$,8038),
(824509,$$enzo souza$$,8040),
(824510,$$benjamin mendonca$$,8042),
(824511,$$lucas barbosa$$,8045),
(825139,$$gabriel gerard$$,8048),
(825145,$$giulia spala teixeira$$,8050),
(825408,$$beatriz romero$$,8054),
(825409,$$valentim oiticica de franca azevedo$$,8055),
(825410,$$samuel$$,8060),
(825411,$$daniel barros pontes rodrigues$$,8038),
(825412,$$vitor barros pontes rodrigues$$,8037),
(825413,$$daniel barros pontes rodrigues$$,8038),
(825414,$$vitor barros pontes rodrigues$$,8037),
(825415,$$helena iribarne franca viana$$,8061),
(825416,$$alice iribarne franca viana$$,8062),
(825947,$$arthur ribeiro$$,8068),
(826264,$$maria luiza c da s miranda$$,8076),
(827676,$$alice cagnin alves da silva$$,8103),
(828375,$$eleomar flores da silva guimaraes$$,8113),
(829555,$$maria fernanda soares de moura e silva$$,8128),
(829556,$$maria fernanda soares de moura e silva$$,8128),
(829557,$$antonio soares de moura e silva$$,8129),
(829558,$$antonio soares de moura e silva$$,8129),
(829934,$$herika galiza$$,8133),
(829940,$$maria alice amancio galiza$$,8146);

  if (select count(*) from _leads_api) <> 151 then
    raise exception 'ABORTADO: esperava 151 pares da API, recebi %', (select count(*) from _leads_api);
  end if;

  -- 1. Backfill do lead nas linhas de vinculo aula-aluno
  update public.aula_alunos_emusys aa
     set emusys_lead_id = l.lead_id
    from _leads_api l
    join public.aulas_emusys a on a.emusys_id = l.aula_emusys
   where aa.aula_emusys_id = a.id
     and aa.aluno_nome_normalizado = l.nome_norm
     and aa.emusys_lead_id is null;
  get diagnostics v_n = row_count;
  raise notice 'lead preenchido em % vinculos aula-aluno', v_n;

  -- 2. Religar as experimentais quebradas usando o LEAD
  select count(*) into v_antes
    from public.lead_experimentais le
   where le.emusys_aula_id is not null
     and not exists (select 1 from public.aulas_emusys a where a.emusys_id = le.emusys_aula_id);

  with candidatas as (
    select le.id as le_id, a.emusys_id as aula_certa,
           count(*) over (partition by le.id) as qtd_aulas,
           count(*) over (partition by a.emusys_id, le.unidade_id) as qtd_experimentais
      from public.lead_experimentais le
      join public.aula_alunos_emusys aa
        on aa.unidade_id = le.unidade_id and aa.emusys_lead_id = le.emusys_lead_id
      join public.aulas_emusys a
        on a.id = aa.aula_emusys_id and a.categoria = 'experimental'
       and a.data_aula = le.data_experimental
     where le.emusys_aula_id is not null
       and le.emusys_lead_id is not null
       and not exists (select 1 from public.aulas_emusys x where x.emusys_id = le.emusys_aula_id)
       and not exists (select 1 from public.lead_experimentais o
                        where o.unidade_id = le.unidade_id and o.emusys_aula_id = a.emusys_id)
  ), inequivocas as (
    -- so religa quando ha UMA aula p/ a experimental E UMA experimental p/ a aula
    select distinct le_id, aula_certa from candidatas
     where qtd_aulas = 1 and qtd_experimentais = 1
  )
  update public.lead_experimentais le
     set emusys_aula_id = i.aula_certa
    from inequivocas i
   where le.id = i.le_id;
  get diagnostics v_n = row_count;

  raise notice 'experimentais religadas por LEAD: % (de % quebradas)', v_n, v_antes;
end
$mig$;
