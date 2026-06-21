alter table public.lead_experimentais_decisoes_humanas
  drop constraint if exists lead_experimentais_decisoes_humanas_decisao_check;

alter table public.lead_experimentais_decisoes_humanas
  add constraint lead_experimentais_decisoes_humanas_decisao_check
  check (decisao = any (array[
    'duplicidade_reagendamento_ignorar'::text,
    'matricula_direta_sem_experimental'::text,
    'responsavel_sem_aluno'::text,
    'pendente_cadastro_nao_encontrado'::text,
    'aluno_excluido_pos_matricula'::text,
    'vinculo_confirmado_humano'::text,
    'realizada_sem_matricula_confirmada'::text,
    'realizada_com_matricula_confirmada'::text,
    'experimental_faltou_confirmada'::text,
    'revisar_manual'::text
  ]));

comment on constraint lead_experimentais_decisoes_humanas_decisao_check
  on public.lead_experimentais_decisoes_humanas
  is 'Decisoes humanas permitidas para conciliacao de experimentais v2; preserva legados e aceita classificacoes usadas pela UI/RPC.';
