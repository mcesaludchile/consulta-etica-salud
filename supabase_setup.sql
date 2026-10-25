-- Ejecuta esto en Supabase → SQL Editor → New query → Run
-- (solo para un proyecto nuevo; si la tabla ya existe, usa supabase_faq_privacidad.sql
--  y después supabase_faq_apoyos.sql y supabase_faq_desacuerdos.sql)

create table consultas (
  id bigint generated always as identity primary key,
  question text not null,
  answer_preview text,                        -- resumen (primeros 180 caracteres)
  respuesta text,                             -- respuesta completa
  sources text,
  publicable boolean not null default false,  -- se muestra en "Preguntas frecuentes"
  motivo_no_publica text,                     -- por qué no se muestra (si aplica)
  apoyos integer not null default 0,          -- cuántas visitas marcaron "De acuerdo"
  desacuerdos integer not null default 0,     -- cuántas visitas marcaron "En desacuerdo"
  created_at timestamptz default now()
);

-- Activa seguridad a nivel de fila (obligatorio en Supabase).
-- Sin políticas: nadie con la clave pública puede leer ni escribir la tabla.
-- Solo la función del chat (Netlify, clave secreta SUPABASE_SECRET_KEY) guarda consultas.
alter table consultas enable row level security;

-- Lo único que el sitio puede leer: consultas pertinentes y sin datos personales.
create view faq_publica as
  select question, answer_preview, created_at,
         id, coalesce(respuesta, answer_preview) as respuesta, apoyos, sources,
         desacuerdos, apoyos - desacuerdos as puntaje
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

-- Botón "De acuerdo" de las preguntas frecuentes: suma (o quita) un apoyo.
create function apoyar_consulta(consulta_id bigint, sumar boolean default true)
returns integer
language sql
security definer
set search_path = public
as $$
  update consultas
  set apoyos = greatest(apoyos + case when sumar then 1 else -1 end, 0)
  where id = consulta_id and publicable
  returning apoyos
$$;

revoke all on function apoyar_consulta(bigint, boolean) from public;
grant execute on function apoyar_consulta(bigint, boolean) to anon, authenticated;

-- Botón "En desacuerdo" de las preguntas frecuentes: suma (o quita) un desacuerdo.
create function desacuerdo_consulta(consulta_id bigint, sumar boolean default true)
returns integer
language sql
security definer
set search_path = public
as $$
  update consultas
  set desacuerdos = greatest(desacuerdos + case when sumar then 1 else -1 end, 0)
  where id = consulta_id and publicable
  returning desacuerdos
$$;

revoke all on function desacuerdo_consulta(bigint, boolean) from public;
grant execute on function desacuerdo_consulta(bigint, boolean) to anon, authenticated;
