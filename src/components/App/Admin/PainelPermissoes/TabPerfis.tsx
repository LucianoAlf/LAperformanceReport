import React from 'react';
import { Loader2, Info, Shield, Briefcase, Users, Target, Music, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Perfil } from './index';

interface TabPerfisProps {
  perfis: Perfil[];
  loading: boolean;
  perfilSelecionado: Perfil | null;
  onSelectPerfil: (perfil: Perfil) => void;
  onRefresh: () => void;
}

// Mapeamento de níveis para labels
const nivelLabels: Record<number, string> = {
  100: 'Administrador',
  50: 'Gerencial',
  30: 'Operacional',
  20: 'Professor',
  10: 'Básico',
};

// Mapeamento de ícones Lucide por nome de perfil
const perfilIcones: Record<string, React.ComponentType<{ className?: string }>> = {
  'Admin': Shield,
  'Gerente': Briefcase,
  'Farmer': Users,
  'Hunter': Target,
  'Professor': Music,
  'Visualizador': Eye,
};

export function TabPerfis({ 
  perfis, 
  loading, 
  perfilSelecionado, 
  onSelectPerfil 
}: TabPerfisProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  // Estatísticas
  const totalPerfis = perfis.length;
  const totalPermissoes = perfis.reduce((acc, p) => acc + (p.total_permissoes || 0), 0) / perfis.length;

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
          <div className="text-3xl font-bold text-violet-400">{totalPerfis}</div>
          <div className="text-sm text-slate-400">Perfis Ativos</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
          <div className="text-3xl font-bold text-violet-400">47</div>
          <div className="text-sm text-slate-400">Permissões</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
          <div className="text-3xl font-bold text-violet-400">-</div>
          <div className="text-sm text-slate-400">Usuários</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
          <div className="text-3xl font-bold text-violet-400">3</div>
          <div className="text-sm text-slate-400">Unidades</div>
        </div>
      </div>

      {/* Info Box - Hierarquia */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 text-blue-400 font-medium mb-2">
          <Info className="w-4 h-4" />
          Hierarquia de Acesso
        </div>
        <p className="text-sm text-slate-300">
          Usuários com perfis de maior nível podem gerenciar usuários de menor nível. 
          O perfil Admin é protegido e não pode ser excluído.
        </p>
      </div>

      {/* Hierarquia Visual */}
      <div className="flex flex-wrap items-center gap-2 p-4 bg-slate-800/30 rounded-xl border border-slate-700">
        {perfis.map((perfil, index) => {
          const IconComponent = perfilIcones[perfil.nome] || Shield;
          return (
            <div key={perfil.id} className="flex items-center gap-2">
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ backgroundColor: `${perfil.cor}30`, color: perfil.cor }}
              >
                <IconComponent className="w-4 h-4" />
                <span>{perfil.nome}</span>
                <span className="text-xs opacity-70">({perfil.nivel})</span>
              </div>
              {index < perfis.length - 1 && (
                <span className="text-slate-500">→</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid de Perfis */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Perfis Disponíveis</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {perfis.map((perfil) => {
              const IconComponent = perfilIcones[perfil.nome] || Shield;
              return (
                <button
                  key={perfil.id}
                  onClick={() => onSelectPerfil(perfil)}
                  className={cn(
                    'p-4 rounded-xl border-2 transition-all text-center',
                    perfilSelecionado?.id === perfil.id
                      ? 'border-violet-500 bg-slate-700/50'
                      : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                  )}
                >
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: `${perfil.cor}20` }}
                  >
                    <IconComponent className="w-6 h-6" style={{ color: perfil.cor }} />
                  </div>
                  <div className="font-semibold text-white mb-1">{perfil.nome}</div>
                  <div className="text-xs text-slate-400 mb-2">
                    {perfil.descricao || nivelLabels[perfil.nivel] || 'Perfil'}
                  </div>
                  <div 
                    className="inline-block px-2 py-0.5 rounded text-xs font-medium border"
                    style={{ 
                      backgroundColor: `${perfil.cor}20`, 
                      color: perfil.cor,
                      borderColor: `${perfil.cor}40`
                    }}
                  >
                    {perfil.total_permissoes} permissões
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
