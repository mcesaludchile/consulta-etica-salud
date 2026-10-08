-- Ejecuta esto en Supabase → SQL Editor → New query → Run
-- (solo para un proyecto nuevo; si la tabla ya existe, usa supabase_faq_privacidad.sql)

create table consultas (
  id bigint generated always as identity primary key,
  question text not null,
  answer_preview text,
  sources text,
  publicable boolean not null default false,  -- se muestra en "Preguntas frecuentes"
  motivo_no_publica text,                     -- por qué no se muestra (si aplica)
  created_at timestamptz default now()
);

-- Activa seguridad a nivel de fila (obligatorio en Supabase).
-- Sin políticas: nadie con la clave pública puede leer ni escribir la tabla.
-- Solo la función del chat (Netlify, clave secreta SUPABASE_SECRET_KEY) guarda consultas.
alter table consultas enable row level security;

-- Lo único que el sitio puede leer: consultas pertinentes y sin datos personales.
create view faq_publica as
  select question, answer_preview, created_at
  from consultas
  where publicable;

revoke all on faq_publica from anon, authenticated;
grant select on faq_publica to anon, authenticated;

-- Contador de consultas registradas.
create function contar_consultas()
returns bigint
language sql
stable
security definer
set search_path = public
as $$ select count(*) from consultas $$;

revoke all on function contar_consultas() from public;
grant execute on function contar_consultas() to anon, authenticated;
