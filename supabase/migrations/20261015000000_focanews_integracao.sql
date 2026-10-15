-- ═══════════════════════════════════════════════════════════════════════════
-- FOCA NEWS × SUPABASE — integração: login real + banco de dados
-- Projeto: izqkbvhktbozmsiflzii
-- Como aplicar: Supabase → SQL Editor → New query → cole tudo → Run.
-- (Se a integração Supabase↔GitHub estiver ativa, este arquivo em
--  supabase/migrations/ também é aplicado automaticamente no merge.)
-- Pode rodar mais de uma vez: tudo é "if not exists" / políticas recriadas.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────── PERFIS (espelha auth.users, sem guardar senha) ─────────
create table if not exists public.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null default 'Leitor',
  email       text not null default '',
  papel       text not null default 'leitor' check (papel in ('leitor','admin')),
  bio         text not null default '',
  plano       text not null default 'gratis',
  preferencias jsonb not null default '{}'::jsonb,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ───────── CURTIDAS / SALVOS (artigo_id = id da notícia no seed diário) ─────────
create table if not exists public.curtidas (
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  artigo_id  text not null,
  criado_em  timestamptz not null default now(),
  primary key (usuario_id, artigo_id)
);

create table if not exists public.salvos (
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  artigo_id  text not null,
  criado_em  timestamptz not null default now(),
  primary key (usuario_id, artigo_id)
);

-- ───────── COMENTÁRIOS ─────────
create table if not exists public.comentarios (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  artigo_id  text not null,
  autor_nome text not null default 'Leitor',
  texto      text not null check (char_length(texto) between 2 and 800),
  status     text not null default 'publicado' check (status in ('publicado','pendente','oculto')),
  criado_em  timestamptz not null default now()
);
create index if not exists idx_comentarios_artigo on public.comentarios (artigo_id, criado_em desc);
create index if not exists idx_curtidas_artigo on public.curtidas (artigo_id);
create index if not exists idx_salvos_usuario on public.salvos (usuario_id);

-- ───────── RLS: a chave pública só faz o que as políticas deixam ─────────
alter table public.perfis enable row level security;
alter table public.curtidas enable row level security;
alter table public.salvos enable row level security;
alter table public.comentarios enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis
  for select to anon, authenticated using (true);            -- nome/papel são exibidos nos comentários

drop policy if exists perfis_inserir on public.perfis;
create policy perfis_inserir on public.perfis
  for insert to authenticated with check (id = auth.uid());

drop policy if exists perfis_atualizar on public.perfis;
create policy perfis_atualizar on public.perfis
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists curtidas_tudo on public.curtidas;
create policy curtidas_tudo on public.curtidas
  for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists curtidas_contar on public.curtidas;
create policy curtidas_contar on public.curtidas
  for select to anon, authenticated using (true);            -- contar curtidas é público

drop policy if exists salvos_tudo on public.salvos;
create policy salvos_tudo on public.salvos
  for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists comentarios_ler on public.comentarios;
create policy comentarios_ler on public.comentarios
  for select to anon, authenticated using (status = 'publicado' or usuario_id = auth.uid());

drop policy if exists comentarios_inserir on public.comentarios;
create policy comentarios_inserir on public.comentarios
  for insert to authenticated with check (usuario_id = auth.uid());

drop policy if exists comentarios_apagar on public.comentarios;
create policy comentarios_apagar on public.comentarios
  for delete to authenticated using (usuario_id = auth.uid());

-- ───────── GATILHO: toda conta nova ganha perfil de leitor ─────────
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, coalesce(new.email,''),
          coalesce(new.raw_user_meta_data->>'nome', split_part(coalesce(new.email,'leitor'),'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- ───────── Permissões base do PostgREST ─────────
grant usage on schema public to anon, authenticated;
grant select on public.perfis, public.comentarios, public.curtidas to anon;
grant select, insert, update on public.perfis to authenticated;
grant select, insert, delete on public.curtidas, public.salvos to authenticated;
grant select, insert, delete on public.comentarios to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- DEPOIS DE RODAR (opcional):
-- • Virar administrador:  update public.perfis set papel='admin' where email='voce@email.com';
-- • Planos (fase Stripe): update public.perfis set plano='vip' where email='...';
-- ═══════════════════════════════════════════════════════════════════════════
