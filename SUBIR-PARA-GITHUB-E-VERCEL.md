# Foca News na Vercel com atualização diária — guia clique a clique

O projeto já está pronto e commitado (pasta `focanews_work`, também no ZIP `focanews-github.zip`).
Faltam só **dois cadastros gratuitos** e **três ligações** — tudo feito por você, no seu navegador,
porque GitHub e Vercel só aceitam autorização do dono da conta. Tempo total: ~5 minutos.

---

## Passo 1 — Criar a conta no GitHub (se ainda não tiver)
1. Abra **github.com** → **Sign up** → e-mail, senha e nome de usuário.
2. Confirme o e-mail e pronto. (Grátis.)

## Passo 2 — Criar o repositório e subir o projeto
**Jeito fácil (sem instalar nada):**
1. Baixe/descompacte o `focanews-github.zip` no seu computador.
2. No GitHub: botão **+** (canto superior direito) → **New repository**.
3. Nome: `focanews` · marque **Public** · **NÃO** marque "Add a README" (já tem um) → **Create repository**.
4. Na tela do repositório vazio, clique em **uploading an existing file**.
5. Arraste **todo o conteúdo de dentro da pasta** descompactada (arquivos e pastas, incluindo a pasta oculta `.github` — no Windows, ative "Itens ocultos" no Explorador para vê-la; sem ela, a atualização diária não roda).
6. **Commit changes**. Subiu!

**Jeito rápido (com Git instalado):** dentro da pasta, rode `./publicar-github.sh` — ele cria o repositório e envia tudo sozinho.

## Passo 3 — Ligar a Vercel ao repositório
1. Abra **vercel.com** → **Sign Up** → **Continue with GitHub** (use a mesma conta do passo 1).
2. **Add New → Project** → na lista "Import Git Repository", ache **`focanews`** → **Import**.
3. Não mude nenhuma configuração (o arquivo `vercel.json` já diz o que fazer) → **Deploy**.
4. Em ~1 minuto a Vercel mostra o endereço do site no ar, algo como `focanews.vercel.app`. 🎉

## Passo 4 — Conferir a automação diária (1 clique)
1. No GitHub, dentro do repositório: aba **Actions**.
2. Você verá o fluxo **"Atualização diária de notícias"**. Para testar na hora: clique nele → **Run workflow** → **Run workflow**.
3. Em ~1 minuto ele busca as manchetes recentes, faz commit — e a Vercel republica o site sozinha (confira em **Deployments** na Vercel).
4. Daí em diante roda **todo dia às 04:30 (horário de Brasília)**, sem ninguém mexer.

## Se algo der diferente
- **Vercel não achou o repositório:** na tela de importação, clique em "Adjust GitHub App Permissions" e autorize o acesso ao repositório `focanews`.
- **Actions com erro de permissão:** no GitHub, *Settings → Actions → General → Workflow permissions* → marque **Read and write permissions** → Save. (O fluxo precisa disso para fazer o commit diário.)
- **Site abriu sem as imagens de capa de algumas matérias:** normal — veículos sem foto no feed usam a arte da editoria, como já acontecia.

Pronto: notícias recentes todo dia, site na Vercel, custo R$ 0 nos planos gratuitos de GitHub + Vercel para um projeto deste tamanho.
