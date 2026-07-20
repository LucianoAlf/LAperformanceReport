-- Adiciona coluna para exibir o número de telefone (display_phone_number da Graph API)
-- ao lado do phone_number_id, facilitando identificação visual na tela de Config.
alter table public.numeros_meta
  add column if not exists numero_telefone text;

comment on column public.numeros_meta.numero_telefone is
  'Número de telefone formatado (display_phone_number da Graph API), só para exibição. Buscado sob demanda, não usado para envio.';
