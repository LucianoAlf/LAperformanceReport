import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Plus, Pencil } from 'lucide-react';
import { ModalAtribuirPerfil } from './ModalAtribuirPerfil';
import { ModalEditarPerfisUsuario } from './ModalEditarPerfisUsuario';
import type { Perfil, UsuarioComPerfis } from './index';

interface TabUsuariosPerfilProps {
  perfis: Perfil[];
  onRefresh: () => void;
}

export function TabUsuariosPerfil({ perfis, onRefresh }: TabUsuariosPerfilProps) {
  const [usuarios, setUsuarios] = useState<UsuarioComPerfis[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalAtribuirAberto, setModalAtribuirAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioComPerfis | null>(null);

  useEffect(() => {
    carregarUsuarios();
  }, []);

  const carregarUsuarios = async () => {
    setLoading(true);
    try {
      // Buscar usuários com unidade
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('*, unidades(nome)')
        .eq('ativo', true)
        .order('nome');

      if (usuariosData) {
        // Para cada usuário, buscar seus perfis do novo sistema
        const usuariosComPerfis = await Promise.all(
          usuariosData.map(async (u) => {
            const { data: perfisData } = await supabase
              .rpc('usuario_perfis_lista', { p_usuario_id: u.id });

            return {
              id: u.id,
              nome: u.nome,
              email: u.email,
              perfil: u.perfil,
              ativo: u.ativo,
              unidade_id: u.unidade_id,
              unidade_nome: u.unidades?.nome || null,
              perfis_novos: perfisData?.map((p: any) => ({
                perfil_nome: p.perfil_nome,
                perfil_cor: p.perfil_cor,
                unidade_nome: p.unidade_nome,
              })) || [],
            };
          })
        );

        setUsuarios(usuariosComPerfis);
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar usuários pela busca
  const usuariosFiltrados = usuarios.filter(u => 
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">👤</span>
            <h2 className="text-lg font-semibold text-white">Usuários por Perfil</h2>
          </div>
          <Button onClick={() => setModalAtribuirAberto(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Atribuir Perfil
          </Button>
        </div>

        <div className="p-4">
          {/* Busca */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar usuário..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10 bg-slate-900 border-slate-600"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-3 text-sm font-medium text-slate-400">Usuário</th>
                    <th className="text-left p-3 text-sm font-medium text-slate-400">Email</th>
                    <th className="text-left p-3 text-sm font-medium text-slate-400">Perfis</th>
                    <th className="text-left p-3 text-sm font-medium text-slate-400">Unidade</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-400">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map((usuario) => {
                    // Determinar cor do avatar baseado no perfil
                    const perfilCor = usuario.perfil === 'admin' 
                      ? '#ef4444' 
                      : usuario.perfis_novos[0]?.perfil_cor || '#64748b';

                    return (
                      <tr key={usuario.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium"
                              style={{ backgroundColor: `${perfilCor}40` }}
                            >
                              {usuario.nome[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-white">{usuario.nome}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-300">{usuario.email}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {/* Perfil antigo (admin/unidade) */}
                            {usuario.perfil === 'admin' && (
                              <span 
                                className="px-2 py-0.5 rounded text-xs font-medium text-white"
                                style={{ backgroundColor: '#ef4444' }}
                              >
                                Admin
                              </span>
                            )}
                            {/* Perfis do novo sistema */}
                            {usuario.perfis_novos.map((p, idx) => (
                              <span 
                                key={idx}
                                className="px-2 py-0.5 rounded text-xs font-medium text-white"
                                style={{ backgroundColor: p.perfil_cor }}
                              >
                                {p.perfil_nome}
                              </span>
                            ))}
                            {usuario.perfil !== 'admin' && usuario.perfis_novos.length === 0 && (
                              <span className="text-xs text-slate-500">Sem perfil</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-slate-300">
                          {usuario.unidade_nome || 'Todas'}
                        </td>
                        <td className="p-3 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setUsuarioEditando(usuario)}
                            className="gap-2"
                          >
                            <Pencil className="w-4 h-4" />
                            Editar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {usuariosFiltrados.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  Nenhum usuário encontrado
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Atribuir Perfil */}
      <ModalAtribuirPerfil
        open={modalAtribuirAberto}
        onOpenChange={setModalAtribuirAberto}
        perfis={perfis}
        onSuccess={() => {
          carregarUsuarios();
          setModalAtribuirAberto(false);
        }}
      />

      {/* Modal Editar Perfis do Usuário */}
      {usuarioEditando && (
        <ModalEditarPerfisUsuario
          open={!!usuarioEditando}
          onOpenChange={(open) => !open && setUsuarioEditando(null)}
          usuario={usuarioEditando}
          perfis={perfis}
          onSuccess={() => {
            carregarUsuarios();
            setUsuarioEditando(null);
          }}
        />
      )}
    </div>
  );
}
