-- Adiciona campo whatsapp_consultor na mila_config
-- Permite configurar dinamicamente o número do consultor que recebe transferências
ALTER TABLE mila_config ADD COLUMN IF NOT EXISTS whatsapp_consultor VARCHAR(20);

-- Setar o número da Vitória (CG) como padrão
UPDATE mila_config SET whatsapp_consultor = '5521965529851' WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
