import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Guitar, Users, Clock, Calendar, Search, AlertTriangle, Pencil, Archive, ArchiveRestore,
  Table, LayoutGrid, Plus, Trash2, MoreVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { abreviarNome } from '@/lib/nomeExibicao.mjs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Paginacao } from '@/components/ui/Paginacao';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import {
  useBandasListar, definirStatusBanda, removerBanda,
  type BandaResumo, type BandaStatus,
} from '@/hooks/useBandas';
import { BandaDetalheDialog } from './BandaDetalheDialog';
import { ModalIdentidadeBanda } from './ModalIdentidadeBanda';
import { ModalBandaAvulsa } from './ModalBandaAvulsa';

function formatarHorario(horario: string | null): string {
  if (!horario) return '—';
  const [h, m] = horario.split(':');
  return `${h}h${m && m !== '00' ? m : ''}`;
}

function formatarProximoEvento(iso: string | null): string | null {
  if (!iso) return null;
  return format(new Date(iso), "dd/MM 'às' HH'h'", { locale: ptBR });
}

/** Primeiro + segundo nome significativo — regra canônica de listas (nomeExibicao.mjs):
 *  conectivos ("de", "da"...) não contam, senão "Willian De Andrade" virava "Willian De" */
function nomeCurto(nome: string | null): string {
  if (!nome) return 'Sem produtor';
  return abreviarNome(nome, 2);
}

interface ListaBandasTabProps {
  unidadeAtual: string;
}

export function ListaBandasTab({ unidadeAtual }: ListaBandasTabProps) {
  const [filtroStatus, setFiltroStatus] = useState<string>('ativa');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [bandaDetalheId, setBandaDetalheId] = useState<number | null>(null);
  const [bandaEditando, setBandaEditando] = useState<BandaResumo | null>(null);
  const [bandaStatusConfirm, setBandaStatusConfirm] = useState<BandaResumo | null>(null);
  const [processandoStatus, setProcessandoStatus] = useState(false);
  const [modalNovaBanda, setModalNovaBanda] = useState(false);
  const [bandaExcluindo, setBandaExcluindo] = useState<BandaResumo | null>(null);
  const [processandoExclusao, setProcessandoExclusao] = useState(false);

  // Estado de visualização (com persistência no localStorage) — mesmo padrão de Professores
  const [visualizacao, setVisualizacao] = useState<'cards' | 'tabela'>(() => {
    const saved = localStorage.getItem('bandas_visualizacao');
    return (saved === 'tabela' || saved === 'cards') ? saved : 'cards';
  });

  useEffect(() => {
    localStorage.setItem('bandas_visualizacao', visualizacao);
  }, [visualizacao]);

  const { bandas, loading, recarregar } = useBandasListar(
    unidadeAtual,
    filtroStatus === 'todas' ? null : (filtroStatus as BandaStatus),
  );

  const bandasFiltradas = useMemo(() => {
    if (!busca.trim()) return bandas;
    const termo = busca.trim().toLowerCase();
    return bandas.filter((b) =>
      b.nome.toLowerCase().includes(termo) ||
      b.produtor_nome?.toLowerCase().includes(termo) ||
      b.curso_nome?.toLowerCase().includes(termo),
    );
  }, [bandas, busca]);

  const itensPorPagina = 24;
  const bandasPagina = bandasFiltradas.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina);
  // Coluna Unidade só faz sentido no Consolidado — para usuário de unidade é redundante
  const mostrarUnidade = unidadeAtual === 'todos';

  async function confirmarMudancaStatus() {
    if (!bandaStatusConfirm) return;
    const novoStatus: BandaStatus = bandaStatusConfirm.status === 'ativa' ? 'inativa' : 'ativa';
    setProcessandoStatus(true);
    const { error } = await definirStatusBanda(bandaStatusConfirm.banda_id, novoStatus);
    setProcessandoStatus(false);
    if (error) {
      toast.error('Erro ao alterar status', { description: error.message });
      return;
    }
    toast.success(novoStatus === 'inativa' ? 'Banda arquivada' : 'Banda reativada', {
      description: bandaStatusConfirm.nome,
    });
    setBandaStatusConfirm(null);
    recarregar();
  }

  async function confirmarExclusaoBanda() {
    if (!bandaExcluindo) return;
    setProcessandoExclusao(true);
    const { error } = await removerBanda(bandaExcluindo.banda_id);
    setProcessandoExclusao(false);
    if (error) {
      toast.error('Erro ao excluir banda', { description: error.message });
      return;
    }
    toast.success('Banda excluída', { description: bandaExcluindo.nome });
    setBandaExcluindo(null);
    recarregar();
  }

  return (
    <div className="space-y-4">
      {/* Filtros locais */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por banda, produtor ou projeto..."
            className="pl-9"
          />
        </div>
        <Select value={filtroStatus} onValueChange={(v) => { setFiltroStatus(v); setPagina(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativa">Ativas</SelectItem>
            <SelectItem value="inativa">Arquivadas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>

        {/* Toggle Tabela/Cards — mesmo padrão de Professores */}
        <div className="flex items-center gap-1 bg-slate-700/30 rounded-lg p-1 self-start sm:self-auto">
          <Tooltip content="Visualização em cards" side="top">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${visualizacao === 'cards' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
              onClick={() => setVisualizacao('cards')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Visualização em tabela" side="top">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${visualizacao === 'tabela' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
              onClick={() => setVisualizacao('tabela')}
            >
              <Table className="w-4 h-4" />
            </Button>
          </Tooltip>
        </div>

        <Button onClick={() => setModalNovaBanda(true)} className="sm:ml-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nova Banda
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">Carregando bandas...</div>
      ) : bandasFiltradas.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-10 text-center">
          <Guitar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Nenhuma banda encontrada</p>
          <p className="text-slate-500 text-sm mt-1">
            {busca
              ? 'Tente ajustar a busca.'
              : 'As bandas são criadas automaticamente a partir das turmas de Power Kids, Minha Banda e GarageBand.'}
          </p>
        </div>
      ) : visualizacao === 'tabela' ? (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Banda</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Projeto</th>
                  {mostrarUnidade && (
                    <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Unidade</th>
                  )}
                  <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Produtor</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Dia · Horário</th>
                  <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Integrantes</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Próximo evento</th>
                  <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {bandasPagina.map((banda) => {
                  const proximoEvento = formatarProximoEvento(banda.proximo_evento);
                  return (
                    <tr
                      key={banda.banda_id}
                      className={cn(
                        'hover:bg-slate-700/30 transition-colors cursor-pointer',
                        banda.status === 'inativa' && 'opacity-60',
                      )}
                      onClick={() => setBandaDetalheId(banda.banda_id)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white">{banda.nome}</span>
                          {banda.tipo === 'avulsa' ? (
                            <Badge variant="default" className="flex-shrink-0">Avulsa</Badge>
                          ) : (
                            <Badge variant="secondary" className="flex-shrink-0">Turma</Badge>
                          )}
                          {banda.precisa_revisar_nome && banda.status === 'ativa' && (
                            <Badge variant="warning" className="flex-shrink-0 gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Revisar nome
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-300">{banda.curso_nome || '—'}</td>
                      {mostrarUnidade && (
                        <td className="p-4 text-sm text-slate-300">{banda.unidade_nome || '—'}</td>
                      )}
                      <td className="p-4 text-sm text-slate-300" title={banda.produtor_nome || undefined}>
                        {nomeCurto(banda.produtor_nome)}
                      </td>
                      <td className="p-4 text-sm text-slate-300 whitespace-nowrap">
                        {banda.dia_semana || '—'} · {formatarHorario(banda.horario)}
                      </td>
                      <td className="p-4 text-center text-sm text-slate-300">{banda.integrantes}</td>
                      <td className="p-4 text-sm whitespace-nowrap">
                        {proximoEvento ? (
                          <span className="text-cyan-400">{proximoEvento}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {banda.status === 'inativa' ? (
                          <Badge variant="secondary">Arquivada</Badge>
                        ) : (
                          <Badge variant="success">Ativa</Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Ações da banda ${banda.nome}`}
                              >
                                <MoreVertical className="w-4 h-4 text-slate-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => setBandaEditando(banda)}
                              >
                                <Pencil className="w-3.5 h-3.5 mr-2" />
                                Identidade
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => setBandaStatusConfirm(banda)}
                              >
                                {banda.status === 'ativa' ? (
                                  <><Archive className="w-3.5 h-3.5 mr-2" />Arquivar</>
                                ) : (
                                  <><ArchiveRestore className="w-3.5 h-3.5 mr-2" />Reativar</>
                                )}
                              </DropdownMenuItem>
                              {banda.tipo === 'avulsa' && (
                                <DropdownMenuItem
                                  className="cursor-pointer text-rose-400 hover:text-rose-300"
                                  onClick={() => setBandaExcluindo(banda)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginacao
            paginaAtual={pagina}
            totalItens={bandasFiltradas.length}
            onMudarPagina={setPagina}
            itensPorPagina={itensPorPagina}
            rotuloItens="bandas"
          />
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {bandasPagina.map((banda) => {
              const proximoEvento = formatarProximoEvento(banda.proximo_evento);
              return (
                <div
                  key={banda.banda_id}
                  onClick={() => setBandaDetalheId(banda.banda_id)}
                  className={cn(
                    'group bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 cursor-pointer transition-all',
                    'hover:border-violet-500/50 hover:bg-slate-900',
                    banda.status === 'inativa' && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white truncate" title={banda.nome}>
                          {banda.nome}
                        </p>
                        {banda.tipo === 'avulsa' && (
                          <Badge variant="default" className="flex-shrink-0">Avulsa</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {banda.curso_nome || 'Banda avulsa'} · {banda.unidade_nome}
                      </p>
                    </div>
                    {banda.precisa_revisar_nome && banda.status === 'ativa' && (
                      <Badge variant="warning" className="flex-shrink-0 gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Revisar nome
                      </Badge>
                    )}
                    {banda.status === 'inativa' && (
                      <Badge variant="secondary" className="flex-shrink-0">Arquivada</Badge>
                    )}
                  </div>

                  <div className="space-y-1.5 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="truncate">{banda.produtor_nome || 'Sem produtor'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span>{banda.dia_semana || '—'} · {formatarHorario(banda.horario)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Guitar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span>{banda.integrantes} {banda.integrantes === 1 ? 'integrante' : 'integrantes'}</span>
                    </div>
                    {proximoEvento && (
                      <div className="flex items-center gap-2 text-cyan-400">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Próximo evento: {proximoEvento}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); setBandaEditando(banda); }}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Identidade
                    </Button>
                    {banda.tipo === 'avulsa' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs ml-auto text-rose-400 hover:text-rose-300"
                        onClick={(e) => { e.stopPropagation(); setBandaExcluindo(banda); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Excluir
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn('h-7 text-xs', banda.tipo !== 'avulsa' && 'ml-auto')}
                      onClick={(e) => { e.stopPropagation(); setBandaStatusConfirm(banda); }}
                    >
                      {banda.status === 'ativa' ? (
                        <><Archive className="w-3.5 h-3.5 mr-1" />Arquivar</>
                      ) : (
                        <><ArchiveRestore className="w-3.5 h-3.5 mr-1" />Reativar</>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <Paginacao
            paginaAtual={pagina}
            totalItens={bandasFiltradas.length}
            onMudarPagina={setPagina}
            itensPorPagina={itensPorPagina}
            rotuloItens="bandas"
          />
        </div>
      )}

      {/* Detalhe */}
      <BandaDetalheDialog
        bandaId={bandaDetalheId}
        onClose={() => setBandaDetalheId(null)}
        onAlterado={recarregar}
      />

      {/* Editar identidade */}
      <ModalIdentidadeBanda
        banda={bandaEditando}
        onClose={() => setBandaEditando(null)}
        onSalvo={() => { setBandaEditando(null); recarregar(); }}
      />

      {/* Nova banda avulsa */}
      <ModalBandaAvulsa
        aberto={modalNovaBanda}
        banda={null}
        unidadeAtual={unidadeAtual}
        onClose={() => setModalNovaBanda(false)}
        onSalvo={() => { setModalNovaBanda(false); recarregar(); }}
      />

      {/* Confirmar arquivar/reativar */}
      <ModalConfirmacao
        aberto={!!bandaStatusConfirm}
        onClose={() => setBandaStatusConfirm(null)}
        onConfirmar={confirmarMudancaStatus}
        titulo={bandaStatusConfirm?.status === 'ativa' ? 'Arquivar banda' : 'Reativar banda'}
        mensagem={
          bandaStatusConfirm?.status === 'ativa'
            ? `Arquivar "${bandaStatusConfirm?.nome}"? Ela sai da lista ativa, mas o histórico é mantido.`
            : `Reativar "${bandaStatusConfirm?.nome}"? Ela volta para a lista de bandas ativas.`
        }
        tipo={bandaStatusConfirm?.status === 'ativa' ? 'warning' : 'success'}
        textoConfirmar={bandaStatusConfirm?.status === 'ativa' ? 'Arquivar' : 'Reativar'}
        carregando={processandoStatus}
      />

      {/* Confirmar exclusão (só banda avulsa) */}
      <ModalConfirmacao
        aberto={!!bandaExcluindo}
        onClose={() => setBandaExcluindo(null)}
        onConfirmar={confirmarExclusaoBanda}
        titulo="Excluir banda"
        mensagem={`Excluir "${bandaExcluindo?.nome}" de vez? Integrantes, repertório e vínculos com eventos serão apagados. Esta ação não pode ser desfeita.`}
        tipo="danger"
        textoConfirmar="Excluir de vez"
        carregando={processandoExclusao}
      />
    </div>
  );
}
