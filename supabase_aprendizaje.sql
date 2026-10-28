-- supabase_aprendizaje.sql
-- Ejecutar UNA VEZ en Supabase → SQL Editor → "+" → New SQL snippet → pegar todo → Run.
-- Qué hace:
--   1. Crea la tabla "aprendizaje_participaciones": por cada curso de la
--      sección "Aprende", cuántas personas han participado. Solo guarda el
--      identificador del curso y un número: ningún dato de las personas.
--   2. Nadie con la clave pública puede leer ni escribir la tabla directamente.
--   3. Crea "registrar_participacion()", la única forma en que el sitio puede
--      sumar una participación, y "contar_participaciones()", que entrega los
--      totales para mostrarlos en las tarjetas de los cursos.

create table if not exists aprendizaje_participaciones (
  curso_id      text primary key,
  participantes integer not null default 0,
  actualizado   timestamptz not null default now()
);

alter table aprendizaje_participaciones enable row level security;
revoke all on aprendizaje_participaciones from anon, authenticated;

-- Solo acepta identificadores con forma de curso ("curso-...") y, como
-- resguardo contra abusos, no crea más de 200 cursos distintos.
create or replace function registrar_participacion(curso text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  if curso is null or curso !~ '^curso-[a-z0-9-]{1,60}$' then
    return null;
  end if;
  update aprendizaje_participaciones
     set participantes = participantes + 1, actualizado = now()
   where curso_id = curso
  returning participantes into total;
  if total is null and (select count(*) from aprendizaje_participaciones) < 200 then
    insert into aprendizaje_participaciones (curso_id, participantes)
    values (curso, 1)
    on conflict (curso_id) do update
      set participantes = aprendizaje_participaciones.participantes + 1, actualizado = now()
    returning participantes into total;
  end if;
  return total;
end;
$$;

create or replace function contar_participaciones()
returns table (curso_id text, participantes integer)
language sql
security definer
set search_path = public
as $$
  select curso_id, participantes from aprendizaje_participaciones
$$;

revoke all on function registrar_participacion(text) from public;
revoke all on function contar_participaciones() from public;
grant execute on function registrar_participacion(text) to anon, authenticated;
grant execute on function contar_participaciones() to anon, authenticated;
