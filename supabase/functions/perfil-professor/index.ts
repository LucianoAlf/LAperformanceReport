import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const LETTER_TO_TEMP: Record<string, string> = { A: 'sanguineo', B: 'colerico', C: 'melancolico', D: 'fleumatico' };
const TEMP_TO_CODINOME: Record<string, string> = { sanguineo: 'SLASH', colerico: 'CAZUZA', melancolico: 'AMY', fleumatico: 'FRANK' };
const EVENTO_TOKEN = 'treinamento-evolucao-2026-2';
const VERSAO = 1;
const ranked = (counts: Record<string, number>) => Object.entries(counts).sort((a, b) => b[1] - a[1]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const action = new URL(req.url).searchParams.get('action') ?? 'submit';
  try {
    if (action === 'professores') {
      const { data, error } = await db.from('professores').select('id, nome, foto_url, temperamento_codinome').eq('ativo', true).order('nome');
      if (error) throw error;
      return json({ professores: data });
    }
    if (action === 'painel') {
      const { data: profs, error } = await db.from('professores').select('id, nome, foto_url, temperamento_codinome').eq('ativo', true).order('nome');
      if (error) throw error;
      const total = profs?.length ?? 0;
      const distribuicao: Record<string, number> = { SLASH: 0, CAZUZA: 0, AMY: 0, FRANK: 0 };
      const grid: Record<string, number> = {};
      for (const professor of profs ?? []) {
        if (!professor.temperamento_codinome) continue;
        const primario = String(professor.temperamento_codinome).split('/')[0];
        if (primario in distribuicao) distribuicao[primario]++;
        grid[professor.temperamento_codinome] = (grid[professor.temperamento_codinome] ?? 0) + 1;
      }
      const concluidos = (profs ?? []).filter((p) => p.temperamento_codinome).length;
      return json({ total, concluidos, pendentes: total - concluidos, distribuicao, grid, professores: profs });
    }
    if (action !== 'submit' || req.method !== 'POST') return json({ error: 'action_desconhecida' }, 404);
    const body = await req.json();
    const professorId = Number(body.professor_id);
    const respostas = body.respostas as { pergunta_numero: number; opcao_canonica: string; resposta_posicao: number }[];
    if (!professorId || !Array.isArray(respostas) || respostas.length < 13) return json({ error: 'payload_invalido' }, 400);
    const { data: existente } = await db.from('professor_perfil_testes').select('id, temperamento_codinome, temperamento_primario, temperamento_secundario, status').eq('professor_id', professorId).eq('evento_token', EVENTO_TOKEN).eq('status', 'concluido').maybeSingle();
    if (existente) return json({ ja_concluido: true, resultado: existente });
    const contagem: Record<string, number> = { sanguineo: 0, colerico: 0, melancolico: 0, fleumatico: 0 };
    for (const resposta of respostas) { const temp = LETTER_TO_TEMP[String(resposta.opcao_canonica).toUpperCase()]; if (temp) contagem[temp]++; }
    const ordem = ranked(contagem);
    const primario = ordem[0][0], secundario = ordem[1][0], codinome = `${TEMP_TO_CODINOME[primario]}/${TEMP_TO_CODINOME[secundario]}`;
    const { data: vinc } = await db.from('professores_unidades').select('unidade_id').eq('professor_id', professorId).limit(1).maybeSingle();
    const ajuste = body.ajuste_semestre ?? null;
    const { data: teste, error: insertError } = await db.from('professor_perfil_testes').insert({ professor_id: professorId, unidade_id: vinc?.unidade_id ?? null, contexto: 'PROF', versao_questionario: VERSAO, evento_token: EVENTO_TOKEN, status: 'concluido', temperamento_primario: primario, temperamento_secundario: secundario, temperamento_codinome: codinome, temperamento_contagem: contagem, ajuste_semestre: ajuste, ajuste_semestre_em: ajuste ? new Date().toISOString() : null, concluido_em: new Date().toISOString() }).select('id').single();
    if (insertError) throw insertError;
    const { error: respostasError } = await db.from('professor_perfil_respostas').insert(respostas.map((resposta) => ({ teste_id: teste.id, pergunta_numero: resposta.pergunta_numero, opcao_canonica: String(resposta.opcao_canonica).toUpperCase(), resposta_posicao: resposta.resposta_posicao ?? 0 })));
    if (respostasError) throw respostasError;
    await db.from('professores').update({ temperamento_codinome: codinome }).eq('id', professorId);
    return json({ ok: true, resultado: { teste_id: teste.id, temperamento_primario: primario, temperamento_secundario: secundario, temperamento_codinome: codinome, contagem } });
  } catch (error) {
    console.error('perfil-professor error:', error);
    return json({ error: 'erro_interno', detail: String((error as Error)?.message ?? error) }, 500);
  }
});
