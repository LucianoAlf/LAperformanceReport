# 👥 Usuários das Unidades - Criados

## ✅ Registros Criados na Tabela `usuarios`

| ID | Nome | Email | Perfil | Unidade | Status |
|----|------|-------|--------|---------|--------|
| 3 | Equipe Campo Grande | cg@lamusic.com.br | unidade | Campo Grande | ✅ Ativo |
| 4 | Equipe Recreio | recreio@lamusic.com.br | unidade | Recreio | ✅ Ativo |
| 5 | Equipe Barra | barra@lamusic.com.br | unidade | Barra | ✅ Ativo |

---

## 🔐 Senhas Sugeridas

| Unidade | Email | Senha Sugerida |
|---------|-------|----------------|
| **Campo Grande** | cg@lamusic.com.br | `CampoGrande2026!` |
| **Recreio** | recreio@lamusic.com.br | `Recreio2026!` |
| **Barra** | barra@lamusic.com.br | `Barra2026!` |

---

## 📋 Próximo Passo: Criar no Supabase Auth

Para cada usuário, você precisa:

### 1. Acessar Supabase Dashboard
https://supabase.com/dashboard/project/ouqwbbermlzqqvtqwlul/auth/users

### 2. Criar Usuário Campo Grande
1. Clique em **"Add user"**
2. Preencha:
   - **Email:** `cg@lamusic.com.br`
   - **Password:** `CampoGrande2026!`
   - ✅ Marque **"Auto Confirm User"**
3. Clique em **"Create user"**
4. **Copie o UUID** gerado
5. Execute no SQL Editor:
```sql
UPDATE usuarios 
SET auth_user_id = 'COLE-O-UUID-AQUI'
WHERE email = 'cg@lamusic.com.br';
```

### 3. Criar Usuário Recreio
1. Clique em **"Add user"**
2. Preencha:
   - **Email:** `recreio@lamusic.com.br`
   - **Password:** `Recreio2026!`
   - ✅ Marque **"Auto Confirm User"**
3. Clique em **"Create user"**
4. **Copie o UUID** gerado
5. Execute no SQL Editor:
```sql
UPDATE usuarios 
SET auth_user_id = 'COLE-O-UUID-AQUI'
WHERE email = 'recreio@lamusic.com.br';
```

### 4. Criar Usuário Barra
1. Clique em **"Add user"**
2. Preencha:
   - **Email:** `barra@lamusic.com.br`
   - **Password:** `Barra2026!`
   - ✅ Marque **"Auto Confirm User"**
3. Clique em **"Create user"**
4. **Copie o UUID** gerado
5. Execute no SQL Editor:
```sql
UPDATE usuarios 
SET auth_user_id = 'COLE-O-UUID-AQUI'
WHERE email = 'barra@lamusic.com.br';
```

---

## ✅ Verificar Vinculação

Depois de criar os 3 usuários, execute para verificar:

```sql
SELECT 
  u.id,
  u.nome,
  u.email,
  u.perfil,
  un.nome as unidade_nome,
  u.auth_user_id,
  u.ativo
FROM usuarios u 
LEFT JOIN unidades un ON u.unidade_id = un.id
WHERE u.perfil = 'unidade'
ORDER BY un.nome;
```

---

## 🎯 Como Cada Usuário Verá o Sistema

### Campo Grande (`cg@lamusic.com.br`)
- ✅ Vê: **Apenas dados de Campo Grande** (418 alunos)
- ❌ Não vê: Recreio, Barra, Consolidado
- ❌ Não tem: Menu Admin

### Recreio (`recreio@lamusic.com.br`)
- ✅ Vê: **Apenas dados do Recreio** (288 alunos)
- ❌ Não vê: Campo Grande, Barra, Consolidado
- ❌ Não tem: Menu Admin

### Barra (`barra@lamusic.com.br`)
- ✅ Vê: **Apenas dados da Barra** (205 alunos)
- ❌ Não vê: Campo Grande, Recreio, Consolidado
- ❌ Não tem: Menu Admin

---

## 🔐 Isolamento de Dados Garantido

O sistema usa **Row Level Security (RLS)** no PostgreSQL para garantir que:

1. **Campo Grande** nunca vê dados de Recreio ou Barra
2. **Recreio** nunca vê dados de Campo Grande ou Barra
3. **Barra** nunca vê dados de Campo Grande ou Recreio
4. **Apenas você (admin)** vê tudo e pode alternar entre unidades

---

## 📞 Testar os Logins

Depois de criar no Supabase Auth e vincular os UUIDs:

1. **Faça logout** do seu usuário admin
2. **Teste cada login:**
   - `cg@lamusic.com.br` / `CampoGrande2026!`
   - `recreio@lamusic.com.br` / `Recreio2026!`
   - `barra@lamusic.com.br` / `Barra2026!`
3. Verifique que cada um vê apenas sua unidade

---

## 🎉 Sistema Completo!

Após criar os 3 usuários no Supabase Auth, você terá:

- ✅ 1 Admin (você) - acesso total
- ✅ 3 Usuários de unidade - acesso restrito
- ✅ Isolamento total de dados
- ✅ Sistema de autenticação completo
