import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Shield, Users, Settings, ClipboardList, Plus } from 'lucide-react';
import { TabPerfis } from './TabPerfis';
import { TabMatrizPermissoes } from './TabMatrizPermissoes';
import { TabUsuariosPerfil } from './TabUsuariosPerfil';
import { TabAuditoria } from './TabAuditoria';
import { ModalNovoPerfil } from './ModalNovoPerfil';
import { useAuth } from '@/contexts/AuthContext';

export interface Perfil {
  id: string;
  nome: string;
  descricao: string | null;
  nivel: number;
  icone: string;
  cor: string;
  sistema: boolean;
  ativo: boolean;
  total_permissoes?: number;
}

export interface Permissao {
  id: string;
  codigo: string;
  modulo: string;
  acao: string;
  descricao: string | null;
  categoria: string;
  ordem: number;
  ativo: boolean;
}

export interface UsuarioComPerfis {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  unidade_id: string | null;
  unidade_nome?: string;
  perfis_novos: {
    perfil_nome: string;
    perfil_cor: string;
    unidade_nome: string | null;
  }[];
}

export function PainelPermissoes() {
  const { isAdmin } = useAuth();
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalNovoPerfilAberto, setModalNovoPerfilAberto] = useState(false);
  const [perfilSelecionado, setPerfilSelecionado] = useState<Perfil | null>(null);

  // Carregar dados iniciais
  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Carregar perfis com contagem de permissões
      const { data: perfisData } = await supabase
        .from('perfis')
        .select('*')
        .eq('ativo', true)
        .order('nivel', { ascending: false });

      if (perfisData) {
        // Buscar contagem de permissões para cada perfil
        const perfisComContagem = await Promise.all(
          perfisData.map(async (perfil) => {
            const { count } = await supabase
              .from('perfil_permissoes')
              .select('*', { count: 'exact', head: true })
              .eq('perfil_id', perfil.id);
            return { ...perfil, total_permissoes: count || 0 };
          })
        );
        setPerfis(perfisComContagem);
        
        // Selecionar primeiro perfil por padrão
        if (perfisComContagem.length > 0 && !perfilSelecionado) {
          setPerfilSelecionado(perfisComContagem[0]);
        }
      }

      // Carregar permissões
      const { data: permissoesData } = await supabase
        .from('permissoes')
        .select('*')
        .eq('ativo', true)
        .order('categoria')
        .order('ordem');

      if (permissoesData) {
        setPermissoes(permissoesData);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Acesso Restrito</h2>
          <p className="text-slate-400">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/20 rounded-lg">
            <Shield className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Gerenciar Permissões</h1>
            <p className="text-sm text-slate-400">Configure perfis e permissões de acesso</p>
          </div>
        </div>
        <Button onClick={() => setModalNovoPerfilAberto(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Perfil
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="perfis" className="w-full">
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="perfis" className="gap-2 data-[state=active]:bg-slate-700">
            <Users className="w-4 h-4" />
            Perfis
          </TabsTrigger>
          <TabsTrigger value="matriz" className="gap-2 data-[state=active]:bg-slate-700">
            <Settings className="w-4 h-4" />
            Matriz de Permissões
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-2 data-[state=active]:bg-slate-700">
            <Users className="w-4 h-4" />
            Usuários por Perfil
          </TabsTrigger>
          <TabsTrigger value="auditoria" className="gap-2 data-[state=active]:bg-slate-700">
            <ClipboardList className="w-4 h-4" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perfis" className="mt-6">
          <TabPerfis 
            perfis={perfis} 
            loading={loading}
            perfilSelecionado={perfilSelecionado}
            onSelectPerfil={setPerfilSelecionado}
            onRefresh={carregarDados}
          />
        </TabsContent>

        <TabsContent value="matriz" className="mt-6">
          <TabMatrizPermissoes 
            perfis={perfis}
            permissoes={permissoes}
            perfilSelecionado={perfilSelecionado}
            onSelectPerfil={setPerfilSelecionado}
            onRefresh={carregarDados}
          />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <TabUsuariosPerfil 
            perfis={perfis}
            onRefresh={carregarDados}
          />
        </TabsContent>

        <TabsContent value="auditoria" className="mt-6">
          <TabAuditoria />
        </TabsContent>
      </Tabs>

      {/* Modal Novo Perfil */}
      <ModalNovoPerfil 
        open={modalNovoPerfilAberto}
        onOpenChange={setModalNovoPerfilAberto}
        perfis={perfis}
        onSuccess={() => {
          carregarDados();
          setModalNovoPerfilAberto(false);
        }}
      />
    </div>
  );
}

export default PainelPermissoes;
