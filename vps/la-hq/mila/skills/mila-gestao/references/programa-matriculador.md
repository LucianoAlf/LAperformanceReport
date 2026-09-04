# MATRICULADOR + LA — o programa que a Mila ajuda o time a ganhar

Programa de bonificação dos **Hunters** (responsáveis comerciais) das 3
unidades. Vigência **agosto a novembro**; premiação anual em **dezembro**.
Fonte: PDF oficial (04/09/2026). Os números vêm da tool `estrelas_matriculador`
— **nunca calcule de cabeça**.

## As 5 estrelas (todo mês, por unidade)

| # | estrela | ganha quando | Campo Grande | Recreio | Barra |
|---|---|---|---|---|---|
| 01 | **Matrícula Plus** | matrículas do mês ≥ média da unidade | **25** | **20** | **18** |
| 02 | **Show-up** | experimentais + visitas realizadas ≥ meta | **55** | **40** | **40** |
| 03 | **Ticket Premiado** | ticket médio ≥ referência **+ R$10** | 380 → **390** | 415 → **425** | 445 → **455** |
| 04 | **Max Indicação e L.A Family** | ≥ **5** matrículas vindas de Indicação/Family | 5 | 5 | 5 |
| 05 | **Hunter 360°** | **todas** as matrículas do mês com **anamnese preenchida** E **na comunidade** da unidade | todas | todas | todas |

- Pode ganhar mais de uma estrela no mês.
- **Destaque do mês** = quem tiver mais estrelas. Escolhe uma experiência do menu.
- **Desempate**, nesta ordem: (1) mais matrículas **acima** da própria média;
  (2) mais matrículas por Indicação/Family.
- **Anual** (ago–nov): quem acumular mais destaques → troféu, **14º salário**,
  reconhecimento em evento.

## Quem é o Hunter de cada unidade

Campo Grande: **Vitória** · Recreio: **Daiana** · Barra: **Kailane**.
(Tabela `unidade_contato_comercial`; a tool já devolve `hunter`.)

## Como usar isso para incentivar (o que a Mila faz)

- Sempre diga **quanto falta**, não só o total: *"faltam 2 pra Matrícula Plus"*.
- Aponte **a estrela mais perto**. Ticket a R$5 do alvo vale mais que matrícula
  a 15 de distância.
- **Hunter 360 é a mais barata de ganhar** — não depende de vender: é anamnese
  + comunidade. Se falta 1 anamnese, diga qual aluno e ofereça mandar o link.
- **Max Indicação é PISO**: só conta quando a matrícula tem lead vinculado. Se
  a consultora disser que fechou uma indicação que não aparece, registre o canal
  com `registrar_canal_origem` — é assim que a estrela passa a contar.
- Não crie ansiedade: no dia 4 do mês, 3 de 25 é normal. Compare com o ritmo
  (*"no ritmo de hoje você fecha o mês em ~22"*) só se a pessoa pedir.

## O que NÃO é o programa

Existe uma tabela antiga de **pontos** (`programa_matriculador_config`, nota de
corte 80). **Não é este programa** — nunca foi usada. O que vale é estrelas.
