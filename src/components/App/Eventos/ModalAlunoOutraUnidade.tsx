import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, Music, Check, Loader2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  buscarAlunoDeOutraUnidade,
  definirParticipacao,
  type AlunoDeOutraUnidade,
} from '@/hooks/useEventos';

/**
 * Aluno de OUTRA unidade que vai se apresentar neste evento (pedido do Arthur, 28/09).
 *
 * Raro, mas acontece: aluno do Recreio tocando no recital da Barra e vice-versa. A busca
 * so devolve matricula ativa com curso que entra no recital, e so o minimo (nome, unidade,
 * cursos) — a ficha completa continua restrita a unidade de origem.
 */
export function ModalAlunoOutraUnidade({
  eventoId,
  aberto,
  onFechar,
  onAdicionado,
}: {
  eventoId: number;
  aberto: boolean;
  onFechar: () => void;
  onAdicionado: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<AlunoDeOutraUnidade[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState<number | null>(null);

  useEffect(() => {
    if (!aberto) {
      setTermo('');
      setResultados([]);
      setErro(null);
    }
  }, [aberto]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 3) {
      setResultados([]);
      setErro(null);
      setBuscando(false);
      return;
    }
    let cancelado = false;
    // "Buscando" liga JA na digitacao, nao quando o debounce vence: nos 300 ms de espera a
    // lista vazia dizia "nenhum aluno" para um nome que ia aparecer em seguida.
    setBuscando(true);
    const timer = setTimeout(async () => {
      const { alunos, error } = await buscarAlunoDeOutraUnidade(eventoId, t);
      if (cancelado) return;
      setBuscando(false);
      if (error) {
        setErro(error.message);
        setResultados([]);
      } else {
        setErro(null);
        setResultados(alunos);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [termo, eventoId]);

  const adicionar = async (aluno: AlunoDeOutraUnidade) => {
    setAdicionando(aluno.aluno_id_referencia);
    const { error } = await definirParticipacao(eventoId, aluno.aluno_id_referencia, 'participa');
    setAdicionando(null);
    if (error) {
      toast.error(`Não consegui adicionar ${aluno.nome}: ${error.message}`);
      return;
    }
    toast.success(`${aluno.nome} (${aluno.unidade_nome}) adicionado ao evento`);
    setResultados((lista) =>
      lista.map((a) =>
        a.aluno_id_referencia === aluno.aluno_id_referencia ? { ...a, ja_no_evento: true } : a,
      ),
    );
    onAdicionado();
  };

  const t = termo.trim();

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aluno de outra unidade</DialogTitle>
          <DialogDescription>
            Para quem estuda em outra unidade e vai se apresentar neste recital. Ele entra na
            lista como confirmado e pode ser colocado na grade como qualquer aluno.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome do aluno (mínimo 3 letras)"
            className="pl-8"
          />
          {buscando && (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto rounded-lg border border-slate-700">
          {erro ? (
            <p className="p-4 text-center text-[13px] text-rose-300">Não consegui buscar: {erro}</p>
          ) : t.length < 3 ? (
            <p className="p-4 text-center text-[13px] text-slate-500">
              Digite pelo menos 3 letras do nome.
            </p>
          ) : buscando && resultados.length === 0 ? (
            <p className="flex items-center justify-center gap-2 p-4 text-[13px] text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando nas outras unidades…
            </p>
          ) : resultados.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-slate-500">
              Nenhum aluno ativo de outra unidade com esse nome.
            </p>
          ) : (
            resultados.map((a) => (
              <div
                key={a.aluno_id_referencia}
                className="flex items-center gap-3 border-b border-slate-800 px-3 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="truncate text-[13.5px] font-medium text-white">{a.nome}</span>
                    <span className="rounded bg-sky-500/15 px-1.5 py-px text-[10.5px] font-medium text-sky-300">
                      {a.unidade_nome}
                    </span>
                    {a.idade_anos != null && (
                      <span className="text-[11.5px] text-slate-500">{a.idade_anos} anos</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11.5px] text-slate-400">
                    {a.cursos.map((c) => (
                      <span key={c.curso_id} className="flex items-center gap-1">
                        <Music className="h-3 w-3 text-slate-600" />
                        {c.curso_nome}
                        {c.professor_nome && <span className="text-slate-600">· {c.professor_nome}</span>}
                      </span>
                    ))}
                  </div>
                </div>
                {a.ja_no_evento ? (
                  <span className="flex shrink-0 items-center gap-1 text-[12px] text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    no evento
                  </span>
                ) : (
                  <Button
                    size="sm"
                    disabled={adicionando !== null}
                    onClick={() => adicionar(a)}
                  >
                    {adicionando === a.aluno_id_referencia ? 'Adicionando…' : 'Adicionar'}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
