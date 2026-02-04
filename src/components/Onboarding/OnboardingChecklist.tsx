import React, { useState, useEffect, useRef } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  Circle, 
  KeyRound, 
  Camera, 
  User, 
  Sparkles,
  ArrowRight,
  PartyPopper,
  Rocket,
  Loader2,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalEditarPerfil } from '@/components/App/Layout/ModalEditarPerfil';
import { ImageCropModal } from '@/components/App/Layout/ImageCropModal';
import { supabase } from '@/lib/supabase';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  required: boolean;
  action: () => void;
}

export function OnboardingChecklist() {
  const { 
    onboarding, 
    showChecklist, 
    setShowChecklist,
    markSenhaAlterada,
    markFotoUploaded,
    markPerfilCompleto,
    completeChecklist,
    refreshOnboarding
  } = useOnboarding();
  const { usuario } = useAuth();
  
  const [showPerfilModal, setShowPerfilModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'perfil' | 'senha'>('perfil');
  const [allComplete, setAllComplete] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  // Verificar se perfil está completo
  useEffect(() => {
    if (usuario?.nome && usuario.nome.trim().length > 0) {
      if (onboarding && !onboarding.perfil_completo) {
        markPerfilCompleto();
      }
    }
  }, [usuario?.nome, onboarding, markPerfilCompleto]);

  // Verificar se foto foi uploaded
  useEffect(() => {
    if (usuario?.avatar_url) {
      if (onboarding && !onboarding.foto_uploaded) {
        markFotoUploaded();
      }
    }
  }, [usuario?.avatar_url, onboarding, markFotoUploaded]);

  const items: ChecklistItem[] = [
    {
      id: 'perfil',
      title: 'Complete seu perfil',
      description: 'Preencha seu nome e apelido',
      icon: <User className="w-5 h-5" />,
      completed: onboarding?.perfil_completo || false,
      required: true,
      action: () => {
        setActiveTab('perfil');
        setShowPerfilModal(true);
      },
    },
    {
      id: 'senha',
      title: 'Altere sua senha',
      description: 'Troque a senha inicial por uma pessoal',
      icon: <KeyRound className="w-5 h-5" />,
      completed: onboarding?.senha_alterada || false,
      required: true,
      action: () => {
        setActiveTab('senha');
        setShowPerfilModal(true);
      },
    },
    {
      id: 'foto',
      title: 'Adicione sua foto',
      description: 'Faça upload de uma foto de perfil',
      icon: <Camera className="w-5 h-5" />,
      completed: onboarding?.foto_uploaded || false,
      required: false,
      action: () => {
        setActiveTab('perfil');
        setShowPerfilModal(true);
      },
    },
  ];

  const completedCount = items.filter(i => i.completed).length;
  const requiredItems = items.filter(i => i.required);
  const requiredComplete = requiredItems.every(i => i.completed);
  const progress = (completedCount / items.length) * 100;

  // Verificar se todos os obrigatórios estão completos
  useEffect(() => {
    if (requiredComplete && !allComplete) {
      setAllComplete(true);
      setShowCelebration(true);
      setTimeout(() => {
        setShowCelebration(false);
      }, 3000);
    }
  }, [requiredComplete, allComplete]);

  const handleContinue = async () => {
    await completeChecklist();
    setShowChecklist(false);
  };

  const handlePerfilModalClose = async () => {
    setShowPerfilModal(false);
    // Refresh para pegar atualizações
    await refreshOnboarding();
  };

  // Callback quando senha é alterada
  const handleSenhaAlterada = async () => {
    await markSenhaAlterada();
    await refreshOnboarding();
  };

  if (!showChecklist || !onboarding) return null;

  return (
    <>
      <Dialog open={showChecklist} onOpenChange={() => {}}>
        <DialogContent 
          className="bg-slate-900 border-slate-700 max-w-lg p-0 overflow-hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {/* Header com gradiente */}
          <div className="bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 p-6 border-b border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
                <Rocket className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Bem-vindo ao LA Report! 🎉
                </h2>
                <p className="text-slate-400 text-sm">
                  Complete as tarefas abaixo para começar
                </p>
              </div>
            </div>
            
            {/* Barra de progresso */}
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Progresso</span>
                <span className="text-cyan-400 font-medium">
                  {completedCount} de {items.length} concluídos
                </span>
              </div>
              <Progress value={progress} className="h-2 bg-slate-700" />
            </div>
          </div>

          {/* Lista de tarefas */}
          <div className="p-6 space-y-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={item.action}
                disabled={item.completed}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                  item.completed
                    ? "bg-emerald-500/10 border-emerald-500/30 cursor-default"
                    : "bg-slate-800/50 border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  item.completed
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-slate-700 text-slate-400"
                )}>
                  {item.completed ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    item.icon
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium",
                      item.completed ? "text-emerald-400" : "text-white"
                    )}>
                      {item.title}
                    </span>
                    {item.required && !item.completed && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                        Obrigatório
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{item.description}</p>
                </div>

                {!item.completed && (
                  <ArrowRight className="w-5 h-5 text-slate-500" />
                )}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="p-6 pt-0 space-y-3">
            {requiredComplete ? (
              <Button
                onClick={handleContinue}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white font-medium py-6"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Começar a usar o sistema
              </Button>
            ) : (
              <>
                <p className="text-center text-slate-500 text-sm">
                  Complete as tarefas obrigatórias para continuar
                </p>
                {/* Botão para pular - usuários existentes */}
                {completedCount >= 2 && (
                  <button
                    onClick={handleContinue}
                    className="w-full text-center text-slate-500 text-sm hover:text-slate-300 transition-colors py-2"
                  >
                    Já uso o sistema, pular configuração →
                  </button>
                )}
              </>
            )}
          </div>

          {/* Celebração */}
          {showCelebration && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="text-center animate-bounce">
                <PartyPopper className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-2">
                  Parabéns! 🎉
                </h3>
                <p className="text-slate-300">
                  Você completou todas as tarefas obrigatórias!
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Editar Perfil */}
      <ModalEditarPerfilOnboarding
        open={showPerfilModal}
        onOpenChange={handlePerfilModalClose}
        defaultTab={activeTab}
        onSenhaAlterada={handleSenhaAlterada}
      />
    </>
  );
}

// Versão do modal de perfil adaptada para onboarding
interface ModalEditarPerfilOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab: 'perfil' | 'senha';
  onSenhaAlterada: () => void;
}

function ModalEditarPerfilOnboarding({ 
  open, 
  onOpenChange, 
  defaultTab,
  onSenhaAlterada 
}: ModalEditarPerfilOnboardingProps) {
  const { usuario, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState(defaultTab);
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
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (open && usuario) {
      setNome(usuario.nome || '');
      setApelido(usuario.apelido || '');
      setAvatarUrl(usuario.avatar_url || null);
      setAvatarPreview(null);
      setMessage(null);
      setNovaSenha('');
      setConfirmarSenha('');
    }
  }, [open, usuario]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Por favor, selecione uma imagem.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'A imagem deve ter no máximo 5MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImageToCrop(e.target?.result as string);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setUploadingPhoto(true);
    setMessage(null);

    try {
      const fileName = `${usuario?.id}-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, croppedBlob, { 
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

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

  const handleRemovePhoto = () => {
    setAvatarUrl(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSalvarPerfil = async () => {
    if (!usuario?.id) return;
    if (!nome.trim()) {
      setMessage({ type: 'error', text: 'Preencha seu nome.' });
      return;
    }

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

      setMessage({ type: 'success', text: 'Perfil atualizado!' });
      if (refreshUser) await refreshUser();
      
      setTimeout(() => onOpenChange(false), 1000);
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      setMessage({ type: 'error', text: 'Erro ao atualizar perfil.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAlterarSenha = async () => {
    if (!novaSenha || !confirmarSenha) {
      setMessage({ type: 'error', text: 'Preencha todos os campos.' });
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
      onSenhaAlterada();
      setNovaSenha('');
      setConfirmarSenha('');
      
      setTimeout(() => onOpenChange(false), 1000);
    } catch (error: any) {
      console.error('Erro ao alterar senha:', error);
      
      // Ignorar erro de senha igual (permitir usar a mesma senha)
      if (error.message?.includes('New password should be different')) {
        // Considerar como sucesso se a senha é igual
        setMessage({ type: 'success', text: 'Senha confirmada com sucesso!' });
        onSenhaAlterada();
        setNovaSenha('');
        setConfirmarSenha('');
        setTimeout(() => onOpenChange(false), 1000);
        return;
      }
      
      // Traduzir outras mensagens de erro
      let mensagemErro = 'Erro ao alterar senha.';
      if (error.message?.includes('Password should be at least')) {
        mensagemErro = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (error.message) {
        mensagemErro = error.message;
      }
      
      setMessage({ type: 'error', text: mensagemErro });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('perfil')}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg font-medium transition-colors",
              activeTab === 'perfil'
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-slate-700 text-slate-400 hover:text-white"
            )}
          >
            <User className="w-4 h-4 inline mr-2" />
            Perfil
          </button>
          <button
            onClick={() => setActiveTab('senha')}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg font-medium transition-colors",
              activeTab === 'senha'
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-slate-700 text-slate-400 hover:text-white"
            )}
          >
            <KeyRound className="w-4 h-4 inline mr-2" />
            Senha
          </button>
        </div>

        {activeTab === 'perfil' ? (
          <div className="space-y-4">
            {/* Avatar com upload */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                {avatarPreview || avatarUrl ? (
                  <img 
                    src={avatarPreview || avatarUrl || ''} 
                    alt="Avatar" 
                    className="w-20 h-20 rounded-full object-cover border-4 border-slate-600"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-slate-600">
                    {nome?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                
                {/* Overlay de upload */}
                <div 
                  className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingPhoto ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                </div>

                {/* Botão remover foto */}
                {(avatarPreview || avatarUrl) && (
                  <button
                    onClick={handleRemovePhoto}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3 h-3 text-white" />
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
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? 'Carregando...' : 'Alterar foto'}
              </button>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Nome Completo *</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Apelido (opcional)</label>
              <input
                type="text"
                value={apelido}
                onChange={(e) => setApelido(e.target.value)}
                placeholder="Como você quer ser chamado"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {message && (
              <div className={cn(
                "p-3 rounded-lg text-sm",
                message.type === 'success' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              )}>
                {message.text}
              </div>
            )}

            <Button
              onClick={handleSalvarPerfil}
              disabled={saving || !nome.trim()}
              className="w-full"
            >
              {saving ? 'Salvando...' : 'Salvar Perfil'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Nova Senha *</label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Digite a nova senha"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Confirmar Senha *</label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Confirme a nova senha"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <p className="text-xs text-slate-500">
              A senha deve ter pelo menos 6 caracteres.
            </p>

            {message && (
              <div className={cn(
                "p-3 rounded-lg text-sm",
                message.type === 'success' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              )}>
                {message.text}
              </div>
            )}

            <Button
              onClick={handleAlterarSenha}
              disabled={saving || !novaSenha || !confirmarSenha}
              className="w-full"
            >
              {saving ? 'Alterando...' : 'Alterar Senha'}
            </Button>
          </div>
        )}
      </DialogContent>

      {/* Modal de Crop */}
      {imageToCrop && (
        <ImageCropModal
          open={cropModalOpen}
          onOpenChange={setCropModalOpen}
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
        />
      )}
    </Dialog>
  );
}

