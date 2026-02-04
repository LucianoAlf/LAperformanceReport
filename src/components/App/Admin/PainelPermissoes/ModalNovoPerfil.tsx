import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Perfil } from './index';

interface ModalNovoPerfilProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfis: Perfil[];
  onSuccess: () => void;
}

const cores = [
  '#ef4444', // vermelho
  '#f59e0b', // laranja
  '#10b981', // verde
  '#3b82f6', // azul
  '#8b5cf6', // roxo
  '#ec4899', // rosa
  '#64748b', // cinza
];

const icones = [
  { value: '👤', label: 'Usuário' },
  { value: '🛡️', label: 'Escudo' },
  { value: '💼', label: 'Maleta' },
  { value: '🎯', label: 'Alvo' },
  { value: '📋', label: 'Prancheta' },
  { value: '👁️', label: 'Olho' },
  { value: '⭐', label: 'Estrela' },
  { value: '🔧', label: 'Ferramenta' },
];

const niveis = [
  { value: '10', label: '10 - Básico' },
  { value: '20', label: '20 - Intermediário' },
  { value: '30', label: '30 - Operacional' },
  { value: '50', label: '50 - Gerencial' },
  { value: '100', label: '100 - Administrador' },
];

export function ModalNovoPerfil({ open, onOpenChange, perfis, onSuccess }: ModalNovoPerfilProps) {
  const [saving, setSaving] = useState(false);
  
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [nivel, setNivel] = useState('30');
  const [icone, setIcone] = useState('👤');
  const [cor, setCor] = useState('#3b82f6');
  const [copiarDe, setCopiarDe] = useState('');

  const handleSubmit = async () => {
    if (!nome.trim()) return;

    setSaving(true);
    try {
      // Criar o perfil
      const { data: novoPerfil, error } = await supabase
        .from('perfis')
        .insert({
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          nivel: parseInt(nivel),
          icone,
          cor,
          sistema: false,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          alert('Já existe um perfil com este nome.');
        } else {
          throw error;
        }
        return;
      }

      // Se selecionou copiar permissões de outro perfil
      if (copiarDe && novoPerfil) {
        const { data: permissoesCopiar } = await supabase
          .from('perfil_permissoes')
          .select('permissao_id')
          .eq('perfil_id', copiarDe);

        if (permissoesCopiar && permissoesCopiar.length > 0) {
          const inserts = permissoesCopiar.map(p => ({
            perfil_id: novoPerfil.id,
            permissao_id: p.permissao_id,
          }));

          await supabase.from('perfil_permissoes').insert(inserts);
        }
      }

      // Registrar na auditoria
      await supabase.from('auditoria_acesso').insert({
        acao: 'criar',
        entidade: 'perfis',
        entidade_id: novoPerfil?.id,
        detalhes: {
          nome,
          nivel: parseInt(nivel),
          copiado_de: copiarDe || null,
        },
      });

      // Limpar e fechar
      setNome('');
      setDescricao('');
      setNivel('30');
      setIcone('👤');
      setCor('#3b82f6');
      setCopiarDe('');
      onSuccess();
    } catch (error) {
      console.error('Erro ao criar perfil:', error);
      alert('Erro ao criar perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <span>➕</span>
            Novo Perfil
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome do Perfil *</Label>
            <Input
              placeholder="Ex: Coordenador"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="bg-slate-900 border-slate-600"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              placeholder="Ex: Coordenador pedagógico da unidade"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="bg-slate-900 border-slate-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nível Hierárquico *</Label>
              <Select value={nivel} onValueChange={setNivel}>
                <SelectTrigger className="bg-slate-900 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {niveis.map(n => (
                    <SelectItem key={n.value} value={n.value}>
                      {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ícone</Label>
              <Select value={icone} onValueChange={setIcone}>
                <SelectTrigger className="bg-slate-900 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {icones.map(i => (
                    <SelectItem key={i.value} value={i.value}>
                      <span className="flex items-center gap-2">
                        <span>{i.value}</span>
                        <span>{i.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {cores.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  className={cn(
                    'w-8 h-8 rounded-lg transition-all',
                    cor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : ''
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Copiar permissões de:</Label>
            <Select value={copiarDe} onValueChange={setCopiarDe}>
              <SelectTrigger className="bg-slate-900 border-slate-600">
                <SelectValue placeholder="Nenhum (começar vazio)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum (começar vazio)</SelectItem>
                {perfis.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span>{p.icone}</span>
                      <span>{p.nome}</span>
                      <span className="text-xs text-slate-400">({p.total_permissoes} permissões)</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={saving || !nome.trim()}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar Perfil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
