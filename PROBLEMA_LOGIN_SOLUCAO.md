# 🔧 Problema: Login Travando em "Entrando..."

## 📋 Diagnóstico

O login está autenticando corretamente no Supabase Auth (status 200), mas está travando ao buscar os dados do usuário da tabela `usuarios`. 

### Causa Raiz
A política RLS da tabela `usuarios` estava causando um **loop infinito** porque:
1. A política de SELECT chama a função `is_admin()`
2. A função `is_admin()` tenta ler a tabela `usuarios` para verificar o perfil
3. Isso cria um loop: SELECT → is_admin() → SELECT → is_admin() → ...

## ✅ Solução Aplicada

Simplifiquei a política de SELECT da tabela `usuarios` para não depender de `is_admin()`:

```sql
DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (
    auth_user_id = auth.uid()
  );
```

## ⚠️ Problema Adicional

Agora os **admins não conseguem ver outros usuários** na tela de gerenciamento porque a política só permite ver o próprio registro.

## 🔧 Solução Completa Necessária

Precisamos criar uma política que:
1. Permita que usuários vejam seu próprio registro (sem chamar is_admin)
2. Permita que admins vejam todos os registros

### Opção 1: Usar perfil diretamente na política
```sql
DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (
    auth_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM usuarios u2
      WHERE u2.auth_user_id = auth.uid()
      AND u2.perfil = 'admin'
      AND u2.ativo = true
    )
  );
```

### Opção 2: Criar função is_admin sem recursão
```sql
-- Função que não causa recursão
CREATE OR REPLACE FUNCTION check_is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_perfil TEXT;
BEGIN
  SELECT perfil INTO user_perfil
  FROM usuarios
  WHERE auth_user_id = auth.uid()
  AND ativo = true
  LIMIT 1;
  
  RETURN user_perfil = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Política usando a nova função
DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (
    auth_user_id = auth.uid() OR check_is_admin()
  );
```

## 🎯 Recomendação

Use a **Opção 1** (subquery direta) porque:
- Mais simples
- Sem risco de recursão
- Melhor performance
- Não depende de funções externas

## 📝 SQL para Aplicar

Execute no SQL Editor do Supabase:

```sql
-- Corrigir política de SELECT da tabela usuarios
DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (
    -- Usuário pode ver seu próprio registro
    auth_user_id = auth.uid() 
    OR
    -- Admin pode ver todos os registros
    EXISTS (
      SELECT 1 FROM usuarios u2
      WHERE u2.auth_user_id = auth.uid()
      AND u2.perfil = 'admin'
      AND u2.ativo = true
    )
  );
```

## 🧪 Testar Após Aplicar

1. **Teste login Campo Grande:**
   - Email: cg@lamusic.com.br
   - Senha: 250178Alf#
   - Deve entrar e ver apenas dados de Campo Grande

2. **Teste login Admin:**
   - Email: lucianoalf.la@gmail.com
   - Senha: 250178Alf#
   - Deve entrar e ver consolidado + todas unidades
   - Deve conseguir acessar /app/admin/usuarios

3. **Teste gerenciamento:**
   - Como admin, acesse /app/admin/usuarios
   - Deve ver todos os 4 usuários na lista

---

## 📊 Status Atual

- ✅ Migrations aplicadas
- ✅ RLS habilitado
- ✅ 4 usuários criados (1 admin + 3 unidades)
- ⚠️ Política de SELECT precisa ser corrigida
- ⏳ Login travando devido ao loop infinito

**Aplique o SQL acima para resolver o problema!**
