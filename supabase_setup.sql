-- Ejecuta esto en Supabase → SQL Editor → New query → Run

create table consultas (
  id bigint generated always as identity primary key,
  question text not null,
  answer_preview text,
  sources text,
  created_at timestamptz default now()
);

-- Activa seguridad a nivel de fila (obligatorio en Supabase)
alter table consultas enable row level security;

-- Permite que cualquier visitante (anónimo) INSERTE una consulta
create policy "Cualquiera puede insertar consultas"
on consultas for insert
to anon
with check (true);

-- Permite que cualquier visitante LEA las consultas (para el contador y las FAQ)
-- No se guarda nombre, correo ni IP, así que es seguro que sea público.
create policy "Cualquiera puede leer consultas"
on consultas for select
to anon
using (true);
