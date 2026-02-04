import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, User, Key, Check, AlertCircle } from 'lucide-react';

interface ModalEditarPerfilProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModalEditarPerfil({ open, onOpenChange }: ModalEditarPerfilProps) {
  const { usuario, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState('perfil');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Campos do perfil
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');

  // Campos de senha
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  useEffect(() => {
    if (open && usuario) {
      setNome(usuario.nome || '');
      setApelido(usuario.apelido || '');
      setMessage(null);
    }
  }, [open, usuario]);

  const handleSalvarPerfil = async () => {
    if (!usuario?.id) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('usuarios')
        .update({
          nome: nome.trim(),
          apelido: apelido.trim() || null,
        })
        .eq('id', usuario.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
      
      // Atualizar dados do usuário no contexto
      if (refreshUser) {
        await refreshUser();
      }

      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      setMessage({ type: 'error', text: 'Erro ao atualizar perfil. Tente novamente.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAlterarSenha = async () => {
    if (!novaSenha || !confirmarSenha) {
      setMessage({ type: 'error', text: 'Preencha todos os campos de senha.' });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setMessage({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }

    if (novaSenha.length < 6) {
      setMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: novaSenha
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');

      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (error: any) {
      console.error('Erro ao alterar senha:', error);
      setMessage({ type: 'error', text: error.message || 'Erro ao alterar senha. Tente novamente.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <User className="w-5 h-5" />
            Minha Conta
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900">
            <TabsTrigger value="perfil" className="data-[state=active]:bg-slate-700">
              <User className="w-4 h-4 mr-2" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="senha" className="data-[state=active]:bg-slate-700">
              <Key className="w-4 h-4 mr-2" />
              Senha
            </TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="space-y-4 mt-4">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-3xl font-bold">
                {nome?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome completo"
                className="bg-slate-900 border-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label>Apelido (opcional)</Label>
              <Input
                value={apelido}
                onChange={(e) => setApelido(e.target.value)}
                placeholder="Como você quer ser chamado"
                className="bg-slate-900 border-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={usuario?.email || ''}
                disabled
                className="bg-slate-900/50 border-slate-600 text-slate-400"
              />
              <p className="text-xs text-slate-500">O email não pode ser alterado.</p>
            </div>

            {message && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                message.type === 'success' 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {message.text}
              </div>
            )}

            <Button 
              onClick={handleSalvarPerfil} 
              disabled={saving || !nome.trim()}
              className="w-full"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
          </TabsContent>

          <TabsContent value="senha" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nova Senha</Label>
              <Input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Digite a nova senha"
                className="bg-slate-900 border-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label>Confirmar Nova Senha</Label>
              <Input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Confirme a nova senha"
                className="bg-slate-900 border-slate-600"
              />
            </div>

            <p className="text-xs text-slate-500">
              A senha deve ter pelo menos 6 caracteres.
            </p>

            {message && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                message.type === 'success' 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {message.text}
              </div>
            )}

            <Button 
              onClick={handleAlterarSenha} 
              disabled={saving || !novaSenha || !confirmarSenha}
              className="w-full"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Alterar Senha
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
