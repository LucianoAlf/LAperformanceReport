-- ============================================
-- LOJINHA LA MUSIC - TABELAS COMPLETAS
-- Criado em: 02/02/2026
-- ============================================

-- ============================================
-- 1. COLABORADORES (Farmers, Hunters, Gerentes)
-- ============================================
CREATE TABLE IF NOT EXISTS colaboradores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  apelido VARCHAR(50),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('farmer', 'hunter', 'gerente', 'admin')),
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  whatsapp VARCHAR(20),
  email VARCHAR(200),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_colaboradores_unidade ON colaboradores(unidade_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_tipo ON colaboradores(tipo);
CREATE INDEX IF NOT EXISTS idx_colaboradores_ativo ON colaboradores(ativo);

-- Dados iniciais dos Farmers e Hunters
INSERT INTO colaboradores (nome, apelido, tipo, unidade_id, ativo) VALUES
  -- Barra
  ('Eduarda', 'Duda', 'farmer', '368d47f5-2d88-4475-bc14-ba084a9a348e', true),
  ('Arthur', 'Arthur', 'farmer', '368d47f5-2d88-4475-bc14-ba084a9a348e', true),
  ('Kailane', 'Kai', 'hunter', '368d47f5-2d88-4475-bc14-ba084a9a348e', true),
  -- Campo Grande
  ('Gabriela', 'Gabi', 'farmer', '2ec861f6-023f-4d7b-9927-3960ad8c2a92', true),
  ('Jhonatan', 'Jhon', 'farmer', '2ec861f6-023f-4d7b-9927-3960ad8c2a92', true),
  ('Vitória', 'Vitórinha', 'hunter', '2ec861f6-023f-4d7b-9927-3960ad8c2a92', true),
  -- Recreio
  ('Fernanda', 'Fefê', 'farmer', '95553e96-971b-4590-a6eb-0201d013c14d', true),
  ('Daiana', 'Dai', 'farmer', '95553e96-971b-4590-a6eb-0201d013c14d', true),
  ('Clayton', 'Cleitinho', 'hunter', '95553e96-971b-4590-a6eb-0201d013c14d', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- 2. CATEGORIAS DE PRODUTOS
-- ============================================
CREATE TABLE IF NOT EXISTS loja_categorias (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  icone VARCHAR(10) DEFAULT '📦',
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO loja_categorias (nome, icone, ordem) VALUES
  ('Cordas', '🎸', 1),
  ('Palhetas', '🎵', 2),
  ('Baquetas', '🥁', 3),
  ('Camisetas', '👕', 4),
  ('Material Didático', '📕', 5),
  ('Acessórios', '🎧', 6),
  ('Outros', '🎁', 7)
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. PRODUTOS
-- ============================================
CREATE TABLE IF NOT EXISTS loja_produtos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  descricao TEXT,
  categoria_id INTEGER REFERENCES loja_categorias(id) ON DELETE SET NULL,
  sku VARCHAR(50) UNIQUE,
  preco NUMERIC(10,2) NOT NULL,
  custo NUMERIC(10,2),
  estoque_minimo INTEGER DEFAULT 5,
  comissao_especial NUMERIC(5,2), -- NULL = usa padrão
  foto_url TEXT,
  disponivel_whatsapp BOOLEAN DEFAULT false,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loja_produtos_categoria ON loja_produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_loja_produtos_ativo ON loja_produtos(ativo);
CREATE INDEX IF NOT EXISTS idx_loja_produtos_sku ON loja_produtos(sku);

-- ============================================
-- 4. VARIAÇÕES DE PRODUTOS
-- ============================================
CREATE TABLE IF NOT EXISTS loja_variacoes (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER REFERENCES loja_produtos(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  sku VARCHAR(50),
  preco NUMERIC(10,2), -- NULL = usa preço do produto
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loja_variacoes_produto ON loja_variacoes(produto_id);

-- ============================================
-- 5. ESTOQUE (por unidade × variação)
-- ============================================
CREATE TABLE IF NOT EXISTS loja_estoque (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER REFERENCES loja_produtos(id) ON DELETE CASCADE,
  variacao_id INTEGER REFERENCES loja_variacoes(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  quantidade INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices únicos parciais para evitar duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS loja_estoque_sem_variacao_idx 
ON loja_estoque (produto_id, unidade_id) 
WHERE variacao_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS loja_estoque_com_variacao_idx 
ON loja_estoque (produto_id, variacao_id, unidade_id) 
WHERE variacao_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loja_estoque_unidade ON loja_estoque(unidade_id);

-- ============================================
-- 6. MOVIMENTAÇÕES DE ESTOQUE
-- ============================================
CREATE TABLE IF NOT EXISTS loja_movimentacoes_estoque (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER REFERENCES loja_produtos(id) ON DELETE SET NULL,
  variacao_id INTEGER REFERENCES loja_variacoes(id) ON DELETE SET NULL,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada', 'venda', 'estorno', 'ajuste')),
  quantidade INTEGER NOT NULL,
  saldo_apos INTEGER NOT NULL,
  referencia_id INTEGER, -- ID da venda, se aplicável
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loja_mov_estoque_produto ON loja_movimentacoes_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_loja_mov_estoque_unidade ON loja_movimentacoes_estoque(unidade_id);
CREATE INDEX IF NOT EXISTS idx_loja_mov_estoque_data ON loja_movimentacoes_estoque(created_at);

-- ============================================
-- 7. VENDAS
-- ============================================
CREATE TABLE IF NOT EXISTS loja_vendas (
  id SERIAL PRIMARY KEY,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  data_venda TIMESTAMPTZ DEFAULT NOW(),
  
  -- Cliente
  tipo_cliente VARCHAR(20) NOT NULL CHECK (tipo_cliente IN ('aluno', 'colaborador', 'avulso')),
  aluno_id INTEGER REFERENCES alunos(id) ON DELETE SET NULL,
  colaborador_cliente_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  cliente_nome VARCHAR(200), -- para avulso ou snapshot
  
  -- Indicação (professor que indicou a venda)
  professor_indicador_id INTEGER REFERENCES professores(id) ON DELETE SET NULL,
  
  -- Valores
  subtotal NUMERIC(10,2) NOT NULL,
  desconto NUMERIC(10,2) DEFAULT 0,
  desconto_tipo VARCHAR(10) DEFAULT 'valor' CHECK (desconto_tipo IN ('valor', 'percentual')),
  total NUMERIC(10,2) NOT NULL,
  
  -- Pagamento
  forma_pagamento VARCHAR(30) NOT NULL CHECK (forma_pagamento IN ('pix', 'dinheiro', 'debito', 'credito', 'folha', 'saldo')),
  parcelas INTEGER DEFAULT 1,
  
  -- Metadata
  observacoes TEXT,
  comprovante_enviado BOOLEAN DEFAULT false,
  comprovante_enviado_em TIMESTAMPTZ,
  
  -- Status
  status VARCHAR(20) DEFAULT 'concluida' CHECK (status IN ('concluida', 'estornada')),
  estornada_em TIMESTAMPTZ,
  estornada_por INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  motivo_estorno TEXT,
  
  -- Quem vendeu
  vendedor_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loja_vendas_unidade ON loja_vendas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_data ON loja_vendas(data_venda);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_status ON loja_vendas(status);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_vendedor ON loja_vendas(vendedor_id);

-- ============================================
-- 8. ITENS DA VENDA
-- ============================================
CREATE TABLE IF NOT EXISTS loja_vendas_itens (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER REFERENCES loja_vendas(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES loja_produtos(id) ON DELETE SET NULL,
  variacao_id INTEGER REFERENCES loja_variacoes(id) ON DELETE SET NULL,
  
  -- Snapshot no momento da venda
  produto_nome VARCHAR(200) NOT NULL,
  variacao_nome VARCHAR(100),
  
  quantidade INTEGER NOT NULL,
  preco_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loja_vendas_itens_venda ON loja_vendas_itens(venda_id);

-- ============================================
-- 9. CARTEIRA DIGITAL
-- ============================================
CREATE TABLE IF NOT EXISTS loja_carteira (
  id SERIAL PRIMARY KEY,
  tipo_titular VARCHAR(20) NOT NULL CHECK (tipo_titular IN ('farmer', 'professor')),
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE CASCADE,
  professor_id INTEGER REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  saldo NUMERIC(10,2) DEFAULT 0,
  moedas_la INTEGER DEFAULT 0, -- contador de Lalitas
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: um dos dois deve estar preenchido
  CONSTRAINT carteira_titular_check CHECK (
    (tipo_titular = 'farmer' AND colaborador_id IS NOT NULL AND professor_id IS NULL) OR
    (tipo_titular = 'professor' AND professor_id IS NOT NULL AND colaborador_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS loja_carteira_colaborador_idx ON loja_carteira(colaborador_id) WHERE colaborador_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS loja_carteira_professor_idx ON loja_carteira(professor_id) WHERE professor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loja_carteira_unidade ON loja_carteira(unidade_id);

-- ============================================
-- 10. MOVIMENTAÇÕES DA CARTEIRA
-- ============================================
CREATE TABLE IF NOT EXISTS loja_carteira_movimentacoes (
  id SERIAL PRIMARY KEY,
  carteira_id INTEGER REFERENCES loja_carteira(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('comissao_venda', 'comissao_indicacao', 'moeda_la', 'saque', 'compra_loja', 'estorno_comissao', 'ajuste')),
  valor NUMERIC(10,2) NOT NULL,
  saldo_apos NUMERIC(10,2) NOT NULL,
  referencia_tipo VARCHAR(30), -- 'venda', 'matricula', 'saque', etc.
  referencia_id INTEGER,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loja_carteira_mov_carteira ON loja_carteira_movimentacoes(carteira_id);
CREATE INDEX IF NOT EXISTS idx_loja_carteira_mov_data ON loja_carteira_movimentacoes(created_at);

-- ============================================
-- 11. CONFIGURAÇÕES DA LOJA
-- ============================================
CREATE TABLE IF NOT EXISTS loja_configuracoes (
  id SERIAL PRIMARY KEY,
  chave VARCHAR(100) UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configurações iniciais
INSERT INTO loja_configuracoes (chave, valor, descricao) VALUES
  ('comissao_farmer_padrao', '5', 'Percentual de comissão padrão para farmers'),
  ('comissao_professor_indicacao', '5', 'Percentual de comissão para professor que indicou venda'),
  ('valor_moeda_la', '30', 'Valor em R$ de cada Moeda LA (Lalita)'),
  ('estoque_minimo_padrao', '5', 'Estoque mínimo padrão para novos produtos'),
  ('alerta_whatsapp_ativo', 'true', 'Disparo automático de alerta de estoque baixo'),
  ('template_comprovante', '🛍️ *LA Music - Comprovante de Compra*
📍 Unidade: {unidade}
📅 Data: {data}
👤 Cliente: {cliente}

{itens}

💰 *Total: {total}*
💳 Pagamento: {forma_pagamento}

Obrigado pela compra! 🎵', 'Template de comprovante WhatsApp'),
  ('template_alerta_estoque', '⚠️ *Alerta de Estoque - LA Music {unidade}*

Produtos com estoque crítico:

{lista_produtos}

Favor providenciar reposição.
📅 {data}', 'Template de alerta de estoque WhatsApp')
ON CONFLICT (chave) DO NOTHING;

-- ============================================
-- 12. RESPONSÁVEIS POR REPOSIÇÃO
-- ============================================
CREATE TABLE IF NOT EXISTS loja_responsaveis_reposicao (
  id SERIAL PRIMARY KEY,
  unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  whatsapp VARCHAR(20) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS loja_responsaveis_unidade_idx ON loja_responsaveis_reposicao(unidade_id) WHERE ativo = true;

-- ============================================
-- 13. OPT-IN NOVIDADES (alunos que recebem avisos)
-- ============================================
CREATE TABLE IF NOT EXISTS loja_optin_novidades (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  whatsapp VARCHAR(20),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(aluno_id, unidade_id)
);

CREATE INDEX IF NOT EXISTS idx_loja_optin_unidade ON loja_optin_novidades(unidade_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_variacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_vendas_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_carteira ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_carteira_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_responsaveis_reposicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_optin_novidades ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura para usuários autenticados
CREATE POLICY "Leitura colaboradores" ON colaboradores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura categorias" ON loja_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura produtos" ON loja_produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura variacoes" ON loja_variacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura estoque" ON loja_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura mov_estoque" ON loja_movimentacoes_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura vendas" ON loja_vendas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura vendas_itens" ON loja_vendas_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura carteira" ON loja_carteira FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura carteira_mov" ON loja_carteira_movimentacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura configuracoes" ON loja_configuracoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura responsaveis" ON loja_responsaveis_reposicao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura optin" ON loja_optin_novidades FOR SELECT TO authenticated USING (true);

-- Políticas de escrita para usuários autenticados
CREATE POLICY "Escrita colaboradores" ON colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita categorias" ON loja_categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita produtos" ON loja_produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita variacoes" ON loja_variacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita estoque" ON loja_estoque FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita mov_estoque" ON loja_movimentacoes_estoque FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita vendas" ON loja_vendas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita vendas_itens" ON loja_vendas_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita carteira" ON loja_carteira FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita carteira_mov" ON loja_carteira_movimentacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita configuracoes" ON loja_configuracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita responsaveis" ON loja_responsaveis_reposicao FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita optin" ON loja_optin_novidades FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- TRIGGER: Atualizar updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_colaboradores_updated_at BEFORE UPDATE ON colaboradores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loja_produtos_updated_at BEFORE UPDATE ON loja_produtos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loja_estoque_updated_at BEFORE UPDATE ON loja_estoque FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loja_carteira_updated_at BEFORE UPDATE ON loja_carteira FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loja_configuracoes_updated_at BEFORE UPDATE ON loja_configuracoes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
