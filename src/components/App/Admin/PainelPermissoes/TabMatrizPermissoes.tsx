import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronRight, Check, X, Eye, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Perfil, Permissao } from './index';

interface TabMatrizPermissoesProps {
  perfis: Perfil[];
  permissoes: Permissao[];
  perfilSelecionado: Perfil | null;
  onSelectPerfil: (perfil: Perfil) => void;
  onRefresh: () => void;
}

// Agrupar permissões por categoria e módulo
function agruparPermissoes(permissoes: Permissao[]) {
  const grupos: Record<string, Record<string, Permissao[]>> = {};
  
  permissoes.forEach(p => {
    if (!grupos[p.categoria]) {
      grupos[p.categoria] = {};
    }
    if (!grupos[p.categoria][p.modulo]) {
      grupos[p.categoria][p.modulo] = [];
    }
    grupos[p.categoria][p.modulo].push(p);
  });
  
  return grupos;
}

// Ícones por módulo
const moduloIcones: Record<string, string> = {
  dashboard: '📊',
  analytics: '📈',
  metas: '🎯',
  sistema: '⚙️',
  comercial: '🛒',
  administrativo: '📋',
  alunos: '🎓',
  professores: '🎵',
  renovacoes: '🔄',
  evasoes: '📉',
  retencao: '💪',
  usuarios: '👤',
  permissoes: '🔐',
  perfis: '👥',
  auditoria: '📋',
  configuracoes: '⚙️',
};

// Cores por categoria
const categoriaStyles: Record<string, { bg: string; text: string }> = {
  SISTEMA: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  OPERACIONAL: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  ADMIN: { bg: 'bg-rose-500/20', text: 'text-rose-400' },
};

export function TabMatrizPermissoes({ 
  perfis, 
  permissoes, 
  perfilSelecionado, 
  onSelectPerfil,
  onRefresh 
}: TabMatrizPermissoesProps) {
  const [permissoesAtivas, setPermissoesAtivas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modulosExpandidos, setModulosExpandidos] = useState<Set<string>>(new Set(['SISTEMA', 'OPERACIONAL']));

  // Carregar permissões do perfil selecionado
  useEffect(() => {
    if (perfilSelecionado) {
      carregarPermissoesPerfil(perfilSelecionado.id);
    }
  }, [perfilSelecionado]);

  const carregarPermissoesPerfil = async (perfilId: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('perfil_permissoes')
        .select('permissao_id')
        .eq('perfil_id', perfilId);
      
      if (data) {
        setPermissoesAtivas(new Set(data.map(p => p.permissao_id)));
      }
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePermissao = async (permissaoId: string) => {
    if (!perfilSelecionado) return;
    
    setSaving(true);
    const novoSet = new Set(permissoesAtivas);
    
    try {
      if (novoSet.has(permissaoId)) {
        // Remover permissão
        await supabase
          .from('perfil_permissoes')
          .delete()
          .eq('perfil_id', perfilSelecionado.id)
          .eq('permissao_id', permissaoId);
        novoSet.delete(permissaoId);
      } else {
        // Adicionar permissão
        await supabase
          .from('perfil_permissoes')
          .insert({
            perfil_id: perfilSelecionado.id,
            permissao_id: permissaoId,
          });
        novoSet.add(permissaoId);
      }
      
      setPermissoesAtivas(novoSet);
      
      // Registrar na auditoria
      await supabase.from('auditoria_acesso').insert({
        acao: novoSet.has(permissaoId) ? 'adicionar_permissao' : 'remover_permissao',
        entidade: 'perfil_permissoes',
        detalhes: {
          perfil_id: perfilSelecionado.id,
          perfil_nome: perfilSelecionado.nome,
          permissao_id: permissaoId,
        },
      });
      
    } catch (error) {
      console.error('Erro ao alterar permissão:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleModulo = (categoria: string) => {
    const novoSet = new Set(modulosExpandidos);
    if (novoSet.has(categoria)) {
      novoSet.delete(categoria);
    } else {
      novoSet.add(categoria);
    }
    setModulosExpandidos(novoSet);
  };

  const ativarTodas = async () => {
    if (!perfilSelecionado) return;
    setSaving(true);
    
    try {
      // Remover todas primeiro
      await supabase
        .from('perfil_permissoes')
        .delete()
        .eq('perfil_id', perfilSelecionado.id);
      
      // Adicionar todas
      const inserts = permissoes.map(p => ({
        perfil_id: perfilSelecionado.id,
        permissao_id: p.id,
      }));
      
      await supabase.from('perfil_permissoes').insert(inserts);
      setPermissoesAtivas(new Set(permissoes.map(p => p.id)));
      onRefresh();
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setSaving(false);
    }
  };

  const desativarTodas = async () => {
    if (!perfilSelecionado) return;
    setSaving(true);
    
    try {
      await supabase
        .from('perfil_permissoes')
        .delete()
        .eq('perfil_id', perfilSelecionado.id);
      
      setPermissoesAtivas(new Set());
      onRefresh();
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setSaving(false);
    }
  };

  const grupos = agruparPermissoes(permissoes);

  return (
    <div className="space-y-6">
      {/* Header com seletor de perfil */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚙️</span>
            <h2 className="text-lg font-semibold text-white">Permissões do Perfil</h2>
          </div>
          <Select 
            value={perfilSelecionado?.id || ''} 
            onValueChange={(id) => {
              const perfil = perfis.find(p => p.id === id);
              if (perfil) onSelectPerfil(perfil);
            }}
          >
            <SelectTrigger className="w-[200px] bg-slate-900 border-slate-600">
              <SelectValue placeholder="Selecione um perfil" />
            </SelectTrigger>
            <SelectContent>
              {perfis.map(perfil => (
                <SelectItem key={perfil.id} value={perfil.id}>
                  <span className="flex items-center gap-2">
                    <span>{perfil.icone}</span>
                    <span>{perfil.nome}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="p-4">
          {/* Ações rápidas */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={ativarTodas}
              disabled={saving || !perfilSelecionado}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              Ativar Todas
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={desativarTodas}
              disabled={saving || !perfilSelecionado}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Desativar Todas
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={saving || !perfilSelecionado}
              className="gap-2"
            >
              <Eye className="w-4 h-4" />
              Apenas Ver
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={saving || !perfilSelecionado}
              className="gap-2"
            >
              <Copy className="w-4 h-4" />
              Copiar de...
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grupos).map(([categoria, modulos]) => {
                const style = categoriaStyles[categoria] || categoriaStyles.OPERACIONAL;
                const isExpanded = modulosExpandidos.has(categoria);
                const totalAtivas = Object.values(modulos)
                  .flat()
                  .filter(p => permissoesAtivas.has(p.id)).length;
                const totalCategoria = Object.values(modulos).flat().length;

                return (
                  <div key={categoria} className="space-y-3">
                    {/* Header da categoria */}
                    <button
                      onClick={() => toggleModulo(categoria)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg transition-colors',
                        'bg-slate-700/50 hover:bg-slate-700'
                      )}
                    >
                      <div className={cn('p-2 rounded-lg', style.bg)}>
                        <span className="text-lg">
                          {categoria === 'SISTEMA' ? '📊' : categoria === 'ADMIN' ? '⚙️' : '🏢'}
                        </span>
                      </div>
                      <span className="font-semibold text-white flex-1 text-left">{categoria}</span>
                      <span className={cn('text-xs px-3 py-1 rounded-full font-medium', style.bg, style.text)}>
                        {categoria}
                      </span>
                      <span className="text-sm text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
                        {totalAtivas}/{totalCategoria} ativos
                      </span>
                      <ChevronRight className={cn(
                        'w-5 h-5 text-slate-400 transition-transform',
                        isExpanded && 'rotate-90'
                      )} />
                    </button>

                    {/* Lista de permissões */}
                    {isExpanded && (
                      <div className="pl-4 space-y-2">
                        {Object.entries(modulos).map(([modulo, perms]) => (
                          <div key={modulo} className="space-y-1">
                            {perms.map((perm, idx) => {
                              const isSubPermissao = perm.acao.includes('.');
                              const isAtiva = permissoesAtivas.has(perm.id);

                              return (
                                <div
                                  key={perm.id}
                                  className={cn(
                                    'flex items-center justify-between p-3 rounded-lg transition-colors',
                                    'bg-slate-900/50 hover:bg-slate-800/50',
                                    isSubPermissao && 'ml-6 border-l-2 border-slate-700 rounded-l-none'
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 bg-slate-700 rounded-md flex items-center justify-center text-sm">
                                      {moduloIcones[modulo] || '📌'}
                                    </div>
                                    <div>
                                      <span className="text-sm text-white">
                                        {perm.descricao || perm.acao}
                                      </span>
                                      <span className="ml-2 text-xs text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">
                                        {perm.codigo}
                                      </span>
                                    </div>
                                  </div>
                                  <Switch
                                    checked={isAtiva}
                                    onCheckedChange={() => togglePermissao(perm.id)}
                                    disabled={saving}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
