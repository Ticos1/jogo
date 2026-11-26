# Astro Paws: Invasão Gosmenta 🐱🚀

Jogo de sobrevivência em ondas para navegador (HTML5), feito para os portais **CrazyGames** e **Poki**.
Um gatinho astronauta enfrenta hordas de gosmas espaciais, sobe de nível e escolhe melhorias.

**Jogar:** https://ticos1.github.io/jogo/

## Controles
- Computador: **WASD** ou **setas**. **Esc**/**P** pausa. **1/2/3** escolhem a melhoria.
- Celular: arraste o dedo em qualquer lugar da tela.

## O que já tem
- 5 armas (Pistola Laser, Novelo Cósmico, Peixe-Foguete, Patada Sônica, Nebulosa de Leite) e 7 melhorias passivas
- 4 tipos de gosma, enxames a cada minuto e o **Rei Gosma** (chefe) a cada 3 minutos
- Loja de melhorias permanentes com moedas (salvo no navegador)
- Inglês e português, música e efeitos sonoros gerados por código (sem arquivos para baixar)
- Anúncios recompensados: reviver, dobrar moedas e novas opções de melhoria
- Anúncio entre partidas (a partir da 2ª partida)

## Portais
O arquivo `src/platform.js` integra os SDKs. O portal é escolhido pela URL:
- `?portal=crazygames` → CrazyGames SDK v3
- `?portal=poki` → Poki SDK
- sem parâmetro (ou fora dos portais) → modo de teste com anúncio simulado

## Rodar localmente
Qualquer servidor estático serve. Por exemplo:

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000
