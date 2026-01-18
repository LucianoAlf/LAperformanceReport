# 🔐 Instruções para Ativar Autenticação e Controle de Acesso

## 📋 Passo a Passo

### 1️⃣ Aplicar Migrations no Supabase

Acesse o **Supabase Dashboard** → **SQL Editor** e execute os arquivos na ordem:

#### Migration 1: Ajustar Tabela Usuarios
```sql
-- Arquivo: supabase/migrations/fase5_5a_ajustar_usuarios.sql

-- Ajustar estrutura da tabela usuarios
ALTER TABLE usuarios DROP COLUMN IF EXISTS perfil CASCADE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) DEFAULT 'unidade';

-- Validar perfis
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check 
  CHECK (perfil IN ('admin', 'unidade'));

-- Permitir unidade_id NULL para admin
ALTER TABLE usuarios ALTER COLUMN unidade_id DROP NOT NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios(perfil);
CREATE INDEX IF NOT EXISTS idx_usuarios_unidade_id ON usuarios(unidade_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

-- Comentários
COMMENT ON COLUMN usuarios.perfil IS 'Perfil do usuário: admin (acesso total) ou unidade (acesso restrito)';
COMMENT ON COLUMN usuarios.unidade_id IS 'Unidade do usuário. NULL para admin, preenchido para usuários de unidade';
```

#### Migration 2: Criar Políticas RLS
```sql
-- Arquivo: supabase/migrations/fase5_5b_criar_politicas_rls.sql

-- Habilitar RLS
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE evasoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorios_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Funções auxiliares
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios 
    WHERE id = auth.uid() 
    AND perfil = 'admin' 
    AND ativo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_unidade_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT unidade_id FROM usuarios 
    WHERE id = auth.uid() 
    AND ativo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Políticas para ALUNOS
DROP POLICY IF EXISTS "alunos_select_policy" ON alunos;
CREATE POLICY "alunos_select_policy" ON alunos
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "alunos_insert_policy" ON alunos;
CREATE POLICY "alunos_insert_policy" ON alunos
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "alunos_update_policy" ON alunos;
CREATE POLICY "alunos_update_policy" ON alunos
  FOR UPDATE USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "alunos_delete_policy" ON alunos;
CREATE POLICY "alunos_delete_policy" ON alunos
  FOR DELETE USING (is_admin());

-- Políticas para LEADS
DROP POLICY IF EXISTS "leads_select_policy" ON leads;
CREATE POLICY "leads_select_policy" ON leads
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "leads_insert_policy" ON leads;
CREATE POLICY "leads_insert_policy" ON leads
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "leads_update_policy" ON leads;
CREATE POLICY "leads_update_policy" ON leads
  FOR UPDATE USING (is_admin() OR unidade_id = get_user_unidade_id());

-- Políticas para MOVIMENTACOES
DROP POLICY IF EXISTS "movimentacoes_select_policy" ON movimentacoes;
CREATE POLICY "movimentacoes_select_policy" ON movimentacoes
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "movimentacoes_insert_policy" ON movimentacoes;
CREATE POLICY "movimentacoes_insert_policy" ON movimentacoes
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

-- Políticas para RENOVACOES
DROP POLICY IF EXISTS "renovacoes_select_policy" ON renovacoes;
CREATE POLICY "renovacoes_select_policy" ON renovacoes
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "renovacoes_insert_policy" ON renovacoes;
CREATE POLICY "renovacoes_insert_policy" ON renovacoes
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

-- Políticas para EVASOES
DROP POLICY IF EXISTS "evasoes_select_policy" ON evasoes;
CREATE POLICY "evasoes_select_policy" ON evasoes
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "evasoes_insert_policy" ON evasoes;
CREATE POLICY "evasoes_insert_policy" ON evasoes
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

-- Políticas para RELATORIOS_DIARIOS
DROP POLICY IF EXISTS "relatorios_diarios_select_policy" ON relatorios_diarios;
CREATE POLICY "relatorios_diarios_select_policy" ON relatorios_diarios
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "relatorios_diarios_insert_policy" ON relatorios_diarios;
CREATE POLICY "relatorios_diarios_insert_policy" ON relatorios_diarios
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

-- Políticas para METAS (apenas admin pode criar/editar)
DROP POLICY IF EXISTS "metas_select_policy" ON metas;
CREATE POLICY "metas_select_policy" ON metas
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "metas_insert_policy" ON metas;
CREATE POLICY "metas_insert_policy" ON metas
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "metas_update_policy" ON metas;
CREATE POLICY "metas_update_policy" ON metas
  FOR UPDATE USING (is_admin());

-- Políticas para USUARIOS (apenas admin gerencia)
DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "usuarios_insert_policy" ON usuarios;
CREATE POLICY "usuarios_insert_policy" ON usuarios
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "usuarios_update_policy" ON usuarios;
CREATE POLICY "usuarios_update_policy" ON usuarios
  FOR UPDATE USING (is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "usuarios_delete_policy" ON usuarios;
CREATE POLICY "usuarios_delete_policy" ON usuarios
  FOR DELETE USING (is_admin());

-- Tabelas de referência: acesso público para leitura
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidades_select_policy" ON unidades;
CREATE POLICY "unidades_select_policy" ON unidades FOR SELECT USING (true);

ALTER TABLE cursos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cursos_select_policy" ON cursos;
CREATE POLICY "cursos_select_policy" ON cursos FOR SELECT USING (true);

ALTER TABLE professores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "professores_select_policy" ON professores;
CREATE POLICY "professores_select_policy" ON professores FOR SELECT USING (true);

ALTER TABLE canais_origem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canais_origem_select_policy" ON canais_origem;
CREATE POLICY "canais_origem_select_policy" ON canais_origem FOR SELECT USING (true);

ALTER TABLE motivos_evasao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "motivos_evasao_select_policy" ON motivos_evasao;
CREATE POLICY "motivos_evasao_select_policy" ON motivos_evasao FOR SELECT USING (true);
```

---

### 2️⃣ Criar Seu Usuário Admin

1. **Supabase Dashboard** → **Authentication** → **Users** → **Add user**
2. Preencha:
   - Email: `seu-email@lamusic.com.br`
   - Password: (defina uma senha segura)
   - **Auto Confirm User**: ✅ Marque esta opção
3. Clique em **Create user**
4. **Copie o UUID** do usuário criado (aparece na lista)
5. Execute no **SQL Editor**:

```sql
-- Substitua 'COLE-O-UUID-AQUI' pelo UUID copiado
INSERT INTO usuarios (id, email, nome, perfil, unidade_id, ativo)
VALUES (
  'COLE-O-UUID-AQUI',
  'seu-email@lamusic.com.br',
  'Luciano',
  'admin',
  NULL,
  true
);
```

---

### 3️⃣ Criar Usuários das Unidades

Para cada unidade (Campo Grande, Recreio, Barra):

#### Passo 1: Criar no Supabase Auth
1. **Authentication** → **Users** → **Add user**
2. Email: `cg@lamusic.com.br` (exemplo)
3. Password: (senha)
4. **Auto Confirm User**: ✅
5. Copie o UUID

#### Passo 2: Buscar ID da Unidade
```sql
-- Ver IDs das unidades
SELECT id, nome, codigo FROM unidades;
```

#### Passo 3: Inserir na Tabela Usuarios
```sql
-- Campo Grande
INSERT INTO usuarios (id, email, nome, perfil, unidade_id, ativo)
VALUES (
  'UUID-DO-USUARIO',
  'cg@lamusic.com.br',
  'Equipe Campo Grande',
  'unidade',
  'ID-DA-UNIDADE-CAMPO-GRANDE',  -- Cole o ID da query acima
  true
);

-- Recreio
INSERT INTO usuarios (id, email, nome, perfil, unidade_id, ativo)
VALUES (
  'UUID-DO-USUARIO',
  'rec@lamusic.com.br',
  'Equipe Recreio',
  'unidade',
  'ID-DA-UNIDADE-RECREIO',
  true
);

-- Barra
INSERT INTO usuarios (id, email, nome, perfil, unidade_id, ativo)
VALUES (
  'UUID-DO-USUARIO',
  'barra@lamusic.com.br',
  'Equipe Barra',
  'unidade',
  'ID-DA-UNIDADE-BARRA',
  true
);
```

---

## ✅ Verificar se Funcionou

### Consultas Úteis

```sql
-- Ver todos os usuários cadastrados
SELECT 
  u.id,
  u.email,
  u.nome,
  u.perfil,
  un.nome as unidade_nome,
  u.ativo
FROM usuarios u 
LEFT JOIN unidades un ON u.unidade_id = un.id
ORDER BY u.perfil DESC, u.nome;

-- Verificar se RLS está habilitado
SELECT 
  tablename, 
  rowsecurity as rls_habilitado 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Testar política (execute logado como usuário de unidade)
SELECT COUNT(*) FROM alunos;  -- Deve retornar apenas alunos da sua unidade
```

---

## 🎯 URLs do Sistema

| Página | URL |
|--------|-----|
| **Login** | http://localhost:3002/login |
| **Dashboard** | http://localhost:3002/app |
| **Gerenciar Usuários** (admin) | http://localhost:3002/app/admin/usuarios |
| **Entrada de Dados** | http://localhost:3002/app/entrada |

---

## 🔐 Como Funciona

### Perfis de Acesso

| Perfil | Acesso | Seletor de Unidade | Cor do Avatar |
|--------|--------|-------------------|---------------|
| **Admin** | Consolidado + todas unidades | ✅ Dropdown visível | 🟣 Roxo |
| **Unidade** | Apenas sua unidade | ❌ Fixo | 🔵 Azul |

### Isolamento de Dados

- **Campo Grande** não vê dados de Recreio nem Barra
- **Recreio** não vê dados de Campo Grande nem Barra
- **Barra** não vê dados de Campo Grande nem Recreio
- **Admin** vê tudo e pode alternar entre unidades

### Segurança em 3 Camadas

1. **RLS (Banco)** → Filtra automaticamente no PostgreSQL
2. **Supabase** → Valida permissões em cada query
3. **Frontend** → Esconde UI não autorizada

---

## 🚨 Troubleshooting

### Erro: "Email ou senha incorretos"
- Verifique se o usuário foi criado no Supabase Auth
- Verifique se marcou "Auto Confirm User"
- Verifique se o registro existe na tabela `usuarios`

### Erro: "Nenhum dado aparece"
- Execute a query de verificação de RLS
- Verifique se o `unidade_id` está correto na tabela `usuarios`
- Teste logado como admin primeiro

### Usuário não consegue fazer login
- Verifique se `ativo = true` na tabela `usuarios`
- Verifique se o email é exatamente o mesmo no Auth e na tabela

---

## 📞 Suporte

Se tiver dúvidas, me avise! Posso ajudar com:
- Aplicação das migrations
- Criação dos usuários
- Troubleshooting de permissões
- Ajustes nas políticas RLS
