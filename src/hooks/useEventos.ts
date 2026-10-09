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
  /** Último dia quando o recital ocupa mais de uma data (Recreio 13–15/11). NULL = um dia. */
  data_fim: string | null;
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
  data_fim?: string | null;
  horario_inicio?: string;
  local?: string | null;
  duracao_padrao_segundos?: number;
  intervalo_entre_blocos_segundos?: number;
  observacoes?: string | null;
}

/** Campos editáveis de um evento existente — o que a equipe mexe sem recriar nada. */
export type CamposDoEvento = Partial<
  Pick<
    Evento,
    | 'titulo'
    | 'data_evento'
    | 'data_fim'
    | 'horario_inicio'
    | 'local'
    | 'status'
    | 'duracao_padrao_segundos'
    | 'intervalo_entre_blocos_segundos'
    | 'observacoes'
  >
>;

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
    // ⚠️ O count de participacao e filtrado a 'participa': sem isso o cartao conta
    // indefinidos e "nao participa" como se fossem publico — mentira a partir do
    // primeiro "nao" marcado. O filtro embutido NAO tira o evento da lista (o embed sem
    // !inner e left join); so restringe as linhas contadas.
    const query = supabase
      .from('evento')
      .select(
        'id, unidade_id, titulo, data_evento, data_fim, horario_inicio, local, status,' +
          ' duracao_padrao_segundos, intervalo_entre_blocos_segundos, observacoes, created_at,' +
          ' unidades(nome),' +
          ' evento_participacao(count),' +
          ' evento_apresentacao(count)',
      )
      .eq('evento_participacao.status', 'participa')
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
    data_fim: dados.data_fim || null,
    horario_inicio: dados.horario_inicio || '09:00',
    local: dados.local || null,
    duracao_padrao_segundos: dados.duracao_padrao_segundos ?? undefined,
    intervalo_entre_blocos_segundos: dados.intervalo_entre_blocos_segundos ?? undefined,
    observacoes: dados.observacoes || null,
  });
}

export async function atualizarEvento(id: number, campos: CamposDoEvento) {
  return supabase
    .from('evento')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function excluirEvento(id: number) {
  return supabase.from('evento').delete().eq('id', id);
}

/* ────────────────────────────── evento aberto ────────────────────────────── */

export function useEvento(eventoId: number | null) {
  const [evento, setEvento] = useState<EventoComResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * `silencioso`: relê sem passar pelo "Carregando evento…", que desmonta a aba aberta. É o
   * caso de um ajuste feito de dentro da própria aba (tempo padrão na Grade).
   */
  const recarregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    if (!eventoId) {
      setEvento(null);
      setLoading(false);
      return;
    }
    if (!opcoes?.silencioso) setLoading(true);
    setErro(null);
    const { data, error } = await supabase
      .from('evento')
      .select(
        'id, unidade_id, titulo, data_evento, data_fim, horario_inicio, local, status,' +
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
  /** Quantos convidados a pessoa leva. Por PESSOA, como o check-in. 0 = ninguem informou. */
  convidados: number;
  /**
   * Selo de formando (passagem de ciclo), por PESSOA. 'kids' = 12 anos no ano → LA
   * Music School; 'bebes' = 2 anos no ano estando em Musicalização para Bebês →
   * Preparatória. A regra mora no LA Teacher; aqui chega pronta pela rotina.
   */
  formatura_tipo: 'kids' | 'bebes' | 'la' | null;
  /** 'manual' = a coordenação decidiu à mão e a rotina automática não sobrescreve. */
  formatura_origem: 'auto' | 'manual' | null;
  /**
   * Alocacoes por CURSO, nao por pessoa.
   *
   * O grao e (pessoa, curso) porque a UNIQUE de `evento_apresentacao` e essa: quem faz 2
   * cursos entra 2 vezes na grade e pode estar alocado em um e nao no outro.
   */
  alocacoes: AlocacaoDoCurso[];
  /** Atalho de `alocacoes.length`, para a contagem nao ter de percorrer o array. */
  cursos_alocados: number;
  /**
   * O professor ja trabalhou o relatorio do LA Teacher mas a pessoa ainda nao tem
   * apresentacao na grade — o conteudo so entra quando ela for alocada. A faixa diz
   * a urgencia: 'musica' (lancou a musica), 'enviado' (mandou p/ revisao) ou
   * 'aprovado' (revisor ja aprovou — o mais urgente, so falta cadeira). Selo de
   * prioridade para a coordenacao: e quem "ja fez a licao e falta cadeira".
   */
  relatorio_falta_alocar: 'musica' | 'enviado' | 'aprovado' | null;
  /**
   * Preenchido so para aluno de OUTRA unidade que se apresenta neste evento (nome da unidade
   * de origem). `null`/ausente = aluno da casa.
   */
  unidade_origem_nome?: string | null;
}

/** Aluno de outra unidade encontrado pela busca do evento. */
export interface AlunoDeOutraUnidade {
  aluno_id_referencia: number;
  nome: string;
  unidade_id: string;
  unidade_nome: string;
  idade_anos: number | null;
  cursos: CursoDoAluno[];
  ja_no_evento: boolean;
}

interface VisitantesDoEvento {
  pessoas: (Omit<AlunoElegivel, 'status' | 'convidados' | 'alocacoes' | 'cursos_alocados' | 'relatorio_falta_alocar'> & {
    unidade_origem_nome: string;
  })[];
  /** aluno_id -> nome de toda matricula de outra unidade que o evento referencia. */
  nomes: Record<string, { nome: string; data_nascimento: string | null; unidade_nome: string }>;
}

/**
 * Alunos de OUTRA unidade registrados no evento.
 *
 * Vem de RPC porque a RLS de `alunos` esconde a matricula de outra unidade: a view de
 * elegiveis nao os devolve, e o embed `alunos(nome)` da grade e do check-in vem nulo.
 */
async function lerVisitantes(eventoId: number) {
  const { data, error } = await supabase.rpc('evento_visitantes_v1', { p_evento_id: eventoId });
  const vazio: VisitantesDoEvento = { pessoas: [], nomes: {} };
  return { visitantes: (data as VisitantesDoEvento | null) ?? vazio, error };
}

/** Busca por nome (3 letras no minimo) entre os alunos ativos das OUTRAS unidades. */
export async function buscarAlunoDeOutraUnidade(eventoId: number, termo: string) {
  const { data, error } = await supabase.rpc('evento_buscar_aluno_outra_unidade_v1', {
    p_evento_id: eventoId,
    p_termo: termo,
  });
  return { alunos: ((data ?? []) as AlunoDeOutraUnidade[]), error };
}

/**
 * Tira do evento um aluno de outra unidade: as apresentacoes dele e a participacao.
 *
 * As duas escritas conferem o retorno — a RLS FILTRA em vez de recusar, e zero linhas
 * apagadas sem erro e justamente o caso que pintaria "removido" sobre um banco intacto.
 */
export async function removerAlunoDeOutraUnidade(eventoId: number, pessoaChave: string) {
  const apresentacoes = await supabase
    .from('evento_apresentacao')
    .delete()
    .eq('evento_id', eventoId)
    .eq('pessoa_chave', pessoaChave)
    .select('id');
  if (apresentacoes.error) return { error: apresentacoes.error };

  const participacao = await supabase
    .from('evento_participacao')
    .delete()
    .eq('evento_id', eventoId)
    .eq('pessoa_chave', pessoaChave)
    .select('id');
  if (participacao.error) return { error: participacao.error };
  if ((participacao.data ?? []).length === 0) {
    return { error: { message: 'Nada foi removido. Confira se o evento é da sua unidade.' } };
  }
  return { error: null };
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

    const [elegiveis, participacoes, apresentacoes, visitantes, relatorios] = await Promise.all([
      supabase
        .from('vw_evento_aluno_elegivel_v1')
        .select('*')
        .eq('unidade_id', unidadeId)
        .order('nome'),
      supabase
        .from('evento_participacao')
        .select('pessoa_chave, status, convidados, formatura_tipo, formatura_origem')
        .eq('evento_id', eventoId),
      // O embed do bloco depende da FK `bloco_id -> evento_bloco`, que existe desde a
      // migration de criacao — foi a FK AUSENTE de `evento_id` que derrubou a lista antes.
      supabase
        .from('evento_apresentacao')
        .select('pessoa_chave, curso_id, bloco_id, evento_bloco(nome, ordem, horario_inicial)')
        .eq('evento_id', eventoId),
      lerVisitantes(eventoId),
      // Relatorio enviado sem apresentacao = "falta alocar". Nao pode derrubar a lista
      // inteira se a RPC falhar: o selo e auxiliar, a fila principal e a participacao.
      supabase
        .rpc('evento_relatorios_v1', { p_evento_id: eventoId })
        .then((r) => r)
        .catch(() => ({ data: null, error: null })),
    ]);

    const falha = elegiveis.error ?? participacoes.error ?? apresentacoes.error ?? visitantes.error;
    if (falha) {
      setErro(falha.message);
      setAlunos([]);
      setLoading(false);
      return;
    }

    const porChave = new Map<string, ParticipacaoStatus>(
      (participacoes.data ?? []).map((p) => [p.pessoa_chave as string, p.status as ParticipacaoStatus]),
    );
    const convidadosPorChave = new Map<string, number>(
      (participacoes.data ?? []).map((p) => [
        p.pessoa_chave as string,
        (p.convidados as number) ?? 0,
      ]),
    );
    const formaturaPorChave = new Map(
      (participacoes.data ?? []).map((p) => [
        p.pessoa_chave as string,
        {
          tipo: (p.formatura_tipo as AlunoElegivel['formatura_tipo']) ?? null,
          origem: (p.formatura_origem as AlunoElegivel['formatura_origem']) ?? null,
        },
      ]),
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

    // Relatorio que ainda nao casou com apresentacao nenhuma — o professor ja mexeu
    // no LA Teacher e falta cadeira na grade. Tres faixas de urgencia, contadas por
    // PESSOA (a chave do relatorio e a mesma da participacao), guardando a mais alta:
    // musica lancada < enviado < aprovado. Rascunho sem musica nao entra — o professor
    // ainda nao fez nada de fato.
    const PESO_FAIXA = { musica: 1, enviado: 2, aprovado: 3 } as const;
    const relatorioProntoPorChave = new Map<string, 'musica' | 'enviado' | 'aprovado'>();
    for (const r of (relatorios.data ?? []) as RelatorioDoProfessor[]) {
      if (r.apresentacao_id !== null) continue;
      const faixa = r.aprovado_em || r.relatorio_status === 'aprovado' ? 'aprovado' as const
        : r.enviado_em || r.relatorio_status === 'enviado' ? 'enviado' as const
        : r.musica_lancada ? 'musica' as const
        : null;
      if (!faixa) continue;
      const atual = relatorioProntoPorChave.get(r.pessoa_chave);
      if (!atual || PESO_FAIXA[faixa] > PESO_FAIXA[atual]) {
        relatorioProntoPorChave.set(r.pessoa_chave, faixa);
      }
    }

    // Visitantes depois dos da casa: a lista e da unidade, e quem vem de fora e excecao.
    const base = [
      ...((elegiveis.data ?? []) as unknown as Omit<
        AlunoElegivel,
        'status' | 'alocacoes' | 'cursos_alocados' | 'relatorio_falta_alocar'
      >[]),
      ...visitantes.visitantes.pessoas,
    ];

    setAlunos(
      base.map((a) => {
        const alocacoes = alocacoesPorChave.get(a.pessoa_chave) ?? [];
        return {
          ...a,
          cursos: (a.cursos ?? []) as CursoDoAluno[],
          status: porChave.get(a.pessoa_chave) ?? 'indefinido',
          convidados: convidadosPorChave.get(a.pessoa_chave) ?? 0,
          formatura_tipo: formaturaPorChave.get(a.pessoa_chave)?.tipo ?? null,
          formatura_origem: formaturaPorChave.get(a.pessoa_chave)?.origem ?? null,
          alocacoes,
          cursos_alocados: alocacoes.length,
          relatorio_falta_alocar: relatorioProntoPorChave.get(a.pessoa_chave) ?? null,
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

/**
 * Quantos convidados a PESSOA leva. Mesmo upsert por (evento_id, pessoa_chave) da
 * participacao — quem ainda nao foi marcado ganha a linha com status 'indefinido', que e
 * o default do banco e a verdade ("ninguem perguntou").
 */
export async function definirConvidados(
  eventoId: number,
  alunoIdReferencia: number,
  convidados: number,
) {
  return supabase
    .from('evento_participacao')
    .upsert(
      {
        evento_id: eventoId,
        aluno_id: alunoIdReferencia,
        convidados: Math.max(0, Math.floor(convidados)),
      },
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
  /** 'professor' = espelhado do rider do LA Teacher pelo sync; o ADM nao edita nem remove. */
  origem: 'adm' | 'professor';
  /** Codigo estavel do rider do LA Teacher (microfone_voz, bateria...); null quando digitado. */
  codigo: string | null;
}

/**
 * O que o professor lancou no LA Teacher — o snapshot cru da `vw_relatorio_anual_recital_v1`
 * gravado pelo sync. E com ele que a tela mostra "o que o professor pediu" ao lado do que
 * esta valendo na grade, sem depender da view na hora de pintar.
 */
export interface SnapshotDoProfessor {
  relatorio_id: number;
  relatorio_status: string;
  curso: string;
  curso_chave: string;
  professor_id: number | null;
  musica_titulo: string | null;
  musica_artista: string | null;
  musica_duracao_segundos: number | null;
  musica_link: string | null;
  musica_ao_vivo: boolean;
  musica_playback_path: string | null;
  rider_itens: string[];
  rider_outros: string | null;
  rider_nada: boolean;
  musica_lancada_em: string | null;
  enviado_em: string | null;
  aprovado_em: string | null;
  atualizado_em: string | null;
}

export interface ApresentacaoDaGrade {
  id: number;
  bloco_id: number;
  aluno_id: number;
  pessoa_chave: string;
  curso_id: number;
  curso_nome: string | null;
  aluno_nome: string;
  /** 'AAAA-MM-DD' do cadastro, pela procedencia (`aluno_id`). A idade se calcula na tela. */
  aluno_data_nascimento: string | null;
  /** `alunos.classificacao` (LAMK = Kids, EMLA = School). null = visitante sem cadastro visível. */
  aluno_classificacao: string | null;
  professor_nome: string | null;
  ordem: number;
  /**
   * Mesmo valor = sobem juntas no mesmo numero (um horario, uma musica). `null` = sozinha.
   * Escrito so por `juntarApresentacao`/`separarApresentacao`.
   */
  grupo_id: string | null;
  musica: string | null;
  musica_artista: string | null;
  duracao_segundos: number | null;
  tem_playback: boolean;
  /** YouTube/Spotify/outro link que o professor (ou o ADM) informou para a música. */
  musica_link: string | null;
  /** Objeto no bucket `recital-playback` (do LA Teacher) — tocar exige signed URL. */
  playback_path: string | null;
  /** Quem escreveu os campos de detalhe por ultimo. Ver a regra de posse no banco. */
  detalhes_origem: 'adm' | 'professor';
  /** Selo de formando da PESSOA (vem de evento_participacao, cruzado por pessoa_chave). */
  formatura_tipo: 'kids' | 'bebes' | 'la' | null;
  professor: SnapshotDoProfessor | null;
  professor_em: string | null;
  /** Professor mexeu na música ou no palco depois de enviar — a grade mostra o selo. */
  editado_apos_envio_em: string | null;
  observacao_mapa: string | null;
  /** Um certificado por CURSO (decisao do Alf, 27/09): o grao e a apresentacao. */
  certificado_status: 'pendente' | 'emitido';
  certificado_em: string | null;
  itens: ItemDaApresentacao[];
}

export interface BlocoDaGrade {
  id: number;
  evento_id: number;
  nome: string;
  ordem: number;
  /** Dia em que o bloco toca; null = data_evento (recital de um dia). */
  data: string | null;
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

    const [resBlocos, resApresentacoes, resVisitantes, resFormaturas] = await Promise.all([
      supabase
        .from('evento_bloco')
        .select('id, evento_id, nome, ordem, data, horario_inicial, inicio_manual, observacoes')
        .eq('evento_id', eventoId)
        .order('ordem'),
      // O nome do aluno vem de `alunos` pela PROCEDENCIA (`aluno_id`), nao da view de
      // elegiveis: a grade tem de continuar legivel mesmo se a pessoa sair da base ativa
      // depois de montada — o recital ja aconteceu, e apagar o nome reescreveria a historia.
      supabase
        .from('evento_apresentacao')
        .select(
          'id, bloco_id, aluno_id, pessoa_chave, curso_id, ordem, grupo_id, musica, musica_artista,' +
            ' duracao_segundos, tem_playback, musica_link, playback_path, detalhes_origem,' +
            ' professor, professor_em, editado_apos_envio_em,' +
            ' certificado_status, certificado_em,' +
            ' observacao_mapa, alunos(nome, data_nascimento, classificacao), cursos(nome),' +
            ' professores!evento_apresentacao_professor_id_fkey(nome),' +
            // Itens embutidos em vez de uma segunda leitura: aqui a FK existe
            // (`apresentacao_id -> evento_apresentacao`), entao o PostgREST resolve o embed —
            // ao contrario da participacao, que cruza com uma VIEW e por isso vai separada.
            ' evento_apresentacao_item(id, apresentacao_id, tipo, nome, quantidade, observacao, origem, codigo)',
        )
        .eq('evento_id', eventoId)
        .order('ordem'),
      lerVisitantes(eventoId),
      // Formando é da PESSOA (evento_participacao), não da apresentação — o cruzamento
      // é por pessoa_chave, a mesma identidade que a aba Alunos usa.
      supabase
        .from('evento_participacao')
        .select('pessoa_chave, formatura_tipo')
        .eq('evento_id', eventoId)
        .not('formatura_tipo', 'is', null),
    ]);

    const falha = resBlocos.error ?? resApresentacoes.error ?? resVisitantes.error ?? resFormaturas.error;
    // Aluno de outra unidade: a RLS esconde o embed `alunos(...)`, o nome vem da RPC.
    const nomeDeFora = resVisitantes.visitantes.nomes;
    if (falha) {
      setErro(falha.message);
      setBlocos([]);
      setLoading(false);
      return;
    }

    type LinhaAp = Omit<
      ApresentacaoDaGrade,
      'curso_nome' | 'aluno_nome' | 'aluno_data_nascimento' | 'aluno_classificacao' | 'professor_nome' | 'itens'
    > & {
      alunos: { nome: string; data_nascimento: string | null; classificacao: string | null } | null;
      cursos: { nome: string } | null;
      professores: { nome: string } | null;
      evento_apresentacao_item: ItemDaApresentacao[] | null;
    };

    const formaturaPorChave = new Map<string, ApresentacaoDaGrade['formatura_tipo']>(
      (resFormaturas.data ?? []).map((p) => [
        p.pessoa_chave as string,
        (p.formatura_tipo as ApresentacaoDaGrade['formatura_tipo']) ?? null,
      ]),
    );

    const porBloco = new Map<number, ApresentacaoDaGrade[]>();
    for (const linha of (resApresentacoes.data ?? []) as unknown as LinhaAp[]) {
      const lista = porBloco.get(linha.bloco_id) ?? [];
      lista.push({
        ...linha,
        formatura_tipo: formaturaPorChave.get(linha.pessoa_chave) ?? null,
        aluno_nome:
          linha.alunos?.nome ?? nomeDeFora[String(linha.aluno_id)]?.nome ?? '(aluno removido)',
        aluno_data_nascimento:
          linha.alunos?.data_nascimento ?? nomeDeFora[String(linha.aluno_id)]?.data_nascimento ?? null,
        aluno_classificacao: linha.alunos?.classificacao ?? null,
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

export async function criarBloco(
  eventoId: number,
  nome: string,
  ordem: number,
  /** Dia do bloco; `null` = 1º dia do evento (mesma convencao do seletor do bloco). */
  data: string | null = null,
) {
  return supabase.from('evento_bloco').insert({ evento_id: eventoId, nome, ordem, data });
}

export async function excluirBloco(blocoId: number) {
  // As apresentacoes caem junto por ON DELETE CASCADE — a tela avisa antes.
  return supabase.from('evento_bloco').delete().eq('id', blocoId);
}

export async function atualizarBloco(
  blocoId: number,
  campos: Partial<Pick<BlocoDaGrade, 'nome' | 'data' | 'horario_inicial' | 'inicio_manual' | 'observacoes'>>,
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

/**
 * "+ Adicionar aluno" dentro de uma apresentacao: poe (aluno, curso) no MESMO numero dela.
 *
 * Se a pessoa ainda nao tem apresentacao desse curso, a RPC cria; se ja tem em outro lugar da
 * grade, a RPC MOVE a que existe — nunca duplica, porque e uma apresentacao por curso. A
 * mensagem de erro ja vem pronta do banco.
 */
export async function juntarApresentacao(alvoId: number, alunoId: number, cursoId: number) {
  return supabase.rpc('evento_apresentacao_juntar_v1', {
    p_alvo_id: alvoId,
    p_aluno_id: alunoId,
    p_curso_id: cursoId,
  });
}

/** Tira a apresentacao do numero: ela passa a tocar sozinha, logo depois dele. */
export async function separarApresentacao(id: number) {
  return supabase.rpc('evento_apresentacao_separar_v1', { p_id: id });
}

/**
 * Grava os mesmos campos em VARIAS apresentacoes — o numero inteiro.
 *
 * Musica, duracao e observacao sao do numero: gravar so na primeira deixaria o certificado e a
 * planilha dos outros integrantes com a musica vazia, porque eles leem a linha de cada um.
 *
 * ⚠️ Confere quantas linhas alcancou: a RLS desta tabela FILTRA em vez de recusar, e sem a
 * conferencia um numero salvo pela metade pareceria salvo por inteiro.
 */
export async function atualizarApresentacoes(
  ids: number[],
  campos: Parameters<typeof atualizarApresentacao>[1],
) {
  const { data, error } = await supabase
    .from('evento_apresentacao')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id');
  if (error) return { error };
  if ((data ?? []).length !== ids.length) {
    return {
      error: {
        message: `Salvei ${(data ?? []).length} de ${ids.length} apresentações do número — confira a permissão.`,
      },
    };
  }
  return { error: null };
}

export async function atualizarApresentacao(
  id: number,
  campos: Partial<
    Pick<
      ApresentacaoDaGrade,
      | 'musica'
      | 'musica_artista'
      | 'musica_link'
      | 'duracao_segundos'
      | 'tem_playback'
      | 'observacao_mapa'
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

/* ────────────────────────────── check-in ────────────────────────────── */

export interface ParticipacaoComChegada {
  pessoa_chave: string;
  aluno_id: number;
  nome: string;
  status: ParticipacaoStatus;
  checkin_em: string | null;
  /** 'AAAA-MM-DD' do cadastro — a porta mostra a idade ao lado do nome. */
  data_nascimento: string | null;
  /** `alunos.classificacao` (LAMK/EMLA) — o logo do certificado. null = visitante. */
  classificacao: string | null;
}

/**
 * Participacao do evento com a chegada — a fonte do dia do recital.
 *
 * ⚠️ Le `evento_participacao` DIRETO, nao a view de elegiveis que a aba Alunos usa. A view
 * mostra a base ativa de hoje; esta tela precisa continuar funcionando depois do recital,
 * quando alguem pode ja ter saido da escola. O nome vem pela procedencia (`alunos(nome)`),
 * pelo mesmo motivo que a grade guarda o nome assim.
 */
export function useCheckinDoEvento(eventoId: number | null) {
  const [participacoes, setParticipacoes] = useState<ParticipacaoComChegada[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!eventoId) {
      setParticipacoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);

    const [{ data, error: erroParticipacao }, { visitantes, error: erroVisitantes }] = await Promise.all([
      supabase
        .from('evento_participacao')
        .select('pessoa_chave, aluno_id, status, checkin_em, alunos(nome, data_nascimento, classificacao)')
        .eq('evento_id', eventoId),
      lerVisitantes(eventoId),
    ]);
    const error = erroParticipacao ?? erroVisitantes;
    // Aluno de outra unidade: a RLS esconde o embed `alunos(...)`, o nome vem da RPC.
    const nomeDeFora = visitantes.nomes;

    if (error) {
      setErro(error.message);
      setParticipacoes([]);
    } else {
      type Linha = Omit<ParticipacaoComChegada, 'nome' | 'data_nascimento' | 'classificacao'> & {
        alunos: { nome: string; data_nascimento: string | null; classificacao: string | null } | null;
      };
      setParticipacoes(
        ((data ?? []) as unknown as Linha[]).map((p) => ({
          pessoa_chave: p.pessoa_chave,
          aluno_id: p.aluno_id,
          status: p.status,
          checkin_em: p.checkin_em,
          nome: p.alunos?.nome ?? nomeDeFora[String(p.aluno_id)]?.nome ?? '(aluno removido)',
          data_nascimento:
            p.alunos?.data_nascimento ?? nomeDeFora[String(p.aluno_id)]?.data_nascimento ?? null,
          classificacao: p.alunos?.classificacao ?? null,
        })),
      );
    }
    setLoading(false);
  }, [eventoId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { participacoes, loading, erro, recarregar };
}

/**
 * Registra (ou desfaz) a chegada de uma PESSOA no evento.
 *
 * 🔴 O UPDATE nao pode ser cego. Provado contra o banco em 19/09/2026, nos 3 perfis: um
 * usuario de Campo Grande atualizando a participacao de um evento da Barra recebe
 * **zero linhas e NENHUM erro** — a policy FILTRA pelo `using`, nao recusa. Sem o `.select()`
 * e a checagem do retorno, a tela pintaria "chegou" e o banco continuaria intacto.
 *
 * Os dois motivos de "zero linhas" sao separados pelo INSERT que vem depois:
 *   • a pessoa entrou na grade sem ninguem marcar participacao — nenhuma RPC da grade cria a
 *     linha de `evento_participacao`, entao este caso e normal, e o INSERT resolve;
 *   • a policy escondeu — aqui o INSERT falha com erro de RLS, que e o que a tela mostra.
 */
export async function marcarChegada(
  eventoId: number,
  pessoaChave: string,
  alunoIdReferencia: number,
  chegou: boolean,
) {
  const quando = chegou ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from('evento_participacao')
    .update({ checkin_em: quando, updated_at: new Date().toISOString() })
    .eq('evento_id', eventoId)
    .eq('pessoa_chave', pessoaChave)
    .select('id');

  if (error) return { error };
  if ((data ?? []).length > 0) return { error: null };

  // Desfazer o que nao existe nao tem INSERT que resolva: nao ha chegada registrada, e
  // criar uma participacao vazia aqui esconderia o motivo real (quase sempre, escopo).
  if (!chegou) {
    return {
      error: {
        message:
          'Não foi possível desfazer: esta pessoa não tem participação registrada neste evento.',
      },
    };
  }

  // `status: 'participa'` e deliberado, nao efeito colateral: alguem acabou de confirmar
  // que a pessoa chegou ao teatro. Deixar 'indefinido' faria a mesma tela dizer que ela
  // chegou e que ninguem sabe se ela vem.
  const insercao = await supabase
    .from('evento_participacao')
    .insert({
      evento_id: eventoId,
      aluno_id: alunoIdReferencia,
      status: 'participa',
      checkin_em: quando,
    })
    .select('id');

  if (insercao.error) return { error: insercao.error };
  if ((insercao.data ?? []).length === 0) {
    return { error: { message: 'A chegada não foi gravada. Confira se o evento é da sua unidade.' } };
  }
  return { error: null };
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

/* ─────────── canal do professor (LA Teacher → sala de eventos) ─────────── */

export interface ResultadoSyncRecital {
  evento_id: number;
  relatorios_lidos: number;
  casadas: number;
  nao_casadas: { aluno_id: number; curso: string; relatorio_id: number }[];
  apresentacoes_atualizadas: number;
  itens_professor: number;
  codigos_sem_mapa: string[];
  /** Contadores da rotina de formandos que anda junto (M12). */
  formandos?: {
    formandos_na_view: number;
    inseridos: number;
    marcados: number;
    desmarcados: number;
    manuais_preservados: number;
    erro?: string;
  } | null;
  sincronizado_em: string;
}

/**
 * Puxa o cartao "Musica e palco do recital" do LA Teacher para as apresentacoes do
 * evento. Idempotente — pode rodar a cada abertura da tela; o custo e uma passada sobre
 * a view (centenas de linhas), nao um sync de verdade.
 */
export async function sincronizarRecital(eventoId: number) {
  const { data, error } = await supabase.rpc('evento_recital_sincronizar_v1', {
    p_evento_id: eventoId,
  });
  return { data: (data ?? null) as ResultadoSyncRecital | null, error };
}

/** Uma linha por relatorio do LA Teacher — a base do painel "relatorios na sala". */
export interface RelatorioDoProfessor {
  relatorio_id: number;
  /** null = o professor lancou para alguem que nao esta na grade — pendencia real. */
  apresentacao_id: number | null;
  aluno_id: number;
  aluno_nome: string | null;
  pessoa_chave: string;
  curso: string;
  professor_id: number | null;
  professor_nome: string | null;
  relatorio_status: string;
  musica_lancada: boolean;
  enviado_em: string | null;
  aprovado_em: string | null;
}

export const RELATORIO_STATUS_LABEL: Record<string, string> = {
  sem_voz: 'sem voz',
  gerando: 'gerando',
  pronto_para_revisar: 'pronto para revisar',
  enviado: 'enviado',
  devolvido: 'devolvido',
  aprovado: 'aprovado',
};

export function useRelatoriosDoEvento(eventoId: number | null) {
  const [relatorios, setRelatorios] = useState<RelatorioDoProfessor[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!eventoId) {
      setRelatorios([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    const { data, error } = await supabase.rpc('evento_relatorios_v1', {
      p_evento_id: eventoId,
    });
    if (error) {
      setErro(error.message);
      setRelatorios([]);
    } else {
      setRelatorios((data ?? []) as RelatorioDoProfessor[]);
    }
    setLoading(false);
  }, [eventoId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { relatorios, loading, erro, recarregar };
}

/* ─── toca junto (pedido do professor no LA Teacher, decisao da coordenacao) ─── */

/** Um pedido de "toca junto" — a linha da `evento_toca_junto_lista_v1`. */
export interface PedidoTocaJunto {
  id: number;
  status: 'pedido' | 'confirmado' | 'recusado' | 'cancelado';
  aluno_id: number;
  aluno_nome: string;
  curso_chave: string;
  /** null = a apresentacao do aluno ainda nao existe na grade. */
  apresentacao_id: number | null;
  com_aluno_id: number;
  com_aluno_nome: string;
  com_curso_chave: string;
  com_apresentacao_id: number | null;
  pedido_por_professor_id: number | null;
  pedido_por_professor_nome: string | null;
  pedido_em: string;
  decidido_por: string | null;
  decidido_em: string | null;
  motivo: string | null;
}

/** Pedidos do evento, todos os status — a grade filtra 'pedido' na hora de exibir. */
export function useTocaJunto(eventoId: number | null) {
  const [pedidos, setPedidos] = useState<PedidoTocaJunto[]>([]);
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    if (!eventoId) {
      setPedidos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('evento_toca_junto_lista_v1', {
      p_evento_id: eventoId,
    });
    if (!error) setPedidos((data ?? []) as PedidoTocaJunto[]);
    setLoading(false);
  }, [eventoId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { pedidos, loading, recarregar };
}

/**
 * Decide um pedido. Aprovar junta na grade PRIMEIRO (`evento_apresentacao_juntar_v1`)
 * e só confirma no LA Teacher se a junção funcionar — a RPC é atômica, uma falha
 * desfaz os dois lados e o pedido continua 'pedido'. Recusar exige motivo.
 */
export async function decidirTocaJunto(pedidoId: number, aprovar: boolean, motivo?: string) {
  return supabase.rpc('evento_toca_junto_decidir_v1', {
    p_pedido_id: pedidoId,
    p_aprovar: aprovar,
    p_motivo: motivo ?? null,
  });
}

/**
 * Coordenação marca (`tipo`) ou desmarca (null) o selo de formando à mão.
 * Grava formatura_origem='manual' — a rotina automática nunca sobrescreve.
 */
export async function definirFormando(
  eventoId: number,
  pessoaChave: string,
  alunoId: number,
  tipo: 'kids' | 'bebes' | null,
) {
  return supabase.rpc('evento_formando_definir_v1', {
    p_evento_id: eventoId,
    p_pessoa_chave: pessoaChave,
    p_aluno_id: alunoId,
    p_tipo: tipo,
  });
}

/**
 * Signed URL do playback — o bucket `recital-playback` e do LA Teacher e a policy dele
 * nao conhece o ADM; a edge `recital-midia-url` assina com service_role depois de
 * conferir que o evento e da unidade do chamador.
 */
export async function criarUrlDePlayback(playbackPath: string) {
  const { data, error } = await supabase.functions.invoke('recital-midia-url', {
    body: { path: playbackPath },
  });
  if (error) return { url: null as string | null, error };
  const url = (data as { url?: string } | null)?.url ?? null;
  if (!url) return { url: null, error: { message: 'A resposta não trouxe o link do áudio.' } };
  return { url, error: null };
}

/**
 * Marca os certificados EMITIDOS — por APRESENTACAO (pessoa x curso), decisao do Alf de
 * 27/09: quem faz Teclado e Violao recebe dois.
 *
 * 🔴 Mesmo cuidado de `marcarChegada`: update sem retorno pode ser zero linhas filtradas
 * pela policy e ninguem percebe. `.select('id')` e a checagem fazem a diferenca.
 */
export async function marcarCertificadosEmitidos(apresentacaoIds: number[]) {
  if (apresentacaoIds.length === 0) return { error: null };
  const { data, error } = await supabase
    .from('evento_apresentacao')
    .update({ certificado_status: 'emitido', certificado_em: new Date().toISOString() })
    .in('id', apresentacaoIds)
    .select('id');
  if (error) return { error };
  const gravados = (data ?? []).length;
  if (gravados < apresentacaoIds.length) {
    return {
      error: {
        message: `${gravados} de ${apresentacaoIds.length} certificados foram marcados como emitidos.`,
      },
    };
  }
  return { error: null };
}

/* ─────────── bilheteria (M9) — venda registrada pela equipe, conciliacao da Sol ─────────── */

export type VendaStatus = 'pendente' | 'pago' | 'cancelado' | 'reembolsado';
export type ConciliacaoStatus = 'pendente' | 'conciliado' | 'divergente' | 'estornado';
export type FormaPagamento = 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro' | 'outro';
export type CanalVenda = 'online' | 'balcao' | 'porta';

export const VENDA_STATUS_LABEL: Record<VendaStatus, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
};
export const CONCILIACAO_LABEL: Record<ConciliacaoStatus, string> = {
  pendente: 'A conciliar',
  conciliado: 'Conciliado',
  divergente: 'Divergente',
  estornado: 'Estornado',
};
export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};
export const CANAL_LABEL: Record<CanalVenda, string> = {
  online: 'Online',
  balcao: 'Balcão',
  porta: 'Porta',
};

export interface ConvidadoDaVenda {
  id: number;
  nome: string;
  /** checkin_em do bloco credenciado — null = ainda nao entrou */
  checkin_em: string | null;
}

export interface VendaIngresso {
  id: number;
  bloco_id: number;
  bloco_nome: string | null;
  comprador_nome: string;
  comprador_contato: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_meia: number | null;
  desconto_pct: number;
  valor_bruto: number;
  valor_final: number;
  forma_pagamento: FormaPagamento;
  canal: CanalVenda;
  provedor: string | null;
  status: VendaStatus;
  pagamento_identificador: string | null;
  pago_em: string | null;
  conciliacao_status: ConciliacaoStatus;
  conciliacao_obs: string | null;
  conciliacao_ref: string | null;
  created_at: string;
  convidados: ConvidadoDaVenda[];
}

export interface LotacaoBloco {
  bloco_id: number;
  capacidade: number | null;
  cortesias: number;
  vendidos_pagos: number;
  pendentes: number;
  livres: number | null;
}

export interface PrecoEvento {
  preco_unitario: number;
  preco_meia: number | null;
}

export interface PacoteEvento {
  id: number;
  quantidade_minima: number;
  desconto_pct: number;
}

export interface BlocoBilheteria {
  id: number;
  nome: string;
  ordem: number;
  data: string | null;
  horario_inicial: string | null;
  capacidade: number | null;
}

export interface ConfigBilheteria {
  cortesias_por_aluno: number | null;
  provedor_pagamento: string | null;
  provedor_conta: string | null;
}

export interface ParticipanteParaVenda {
  id: number;
  aluno_id: number;
  nome: string;
}

export function useBilheteria(eventoId: number | null) {
  const [vendas, setVendas] = useState<VendaIngresso[]>([]);
  const [lotacao, setLotacao] = useState<LotacaoBloco[]>([]);
  const [preco, setPreco] = useState<PrecoEvento | null>(null);
  const [pacotes, setPacotes] = useState<PacoteEvento[]>([]);
  const [blocos, setBlocos] = useState<BlocoBilheteria[]>([]);
  const [config, setConfig] = useState<ConfigBilheteria | null>(null);
  const [cortesiasUsadas, setCortesiasUsadas] = useState(0);
  const [participantes, setParticipantes] = useState<ParticipanteParaVenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!eventoId) {
      setVendas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);

    const [rVendas, rLotacao, rPreco, rPacotes, rBlocos, rEvento, rCortesias] = await Promise.all([
      supabase
        .from('evento_ingresso_venda')
        .select(
          'id, bloco_id, comprador_nome, comprador_contato, quantidade, valor_unitario,' +
            ' valor_meia, desconto_pct, valor_bruto, valor_final, forma_pagamento, canal,' +
            ' provedor, status, pagamento_identificador, pago_em, conciliacao_status,' +
            ' conciliacao_obs, conciliacao_ref, created_at,' +
            ' evento_bloco(nome),' +
            ' evento_convidado(id, nome)',
        )
        .eq('evento_id', eventoId)
        .order('created_at', { ascending: false }),
      supabase.from('vw_evento_bloco_lotacao').select('*').eq('evento_id', eventoId),
      supabase
        .from('evento_ingresso_preco')
        .select('preco_unitario, preco_meia')
        .eq('evento_id', eventoId)
        .maybeSingle(),
      supabase
        .from('evento_ingresso_pacote')
        .select('id, quantidade_minima, desconto_pct')
        .eq('evento_id', eventoId)
        .order('quantidade_minima'),
      supabase
        .from('evento_bloco')
        .select('id, nome, ordem, data, horario_inicial, capacidade')
        .eq('evento_id', eventoId)
        .order('ordem'),
      supabase
        .from('evento')
        .select('cortesias_por_aluno, provedor_pagamento, provedor_conta')
        .eq('id', eventoId)
        .single(),
      // cortesias em uso (convidados cortesia credenciados ou nao)
      supabase
        .from('evento_convidado')
        .select('id', { count: 'exact', head: true })
        .eq('evento_id', eventoId)
        .eq('tipo_entrada', 'cortesia'),
    ]);

    // participantes do evento (vinculo opcional da venda com o aluno da familia)
    const { data: rPart } = await supabase
      .from('evento_participacao')
      .select('id, aluno_id, alunos(nome)')
      .eq('evento_id', eventoId)
      .order('aluno_id');
    const listaPart: ParticipanteParaVenda[] = ((rPart ?? []) as any[]).map((p) => ({
      id: p.id,
      aluno_id: p.aluno_id,
      nome: p.alunos?.nome ?? `Aluno #${p.aluno_id}`,
    }));

    const falha =
      rVendas.error ?? rLotacao.error ?? rPreco.error ?? rPacotes.error ?? rBlocos.error ?? rEvento.error;
    if (falha) {
      setErro(falha.message);
      setVendas([]);
      setLoading(false);
      return;
    }

    // check-in dos convidados de cada venda (tabela separada, PK composta)
    const convIds = ((rVendas.data ?? []) as any[]).flatMap((v) =>
      (v.evento_convidado ?? []).map((c: any) => c.id),
    );
    const checkins = new Map<number, string>();
    if (convIds.length > 0) {
      const { data: cks } = await supabase
        .from('evento_convidado_checkin')
        .select('convidado_id, checkin_em')
        .in('convidado_id', convIds);
      for (const ck of cks ?? []) checkins.set(ck.convidado_id, ck.checkin_em);
    }

    setVendas(
      ((rVendas.data ?? []) as any[]).map((v) => ({
        ...v,
        bloco_nome: v.evento_bloco?.nome ?? null,
        convidados: ((v.evento_convidado ?? []) as any[])
          .map((c) => ({ id: c.id, nome: c.nome, checkin_em: checkins.get(c.id) ?? null }))
          .sort((a, b) => a.id - b.id),
      })),
    );
    setLotacao((rLotacao.data ?? []) as LotacaoBloco[]);
    setPreco((rPreco.data as PrecoEvento | null) ?? null);
    setPacotes((rPacotes.data ?? []) as PacoteEvento[]);
    setBlocos((rBlocos.data ?? []) as BlocoBilheteria[]);
    setConfig(rEvento.data as ConfigBilheteria);
    setCortesiasUsadas(rCortesias.count ?? 0);
    setParticipantes(listaPart);
    setLoading(false);
  }, [eventoId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { vendas, lotacao, preco, pacotes, blocos, config, cortesiasUsadas, participantes, loading, erro, recarregar };
}

export interface NovaVendaInput {
  evento_id: number;
  bloco_id: number;
  comprador_nome: string;
  /** contato do comprador (telefone/e-mail) — necessidade operacional, nao sai pra planilha de professor */
  comprador_contato?: string | null;
  quantidade: number;
  forma_pagamento: FormaPagamento;
  canal: CanalVenda;
  convidados: { nome?: string; documento?: string }[];
  /** pacote que a tela previu; null = a RPC escolhe o melhor sozinha */
  pacote_id?: number | null;
  /** pago na hora (porta/balcao): marca 'pago' + pago_em + identificador na mesma gravacao */
  pago_agora: boolean;
  pagamento_identificador?: string | null;
  participacao_id?: number | null;
  observacao?: string | null;
}

/**
 * Registra a venda pela RPC com lock de bloco — duas recepcionistas simultaneas nunca
 * furam a lotacao. O erro ja vem pronto do banco ("Bloco lotado: 0 livres, 1 pedidos").
 */
export async function venderIngresso(input: NovaVendaInput) {
  const { data, error } = await supabase.rpc('evento_bilheteria_vender_v1', {
    p_evento_id: input.evento_id,
    p_bloco_id: input.bloco_id,
    p_comprador_nome: input.comprador_nome,
    p_quantidade: input.quantidade,
    p_forma_pagamento: input.forma_pagamento,
    p_canal: input.canal,
    p_comprador_contato: input.comprador_contato ?? null,
    p_convidados: input.convidados,
    p_pacote_id: input.pacote_id ?? null,
    p_marcar_pago: input.pago_agora,
    p_pagamento_identificador: input.pagamento_identificador ?? null,
    p_participacao_id: input.participacao_id ?? null,
    p_observacao: input.observacao ?? null,
  });
  return { vendaId: (data as number | null) ?? null, error };
}

/**
 * Marca a venda como PAGA. O CHECK do banco exige identificador (NSU/autorizacao ou
 * comprovante Pix) para tudo que nao e dinheiro — a tela valida antes, mas o banco
 * e quem decide.
 */
export async function marcarVendaPaga(
  vendaId: number,
  formaPagamento: FormaPagamento,
  identificador: string | null,
) {
  const { data, error } = await supabase
    .from('evento_ingresso_venda')
    .update({
      status: 'pago',
      forma_pagamento: formaPagamento,
      pagamento_identificador: identificador,
      pago_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', vendaId)
    .eq('status', 'pendente')
    .select('id');
  if (error) return { error };
  if ((data ?? []).length === 0) {
    return { error: { message: 'A venda não estava pendente ou não é da sua unidade.' } };
  }
  return { error: null };
}

/** Cancelar/reembolsar libera o lugar na hora (a view so conta pendente+pago). */
export async function mudarStatusVenda(vendaId: number, status: 'cancelado' | 'reembolsado') {
  const { data, error } = await supabase
    .from('evento_ingresso_venda')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', vendaId)
    .select('id');
  if (error) return { error };
  if ((data ?? []).length === 0) {
    return { error: { message: 'Venda não encontrada ou fora da sua unidade.' } };
  }
  return { error: null };
}

/* ── configuracao da bilheteria do evento ── */

/** preco_unitario = referencia (inteira); preco_meia = preco COBRADO de todos. */
export async function salvarPrecoEvento(
  eventoId: number,
  precoUnitario: number,
  precoCobrado: number | null,
) {
  return supabase
    .from('evento_ingresso_preco')
    .upsert(
      { evento_id: eventoId, preco_unitario: precoUnitario, preco_meia: precoCobrado, updated_at: new Date().toISOString() },
      { onConflict: 'evento_id' },
    )
    .select('evento_id');
}

export async function criarPacote(eventoId: number, quantidadeMinima: number, descontoPct: number) {
  return supabase
    .from('evento_ingresso_pacote')
    .insert({ evento_id: eventoId, quantidade_minima: quantidadeMinima, desconto_pct: descontoPct })
    .select('id');
}

export async function removerPacote(pacoteId: number) {
  return supabase.from('evento_ingresso_pacote').delete().eq('id', pacoteId).select('id');
}

export async function salvarCapacidadeBloco(blocoId: number, capacidade: number | null) {
  const { data, error } = await supabase
    .from('evento_bloco')
    .update({ capacidade, updated_at: new Date().toISOString() })
    .eq('id', blocoId)
    .select('id');
  if (error) return { error };
  if ((data ?? []).length === 0) return { error: { message: 'Bloco não é da sua unidade.' } };
  return { error: null };
}

export async function salvarConfigBilheteria(eventoId: number, campos: Partial<ConfigBilheteria>) {
  return supabase
    .from('evento')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', eventoId)
    .select('id');
}

/* ── convidados nominais na porta (check-in por bloco) ── */

export interface ConvidadoDaPorta {
  id: number;
  nome: string;
  tipo_entrada: 'cortesia' | 'vendido';
  bloco_id: number | null;
  venda_status: VendaStatus | null;
  checkin_em: string | null;
  alunos: string[];
}

/** Lista nominal da porta: cortesia + vendido, com o bloco credenciado e quem ja entrou. */
export function useConvidadosDoEvento(eventoId: number | null) {
  const [convidados, setConvidados] = useState<ConvidadoDaPorta[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!eventoId) {
      setConvidados([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    const [rConv, rPonte, rCheck] = await Promise.all([
      supabase
        .from('evento_convidado')
        .select('id, nome, tipo_entrada, bloco_id, venda_id, evento_ingresso_venda(status)')
        .eq('evento_id', eventoId)
        .order('nome'),
      // quem o convidado veio ver (ponte com participacao → nome do aluno)
      supabase
        .from('evento_convidado_participacao')
        .select('convidado_id, participacao_id, evento_participacao(aluno_id, alunos(nome))'),
      supabase
        .from('evento_convidado_checkin')
        .select('convidado_id, checkin_em'),
    ]);
    const falha = rConv.error ?? rPonte.error ?? rCheck.error;
    if (falha) {
      setErro(falha.message);
      setConvidados([]);
      setLoading(false);
      return;
    }
    const alunosPorConv = new Map<number, string[]>();
    for (const p of (rPonte.data ?? []) as any[]) {
      const nome = p.evento_participacao?.alunos?.nome;
      if (!nome) continue;
      alunosPorConv.set(p.convidado_id, [...(alunosPorConv.get(p.convidado_id) ?? []), nome]);
    }
    const checkinPorConv = new Map<number, string>();
    for (const ck of rCheck.data ?? []) checkinPorConv.set(ck.convidado_id, ck.checkin_em);

    setConvidados(
      ((rConv.data ?? []) as any[]).map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo_entrada: c.tipo_entrada,
        bloco_id: c.bloco_id,
        venda_status: c.evento_ingresso_venda?.status ?? null,
        checkin_em: checkinPorConv.get(c.id) ?? null,
        alunos: alunosPorConv.get(c.id) ?? [],
      })),
    );
    setLoading(false);
  }, [eventoId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { convidados, loading, erro, recarregar };
}

/** Renomeia o convidado nominal — o placeholder "Convidado N de X" se corrige ate o dia. */
export async function renomearConvidado(convidadoId: number, nome: string) {
  const limpo = nome.trim();
  if (limpo === '') return { error: { message: 'O nome não pode ficar vazio.' } };
  const { data, error } = await supabase
    .from('evento_convidado')
    .update({ nome: limpo, updated_at: new Date().toISOString() })
    .eq('id', convidadoId)
    .select('id');
  if (error) return { error };
  if ((data ?? []).length === 0) return { error: { message: 'Convidado fora da sua unidade.' } };
  return { error: null };
}

/** Check-in do convidado no bloco credenciado. Desfazer = apagar a linha. */
export async function marcarCheckinConvidado(convidadoId: number, blocoId: number, entrou: boolean) {
  if (entrou) {
    const { error } = await supabase
      .from('evento_convidado_checkin')
      .insert({ convidado_id: convidadoId, bloco_id: blocoId })
      .select('convidado_id');
    return { error };
  }
  const { data, error } = await supabase
    .from('evento_convidado_checkin')
    .delete()
    .eq('convidado_id', convidadoId)
    .eq('bloco_id', blocoId)
    .select('convidado_id');
  if (error) return { error };
  if ((data ?? []).length === 0) return { error: { message: 'Check-in não encontrado.' } };
  return { error: null };
}
