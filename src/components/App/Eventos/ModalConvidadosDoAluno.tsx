import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, Minus, Plus, Ticket, Trash2, Users } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  adicionarCortesia,
  removerCortesia,
  trocarBlocoDoConvidado,
  type AlunoElegivel,
  type ConvidadoDaPorta,
} from '@/hooks/useEventos';
import { BotaoComMola, MOLA_CURTA } from './ControlesComMovimento';

/** Blocos em que a pessoa se apresenta, na ordem do recital — o 1º é o padrão da cortesia. */
export function blocosDaPessoa(aluno: AlunoElegivel) {
  const vistos = new Map<number, { id: number; nome: string; ordem: number }>();
  for (const a of aluno.alocacoes) {
    if (!vistos.has(a.bloco_id)) vistos.set(a.bloco_id, { id: a.bloco_id, nome: a.bloco_nome, ordem: a.bloco_ordem });
  }
  return [...vistos.values()].sort((a, b) => a.ordem - b.ordem);
}

/**
 * Convidados de UM aluno, pelo nome (item 7 da reunião de 08/10/2026).
 *
 * Cortesia nasce aqui; ingresso vendido aparece na lista mas é da Bilheteria (não se apaga
 * daqui). Cada cortesia entra no 1º bloco do aluno, com troca quando ele se apresenta em
 * mais de um. A cota do evento é conferida no banco; a tela só antecipa o aviso.
 */
export function ModalConvidadosDoAluno({
  aberto,
  eventoId,
  aluno,
  convidados,
  onLeva,
  onFechar,
  onMudou,
}: {
  aberto: boolean;
  eventoId: number;
  aluno: AlunoElegivel | null;
  /** Já filtrados para a pessoa (todos os do evento ligados a ela). */
  convidados: ConvidadoDaPorta[];
  /** Grava quantos convidados a família leva (o número; os nomes vêm abaixo). */
  onLeva: (aluno: AlunoElegivel, n: number) => void;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const reduzir = useReducedMotion();
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [cota, setCota] = useState<number | null>(null);
  const blocos = useMemo(() => (aluno ? blocosDaPessoa(aluno) : []), [aluno]);
  const [blocoNovo, setBlocoNovo] = useState<number | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setNome('');
    setBlocoNovo(blocos[0]?.id ?? null);
    let vivo = true;
    supabase
      .from('evento')
      .select('cortesias_por_aluno')
      .eq('id', eventoId)
      .single()
      .then(({ data, error }) => {
        if (!vivo) return;
        // Sem a cota a tela só não antecipa o aviso — o banco continua conferindo.
        if (error) console.error(`[convidados] evento ${eventoId}: cota não lida`, error.message);
        setCota((data?.cortesias_por_aluno as number | null) ?? null);
      });
    return () => {
      vivo = false;
    };
  }, [aberto, eventoId, blocos]);

  if (!aluno) return null;

  // O número nunca fica abaixo dos nomes (o banco sobe sozinho quando passa); acima é
  // "família vem com mais gente, ainda sem nome".
  const minimo = convidados.length;
  const leva = Math.max(aluno.convidados, minimo);
  const faltamNomes = leva - convidados.length;
  const mudarLeva = (n: number) => {
    const valor = Math.max(minimo, Math.floor(n));
    if (valor !== aluno.convidados) onLeva(aluno, valor);
  };

  const cortesias = convidados.filter((c) => c.tipo_entrada === 'cortesia');
  const noLimite = cota !== null && cortesias.length >= cota;
  const nomeDoBloco = (id: number | null) => blocos.find((b) => b.id === id)?.nome ?? null;

  const adicionar = async () => {
    const limpo = nome.trim();
    if (!limpo || salvando) return;
    setSalvando(true);
    const { error } = await adicionarCortesia(eventoId, aluno.aluno_id_referencia, limpo, blocoNovo);
    setSalvando(false);
    if (error) {
      toast.error(`Não consegui cadastrar ${limpo}: ${error.message}`);
      return;
    }
    setNome('');
    onMudou();
  };

  const remover = async (c: ConvidadoDaPorta) => {
    const { error } = await removerCortesia(c.id, eventoId, aluno.aluno_id_referencia);
    if (error) toast.error(`Não consegui tirar ${c.nome}: ${error.message}`);
    else onMudou();
  };

  const trocarBloco = async (c: ConvidadoDaPorta, blocoId: number) => {
    const { error } = await trocarBlocoDoConvidado(c.id, blocoId);
    if (error) toast.error(`Não consegui trocar o bloco de ${c.nome}: ${error.message}`);
    else onMudou();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent
        className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          if (window.matchMedia('(max-width: 639px)').matches) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-0 border-b border-slate-800 px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-3 pr-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-[16px] text-white">Convidados de {aluno.nome}</DialogTitle>
              <DialogDescription className="text-[12.5px]">
                Quantos vêm e quem são — os nomes vão para o check-in da porta.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* 1. Quantos — o número que conta cadeira. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-white">Leva quantos convidados?</p>
              <p className={cn('text-[12px]', faltamNomes > 0 ? 'text-amber-300/90' : 'text-slate-500')}>
                {leva === 0
                  ? 'Ninguém informado ainda.'
                  : faltamNomes > 0
                    ? `${convidados.length} com nome · faltam ${faltamNomes} ${faltamNomes === 1 ? 'nome' : 'nomes'}`
                    : 'Todos com nome.'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <BotaoComMola
                onClick={() => mudarLeva(leva - 1)}
                desabilitado={leva <= minimo}
                className="w-11 border border-slate-700 px-0 text-slate-300 hover:bg-slate-800 sm:w-9"
              >
                <Minus className="h-4 w-4" />
                <span className="sr-only">Um a menos</span>
              </BotaoComMola>
              <Input
                key={leva}
                type="number"
                min={minimo}
                defaultValue={leva}
                onBlur={(e) => mudarLeva(Number(e.target.value) || 0)}
                aria-label="Quantos convidados"
                className="h-11 w-16 rounded-xl border-slate-700 bg-slate-950/60 text-center text-[16px] tabular-nums sm:h-9 sm:text-[14px]"
              />
              <BotaoComMola
                onClick={() => mudarLeva(leva + 1)}
                desabilitado={false}
                className="w-11 border border-slate-700 px-0 text-slate-300 hover:bg-slate-800 sm:w-9"
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only">Um a mais</span>
              </BotaoComMola>
            </div>
          </div>

          {/* 2. Quem — os nomes. */}
          <div className="flex items-baseline justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Nomes</p>
            {cota !== null && (
              <p className={cn('text-[12px]', noLimite ? 'text-amber-300/90' : 'text-slate-500')}>
                {cortesias.length} de {cota} cortesias
              </p>
            )}
          </div>
          {cota !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
              <motion.div
                className={cn('h-full rounded-full', noLimite ? 'bg-amber-400' : 'bg-emerald-400')}
                initial={false}
                animate={{ width: `${cota === 0 ? 100 : Math.min(100, (cortesias.length / cota) * 100)}%` }}
                transition={reduzir ? { duration: 0 } : MOLA_CURTA}
              />
            </div>
          )}

          {convidados.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-[13px] text-slate-500">
              Nenhum nome ainda. Escreva abaixo quem vem assistir — o número acima sobe junto.
            </p>
          ) : (
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {convidados.map((c) => {
                  const vendido = c.tipo_entrada === 'vendido';
                  return (
                    <motion.li
                      key={c.id}
                      layout={!reduzir}
                      initial={reduzir ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduzir ? { opacity: 0 } : { opacity: 0, x: 12 }}
                      transition={MOLA_CURTA}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-white">{c.nome}</span>
                      {vendido ? (
                        <span className="flex items-center gap-1 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-300">
                          <Ticket className="h-3 w-3" /> ingresso
                        </span>
                      ) : blocos.length > 1 ? (
                        <Select value={c.bloco_id ? String(c.bloco_id) : undefined} onValueChange={(v) => trocarBloco(c, Number(v))}>
                          <SelectTrigger className="h-11 w-auto max-w-[11rem] gap-1 rounded-lg border-slate-700 bg-transparent px-2 text-[12px] text-slate-300 sm:h-7">
                            <SelectValue placeholder="bloco" />
                          </SelectTrigger>
                          <SelectContent>
                            {blocos.map((b) => (
                              <SelectItem key={b.id} value={String(b.id)}>{b.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        nomeDoBloco(c.bloco_id) && (
                          <span className="text-[11.5px] text-slate-500">{nomeDoBloco(c.bloco_id)}</span>
                        )
                      )}
                      {c.checkin_em && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-300">
                          <Check className="h-3 w-3" /> entrou
                        </span>
                      )}
                      {!vendido && !c.checkin_em && (
                        <button
                          type="button"
                          onClick={() => remover(c)}
                          aria-label={`Tirar ${c.nome}`}
                          title="Tirar da lista"
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300 sm:h-7 sm:w-7"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <form
          className="space-y-2 border-t border-slate-800 bg-slate-950/40 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            adicionar();
          }}
        >
          {noLimite && (
            <p className="text-[12px] text-amber-300/90">
              A cota de {cota} cortesias acabou — o próximo convidado é ingresso vendido, na aba Bilheteria.
            </p>
          )}
          {blocos.length === 0 && (
            <p className="text-[12px] text-slate-500">
              O aluno ainda não está em nenhum bloco: a cortesia fica sem bloco até ele ser alocado.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              // Enter adiciona: o botão é type="button" (BotaoComMola), então o form não
              // envia sozinho.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  adicionar();
                }
              }}
              placeholder="Nome do convidado"
              disabled={noLimite}
              aria-label="Nome do convidado"
              className="h-11 min-w-[10rem] flex-1 rounded-xl border-slate-700 bg-slate-950/60 text-[16px] sm:h-9 sm:text-[13px]"
            />
            {blocos.length > 1 && (
              <Select value={blocoNovo ? String(blocoNovo) : undefined} onValueChange={(v) => setBlocoNovo(Number(v))}>
                <SelectTrigger aria-label="Bloco do convidado" className="h-11 w-auto max-w-[10rem] rounded-xl border-slate-700 bg-transparent text-[13px] sm:h-9">
                  <SelectValue placeholder="Bloco" />
                </SelectTrigger>
                <SelectContent>
                  {blocos.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <BotaoComMola
              onClick={adicionar}
              desabilitado={salvando || noLimite || nome.trim() === ''}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            >
              <Plus className="h-4 w-4" />
              {salvando ? 'Salvando…' : 'Adicionar'}
            </BotaoComMola>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
