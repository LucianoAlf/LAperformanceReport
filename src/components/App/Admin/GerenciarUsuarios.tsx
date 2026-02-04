import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Building2,
  Mail,
  Check,
  X,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Usuario {
  id: string;
  email: string;
  nome: string;
  perfil: 'admin' | 'unidade';
  unidade_id: string | null;
  unidade_nome?: string;
  auth_user_id: string | null;
  ativo: boolean;
  created_at: string;
}

interface Unidade {
  id: string;
  nome: string;
}

export function GerenciarUsuarios() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formNome, setFormNome] = useState('');
  const [formPerfil, setFormPerfil] = useState<'admin' | 'unidade'>('unidade');
  const [formUnidadeId, setFormUnidadeId] = useState<string>('');
  const [formAtivo, setFormAtivo] = useState(true);
  const [formNovaSenha, setFormNovaSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/app');
      return;
    }
    carregarDados();
  }, [isAdmin, navigate]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Carregar usuários com nome da unidade
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('*, unidade:unidades(nome)')
        .order('nome');

      if (usuariosData) {
        setUsuarios(
          usuariosData.map((u: any) => ({
            ...u,
            unidade_nome: u.unidade?.nome || null,
          }))
        );
      }

      // Carregar unidades
      const { data: unidadesData } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

      if (unidadesData) {
        setUnidades(unidadesData);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (usuario?: Usuario) => {
    if (usuario) {
      setEditingUser(usuario);
      setFormEmail(usuario.email);
      setFormNome(usuario.nome);
      setFormPerfil(usuario.perfil);
      setFormUnidadeId(usuario.unidade_id || '');
      setFormAtivo(usuario.ativo);
    } else {
      setEditingUser(null);
      setFormEmail('');
      setFormNome('');
      setFormPerfil('unidade');
      setFormUnidadeId('');
      setFormAtivo(true);
    }
    setFormNovaSenha('');
    setShowPassword(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
  };

  const handleSave = async () => {
    if (!formEmail || !formNome) {
      toast.error('Preencha email e nome');
      return;
    }

    if (formPerfil === 'unidade' && !formUnidadeId) {
      toast.error('Selecione uma unidade para usuários de unidade');
      return;
    }

    // Para novo usuário, senha é obrigatória
    if (!editingUser && (!formNovaSenha || formNovaSenha.length < 6)) {
      toast.error('Digite uma senha com pelo menos 6 caracteres');
      return;
    }

    setSaving(true);
    try {
      const userData = {
        email: formEmail,
        nome: formNome,
        perfil: formPerfil,
        unidade_id: formPerfil === 'admin' ? null : formUnidadeId,
        ativo: formAtivo,
      };

      if (editingUser) {
        // Atualizar usuário existente
        const { error } = await supabase
          .from('usuarios')
          .update(userData)
          .eq('id', editingUser.id);

        if (error) throw error;
        toast.success('Usuário atualizado com sucesso!');
      } else {
        // Criar novo usuário via Edge Function
        const { data, error } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: formEmail,
            password: formNovaSenha,
            nome: formNome,
            perfil: formPerfil,
            unidade_id: formPerfil === 'admin' ? null : formUnidadeId,
            ativo: formAtivo,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast.success(`Usuário ${formNome} criado com sucesso!`);
      }

      closeModal();
      carregarDados();
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (usuario: Usuario) => {
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ ativo: !usuario.ativo })
        .eq('id', usuario.id);

      if (error) throw error;
      toast.success(usuario.ativo ? 'Usuário desativado' : 'Usuário ativado');
      carregarDados();
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    }
  };

  const handleChangePassword = async () => {
    if (!editingUser?.email) {
      toast.error('Email do usuário não encontrado');
      return;
    }

    if (!formNovaSenha) {
      toast.error('Digite a nova senha');
      return;
    }

    if (formNovaSenha.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setSendingReset(true);
    try {
      // Chamar Edge Function para alterar senha
      const { data, error } = await supabase.functions.invoke('admin-update-password', {
        body: {
          userId: editingUser.id,
          email: editingUser.email,
          authUserId: editingUser.auth_user_id,
          newPassword: formNovaSenha,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Senha de ${editingUser.nome} alterada com sucesso!`);
      setFormNovaSenha('');
      setShowPassword(false);
    } catch (error: any) {
      toast.error(`Erro ao alterar senha: ${error.message}`);
    } finally {
      setSendingReset(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/app')}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-cyan-400" />
              Gerenciar Usuários
            </h1>
            <p className="text-gray-400">Controle de acesso por unidade</p>
          </div>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-xl hover:bg-cyan-500/30 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Usuário
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 mb-6">
        <p className="text-blue-400 text-sm">
          <strong>Perfis de Acesso:</strong>
          <br />
          • <strong>Admin:</strong> Acesso total - vê consolidado e todas as unidades
          <br />
          • <strong>Unidade:</strong> Acesso restrito - vê apenas dados da sua unidade
        </p>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-900/50 text-left">
              <th className="px-6 py-4 text-gray-400 text-sm font-medium">Usuário</th>
              <th className="px-6 py-4 text-gray-400 text-sm font-medium">Perfil</th>
              <th className="px-6 py-4 text-gray-400 text-sm font-medium">Unidade</th>
              <th className="px-6 py-4 text-gray-400 text-sm font-medium">Status</th>
              <th className="px-6 py-4 text-gray-400 text-sm font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr
                key={usuario.id}
                className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors"
              >
                <td className="px-6 py-4">
                  <div>
                    <p className="text-white font-medium">{usuario.nome}</p>
                    <p className="text-gray-500 text-sm flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {usuario.email}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {usuario.perfil === 'admin' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">
                      <Shield className="w-3 h-3" />
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-sm">
                      <Building2 className="w-3 h-3" />
                      Unidade
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {usuario.perfil === 'admin' ? (
                    <span className="text-gray-500">Todas</span>
                  ) : (
                    <span className="text-white">{usuario.unidade_nome || '-'}</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {usuario.ativo ? (
                    <span className="inline-flex items-center gap-1 text-green-400 text-sm">
                      <Check className="w-4 h-4" />
                      Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-400 text-sm">
                      <X className="w-4 h-4" />
                      Inativo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openModal(usuario)}
                      className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleAtivo(usuario)}
                      className={`p-2 transition-colors ${
                        usuario.ativo
                          ? 'text-gray-400 hover:text-red-400'
                          : 'text-gray-400 hover:text-green-400'
                      }`}
                      title={usuario.ativo ? 'Desativar' : 'Ativar'}
                    >
                      {usuario.ativo ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {usuarios.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">Nenhum usuário cadastrado</p>
          </div>
        )}
      </div>

      {/* Modal de Edição */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-white mb-6">
              {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email *</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  disabled={!!editingUser}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
                  placeholder="email@lamusic.com.br"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Nome *</label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                  placeholder="Nome do usuário"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Perfil *</label>
                <Select value={formPerfil} onValueChange={(value) => setFormPerfil(value as 'admin' | 'unidade')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unidade">Unidade (acesso restrito)</SelectItem>
                    <SelectItem value="admin">Admin (acesso total)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formPerfil === 'unidade' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Unidade *</label>
                  <Select value={formUnidadeId} onValueChange={setFormUnidadeId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch
                  id="ativo"
                  checked={formAtivo}
                  onCheckedChange={setFormAtivo}
                />
                <Label htmlFor="ativo" className="text-gray-400 cursor-pointer">
                  Usuário ativo
                </Label>
              </div>

              {/* Campo de Senha - para novos usuários é obrigatório, para edição é opcional */}
              <div className={editingUser ? "pt-4 border-t border-slate-700 space-y-3" : "space-y-3"}>
                <label className="block text-sm text-gray-400">
                  <KeyRound className="w-4 h-4 inline mr-1" />
                  {editingUser ? 'Nova Senha (opcional)' : 'Senha *'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formNovaSenha}
                    onChange={(e) => setFormNovaSenha(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                    placeholder={editingUser ? "Digite a nova senha (mín. 6 caracteres)" : "Senha inicial (mín. 6 caracteres)"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {editingUser && (
                  <button
                    onClick={handleChangePassword}
                    disabled={sendingReset || !formNovaSenha}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500/20 text-amber-400 rounded-xl hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingReset ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    {sendingReset ? 'Alterando...' : 'Alterar Senha'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 transition-colors disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GerenciarUsuarios;
