import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { chaveDoItem, instrumentoDoCurso } from '@/lib/eventos';
import {
  adicionarItemDePalco,
  atualizarApresentacao,
  removerItemDePalco,
  type ApresentacaoDaGrade,
  type ItemDaApresentacao,
} from '@/hooks/useEventos';

type Tipo = 'instrumento' | 'equipamento';

/**
 * Palco de UMA apresentacao: instrumentos, equipamentos, playback e mapa.
 *
 * Layout de `rótulo: valor`, uma linha por assunto, como no protótipo do Arthur — e não um
 * segmented que troca o conteúdo da mesma linha. Com o segmented, ver o que a apresentação
 * pede exigia alternar entre as duas abas e guardar uma na cabeça; aqui as duas listas estão
 * à vista ao mesmo tempo, que é como alguém confere antes de montar.
 */
export function PalcoApresentacao({
  apresentacao,
  sugestoes,
  onMudou,
}: {
  apresentacao: ApresentacaoDaGrade;
  /** Nomes já usados neste evento, para a grafia convergir em vez de divergir. */
  sugestoes: { instrumento: string[]; equipamento: string[] };
  onMudou: () => void;
}) {
  const [observacao, setObservacao] = useState(apresentacao.observacao_mapa ?? '');

  const instrumentos = apresentacao.itens.filter((i) => i.tipo === 'instrumento');
  const equipamentos = apresentacao.itens.filter((i) => i.tipo === 'equipamento');

  // O instrumento do curso. Só é exibido quando ninguém digitou o mesmo objeto — senão a
  // linha automática e a digitada apareceriam duas vezes dizendo a mesma coisa.
  const doCurso = instrumentoDoCurso(apresentacao.curso_nome);
  const cursoJaDigitado =
    doCurso !== null && instrumentos.some((i) => chaveDoItem(i.nome) === chaveDoItem(doCurso));

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
      <LinhaDeItens
        rotulo="Instrumentos"
        tipo="instrumento"
        itens={instrumentos}
        sugestoes={sugestoes.instrumento}
        apresentacaoId={apresentacao.id}
        fixo={
          doCurso && !cursoJaDigitado
            ? { nome: doCurso, motivo: `do curso de ${apresentacao.curso_nome}` }
            : null
        }
        onMudou={onMudou}
      />

      <LinhaDeItens
        rotulo="Equipamentos"
        tipo="equipamento"
        itens={equipamentos}
        sugestoes={sugestoes.equipamento}
        apresentacaoId={apresentacao.id}
        fixo={null}
        onMudou={onMudou}
      />

      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <Rotulo>Observação / Mapa</Rotulo>
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
          placeholder="ex: cadeira à esquerda, microfone na altura do violão"
          className="min-w-[200px] flex-1 resize-y rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-[12.5px] text-slate-200 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Rotulo>Playback</Rotulo>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-300">
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
          {apresentacao.tem_playback ? 'usa playback' : 'não usa'}
        </label>
      </div>
    </div>
  );
}

/** Rótulo de largura fixa: é ele que alinha as quatro linhas na mesma coluna. */
function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-[104px] shrink-0 pt-1 text-[11.5px] text-slate-500">{children}:</span>
  );
}

function LinhaDeItens({
  rotulo,
  tipo,
  itens,
  sugestoes,
  apresentacaoId,
  fixo,
  onMudou,
}: {
  rotulo: string;
  tipo: Tipo;
  itens: ItemDaApresentacao[];
  sugestoes: string[];
  apresentacaoId: number;
  /** Item que vem do cadastro, não de um registro — exibido sem botão de remover. */
  fixo: { nome: string; motivo: string } | null;
  onMudou: () => void;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [salvando, setSalvando] = useState(false);

  const adicionar = async () => {
    const limpo = nome.trim();
    if (limpo === '') return;
    setSalvando(true);
    const { error } = await adicionarItemDePalco(apresentacaoId, { tipo, nome: limpo, quantidade });
    setSalvando(false);
    if (error) {
      toast.error(`Não consegui adicionar: ${error.message}`);
      return;
    }
    // O campo continua aberto: quem cadastra três equipamentos seguidos não quer reabrir a
    // linha a cada um.
    setNome('');
    setQuantidade(1);
    onMudou();
  };

  const vazio = itens.length === 0 && !fixo;

  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
      <Rotulo>{rotulo}</Rotulo>

      <div className="flex min-w-[200px] flex-1 flex-wrap items-center gap-1 pt-0.5">
        {vazio && !adicionando && <span className="text-[12.5px] italic text-slate-600">nenhum</span>}

        {fixo && (
          <span
            title={fixo.motivo}
            className="flex items-center gap-1 rounded border border-dashed border-slate-600 px-1.5 py-0.5 text-[11.5px] text-slate-300"
          >
            {fixo.nome}
            <span className="text-[10px] uppercase tracking-wide text-slate-600">do curso</span>
          </span>
        )}

        {itens.map((item) => (
          <span
            key={item.id}
            title={item.observacao ?? undefined}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px]',
              tipo === 'instrumento'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-sky-500/15 text-sky-300',
            )}
          >
            {item.quantidade > 1 && <span className="tabular-nums">{item.quantidade}×</span>}
            {item.nome}
            <button
              type="button"
              aria-label={`Remover ${item.nome}`}
              onClick={async () => {
                const { error } = await removerItemDePalco(item.id);
                if (error) toast.error(`Não consegui remover: ${error.message}`);
                else onMudou();
              }}
              // `text-current/50` não existe no Tailwind (opacidade de cor só em utilitário
              // com cor nomeada) — seria classe morta e o X ficaria na cor cheia.
              className="opacity-60 transition hover:text-rose-400 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {adicionando ? (
          <span className="flex items-center gap-1">
            <Input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  adicionar();
                }
                // Esc fecha sem gravar — o campo nasce aberto no meio da linha, e sem saída
                // pelo teclado quem abriu por engano precisa mirar um botão.
                if (e.key === 'Escape') {
                  setNome('');
                  setAdicionando(false);
                }
              }}
              list={`itens-${tipo}-${apresentacaoId}`}
              placeholder={tipo === 'instrumento' ? 'Cajón' : 'Amplificador'}
              className="h-6 w-[140px] text-[12px]"
            />
            {/* As sugestões vêm do que já foi digitado NESTE evento: é o que faz "Violão" e
                "violao" convergirem antes de virarem duas linhas na lista de montagem. */}
            <datalist id={`itens-${tipo}-${apresentacaoId}`}>
              {sugestoes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Input
              type="number"
              min={1}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))}
              className="h-6 w-12 text-[12px]"
              title="Quantidade"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11.5px]"
              onClick={adicionar}
              disabled={salvando || nome.trim() === ''}
            >
              ok
            </Button>
            <button
              type="button"
              onClick={() => {
                setNome('');
                setAdicionando(false);
              }}
              aria-label="Cancelar"
              className="text-slate-600 hover:text-slate-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11.5px] text-slate-600 transition-colors hover:text-slate-300"
          >
            <Plus className="h-3 w-3" />
            adicionar
          </button>
        )}
      </div>
    </div>
  );
}
