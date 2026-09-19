import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Clock, ListOrdered, Search, UserCheck, Users, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  montarListaDeChegada,
  ordenarPessoasDaPorta,
  type EntradaDaChegada,
  type LinhaDaChegada,
  type PessoaNaChegada,
} from '@/lib/eventos';
import {
  marcarChegada,
  useCheckinDoEvento,
  useGradeDoEvento,
  PARTICIPACAO_SELO,
  type EventoComResumo,
  type ParticipacaoStatus,
} from '@/hooks/useEventos';

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

export function CheckinTab({ evento }: { evento: EventoComResumo }) {
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
    () => ({
      evento: {
        horario_inicio: evento.horario_inicio,
        duracao_padrao_segundos: evento.duracao_padrao_segundos,
        intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
      },
      blocos: blocos.map((b) => ({
        id: b.id,
        nome: b.nome,
        ordem: b.ordem,
        horario_inicial: b.horario_inicial,
        inicio_manual: b.inicio_manual,
        apresentacoes: b.apresentacoes.map((a) => ({
          id: a.id,
          ordem: a.ordem,
          duracao_segundos: a.duracao_segundos,
          pessoa_chave: a.pessoa_chave,
          aluno_id: a.aluno_id,
          aluno_nome: a.aluno_nome,
          curso_nome: a.curso_nome,
          musica: a.musica,
        })),
      })),
      participacoes: participacoes.map((p) => ({
        pessoa_chave: p.pessoa_chave,
        nome: p.nome,
        status: p.status,
        // O otimista sobrepõe o que veio do banco até a releitura chegar.
        checkin_em: otimista.has(p.pessoa_chave)
          ? (otimista.get(p.pessoa_chave) ?? null)
          : p.checkin_em,
        aluno_id: p.aluno_id,
      })),
    }),
    [evento, blocos, participacoes, otimista],
  );

  const lista = useMemo(() => montarListaDeChegada(entrada), [entrada]);

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
    <div className="space-y-4">
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao icone={<Users className="h-4 w-4" />} rotulo="Esperados" valor={resumo.esperados} />
        <Cartao
          icone={<UserCheck className="h-4 w-4" />}
          rotulo="Chegaram"
          valor={resumo.chegaram}
          destaque="emerald"
        />
        <Cartao
          icone={<Clock className="h-4 w-4" />}
          rotulo="Faltam"
          valor={resumo.faltam}
          destaque={resumo.faltam > 0 ? 'amber' : undefined}
        />
        <Cartao
          icone={<ListOrdered className="h-4 w-4" />}
          rotulo="Apresentações"
          valor={resumo.apresentacoes}
          rodape={
            resumo.apresentacoesSemChegada > 0
              ? `${resumo.apresentacoesSemChegada} com a pessoa ainda fora`
              : resumo.apresentacoes > 0
                ? 'todo mundo da grade chegou'
                : 'grade vazia'
          }
        />
      </section>

      {resumo.esperados === 0 && (
        <p className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-[13px] text-slate-400">
          Ninguém confirmado nem alocado ainda. O check-in lista quem está na grade e quem
          confirmou participação na aba Alunos.
        </p>
      )}

      {resumo.esperados > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
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
                className="h-8 pl-8 text-[13px]"
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
                        <span className="ml-2 text-[11.5px] font-normal tabular-nums text-slate-500">
                          {b.inicio}
                        </span>
                      </h3>
                      <p className="text-[11.5px] tabular-nums">
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
        'rounded px-2.5 py-1 text-[12px] transition-colors',
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
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
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
      {rodape && <p className="text-[11px] text-slate-500">{rodape}</p>}
    </div>
  );
}

function SeloChegada({ chegouEm }: { chegouEm: string | null }) {
  if (chegouEm === null) {
    return <span className="text-[11.5px] text-slate-500">aguardando</span>;
  }
  const hora = new Date(chegouEm).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <span className="flex items-center gap-1 text-[11.5px] text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5" />
      chegou {hora}
    </span>
  );
}

function LinhaPessoa({
  pessoa,
  salvando,
  onAlternar,
}: {
  pessoa: PessoaNaChegada;
  salvando: boolean;
  onAlternar: () => void;
}) {
  const chegou = pessoa.chegouEm !== null;
  const selo = PARTICIPACAO_SELO[pessoa.status as ParticipacaoStatus] ?? PARTICIPACAO_SELO.indefinido;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2',
        chegou ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white">{pessoa.nome}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-slate-400">
          {pessoa.apresentacoes.length === 0 ? (
            // Confirmou e não entrou na grade: vem ao evento, não sobe ao palco. Dizer isso
            // evita que a porta ache que perdeu uma apresentação.
            <span className="text-slate-500">confirmado · sem apresentação na grade</span>
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
        className="gap-1.5"
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
  salvando,
  onAlternar,
}: {
  linha: LinhaDaChegada;
  salvando: boolean;
  onAlternar: () => void;
}) {
  const chegou = linha.chegouEm !== null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2',
        chegou ? 'border-slate-700 bg-slate-800/40' : 'border-amber-500/30 bg-amber-500/5',
      )}
    >
      <span className="w-7 shrink-0 text-right text-[12px] tabular-nums text-slate-500">
        {linha.posicao}
      </span>
      <span className="w-11 shrink-0 text-[12px] tabular-nums text-slate-300">{linha.horario}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-white">
          {linha.alunoNome}
          {linha.cursoNome && <span className="text-slate-400"> · {linha.cursoNome}</span>}
        </p>
        {/* O bloco não se repete aqui: ele é o cabeçalho da seção logo acima. */}
        <p className="truncate text-[11.5px] text-slate-500">
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
        className="gap-1.5"
        disabled={salvando}
        onClick={onAlternar}
      >
        {chegou ? <X className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
        {salvando ? '…' : chegou ? 'Desfazer' : 'Chegou'}
      </Button>
    </div>
  );
}

export default CheckinTab;
