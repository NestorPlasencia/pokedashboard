-- Colecciones / wishlist: un documento JSONB por usuario.
-- Ejecutar una vez en el SQL editor de Supabase.
-- El árbol completo (colecciones > subcolecciones > cartas) se guarda en `data`,
-- con el mismo formato que ya usaba localStorage.

create table if not exists public.wishlist_collections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wishlist_collections enable row level security;

-- El scoping por usuario lo hace RLS, igual que el resto de las tablas del proyecto.
-- El upsert del cliente necesita políticas separadas de insert y update.

drop policy if exists "Users read their own wishlist" on public.wishlist_collections;
create policy "Users read their own wishlist"
  on public.wishlist_collections for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert their own wishlist" on public.wishlist_collections;
create policy "Users insert their own wishlist"
  on public.wishlist_collections for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own wishlist" on public.wishlist_collections;
create policy "Users update their own wishlist"
  on public.wishlist_collections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
