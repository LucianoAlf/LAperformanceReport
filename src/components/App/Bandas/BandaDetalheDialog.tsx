import { useState } from 'react';
import { toast } from 'sonner';
import {
  Guitar, Users, Music2, Calendar, Pencil, Phone, ExternalLink, Plus, Trash2, Clock,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import {
  useBandaDetalhe, removerRepertorio, atualizarRepertorio, removerIntegranteBanda,
  REPERTORIO_STATUS,
  type BandaResumo, type IntegranteBanda, type RepertorioItem, type RepertorioStatus,
} from '@/hooks/useBandas';
import { ModalIntegranteBanda } from './ModalIntegranteBanda';
import { ModalRepertorioBanda } from './ModalRepertorioBanda';
import { ModalIdentidadeBanda } from './ModalIdentidadeBanda';
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
  const [processando, setProcessando] = useState(false);

  function fechar() {
    setIntegranteEditando(null);
    setMusicaEditando(null);
    setEditandoIdentidade(false);
    onClose();
  }

  async function confirmarRemocaoIntegrante() {
    if (!integranteRemovendo || !bandaId) return;
    setProcessando(true);
    const { error } = await removerIntegranteBanda(bandaId, integranteRemovendo.aluno_id);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao remover registro', { description: error.message });
      return;
    }
    toast.success('Registro de integrante removido', { description: integranteRemovendo.nome });
    setIntegranteRemovendo(null);
    recarregar();
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
        curso_id: detalhe.curso_id,
        curso_nome: detalhe.curso_nome,
        dia_semana: detalhe.dia_semana,
        horario: detalhe.horario,
        produtor_nome: detalhe.produtor_nome,
        integrantes: detalhe.integrantes,
        precisa_revisar_nome: detalhe.precisa_revisar_nome,
        status: detalhe.status,
        proximo_evento: null,
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
                    <DialogTitle className="text-xl leading-tight">{detalhe.nome}</DialogTitle>
                    <p className="text-sm text-slate-400 mt-1">
                      {detalhe.curso_nome} · {detalhe.unidade_nome} · {detalhe.dia_semana} {formatarHorario(detalhe.horario)}
                    </p>
                    {detalhe.genero && (
                      <Badge variant="secondary" className="mt-2">{detalhe.genero}</Badge>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditandoIdentidade(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Identidade
                  </Button>
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

              {/* Integrantes */}
              <section>
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Integrantes
                </h3>
                {integrantes.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-800/40 rounded-xl p-4">
                    Nenhum aluno ativo nesta turma de banda no momento.
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
                          {temOverlay && (
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
          <ModalConfirmacao
            aberto={!!integranteRemovendo}
            onClose={() => setIntegranteRemovendo(null)}
            onConfirmar={confirmarRemocaoIntegrante}
            titulo="Remover registro de integrante"
            mensagem={`Remover o registro de "${integranteRemovendo?.nome}" desta banda? O aluno continua na turma — isso só limpa instrumento/função gravados.`}
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
