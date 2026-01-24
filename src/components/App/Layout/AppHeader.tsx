import { useState, useEffect } from 'react';
import { Calendar, MapPin, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Unidade {
  id: string;
  nome: string;
}

interface AppHeaderProps {
  unidadeSelecionada: string | null;
  onUnidadeChange: (unidadeId: string | null) => void;
  periodoLabel?: string; // Label do período selecionado (ex: "Jan/2026", "Q1 2026")
}

export function AppHeader({ unidadeSelecionada, onUnidadeChange, periodoLabel }: AppHeaderProps) {
  const { usuario, isAdmin, loading } = useAuth();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const hoje = new Date();

  // Debug: verificar estado do admin
  useEffect(() => {
    console.log('[AppHeader] loading:', loading, 'isAdmin:', isAdmin, 'usuario:', usuario?.perfil, 'unidades carregadas:', unidades.length);
  }, [loading, isAdmin, usuario, unidades]);

  // Carregar unidades quando usuario for admin
  useEffect(() => {
    if (!loading && isAdmin) {
      carregarUnidades();
    }
  }, [loading, isAdmin]);

  const carregarUnidades = async () => {
    const { data, error } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    
    console.log('[AppHeader] Unidades carregadas:', data, 'erro:', error);
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
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              <Select
                value={unidadeSelecionada || 'consolidado'}
                onValueChange={(value) => onUnidadeChange(value === 'consolidado' ? null : value)}
              >
                <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consolidado">Consolidado</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            /* Usuário de unidade - mostra unidade fixa */
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-xl px-3 py-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-white">{usuario?.unidade_nome || 'Unidade'}</span>
            </div>
          )}

          {/* Label do Período Selecionado */}
          {periodoLabel && (
            <div className="flex items-center gap-2 bg-violet-600/20 border border-violet-500/30 rounded-xl px-3 py-2">
              <Calendar className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium text-violet-300">{periodoLabel}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
