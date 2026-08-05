import { useState, useEffect } from 'react';
import { Calendar, MapPin, Building2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { usePageTitle } from '../../../contexts/PageTitleContext';
import { supabase } from '../../../lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Unidade {
  id: string;
  nome: string;
}

interface AppHeaderProps {
  unidadeSelecionada: string | null;
  onUnidadeChange: (unidadeId: string | null) => void;
  periodoLabel?: string;
}

export function AppHeader({ unidadeSelecionada, onUnidadeChange, periodoLabel }: AppHeaderProps) {
  const { usuario, isAdmin, loading, unidadesPermitidas } = useAuth();
  const { pageTitle } = usePageTitle();
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  // Não-admin com mais de um vínculo escolhe entre as unidades DELE — sem "Consolidado",
  // que significa a rede inteira e passaria direto pelas RPCs SECURITY DEFINER.
  const multiUnidade = !isAdmin && unidadesPermitidas.length > 1;
  const unidadeAtualNome =
    unidadesPermitidas.find(u => u.id === unidadeSelecionada)?.nome
    ?? usuario?.unidade_nome
    ?? 'Unidade';

  // Carregar unidades quando usuario for admin
  useEffect(() => {
    if (!loading && isAdmin) {
      carregarUnidades();
    }
  }, [loading, isAdmin]);

  const carregarUnidades = async () => {
    const { data } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    if (data) setUnidades(data);
  };

  const Icone = pageTitle?.icone;

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-sm border-b border-slate-800 px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Título da página */}
        <div className="flex items-center gap-3">
          {Icone && (
            <div className={`p-2 rounded-xl ${pageTitle?.iconeWrapperCor || 'bg-slate-700/50'}`}>
              <Icone className={`w-5 h-5 ${pageTitle?.iconeCor || 'text-slate-400'}`} />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white">
              {pageTitle?.titulo || 'LA Report'}
            </h1>
            {pageTitle?.subtitulo && (
              <p className="text-sm text-slate-400">{pageTitle.subtitulo}</p>
            )}
          </div>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-4">
          {/* Seletor de Unidade: admin (com Consolidado) ou multi-unidade (só as dele) */}
          {isAdmin ? (
            <div data-tour="header-unidade" className="flex items-center gap-2">
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
          ) : multiUnidade ? (
            <div data-tour="header-unidade" className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              <Select
                value={unidadeSelecionada ?? undefined}
                onValueChange={(value) => onUnidadeChange(value)}
              >
                <SelectTrigger className="w-[180px] bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {unidadesPermitidas.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome ?? 'Unidade'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-xl px-3 py-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-white">{unidadeAtualNome}</span>
            </div>
          )}

          {/* Label do Período Selecionado */}
          {periodoLabel && (
            <div data-tour="header-competencia" className="flex items-center gap-2 bg-violet-600/20 border border-violet-500/30 rounded-xl px-3 py-2">
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
