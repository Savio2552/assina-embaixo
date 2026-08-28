# Assina embaixo — quem paga e quem responde?

Simulação didática, em navegador, sobre a **Lei nº 15.190/2025** (Lei Geral do
Licenciamento Ambiental). O jogador coordena o licenciamento de uma agroindústria
de polpa de frutas em Capanema, no Pará, e decide, fase a fase, quem responde pela
atividade, quem arca com as despesas do processo e o que cabe à responsabilidade
técnica.

Cada decisão volta com o fundamento legal correspondente — a pontuação é só o
placar, o conteúdo está nos artigos.

## Como jogar

- **Online:** https://savio2552.github.io/assina-embaixo/
- **Local:** abra `index.html` no navegador. Não há build, dependências nem servidor.
- **Arquivo único:** `assina-embaixo.html` traz o jogo inteiro (HTML, CSS e JS
  embutidos) num só arquivo, para distribuir ou abrir offline sem os demais.

Dois modos: *individual* ou *por responsáveis*, em que cinco pessoas se cadastram
e cada uma assume um tema durante sua etapa. Duração: 15 a 20 minutos, sem cadastro.

## As cinco fases

1. Conhecendo o empreendimento
2. Quem paga a conta?
3. Missão técnica
4. Fiscalização surpresa
5. Decisão final

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `index.html` | Marcação das telas do processo |
| `estilo.css` | Estilo do "processo impresso", animações e responsividade |
| `jogo.js` | Mecânica e conteúdo jurídico (`CONTENT`), sem dependências |
| `assina-embaixo.html` | Build de arquivo único |
| `ufra.png`, `adm.png` | Logos da realização |

O conteúdo jurídico fica isolado na constante `CONTENT`, em `jogo.js`: dá para
trocar perguntas, alternativas e fundamentos sem mexer na mecânica.

## Acessibilidade

A splash de abertura é dispensada automaticamente para quem usa
`prefers-reduced-motion`, e pode ser pulada a qualquer momento por clique ou tecla.

## Créditos

Material didático de uso livre para fins educacionais. Créditos e valores no jogo
são fictícios; a cópia gerada não vale como licença.

Texto da lei: <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15190.htm>
