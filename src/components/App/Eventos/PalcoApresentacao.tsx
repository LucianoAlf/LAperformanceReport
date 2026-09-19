import { useState } from 'react';
import { toast } from 'sonner';
import { Guitar, Plus, Speaker, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { chaveDoItem, instrumentoDoCurso } from '@/lib/eventos';
import {
  adicionarItemDePalco,
  atualizarApresentacao,
  removerItemDePalco,
  type ApresentacaoDaGrade,
} from '@/hooks/useEventos';

type Tipo = 'instrumento' | 'equipamento';

/**
 * Palco de UMA apresentacao: instrumentos, equipamentos, playback e mapa.
 *
 * Fica fora do `CartaoApresentacao` por tamanho — o cartao ja carrega arrasto, musica e
 * duracao, e o palco e a parte que so interessa quando alguem vai montar o evento.
 */
export function PalcoApresentacao({
  apresentacao,
  sugestoes,
  onMudou,
}: {
  apresentacao: ApresentacaoDaGrade;
  /** Nomes ja usados neste evento, para a grafia convergir em vez de divergir. */
  sugestoes: { instrumento: string[]; equipamento: string[] };
  onMudou: () => void;
}) {
  // Começa em "equipamento" porque é onde mora o dado NOVO: o instrumento sai do curso
  // sozinho (ver `instrumentoDoCurso`), e o que a base não sabe é amplificador, estante,
  // cabo, banquinho. Instrumento fica disponível para o número que foge do curso — o aluno
  // de Canto que também toca violão.
  const [tipo, setTipo] = useState<Tipo>('equipamento');
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [observacao, setObservacao] = useState(apresentacao.observacao_mapa ?? '');

  const adicionar = async () => {
    const limpo = nome.trim();
    if (limpo === '') return;
    setSalvando(true);
    const { error } = await adicionarItemDePalco(apresentacao.id, {
      tipo,
      nome: limpo,
      quantidade,
    });
    setSalvando(false);
    if (error) {
      toast.error(`Não consegui adicionar: ${error.message}`);
      return;
    }
    // Só o nome é limpo: quem cadastra três equipamentos seguidos não quer voltar o
    // segmented para "instrumento" a cada linha.
    setNome('');
    setQuantidade(1);
    onMudou();
  };

  const instrumentos = apresentacao.itens.filter((i) => i.tipo === 'instrumento');
  const equipamentos = apresentacao.itens.filter((i) => i.tipo === 'equipamento');

  // O instrumento do curso. Só é exibido quando ninguém digitou o mesmo objeto — senão a
  // linha automática e a digitada apareceriam duas vezes dizendo a mesma coisa.
  const doCurso = instrumentoDoCurso(apresentacao.curso_nome);
  const cursoJaDigitado =
    doCurso !== null && instrumentos.some((i) => chaveDoItem(i.nome) === chaveDoItem(doCurso));

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <ListaDeItens
          titulo="Instrumentos"
          icone={<Guitar className="h-3.5 w-3.5" />}
          itens={instrumentos}
          onMudou={onMudou}
          // Linha fixa, sem botão de remover: ela não é um registro, é o curso da
          // apresentação aparecendo. Para tirá-la, muda-se o curso — e isso é a grade.
          fixo={
            doCurso && !cursoJaDigitado
              ? { nome: doCurso, motivo: `do curso de ${apresentacao.curso_nome}` }
              : null
          }
        />
        <ListaDeItens
          titulo="Equipamentos"
          icone={<Speaker className="h-3.5 w-3.5" />}
          itens={equipamentos}
          onMudou={onMudou}
          fixo={null}
        />
      </div>

      {/* ── adicionar ── */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-md border border-slate-700 p-0.5">
          {(['instrumento', 'equipamento'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={cn(
                'rounded px-2.5 py-1 text-[11.5px] capitalize transition-colors',
                tipo === t ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-w-[150px] flex-1">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionar();
              }
            }}
            list={`itens-${tipo}-${apresentacao.id}`}
            placeholder={tipo === 'instrumento' ? 'Violão nylon' : 'Amplificador'}
            className="h-7 text-[12.5px]"
          />
          {/* A lista de sugestões vem do que já foi digitado NESTE evento: é o que faz
              "Violão" e "violao" convergirem para a mesma grafia antes de virarem duas
              linhas na consolidação do palco. */}
          <datalist id={`itens-${tipo}-${apresentacao.id}`}>
            {sugestoes[tipo].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <Input
          type="number"
          min={1}
          value={quantidade}
          onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))}
          className="h-7 w-16 text-[12.5px]"
          title="Quantidade"
        />

        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1"
          onClick={adicionar}
          disabled={salvando || nome.trim() === ''}
        >
          <Plus className="h-3.5 w-3.5" />
          Incluir
        </Button>
      </div>

      {/* ── playback e mapa ── */}
      <div className="space-y-2 border-t border-slate-700/60 pt-2.5">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-[12px] text-slate-300">
          <input
            type="checkbox"
            checked={apresentacao.tem_playback}
            onChange={async (e) => {
              const { error } = await atualizarApresentacao(apresentacao.id, {
                tem_playback: e.target.checked,
              });
              if (error) toast.error(`Não consegui salvar: ${error.message}`);
              else onMudou();
            }}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          Usa playback
        </label>

        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          onBlur={async () => {
            const valor = observacao.trim();
            if (valor === (apresentacao.observacao_mapa ?? '')) return;
            const { error } = await atualizarApresentacao(apresentacao.id, {
              observacao_mapa: valor || null,
            });
            if (error) toast.error(`Não consegui salvar a observação: ${error.message}`);
            else onMudou();
          }}
          rows={2}
          placeholder="Observação / mapa de palco — ex: cadeira à esquerda, microfone na altura do violão"
          className="w-full resize-y rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-[12.5px] text-slate-200 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

function ListaDeItens({
  titulo,
  icone,
  itens,
  fixo,
  onMudou,
}: {
  titulo: string;
  icone: React.ReactNode;
  itens: { id: number; nome: string; quantidade: number; observacao: string | null }[];
  /** Item que vem do cadastro, não de um registro — exibido sem botão de remover. */
  fixo: { nome: string; motivo: string } | null;
  onMudou: () => void;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        {icone}
        {titulo}
      </p>
      {itens.length === 0 && !fixo ? (
        <p className="mt-1 text-[12px] text-slate-600">nenhum</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {fixo && (
            <li
              title={fixo.motivo}
              className="flex items-center gap-2 rounded border border-dashed border-slate-700 px-2 py-1 text-[12.5px]"
            >
              <span className="min-w-0 flex-1 truncate text-slate-300">{fixo.nome}</span>
              <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-slate-600">
                do curso
              </span>
            </li>
          )}
          {itens.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded bg-slate-900/60 px-2 py-1 text-[12.5px]"
            >
              {item.quantidade > 1 && (
                <span className="rounded bg-slate-800 px-1 text-[11px] tabular-nums text-slate-300">
                  {item.quantidade}×
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-slate-200">{item.nome}</span>
              {item.observacao && (
                <span className="truncate text-[11px] text-slate-500">{item.observacao}</span>
              )}
              <button
                type="button"
                aria-label={`Remover ${item.nome}`}
                onClick={async () => {
                  const { error } = await removerItemDePalco(item.id);
                  if (error) toast.error(`Não consegui remover: ${error.message}`);
                  else onMudou();
                }}
                className="text-slate-600 transition-colors hover:text-rose-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
