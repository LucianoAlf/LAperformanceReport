// Autenticacao do observador Emusys — fail-closed desde 25/09/2026.
//
// O token esperado vem de OBSERVADOR_TOKEN e deve chegar em `x-observador-token`
// (header) ou `?token=` (query — o Emusys nao manda header custom, entao o token
// vai embutido na URL cadastrada la). Antes desta data, token esperado VAZIO
// desligava a verificacao e o endereco publico aceitava POST de qualquer origem,
// gravando em `leads` quando a escrita esta ligada. Agora: sem token configurado,
// nada passa — 401 para tudo.
export function tokenObservadorAutoriza(req: Request, tokenEsperado: string): boolean {
  if (!tokenEsperado) return false;
  const doHeader = req.headers.get('x-observador-token') ?? '';
  if (doHeader && doHeader === tokenEsperado) return true;
  try {
    return new URL(req.url).searchParams.get('token') === tokenEsperado;
  } catch (_e) {
    return false;
  }
}
