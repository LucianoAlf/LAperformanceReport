import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { Perfil } from './index';

interface ModalAtribuirPerfilProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfis: Perfil[];
  onSuccess: () => void;
}

interface Usuario {
  id: number;
  nome: string;
  email: string;
}

interface Unidade {
  id: string;
  nome: string;
}

export function ModalAtribuirPerfil({ open, onOpenChange, perfis, onSuccess }: ModalAtribuirPerfilProps) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [usuarioId, setUsuarioId] = useState<string>('');
  const [perfilId, setPerfilId] = useState<string>('');
  const [unidadeId, setUnidadeId] = useState<string>('');

  useEffect(() => {
    if (open) {
      carregarDados();
    }
  }, [open]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [usuariosRes, unidadesRes] = await Promise.all([
        supabase.from('usuarios').select('id, nome, email').eq('ativo', true).order('nome'),
        supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome'),
      ]);

      if (usuariosRes.data) setUsuarios(usuariosRes.data);
      if (unidadesRes.data) setUnidades(unidadesRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!usuarioId || !perfilId) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('usuario_perfis').insert({
        usuario_id: parseInt(usuarioId),
        perfil_id: perfilId,
        unidade_id: unidadeId || null,
      });

      if (error) {
        if (error.code === '23505') {
          alert('Este usuário já possui este perfil.');
        } else {
          throw error;
        }
        return;
      }

      // Registrar na auditoria
      const usuario = usuarios.find(u => u.id === parseInt(usuarioId));
      const perfil = perfis.find(p => p.id === perfilId);
      
      await supabase.from('auditoria_acesso').insert({
        usuario_id: parseInt(usuarioId),
        usuario_nome: usuario?.nome,
        acao: 'atribuir_perfil',
        entidade: 'usuario_perfis',
        detalhes: {
          perfil_id: perfilId,
          perfil_nome: perfil?.nome,
          unidade_id: unidadeId || null,
        },
      });

      // Limpar e fechar
      setUsuarioId('');
      setPerfilId('');
      setUnidadeId('');
      onSuccess();
    } catch (error) {
      console.error('Erro ao atribuir perfil:', error);
      alert('Erro ao atribuir perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <span>👤</span>
            Atribuir Perfil a Usuário
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Usuário *</Label>
              <Select value={usuarioId} onValueChange={setUsuarioId}>
                <SelectTrigger className="bg-slate-900 border-slate-600">
                  <SelectValue placeholder="Selecione o usuário..." />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map(u => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.nome} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Perfil *</Label>
              <Select value={perfilId} onValueChange={setPerfilId}>
                <SelectTrigger className="bg-slate-900 border-slate-600">
                  <SelectValue placeholder="Selecione o perfil..." />
                </SelectTrigger>
                <SelectContent>
                  {perfis.map(p => (
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

            <div className="space-y-2">
              <Label>Unidade (opcional)</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger className="bg-slate-900 border-slate-600">
                  <SelectValue placeholder="Todas as unidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_todas_">Todas as unidades</SelectItem>
                  {unidades.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">
                Se vazio, o perfil vale para todas as unidades.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={saving || !usuarioId || !perfilId}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
