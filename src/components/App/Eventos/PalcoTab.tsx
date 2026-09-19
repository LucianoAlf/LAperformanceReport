import { useMemo } from 'react';
import { MapPin, Music2, Speaker, Volume2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  calcularHorariosDaGrade,
  consolidarItensDoPalco,
  type ApresentacaoParaPalco,
  type ItemConsolidado,
} from '@/lib/eventos';
import { useGradeDoEvento, type EventoComResumo } from '@/hooks/useEventos';

/**
 * A folha de montagem do palco — LAPE-39, fase 4.
 *
 * A aba Grade mostra o palco POR APRESENTACAO, que e onde se cadastra; aqui e a visao de
 * quem vai montar: o que precisa existir no evento inteiro, o que muda a cada bloco, quem
 * usa playback e o que esta escrito nos mapas.
 *
 * ⚠️ Nao duplica regra: a consolidacao e a MESMA funcao que o rodape do bloco usa
 * (`consolidarItensDoPalco`). Reimplementar aqui faria a folha de montagem e a grade
 * discordarem sobre quantos violoes o recital precisa — que e a familia de defeito das
 * duplicatas de renovacao.
 */
export function PalcoTab({ evento }: { evento: EventoComResumo }) {
  const { blocos, loading, erro } = useGradeDoEvento(evento.id);

  const horarios = useMemo(
    () =>
      calcularHorariosDaGrade(
        {
          horario_inicio: evento.horario_inicio,
          duracao_padrao_segundos: evento.duracao_padrao_segundos,
          intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
        },
        blocos.map((b) => ({
          id: b.id,
          ordem: b.ordem,
          horario_inicial: b.horario_inicial,
          inicio_manual: b.inicio_manual,
          apresentacoes: b.apresentacoes.map((a) => ({
            id: a.id,
            ordem: a.ordem,
            duracao_segundos: a.duracao_segundos,
          })),
        })),
      ),
    [evento, blocos],
  );

  const paraPalco = (bs: typeof blocos): ApresentacaoParaPalco[] =>
    bs.flatMap((b) =>
      b.apresentacoes.map((a) => ({ cursoNome: a.curso_nome, itens: a.itens })),
    );

  /**
   * O que o evento inteiro precisa.
   *
   * ⚠️ NAO e a soma dos blocos: todas as apresentacoes do recital sao sequenciais, entao o
   * pico global e o maior pedido de uma unica apresentacao — somar os picos de cada bloco
   * mandaria providenciar um palco por bloco.
   */
  const palcoDoEvento = useMemo(() => consolidarItensDoPalco(paraPalco(blocos)), [blocos]);

  const comPlayback = useMemo(
    () =>
      blocos.flatMap((b) =>
        b.apresentacoes.filter((a) => a.tem_playback).map((a) => ({ bloco: b.nome, ap: a })),
      ),
    [blocos],
  );

  const comMapa = useMemo(
    () =>
      blocos.flatMap((b) =>
        b.apresentacoes
          .filter((a) => (a.observacao_mapa ?? '').trim() !== '')
          .map((a) => ({ bloco: b.nome, ap: a })),
      ),
    [blocos],
  );

  const totalApresentacoes = blocos.reduce((s, b) => s + b.apresentacoes.length, 0);

  if (erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar o palco: {erro}
      </p>
    );
  }

  if (loading && blocos.length === 0) {
    return <p className="p-8 text-center text-sm text-slate-400">Carregando palco…</p>;
  }

  if (totalApresentacoes === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
        <Speaker className="mx-auto h-8 w-8 text-slate-600" />
        <p className="mt-3 text-sm text-slate-300">A grade ainda está vazia.</p>
        <p className="mt-1 text-[12.5px] text-slate-500">
          O palco é montado a partir das apresentações — comece pela aba Grade.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-slate-400">
        O que precisa estar no palco. O instrumento sai do curso de cada apresentação; o resto
        é o que foi registrado na Grade.
      </p>

      {/* ── o evento inteiro ── */}
      <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          O recital inteiro precisa de
        </h3>
        {palcoDoEvento.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-slate-500">
            Nenhum instrumento ou equipamento — nenhuma apresentação tem curso com instrumento
            nem item registrado.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {palcoDoEvento.map((item) => (
                <Etiqueta key={`${item.tipo}-${item.nome}`} item={item} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              O número é quanto precisa existir <strong className="text-slate-400">ao mesmo
              tempo</strong>, não quantas vezes é usado — as apresentações são uma depois da
              outra, então o mesmo violão serve a várias.
            </p>
          </>
        )}
      </section>

      {/* ── por bloco ── */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Por bloco
        </h3>
        {blocos.map((bloco) => {
          const h = horarios.find((x) => x.blocoId === bloco.id);
          const itens = consolidarItensDoPalco(paraPalco([bloco]));
          return (
            <div
              key={bloco.id}
              className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-[13px] font-medium text-white">{bloco.nome}</span>
                {h && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11.5px] tabular-nums text-amber-300">
                    {h.inicio} – {h.fim}
                  </span>
                )}
                <span className="text-[11.5px] text-slate-500">
                  {bloco.apresentacoes.length}{' '}
                  {bloco.apresentacoes.length === 1 ? 'apresentação' : 'apresentações'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {itens.length === 0 ? (
                  <span className="text-[12px] italic text-slate-600">
                    nada registrado para este bloco
                  </span>
                ) : (
                  itens.map((item) => <Etiqueta key={`${item.tipo}-${item.nome}`} item={item} />)
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── playback ── */}
      <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Volume2 className="h-3.5 w-3.5" />
          Playback ({comPlayback.length})
        </h3>
        {comPlayback.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] text-slate-500">
            Nenhuma apresentação usa playback.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {comPlayback.map(({ bloco, ap }) => (
              <li key={ap.id} className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
                <span className="text-slate-200">{ap.aluno_nome}</span>
                <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10.5px] text-amber-300">
                  {ap.curso_nome}
                </span>
                {ap.musica && <span className="text-slate-400">{ap.musica}</span>}
                <span className="text-[11px] text-slate-600">{bloco}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── mapas ── */}
      <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <MapPin className="h-3.5 w-3.5" />
          Observações de palco ({comMapa.length})
        </h3>
        {comMapa.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] text-slate-500">
            Nenhuma observação registrada. Elas são escritas na Grade, em cada apresentação.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {comMapa.map(({ bloco, ap }) => (
              <li key={ap.id} className="border-l-2 border-slate-700 pl-2.5">
                <div className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
                  <span className="text-slate-200">{ap.aluno_nome}</span>
                  <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10.5px] text-amber-300">
                    {ap.curso_nome}
                  </span>
                  <span className="text-[11px] text-slate-600">{bloco}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-slate-400">{ap.observacao_mapa}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Etiqueta({ item }: { item: ItemConsolidado }) {
  return (
    <span
      title={
        `aparece em ${item.apresentacoes} apresentaç${item.apresentacoes > 1 ? 'ões' : 'ão'}` +
        (item.doCurso ? ' · veio do curso, ninguém digitou' : '')
      }
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px]',
        item.tipo === 'instrumento'
          ? 'bg-amber-500/10 text-amber-300/90'
          : 'bg-sky-500/10 text-sky-300/90',
        // Cor nomeada, não `border-current/30`: opacidade sobre currentColor não gera
        // classe no Tailwind e a borda sairia sem estilo nenhum.
        item.doCurso && 'border border-dashed border-slate-600',
      )}
    >
      {item.tipo === 'instrumento' ? (
        <Music2 className="h-3 w-3 shrink-0" />
      ) : (
        <Speaker className="h-3 w-3 shrink-0" />
      )}
      <strong className="tabular-nums">{item.quantidade}×</strong> {item.nome}
      <span className="text-[10.5px] opacity-60">({item.apresentacoes})</span>
    </span>
  );
}
