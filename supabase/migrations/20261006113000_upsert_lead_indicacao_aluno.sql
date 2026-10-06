-- "INDICAÇÃO ALUNO" (opção do "Como conheceu" que só existe na Barra, id 35) não tinha tradução no
-- upsert_lead: caía no `else p_canal`, não casava com canal nenhum e o lead ficava sem origem (caso
-- Duda, lead 14732, marcada pela consultora em 01/10/2026). Era a única opção do Emusys que se perdia
-- (medido em 06/10). Passa a virar Indicação. Aplicada em 06/10 via MCP; recuperação da Duda feita
-- reenviando ao Emusys a mesma opção (35), para o webhook regravar o canal.
-- Edição cirúrgica sobre a versão em produção, travada pelo md5: se a função mudou, recusa.
do $$
declare
  v_def  text;
  v_novo text;
begin
  v_def := pg_get_functiondef('public.upsert_lead(text,text,text,uuid,text,text,integer,text,boolean,date,date)'::regprocedure);
  if position('INDICAÇÃO ALUNO' in v_def) > 0 then
    return;  -- já aplicada
  end if;
  if md5(v_def) <> 'aadeced22246130ac61dfe3bc4bc5658' then
    raise exception 'upsert_lead mudou desde a leitura (md5 %): reaplicar a partir da versão nova', md5(v_def);
  end if;
  v_novo := replace(v_def,
    $a$    when 'AMIGO' then 'Indicação'$a$,
    $b$    when 'AMIGO' then 'Indicação'
    when 'INDICAÇÃO ALUNO' then 'Indicação'$b$);
  if v_novo = v_def then
    raise exception 'âncora AMIGO não encontrada no upsert_lead';
  end if;
  execute v_novo;
end
$$;
