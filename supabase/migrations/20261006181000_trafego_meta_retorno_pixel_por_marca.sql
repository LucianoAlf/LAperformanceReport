-- LAPE-62 (versao final, com Kids x School; substitui a funcao da migration 20261006180000): dados do bloco "Retorno ao Meta pelo pixel" da pagina Trafego Pago (aba Meta). Somente leitura.
--
-- Duas coisas, e a pagina diz qual e qual:
--   * por_campanha: o funil REAL do LA Report (lead -> experimental -> matricula) por campanha, ligado pela
--     marca de anuncio do lead (leads.meta_ad_source_id -> meta_ads_cache). E dado NOSSO e exato: nao depende
--     de o Meta casar telefone.
--   * envio: o estado do que foi devolvido ao PIXEL do Meta (tabelas meta_conversoes / meta_conversoes_execucao,
--     que nao sao expostas ao app).
--
-- Cada metrica conta pela PROPRIA data: lead por data_contato, experimental por data_experimental, matricula por
-- alunos.created_at (a mesma data que vai ao Meta). Nao e coorte: a matricula de hoje pode ser de um lead de
-- meses atras. A pagina avisa isso.
--
-- Acesso: so admin ativo (public.is_admin()), no mesmo espirito do gate de e-mail da edge meta-ads-insights
-- (custo de midia e sensivel). p_dias nulo = todo o historico.

create or replace function public.trafego_meta_retorno_pixel(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_corte date := case when p_dias is null then date '2000-01-01' else current_date - p_dias end;
  v_campanhas jsonb;
  v_marcas jsonb;
  v_sem_marca integer;
  v_envio jsonb;
  v_exec jsonb;
begin
  if not public.is_admin() then
    raise exception 'acesso negado: so administrador ve o retorno ao Meta' using errcode = '42501';
  end if;

  with leads_anuncio as (
    select l.id, l.data_contato, l.experimental_realizada, l.data_experimental, l.converteu, l.aluno_id,
           coalesce(nullif(c.campaign_name, ''), 'Sem campanha') as campanha
      from public.leads l
      join public.meta_ads_cache c on c.source_id = l.meta_ad_source_id
     where l.meta_ad_source_id is not null
       and coalesce(l.arquivado, false) = false
  ),
  leads_c as (
    select campanha, count(*) n from leads_anuncio where data_contato >= v_corte group by 1
  ),
  exp_c as (
    select campanha, count(*) n from leads_anuncio
     where experimental_realizada and data_experimental >= v_corte group by 1
  ),
  mat_c as (
    select la.campanha,
           count(distinct a.id) n,
           coalesce(sum(round(coalesce(a.valor_passaporte, 0) + coalesce(a.valor_parcela, 0) * 12, 2)), 0) valor
      from leads_anuncio la
      join public.alunos a on a.id = la.aluno_id
     where la.converteu and a.arquivado_em is null and a.created_at::date >= v_corte
     group by 1
  ),
  nomes as (
    select campanha from leads_c union select campanha from exp_c union select campanha from mat_c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'campanha', n.campanha,
           'leads', coalesce(l.n, 0),
           'experimentais', coalesce(e.n, 0),
           'matriculas', coalesce(m.n, 0),
           'valor_estimado', coalesce(m.valor, 0)
         ) order by coalesce(m.n, 0) desc, coalesce(l.n, 0) desc), '[]'::jsonb)
    into v_campanhas
    from nomes n
    left join leads_c l on l.campanha = n.campanha
    left join exp_c   e on e.campanha = n.campanha
    left join mat_c   m on m.campanha = n.campanha;

  -- Kids x School: o lead traz faixa_etaria LAMK (Kids) / EMLA (School); a matricula, alunos.classificacao.
  with la as (
    select l.id, l.data_contato, l.experimental_realizada, l.data_experimental, l.converteu, l.aluno_id,
           case upper(coalesce(l.faixa_etaria, '')) when 'LAMK' then 'Kids' when 'EMLA' then 'School'
                else 'Sem classificação' end as marca
      from public.leads l
      join public.meta_ads_cache c on c.source_id = l.meta_ad_source_id
     where l.meta_ad_source_id is not null
       and coalesce(l.arquivado, false) = false
  ),
  leads_m as (select marca, count(*) n from la where data_contato >= v_corte group by 1),
  exp_m as (
    select marca, count(*) n from la where experimental_realizada and data_experimental >= v_corte group by 1
  ),
  mat_m as (
    select case upper(coalesce(a.classificacao, '')) when 'LAMK' then 'Kids' when 'EMLA' then 'School'
                else la.marca end as marca,
           count(distinct a.id) n,
           coalesce(sum(round(coalesce(a.valor_passaporte, 0) + coalesce(a.valor_parcela, 0) * 12, 2)), 0) valor
      from la join public.alunos a on a.id = la.aluno_id
     where la.converteu and a.arquivado_em is null and a.created_at::date >= v_corte
     group by 1
  ),
  marcas as (select marca from leads_m union select marca from exp_m union select marca from mat_m)
  select coalesce(jsonb_agg(jsonb_build_object(
           'marca', k.marca,
           'leads', coalesce(l.n, 0),
           'experimentais', coalesce(e.n, 0),
           'matriculas', coalesce(m.n, 0),
           'valor_estimado', coalesce(m.valor, 0)
         ) order by case k.marca when 'Kids' then 1 when 'School' then 2 else 3 end), '[]'::jsonb)
    into v_marcas
    from marcas k
    left join leads_m l on l.marca = k.marca
    left join exp_m   e on e.marca = k.marca
    left join mat_m   m on m.marca = k.marca;

  -- Matriculas de leads cujo CANAL e do Meta (Instagram, Facebook, Status do WhatsApp) mas SEM marca de anuncio:
  -- sabemos que vieram do Meta, nao sabemos de qual campanha.
  select count(distinct a.id) into v_sem_marca
    from public.leads l
    join public.alunos a on a.id = l.aluno_id
   where l.converteu
     and a.arquivado_em is null
     and a.created_at::date >= v_corte
     and l.canal_origem_id in (1, 2, 13)
     and l.meta_ad_source_id is null
     and l.meta_ctwa_clid is null;

  select jsonb_build_object(
           'enviados_experimental', count(*) filter (where tipo = 'experimental' and enviado_em is not null),
           'enviados_matricula',    count(*) filter (where tipo = 'matricula' and enviado_em is not null),
           'falhas',                count(*) filter (where enviado_em is null and ultimo_erro is not null),
           'ultimo_envio_em',       max(enviado_em)
         )
    into v_envio
    from public.meta_conversoes;

  v_envio := v_envio || jsonb_build_object(
    'aguardando_envio', (
      select count(*) from public.meta_conversoes_fila f
       where f.ocorrido_em >= now() - interval '60 days'
         and length(regexp_replace(coalesce(f.telefone, ''), '\D', '', 'g')) >= 10),
    'sem_telefone', (
      select count(*) from public.meta_conversoes_fila f
       where f.ocorrido_em >= now() - interval '60 days'
         and length(regexp_replace(coalesce(f.telefone, ''), '\D', '', 'g')) < 10)
  );

  select jsonb_build_object(
           'em', e.iniciado_em, 'modo', e.modo, 'desfecho', e.desfecho,
           'enviados', e.enviados, 'falhas', e.falhas, 'erro', e.erro)
    into v_exec
    from public.meta_conversoes_execucao e
   where e.modo = 'enviar'
   order by e.id desc
   limit 1;

  return jsonb_build_object(
    'periodo_dias', p_dias,
    'por_campanha', v_campanhas,
    'por_marca', v_marcas,
    'matriculas_canal_meta_sem_marca', v_sem_marca,
    'envio', v_envio,
    'ultima_rodada', coalesce(v_exec, 'null'::jsonb)
  );
end
$$;

comment on function public.trafego_meta_retorno_pixel(integer) is
  'Pagina Trafego Pago, aba Meta: funil real por campanha (marca de anuncio do lead) + estado do envio ao PIXEL do Meta. So admin. p_dias nulo = tudo.';

revoke all on function public.trafego_meta_retorno_pixel(integer) from public, anon;
grant execute on function public.trafego_meta_retorno_pixel(integer) to authenticated;
