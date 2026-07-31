begin;

-- O objeto extensivel do Emusys pode ganhar PII sem aviso. O snapshot conserva
-- apenas as chaves tecnicas necessarias para identidade e auditoria.
update public.emusys_experimentais_raw
set payload = jsonb_build_object(
  'schema_version', 1,
  'data_aula', data_aula,
  'horario_aula', horario_aula,
  'cancelada', case
    when lower(coalesce(payload ->> 'cancelada', 'false')) = 'true'
      then true
    else false
  end,
  'aula', jsonb_build_object(
    'id', emusys_aula_id
  ),
  'participante', jsonb_build_object(
    'id_lead', case
      when emusys_lead_id_zero then 0
      else emusys_lead_id
    end,
    'id_aluno', emusys_aluno_id
  )
);

-- A interface autenticada usa somente estes sete campos. Dados de contato,
-- nome do professor e payload permanecem privados ao service_role. Os IDs
-- tecnicos abaixo sao necessarios para os filtros do detalhe por unidade.
revoke select on table public.emusys_experimentais_raw
  from authenticated;

grant select (
  id,
  aluno_nome,
  data_aula,
  horario_aula,
  situacao_operacional,
  professor_id,
  unidade_id
) on table public.emusys_experimentais_raw
  to authenticated;

grant select on table public.emusys_experimentais_raw
  to service_role;

commit;
