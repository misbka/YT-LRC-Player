# 🎵 YT Player — YouTube + Letras Sincronizadas

#
![](https://i.ibb.co/pjGZyXz7/img1.png)
#
![](https://i.ibb.co/PyMVg0n/img2.png)

Player de música web que busca faixas no YouTube e reproduz com **letra sincronizada em tempo real** (estilo karaoke), usando letras do [LRCLIB](https://lrclib.net/).

Funciona como **app desktop (Electron)** ou direto no **navegador**. O backend é Node puro — sem banco de dados e sem chave de API.

## ✨ Funcionalidades

- 🔍 **Buscar músicas** no YouTube (título, canal, duração, views e thumbnail)
- ▶️ **Player embutido** com controles próprios: tocar/pausar, anterior/próxima, barra de progresso e volume
- 📜 **Letra sincronizada via LRCLIB** — a linha atual é destacada conforme a música toca, com scroll automático
- 🖱️ **Clique numa linha da letra** para pular direto para aquele momento da música
- 🎵 **Playlists** — crie, renomeie e exclua playlists; adicione músicas pelo ➕ dos resultados ou do player; reordene (⬆⬇) e remova (✕); toque em ordem ou **embaralhada** (🔀)
- 💾 **Playlists persistidas** no `localStorage` — sobrevivem ao fechar o app e ao recarregar a página
- 🧠 **Busca inteligente da letra** — limpa o título ("Official Video", "Lyrics", "[4K]"...), separa artista/título, usa canais "* - Topic" como artista e prioriza resultados com duração compatível
- ↩️ **Fallback** para letra sem sincronização (texto puro) quando o LRCLIB não tem os timestamps
- ⏭️ Avança automaticamente para a próxima música da lista ao final
- ⌨️ Atalhos de teclado
- 📱 Layout responsivo (empilha os painéis em janelas estreitas)

## 🚀 Como executar

Requisitos: [Node.js](https://nodejs.org) 18+ (usa `fetch` nativo).

### 🖥️ App desktop (Electron) — recomendado

```bash
npm install
npm start
```

Abre uma janela nativa com o player. O app sobe o servidor local automaticamente em uma porta livre — sem precisar rodar `node server.js` à parte.

**Gerar instalador:**

```bash
npm run dist    # gera o instalador (Windows .exe, Linux .AppImage, macOS .dmg)
npm run pack    # só a pasta do app, sem instalador
```

### 🌐 Versão web no navegador

```bash
npm run web
```

Abra **http://localhost:3000** no navegador. Para usar outra porta: `PORT=8080 npm run web`.

> ⚠️ Acesse via `localhost` (não via `file://`): o player do YouTube precisa de um referrer HTTP válido.

### ✨ Diferenças da versão Electron

- Janela nativa, com menu oculto (aparece no `Alt`) e atalhos de `F5` (recarregar) e `Ctrl+Shift+I` (devtools)
- User-Agent do Chrome aplicado, evitando bloqueios do YouTube no embed
- Trava de instância única (abrir de novo foca a janela existente)
- Links externos abrem no navegador padrão do sistema

## 🎹 Atalhos de teclado

| Tecla | Ação |
|---|---|
| `Espaço` | Tocar / pausar |
| `→` | Avançar 5 s |
| `←` | Voltar 5 s |

## 🏗️ Como funciona

```
Janela (Electron) ou Navegador ──▶ Node (server.js) ──▶ Instâncias Piped  (busca de vídeos do YouTube)
                                        │
                                        └────────────▶ lrclib.net         (letras sincronizadas)
```

- **Busca**: o navegador não fala com o YouTube diretamente. O servidor consulta instâncias públicas da API [Piped](https://github.com/TeamPiped/Piped) com *fallback* automático entre várias instâncias, e devolve os resultados como JSON.
- **Reprodução**: player oficial do [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), carregado no cliente.
- **Letras**: o servidor consulta a API pública [LRCLIB](https://lrclib.net/) — primeiro por combinação exata (artista + faixa + duração), depois por busca livre com pontuação (prefere letras sincronizadas e duração próxima).
- **Sincronização**: o cliente parseia o formato [LRC](https://www.lyrics.com/lyrics-formats.asp) (`[mm:ss.xx] linha`) e, a cada 250 ms, compara o tempo do player com os timestamps para destacar a linha atual.

O proxy no servidor evita problemas de CORS e esconde as instâncias usadas do cliente.

## 📁 Estrutura do projeto

```
├── server.js          # Servidor HTTP (Node puro, sem dependências)
│                      #   /api/search → busca no YouTube (Piped)
│                      #   /api/lyrics → letras (LRCLIB)
│                      #   + arquivos estáticos de public/
├── package.json       # Scripts npm (start, web, dist) e config do electron-builder
├── electron/
│   ├── main.js        # Processo principal: janela, UA do Chrome, porta livre
│   └── preload.js     # Expõe info mínima (plataforma/versão) ao renderer
└── public/
    ├── index.html     # Layout: abas Busca/Playlists, player, letras e modais
    ├── style.css      # Tema escuro
    └── app.js         # Player, fila de músicas, playlists (localStorage) e sincronização da letra
```

## 🔌 Endpoints da API

| Rota | Parâmetros | Descrição |
|---|---|---|
| `GET /api/search` | `q` | Busca vídeos no YouTube; retorna `{ source, items[] }` com `id`, `title`, `uploader`, `duration`, `views`, `thumbnail` |
| `GET /api/lyrics` | `query`, `trackName`, `artistName`, `albumName`, `duration` | Consulta o LRCLIB; retorna `{ trackName, artistName, synced, syncedLyrics, plainLyrics, ... }` |

As **playlists** são salvas no `localStorage` do navegador/app (chave `ytplayer.playlists`) — 100% no cliente, sem endpoint.

## ⚠️ Notas

- Se uma música não tiver letra, o LRCLIB não possui a faixa — o vídeo continua tocando normalmente e o painel mostra "não encontrada".
- Instâncias Piped são comunitárias e às vezes caem; o servidor tenta a próxima automaticamente. Se todas falharem, ajuste a lista `PIPED_INSTANCES` em `server.js`.
- Este projeto é apenas para uso pessoal/educacional e não hospeda nenhum conteúdo — tudo é reproduzido do YouTube.

## 📄 Licença

MIT
