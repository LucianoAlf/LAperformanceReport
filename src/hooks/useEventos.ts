/**
 * Camada de dados do modulo Eventos (recital) — LAPE-39.
 *
 * As tabelas evento_* tem RLS com policy escopada por unidade, entao a leitura e a
 * escrita vao direto pelo PostgREST: o banco ja recusa o que esta fora do escopo do
 * usuario (validado nos 3 perfis). Nao ha RPC no caminho — diferente do modulo Bandas,
 * cujas tabelas sao fail-closed sem policy.
 *
 * ⚠️ O `.eq('unidade_id')` aqui e conveniencia de UI, nao limite de seguranca. Quem
 * limita e a policy.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type EventoStatus = 'rascunho' | 'publicado' | 'realizado' | 'cancelado';

export const EVENTO_STATUS_LABEL: Record<EventoStatus, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

export interface Evento {
  id: number;
  unidade_id: string;
  titulo: string;
  data_evento: string;
  horario_inicio: string;
  local: string | null;
  status: EventoStatus;
  duracao_padrao_segundos: number;
  /** Folga entre blocos. 2700s = os 45 min do protótipo; configurável por evento. */
  intervalo_entre_blocos_segundos: number;
  observacoes: string | null;
  created_at: string;
}

/** Contagens que a lista mostra sem abrir o evento. */
export interface EventoComResumo extends Evento {
  unidade_nome: string | null;
  participantes: number;
  apresentacoes: number;
}

export interface NovoEvento {
  unidade_id: string;
  titulo: string;
  data_evento: string;
  horario_inicio?: string;
  local?: string | null;
}

/** 'todos' (consolidado) vira ausencia de filtro — a policy ja recorta o que o usuario ve. */
function aplicarUnidade<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  unidadeId: string | null | undefined,
): T {
  return unidadeId && unidadeId !== 'todos' ? query.eq('unidade_id', unidadeId) : query;
}

export function useEventos(unidadeId: string | null | undefined) {
  const [eventos, setEventos] = useState<EventoComResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setLoading(true);
    setErro(null);

    // Os counts vem no mesmo round-trip: participacao e direta, apresentacao passa pelo
    // bloco no schema mas tem evento_id denormalizado (a coluna que a UNIQUE exige).
    const query = supabase
      .from('evento')
      .select(
        'id, unidade_id, titulo, data_evento, horario_inicio, local, status,' +
          ' duracao_padrao_segundos, intervalo_entre_blocos_segundos, observacoes, created_at,' +
          ' unidades(nome),' +
          ' evento_participacao(count),' +
          ' evento_apresentacao(count)',
      )
      .order('data_evento', { ascending: false });

    const { data, error } = await aplicarUnidade(query as never, unidadeId);

    if (error) {
      setErro(error.message);
      setEventos([]);
    } else {
      type Linha = Evento & {
        unidades: { nome: string } | null;
        evento_participacao: { count: number }[];
        evento_apresentacao: { count: number }[];
      };
      setEventos(
        ((data ?? []) as unknown as Linha[]).map((e) => ({
          ...e,
          unidade_nome: e.unidades?.nome ?? null,
          participantes: e.evento_participacao?.[0]?.count ?? 0,
          apresentacoes: e.evento_apresentacao?.[0]?.count ?? 0,
        })),
      );
    }
    setLoading(false);
  }, [unidadeId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { eventos, loading, erro, recarregar };
}

/** Unidades para o seletor do formulario — no consolidado o evento precisa de uma. */
export function useUnidadesParaEvento() {
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setUnidades(data ?? []));
  }, []);

  return unidades;
}

/** Mutations como funcoes soltas (padrao de useBandas): o toast fica no componente. */
export async function criarEvento(dados: NovoEvento) {
  return supabase.from('evento').insert({
    unidade_id: dados.unidade_id,
    titulo: dados.titulo,
    data_evento: dados.data_evento,
    horario_inicio: dados.horario_inicio || '09:00',
    local: dados.local || null,
  });
}

export async function excluirEvento(id: number) {
  return supabase.from('evento').delete().eq('id', id);
}

/* ────────────────────────────── evento aberto ────────────────────────────── */

export function useEvento(eventoId: number | null) {
  const [evento, setEvento] = useState<EventoComResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!eventoId) {
      setEvento(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    const { data, error } = await supabase
      .from('evento')
      .select(
        'id, unidade_id, titulo, data_evento, horario_inicio, local, status,' +
          ' duracao_padrao_segundos, intervalo_entre_blocos_segundos, observacoes, created_at, unidades(nome)',
      )
      .eq('id', eventoId)
      .maybeSingle();

    if (error) {
      setErro(error.message);
      setEvento(null);
    } else if (!data) {
      // Nao existe OU a policy escondeu (unidade alheia). Do lado de fora as duas
      // situacoes sao a mesma, e dizer "de outra unidade" vazaria a existencia dele.
      setEvento(null);
    } else {
      const linha = data as unknown as Evento & { unidades: { nome: string } | null };
      setEvento({ ...linha, unidade_nome: linha.unidades?.nome ?? null, participantes: 0, apresentacoes: 0 });
    }
    setLoading(false);
  }, [eventoId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { evento, loading, erro, recarregar };
}

/* ───────────────────────────── participacao ───────────────────────────── */

export type ParticipacaoStatus = 'participa' | 'indefinido' | 'nao';

/**
 * Rotulo e cor de cada estado de participacao — fonte unica.
 *
 * ⚠️ O estado POSITIVO tambem e sinal, e nao pode ser a ausencia de marca: quem confirmou
 * e exatamente quem se aloca primeiro. Ate 19/09 o seletor so marcava "indefinido", entao
 * quem confirmou ficava indistinguivel de quem ninguem perguntou ainda.
 */
export const PARTICIPACAO_SELO: Record<
  ParticipacaoStatus,
  { rotulo: string; ponto: string; texto: string }
> = {
  participa: { rotulo: 'confirmado', ponto: 'bg-emerald-400', texto: 'text-emerald-400' },
  indefinido: { rotulo: 'indefinido', ponto: 'bg-amber-400', texto: 'text-amber-400/80' },
  nao: { rotulo: 'não participa', ponto: 'bg-rose-400', texto: 'text-rose-400' },
};

/** Por que a pessoa nao tem nada a apresentar — a view separa regra de defeito. */
export type MotivoSemCurso = 'so_atividade_extra' | 'curso_nao_cadastrado' | null;

export interface CursoDoAluno {
  curso_id: number;
  curso_nome: string | null;
  professor_id: number | null;
  professor_nome: string | null;
}

/** Onde um curso da pessoa ja entrou na grade. Ausencia = ainda nao alocado. */
export interface AlocacaoDoCurso {
  curso_id: number;
  bloco_id: number;
  bloco_nome: string;
  bloco_ordem: number;
  horario_inicial: string | null;
}

export interface AlunoElegivel {
  unidade_id: string;
  pessoa_chave: string;
  aluno_id_referencia: number;
  nome: string;
  data_nascimento: string | null;
  idade_anos: number | null;
  cursos_no_recital: number;
  cursos: CursoDoAluno[];
  faz_banda: boolean;
  motivo_sem_curso: MotivoSemCurso;
  /** Vem do cruzamento com evento_participacao; default do banco e 'indefinido'. */
  status: ParticipacaoStatus;
  /**
   * Alocacoes por CURSO, nao por pessoa.
   *
   * O grao e (pessoa, curso) porque a UNIQUE de `evento_apresentacao` e essa: quem faz 2
   * cursos entra 2 vezes na grade e pode estar alocado em um e nao no outro.
   */
  alocacoes: AlocacaoDoCurso[];
  /** Atalho de `alocacoes.length`, para a contagem nao ter de percorrer o array. */
  cursos_alocados: number;
}

/**
 * Candidatos do evento com o status de participacao ja resolvido.
 *
 * Duas leituras em paralelo em vez de um join: a lista de elegiveis e uma VIEW e a
 * participacao e uma TABELA de outro dominio — o PostgREST so embute o que tem FK
 * declarada, e declarar FK de view nao existe. O cruzamento e por `pessoa_chave`,
 * que e a identidade dos dois lados.
 */
export function useAlunosDoEvento(eventoId: number | null, unidadeId: string | null) {
  const [alunos, setAlunos] = useState<AlunoElegivel[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!eventoId || !unidadeId) {
      setAlunos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);

    const [elegiveis, participacoes, apresentacoes] = await Promise.all([
      supabase
        .from('vw_evento_aluno_elegivel_v1')
        .select('*')
        .eq('unidade_id', unidadeId)
        .order('nome'),
      supabase
        .from('evento_participacao')
        .select('pessoa_chave, status')
        .eq('evento_id', eventoId),
      // O embed do bloco depende da FK `bloco_id -> evento_bloco`, que existe desde a
      // migration de criacao — foi a FK AUSENTE de `evento_id` que derrubou a lista antes.
      supabase
        .from('evento_apresentacao')
        .select('pessoa_chave, curso_id, bloco_id, evento_bloco(nome, ordem, horario_inicial)')
        .eq('evento_id', eventoId),
    ]);

    const falha = elegiveis.error ?? participacoes.error ?? apresentacoes.error;
    if (falha) {
      setErro(falha.message);
      setAlunos([]);
      setLoading(false);
      return;
    }

    const porChave = new Map<string, ParticipacaoStatus>(
      (participacoes.data ?? []).map((p) => [p.pessoa_chave as string, p.status as ParticipacaoStatus]),
    );

    type LinhaApresentacao = {
      pessoa_chave: string;
      curso_id: number;
      bloco_id: number;
      evento_bloco: { nome: string; ordem: number; horario_inicial: string | null } | null;
    };
    const alocacoesPorChave = new Map<string, AlocacaoDoCurso[]>();
    for (const linha of (apresentacoes.data ?? []) as unknown as LinhaApresentacao[]) {
      const lista = alocacoesPorChave.get(linha.pessoa_chave) ?? [];
      lista.push({
        curso_id: linha.curso_id,
        bloco_id: linha.bloco_id,
        bloco_nome: linha.evento_bloco?.nome ?? 'Bloco',
        bloco_ordem: linha.evento_bloco?.ordem ?? 0,
        horario_inicial: linha.evento_bloco?.horario_inicial ?? null,
      });
      alocacoesPorChave.set(linha.pessoa_chave, lista);
    }

    setAlunos(
      ((elegiveis.data ?? []) as unknown as Omit<
        AlunoElegivel,
        'status' | 'alocacoes' | 'cursos_alocados'
      >[]).map((a) => {
        const alocacoes = alocacoesPorChave.get(a.pessoa_chave) ?? [];
        return {
          ...a,
          cursos: (a.cursos ?? []) as CursoDoAluno[],
          status: porChave.get(a.pessoa_chave) ?? 'indefinido',
          alocacoes,
          cursos_alocados: alocacoes.length,
        };
      }),
    );
    setLoading(false);
  }, [eventoId, unidadeId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { alunos, loading, erro, recarregar };
}

/**
 * Grava a decisao de uma PESSOA no evento.
 *
 * `aluno_id` e procedencia, nao identidade: o trigger deriva `pessoa_chave` dele e o
 * `on conflict (evento_id, pessoa_chave)` colapsa as matriculas da mesma pessoa numa
 * linha so. Provado contra dado real (Gabriela Nascimento Brum, matriculas 134 e 1533:
 * o segundo upsert devolve o MESMO id).
 */
export async function definirParticipacao(
  eventoId: number,
  alunoIdReferencia: number,
  status: ParticipacaoStatus,
) {
  return supabase
    .from('evento_participacao')
    .upsert(
      { evento_id: eventoId, aluno_id: alunoIdReferencia, status },
      { onConflict: 'evento_id,pessoa_chave' },
    );
}

/* ─────────────────────────────── grade ─────────────────────────────── */

/** Instrumento ou equipamento que a apresentacao precisa no palco. */
export interface ItemDaApresentacao {
  id: number;
  apresentacao_id: number;
  tipo: 'instrumento' | 'equipamento';
  nome: string;
  quantidade: number;
  observacao: string | null;
}

export interface ApresentacaoDaGrade {
  id: number;
  bloco_id: number;
  aluno_id: number;
  pessoa_chave: string;
  curso_id: number;
  curso_nome: string | null;
  aluno_nome: string;
  professor_nome: string | null;
  ordem: number;
  musica: string | null;
  duracao_segundos: number | null;
  tem_playback: boolean;
  observacao_mapa: string | null;
  itens: ItemDaApresentacao[];
}

export interface BlocoDaGrade {
  id: number;
  evento_id: number;
  nome: string;
  ordem: number;
  horario_inicial: string | null;
  inicio_manual: boolean;
  observacoes: string | null;
  apresentacoes: ApresentacaoDaGrade[];
}

export function useGradeDoEvento(eventoId: number | null) {
  const [blocos, setBlocos] = useState<BlocoDaGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!eventoId) {
      setBlocos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);

    const [resBlocos, resApresentacoes] = await Promise.all([
      supabase
        .from('evento_bloco')
        .select('id, evento_id, nome, ordem, horario_inicial, inicio_manual, observacoes')
        .eq('evento_id', eventoId)
        .order('ordem'),
      // O nome do aluno vem de `alunos` pela PROCEDENCIA (`aluno_id`), nao da view de
      // elegiveis: a grade tem de continuar legivel mesmo se a pessoa sair da base ativa
      // depois de montada — o recital ja aconteceu, e apagar o nome reescreveria a historia.
      supabase
        .from('evento_apresentacao')
        .select(
          'id, bloco_id, aluno_id, pessoa_chave, curso_id, ordem, musica, duracao_segundos,' +
            ' tem_playback, observacao_mapa, alunos(nome), cursos(nome), professores(nome),' +
            // Itens embutidos em vez de uma segunda leitura: aqui a FK existe
            // (`apresentacao_id -> evento_apresentacao`), entao o PostgREST resolve o embed —
            // ao contrario da participacao, que cruza com uma VIEW e por isso vai separada.
            ' evento_apresentacao_item(id, apresentacao_id, tipo, nome, quantidade, observacao)',
        )
        .eq('evento_id', eventoId)
        .order('ordem'),
    ]);

    const falha = resBlocos.error ?? resApresentacoes.error;
    if (falha) {
      setErro(falha.message);
      setBlocos([]);
      setLoading(false);
      return;
    }

    type LinhaAp = Omit<
      ApresentacaoDaGrade,
      'curso_nome' | 'aluno_nome' | 'professor_nome' | 'itens'
    > & {
      alunos: { nome: string } | null;
      cursos: { nome: string } | null;
      professores: { nome: string } | null;
      evento_apresentacao_item: ItemDaApresentacao[] | null;
    };

    const porBloco = new Map<number, ApresentacaoDaGrade[]>();
    for (const linha of (resApresentacoes.data ?? []) as unknown as LinhaAp[]) {
      const lista = porBloco.get(linha.bloco_id) ?? [];
      lista.push({
        ...linha,
        aluno_nome: linha.alunos?.nome ?? '(aluno removido)',
        curso_nome: linha.cursos?.nome ?? null,
        professor_nome: linha.professores?.nome ?? null,
        // Ordem explicita por id: o embed do PostgREST nao promete ordem nenhuma, e sem
        // isso a lista de itens trocaria de posicao a cada carregamento.
        itens: [...(linha.evento_apresentacao_item ?? [])].sort((a, b) => a.id - b.id),
      });
      porBloco.set(linha.bloco_id, lista);
    }

    setBlocos(
      ((resBlocos.data ?? []) as unknown as Omit<BlocoDaGrade, 'apresentacoes'>[]).map((b) => ({
        ...b,
        apresentacoes: porBloco.get(b.id) ?? [],
      })),
    );
    setLoading(false);
  }, [eventoId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { blocos, loading, erro, recarregar };
}

export async function criarBloco(eventoId: number, nome: string, ordem: number) {
  return supabase.from('evento_bloco').insert({ evento_id: eventoId, nome, ordem });
}

export async function excluirBloco(blocoId: number) {
  // As apresentacoes caem junto por ON DELETE CASCADE — a tela avisa antes.
  return supabase.from('evento_bloco').delete().eq('id', blocoId);
}

export async function atualizarBloco(
  blocoId: number,
  campos: Partial<Pick<BlocoDaGrade, 'nome' | 'horario_inicial' | 'inicio_manual' | 'observacoes'>>,
) {
  return supabase.from('evento_bloco').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', blocoId);
}

/** Traduz a UNIQUE da regra numa frase legivel — a RPC devolve a mensagem pronta. */
export async function adicionarApresentacao(blocoId: number, alunoId: number, cursoId: number) {
  return supabase.rpc('evento_apresentacao_adicionar_v1', {
    p_bloco_id: blocoId,
    p_aluno_id: alunoId,
    p_curso_id: cursoId,
  });
}

export async function removerApresentacao(id: number) {
  return supabase.from('evento_apresentacao').delete().eq('id', id);
}

export async function atualizarApresentacao(
  id: number,
  campos: Partial<
    Pick<
      ApresentacaoDaGrade,
      'musica' | 'duracao_segundos' | 'tem_playback' | 'observacao_mapa'
    >
  >,
) {
  return supabase
    .from('evento_apresentacao')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id);
}

/* ─────────────────────────────── palco ─────────────────────────────── */

/**
 * Escrita direta, sem RPC: aqui nao ha regra nenhuma alem do que o banco ja garante
 * (`tipo` no CHECK, `quantidade > 0`, cascade do pai). RPC so onde existe decisao —
 * foi o criterio da fase 3, em que `adicionarApresentacao` precisou de uma para resolver a
 * matricula do curso e traduzir a UNIQUE numa frase legivel.
 *
 * ⚠️ A tabela NAO tem `unidade_id` proprio: a policy passa por `exists` na apresentacao pai,
 * e a subquery de dentro da policy tambem aplica a RLS de `evento_apresentacao`. Provado
 * contra o banco em 19/09/2026 nos tres perfis — admin le, Barra le, Campo Grande le 0, e o
 * INSERT de Campo Grande numa apresentacao da Barra e recusado com
 * "new row violates row-level security policy".
 */
export async function adicionarItemDePalco(
  apresentacaoId: number,
  item: { tipo: 'instrumento' | 'equipamento'; nome: string; quantidade: number; observacao?: string | null },
) {
  return supabase.from('evento_apresentacao_item').insert({
    apresentacao_id: apresentacaoId,
    tipo: item.tipo,
    nome: item.nome.trim(),
    quantidade: item.quantidade,
    observacao: item.observacao?.trim() || null,
  });
}

export async function removerItemDePalco(id: number) {
  return supabase.from('evento_apresentacao_item').delete().eq('id', id);
}

export async function atualizarItemDePalco(
  id: number,
  campos: Partial<Pick<ItemDaApresentacao, 'nome' | 'quantidade' | 'observacao'>>,
) {
  return supabase.from('evento_apresentacao_item').update(campos).eq('id', id);
}

/**
 * Aplica o arrasto inteiro numa transacao.
 *
 * A RPC aborta se nao alcancar TODOS os itens pedidos — sem isso, uma linha escondida pela
 * policy deixaria a grade metade movida com resposta de sucesso, que e o defeito do lote
 * do caixa (R$ 1.722 aprovados, R$ 432 gravados).
 */
export async function reordenarGrade(
  eventoId: number,
  itens: { id: number; bloco_id: number; ordem: number }[],
) {
  return supabase.rpc('evento_grade_reordenar_v1', { p_evento_id: eventoId, p_itens: itens });
}

/**
 * Nova ordem dos BLOCOS entre si — a posicao no array vira a `ordem`.
 *
 * Nao toca em horario: ele e derivado da ordem, entao mudar a ordem ja muda o horario de
 * todo mundo. Bloco com `inicio_manual` mantem a hora digitada; se na posicao nova ela
 * cair antes do fim do anterior, a tela acusa o conflito em vermelho.
 */
export async function reordenarBlocos(eventoId: number, idsNaOrdem: number[]) {
  return supabase.rpc('evento_bloco_reordenar_v1', {
    p_evento_id: eventoId,
    p_ids: idsNaOrdem,
  });
}

/** Marca em lote (botoes "todos participam" / "limpar"). Mesma chave, mesmo colapso. */
export async function definirParticipacaoEmLote(
  eventoId: number,
  alunoIds: number[],
  status: ParticipacaoStatus,
) {
  if (alunoIds.length === 0) return { error: null };
  return supabase.from('evento_participacao').upsert(
    alunoIds.map((aluno_id) => ({ evento_id: eventoId, aluno_id, status })),
    { onConflict: 'evento_id,pessoa_chave' },
  );
}
