-- Harness SQL — Sol Caixa V3 (composto + abrir/fechar)
--
-- RODAR SOMENTE NUM BANCO DESCARTÁVEL cujo nome termine em _test.
-- Não roda em produção: troca temporariamente wrappers de leitura dentro de BEGIN e
-- sempre faz ROLLBACK. O runner de CI deve executar esta migration antes deste arquivo.
\set ON_ERROR_STOP on

begin;

do $guard$
begin
  if current_database() !~ '_test$' then
    raise exception 'harness sol-caixa-v3 só pode rodar em banco *_test; atual=%', current_database();
  end if;
end
$guard$;

-- Fixtures do envelope canônico: o resolver deve consumir a RPC, nunca tabelas cruas.
create or replace function public.sol_faturas_alunos_v1(
  p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_case text := current_setting('sol.caixa_v3_harness_case', true);
  v_items jsonb;
begin
  v_items := case v_case
    when 'duas_parcelas' then jsonb_build_array(
      jsonb_build_object('canonical_fatura_id','11111111-1111-1111-1111-111111111111','competencia','2026-08-01','data_vencimento','2026-08-10','status','aberta','tipo_fatura','parcela','descricao','Parcela 1','emusys_student_id','stu-ana','aluno',jsonb_build_object('id',101,'nome','Ana Teste'),'valores',jsonb_build_object('valor_hoje',40,'valor_com_desconto',40)),
      jsonb_build_object('canonical_fatura_id','22222222-2222-2222-2222-222222222222','competencia','2026-08-01','data_vencimento','2026-08-11','status','aberta','tipo_fatura','parcela','descricao','Parcela 2','emusys_student_id','stu-ana','aluno',jsonb_build_object('id',101,'nome','Ana Teste'),'valores',jsonb_build_object('valor_hoje',60,'valor_com_desconto',60))
    )
    when 'parcela_passaporte' then jsonb_build_array(
      jsonb_build_object('canonical_fatura_id','33333333-3333-3333-3333-333333333333','competencia','2026-08-01','data_vencimento','2026-08-10','status','aberta','tipo_fatura','parcela','descricao','Parcela agosto','emusys_student_id','stu-ana','aluno',jsonb_build_object('id',101,'nome','Ana Teste'),'valores',jsonb_build_object('valor_hoje',80,'valor_com_desconto',80)),
      jsonb_build_object('canonical_fatura_id','44444444-4444-4444-4444-444444444444','competencia','2026-08-01','data_vencimento','2026-08-11','status','aberta','tipo_fatura','passaporte_taxa_matricula','descricao','Passaporte','emusys_student_id','stu-ana','aluno',jsonb_build_object('id',101,'nome','Ana Teste'),'valores',jsonb_build_object('valor_hoje',20,'valor_com_desconto',20))
    )
    when 'ambigua' then jsonb_build_array(
      jsonb_build_object('canonical_fatura_id','55555555-5555-5555-5555-555555555555','competencia','2026-08-01','data_vencimento','2026-08-01','status','aberta','tipo_fatura','parcela','descricao','A','emusys_student_id','stu-ana','aluno',jsonb_build_object('id',101,'nome','Ana Teste'),'valores',jsonb_build_object('valor_hoje',30)),
      jsonb_build_object('canonical_fatura_id','66666666-6666-6666-6666-666666666666','competencia','2026-08-01','data_vencimento','2026-08-02','status','aberta','tipo_fatura','parcela','descricao','B','emusys_student_id','stu-ana','aluno',jsonb_build_object('id',101,'nome','Ana Teste'),'valores',jsonb_build_object('valor_hoje',70)),
      jsonb_build_object('canonical_fatura_id','77777777-7777-7777-7777-777777777777','competencia','2026-08-01','data_vencimento','2026-08-03','status','aberta','tipo_fatura','parcela','descricao','C','emusys_student_id','stu-ana','aluno',jsonb_build_object('id',101,'nome','Ana Teste'),'valores',jsonb_build_object('valor_hoje',40)),
      jsonb_build_object('canonical_fatura_id','88888888-8888-8888-8888-888888888888','competencia','2026-08-01','data_vencimento','2026-08-04','status','aberta','tipo_fatura','parcela','descricao','D','emusys_student_id','stu-ana','aluno',jsonb_build_object('id',101,'nome','Ana Teste'),'valores',jsonb_build_object('valor_hoje',60))
    )
    when 'matriculas_mesma_pessoa' then jsonb_build_array(
      jsonb_build_object('canonical_fatura_id','99999999-9999-9999-9999-999999999991','competencia','2026-08-01','data_vencimento','2026-08-10','status','aberta','tipo_fatura','parcela','descricao','Curso A','emusys_student_id','stu-pessoa-multi','aluno',jsonb_build_object('id',701,'nome','Pessoa Multi'),'valores',jsonb_build_object('valor_hoje',400)),
      jsonb_build_object('canonical_fatura_id','99999999-9999-9999-9999-999999999992','competencia','2026-08-01','data_vencimento','2026-08-11','status','aberta','tipo_fatura','parcela','descricao','Curso B','emusys_student_id','stu-pessoa-multi','aluno',jsonb_build_object('id',702,'nome','Pessoa Multi'),'valores',jsonb_build_object('valor_hoje',414.81))
    )
    when 'pessoas_ambiguas' then jsonb_build_array(
      jsonb_build_object('canonical_fatura_id','99999999-9999-9999-9999-999999999993','competencia','2026-08-01','data_vencimento','2026-08-10','status','aberta','tipo_fatura','parcela','descricao','Pessoa A','emusys_student_id','stu-1','aluno',jsonb_build_object('id',703,'nome','Nome Igual'),'valores',jsonb_build_object('valor_hoje',50)),
      jsonb_build_object('canonical_fatura_id','99999999-9999-9999-9999-999999999994','competencia','2026-08-01','data_vencimento','2026-08-11','status','aberta','tipo_fatura','parcela','descricao','Pessoa B','emusys_student_id','stu-2','aluno',jsonb_build_object('id',704,'nome','Nome Igual'),'valores',jsonb_build_object('valor_hoje',50))
    )
    else '[]'::jsonb
  end;
  return jsonb_build_object('status','ok','items',v_items);
end $fn$;

create or replace function public.sol_caixa_responsavel_aluno(p_unidade_id uuid, p_aluno text)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('ok',true,'responsavel_nome','Responsável Diferente do Pagador');
$$;

do $assert$
declare
  u constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  d constant date := '2099-01-10';
  g constant text := 'sol-caixa-v3-harness@g.us';
  r jsonb;
  s jsonb;
  p uuid;
  a uuid;
  e uuid;
  c uuid;
  payload jsonb;
begin
  -- 1. Uma parcela distribuída em dois comprovantes: o subconjunto exato é derivado.
  perform set_config('sol.caixa_v3_harness_case','duas_parcelas',true);
  r := public.sol_caixa_resolver_composto_aluno_v1(jsonb_build_object('unidade_id',u,'aluno_nome','Ana Teste','valor_total',100,'as_of','2026-08-22'));
  if not coalesce((r->>'ok')::boolean,false) or jsonb_array_length(r->'itens') <> 2 then
    raise exception 'caso duas parcelas falhou: %', r;
  end if;
  if r #>> '{itens,0,responsavel_financeiro}' <> 'Responsável Diferente do Pagador' then
    raise exception 'pagador/responsável não preservado: %', r;
  end if;

  -- 1b. Uma pessoa com duas matrículas não é ambígua; cada item preserva sua matrícula.
  perform set_config('sol.caixa_v3_harness_case','matriculas_mesma_pessoa',true);
  r := public.sol_caixa_resolver_composto_aluno_v1(jsonb_build_object('unidade_id',u,'aluno_nome','Pessoa Multi','valor_total',814.81,'as_of','2026-08-22'));
  if not coalesce((r->>'ok')::boolean,false)
     or jsonb_array_length(r->'itens') <> 2
     or (r #>> '{itens,0,aluno_id}')::integer <> 701
     or (r #>> '{itens,1,aluno_id}')::integer <> 702 then
    raise exception 'matrículas da mesma pessoa deveriam resolver por student_id: %', r;
  end if;

  -- 1c. Mesmo nome em pessoas distintas continua ambíguo e falha fechado.
  perform set_config('sol.caixa_v3_harness_case','pessoas_ambiguas',true);
  r := public.sol_caixa_resolver_composto_aluno_v1(jsonb_build_object('unidade_id',u,'aluno_nome','Nome Igual','valor_total',100,'as_of','2026-08-22'));
  if coalesce((r->>'ok')::boolean,false) or r->>'motivo' <> 'aluno_ambiguo' then
    raise exception 'pessoas distintas com mesmo nome deveriam bloquear: %', r;
  end if;

  -- 2. Parcela + passaporte mantém o mesmo shape do multi-aluno e categorias distintas.
  perform set_config('sol.caixa_v3_harness_case','parcela_passaporte',true);
  r := public.sol_caixa_resolver_composto_aluno_v1(jsonb_build_object('unidade_id',u,'aluno_nome','Ana Teste','valor_total',100,'as_of','2026-08-22'));
  if not coalesce((r->>'ok')::boolean,false)
     or r #>> '{itens,0,aluno_id}' is null
     or r #>> '{itens,0,canonical_fatura_id}' is null
     or not exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'categoria'='passaporte') then
    raise exception 'caso parcela+passaporte falhou: %', r;
  end if;

  -- 3. Dois subconjuntos exatos nunca escolhem o primeiro: bloqueiam como ambíguos.
  perform set_config('sol.caixa_v3_harness_case','ambigua',true);
  r := public.sol_caixa_resolver_composto_aluno_v1(jsonb_build_object('unidade_id',u,'aluno_nome','Ana Teste','valor_total',100,'as_of','2026-08-22'));
  if coalesce((r->>'ok')::boolean,false) or r->>'motivo' <> 'composicao_ambigua' then
    raise exception 'caso ambíguo deveria falhar fechado: %', r;
  end if;

  -- 4. O multi João/Pedro continua sendo função separada: a migration não altera a sua assinatura.
  if to_regprocedure('public.sol_caixa_resolver_multi_aluno_v1(uuid,jsonb,numeric,date)') is null then
    raise exception 'resolver multi João/Pedro ausente';
  end if;

  -- 5. Abrir/fechar: snapshot, replay, mudança de Pix e consumo depois da revalidação.
  if to_regprocedure('public.sol_caixa_abrir_v3(jsonb)') is null
     or to_regprocedure('public.sol_caixa_fechar_v3(jsonb)') is null
     or to_regprocedure('public.sol_caixa_validar_abertura_fechamento_v1(jsonb,text)') is null then
    raise exception 'RPCs V3 de abrir/fechar ausentes';
  end if;

  insert into public.unidades(id,nome) values(u,'Harness') on conflict do nothing;

  -- Abertura normal e replay: mesma chave não cria segundo caixa.
  r := public.sol_caixa_resolver_abertura_v3(jsonb_build_object('unidade_id',u,'data_caixa',d));
  if not coalesce((r->>'ok')::boolean,false) then raise exception 'resolver abertura falhou: %', r; end if;
  s := r->'snapshot';
  insert into public.sol_caixa_shadow_eventos_v1(chat_id_hash,unidade_id) values(md5(g),u) returning id into e;
  insert into public.sol_caixa_shadow_previews_v1(evento_id,preview_hash,unidade_id,operacao,categoria,valor_centavos,forma,status,preview_json)
  values(e,'preview-abertura',u,'abrir_caixa','abertura_caixa',0,'nao_aplicavel','awaiting_approval',jsonb_build_object('snapshot',s)) returning id into p;
  insert into public.sol_caixa_shadow_approvals_v1(preview_id,approval_event_hash,actor_id_hash,decision)
  values(p,'approval-abertura','ator-hash','approved') returning id into a;
  payload := jsonb_build_object('unidade_id',u,'data_caixa',d,'grupo_jid',g,'ator_numero','5521999999999','ator_papel','harness','conferido_por','Harness','idempotency_key','harness:abrir','v3_preview_id',p,'v3_preview_hash','preview-abertura','v3_approval_id',a,'v3_approval_event_hash','approval-abertura','v3_actor_id_hash','ator-hash','snapshot_hash',encode(extensions.digest(s::text,'sha256'),'hex'));
  r := public.sol_caixa_abrir_v3(payload);
  if not coalesce((r->>'ok')::boolean,false) then raise exception 'abertura v3 falhou: %',r; end if;
  c := (r->>'caixa_diario_id')::uuid;
  if not coalesce((public.sol_caixa_abrir_v3(payload)->>'ja_processado')::boolean,false) then raise exception 'replay de abertura não idempotente'; end if;

  -- Preview de fechamento fica inválido se entrar uma venda Pix: conta por ambiente muda.
  r := public.sol_caixa_resolver_fechamento_v3(jsonb_build_object('unidade_id',u,'data_caixa',d));
  s := r->'snapshot';
  insert into public.sol_caixa_shadow_eventos_v1(chat_id_hash,unidade_id) values(md5(g),u) returning id into e;
  insert into public.sol_caixa_shadow_previews_v1(evento_id,preview_hash,unidade_id,operacao,categoria,valor_centavos,forma,status,preview_json)
  values(e,'preview-fechar-antigo',u,'fechar_caixa','fechamento_caixa',0,'nao_aplicavel','awaiting_approval',jsonb_build_object('snapshot',s)) returning id into p;
  insert into public.sol_caixa_shadow_approvals_v1(preview_id,approval_event_hash,actor_id_hash,decision)
  values(p,'approval-fechar-antigo','ator-hash','approved') returning id into a;
  insert into public.caixa_movimentacoes(caixa_diario_id,unidade_id,ambiente,tipo,valor,data_movimento,forma_pagamento,categoria,descricao)
  values(c,u,'venda','entrada',10,d,'pix','outro','Pix depois do preview');
  payload := jsonb_build_object('unidade_id',u,'data_caixa',d,'grupo_jid',g,'ator_numero','5521999999999','ator_papel','harness','conferido_por','Harness','idempotency_key','harness:fechar-antigo','v3_preview_id',p,'v3_preview_hash','preview-fechar-antigo','v3_approval_id',a,'v3_approval_event_hash','approval-fechar-antigo','v3_actor_id_hash','ator-hash','snapshot_hash',encode(extensions.digest(s::text,'sha256'),'hex'));
  r := public.sol_caixa_fechar_v3(payload);
  if coalesce((r->>'ok')::boolean,false) or r->>'motivo' <> 'snapshot_caixa_divergente' then raise exception 'Pix deveria invalidar fechamento: %',r; end if;
  if exists(select 1 from public.sol_caixa_v3_approval_consumos_v1 where approval_id=a) then raise exception 'snapshot recusado consumiu approval'; end if;

  -- Corrida com o fechamento legado: a mutação não acha caixa aberto e o approval
  -- não pode ser queimado. O trigger apenas simula a corrida dentro da transação.
  r := public.sol_caixa_resolver_fechamento_v3(jsonb_build_object('unidade_id',u,'data_caixa',d));
  s := r->'snapshot';
  insert into public.sol_caixa_shadow_eventos_v1(chat_id_hash,unidade_id) values(md5(g),u) returning id into e;
  insert into public.sol_caixa_shadow_previews_v1(evento_id,preview_hash,unidade_id,operacao,categoria,valor_centavos,forma,status,preview_json)
  values(e,'preview-fechar-corrida',u,'fechar_caixa','fechamento_caixa',1000,'nao_aplicavel','awaiting_approval',jsonb_build_object('snapshot',s)) returning id into p;
  insert into public.sol_caixa_shadow_approvals_v1(preview_id,approval_event_hash,actor_id_hash,decision)
  values(p,'approval-fechar-corrida','ator-hash','approved') returning id into a;
  execute 'create trigger sol_caixa_v3_harness_skip_close before update on public.caixas_diarios for each row execute function public.sol_caixa_v3_harness_skip_close()';
  perform set_config('sol.caixa_v3_harness_skip_close','on',true);
  payload := jsonb_build_object('unidade_id',u,'data_caixa',d,'grupo_jid',g,'ator_numero','5521999999999','ator_papel','harness','conferido_por','Harness','idempotency_key','harness:fechar-corrida','v3_preview_id',p,'v3_preview_hash','preview-fechar-corrida','v3_approval_id',a,'v3_approval_event_hash','approval-fechar-corrida','v3_actor_id_hash','ator-hash','snapshot_hash',encode(extensions.digest(s::text,'sha256'),'hex'));
  r := public.sol_caixa_fechar_v3(payload);
  if coalesce((r->>'ok')::boolean,false) or r->>'motivo' <> 'snapshot_caixa_nao_aberto' then raise exception 'corrida deveria preservar fechamento: %',r; end if;
  if exists(select 1 from public.sol_caixa_v3_approval_consumos_v1 where approval_id=a) then raise exception 'corrida queimou approval sem mutação'; end if;
  perform set_config('sol.caixa_v3_harness_skip_close','off',true);
  execute 'drop trigger sol_caixa_v3_harness_skip_close on public.caixas_diarios';

  -- Novo preview fecha; replay da chave retorna o mesmo resultado.
  r := public.sol_caixa_resolver_fechamento_v3(jsonb_build_object('unidade_id',u,'data_caixa',d));
  s := r->'snapshot';
  insert into public.sol_caixa_shadow_eventos_v1(chat_id_hash,unidade_id) values(md5(g),u) returning id into e;
  insert into public.sol_caixa_shadow_previews_v1(evento_id,preview_hash,unidade_id,operacao,categoria,valor_centavos,forma,status,preview_json)
  values(e,'preview-fechar-novo',u,'fechar_caixa','fechamento_caixa',1000,'nao_aplicavel','awaiting_approval',jsonb_build_object('snapshot',s)) returning id into p;
  insert into public.sol_caixa_shadow_approvals_v1(preview_id,approval_event_hash,actor_id_hash,decision)
  values(p,'approval-fechar-novo','ator-hash','approved') returning id into a;
  payload := jsonb_build_object('unidade_id',u,'data_caixa',d,'grupo_jid',g,'ator_numero','5521999999999','ator_papel','harness','conferido_por','Harness','idempotency_key','harness:fechar-novo','v3_preview_id',p,'v3_preview_hash','preview-fechar-novo','v3_approval_id',a,'v3_approval_event_hash','approval-fechar-novo','v3_actor_id_hash','ator-hash','snapshot_hash',encode(extensions.digest(s::text,'sha256'),'hex'));
  r := public.sol_caixa_fechar_v3(payload);
  if not coalesce((r->>'ok')::boolean,false) then raise exception 'fechamento v3 falhou: %',r; end if;
  if not coalesce((public.sol_caixa_fechar_v3(payload)->>'ja_processado')::boolean,false) then raise exception 'replay de fechamento não idempotente'; end if;
end
$assert$;

rollback;
