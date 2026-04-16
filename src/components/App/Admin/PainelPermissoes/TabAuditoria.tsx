import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AuditLogItem {
  id: string;
  tabela: string;
  registro_id_text: string | null;
  acao: string;
  dados_antigos: Record<string, any> | null;
  dados_novos: Record<string, any> | null;
  usuario: string;
  auth_user_id: string | null;
  origem: string;
  created_at: string;
}

const acaoStyles: Record<string, { bg: string; text: string; label: string }> = {
  INSERT: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Criação' },
  UPDATE: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Atualização' },
  DELETE: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Exclusão' },
};

const origemStyles: Record<string, { bg: string; text: string; label: string }> = {
  manual: { bg: 'bg-violet-500/20', text: 'text-violet-400', label: 'Manual' },
  system: { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Sistema' },
  webhook: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Webhook' },
  cron: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Cron' },
};

const tabelaLabels: Record<string, string> = {
  alunos: 'Alunos',
  leads: 'Leads',
  lead_experimentais: 'Experimentais',
  movimentacoes_admin: 'Movimentações',
  renovacoes: 'Renovações',
  professores: 'Professores',
  professor_acoes: 'Ações Prof.',
  professor_360_avaliacoes: 'Avaliação 360',
  professor_360_ocorrencias: 'Ocorrências 360',
  turmas_explicitas: 'Turmas',
  turmas_alunos: 'Alunos Turma',
  salas: 'Salas',
  cursos: 'Cursos',
  unidades: 'Unidades',
  dados_mensais: 'Dados Mensais',
  metas: 'Metas',
  metas_kpi: 'Metas KPI',
  loja_produtos: 'Loja Produtos',
  projetos: 'Projetos',
  projeto_tarefas: 'Tarefas Projeto',
  config_health_score_professor: 'Config Health Score',
  crm_pipeline_etapas: 'Etapas Pipeline',
};

// Campos para identificar registros (nome legível)
const camposIdentificacao: Record<string, string[]> = {
  alunos: ['nome', 'status'],
  leads: ['nome', 'status', 'telefone'],
  professores: ['nome'],
  salas: ['nome'],
  cursos: ['nome'],
  unidades: ['nome'],
  projetos: ['nome'],
  loja_produtos: ['nome'],
};

function getIdentificacao(tabela: string, dados: Record<string, any> | null): string {
  if (!dados) return '';
  const campos = camposIdentificacao[tabela] || ['nome'];
  for (const campo of campos) {
    if (dados[campo]) return String(dados[campo]);
  }
  return '';
}

// Calcula diff entre dados antigos e novos
function calcularDiff(antigo: Record<string, any> | null, novo: Record<string, any> | null): { campo: string; antes: any; depois: any }[] {
  if (!antigo || !novo) return [];
  const diff: { campo: string; antes: any; depois: any }[] = [];
  const camposIgnorar = ['updated_at', 'created_at'];

  for (const key of Object.keys(novo)) {
    if (camposIgnorar.includes(key)) continue;
    const valorAntigo = antigo[key];
    const valorNovo = novo[key];
    if (JSON.stringify(valorAntigo) !== JSON.stringify(valorNovo)) {
      diff.push({ campo: key, antes: valorAntigo, depois: valorNovo });
    }
  }
  return diff;
}

function formatarValor(valor: any): string {
  if (valor === null || valor === undefined) return '(vazio)';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

const POR_PAGINA = 50;

export function TabAuditoria() {
  const [registros, setRegistros] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTabela, setFiltroTabela] = useState<string>('todas');
  const [filtroAcao, setFiltroAcao] = useState<string>('todas');
  const [filtroOrigem, setFiltroOrigem] = useState<string>('todas');
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('7');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca.trim()), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    setPagina(1);
    carregarRegistros(1);
  }, [filtroTabela, filtroAcao, filtroOrigem, filtroPeriodo, buscaDebounced]);

  useEffect(() => {
    carregarRegistros(pagina);
  }, [pagina]);

  const carregarRegistros = async (pag: number) => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_log')
        .select('id, tabela, registro_id_text, acao, dados_antigos, dados_novos, usuario, auth_user_id, origem, created_at', { count: 'exact' })
        .not('registro_id_text', 'is', null)
        .order('created_at', { ascending: false })
        .range((pag - 1) * POR_PAGINA, pag * POR_PAGINA - 1);

      if (filtroPeriodo && filtroPeriodo !== 'todos') {
        const dias = parseInt(filtroPeriodo);
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - dias);
        query = query.gte('created_at', dataLimite.toISOString());
      }

      if (filtroTabela && filtroTabela !== 'todas') {
        query = query.eq('tabela', filtroTabela);
      }
      if (filtroAcao && filtroAcao !== 'todas') {
        query = query.eq('acao', filtroAcao);
      }
      if (filtroOrigem && filtroOrigem !== 'todas') {
        query = query.eq('origem', filtroOrigem);
      }

      if (buscaDebounced) {
        query = query.or(`usuario.ilike.%${buscaDebounced}%,dados_novos->nome.ilike.%${buscaDebounced}%`);
      }

      const { data, count } = await query;
      if (data) setRegistros(data);
      if (count !== null) setTotal(count);
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

  const totalPaginas = Math.ceil(total / POR_PAGINA);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-lg">📋</span>
              <h2 className="text-lg font-semibold text-white">Audit Log</h2>
              <span className="text-sm text-slate-400">{total} registros</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar usuário ou registro..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-[220px] pl-9 bg-slate-900 border-slate-600"
              />
            </div>
            <Select value={filtroTabela} onValueChange={setFiltroTabela}>
              <SelectTrigger className="w-[170px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Todas as tabelas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as tabelas</SelectItem>
                {Object.entries(tabelaLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroAcao} onValueChange={setFiltroAcao}>
              <SelectTrigger className="w-[150px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Todas as ações" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as ações</SelectItem>
                <SelectItem value="INSERT">Criação</SelectItem>
                <SelectItem value="UPDATE">Atualização</SelectItem>
                <SelectItem value="DELETE">Exclusão</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="w-[150px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Todas origens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas origens</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="w-[160px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Últimas 24h</SelectItem>
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
            <div className="space-y-2">
              {registros.map((reg) => {
                const acaoStyle = acaoStyles[reg.acao] || acaoStyles.UPDATE;
                const origemStyle = origemStyles[reg.origem] || origemStyles.system;
                const isExpanded = expandido === reg.id;
                const identificacao = getIdentificacao(reg.tabela, reg.dados_novos || reg.dados_antigos);
                const diff = reg.acao === 'UPDATE' ? calcularDiff(reg.dados_antigos, reg.dados_novos) : [];

                return (
                  <div key={reg.id} className="bg-slate-900/50 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandido(isExpanded ? null : reg.id)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-800/50 transition"
                    >
                      <div className="min-w-[130px] text-sm text-slate-400">
                        {formatarData(reg.created_at)}
                      </div>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', acaoStyle.bg, acaoStyle.text)}>
                        {acaoStyle.label}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', origemStyle.bg, origemStyle.text)}>
                        {origemStyle.label}
                      </span>
                      <span className="text-sm text-slate-300 font-medium">
                        {tabelaLabels[reg.tabela] || reg.tabela}
                      </span>
                      {identificacao && (
                        <span className="text-sm text-white font-medium truncate max-w-[200px]">
                          {identificacao}
                        </span>
                      )}
                      <div className="flex-1" />
                      <span className="text-xs text-slate-500 truncate max-w-[150px]">
                        {reg.usuario !== 'system' ? reg.usuario : 'Sistema'}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-slate-800">
                        {reg.acao === 'UPDATE' && diff.length > 0 ? (
                          <div className="mt-3">
                            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Campos alterados</p>
                            <div className="space-y-1">
                              {diff.map(({ campo, antes, depois }) => (
                                <div key={campo} className="flex items-start gap-2 text-sm">
                                  <span className="text-slate-400 font-mono min-w-[160px]">{campo}</span>
                                  <span className="text-rose-400 line-through">{formatarValor(antes)}</span>
                                  <span className="text-slate-500">→</span>
                                  <span className="text-emerald-400">{formatarValor(depois)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : reg.acao === 'INSERT' && reg.dados_novos ? (
                          <div className="mt-3">
                            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Dados criados</p>
                            <pre className="text-xs text-slate-300 bg-slate-950 rounded p-3 overflow-x-auto max-h-[200px]">
                              {JSON.stringify(reg.dados_novos, null, 2)}
                            </pre>
                          </div>
                        ) : reg.acao === 'DELETE' && reg.dados_antigos ? (
                          <div className="mt-3">
                            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Dados excluídos</p>
                            <pre className="text-xs text-slate-300 bg-slate-950 rounded p-3 overflow-x-auto max-h-[200px]">
                              {JSON.stringify(reg.dados_antigos, null, 2)}
                            </pre>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">Sem detalhes disponíveis</p>
                        )}
                        <div className="mt-2 flex gap-4 text-xs text-slate-500">
                          <span>ID: {reg.registro_id_text}</span>
                          {reg.auth_user_id && <span>Auth: {reg.auth_user_id.slice(0, 8)}...</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
              <span className="text-sm text-slate-400">
                Página {pagina} de {totalPaginas}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                  className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded disabled:opacity-50 hover:bg-slate-600 transition"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina >= totalPaginas}
                  className="px-3 py-1 text-sm bg-slate-700 text-slate-300 rounded disabled:opacity-50 hover:bg-slate-600 transition"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
