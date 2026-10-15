#!/usr/bin/env bash
# Publica o Foca News no GitHub em um comando (rode dentro desta pasta, no seu computador).
# Pré-requisito: GitHub CLI instalado (https://cli.github.com) — ou crie o repositório
# pelo site e use os comandos git indicados no README/guia.
set -e
NOME_REPO="${1:-focanews}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Falta o GitHub CLI. Instale em https://cli.github.com e rode de novo."
  echo "Sem ele, o caminho é: crie um repositório vazio em github.com/new,"
  echo "depois rode:  git remote add origin https://github.com/SEU-USUARIO/$NOME_REPO.git && git push -u origin main"
  exit 1
fi

gh auth status >/dev/null 2>&1 || gh auth login
[ -d .git ] || git init -b main
git add -A
git diff --cached --quiet || git commit -m "Foca News: site completo com atualização diária"
gh repo create "$NOME_REPO" --public --source=. --remote=origin --push \
  --description "Foca News — 339 veículos, notícias recentes todo dia, planos e Área VIP"
echo
echo "Pronto! Repositório criado e enviado."
echo "Agora ligue a Vercel: https://vercel.com/new  →  Import  →  escolha '$NOME_REPO'  →  Deploy."
