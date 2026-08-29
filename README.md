# Ética en Salud Chile — Sitio de consulta ciudadana

## Estructura del proyecto
```
index.html                        → el sitio web (frontend)
netlify.toml                      → configuración de despliegue en Netlify
netlify/functions/chat.js         → función segura que llama a la IA (guarda la API key)
netlify/functions/knowledge_base.json → copia de los documentos que usa el chat
knowledge_base.json               → copia usada por la sección "Instituciones"
instituciones_config.json         → lista editable de instituciones (para build_kb.py)
build_kb.py                       → script para cargar tus PDFs originales completos
supabase_setup.sql                → crea la tabla del registro histórico anónimo
```

## Antes de publicar
1. Ejecuta `build_kb.py` con tus PDF originales completos (ver instrucciones dentro del archivo).
2. Crea tu proyecto en Supabase y corre `supabase_setup.sql`.
3. Pega tu URL y "anon key" de Supabase en `index.html` (busca `SUPABASE_URL`).
4. Sube todo a GitHub y conéctalo a Netlify.
5. En Netlify, agrega la variable de entorno `ANTHROPIC_API_KEY`.

Sigue la guía paso a paso completa que te dio Claude en el chat para el detalle de cada punto.
