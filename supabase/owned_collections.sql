-- Colecciones propias: un documento JSONB por usuario.
-- Ejecutar una vez en el SQL editor de Supabase.
--
-- Son las colecciones que el usuario crea a mano, para cartas compradas fuera de Collectr.
-- NO tocan `card_copies` ni `collectr_collections`: esas las reconstruye cada importación
-- de Collectr, así que cualquier cosa escrita ahí se perdería. La app las fusiona con el
-- inventario en memoria, y por eso se comportan como una colección más.
--
-- Formato de `data` (el mismo que usa localStorage mientras esta tabla no existe):
--   [{ "id": "...", "name": "Compras 2026",
--      "cards": [{ "productId": 123, "printing": "Normal",
--                  "name": "Pikachu", "setName": "Base" }] }]
--
-- Una carta está o no está: no se guardan cantidades. Los documentos escritos antes de
-- quitarlas traen un `quantity` que se ignora al leer.

create table if not exists public.owned_collections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.owned_collections enable row level security;

-- El scoping por usuario lo hace RLS, igual que el resto de las tablas del proyecto.
-- El upsert del cliente necesita políticas separadas de insert y update.

drop policy if exists "Users read their own collections" on public.owned_collections;
create policy "Users read their own collections"
  on public.owned_collections for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert their own collections" on public.owned_collections;
create policy "Users insert their own collections"
  on public.owned_collections for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own collections" on public.owned_collections;
create policy "Users update their own collections"
  on public.owned_collections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
