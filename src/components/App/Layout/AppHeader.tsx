import { useState, useEffect } from 'react';
import { Bell, Search, Calendar, MapPin, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

interface Unidade {
  id: string;
  nome: string;
}

interface AppHeaderProps {
  unidadeSelecionada: string | null;
  onUnidadeChange: (unidadeId: string | null) => void;
}

export function AppHeader({ unidadeSelecionada, onUnidadeChange }: AppHeaderProps) {
  const { usuario, isAdmin } = useAuth();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const hoje = new Date();

  useEffect(() => {
    if (isAdmin) {
      carregarUnidades();
    }
  }, [isAdmin]);

  const carregarUnidades = async () => {
    const { data } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    if (data) setUnidades(data);
  };

  const getSaudacao = () => {
    const hora = hoje.getHours();
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-sm border-b border-slate-800 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Saudação */}
        <div>
          <h1 className="text-xl font-bold text-white">
            {getSaudacao()}, {usuario?.nome?.split(' ')[0] || 'Usuário'}! 👋
          </h1>
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {format(hoje, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-4">
          {/* Seletor de Unidade - APENAS PARA ADMIN */}
          {isAdmin ? (
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-xl px-3 py-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              <select
                value={unidadeSelecionada || 'consolidado'}
                onChange={(e) => onUnidadeChange(e.target.value === 'consolidado' ? null : e.target.value)}
                className="bg-transparent text-sm text-white border-none outline-none cursor-pointer"
              >
                <option value="consolidado" className="bg-slate-900">
                  Consolidado
                </option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id} className="bg-slate-900">
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            /* Usuário de unidade - mostra unidade fixa */
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-xl px-3 py-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-white">{usuario?.unidade_nome || 'Unidade'}</span>
            </div>
          )}

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar aluno..."
              className="bg-slate-800/50 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 w-64"
            />
          </div>

          {/* Notificações */}
          <button className="relative p-2 text-gray-400 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
