import { useState } from 'react';
import { toast } from 'sonner';
import {
  Guitar, Users, Music2, Calendar, Pencil, Phone, ExternalLink, Plus, Trash2, Clock,
  Repeat, DoorOpen, UserPlus,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import {
  useBandaDetalhe, removerRepertorio, atualizarRepertorio, removerIntegranteBanda,
  desativarIntegranteBanda, upsertIntegranteBanda, removerBanda,
  REPERTORIO_STATUS,
  type BandaResumo, type IntegranteBanda, type RepertorioItem, type RepertorioStatus,
  type FrequenciaBanda, type AlunoBanda,
} from '@/hooks/useBandas';
import { ModalIntegranteBanda } from './ModalIntegranteBanda';
import { ModalRepertorioBanda } from './ModalRepertorioBanda';
import { ModalIdentidadeBanda } from './ModalIdentidadeBanda';
import { ModalBandaAvulsa, FREQUENCIA_LABEL, MODELO_FINANCEIRO_LABEL } from './ModalBandaAvulsa';
import { AutocompleteAlunoBanda } from './AutocompleteAlunoBanda';
import { formatCurrency } from '@/lib/utils';
import { iniciaisDoNome } from '@/lib/agenda';

const STATUS_REP_LABEL: Record<RepertorioStatus, string> = {
  ensaiando: 'Ensaiando',
  pronta: 'Pronta',
  tocada: 'Já tocada',
};

const STATUS_REP_VARIANT: Record<RepertorioStatus, 'warning' | 'success' | 'secondary'> = {
  ensaiando: 'warning',
  pronta: 'success',
  tocada: 'secondary',
};

function formatarHorario(horario: string | null): string {
  if (!horario) return '—';
  const [h, m] = horario.split(':');
  return `${h}h${m && m !== '00' ? m : ''}`;
}

interface BandaDetalheDialogProps {
  bandaId: number | null;
  onClose: () => void;
  onAlterado: () => void;
}

export function BandaDetalheDialog({ bandaId, onClose, onAlterado }: BandaDetalheDialogProps) {
  const { detalhe, integrantes, repertorio, loading, recarregar } = useBandaDetalhe(bandaId);
  const [integranteEditando, setIntegranteEditando] = useState<IntegranteBanda | null>(null);
  const [integranteRemovendo, setIntegranteRemovendo] = useState<IntegranteBanda | null>(null);
  const [modalRepertorioAberto, setModalRepertorioAberto] = useState(false);
  const [musicaEditando, setMusicaEditando] = useState<RepertorioItem | null>(null);
  const [musicaRemovendo, setMusicaRemovendo] = useState<RepertorioItem | null>(null);
  const [editandoIdentidade, setEditandoIdentidade] = useState(false);
  const [editandoBanda, setEditandoBanda] = useState(false);
  const [processando, setProcessando] = useState(false);

  // Adicionar integrante (só banda avulsa — roster manual)
  const [buscaAluno, setBuscaAluno] = useState('');
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoBanda | null>(null);
  const [novoInstrumento, setNovoInstrumento] = useState('');
  const [novaFuncao, setNovaFuncao] = useState('');
  const [excluindoBanda, setExcluindoBanda] = useState(false);

  const isAvulsa = detalhe?.tipo === 'avulsa';

  function fechar() {
    setIntegranteEditando(null);
    setMusicaEditando(null);
    setEditandoIdentidade(false);
    setEditandoBanda(false);
    setBuscaAluno('');
    setAlunoSelecionado(null);
    setNovoInstrumento('');
    setNovaFuncao('');
    onClose();
  }

  async function adicionarIntegrante() {
    if (!bandaId || !alunoSelecionado) {
      toast.error('Escolha um aluno da lista para adicionar.');
      return;
    }
    if (integrantes.some((i) => i.aluno_id === alunoSelecionado.aluno_id)) {
      toast.error('Este aluno já está na banda.');
      return;
    }
    setProcessando(true);
    const { error } = await upsertIntegranteBanda({
      bandaId,
      alunoId: alunoSelecionado.aluno_id,
      instrumento: novoInstrumento.trim() || null,
      funcao: novaFuncao.trim() || null,
    });
    setProcessando(false);
    if (error) {
      toast.error('Erro ao adicionar integrante', { description: error.message });
      return;
    }
    toast.success('Integrante adicionado', { description: alunoSelecionado.nome });
    setBuscaAluno('');
    setAlunoSelecionado(null);
    setNovoInstrumento('');
    setNovaFuncao('');
    recarregar();
    onAlterado();
  }

  async function confirmarExclusaoBanda() {
    if (!bandaId) return;
    setProcessando(true);
    const { error } = await removerBanda(bandaId);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao excluir banda', { description: error.message });
      return;
    }
    toast.success('Banda excluída', { description: detalhe?.nome });
    setExcluindoBanda(false);
    fechar();
    onAlterado();
  }

  async function confirmarRemocaoIntegrante() {
    if (!integranteRemovendo || !bandaId) return;
    setProcessando(true);
    // Avulsa: desativar mantém histórico (o aluno faz parte do roster de fato).
    // Turma: o registro é só overlay (instrumento/função) — remover apaga o overlay.
    const { error } = isAvulsa
      ? await desativarIntegranteBanda(bandaId, integranteRemovendo.aluno_id)
      : await removerIntegranteBanda(bandaId, integranteRemovendo.aluno_id);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao remover integrante', { description: error.message });
      return;
    }
    toast.success(isAvulsa ? 'Integrante removido da banda' : 'Registro de integrante removido', {
      description: integranteRemovendo.nome,
    });
    setIntegranteRemovendo(null);
    recarregar();
    onAlterado();
  }

  async function confirmarRemocaoMusica() {
    if (!musicaRemovendo) return;
    setProcessando(true);
    const { error } = await removerRepertorio(musicaRemovendo.id);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao remover música', { description: error.message });
      return;
    }
    toast.success('Música removida', { description: musicaRemovendo.titulo });
    setMusicaRemovendo(null);
    recarregar();
    onAlterado();
  }

  async function mudarStatusMusica(musica: RepertorioItem, status: RepertorioStatus) {
    const { error } = await atualizarRepertorio({ id: musica.id, status });
    if (error) {
      toast.error('Erro ao atualizar status', { description: error.message });
      return;
    }
    recarregar();
  }

  // BandaResumo mínimo para o modal de identidade (que também é usado na lista)
  const bandaResumo: BandaResumo | null = detalhe
    ? {
        banda_id: detalhe.banda_id,
        nome: detalhe.nome,
        unidade_id: detalhe.unidade_id,
        unidade_nome: detalhe.unidade_nome,
        curso_id: detalhe.curso_id ?? 0,
        curso_nome: detalhe.curso_nome,
        dia_semana: detalhe.dia_semana,
        horario: detalhe.horario,
        produtor_nome: detalhe.produtor_nome,
        integrantes: detalhe.integrantes,
        precisa_revisar_nome: detalhe.precisa_revisar_nome,
        status: detalhe.status,
        proximo_evento: null,
        tipo: detalhe.tipo,
      }
    : null;

  return (
    <>
      <Dialog open={!!bandaId} onOpenChange={() => fechar()}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          {loading || !detalhe ? (
            <div className="py-16 text-center text-slate-400">Carregando banda...</div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  {detalhe.logo_url ? (
                    <img
                      src={detalhe.logo_url}
                      alt={`Logo da banda ${detalhe.nome}`}
                      className="w-14 h-14 rounded-xl object-cover border border-slate-700"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <Guitar className="w-7 h-7 text-white" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <DialogTitle className="text-xl leading-tight">{detalhe.nome}</DialogTitle>
                      {detalhe.tipo === 'avulsa' ? (
                        <Badge variant="default">Avulsa</Badge>
                      ) : (
                        <Badge variant="secondary">Turma</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                      {detalhe.curso_nome ? `${detalhe.curso_nome} · ` : ''}{detalhe.unidade_nome}
                      {detalhe.dia_semana && ` · ${detalhe.dia_semana} ${formatarHorario(detalhe.horario)}`}
                      {detalhe.horario_fim && ` – ${formatarHorario(detalhe.horario_fim)}`}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {detalhe.genero && (
                        <Badge variant="secondary">{detalhe.genero}</Badge>
                      )}
                      {detalhe.frequencia && (
                        <Badge variant="outline" className="gap-1">
                          <Repeat className="w-3 h-3" />
                          {FREQUENCIA_LABEL[detalhe.frequencia as FrequenciaBanda] || detalhe.frequencia}
                        </Badge>
                      )}
                      {detalhe.sala_nome && (
                        <Badge variant="outline" className="gap-1">
                          <DoorOpen className="w-3 h-3" />
                          {detalhe.sala_nome}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAvulsa && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setEditandoBanda(true)}>
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Editar banda
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => setExcluindoBanda(true)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Excluir
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setEditandoIdentidade(true)}>
                      <Guitar className="w-3.5 h-3.5 mr-1" />
                      Identidade
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              {detalhe.descricao && (
                <p className="text-sm text-slate-300 border-l-2 border-violet-500/50 pl-3">
                  {detalhe.descricao}
                </p>
              )}

              {/* Resumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                  <Users className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-white">{detalhe.integrantes}</p>
                  <p className="text-xs text-slate-400">integrantes</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                  <Music2 className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-white">{detalhe.musicas}</p>
                  <p className="text-xs text-slate-400">músicas</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                  <Calendar className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-white">{detalhe.proximos_eventos}</p>
                  <p className="text-xs text-slate-400">próximos eventos</p>
                </div>
              </div>

              <p className="text-sm text-slate-400">
                Produtor: <span className="text-slate-200">{detalhe.produtor_nome || '—'}</span>
              </p>

              {detalhe.modelo_financeiro && (
                <p className="text-sm text-slate-400">
                  Financeiro:{' '}
                  <span className="text-slate-200">
                    {MODELO_FINANCEIRO_LABEL[detalhe.modelo_financeiro]}
                    {detalhe.valor_mensal_aluno != null && ` · ${formatCurrency(Number(detalhe.valor_mensal_aluno))}/aluno`}
                    {detalhe.valor_repasse != null &&
                      ` · repasse ${detalhe.modelo_financeiro === 'percentual'
                        ? `${Number(detalhe.valor_repasse)}%`
                        : formatCurrency(Number(detalhe.valor_repasse))}`}
                  </span>
                </p>
              )}

              {/* Integrantes */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    Integrantes
                  </h3>
                  {isAvulsa && (
                    <span className="text-xs text-slate-500">Roster manual — adicione e remova à vontade</span>
                  )}
                </div>

                {isAvulsa && (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_110px_auto] gap-2 items-end mb-3 bg-slate-800/30 border border-slate-700/40 rounded-xl p-3">
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">Aluno</span>
                      <AutocompleteAlunoBanda
                        value={buscaAluno}
                        onChange={(nomeAluno, aluno) => {
                          setBuscaAluno(nomeAluno);
                          setAlunoSelecionado(aluno || null);
                        }}
                        unidadeId={detalhe.unidade_id}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">Instrumento</span>
                      <Input
                        value={novoInstrumento}
                        onChange={(e) => setNovoInstrumento(e.target.value)}
                        placeholder="Ex.: Guitarra"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">Função</span>
                      <Input
                        value={novaFuncao}
                        onChange={(e) => setNovaFuncao(e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={adicionarIntegrante} disabled={processando}>
                      <UserPlus className="w-4 h-4 mr-1" />
                      Adicionar
                    </Button>
                  </div>
                )}

                {integrantes.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-800/40 rounded-xl p-4">
                    {isAvulsa
                      ? 'Nenhum integrante ainda — adicione o primeiro acima.'
                      : 'Nenhum aluno ativo nesta turma de banda no momento.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {integrantes.map((int) => {
                      const temOverlay = int.instrumento !== null || int.funcao !== null;
                      return (
                        <div
                          key={int.aluno_id}
                          className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2"
                        >
                          {int.foto_url ? (
                            <img
                              src={int.foto_url}
                              alt={int.nome}
                              className="h-10 w-10 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-sm font-bold text-white"
                              aria-hidden="true"
                            >
                              {iniciaisDoNome(int.nome)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{int.nome}</p>
                            <p className="text-xs text-slate-400">
                              {int.instrumento || 'Instrumento não definido'}
                              {int.funcao ? ` · ${int.funcao}` : ''}
                              {int.tempo_permanencia_meses != null && int.tempo_permanencia_meses > 0 && int.tempo_permanencia_meses < 99
                                ? ` · ${int.tempo_permanencia_meses} ${int.tempo_permanencia_meses === 1 ? 'mês' : 'meses'} de escola`
                                : ''}
                            </p>
                            {(int.responsavel_nome || int.responsavel_telefone || int.whatsapp) && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />
                                {int.responsavel_nome || 'Responsável'}
                                {(int.responsavel_telefone || int.whatsapp) && ` · ${int.responsavel_telefone || int.whatsapp}`}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setIntegranteEditando(int)}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            {temOverlay ? 'Editar' : 'Definir'}
                          </Button>
                          {(isAvulsa || temOverlay) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-rose-400 hover:text-rose-300"
                              onClick={() => setIntegranteRemovendo(int)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Repertório */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Music2 className="w-4 h-4 text-violet-400" />
                    Repertório
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setMusicaEditando(null); setModalRepertorioAberto(true); }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Adicionar música
                  </Button>
                </div>
                {repertorio.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-800/40 rounded-xl p-4">
                    Nenhuma música no repertório ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {repertorio.map((musica) => (
                      <div
                        key={musica.id}
                        className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">
                            {musica.titulo}
                            {musica.artista && <span className="text-slate-400 font-normal"> · {musica.artista}</span>}
                          </p>
                          <p className="text-xs text-slate-500 flex items-center gap-2">
                            {musica.tom && <span>Tom: {musica.tom}</span>}
                            {musica.bpm && <span>{musica.bpm} bpm</span>}
                            {musica.duracao_min && (
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />{musica.duracao_min}min
                              </span>
                            )}
                          </p>
                        </div>
                        {musica.cifraclub_url && (
                          <a
                            href={musica.cifraclub_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-cyan-400 transition-colors"
                            title="Abrir no Cifra Club"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <Select
                          value={musica.status}
                          onValueChange={(v) => mudarStatusMusica(musica, v as RepertorioStatus)}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[130]">
                            {REPERTORIO_STATUS.map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_REP_LABEL[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Badge variant={STATUS_REP_VARIANT[musica.status]} className="hidden sm:inline-flex">
                          {STATUS_REP_LABEL[musica.status]}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { setMusicaEditando(musica); setModalRepertorioAberto(true); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-rose-400 hover:text-rose-300"
                          onClick={() => setMusicaRemovendo(musica)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Sub-modais (z acima do detalhe) */}
      {bandaId && (
        <>
          <ModalIntegranteBanda
            bandaId={bandaId}
            integrante={integranteEditando}
            onClose={() => setIntegranteEditando(null)}
            onSalvo={() => { setIntegranteEditando(null); recarregar(); }}
          />
          <ModalRepertorioBanda
            bandaId={bandaId}
            musica={musicaEditando}
            aberto={modalRepertorioAberto}
            onClose={() => setModalRepertorioAberto(false)}
            onSalvo={() => { setModalRepertorioAberto(false); recarregar(); onAlterado(); }}
          />
          <ModalIdentidadeBanda
            banda={editandoIdentidade ? bandaResumo : null}
            inicial={detalhe ? { genero: detalhe.genero, descricao: detalhe.descricao, logo_url: detalhe.logo_url } : null}
            onClose={() => setEditandoIdentidade(false)}
            onSalvo={() => { setEditandoIdentidade(false); recarregar(); onAlterado(); }}
          />
          <ModalBandaAvulsa
            aberto={editandoBanda}
            banda={detalhe}
            unidadeAtual={detalhe.unidade_id}
            onClose={() => setEditandoBanda(false)}
            onSalvo={() => { setEditandoBanda(false); recarregar(); onAlterado(); }}
          />
          <ModalConfirmacao
            aberto={excluindoBanda}
            onClose={() => setExcluindoBanda(false)}
            onConfirmar={confirmarExclusaoBanda}
            titulo="Excluir banda"
            mensagem={`Excluir "${detalhe.nome}" de vez? Integrantes, repertório e vínculos com eventos serão apagados. Esta ação não pode ser desfeita — prefira arquivar se quiser manter o histórico.`}
            tipo="danger"
            textoConfirmar="Excluir de vez"
            carregando={processando}
          />
          <ModalConfirmacao
            aberto={!!integranteRemovendo}
            onClose={() => setIntegranteRemovendo(null)}
            onConfirmar={confirmarRemocaoIntegrante}
            titulo={isAvulsa ? 'Remover integrante da banda' : 'Remover registro de integrante'}
            mensagem={
              isAvulsa
                ? `Remover "${integranteRemovendo?.nome}" desta banda? O histórico de participação é mantido.`
                : `Remover o registro de "${integranteRemovendo?.nome}" desta banda? O aluno continua na turma — isso só limpa instrumento/função gravados.`
            }
            tipo="danger"
            textoConfirmar="Remover"
            carregando={processando}
          />
          <ModalConfirmacao
            aberto={!!musicaRemovendo}
            onClose={() => setMusicaRemovendo(null)}
            onConfirmar={confirmarRemocaoMusica}
            titulo="Remover música"
            mensagem={`Remover "${musicaRemovendo?.titulo}" do repertório? Esta ação não pode ser desfeita.`}
            tipo="danger"
            textoConfirmar="Remover"
            carregando={processando}
          />
        </>
      )}
    </>
  );
}
