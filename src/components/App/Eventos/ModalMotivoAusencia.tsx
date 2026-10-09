import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Plus, Settings2, UserX } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  atualizarMotivoAusencia,
  criarMotivoAusencia,
  marcarNaoVai,
  useMotivosAusencia,
  type AlunoElegivel,
  type MotivoAusencia,
} from '@/hooks/useEventos';
import { BotaoComMola, MOLA_CURTA } from './ControlesComMovimento';

/**
 * "Não vai" com motivo obrigatório (item 11 da reunião de 08/10/2026).
 *
 * Os motivos são da própria equipe da unidade (decisão do Hugo, 09/10): criados, renomeados
 * e desativados aqui mesmo, em "Gerenciar motivos". Não se apaga motivo — o "não vai" já
 * gravado precisa continuar dizendo por quê.
 */
export function ModalMotivoAusencia({
  aberto,
  eventoId,
  unidadeId,
  aluno,
  onFechar,
  onGravado,
}: {
  aberto: boolean;
  eventoId: number;
  unidadeId: string;
  aluno: AlunoElegivel | null;
  onFechar: () => void;
  onGravado: () => void;
}) {
  const reduzir = useReducedMotion();
  const { motivos, erro, recarregar } = useMotivosAusencia(aberto ? unidadeId : null);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [gravando, setGravando] = useState(false);
  const [gerenciando, setGerenciando] = useState(false);

  useEffect(() => {
    if (!aberto || !aluno) return;
    setEscolhido(aluno.motivo_ausencia_id);
    setObs(aluno.motivo_ausencia_obs ?? '');
    setGerenciando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, aluno?.pessoa_chave]);

  // Ativos para escolher; um desativado só aparece se for o motivo já gravado da pessoa.
  const opcoes = useMemo(
    () => motivos.filter((m) => m.ativo || m.id === aluno?.motivo_ausencia_id),
    [motivos, aluno?.motivo_ausencia_id],
  );

  async function confirmar() {
    if (!aluno || !escolhido) return;
    setGravando(true);
    const { data, error } = await marcarNaoVai(eventoId, aluno.aluno_id_referencia, escolhido, obs);
    setGravando(false);
    if (error) {
      toast.error(`Não consegui gravar: ${error.message}`);
      return;
    }
    // RLS filtra em vez de recusar: sem linha de volta, nada foi gravado.
    if (!data?.length) {
      toast.error('Nada foi gravado — este aluno não é da sua unidade.');
      return;
    }
    toast.success(`${aluno.nome}: não vai ao recital`);
    onGravado();
    onFechar();
  }

  if (!aluno) return null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !gravando && onFechar()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="space-y-0 border-b border-slate-800 px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-3 pr-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white">
              {gerenciando ? <Settings2 className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-[16px] text-white">
                {gerenciando ? 'Motivos da unidade' : `Por que ${aluno.nome.split(/\s+/)[0]} não vai?`}
              </DialogTitle>
              <DialogDescription className="text-[12.5px]">
                {gerenciando
                  ? 'Crie, renomeie ou esconda os motivos que a equipe usa.'
                  : 'Escolha o motivo para registrar que o aluno não vai ao recital.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {gerenciando ? (
            <motion.div
              key="gerenciar"
              initial={reduzir ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduzir ? undefined : { opacity: 0, x: 16 }}
              transition={{ duration: 0.16 }}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <GerenciarMotivos unidadeId={unidadeId} motivos={motivos} onMudou={recarregar} />
              <div className="border-t border-slate-800 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setGerenciando(false)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-slate-300 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar para a escolha
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="escolher"
              initial={reduzir ? false : { opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduzir ? undefined : { opacity: 0, x: -16 }}
              transition={{ duration: 0.16 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {erro && <p className="text-[12.5px] text-rose-300">Não consegui ler os motivos: {erro}</p>}
                {!erro && opcoes.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-700 px-4 py-3 text-[12.5px] text-slate-400">
                    Nenhum motivo cadastrado. Crie o primeiro em “Gerenciar motivos”.
                  </p>
                )}
                <div role="radiogroup" aria-label="Motivo" className="grid gap-2">
                  {opcoes.map((m) => {
                    const ativo = escolhido === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        onClick={() => setEscolhido(m.id)}
                        className={cn(
                          'relative flex min-h-[44px] items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60',
                          ativo ? 'border-transparent text-white' : 'border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700',
                        )}
                      >
                        {ativo && (
                          <motion.span
                            layoutId="motivo-escolhido"
                            transition={reduzir ? { duration: 0 } : MOLA_CURTA}
                            className="absolute inset-0 rounded-xl border border-rose-500/60 bg-rose-500/10"
                          />
                        )}
                        <span className="relative">
                          {m.nome}
                          {!m.ativo && <span className="ml-1.5 text-[11px] text-slate-500">(desativado)</span>}
                        </span>
                        <span
                          className={cn(
                            'relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                            ativo ? 'border-rose-400 bg-rose-500 text-white' : 'border-slate-600',
                          )}
                        >
                          {ativo && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <label htmlFor="motivo-obs" className="mb-1 block text-[12px] text-slate-400">
                    Observação (opcional)
                  </label>
                  <textarea
                    id="motivo-obs"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="Ex.: viaja com a família no fim de semana do recital"
                    className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-[13px] text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-slate-800 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setGerenciando(true)}
                  className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-violet-300 hover:bg-slate-800 hover:text-violet-200"
                >
                  <Settings2 className="h-4 w-4" /> Gerenciar motivos
                </button>
                <button
                  type="button"
                  onClick={onFechar}
                  disabled={gravando}
                  className="rounded-xl px-3 py-2 text-[13px] text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <BotaoComMola
                  onClick={() => void confirmar()}
                  desabilitado={!escolhido || gravando}
                  className="bg-rose-600 text-white hover:bg-rose-500"
                >
                  {gravando && <Loader2 className="h-4 w-4 animate-spin" />} Não vai
                </BotaoComMola>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function GerenciarMotivos({
  unidadeId,
  motivos,
  onMudou,
}: {
  unidadeId: string;
  motivos: MotivoAusencia[];
  onMudou: () => void;
}) {
  const reduzir = useReducedMotion();
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<number | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function criar() {
    const nome = novo.trim();
    if (nome.length < 2) return;
    setOcupado(true);
    const ordem = Math.max(0, ...motivos.filter((m) => m.ordem < 99).map((m) => m.ordem)) + 1;
    const { error } = await criarMotivoAusencia(unidadeId, nome, ordem);
    setOcupado(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Já existe um motivo com esse nome.' : `Não criei: ${error.message}`);
      return;
    }
    setNovo('');
    onMudou();
  }

  async function salvarNome(m: MotivoAusencia) {
    const nome = nomeEditado.trim();
    setEditando(null);
    if (nome.length < 2 || nome === m.nome) return;
    const { data, error } = await atualizarMotivoAusencia(m.id, { nome });
    if (error || !data?.length) {
      toast.error(error?.code === '23505' ? 'Já existe um motivo com esse nome.' : `Não renomeei: ${error?.message ?? 'sem permissão'}`);
      return;
    }
    onMudou();
  }

  async function alternar(m: MotivoAusencia) {
    const { data, error } = await atualizarMotivoAusencia(m.id, { ativo: !m.ativo });
    if (error || !data?.length) {
      toast.error(`Não alterei: ${error?.message ?? 'sem permissão'}`);
      return;
    }
    onMudou();
  }

  return (
    <div className="space-y-3 px-5 py-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void criar();
        }}
      >
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          maxLength={80}
          placeholder="Novo motivo"
          className="h-10 rounded-xl border-slate-700 bg-slate-950/60"
        />
        <BotaoComMola
          onClick={() => void criar()}
          desabilitado={ocupado || novo.trim().length < 2}
          className="shrink-0 bg-violet-600 text-white hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" /> Criar
        </BotaoComMola>
      </form>

      <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
        <AnimatePresence initial={false}>
          {motivos.map((m) => (
            <motion.li
              key={m.id}
              layout={!reduzir}
              initial={reduzir ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduzir ? undefined : { opacity: 0, height: 0 }}
              className={cn('flex items-center gap-2 bg-slate-900/50 px-3 py-2', !m.ativo && 'opacity-55')}
            >
              {editando === m.id ? (
                <Input
                  autoFocus
                  value={nomeEditado}
                  onChange={(e) => setNomeEditado(e.target.value)}
                  onBlur={() => void salvarNome(m)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void salvarNome(m);
                    if (e.key === 'Escape') setEditando(null);
                  }}
                  maxLength={80}
                  className="h-8 flex-1 rounded-lg border-slate-700 bg-slate-950/60 text-[13px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditando(m.id);
                    setNomeEditado(m.nome);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-[13px] text-slate-200 hover:text-white"
                  aria-label={`Renomear ${m.nome}`}
                >
                  {m.nome}
                </button>
              )}
              <button
                type="button"
                onClick={() => void alternar(m)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11.5px]',
                  m.ativo ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-emerald-300 hover:bg-emerald-500/10',
                )}
              >
                {m.ativo ? <><EyeOff className="h-3.5 w-3.5" /> Esconder</> : <><Eye className="h-3.5 w-3.5" /> Reativar</>}
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <p className="text-[11.5px] text-slate-500">
        Clique no nome para renomear. Motivo escondido não aparece na escolha, mas continua nos alunos que já o têm.
      </p>
    </div>
  );
}
