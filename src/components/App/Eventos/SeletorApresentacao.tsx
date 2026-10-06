import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, X, Plus, Music, Users } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { normalizarBusca } from '@/lib/agenda';
import { ehMusicalizacao } from '@/lib/eventos';
import {
  useAlunosDoEvento,
  adicionarApresentacao,
  juntarApresentacao,
  PARTICIPACAO_SELO,
  type AlunoElegivel,
} from '@/hooks/useEventos';

/** Familiar que também é aluno ativo da unidade — vem de `vw_evento_familia_v1`. */
interface Familiar {
  chave: string;
  nome: string;
  /** `responsavel`: o familiar é o responsável cadastrado desta pessoa. `dependente`: o inverso. */
  papel: 'responsavel' | 'dependente';
}

/**
 * Famílias da unidade: telefone do responsável = telefone de um aluno adulto E o primeiro nome
 * bate (regra no banco, medida em 06/10: 45 pares). Lida à parte da lista de candidatos de
 * propósito — se falhar, o seletor continua funcionando e só o filtro fica indisponível.
 */
function useFamiliasDaUnidade(unidadeId: string) {
  const [familias, setFamilias] = useState<Map<string, Familiar[]>>(new Map());
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    supabase
      .from('vw_evento_familia_v1')
      .select('pessoa_chave, familiar_chave, familiar_nome, familiar_papel')
      .eq('unidade_id', unidadeId)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          console.error(`[eventos] familias da unidade ${unidadeId}: ${error.message}`);
          setErro(error.message);
          return;
        }
        const mapa = new Map<string, Familiar[]>();
        for (const r of data ?? []) {
          const lista = mapa.get(r.pessoa_chave as string) ?? [];
          lista.push({
            chave: r.familiar_chave as string,
            nome: r.familiar_nome as string,
            papel: r.familiar_papel as Familiar['papel'],
          });
          mapa.set(r.pessoa_chave as string, lista);
        }
        setFamilias(mapa);
      });
    return () => {
      vivo = false;
    };
  }, [unidadeId]);

  return { familias, erro };
}

/**
 * Agrupa em FAMÍLIAS: quem está ligado a quem, direta ou indiretamente (mãe + dois filhos é uma
 * família só, embora a view devolva dois pares). Devolve pessoa_chave → chave do grupo.
 */
function agruparFamilias(familias: Map<string, Familiar[]>): Map<string, string> {
  const pai = new Map<string, string>();
  const raiz = (k: string): string => {
    let r = k;
    while (pai.has(r) && pai.get(r) !== r) r = pai.get(r)!;
    pai.set(k, r);
    return r;
  };
  for (const [k, lista] of familias) {
    if (!pai.has(k)) pai.set(k, k);
    for (const f of lista) {
      if (!pai.has(f.chave)) pai.set(f.chave, f.chave);
      const a = raiz(k);
      const b = raiz(f.chave);
      if (a !== b) pai.set(b, a);
    }
  }
  const grupo = new Map<string, string>();
  for (const k of pai.keys()) grupo.set(k, raiz(k));
  return grupo;
}

/**
 * "Responsável: Flávia Telles" / "Responsável por Eva Esteves e Lia Esteves". O sentido vem do
 * cadastro: é o `responsavel_nome`/telefone do aluno que aponta para o outro.
 */
function descreverVinculo(lista: Familiar[]): string {
  const juntar = (n: string[]) =>
    n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
  const responsaveis = lista.filter((f) => f.papel === 'responsavel').map((f) => nomeCurto(f.nome));
  const dependentes = lista.filter((f) => f.papel === 'dependente').map((f) => nomeCurto(f.nome));
  const partes: string[] = [];
  if (responsaveis.length) partes.push(`Responsável: ${juntar(responsaveis)}`);
  if (dependentes.length) partes.push(`Responsável por ${juntar(dependentes)}`);
  return partes.join(' · ');
}

/** Primeiro + último nome — o nome inteiro do familiar não cabe na linha do celular. */
function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : nome;
}

/** Uma opção é um PAR (pessoa, curso) — o mesmo grão da UNIQUE e da grade. */
interface Opcao {
  chave: string;
  aluno: AlunoElegivel;
  curso_id: number;
  curso_nome: string | null;
  professor_nome: string | null;
  jaNaGrade: boolean;
  /** Bloco onde ela ja esta, quando `jaNaGrade` — e o que a confirmacao de "mover" nomeia. */
  blocoAtual: string | null;
  /** Ja faz parte do numero em que se esta adicionando (so no modo juntar). */
  noNumero: boolean;
}

/**
 * As opções de UMA pessoa, juntas.
 *
 * A lista continua sendo de pares `(pessoa, curso)` — é o grão da UNIQUE e da grade —, mas
 * exibir cada par como uma linha solta repete o nome e esconde o que importa na hora de
 * montar: **esta pessoa faz Violão E Canto**. Medido em 18/09: 59 pessoas nas 3 unidades têm
 * 2+ cursos, e uma de Campo Grande tem quatro.
 */
interface Pessoa {
  chave: string;
  aluno: AlunoElegivel;
  opcoes: Opcao[];
  /** Quantos cursos dela ainda não entraram em bloco nenhum. */
  fora: number;
}

export function SeletorApresentacao({
  eventoId,
  unidadeId,
  blocoId,
  onFechar,
  onAdicionado,
  juntarCom,
}: {
  eventoId: number;
  /** Vem do EVENTO, nunca do filtro do topo — que pode estar em "Consolidado". */
  unidadeId: string;
  blocoId: number;
  onFechar: () => void;
  onAdicionado: () => void;
  /**
   * Modo "+ Adicionar aluno" DENTRO de uma apresentacao: o escolhido entra no mesmo numero.
   *
   * Nesse modo quem ja esta na grade continua escolhivel — a apresentacao dele e movida para
   * ca, porque cada curso da pessoa tem uma apresentacao so. `noNumero` sao as chaves
   * `pessoa_chave|curso_id` de quem ja esta neste numero, que nao podem entrar de novo.
   */
  juntarCom?: { alvoId: number; noNumero: Set<string> };
}) {
  const [busca, setBusca] = useState('');
  const [gravando, setGravando] = useState<string | null>(null);
  const [ehCelular] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  );
  /**
   * Filtro de curso: um valor só. `todos` | `instrumentos` | `musicalizacao` | `curso:<id>`.
   * ⚠️ O Radix proíbe `value=""` no SelectItem — por isso "todos" é um token, não vazio.
   */
  const [filtroCurso, setFiltroCurso] = useState<string>('todos');
  /** Só quem tem familiar que também é aluno — para montar o número da família junto. */
  const [soFamilia, setSoFamilia] = useState(false);

  const { alunos, loading } = useAlunosDoEvento(eventoId, unidadeId);
  const { familias, erro: erroFamilias } = useFamiliasDaUnidade(unidadeId);
  const grupoFamilia = useMemo(() => agruparFamilias(familias), [familias]);

  /**
   * Os cursos que existem entre os candidatos, com quantos pares ainda estão fora da grade.
   * Sai dos próprios candidatos (não do cadastro de cursos) para o filtro só oferecer o que
   * tem gente — chip de curso vazio é clique que não leva a lugar nenhum.
   */
  const cursosDisponiveis = useMemo(() => {
    const porCurso = new Map<number, { curso_id: number; nome: string; fora: number }>();
    for (const aluno of alunos) {
      if (aluno.status === 'nao') continue;
      for (const curso of aluno.cursos) {
        const atual = porCurso.get(curso.curso_id) ?? {
          curso_id: curso.curso_id,
          nome: curso.curso_nome ?? 'Curso sem nome',
          fora: 0,
        };
        if (!aluno.alocacoes.some((a) => a.curso_id === curso.curso_id)) atual.fora += 1;
        porCurso.set(curso.curso_id, atual);
      }
    }
    return [...porCurso.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [alunos]);

  const passaNoFiltro = (cursoId: number, cursoNome: string | null) => {
    if (filtroCurso === 'todos') return true;
    if (filtroCurso === 'instrumentos') return !ehMusicalizacao(cursoNome);
    if (filtroCurso === 'musicalizacao') return ehMusicalizacao(cursoNome);
    return filtroCurso === `curso:${cursoId}`;
  };
  const temMusicalizacao = cursosDisponiveis.some((c) => ehMusicalizacao(c.nome));
  const temInstrumento = cursosDisponiveis.some((c) => !ehMusicalizacao(c.nome));

  const opcoes = useMemo<Opcao[]>(() => {
    const termo = normalizarBusca(busca.trim());
    const lista: Opcao[] = [];

    for (const aluno of alunos) {
      // Quem disse que NÃO participa fica fora: montar a grade com ele é o caminho para
      // imprimir a programação com alguém que já avisou que não vem.
      if (aluno.status === 'nao') continue;
      if (soFamilia && !familias.has(aluno.pessoa_chave)) continue;

      for (const curso of aluno.cursos) {
        if (!passaNoFiltro(curso.curso_id, curso.curso_nome)) continue;
        const alocacao = aluno.alocacoes.find((a) => a.curso_id === curso.curso_id);
        const jaNaGrade = alocacao !== undefined;
        if (termo) {
          const alvo = normalizarBusca(
            `${aluno.nome} ${curso.curso_nome ?? ''} ${curso.professor_nome ?? ''}`,
          );
          if (!alvo.includes(termo)) continue;
        }
        lista.push({
          chave: `${aluno.pessoa_chave}|${curso.curso_id}`,
          aluno,
          curso_id: curso.curso_id,
          curso_nome: curso.curso_nome,
          professor_nome: curso.professor_nome,
          jaNaGrade,
          blocoAtual: alocacao?.bloco_nome ?? null,
          noNumero: juntarCom?.noNumero.has(`${aluno.pessoa_chave}|${curso.curso_id}`) ?? false,
        });
      }
    }

    return lista;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- passaNoFiltro deriva de filtroCurso
  }, [alunos, busca, juntarCom, filtroCurso, soFamilia, familias]);

  /**
   * Agrupa por pessoa preservando a ordem de trabalho: quem tem curso fora da grade vem
   * primeiro (é neles que se trabalha), depois quem confirmou antes de quem está indefinido.
   *
   * ⚠️ A ordenação é por PESSOA, não por par: ordenar os pares e depois agrupar faria a
   * mesma pessoa aparecer em dois lugares da lista quando um curso dela já está na grade e
   * o outro não — que é exatamente o caso que o agrupamento existe para tornar visível.
   */
  const pessoas = useMemo<Pessoa[]>(() => {
    const porPessoa = new Map<string, Pessoa>();
    for (const o of opcoes) {
      const atual = porPessoa.get(o.aluno.pessoa_chave) ?? {
        chave: o.aluno.pessoa_chave,
        aluno: o.aluno,
        opcoes: [],
        fora: 0,
      };
      atual.opcoes.push(o);
      if (!o.jaNaGrade) atual.fora += 1;
      porPessoa.set(o.aluno.pessoa_chave, atual);
    }

    // Com o filtro de família, cada família vem junta, o responsável primeiro. A família é
    // ordenada pelo nome do responsável — é por ele que a equipe a reconhece.
    if (soFamilia) {
      const ehResp = (p: Pessoa) => (familias.get(p.chave) ?? []).some((f) => f.papel === 'dependente');
      const nomeDoGrupo = new Map<string, string>();
      for (const p of porPessoa.values()) {
        const g = grupoFamilia.get(p.chave) ?? p.chave;
        if (ehResp(p) || !nomeDoGrupo.has(g)) {
          const resp = familias.get(p.chave)?.find((f) => f.papel === 'responsavel');
          nomeDoGrupo.set(g, ehResp(p) ? p.aluno.nome : (resp?.nome ?? p.aluno.nome));
        }
      }
      const g = (p: Pessoa) => grupoFamilia.get(p.chave) ?? p.chave;
      return [...porPessoa.values()].sort(
        (a, b) =>
          (nomeDoGrupo.get(g(a)) ?? '').localeCompare(nomeDoGrupo.get(g(b)) ?? '', 'pt-BR') ||
          g(a).localeCompare(g(b)) ||
          Number(ehResp(b)) - Number(ehResp(a)) ||
          (b.aluno.idade_anos ?? 0) - (a.aluno.idade_anos ?? 0),
      );
    }

    return [...porPessoa.values()].sort(
      (a, b) =>
        Number(a.fora === 0) - Number(b.fora === 0) ||
        Number(b.aluno.status === 'participa') - Number(a.aluno.status === 'participa') ||
        a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'),
    );
  }, [opcoes, soFamilia, familias, grupoFamilia]);

  const adicionar = async (o: Opcao) => {
    // Mover e decisao, nao efeito colateral: a apresentacao sai de onde esta e leva a musica e
    // o palco dela. Quem clicou tem de saber de onde ela sai.
    if (
      juntarCom &&
      o.jaNaGrade &&
      !window.confirm(
        `${o.aluno.nome} já tem a apresentação de ${o.curso_nome ?? 'curso'}` +
          (o.blocoAtual ? ` no ${o.blocoAtual}` : '') +
          '. Trazer para este número? Ela sai de onde está.',
      )
    ) {
      return;
    }
    setGravando(o.chave);
    const { error } = juntarCom
      ? await juntarApresentacao(juntarCom.alvoId, o.aluno.aluno_id_referencia, o.curso_id)
      : await adicionarApresentacao(blocoId, o.aluno.aluno_id_referencia, o.curso_id);
    setGravando(null);
    if (error) {
      // A RPC devolve a frase pronta ("Fulano já tem uma apresentação de Canto neste
      // evento"), com a explicação da regra no `hint`. Não reescrever aqui.
      toast.error(error.message, { description: error.hint ?? undefined });
      return;
    }
    onAdicionado();
  };

  const foraDaGrade = opcoes.filter((o) => !o.jaNaGrade);
  const confirmadosFora = foraDaGrade.filter((o) => o.aluno.status === 'participa').length;

  return (
    <div className="rounded-lg border border-violet-500/40 bg-slate-900/60 p-2.5">
      {/* No celular: busca + fechar na 1a linha, "Curso:" e "Família" na linha de baixo. */}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="relative min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            // No celular o foco automatico abre o teclado e cobre a lista antes de a pessoa
            // decidir se vai buscar ou filtrar por curso.
            autoFocus={!ehCelular}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno, curso ou professor…"
            className="h-11 pl-8 text-[16px] sm:h-8 sm:text-[12.5px]"
          />
        </div>
        {cursosDisponiveis.length > 1 && (
          <Select value={filtroCurso} onValueChange={setFiltroCurso}>
            <SelectTrigger
              aria-label="Filtrar por curso"
              className={cn(
                'order-3 h-11 min-w-0 flex-1 text-[13px] sm:order-none sm:flex-none sm:h-8 sm:w-[190px] sm:shrink-0 sm:text-[12px]',
                filtroCurso !== 'todos' && 'border-violet-500/60 text-violet-200',
              )}
            >
              <span className="mr-1 text-slate-500">Curso:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="todos">Todos</SelectItem>
              {temInstrumento && temMusicalizacao && (
                <>
                  <SelectItem value="instrumentos">Só instrumentos</SelectItem>
                  <SelectItem value="musicalizacao">Só musicalização</SelectItem>
                </>
              )}
              <SelectSeparator />
              {cursosDisponiveis.map((c) => (
                <SelectItem key={c.curso_id} value={`curso:${c.curso_id}`}>
                  {c.nome}
                  <span className="ml-1.5 tabular-nums text-slate-500">· {c.fora}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <button
          type="button"
          aria-pressed={soFamilia}
          disabled={!!erroFamilias || familias.size === 0}
          onClick={() => setSoFamilia((v) => !v)}
          title={
            erroFamilias
              ? 'Não consegui carregar as famílias desta unidade'
              : 'Só quem tem um familiar que também é aluno (pais, filhos, cônjuge)'
          }
          className={cn(
            'order-4 flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[13px] transition-colors disabled:opacity-40 sm:order-none sm:h-8 sm:px-2.5 sm:text-[12px]',
            soFamilia
              ? 'border-violet-500/60 bg-violet-500/15 text-violet-200'
              : 'border-input text-slate-300 hover:bg-slate-800',
          )}
        >
          <Users className="h-3.5 w-3.5" />
          Família
        </button>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar seletor"
          className="-mr-1 flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-300 sm:mr-0 sm:block sm:h-auto sm:w-auto"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 px-1 text-[12px] sm:text-[11px] text-slate-500">
        {loading ? (
          'Carregando candidatos…'
        ) : (
          <>
            <span>{foraDaGrade.length} fora da grade</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {confirmadosFora} {confirmadosFora === 1 ? 'confirmado' : 'confirmados'}
            </span>
            <span>· quem marcou “não participa” não aparece</span>
          </>
        )}
      </p>

      <div className="mt-1.5 max-h-[55vh] space-y-0.5 overflow-y-auto sm:max-h-72">
        {pessoas.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-slate-500">
            {loading ? '' : 'Nenhum candidato com esse filtro.'}
          </p>
        ) : (
          pessoas.map((p, i) => {
            const g = grupoFamilia.get(p.chave);
            const abreFamilia = soFamilia && (i === 0 || grupoFamilia.get(pessoas[i - 1].chave) !== g);
            const naFamilia = soFamilia ? pessoas.filter((x) => grupoFamilia.get(x.chave) === g) : [];
            return (
            <div key={p.chave}>
            {abreFamilia && (
              <p className={cn('px-2 pb-0.5 text-[12px] font-medium uppercase tracking-wide text-violet-300/70 sm:text-[10.5px]', i > 0 && 'mt-3 border-t border-slate-800 pt-2.5')}>
                Família de {nomeCurto(naFamilia[0].aluno.nome)} · {naFamilia.length} {naFamilia.length === 1 ? 'aluno aqui' : 'alunos'}
              </p>
            )}
            <div className={cn('rounded px-2 py-1.5 hover:bg-slate-800/50', soFamilia && 'ml-1 rounded-l-none border-l-2 border-violet-500/40')}>
              <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="truncate text-[12.5px] text-white">{p.aluno.nome}</span>
                  {/* Mesmo campo e mesmo formato da aba Alunos (pedido do Arthur, 23/09). */}
                  {p.aluno.idade_anos != null && (
                    <span className="shrink-0 text-[12px] sm:text-[11px] text-slate-500">
                      {p.aluno.idade_anos} anos
                    </span>
                  )}
                </span>
                {/* Os dois estados marcados, nunca só o negativo: sem o selo verde, quem
                    confirmou fica igual a quem ninguém perguntou ainda. */}
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1 text-[12px] sm:text-[10.5px]',
                    PARTICIPACAO_SELO[p.aluno.status].texto,
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      PARTICIPACAO_SELO[p.aluno.status].ponto,
                    )}
                  />
                  {PARTICIPACAO_SELO[p.aluno.status].rotulo}
                </span>
              </div>

              {familias.has(p.chave) && (
                <p className="mt-0.5 flex items-center gap-1 text-[12px] text-violet-300/80 sm:text-[11px]">
                  <Users className="h-3 w-3 shrink-0" />
                  {/* O papel por extenso: o ícone com um nome solto não dizia quem é responsável
                      de quem (Hugo, 06/10). */}
                  <span className="truncate">{descreverVinculo(familias.get(p.chave)!)}</span>
                </p>
              )}

              {/* Um botão por CURSO MATRICULADO. É aqui que a pessoa com dois cursos deixa
                  de ser duas linhas parecidas e passa a ser uma escolha explícita entre
                  Violão e Canto — o caso da Maria Fernanda, que o formato anterior
                  espalhava pela lista. */}
              <div className="mt-1 flex flex-wrap gap-1">
                {p.opcoes.map((o) => {
                  // No modo juntar, quem ja esta na grade pode vir para ca (move); so quem
                  // ja esta NESTE numero fica travado.
                  const travado = juntarCom ? o.noNumero : o.jaNaGrade;
                  return (
                    <button
                      key={o.chave}
                      type="button"
                      disabled={travado || gravando === o.chave}
                      onClick={() => adicionar(o)}
                      title={
                        o.noNumero
                          ? `${o.curso_nome} já está neste número`
                          : o.jaNaGrade && juntarCom
                            ? `Trazer ${o.curso_nome} para este número${o.blocoAtual ? ` (hoje no ${o.blocoAtual})` : ''}`
                            : o.jaNaGrade
                              ? `${o.curso_nome} já está na grade`
                              : `Adicionar ${o.curso_nome}${o.professor_nome ? ` · Prof. ${o.professor_nome}` : ''}`
                      }
                      className={cn(
                        'flex min-h-[32px] items-center gap-1 rounded px-2 py-0.5 text-[12px] transition-colors sm:min-h-0 sm:px-1.5 sm:text-[11.5px]',
                        travado
                          ? 'cursor-not-allowed bg-slate-800/60 text-slate-500'
                          : o.jaNaGrade
                            ? 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/30'
                            : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/30',
                      )}
                    >
                      {o.jaNaGrade ? (
                        <Music className="h-3 w-3 shrink-0" />
                      ) : (
                        <Plus className="h-3 w-3 shrink-0" />
                      )}
                      {o.curso_nome}
                      {o.noNumero ? (
                        <span className="text-[12px] sm:text-[10px]">neste número</span>
                      ) : o.jaNaGrade ? (
                        <span className="text-[12px] sm:text-[10px]">{juntarCom ? `trazer do ${o.blocoAtual ?? 'bloco'}` : 'na grade'}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
