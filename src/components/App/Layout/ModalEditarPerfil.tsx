import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, User, Key, Check, AlertCircle, Camera, X } from 'lucide-react';
import { ImageCropModal } from './ImageCropModal';

interface ModalEditarPerfilProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModalEditarPerfil({ open, onOpenChange }: ModalEditarPerfilProps) {
  const { usuario, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState('perfil');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Campos do perfil
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Modal de crop
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  // Campos de senha
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  useEffect(() => {
    if (open && usuario) {
      setNome(usuario.nome || '');
      setApelido(usuario.apelido || '');
      setAvatarUrl(usuario.avatar_url || null);
      setAvatarPreview(null);
      setMessage(null);
    }
  }, [open, usuario]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Por favor, selecione uma imagem.' });
      return;
    }

    // Validar tamanho (máx 5MB para imagem original, será comprimida após crop)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'A imagem deve ter no máximo 5MB.' });
      return;
    }

    // Ler arquivo e abrir modal de crop
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageToCrop(e.target?.result as string);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);

    // Limpar input para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setUploadingPhoto(true);
    setMessage(null);

    try {
      const fileName = `${usuario?.id}-${Date.now()}.jpg`;

      // Fazer upload da imagem cortada
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, croppedBlob, { 
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setAvatarUrl(publicUrl);
      setAvatarPreview(URL.createObjectURL(croppedBlob));
      setMessage({ type: 'success', text: 'Foto ajustada! Clique em Salvar para confirmar.' });
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar foto. Tente novamente.' });
    } finally {
      setUploadingPhoto(false);
      setImageToCrop(null);
    }
  };

  const handleRemovePhoto = async () => {
    setAvatarUrl(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
          avatar_url: avatarUrl,
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
            {/* Avatar com upload */}
            <div className="flex flex-col items-center gap-3 mb-4">
              <div className="relative group">
                {avatarPreview || avatarUrl ? (
                  <img 
                    src={avatarPreview || avatarUrl || ''} 
                    alt="Avatar" 
                    className="w-24 h-24 rounded-full object-cover border-4 border-slate-600"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-3xl font-bold border-4 border-slate-600">
                    {nome?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                
                {/* Overlay de upload */}
                <div 
                  className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingPhoto ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </div>

                {/* Botão remover foto */}
                {(avatarPreview || avatarUrl) && (
                  <button
                    onClick={handleRemovePhoto}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                )}
              </div>

              {/* Input de arquivo oculto */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? 'Carregando...' : 'Alterar foto'}
              </button>
              <p className="text-xs text-slate-500">JPG, PNG ou GIF. Máx 2MB.</p>
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

      {/* Modal de Crop */}
      {imageToCrop && (
        <ImageCropModal
          open={cropModalOpen}
          onOpenChange={(open) => {
            setCropModalOpen(open);
            if (!open) setImageToCrop(null);
          }}
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
        />
      )}
    </Dialog>
  );
}
