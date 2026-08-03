import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  FlaskConical,
  GraduationCap,
  Loader2,
  MessageSquareText,
  Phone,
  Send,
  Signature,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PesquisaEvasaoPreview } from './pesquisaEvasao.types';
import { EditorMensagemPesquisaEvasao } from './EditorMensagemPesquisaEvasao';

interface ModalPreviewPesquisaEvasaoProps {
  aberto: boolean;
  preview: PesquisaEvasaoPreview | null;
  confirmando: boolean;
  onAbertoChange: (aberto: boolean) => void;
  onConfirmar: (mensagemFinal: string) => void;
}

interface CampoPreviewProps {
  rotulo: string;
  valor: string;
  icon: typeof UserRound;
  destaque?: boolean;
}

function CampoPreview({
  rotulo,
  valor,
  icon: Icon,
  destaque = false,
}: CampoPreviewProps) {
  return (
    <div className="group rounded-xl border border-slate-700/70 bg-slate-950/45 p-3.5 transition-colors hover:border-slate-600">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.13em] text-slate-500">
        <Icon className={destaque ? 'text-yellow-400' : 'text-slate-500'} />
        {rotulo}
      </div>
      <p className={destaque ? 'font-medium text-yellow-100' : 'font-medium text-slate-100'}>
        {valor}
      </p>
    </div>
  );
}

function formatarTempoRestante(segundos: number) {
  const minutos = Math.floor(segundos / 60);
  const segundosRestantes = segundos % 60;
  return `${minutos}:${segundosRestantes.toString().padStart(2, '0')}`;
}

export function ModalPreviewPesquisaEvasao({
  aberto,
  preview,
  confirmando,
  onAbertoChange,
  onConfirmar,
}: ModalPreviewPesquisaEvasaoProps) {
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [mensagemFinal, setMensagemFinal] = useState(preview?.mensagem ?? '');

  useEffect(() => {
    if (!aberto || !preview) return;
    setMensagemFinal(preview.mensagem);
  }, [aberto, preview?.preview_id, preview?.mensagem]);

  useEffect(() => {
    if (!aberto || !preview) return;

    setAgora(Date.now());
    const timerId = window.setInterval(() => setAgora(Date.now()), 1_000);
    return () => window.clearInterval(timerId);
  }, [aberto, preview]);

  if (!preview) return null;

  const prazoExpiracao = Date.parse(preview.expira_em);
  const expirado = !Number.isFinite(prazoExpiracao) || prazoExpiracao <= agora;
  const segundosRestantes = expirado
    ? 0
    : Math.max(0, Math.ceil((prazoExpiracao - agora) / 1_000));
  const mensagemInvalida = mensagemFinal.trim().length === 0 ||
    Array.from(mensagemFinal).length > 2_000;

  const confirmarSeValido = () => {
    if (expirado || confirmando || mensagemInvalida) return;
    onConfirmar(mensagemFinal);
  };

  const alterarAberto = (proximoAberto: boolean) => {
    if (!proximoAberto && confirmando) return;
    onAbertoChange(proximoAberto);
  };

  const destinatarioTipo = preview.destinatario_tipo === 'responsavel'
    ? 'Responsável'
    : preview.destinatario_tipo === 'teste'
      ? 'Contato de teste'
      : 'Aluno';

  return (
    <Dialog open={aberto} onOpenChange={alterarAberto}>
      <DialogContent
        aria-labelledby="pesquisa-evasao-preview-titulo"
        aria-describedby="pesquisa-evasao-preview-descricao"
        className="max-h-[92vh] max-w-3xl overflow-y-auto border-slate-700 bg-slate-900 p-0 shadow-2xl shadow-black/50"
        onEscapeKeyDown={(event) => {
          if (confirmando) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (confirmando) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          tituloRef.current?.focus();
        }}
      >
        {preview.modo_teste && (
          <div className="flex items-center gap-3 border-b border-yellow-400/30 bg-yellow-400/15 px-6 py-3 text-yellow-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-yellow-300/35 bg-yellow-300/15">
              <FlaskConical className="text-yellow-300" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">
                TESTE — não será enviado ao aluno
              </p>
              <p className="text-xs text-yellow-200/80">
                Ambiente controlado • telefone de teste {preview.telefone_mascarado}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-5 p-6">
          <DialogHeader className="pr-8">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10">
                <MessageSquareText className="text-violet-300" />
              </div>
              <DialogTitle
                ref={tituloRef}
                id="pesquisa-evasao-preview-titulo"
                tabIndex={-1}
                className="text-xl outline-none"
              >
                Revisar pesquisa antes do envio
              </DialogTitle>
            </div>
            <DialogDescription id="pesquisa-evasao-preview-descricao" className="leading-relaxed">
              Confira destinatário, contexto e texto. Ao confirmar, a mensagem
              aprovada será enviada pelo WhatsApp. Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-800/45 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Clock3 className={expirado ? 'text-rose-400' : 'text-emerald-400'} />
              {expirado ? (
                <span className="font-medium text-rose-300">Prévia expirada</span>
              ) : (
                <span>
                  Válida por mais{' '}
                  <strong className="font-semibold text-white">
                    {formatarTempoRestante(segundosRestantes)}
                  </strong>
                </span>
              )}
            </div>
            <span
              className={
                preview.modo_teste
                  ? 'rounded-full border border-yellow-400/30 bg-yellow-400/15 px-2.5 py-1 text-xs font-semibold text-yellow-200'
                  : 'rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300'
              }
            >
              {preview.modo_teste ? 'Ambiente de teste' : 'Ambiente de produção'}
            </span>
          </div>

          {expirado && (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-100"
            >
              <AlertTriangle className="mt-0.5 shrink-0 text-rose-300" />
              <div>
                <p className="font-semibold">Esta prévia não pode mais ser confirmada.</p>
                <p className="mt-1 text-rose-200/75">
                  Feche o modal e gere uma nova prévia para obter dados atualizados.
                </p>
              </div>
            </div>
          )}

          <section aria-label="Contexto do envio" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CampoPreview rotulo="Aluno" valor={preview.aluno} icon={GraduationCap} />
            <CampoPreview
              rotulo={destinatarioTipo}
              valor={preview.destinatario}
              icon={UsersRound}
            />
            <CampoPreview
              rotulo={preview.modo_teste ? 'Telefone de teste' : 'WhatsApp'}
              valor={preview.telefone_mascarado}
              icon={Phone}
              destaque={preview.modo_teste}
            />
            <CampoPreview rotulo="Unidade" valor={preview.unidade} icon={Building2} />
            <CampoPreview rotulo="Curso" valor={preview.curso ?? 'Não informado'} icon={GraduationCap} />
            <CampoPreview rotulo="Professor" valor={preview.professor ?? 'Não informado'} icon={UserRound} />
          </section>

          <section aria-labelledby="pesquisa-evasao-mensagem-titulo" className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/60">
            <div className="flex items-center justify-between border-b border-slate-700/80 bg-slate-800/55 px-4 py-3">
              <h3
                id="pesquisa-evasao-mensagem-titulo"
                className="flex items-center gap-2 text-sm font-semibold text-slate-100"
              >
                <MessageSquareText className="text-violet-300" />
                Mensagem que será enviada
              </h3>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Signature />
                {preview.assinatura}
              </span>
            </div>
            <EditorMensagemPesquisaEvasao
              mensagemOriginal={preview.mensagem}
              mensagem={mensagemFinal}
              desabilitado={confirmando}
              onMensagemChange={setMensagemFinal}
            />
          </section>

          {preview.alertas.length > 0 && (
            <section aria-label="Alertas de cadastro" className="space-y-2">
              {preview.alertas.map((alerta) => (
                <div
                  key={alerta}
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
                >
                  <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" />
                  <span>{alerta}</span>
                </div>
              ))}
            </section>
          )}

          <DialogFooter className="gap-2 border-t border-slate-700/70 pt-5 sm:space-x-0">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={confirmando}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={confirmarSeValido}
              disabled={confirmando || expirado || mensagemInvalida}
              className={
                preview.modo_teste
                  ? 'bg-yellow-400 text-slate-950 hover:bg-yellow-300'
                  : 'bg-violet-500 text-white hover:bg-violet-400'
              }
            >
              {confirmando ? (
                <>
                  <Loader2 className="animate-spin" />
                  Confirmando...
                </>
              ) : expirado ? (
                <>
                  <AlertTriangle />
                  Gere uma nova prévia
                </>
              ) : (
                <>
                  {preview.modo_teste ? <CheckCircle2 /> : <Send />}
                  Confirmar envio como {preview.assinatura}
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
