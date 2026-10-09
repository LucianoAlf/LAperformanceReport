import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Award, CheckCircle2, Clock, ListOrdered, Search, Ticket, UserCheck, Users, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  idadeHoje,
  montarListaDeChegada,
  ordenarPessoasDaPorta,
  rotuloIdade,
  type EntradaDaChegada,
  type LinhaDaChegada,
  type PessoaNaChegada,
} from '@/lib/eventos';
import { entradaDaChegada } from './entradaDaChegada';
import {
  marcarChegada,
  marcarCheckinConvidado,
  useCheckinDoEvento,
  useConvidadosDoEvento,
  useGradeDoEvento,
  PARTICIPACAO_SELO,
  type BlocoDaGrade,
  type ConvidadoDaPorta,
  type EventoComResumo,
  type ParticipacaoStatus,
} from '@/hooks/useEventos';
import { PainelCheckin } from './PainelDoRecital';

/**
 * Check-in do dia do recital — LAPE-39, fase 7.
 *
 * Duas visoes da MESMA informacao, porque o dia tem dois postos: a porta procura por NOME e
 * marca quem chegou; a coxia acompanha a ORDEM e precisa saber se o proximo ja esta no
 * teatro. Trocar de visao nao muda o dado, so o caminho de leitura.
 *
 * ⚠️ O horario exibido e o PREVISTO da grade. A tela nao tenta adivinhar onde o recital esta
 * pelo relogio: recital atrasa, e um "acontecendo agora" errado anunciaria a pessoa errada
 * com a confianca de um sistema.
 */
type Visao = 'porta' | 'palco';

export function CheckinTab({
  evento,
  onIrPara,
}: {
  evento: EventoComResumo;
  onIrPara?: (aba: 'documentos') => void;
}) {
  const { blocos, loading: carregandoGrade, erro: erroGrade } = useGradeDoEvento(evento.id);
  const {
    participacoes,
    loading: carregandoCheckin,
    erro: erroCheckin,
    recarregar,
  } = useCheckinDoEvento(evento.id);

  const [visao, setVisao] = useState<Visao>('porta');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  /** Chegadas ainda não confirmadas pelo banco, para o clique responder na hora. */
  const [otimista, setOtimista] = useState<Map<string, string | null>>(new Map());

  const entrada = useMemo<EntradaDaChegada>(
    () =>
      entradaDaChegada(
        evento,
        blocos,
        // O otimista sobrepõe o que veio do banco até a releitura chegar.
        participacoes.map((p) => ({
          ...p,
          checkin_em: otimista.has(p.pessoa_chave)
            ? (otimista.get(p.pessoa_chave) ?? null)
            : p.checkin_em,
        })),
      ),
    [evento, blocos, participacoes, otimista],
  );

  const lista = useMemo(() => montarListaDeChegada(entrada), [entrada]);

  // Idade por PESSOA, como o check-in: a grade traz a de quem sobe ao palco, e a participacao
  // cobre quem confirmou e nao entrou em bloco nenhum.
  const idadePorPessoa = useMemo(() => {
    const nascimento = new Map<string, string | null>();
    for (const b of blocos) {
      for (const a of b.apresentacoes) {
        if (!nascimento.get(a.pessoa_chave)) nascimento.set(a.pessoa_chave, a.aluno_data_nascimento);
      }
    }
    for (const p of participacoes) {
      if (!nascimento.get(p.pessoa_chave)) nascimento.set(p.pessoa_chave, p.data_nascimento);
    }
    return new Map([...nascimento].map(([chave, data]) => [chave, rotuloIdade(idadeHoje(data))]));
  }, [blocos, participacoes]);

  const termo = busca.trim().toLowerCase();
  const casa = (texto: string) =>
    termo === '' ||
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/gu, '')
      .toLowerCase()
      .includes(
        termo
          .normalize('NFD')
          .replace(/[̀-ͯ]/gu, '')
          .toLowerCase(),
      );

  const pessoasVisiveis = useMemo(
    () => ordenarPessoasDaPorta(lista.pessoas).filter((p) => casa(p.nome)),
    [lista.pessoas, termo],
  );
  // A busca filtra DENTRO do bloco e o bloco vazio some da tela — mas o cabeçalho de quem
  // sobra continua mostrando a contagem REAL do bloco, não a da busca: número que muda
  // conforme se digita deixa de ser um placar e vira ruído.
  const blocosVisiveis = useMemo(
    () =>
      lista.blocos
        .map((b) => ({
          ...b,
          linhas: b.linhas.filter((l) => casa(`${l.alunoNome} ${l.cursoNome ?? ''} ${l.musica ?? ''}`)),
        }))
        .filter((b) => b.linhas.length > 0),
    [lista.blocos, termo],
  );

  const alternar = async (pessoaChave: string, alunoId: number, chegou: boolean) => {
    const quando = chegou ? new Date().toISOString() : null;
    setOtimista((m) => new Map(m).set(pessoaChave, quando));
    setSalvando((s) => new Set(s).add(pessoaChave));

    const { error } = await marcarChegada(evento.id, pessoaChave, alunoId, chegou);

    setSalvando((s) => {
      const proximo = new Set(s);
      proximo.delete(pessoaChave);
      return proximo;
    });

    if (error) {
      // Desfaz a marca otimista: manter a tela verde sobre um banco que não gravou é a
      // falha silenciosa que a RLS desta tabela produz por construção.
      setOtimista((m) => {
        const proximo = new Map(m);
        proximo.delete(pessoaChave);
        return proximo;
      });
      toast.error(error.message);
      return;
    }
    await recarregar();
    setOtimista((m) => {
      const proximo = new Map(m);
      proximo.delete(pessoaChave);
      return proximo;
    });
  };

  const erro = erroGrade ?? erroCheckin;
  if (erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar o check-in: {erro}
      </p>
    );
  }

  if ((carregandoGrade || carregandoCheckin) && lista.pessoas.length === 0) {
    return <p className="p-8 text-center text-sm text-slate-400">Carregando check-in…</p>;
  }

  const { resumo } = lista;

  return (
    // flex-col (e não space-y) para o celular poder mandar os certificados para o fim:
    // na porta, no dia, o que se usa primeiro é a lista de chegada.
    <div className="flex flex-col gap-4">
      <PainelCheckin
        esperados={resumo.esperados}
        chegaram={resumo.chegaram}
        apresentacoes={resumo.apresentacoes}
        apresentacoesSemChegada={resumo.apresentacoesSemChegada}
        blocos={lista.blocos.map((b) => ({
          id: b.blocoId,
          nome: b.nome,
          inicio: b.inicio,
          pessoas: b.pessoas,
          chegaram: b.chegaram,
        }))}
      />

      {resumo.esperados === 0 && (
        <p className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-[13px] text-slate-400">
          Ninguém confirmado nem alocado ainda. O check-in lista quem está nos blocos e quem
          confirmou participação na aba Alunos.
        </p>
      )}

      {onIrPara && resumo.esperados > 0 && (
        <button
          type="button"
          onClick={() => onIrPara('documentos')}
          className="order-last flex items-center gap-2 self-start rounded-lg px-2 py-1 text-[12px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 sm:order-none"
        >
          <Award className="h-3.5 w-3.5 text-amber-400" />
          Certificados ficam na aba Documentos →
        </button>
      )}

      {resumo.esperados > 0 && (
        <>
          {/* Celular: busca e Por nome/Por bloco grudam no topo enquanto a lista rola —
              com 260 pessoas, voltar ao topo para procurar o próximo nome é o gargalo da porta. */}
          <div className="sticky top-0 z-10 -mx-3 -my-2 flex before:absolute before:inset-x-0 before:-top-3 before:h-3 before:bg-slate-950 before:content-[''] sm:before:hidden flex-wrap items-center justify-between gap-2 bg-slate-950/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:my-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="flex items-center gap-1">
              <Chip rotulo="Por nome" ativo={visao === 'porta'} onClick={() => setVisao('porta')} />
              <Chip
                rotulo="Por bloco"
                ativo={visao === 'palco'}
                onClick={() => setVisao('palco')}
              />
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Procurar por nome…"
                className="h-11 pl-8 text-[16px] sm:h-8 sm:text-[13px]"
              />
            </div>
          </div>

          {visao === 'porta' ? (
            <div className="space-y-1.5">
              {pessoasVisiveis.length === 0 ? (
                <p className="p-6 text-center text-[13px] text-slate-500">
                  Ninguém com esse nome na lista do dia.
                </p>
              ) : (
                pessoasVisiveis.map((p) => (
                  <LinhaPessoa
                    key={p.pessoaChave}
                    pessoa={p}
                    idade={idadePorPessoa.get(p.pessoaChave) ?? ''}
                    salvando={salvando.has(p.pessoaChave)}
                    onAlternar={() => alternar(p.pessoaChave, p.alunoId, p.chegouEm === null)}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {blocosVisiveis.length === 0 ? (
                <p className="p-6 text-center text-[13px] text-slate-500">
                  Nenhuma apresentação para esse termo.
                </p>
              ) : (
                blocosVisiveis.map((b) => (
                  <section key={b.blocoId} className="space-y-1.5">
                    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-slate-700 pb-1">
                      <h3 className="text-[13px] font-semibold text-white">
                        {b.nome}
                        <span className="ml-2 text-[12px] sm:text-[11.5px] font-normal tabular-nums text-slate-500">
                          {b.inicio}
                        </span>
                      </h3>
                      <p className="text-[12px] sm:text-[11.5px] tabular-nums">
                        {b.faltam === 0 ? (
                          <span className="text-emerald-300">
                            {b.pessoas === 1 ? 'a pessoa deste bloco chegou' : 'todos deste bloco chegaram'}
                          </span>
                        ) : (
                          <span className="text-amber-300">
                            faltam {b.faltam} de {b.pessoas}
                          </span>
                        )}
                      </p>
                    </header>
                    {b.linhas.map((l) => (
                      <LinhaOrdem
                        key={l.apresentacaoId}
                        linha={l}
                        idade={idadePorPessoa.get(l.pessoaChave) ?? ''}
                        salvando={salvando.has(l.pessoaChave)}
                        onAlternar={() => alternar(l.pessoaChave, l.alunoId, l.chegouEm === null)}
                      />
                    ))}
                  </section>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Convidados nominais (M3/M9): cortesia e vendido na mesma lista da porta,
          com check-in por bloco. Vendido sem 'pago' aparece com o selo amber e o
          banco barra a entrada — a tela mostra o motivo antes do clique. */}
      <SecaoConvidados eventoId={evento.id} blocos={blocos} termo={termo} />
    </div>
  );
}

/* Chip local: o do RevisaoTab é privado daquele arquivo, e o projeto não tem segmented
   control compartilhado — copiar 15 linhas é o que a AgendaPage já fez com o `Grupo`. */
function Chip({ rotulo, ativo, onClick }: { rotulo: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'min-h-[44px] rounded px-3 py-1 text-[13px] transition-colors sm:min-h-0 sm:px-2.5 sm:text-[12px]',
        ativo ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:bg-slate-700/60',
      )}
    >
      {rotulo}
    </button>
  );
}

function Cartao({
  icone,
  rotulo,
  valor,
  rodape,
  destaque,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: number | string;
  rodape?: string;
  destaque?: 'emerald' | 'amber';
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2.5 sm:p-3">
      <p className="flex items-center gap-1.5 text-[12px] sm:text-[11px] uppercase tracking-wide text-slate-500">
        {icone}
        {rotulo}
      </p>
      <p
        className={cn(
          'mt-1 text-[20px] font-semibold tabular-nums',
          destaque === 'emerald' ? 'text-emerald-300' : destaque === 'amber' ? 'text-amber-300' : 'text-white',
        )}
      >
        {valor}
      </p>
      {rodape && <p className="text-[12px] sm:text-[11px] text-slate-500">{rodape}</p>}
    </div>
  );
}

function SeloChegada({ chegouEm }: { chegouEm: string | null }) {
  if (chegouEm === null) {
    // Celular: o botão "Chegou" ao lado já diz que falta — o selo só tomava largura do nome.
    return <span className="hidden text-[11.5px] text-slate-500 sm:inline">aguardando</span>;
  }
  const hora = new Date(chegouEm).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <span className="flex items-center gap-1 text-[12px] sm:text-[11.5px] text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5" />
      chegou {hora}
    </span>
  );
}

function LinhaPessoa({
  pessoa,
  idade,
  salvando,
  onAlternar,
}: {
  pessoa: PessoaNaChegada;
  /** '12 anos' ou '' — ajuda a porta a achar a criança certa entre dois nomes parecidos. */
  idade: string;
  salvando: boolean;
  onAlternar: () => void;
}) {
  const chegou = pessoa.chegouEm !== null;
  const selo = PARTICIPACAO_SELO[pessoa.status as ParticipacaoStatus] ?? PARTICIPACAO_SELO.indefinido;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 sm:py-2',
        chegou ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-white sm:truncate sm:text-[13px]">
          {pessoa.nome}
          {idade && <span className="font-normal text-slate-500"> · {idade}</span>}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-[12px] sm:text-[11.5px] text-slate-400">
          {pessoa.apresentacoes.length === 0 ? (
            // Confirmou e não entrou na grade: vem ao evento, não sobe ao palco. Dizer isso
            // evita que a porta ache que perdeu uma apresentação.
            <span className="text-slate-500">confirmado · sem apresentação nos blocos</span>
          ) : (
            pessoa.apresentacoes.map((a) => (
              <span key={a.apresentacaoId}>
                {a.horario} {a.cursoNome ?? 'curso'} <span className="text-slate-600">·</span>{' '}
                {a.blocoNome}
              </span>
            ))
          )}
          {pessoa.status !== 'participa' && (
            <span className={cn('flex items-center gap-1', selo.texto)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', selo.ponto)} />
              {selo.rotulo}
            </span>
          )}
        </p>
      </div>

      <SeloChegada chegouEm={pessoa.chegouEm} />

      <Button
        size="sm"
        variant={chegou ? 'ghost' : 'outline'}
        className="h-11 min-w-[104px] gap-1.5 sm:h-9 sm:min-w-0"
        disabled={salvando}
        onClick={onAlternar}
      >
        {chegou ? <X className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
        {salvando ? '…' : chegou ? 'Desfazer' : 'Chegou'}
      </Button>
    </div>
  );
}

function LinhaOrdem({
  linha,
  idade,
  salvando,
  onAlternar,
}: {
  linha: LinhaDaChegada;
  idade: string;
  salvando: boolean;
  onAlternar: () => void;
}) {
  const chegou = linha.chegouEm !== null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 sm:py-2',
        chegou ? 'border-slate-700 bg-slate-800/40' : 'border-amber-500/30 bg-amber-500/5',
      )}
    >
      {/* Celular: a posição sai — o horário ao lado já dá a ordem, e o nome precisa da largura. */}
      <span className="hidden w-7 shrink-0 text-right text-[12px] tabular-nums text-slate-500 sm:inline">
        {linha.posicao}
      </span>
      <span className="w-11 shrink-0 self-start pt-0.5 text-[13px] font-medium tabular-nums text-amber-300/90 sm:self-auto sm:pt-0 sm:text-[12px] sm:font-normal sm:text-slate-300">{linha.horario}</span>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-white sm:truncate sm:text-[13px]">
          {linha.alunoNome}
          {idade && <span className="text-slate-500"> · {idade}</span>}
          {linha.cursoNome && <span className="text-slate-400"> · {linha.cursoNome}</span>}
        </p>
        {/* O bloco não se repete aqui: ele é o cabeçalho da seção logo acima. */}
        <p className="text-[12px] sm:text-[11.5px] text-slate-500 sm:truncate">
          {linha.musica?.trim() || <span className="italic">música não definida</span>}
          {linha.outrasApresentacoes > 0 && (
            // O check-in é da pessoa: sem este aviso, quem opera acharia que precisa marcar
            // de novo na próxima apresentação dela — ou que a marca vazou de algum lugar.
            <span className="text-slate-500">
              {' '}
              · sobe ao palco mais {linha.outrasApresentacoes}×
            </span>
          )}
        </p>
      </div>

      <SeloChegada chegouEm={linha.chegouEm} />

      <Button
        size="sm"
        variant={chegou ? 'ghost' : 'outline'}
        className="h-11 min-w-[104px] gap-1.5 sm:h-9 sm:min-w-0"
        disabled={salvando}
        onClick={onAlternar}
      >
        {chegou ? <X className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
        {salvando ? '…' : chegou ? 'Desfazer' : 'Chegou'}
      </Button>
    </div>
  );
}

/** Lista nominal da porta (M3/M9): cortesia e vendido, check-in por bloco credenciado. */
function SecaoConvidados({
  eventoId,
  blocos,
  termo,
}: {
  eventoId: number;
  blocos: BlocoDaGrade[];
  termo: string;
}) {
  const { convidados, loading, recarregar } = useConvidadosDoEvento(eventoId);
  const [ocupado, setOcupado] = useState<Set<number>>(new Set());

  const nomeDoBloco = (id: number | null) =>
    blocos.find((b) => b.id === id)?.nome ?? (id != null ? `Bloco ${id}` : null);

  const alternarConvidado = async (c: ConvidadoDaPorta) => {
    if (c.bloco_id == null) {
      toast.error('Este convidado ainda não tem bloco credenciado.');
      return;
    }
    setOcupado((s) => new Set(s).add(c.id));
    const { error } = await marcarCheckinConvidado(c.id, c.bloco_id, c.checkin_em === null);
    setOcupado((s) => {
      const prox = new Set(s);
      prox.delete(c.id);
      return prox;
    });
    if (error) {
      // o banco devolve a frase pronta — ex.: "Ingresso vendido so entra com a venda paga"
      toast.error(error.message);
      return;
    }
    await recarregar();
  };

  if (loading) return null;
  if (convidados.length === 0) return null;

  const visiveis = convidados.filter(
    (c) => termo === '' || `${c.nome} ${c.alunos.join(' ')}`.toLowerCase().includes(termo),
  );
  const entraram = convidados.filter((c) => c.checkin_em !== null).length;

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/40">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-[12px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Ticket className="h-3.5 w-3.5" />
          Convidados
        </h3>
        <p className="text-[12px] sm:text-[11.5px] tabular-nums text-slate-500">
          {entraram} de {convidados.length} entraram
        </p>
      </header>
      <div className="divide-y divide-slate-700/40">
        {visiveis.map((c) => {
          const entrou = c.checkin_em !== null;
          const pendenteDePagamento = c.tipo_entrada === 'vendido' && c.venda_status !== 'pago';
          return (
            <div
              key={c.id}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2',
                entrou && 'bg-emerald-500/5',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-white">
                  {c.nome}
                  <span
                    className={cn(
                      'ml-2 rounded px-1.5 py-0.5 text-[12px] sm:text-[10.5px]',
                      c.tipo_entrada === 'vendido'
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'bg-violet-500/15 text-violet-300',
                    )}
                  >
                    {c.tipo_entrada === 'vendido' ? 'vendido' : 'cortesia'}
                  </span>
                  {pendenteDePagamento && (
                    <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[12px] sm:text-[10.5px] text-amber-300">
                      pagamento pendente
                    </span>
                  )}
                </p>
                <p className="truncate text-[12px] sm:text-[11.5px] text-slate-500">
                  {nomeDoBloco(c.bloco_id) ?? 'sem bloco credenciado'}
                  {c.alunos.length > 0 && ` · veio por ${c.alunos.join(', ')}`}
                </p>
              </div>
              {entrou ? (
                <>
                  <SeloChegada chegouEm={c.checkin_em} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    disabled={ocupado.has(c.id)}
                    onClick={() => alternarConvidado(c)}
                  >
                    <X className="h-3.5 w-3.5" />
                    Desfazer
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={ocupado.has(c.id)}
                  onClick={() => alternarConvidado(c)}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  {ocupado.has(c.id) ? '…' : 'Entrou'}
                </Button>
              )}
            </div>
          );
        })}
        {visiveis.length === 0 && (
          <p className="px-4 py-6 text-center text-[12.5px] text-slate-500">
            Nenhum convidado com esse nome.
          </p>
        )}
      </div>
    </section>
  );
}

export default CheckinTab;
