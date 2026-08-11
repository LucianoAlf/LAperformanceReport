import { useRef, useState } from 'react';
import { Paperclip, X, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SUGESTOES_CANCELAMENTO } from './chamadaUtils';
import { uploadEvidencia } from './useChamadaAcoes';
import { useAuth } from '@/contexts/AuthContext';
import type { AulaAgenda } from '@/hooks/useAgendaDia';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  aula: AulaAgenda | null;
  salvando: boolean;
  onConfirmar: (motivo: string, evidenciaPath: string | undefined, escopo: 'aula' | 'unidade_dia') => void;
}

/**
 * Cancelamento de aula (spec D3): motivo livre OBRIGATORIO — nao se cancela
 * por cancelar. Ninguem toma falta; cada aluno do roster ganha credito de
 * reposicao. Escopo "dia inteiro da unidade" (vendaval) so aparece para admin,
 * conforme trava do spec item 7.3 enquanto o Alf nao valida.
 */
export function ModalCancelarAula({ aberto, onFechar, aula, salvando, onConfirmar }: Props) {
  const { isAdmin } = useAuth();
  const [motivo, setMotivo] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const totalAlunos = aula?.alunos.filter((a) => a.aluno_id != null).length ?? 0;

  function resetar() {
    setMotivo('');
    setArquivo(null);
    setDiaInteiro(false);
    setErro(null);
    setSubindo(false);
  }

  function fechar() {
    resetar();
    onFechar();
  }

  async function confirmar() {
    const texto = motivo.trim();
    if (texto.length < 3) {
      setErro('Não pode cancelar por cancelar — qual o motivo?');
      return;
    }
    const aulaId = aula?.aula_ids[0];
    if (!aulaId) return;

    let evidenciaPath: string | undefined;
    if (arquivo) {
      setSubindo(true);
      try {
        evidenciaPath = await uploadEvidencia(arquivo, aulaId);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha no upload da evidência.');
        setSubindo(false);
        return;
      }
      setSubindo(false);
    }

    onConfirmar(texto, evidenciaPath, diaInteiro ? 'unidade_dia' : 'aula');
    resetar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="z-[120] border-rose-500/30 bg-[#0c1220] sm:max-w-md" overlayClassName="z-[120]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <XCircle className="h-4 w-4 text-rose-400" />
            Cancelar aula — {aula?.hora_inicio} · {aula?.curso_nome}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            A aula deixa de existir no pacote: <b className="text-slate-200">nenhum dos {totalAlunos} aluno(s)
            toma falta</b> e cada um recebe <b className="text-amber-300">1 crédito de reposição</b>.
            <span className="mt-1 block text-xs text-slate-500">
              {aula?.professor_nome} · {aula?.sala_nome} · {aula?.unidade_nome}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label htmlFor="motivo-cancelamento" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Motivo do cancelamento <span className="text-rose-400">· obrigatório</span>
            </label>
            <Textarea
              id="motivo-cancelamento"
              value={motivo}
              onChange={(e) => { setMotivo(e.target.value); setErro(null); }}
              rows={2}
              placeholder="Ex.: professor sofreu um acidente a caminho da unidade"
              className="border-slate-700 bg-slate-800/50 text-sm text-slate-200 placeholder:text-slate-600 focus:border-rose-500/50"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-600">sugestões:</span>
              {SUGESTOES_CANCELAMENTO.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setMotivo(s); setErro(null); }}
                  className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <input
              ref={inputArquivoRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
            {arquivo ? (
              <div className="flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200">
                <span className="flex items-center gap-2 truncate">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  {arquivo.name}
                </span>
                <button type="button" onClick={() => setArquivo(null)} aria-label="Remover anexo"
                  className="text-rose-300 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputArquivoRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 px-3 py-2.5 text-xs text-slate-400 hover:border-rose-500/50 hover:text-slate-200"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Anexar evidência (opcional) — print, foto, comunicado
              </button>
            )}
          </div>

          {isAdmin && (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={diaInteiro}
                onChange={(e) => setDiaInteiro(e.target.checked)}
                className="accent-rose-500"
              />
              Cancelar também as outras aulas da unidade hoje (vendaval/fechamento)
            </label>
          )}

          {erro && <p className="text-xs font-medium text-rose-400">{erro}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={fechar} disabled={salvando || subindo}>
            Voltar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={salvando || subindo}
            className="bg-rose-600 font-bold text-white hover:bg-rose-500"
          >
            {subindo ? 'Enviando anexo…' : salvando ? 'Cancelando…' : diaInteiro ? 'Cancelar o dia e gerar créditos' : 'Cancelar aula e gerar créditos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
