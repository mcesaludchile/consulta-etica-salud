# Ética en Salud Chile — Sitio de consulta ciudadana

## Estructura del proyecto
```
index.html                        → el sitio web (frontend)
netlify.toml                      → configuración de despliegue en Netlify
netlify/functions/chat.js         → función segura que llama a la IA (guarda la API key)
codigos-de-etica-salud-chile.md   → texto de los 15 códigos: la fuente que usa el chat
preparar_fragmentos.js            → arma fragmentos.json y knowledge_base.json (Netlify lo ejecuta solo)
netlify/functions/fragmentos.json → fragmentos del .md que usa el chat
instituciones_config.json         → lista editable de instituciones (nombre, descripción, sitio, PDF)
knowledge_base.json               → lista de la sección "Instituciones" (se genera sola, no editar)
documentos/                       → PDF que se pueden descargar desde el sitio
data/aprendizaje.json             → todo el contenido de la sección "Aprende" (cursos, videos, casos, glosario)
js/aprendizaje.js                 → código de la sección "Aprende" (solo muestra lo que dice el .json)
404.html                          → página "no encontrada" (también oculta los archivos internos)
supabase_aprendizaje.sql          → contador anónimo de personas que participan en cada curso
supabase_setup.sql                → crea la tabla del registro histórico anónimo (proyecto nuevo)
supabase_faq_privacidad.sql       → filtro de preguntas frecuentes (para una tabla ya existente)
```

## Antes de publicar
1. Revisa `instituciones_config.json` y que cada PDF esté en `documentos/`.
   No hay que ejecutar nada: Netlify prepara el chat y la lista de Instituciones al publicar.
2. Crea tu proyecto en Supabase y corre `supabase_setup.sql`.
3. Pega tu URL y "anon key" de Supabase en `index.html` (busca `SUPABASE_URL`).
4. Sube todo a GitHub y conéctalo a Netlify.
5. En Netlify, agrega las variables de entorno `ANTHROPIC_API_KEY` y `SUPABASE_SECRET_KEY`.

Sigue la guía paso a paso completa que te dio Claude en el chat para el detalle de cada punto.

## Sección "Aprende": cómo editar el contenido
Todo el texto está en `data/aprendizaje.json`. No hay que tocar código. Para editarlo en GitHub:
1. Abre el repositorio en github.com y entra a la carpeta `data`, luego al archivo `aprendizaje.json`.
2. Aprieta el ícono del lápiz (✏️, arriba a la derecha del archivo: "Edit this file").
3. Cambia solo el texto que está **entre comillas**. No borres comillas, comas ni llaves `{ }`.
4. Para marcar una palabra del glosario dentro de un curso o caso, escríbela así:
   `{{conflicto-de-interes|conflictos de interés}}` (primero el `id` del término, luego el texto que se ve).
5. Aprieta el botón verde **Commit changes...** y luego otra vez **Commit changes**.
   Netlify publica el cambio en uno o dos minutos.
   Si después de publicar la sección muestra "No pudimos cargar el contenido", probablemente falta
   o sobra una coma o comilla: revisa el último cambio (o pídele ayuda a Claude).

### Agregar un video real (reemplazar "Video próximamente")
1. Sube el video a YouTube (puede ser "No listado").
2. Copia su dirección, por ejemplo `https://www.youtube.com/watch?v=ABC123`.
3. En `aprendizaje.json`, busca el video (por ejemplo `"id": "video-transparencia"`) y cambia
   `"url_embed": null` por `"url_embed": "https://www.youtube.com/watch?v=ABC123"`.
   El sitio lo muestra con youtube-nocookie.com y solo lo carga cuando la persona aprieta ▶.
4. Opcional: `"miniatura": "data/miniatura-transparencia.jpg"` (una imagen propia subida a `data/`).
5. Subtítulos: en YouTube se agregan en YouTube Studio. Si usas un archivo de video propio
   (`.mp4`, subido a `data/`), puedes agregar `"subtitulos_vtt": "data/video-transparencia.vtt"`.
6. El `guion` de cada video está listo para grabar (con tiempos e imágenes sugeridas). La
   `transcripcion` se muestra bajo el video: si cambias lo que se dice, actualízala también.

### Agregar un término al glosario
Copia un término existente dentro de `"glosario": [ ... ]`, pégalo después de otro (separado por una coma) y cambia:
- `id`: en minúsculas, sin tildes ni espacios (usa guiones), por ejemplo `"dato-biometrico"`.
- `termino`, `definicion` (máximo 40 palabras), `ejemplo`.
- `temas`: uno o más de `integridad`, `transparencia`, `compliance`, `proteccion-datos`, `ia-salud`, `pacientes`.
- `fuente`: institución, documento y referencia del código; o `null` si es un principio general.
- `ver_tambien`: lista de `id` de otros términos.
El enlace directo queda en `https://eticaensalud.cl/#glosario/dato-biometrico`.

### Referencias legales
Las leyes mencionadas están en `"referencias_legales"` con `"verificar": true`. Revísalas cuando cambie una ley
(por ejemplo, la entrada en vigencia de la Ley 21.719 o el proyecto de ley de IA).

### Contador de participación (opcional)
Ejecuta una vez `supabase_aprendizaje.sql` en Supabase → SQL Editor. Solo guarda cuántas personas abrieron cada curso
(una vez por navegador), sin datos personales. Si no se ejecuta, la sección funciona igual, sin el contador.
