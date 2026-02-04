import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Plus } from 'lucide-react';
import type { Perfil, UsuarioComPerfis } from './index';

interface ModalEditarPerfisUsuarioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: UsuarioComPerfis;
  perfis: Perfil[];
  onSuccess: () => void;
}

interface PerfilAtribuido {
  id: string;
  perfil_id: string;
  perfil_nome: string;
  perfil_cor: string;
  unidade_id: string | null;
  unidade_nome: string | null;
}

interface Unidade {
  id: string;
  nome: string;
}

export function ModalEditarPerfisUsuario({ 
  open, 
  onOpenChange, 
  usuario, 
  perfis, 
  onSuccess 
}: ModalEditarPerfisUsuarioProps) {
  const [perfisAtribuidos, setPerfisAtribuidos] = useState<PerfilAtribuido[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [novoPerfilId, setNovoPerfilId] = useState<string>('');
  const [novaUnidadeId, setNovaUnidadeId] = useState<string>('');

  useEffect(() => {
    if (open && usuario) {
      carregarDados();
    }
  }, [open, usuario]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Carregar perfis do usuário
      const { data: perfisData } = await supabase
        .from('usuario_perfis')
        .select(`
          id,
          perfil_id,
          unidade_id,
          perfis(nome, cor),
          unidades(nome)
        `)
        .eq('usuario_id', usuario.id)
        .eq('ativo', true);

      if (perfisData) {
        setPerfisAtribuidos(perfisData.map((p: any) => ({
          id: p.id,
          perfil_id: p.perfil_id,
          perfil_nome: p.perfis?.nome || '',
          perfil_cor: p.perfis?.cor || '#64748b',
          unidade_id: p.unidade_id,
          unidade_nome: p.unidades?.nome || null,
        })));
      }

      // Carregar unidades
      const { data: unidadesData } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

      if (unidadesData) setUnidades(unidadesData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const removerPerfil = async (perfilAtribuidoId: string) => {
    setSaving(true);
    try {
      await supabase
        .from('usuario_perfis')
        .delete()
        .eq('id', perfilAtribuidoId);

      setPerfisAtribuidos(prev => prev.filter(p => p.id !== perfilAtribuidoId));

      // Registrar na auditoria
      await supabase.from('auditoria_acesso').insert({
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: 'remover_perfil',
        entidade: 'usuario_perfis',
        detalhes: { perfil_atribuido_id: perfilAtribuidoId },
      });
    } catch (error) {
      console.error('Erro ao remover perfil:', error);
    } finally {
      setSaving(false);
    }
  };

  const adicionarPerfil = async () => {
    if (!novoPerfilId) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('usuario_perfis')
        .insert({
          usuario_id: usuario.id,
          perfil_id: novoPerfilId,
          unidade_id: novaUnidadeId || null,
        })
        .select(`
          id,
          perfil_id,
          unidade_id,
          perfis(nome, cor),
          unidades(nome)
        `)
        .single();

      if (error) {
        if (error.code === '23505') {
          alert('Este usuário já possui este perfil para esta unidade.');
        } else {
          throw error;
        }
        return;
      }

      if (data) {
        setPerfisAtribuidos(prev => [...prev, {
          id: data.id,
          perfil_id: data.perfil_id,
          perfil_nome: (data as any).perfis?.nome || '',
          perfil_cor: (data as any).perfis?.cor || '#64748b',
          unidade_id: data.unidade_id,
          unidade_nome: (data as any).unidades?.nome || null,
        }]);
      }

      // Limpar seleção
      setNovoPerfilId('');
      setNovaUnidadeId('');

      // Registrar na auditoria
      const perfil = perfis.find(p => p.id === novoPerfilId);
      await supabase.from('auditoria_acesso').insert({
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: 'adicionar_perfil',
        entidade: 'usuario_perfis',
        detalhes: {
          perfil_id: novoPerfilId,
          perfil_nome: perfil?.nome,
          unidade_id: novaUnidadeId || null,
        },
      });
    } catch (error) {
      console.error('Erro ao adicionar perfil:', error);
    } finally {
      setSaving(false);
    }
  };

  // Filtrar perfis que ainda não foram atribuídos
  const perfisDisponiveis = perfis.filter(p => 
    !perfisAtribuidos.some(pa => pa.perfil_id === p.id && pa.unidade_id === (novaUnidadeId || null))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <span>✏️</span>
            Editar Perfis - {usuario.nome}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Info do usuário */}
            <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-xl">
              <div 
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl text-white font-medium"
                style={{ backgroundColor: usuario.perfil === 'admin' ? '#ef444440' : '#3b82f640' }}
              >
                {usuario.nome[0].toUpperCase()}
              </div>
              <div>
                <div className="text-lg font-semibold text-white">{usuario.nome}</div>
                <div className="text-sm text-slate-400">{usuario.email}</div>
              </div>
            </div>

            {/* Perfis atuais */}
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-3">Perfis Atuais</h4>
              
              {/* Mostrar perfil antigo se for admin */}
              {usuario.perfil === 'admin' && (
                <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg mb-2">
                  <div className="flex items-center gap-3">
                    <span 
                      className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: '#ef4444' }}
                    >
                      🛡️ Admin (Sistema Antigo)
                    </span>
                    <span className="text-xs text-slate-500">Todas as unidades</span>
                  </div>
                  <span className="text-xs text-slate-500">Protegido</span>
                </div>
              )}

              {/* Perfis do novo sistema */}
              {perfisAtribuidos.length === 0 && usuario.perfil !== 'admin' && (
                <p className="text-sm text-slate-500 py-4 text-center">
                  Nenhum perfil atribuído no novo sistema
                </p>
              )}

              {perfisAtribuidos.map((pa) => (
                <div 
                  key={pa.id} 
                  className="flex items-center justify-between p-3 bg-slate-900 rounded-lg mb-2"
                >
                  <div className="flex items-center gap-3">
                    <span 
                      className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: pa.perfil_cor }}
                    >
                      {pa.perfil_nome}
                    </span>
                    <span className="text-xs text-slate-500">
                      Unidade: {pa.unidade_nome || 'Todas'}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => removerPerfil(pa.id)}
                    disabled={saving}
                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Adicionar novo perfil */}
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-3">Adicionar Novo Perfil</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1">
                  <Label className="text-xs">Perfil</Label>
                  <Select value={novoPerfilId} onValueChange={setNovoPerfilId}>
                    <SelectTrigger className="bg-slate-900 border-slate-600">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {perfisDisponiveis.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            <span>{p.icone}</span>
                            <span>{p.nome}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unidade</Label>
                  <Select value={novaUnidadeId} onValueChange={setNovaUnidadeId}>
                    <SelectTrigger className="bg-slate-900 border-slate-600">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas</SelectItem>
                      {unidades.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button 
                size="sm" 
                onClick={adicionarPerfil}
                disabled={saving || !novoPerfilId}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Perfil
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={() => { onSuccess(); onOpenChange(false); }}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
