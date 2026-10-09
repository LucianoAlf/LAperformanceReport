import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, Check, CheckCheck, Loader2, MessageCircle, PencilLine, RotateCcw, Send } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { calcularHorariosDaGrade } from '@/lib/eventos';
import {
  CAMPOS_DO_CONVITE,
  CONVITE_PADRAO,
  camposSemValor,
  montarConvite,
  telefoneLegivel,
  type BlocoDoConvite,
} from '@/lib/eventoConvite';
import {
  atualizarEvento,
  consultarDestinosConvite,
  enviarConvite,
  useGradeDoEvento,
  type AlunoElegivel,
  type DestinoConvite,
  type Evento,
  type RespostaConvite,
} from '@/hooks/useEventos';
import { BotaoComMola, MOLA_CURTA } from './ControlesComMovimento';

/** O que cada recusa da edge quer dizer para quem está na tela. */
const MOTIVOS: Record<string, string> = {
  fora_do_escopo: 'Este aluno não é da sua unidade.',
  nao_confirmado: 'O aluno ainda não está confirmado no recital.',
  sem_telefone: 'Não há telefone de WhatsApp no cadastro do responsável nem do aluno.',
  sem_caixa_da_unidade: 'A unidade deste recital não tem caixa de secretaria configurada.',
  chatwoot_sem_credencial: 'O envio está sem credencial do Chatwoot. Avise o suporte.',
  campo_nao_preenchido: 'Ainda há campo sem valor no texto (ex.: {data}).',
  texto_vazio: 'O texto do convite está vazio.',
  texto_longo: 'O texto passou de 4.000 caracteres.',
  ja_enviado: 'Este convite já foi enviado.',
  ja_enviando: 'Já existe um envio deste convite em andamento.',
  falha_na_entrega: 'O WhatsApp recusou a entrega.',
  falha_no_envio: 'Não consegui enviar pelo Chatwoot.',
  falha_de_rede: 'Sem resposta do servidor. Confira a internet e tente de novo.',
  erro_registro: 'Não consegui registrar o envio. Nada foi mandado.',
  erro_leitura: 'Não consegui ler o cadastro do aluno.',
};

const fmtQuando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  });

type Fase = 'pronto' | 'enviando' | 'enviado' | 'erro';

/**
 * Convite do recital por WhatsApp (item 10 da reunião de 08/10/2026).
 *
 * A pessoa vê o convite montado e só ele sai, quando ela clica em Enviar, pela caixa da
 * secretaria da unidade no Chatwoot. O número sai do cadastro (responsável, senão aluno);
 * a tela só escolhe entre os que a edge devolveu. O texto do modelo é do RECITAL (cada
 * unidade tem data, local e regras próprias) e se edita aqui mesmo.
 */
export function ModalConviteRecital({
  aberto,
  evento,
  aluno,
  onFechar,
  onEnviado,
  onTextoSalvo,
}: {
  aberto: boolean;
  evento: Evento;
  aluno: AlunoElegivel | null;
  onFechar: () => void;
  onEnviado: () => void;
  onTextoSalvo: (texto: string | null) => void;
}) {
  const reduzir = useReducedMotion();
  const { blocos: grade, loading: carregandoGrade } = useGradeDoEvento(aberto ? evento.id : null);

  const [destinos, setDestinos] = useState<DestinoConvite[] | null>(null);
  const [ultimo, setUltimo] = useState<RespostaConvite['ultimo']>(null);
  const [erroDestinos, setErroDestinos] = useState<string | null>(null);
  const [destinoTipo, setDestinoTipo] = useState<DestinoConvite['tipo']>('responsavel');
  const [fase, setFase] = useState<Fase>('pronto');
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [confirmarReenvio, setConfirmarReenvio] = useState(false);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(evento.convite_texto ?? CONVITE_PADRAO);
  const [salvando, setSalvando] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const modelo = evento.convite_texto ?? CONVITE_PADRAO;

  useEffect(() => {
    if (!aberto || !aluno) return;
    setDestinos(null);
    setUltimo(null);
    setErroDestinos(null);
    setFase('pronto');
    setErroEnvio(null);
    setConfirmarReenvio(false);
    setEditando(false);
    setRascunho(evento.convite_texto ?? CONVITE_PADRAO);
    let vivo = true;
    void consultarDestinosConvite(evento.id, aluno.pessoa_chave).then((r) => {
      if (!vivo) return;
      if (!r.ok) {
        setErroDestinos(MOTIVOS[r.motivo ?? ''] ?? r.erro ?? 'Não consegui ler o destino.');
        setDestinos([]);
        return;
      }
      setDestinos(r.destinos ?? []);
      setUltimo(r.ultimo ?? null);
      setDestinoTipo(r.destinos?.[0]?.tipo ?? 'responsavel');
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, aluno?.pessoa_chave, evento.id]);

  // Blocos da pessoa com data e horário efetivos (o horário é calculado, nunca gravado).
  const blocosDoAluno = useMemo<BlocoDoConvite[]>(() => {
    if (!aluno || !grade.length) return [];
    const horarios = calcularHorariosDaGrade(
      {
        data_evento: evento.data_evento,
        horario_inicio: evento.horario_inicio,
        duracao_padrao_segundos: evento.duracao_padrao_segundos,
        intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
      },
      grade.map((b) => ({
        id: b.id,
        nome: b.nome,
        ordem: b.ordem,
        data: b.data,
        horario_inicial: b.horario_inicial,
        inicio_manual: b.inicio_manual,
        apresentacoes: b.apresentacoes.map((a) => ({
          id: a.id,
          ordem: a.ordem,
          duracao_segundos: a.duracao_segundos,
          grupo_id: a.grupo_id,
        })),
      })),
    );
    const ids = [...new Set(aluno.alocacoes.map((x) => x.bloco_id))];
    return grade
      .filter((b) => ids.includes(b.id))
      .sort((a, b) => a.ordem - b.ordem)
      .map((b) => {
        const h = horarios.find((x) => x.blocoId === b.id);
        return { nome: b.nome, data: h?.data ?? null, inicio: h?.inicio ?? null };
      });
  }, [aluno, grade, evento]);

  const destino = destinos?.find((d) => d.tipo === destinoTipo) ?? destinos?.[0] ?? null;
  const dados = {
    destinatario: destino?.nome ?? '',
    aluno: aluno?.nome ?? '',
    blocos: blocosDoAluno,
  };
  const texto = montarConvite(editando ? rascunho : modelo, dados);
  const faltam = destino ? camposSemValor(dados) : [];
  const jaEnviado = ultimo?.status === 'enviado';

  const bloqueio =
    !aluno ? 'Escolha um aluno.'
      : aluno.status !== 'participa' ? MOTIVOS.nao_confirmado
        : carregandoGrade || destinos === null ? null
          : erroDestinos ?? (!destino ? MOTIVOS.sem_telefone
            : !blocosDoAluno.length ? 'O aluno ainda não está em nenhum bloco.'
              : faltam.length ? `Falta valor para ${faltam.join(', ')}: confira data e horário do bloco.`
                : editando ? 'Salve ou descarte a edição do texto antes de enviar.' : null);

  async function enviar() {
    if (!aluno || !destino || bloqueio) return;
    if (jaEnviado && !confirmarReenvio) {
      setConfirmarReenvio(true);
      return;
    }
    setFase('enviando');
    setErroEnvio(null);
    const r = await enviarConvite({
      eventoId: evento.id,
      pessoaChave: aluno.pessoa_chave,
      texto,
      destinoTipo: destino.tipo,
      reenviar: jaEnviado,
    });
    setConfirmarReenvio(false);
    if (r.ok) {
      setFase('enviado');
      setUltimo({ status: 'enviado', enviado_em: new Date().toISOString(), destino_nome: destino.nome });
      toast.success(`Convite enviado para ${destino.nome}`);
      onEnviado();
      return;
    }
    const msg = MOTIVOS[r.motivo ?? ''] ?? 'Não foi possível enviar.';
    const detalhe = r.erro ? ` (${r.erro})` : '';
    setFase('erro');
    setErroEnvio(msg + detalhe);
    toast.error(msg);
    onEnviado();
  }

  async function salvarTexto(valor: string | null) {
    setSalvando(true);
    const { error } = await atualizarEvento(evento.id, { convite_texto: valor });
    setSalvando(false);
    if (error) {
      toast.error(`Não salvei o texto: ${error.message}`);
      return;
    }
    toast.success(valor === null ? 'Texto voltou ao padrão' : 'Texto do convite salvo para este recital');
    onTextoSalvo(valor);
    setEditando(false);
  }

  function inserirCampo(campo: string) {
    const el = areaRef.current;
    if (!el) return setRascunho((t) => t + campo);
    const ini = el.selectionStart ?? rascunho.length;
    const fim = el.selectionEnd ?? ini;
    const novo = rascunho.slice(0, ini) + campo + rascunho.slice(fim);
    setRascunho(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + campo.length, ini + campo.length);
    });
  }

  if (!aluno) return null;

  const rotuloBotao =
    fase === 'enviando' ? 'Enviando…'
      : fase === 'enviado' ? 'Enviado'
        : fase === 'erro' ? 'Tentar de novo'
          : confirmarReenvio ? 'Confirmar reenvio'
            : jaEnviado ? 'Reenviar convite' : 'Enviar convite';

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fase !== 'enviando' && onFechar()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-0 border-b border-slate-800 px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-3 pr-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-[16px] text-white">Convite de {aluno.nome}</DialogTitle>
              <DialogDescription className="text-[12.5px]">
                Sai pelo WhatsApp da secretaria da unidade, só quando você clicar em enviar.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Para quem vai */}
          <div>
            <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Para</p>
            {destinos === null ? (
              <div className="h-12 animate-pulse rounded-xl bg-slate-800/60" />
            ) : destinos.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[12.5px] text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {erroDestinos ?? MOTIVOS.sem_telefone}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {destinos.map((d) => {
                  const ativo = d.tipo === destino?.tipo;
                  return (
                    <button
                      key={d.tipo}
                      type="button"
                      onClick={() => setDestinoTipo(d.tipo)}
                      disabled={fase === 'enviando'}
                      aria-pressed={ativo}
                      className={cn(
                        'relative rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60',
                        ativo ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700',
                      )}
                    >
                      <span className="block text-[11px] text-slate-400">
                        {d.tipo === 'responsavel' ? 'Responsável' : 'Aluno'}
                      </span>
                      <span className="block truncate text-[13.5px] font-medium text-white">{d.nome}</span>
                      <span className="block text-[12px] tabular-nums text-slate-400">{telefoneLegivel(d.telefone)}</span>
                      {ativo && (
                        <motion.span
                          layoutId="convite-destino"
                          transition={reduzir ? { duration: 0 } : MOLA_CURTA}
                          className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-slate-950"
                        >
                          <Check className="h-3 w-3" />
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Prévia no formato do WhatsApp */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                {editando ? 'Texto do convite deste recital' : 'Prévia'}
              </p>
              {!editando ? (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  disabled={fase === 'enviando'}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-violet-300 hover:bg-slate-800 hover:text-violet-200"
                >
                  <PencilLine className="h-3.5 w-3.5" /> Editar texto
                </button>
              ) : (
                <span className="text-[11.5px] text-slate-500">vale para todos os convites deste recital</span>
              )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {editando ? (
                <motion.div
                  key="editor"
                  initial={reduzir ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduzir ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-2"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {CAMPOS_DO_CONVITE.map((c) => (
                      <Tooltip key={c.campo} side="top" content={c.descricao}>
                        <button
                          type="button"
                          onClick={() => inserirCampo(c.campo)}
                          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11.5px] text-emerald-300 hover:border-emerald-500/50"
                        >
                          {c.campo}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                  <textarea
                    ref={areaRef}
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    rows={14}
                    className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-[13px] leading-relaxed text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void salvarTexto(null)}
                      disabled={salvando}
                      className="mr-auto inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-slate-200"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Voltar ao padrão
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRascunho(modelo);
                        setEditando(false);
                      }}
                      className="rounded-lg px-3 py-1.5 text-[12.5px] text-slate-300 hover:bg-slate-800"
                    >
                      Descartar
                    </button>
                    <BotaoComMola
                      onClick={() => void salvarTexto(rascunho.trim() === CONVITE_PADRAO.trim() ? null : rascunho)}
                      desabilitado={salvando || !rascunho.trim()}
                      className="bg-violet-600 text-white hover:bg-violet-500"
                    >
                      {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar texto
                    </BotaoComMola>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="previa"
                  initial={reduzir ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduzir ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="rounded-2xl border border-slate-800 bg-[#0b141a] p-3 sm:p-4"
                >
                  <div className="ml-auto max-w-[92%]">
                    <div className="relative rounded-2xl rounded-tr-sm bg-[#005c4b] px-3 pb-5 pt-2 text-[13.5px] leading-relaxed text-[#e9edef] shadow-md">
                      {carregandoGrade || destinos === null ? (
                        <div className="space-y-2 py-1">
                          <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
                          <div className="h-3 w-full animate-pulse rounded bg-white/10" />
                          <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{texto}</p>
                      )}
                      <span className="absolute bottom-1 right-2 flex items-center gap-1 text-[10.5px] text-[#e9edef]/60">
                        agora
                        {fase === 'enviado' ? (
                          <CheckCheck className="h-3.5 w-3.5 text-sky-300" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Rodapé: situação + enviar */}
        <div className="space-y-2 border-t border-slate-800 px-5 py-4">
          <AnimatePresence initial={false}>
            {(bloqueio || erroEnvio || jaEnviado || confirmarReenvio) && (
              <motion.p
                key={erroEnvio ?? bloqueio ?? (confirmarReenvio ? 'confirmar' : 'ja')}
                initial={reduzir ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={reduzir ? undefined : { opacity: 0, height: 0 }}
                className={cn(
                  'text-[12.5px]',
                  erroEnvio ? 'text-rose-300' : bloqueio ? 'text-amber-300/90' : confirmarReenvio ? 'text-amber-200' : 'text-emerald-300/90',
                )}
              >
                {erroEnvio
                  ?? bloqueio
                  ?? (confirmarReenvio
                    ? 'A família vai receber o convite de novo. Clique outra vez para confirmar.'
                    : ultimo
                      ? `Enviado em ${fmtQuando(ultimo.enviado_em)}${ultimo.destino_nome ? ` para ${ultimo.destino_nome}` : ''}.`
                      : null)}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={fase === 'enviando'}
              className="rounded-xl px-4 py-2 text-[13px] text-slate-300 hover:bg-slate-800 disabled:opacity-45"
            >
              Fechar
            </button>
            <BotaoComMola
              onClick={() => void enviar()}
              desabilitado={Boolean(bloqueio) || fase === 'enviando' || fase === 'enviado' || destinos === null}
              className={cn(
                'min-w-[170px] text-white',
                fase === 'enviado' ? 'bg-emerald-600' : fase === 'erro' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500',
              )}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={rotuloBotao}
                  initial={reduzir ? false : { opacity: 0, y: 6, filter: 'blur(2px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={reduzir ? undefined : { opacity: 0, y: -6, filter: 'blur(2px)' }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-2"
                >
                  {fase === 'enviando' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : fase === 'enviado' ? (
                    <CheckCheck className="h-4 w-4" />
                  ) : fase === 'erro' ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {rotuloBotao}
                </motion.span>
              </AnimatePresence>
            </BotaoComMola>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
