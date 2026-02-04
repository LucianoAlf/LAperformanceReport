import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AuditoriaItem {
  id: string;
  usuario_id: number | null;
  usuario_nome: string | null;
  acao: string;
  entidade: string | null;
  detalhes: Record<string, any> | null;
  created_at: string;
}

// Estilos por tipo de ação
const acaoStyles: Record<string, { bg: string; text: string; label: string }> = {
  login: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Login' },
  logout: { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Logout' },
  criar: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Criação' },
  atribuir_perfil: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Criação' },
  adicionar_perfil: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Criação' },
  adicionar_permissao: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Atualização' },
  editar: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Atualização' },
  remover_permissao: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Remoção' },
  remover_perfil: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Remoção' },
  excluir: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Exclusão' },
};

export function TabAuditoria() {
  const [registros, setRegistros] = useState<AuditoriaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroAcao, setFiltroAcao] = useState<string>('');
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('7');

  useEffect(() => {
    carregarRegistros();
  }, [filtroAcao, filtroPeriodo]);

  const carregarRegistros = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('auditoria_acesso')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      // Filtro por período
      if (filtroPeriodo) {
        const dias = parseInt(filtroPeriodo);
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - dias);
        query = query.gte('created_at', dataLimite.toISOString());
      }

      // Filtro por ação (ignorar se for "todas")
      if (filtroAcao && filtroAcao !== 'todas') {
        query = query.eq('acao', filtroAcao);
      }

      const { data } = await query;
      if (data) setRegistros(data);
    } catch (error) {
      console.error('Erro ao carregar auditoria:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data: string) => {
    const date = new Date(data);
    const agora = new Date();
    const diffHoras = (agora.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHoras < 24) {
      return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    }
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const formatarDescricao = (registro: AuditoriaItem): string => {
    const detalhes = registro.detalhes || {};
    
    switch (registro.acao) {
      case 'login':
        return `Acessou o sistema`;
      case 'logout':
        return `Saiu do sistema`;
      case 'atribuir_perfil':
      case 'adicionar_perfil':
        return `Atribuiu perfil "${detalhes.perfil_nome}" para usuário`;
      case 'remover_perfil':
        return `Removeu perfil de usuário`;
      case 'adicionar_permissao':
        return `Adicionou permissão ao perfil "${detalhes.perfil_nome}"`;
      case 'remover_permissao':
        return `Removeu permissão do perfil "${detalhes.perfil_nome}"`;
      default:
        return registro.acao;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">📋</span>
            <h2 className="text-lg font-semibold text-white">Log de Auditoria</h2>
          </div>
          <div className="flex gap-3">
            <Select value={filtroAcao} onValueChange={setFiltroAcao}>
              <SelectTrigger className="w-[180px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Todas as ações" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as ações</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="atribuir_perfil">Atribuir Perfil</SelectItem>
                <SelectItem value="adicionar_permissao">Adicionar Permissão</SelectItem>
                <SelectItem value="remover_permissao">Remover Permissão</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="w-[180px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 3 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
          ) : registros.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <span className="text-4xl mb-4 block">📋</span>
              Nenhum registro de auditoria encontrado
            </div>
          ) : (
            <div className="space-y-3">
              {registros.map((registro) => {
                const style = acaoStyles[registro.acao] || acaoStyles.editar;

                return (
                  <div 
                    key={registro.id}
                    className="flex items-start gap-4 p-4 bg-slate-900/50 rounded-lg"
                  >
                    <div className="min-w-[140px] text-sm text-slate-400">
                      {formatarData(registro.created_at)}
                    </div>
                    <div className="min-w-[150px] font-medium text-white">
                      {registro.usuario_nome || 'Sistema'}
                    </div>
                    <div className="flex-1">
                      <span className={cn(
                        'inline-block px-2 py-0.5 rounded text-xs font-medium mr-2',
                        style.bg,
                        style.text
                      )}>
                        {style.label}
                      </span>
                      <span className="text-slate-300">
                        {formatarDescricao(registro)}
                      </span>
                    </div>
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
