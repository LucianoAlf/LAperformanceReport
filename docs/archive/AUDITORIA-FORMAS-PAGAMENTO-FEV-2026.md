# Auditoria Formas de Pagamento — Fevereiro/2026

## ✅ CONCLUÍDO (15/02/2026)

**244 alunos da Barra atualizados com forma de pagamento.**

## Mapeamento CSV → BD

| Forma no CSV | ID BD | Nome BD |
|--------------|-------|---------|
| `Cobrança Automática / Cartão de Crédito` | 1 | Crédito Recorrente |
| `Pagamento Recorrente / (Preferencial)` | 1 | Crédito Recorrente |
| `Cartão de Crédito` | 1 | Crédito Recorrente |
| `Cartão de Débito` | 7 | Cartão de Débito |
| `Cheque ...` | 2 | Cheque |
| `Pix` | 3 | Pix |
| `Boleto` | 6 | Boleto |
| `Cobrança Automática / Boleto` | 6 | Boleto |

## Formas de Pagamento Disponíveis no BD

| ID | Nome | Sigla | Ícone |
|----|------|-------|-------|
| 1 | Crédito Recorrente | C.R | 💳 |
| 2 | Cheque | CHQ | 📄 |
| 3 | Pix | PIX | 📱 |
| 4 | Dinheiro | DIN | 💵 |
| 5 | Link | LNK | 🔗 |
| 6 | Boleto | BOL | 🧾 |
| 7 | Cartão de Débito | DEB | 💳 |

## Resultado da Atualização

| Forma de Pagamento | Qtd Alunos |
|-------------------|------------|
| Crédito Recorrente | 223 |
| Pix | 10 |
| Cheque | 5 |
| Boleto | 4 |
| Dinheiro | 2 |
| **TOTAL** | **244** |

## Alunos com Formas Específicas

### Pix (10):
- Francisco Thomé Godoi, Agatha Carias, Filippe Carnetti, Giovani Breda, Ana Vitória de Lima, Elizaveta Bogatyreva (2 cursos), Paulo César Benzi

### Cheque (5):
- Martina Gomes, Gabriela Noritomi, Clara de Souza Dantas Lapa, Bento Lapa Cazarim, Tito Lapa Cazarim

### Boleto (4):
- Carlos Vitor Pinheiro, Vivian Dangelo, Ana Paula dos Santos Souza, Lucas Cardoso Neiva

### Dinheiro (2):
- Pedro José Nadaes, Julia dos Santos Nadaes

## Alunos que NÃO estavam no CSV (receberam Crédito Recorrente por default)

| Nome | Curso | Valor | Motivo |
|------|-------|-------|--------|
| Billy Paulo Vangu | Teclado | R$ 365 | ✅ PAI (filho é Billy Paulo Vangu Junior) |
| Clarice Massae Castro Fukamati | Musicalização Infantil | R$ 385 | ✅ Entrou em 13/02/2026 |
| Laura Akemi Castro Fukamati | Musicalização para Bebês | R$ 385 | ✅ Entrou em 13/02/2026 |
| Isabela Cavalcanti Hammerschlag Reis | Piano | R$ 480 | ✅ Entrou em 09/02/2026 |
| Felipe Cassiano de Almeira Imperial | Bateria | R$ 0 | ❓ Bolsista? |
| Rafael Mello dos Santos | (sem curso) | R$ 0 | ❓ Sem curso definido |
| Ludmilla Lage Gonçalves | Bateria | R$ 380 | ❓ Verificar forma pgto |
| Antonio Dias Santos | Guitarra | R$ 470 | ⚠️ Vai sair (limpeza) |
| Katia Regina Goulart Trindade | Canto | R$ 447 | ⚠️ Vai sair (aviso) |
| Sara Gomes dos Santos | Canto | R$ 340 | ⚠️ Vai sair (aviso) |

## Observações

1. **Cartão de Débito** — Criado como ID 7. Usado apenas para vendas avulsas (ex: palheta do Arthur Titus), não para parcelas.
2. **Crédito Recorrente** — Usado como default para alunos sem informação no CSV. É a forma mais comum (~91%).
3. **Duplicata encontrada** — "Isabela Cavalcanti" (inativo) é duplicata de "Isabela Cavalcanti Hammerschlag Reis" (ativo).
