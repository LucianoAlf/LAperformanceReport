import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  PesquisaEvasaoFollowupAcao,
  PesquisaEvasaoFollowupCanal,
  PesquisaEvasaoFollowupItem,
} from './pesquisaEvasao.types';

interface Props {
  aberto: boolean;
  item: PesquisaEvasaoFollowupItem | null;
  acaoInicial: PesquisaEvasaoFollowupAcao;
  salvando: boolean;
  onAbertoChange: (aberto: boolean) => void;
  onConfirmar: (dados: {
    acao: PesquisaEvasaoFollowupAcao;
    canal: PesquisaEvasaoFollowupCanal | null;
    observacao: string;
  }) => void;
}

export function ModalRegistrarFollowupEvasao({
  aberto,
  item,
  acaoInicial,
  salvando,
  onAbertoChange,
  onConfirmar,
}: Props) {
  const [acao, setAcao] = useState<PesquisaEvasaoFollowupAcao>(acaoInicial);
  const [canal, setCanal] = useState<PesquisaEvasaoFollowupCanal | ''>('');
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setAcao(acaoInicial);
    setCanal('');
    setObservacao('');
  }, [aberto, acaoInicial, item?.pesquisa_id]);

  if (!item) return null;

  const realizado = acao === 'realizado';
  const invalido = salvando || (realizado && canal === '') || observacao.length > 500;

  return (
    <Dialog open={aberto} onOpenChange={(proximo) => !salvando && onAbertoChange(proximo)}>
      <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {realizado ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <MessageSquareWarning className="h-5 w-5 text-amber-400" />
            )}
            Registrar follow-up
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Esta ação registra seu usuário e o horário. Ela não envia mensagem à família.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <p className="text-sm font-medium text-white">{item.aluno_nome}</p>
            <p className="mt-1 text-xs text-slate-400">{item.unidade_nome}</p>
          </div>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de registro">
            <Button
              type="button"
              variant={realizado ? 'default' : 'outline'}
              onClick={() => setAcao('realizado')}
            >
              Marcar como realizado
            </Button>
            <Button
              type="button"
              variant={!realizado ? 'default' : 'outline'}
              onClick={() => {
                setAcao('dispensado');
                setCanal('');
              }}
            >
              Dispensar follow-up
            </Button>
          </div>

          {realizado && (
            <div className="space-y-2">
              <label htmlFor="followup-canal" className="text-sm font-medium text-slate-200">
                Canal usado
              </label>
              <Select
                value={canal}
                onValueChange={(valor) => setCanal(valor as PesquisaEvasaoFollowupCanal)}
              >
                <SelectTrigger id="followup-canal" className="border-slate-700 bg-slate-950/50">
                  <SelectValue placeholder="Selecione o canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="telefone">Ligação</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="followup-observacao" className="text-sm font-medium text-slate-200">
                Observação opcional
              </label>
              <span className={observacao.length > 500 ? 'text-xs text-rose-300' : 'text-xs text-slate-500'}>
                {observacao.length}/500
              </span>
            </div>
            <Textarea
              id="followup-observacao"
              value={observacao}
              maxLength={500}
              rows={4}
              placeholder="Contexto breve para o histórico interno"
              className="resize-none border-slate-700 bg-slate-950/50"
              onChange={(event) => setObservacao(event.target.value)}
            />
            {observacao.length === 0 && (
              <span className="sr-only">0/500</span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={salvando} onClick={() => onAbertoChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={invalido}
            onClick={() => onConfirmar({
              acao,
              canal: realizado ? canal || null : null,
              observacao,
            })}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar registro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
