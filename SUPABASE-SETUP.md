# Foca News × Supabase — ativação (5 minutos)

Projeto: `izqkbvhktbozmsiflzii` · Login real + banco de dados (planos/Stripe ficam para a próxima fase).

## 1) Criar as tabelas (1 vez)
1. Abra **supabase.com** → seu projeto → **SQL Editor** → **New query**
2. Cole todo o conteúdo de `supabase/migrations/20261015000000_focanews_integracao.sql`
3. Clique em **Run** — cria `perfis`, `curtidas`, `salvos`, `comentarios`, o RLS e o gatilho de perfil automático

> Se a integração Supabase ↔ GitHub estiver ativa neste repositório, o mesmo arquivo é aplicado no merge — rodar no SQL Editor também funciona e é idempotente.

## 2) Facilitar o cadastro (recomendado no começo)
**Authentication → Providers → Email** → desligue **Confirm email**.
Sem isso, cada leitor novo precisa confirmar o e-mail antes do primeiro login.

## 3) O que muda no site
- **Criar conta / Entrar / Sair**: Supabase Auth de verdade (senha com hash no Supabase, nunca no site)
- **Perfil**: nome, bio, papel e preferências gravados em `public.perfis`
- **Curtir, salvar e comentar**: gravados nas tabelas, por usuário — somem/aparecem em qualquer aparelho ao logar
- **Comentários** das notícias passam a vir do banco (reais, moderáveis pelo SQL)
- O restante (capa, notícias do `seed.js` diário, painel da redação) segue como está nesta fase

## 4) Virar administrador
Depois de criar sua conta no site:
```sql
update public.perfis set papel = 'admin' where email = 'seu@email.com';
```

## Segurança
- A chave `sb_publishable_...` no código é **pública por desenho**; o RLS limita cada um aos próprios dados
- A chave **secret/service_role nunca** entra no site, no GitHub público ou em conversa — só em servidor/Edge Functions
