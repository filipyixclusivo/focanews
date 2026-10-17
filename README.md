# Foca News

Portal de notícias com **369 veículos** do Brasil e do mundo (reforço na Bahia e em títulos nacionais), atualização diária automática de manchetes, planos pagos (Basic, Pro e Premium) e Área VIP.

## Como o site se mantém atualizado sozinho

1. O GitHub Actions (`.github/workflows/atualizar-noticias.yml`) roda **todo dia às 04:30 (Brasília)**.
2. Ele executa `scripts/atualizar-noticias.mjs`, que troca o acervo velho (`data/seed.js`) pelas manchetes recentes de todos os veículos.
3. O robô faz commit do acervo novo neste repositório.
4. A **Vercel**, ligada a este repositório, publica o site de novo automaticamente a cada commit.

Resultado: o site amanhece com notícias do dia, sem ninguém precisar mexer nele.

## Publicar na Vercel (uma única vez)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/SEU-USUARIO/focanews)

1. Clique no botão acima (ou, na Vercel: **Add New → Project → Import** deste repositório).
2. Não mude nada: a Vercel lê o `vercel.json` (comando de build e pasta de saída já estão certos).
3. Clique em **Deploy**. Pronto — e cada commit novo (inclusive o diário do robô) republica sozinho.

Detalhes e alternativas: [ATUALIZACAO-AUTOMATICA.md](ATUALIZACAO-AUTOMATICA.md).

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Atualizar as notícias na mão

```bash
node scripts/atualizar-noticias.mjs            # troca o acervo
node scripts/atualizar-noticias.mjs --simular  # só mostra o que faria
```
