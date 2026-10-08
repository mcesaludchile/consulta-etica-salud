# Ética en Salud Chile — Contexto del proyecto

## Qué es
Sitio web ciudadano, en español, que reúne los códigos de ética de instituciones del ecosistema de salud en Chile y permite consultarlos con IA. El público son personas comunes: todo el texto del sitio debe estar en lenguaje simple y cotidiano, sin jerga legal ni técnica.

## Secciones del sitio
Aplicación de una sola página (single-page), pensada primero para celulares, con cinco secciones:
1. **Inicio**
2. **Consultar** — chat con IA que responde dudas basándose SOLO en los documentos validados.
3. **Instituciones** — qué instituciones tienen código de ética disponible, con enlace oficial y botón de descarga del PDF.
4. **Contexto** — por qué es importante conocer los códigos de ética y contar con esta herramienta.
5. **Contacto** — formulario que llega a vastorga05@gmail.com.

## Arquitectura
- **Frontend:** HTML + JavaScript en un solo archivo, mobile-first.
- **Backend:** función serverless de Netlify (`chat.js`) que llama a la API de Anthropic. La API key está en una variable de entorno secreta de Netlify. Nunca escribir claves en el código. Modelo: `claude-sonnet-5-5` con esfuerzo `low` (constantes `MODELO` y `ESFUERZO` al inicio de `chat.js`). Si una consulta falla, el chat muestra un "Detalle técnico" y el error queda en Netlify → Cloud compute → Functions → chat.
- **Base de datos:** Supabase, tabla `consultas` con políticas RLS, para registrar consultas anónimas y contadores. En el código el cliente se llama `supabaseClient` (no `supabase`, porque choca con la librería del CDN).
- **Base de conocimiento del chat:** `codigos-de-etica-salud-chile.md`, con el texto completo y ordenado de los 14 documentos. Es la única fuente del chat. `preparar_fragmentos.js` lo divide en fragmentos (por institución y sección) y genera `netlify/functions/fragmentos.json`; Netlify lo ejecuta solo en cada publicación. En cada pregunta, `chat.js` busca por palabras clave y envía a la IA solo los fragmentos más relacionados (máx. ~12.000 caracteres) y los últimos 7 mensajes, no los documentos completos. Para corregir o agregar texto, editar el `.md` (respetando los títulos `## N. Institución` y `### Sección`).
- **Sección Instituciones:** lee `knowledge_base.json` (raíz), que también genera `preparar_fragmentos.js` a partir de `instituciones_config.json`: estado "completo" si el texto de la institución está en el `.md` (campo `doc_md` = título `## N. ...` del `.md`, sin el número) y botón de descarga si el PDF (`source_file`) está en `documentos/`. No editar `knowledge_base.json` a mano: editar `instituciones_config.json`. El chat no usa los PDF.
- **Configuración:** `netlify.toml`.
- **Hosting:** Netlify, conectado a GitHub (cada cambio subido a GitHub se publica solo).

## Instituciones incluidas
Colegio Médico, Colegio de Enfermeras, Colegio de Químicos Farmacéuticos y Bioquímicos, Colegio de Kinesiólogos, ASOCIMED, ISP, Cámara Nacional de Laboratorios (CANALAB), CIF, ADIMECH, FENPOF, ACHAGO, Estándares éticos recomendados (Marco de Consenso APEC Chile), y los Principios APEC de Kuala Lumpur y de Ciudad de México.

## Problemas ya resueltos (no repetir)
- `window.storage` no funciona fuera de claude.ai: no usarlo.
- Choque de nombre de variable con Supabase → usar `supabaseClient`.
- Netlify a veces envía el cuerpo de la petición en base64: decodificar antes de leer el JSON (causaba error 400).
- Error 500 por falta de saldo en la cuenta de la API de Anthropic.

## Pendientes
- Revisar los sitios oficiales (`website` en `instituciones_config.json`) de FENPOF, CANALAB, CIF, ACHAGO y APEC, y completar el de Estándares éticos recomendados (sigue en `null`).

## Cómo trabajar conmigo (Vicente)
- No tengo experiencia programando. Explícame todo paso a paso, en español, con listas numeradas y diciendo exactamente qué botón apretar y dónde está en la pantalla.
- Antes de cambiar archivos, cuéntame en palabras simples qué vas a hacer y por qué.
- Uso Windows. Para Python uso `py -m pip`.
- Después de cada cambio, dime cómo probarlo y cómo subirlo a GitHub.
