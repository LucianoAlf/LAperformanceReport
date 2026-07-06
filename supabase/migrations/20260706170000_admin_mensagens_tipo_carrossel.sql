-- Permite tipo='carrossel' em admin_mensagens (boas-vindas da equipe renderizada com cards).
ALTER TABLE admin_mensagens DROP CONSTRAINT IF EXISTS admin_mensagens_tipo_check;
ALTER TABLE admin_mensagens ADD CONSTRAINT admin_mensagens_tipo_check
  CHECK (
    (tipo)::text = ANY (ARRAY[
      'texto','imagem','audio','video','documento','sticker',
      'sistema','interativo','contato','localizacao','carrossel'
    ]::text[])
  );
