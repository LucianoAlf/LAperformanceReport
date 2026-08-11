import { useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
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
import { SUGESTOES_JUSTIFICATIVA } from './chamadaUtils';
import { uploadEvidencia } from './useChamadaAcoes';
import type { AlunoAgenda, AulaAgenda } from '@/hooks/useAgendaDia';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  aula: AulaAgenda | null;
  aluno: AlunoAgenda | null;
  salvando: boolean;
  onConfirmar: (motivo: string, evidenciaPath?: string) => void;
}

/**
 * Falta justificada (spec D7): motivo livre obrigatorio (chips sao so
 * sugestao) + evidencia opcional (atestado sobe pro bucket privado e fica
 * vinculado a falta). Sem motivo, nao confirma.
 */
export function ModalJustificarFalta({ aberto, onFechar, aula, aluno, salvando, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  function resetar() {
    setMotivo('');
    setArquivo(null);
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
      setErro('Sem motivo não justifica — escreva o que aconteceu.');
      return;
    }
    if (!aula || !aluno?.aluno_id || !aluno.aula_emusys_id) return;

    let evidenciaPath: string | undefined;
    if (arquivo) {
      setSubindo(true);
      try {
        evidenciaPath = await uploadEvidencia(arquivo, aluno.aula_emusys_id, aluno.aluno_id);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha no upload da evidência.');
        setSubindo(false);
        return;
      }
      setSubindo(false);
    }

    onConfirmar(texto, evidenciaPath);
    resetar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="z-[120] border-amber-500/30 bg-[#0c1220] sm:max-w-md" overlayClassName="z-[120]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="h-4 w-4 text-amber-400" />
            Falta justificada — {aluno?.nome}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Conta como falta nos indicadores, mas gera <b className="text-amber-300">1 crédito de reposição</b> —
            a aula vai para o final do pacote.
            {aula && (
              <span className="mt-1 block text-xs text-slate-500">
                {aula.hora_inicio} · {aula.curso_nome} · {aula.sala_nome} · {aula.unidade_nome}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label htmlFor="motivo-justificada" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Motivo <span className="text-amber-400">· obrigatório</span>
            </label>
            <Textarea
              id="motivo-justificada"
              value={motivo}
              onChange={(e) => { setMotivo(e.target.value); setErro(null); }}
              rows={2}
              placeholder="Ex.: mãe avisou que o aluno está com febre"
              className="border-slate-700 bg-slate-800/50 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/50"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-600">sugestões:</span>
              {SUGESTOES_JUSTIFICATIVA.map((s) => (
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
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Evidência
            </span>
            <input
              ref={inputArquivoRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
            {arquivo ? (
              <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                <span className="flex items-center gap-2 truncate">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  {arquivo.name}
                </span>
                <button type="button" onClick={() => setArquivo(null)} aria-label="Remover anexo"
                  className="text-amber-300 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputArquivoRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 px-3 py-2.5 text-xs text-slate-400 hover:border-amber-500/50 hover:text-slate-200"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Subir atestado / comprovante (foto ou PDF)
              </button>
            )}
            <p className="mt-1 text-[10px] text-slate-600">
              Se a família mandou atestado, ele sobe aqui e fica vinculado à falta.
            </p>
          </div>

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
            className="bg-amber-500 font-bold text-slate-900 hover:bg-amber-400"
          >
            {subindo ? 'Enviando anexo…' : salvando ? 'Salvando…' : 'Justificar e gerar crédito'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
