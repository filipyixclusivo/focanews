# Atualização automática diária de notícias

O Foca News **troca as notícias velhas pelas recentes todos os dias**, sem ninguém precisar mexer no site.

## Como funciona

1. **`scripts/atualizar-noticias.mjs`** lê os 339 veículos do catálogo (`data/seed.js`).
2. Para cada veículo, ele busca as manchetes recentes pelo domínio oficial (Google Notícias como rede de segurança, igual ao que o painel da redação já anunciava) e fica só com o que saiu nas **últimas 72 horas** (se o dia estiver fraco, abre para 7 dias).
3. Deduplica, limita a 2 por veículo e grava o acervo novo em `data/seed.js`, já ordenado do mais recente para o mais antigo.
4. **Trava de segurança:** se a rede falhar e vier pouca notícia, ele **não publica** — mantém o acervo anterior. Site vazio, nunca.
5. Nenhuma manchete é inventada: título, resumo, data e link vêm do feed de cada veículo.

Para rodar na mão, a qualquer hora:

```bash
node scripts/atualizar-noticias.mjs            # troca o acervo
node scripts/atualizar-noticias.mjs --simular  # só mostra o que faria
```

## Para ser todo dia, sozinho (escolha UMA opção)

### Opção A — GitHub + Vercel (a escolhida)
1. Suba esta pasta como um repositório no GitHub (guia clique a clique: `SUBIR-PARA-GITHUB-E-VERCEL.md`, ou rode `./publicar-github.sh`).
2. Na Vercel: **Add New → Project → Import** → escolha o repositório → **Deploy**. O `vercel.json` já traz comando de build e pasta de saída — não mude nada.
3. Pronto: o workflow `atualizar-noticias.yml` roda **todo dia às 04:30 (Brasília)**, atualiza o acervo e faz commit — e a Vercel, ligada ao repositório, republica o site automaticamente a cada commit.

### Opção B — Build hook agendado, sem GitHub (alternativa)
1. No Netlify: *Site settings → Build & deploy → Build hooks → Add build hook* e copie a URL gerada.
2. Use qualquer agendador gratuito (ex.: cron-job.org) para chamar essa URL 1× por dia.
3. Garanta que o comando de build do site seja:
   `node scripts/atualizar-noticias.mjs --tolerante && echo ok`
   Assim, a cada deploy o acervo é buscado na hora; se a busca falhar, o `--tolerante` mantém o acervo que já estava no ar.

### Opção C — Manual por ZIP (como você faz hoje)
Rode `node scripts/atualizar-noticias.mjs` no seu computador, gere o ZIP de novo e arraste para o Netlify. Funciona, mas aí a "automaticidade" depende de você lembrar.

## E quem já está com o site aberto?

O navegador do leitor também se corrige sozinho: a cada visita, o acervo editorial é substituído pelo mais recente que veio no site (as matérias que o próprio leitor criou, salvou ou curtiu continuam guardadas). Nada de notícia velha presa no cache do aparelho.
