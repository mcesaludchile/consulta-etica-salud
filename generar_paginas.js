// generar_paginas.js
// Crea una página propia para cada sección, curso, caso, término del glosario e
// institución (por ejemplo /aprende/cursos/ficha-clinica-quien-puede-verla/), y el
// mapa del sitio para Google (sitemap.xml).
//
// Cada página es una copia de index.html con:
//   - su propio título, descripción e imagen para Google, WhatsApp y redes, y
//   - el texto ya escrito (#prerender), para quienes leen la página sin
//     JavaScript (como los buscadores). Las personas ven el sitio de siempre,
//     abierto en el curso, caso o término que corresponde.
//
// Netlify lo ejecuta solo en cada publicación (ver netlify.toml), después de
// preparar_fragmentos.js. Las páginas generadas no se suben a GitHub (.gitignore).
// Para probarlo en tu computador:  node preparar_fragmentos.js && node generar_paginas.js

const fs = require("fs");
const path = require("path");

const SITIO = "https://eticaensalud.cl";
const NOMBRE = "Ética en Salud Chile";
const IMAGEN = `${SITIO}/og-image.png`;
const RAIZ = __dirname;
// Carpetas que crea este script (se borran y se vuelven a crear en cada publicación)
const CARPETAS = ["consultar", "aprende", "glosario", "instituciones", "contexto", "contacto",
  "marco-de-consenso", "privacidad", "terminos", "leyes", "mapa-del-sitio"];

const plantilla = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "aprendizaje.json"), "utf8"));
const instituciones = JSON.parse(fs.readFileSync(path.join(RAIZ, "knowledge_base.json"), "utf8"));

// Misma regla que slugTexto() en index.html: "Ficha clínica: ¿quién?" → "ficha-clinica-quien"
const slug = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const terminos = new Map(datos.glosario.map((g) => [g.id, g]));
const sinMarcas = (t) => String(t ?? "").replace(/\{\{[a-z0-9-]+\|([^{}]+?)\}\}/g, "$1");
// {{id|texto}} → enlace a la página del término
const conEnlaces = (t) => esc(t).replace(/\{\{([a-z0-9-]+)\|([^{}]+?)\}\}/g,
  (m, id, txt) => terminos.has(id) ? `<a href="/glosario/${id}/">${txt}</a>` : txt);
const parrafos = (t) => String(t ?? "").split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${conEnlaces(p.trim())}</p>`).join("\n");
function resumen(t, max = 155) {
  const s = sinMarcas(t).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
const fuenteTexto = (f) => f ? [f.institucion, f.documento, f.referencia].filter(Boolean).join(" · ") : "Principio general (no atribuido a un código en particular)";
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
const ORGANIZACION = { "@type": "Organization", name: "Eticaensalud", url: SITIO };

// Comprueba que no haya dos páginas con la misma dirección
function unico(lista, clave, que) {
  const vistos = new Set();
  for (const x of lista) {
    const k = clave(x);
    if (!k || vistos.has(k)) throw new Error(`Dirección repetida o vacía en ${que}: "${k}"`);
    vistos.add(k);
  }
}
unico(datos.cursos, (c) => slug(c.titulo), "cursos");
unico(datos.casos, (c) => slug(c.titulo), "casos");
unico(datos.glosario, (g) => g.id, "glosario");
unico(instituciones, (i) => i.slug, "instituciones");

const tema = (id) => datos.temas.find((t) => t.id === id) || { nombre: id };
const paginas = [];
const agregar = (p) => paginas.push(p);

// ---------- Secciones ----------
const lista = (items) => `<ul>${items.map(([href, txt]) => `<li><a href="${href}">${esc(txt)}</a></li>`).join("")}</ul>`;
agregar({ ruta: "/consultar/", titulo: `Consultar los códigos de ética con IA · ${NOMBRE}`,
  descripcion: "Pregunta en lenguaje simple y recibe una respuesta basada solo en los códigos de ética de la salud en Chile, con la fuente citada.",
  html: `<h1>Consultar</h1><p>Escribe tu duda como se la contarías a alguien y el asistente responde citando los códigos de ética de instituciones de salud de Chile. No escribas tu nombre, RUT ni datos que te identifiquen.</p>` });
agregar({ ruta: "/aprende/", titulo: `Aprende ética en salud: cursos breves · ${NOMBRE}`,
  descripcion: "Cursos de 5 minutos, videos, casos prácticos y un glosario en lenguaje simple sobre integridad, transparencia, datos de salud, IA y derechos de los pacientes.",
  html: `<h1>Aprende ética en salud en pocos minutos</h1><h2>Cursos</h2>${lista(datos.cursos.map((c) => [`/aprende/cursos/${slug(c.titulo)}/`, c.titulo]))}
    <p><a href="/aprende/videos/">Videos</a> · <a href="/aprende/casos/">Casos prácticos</a> · <a href="/glosario/">Glosario</a></p>` });
agregar({ ruta: "/aprende/videos/", titulo: `Videos de 2 minutos sobre ética en salud · ${NOMBRE}`,
  descripcion: "Videos breves sobre conflictos de interés, transparencia, compliance, ficha clínica, inteligencia artificial y derechos de los pacientes.",
  html: `<h1>Videos</h1>${datos.videos.map((v) => `<h2>${esc(v.titulo)}</h2>${v.url_embed ? `<p><a href="${esc(v.url_embed)}">Ver el video</a></p>` : ""}${parrafos(v.transcripcion)}`).join("\n")}` });
agregar({ ruta: "/aprende/casos/", titulo: `Casos prácticos de ética en salud · ${NOMBRE}`,
  descripcion: "Situaciones ficticias en las que eliges qué hacer y ves sus consecuencias, con lo que dicen los códigos de ética de la salud en Chile.",
  html: `<h1>Casos prácticos</h1>${lista(datos.casos.map((c) => [`/aprende/casos/${slug(c.titulo)}/`, c.titulo]))}` });
agregar({ ruta: "/glosario/", titulo: `Glosario de ética en salud · ${NOMBRE}`,
  descripcion: `${datos.glosario.length} términos de ética en salud explicados en lenguaje simple: conflicto de interés, consentimiento informado, ficha clínica, sesgo y más.`,
  html: `<h1>Glosario ético</h1>${lista([...datos.glosario].sort((a, b) => a.termino.localeCompare(b.termino, "es")).map((g) => [`/glosario/${g.id}/`, g.termino]))}` });
agregar({ ruta: "/instituciones/", titulo: `Instituciones con código de ética · ${NOMBRE}`,
  descripcion: "Códigos de ética de colegios profesionales, el ISP, la industria y organizaciones de pacientes en Chile, con enlace oficial y PDF para descargar.",
  html: `<h1>Instituciones con código de ética disponible</h1>${lista(instituciones.map((i) => [`/instituciones/${i.slug}/`, i.nombre]))}` });
agregar({ ruta: "/contexto/", titulo: `Por qué conocer los códigos de ética · ${NOMBRE}`,
  descripcion: "Por qué es importante conocer los códigos de ética de la salud, las leyes de referencia y las preguntas frecuentes de la ciudadanía.",
  html: `<h1>Contexto e importancia</h1><p>Los códigos de ética regulan cómo deben comportarse profesionales e instituciones de salud frente a las personas que atienden.</p><p><a href="/leyes/">Leyes de referencia</a></p>` });
agregar({ ruta: "/leyes/", titulo: `Leyes de referencia · ${NOMBRE}`,
  descripcion: "Leyes chilenas que la sección Aprende usa como contexto: derechos de los pacientes, datos personales, transparencia, lobby y más.",
  html: `<h1>Leyes de referencia</h1>${datos.referencias_legales.map((r) => `<h2>${esc(r.nombre)}</h2><p>${esc(r.resumen || r.descripcion)}</p>${r.url ? `<p><a href="${esc(r.url)}">Texto oficial</a></p>` : ""}`).join("\n")}` });
agregar({ ruta: "/contacto/", titulo: `Contacto · ${NOMBRE}`,
  descripcion: "Escríbenos para sugerir un código de ética, reportar un error o hacer un comentario sobre Ética en Salud Chile.",
  html: `<h1>Contacto</h1><p>Usa el formulario para sugerir un código de ética, reportar un error o hacer un comentario.</p>` });
agregar({ ruta: "/marco-de-consenso/", titulo: `Marco de Consenso Ético para el sector salud · ${NOMBRE}`,
  descripcion: "Origen del acuerdo de 2019, objetivos, integrantes, el rol de SUBREI y los Principios APEC de Ciudad de México y Kuala Lumpur.",
  html: `<h1>Marco de Consenso Ético</h1><p>Acuerdo de colaboración ética entre actores del ecosistema de salud en Chile, firmado en 2019 en el marco de APEC.</p>` });
agregar({ ruta: "/privacidad/", titulo: `Privacidad y términos de uso · ${NOMBRE}`,
  descripcion: "Qué datos guardamos y cuáles no, quién más los recibe, por cuánto tiempo, tus derechos y los términos de uso del asistente.",
  html: `<h1>Privacidad y términos de uso</h1><p>No pedimos tu nombre ni tu RUT. Tú decides si tu pregunta se publica.</p>` });
agregar({ ruta: "/terminos/", titulo: `Términos de uso del asistente · ${NOMBRE}`,
  descripcion: "El asistente orienta a partir de los códigos de ética, puede equivocarse y no reemplaza asesoría legal ni médica.",
  html: `<h1>Términos de uso del asistente</h1><p>Herramienta gratuita y orientativa basada en los códigos de ética publicados en el sitio.</p>`,
  sinMapa: true });

// ---------- Cursos ----------
for (const c of datos.cursos) {
  const ruta = `/aprende/cursos/${slug(c.titulo)}/`;
  const html = `<h1>${esc(c.titulo)}</h1>
    <p>${esc(tema(c.tema).nombre)} · ${c.duracion_min} minutos</p>
    <p>${esc(c.objetivo)}</p>
    ${c.pantallas.filter((p) => p.tipo !== "video").map((p) => `${p.titulo ? `<h2>${esc(p.titulo)}</h2>` : ""}${parrafos(p.texto)}${p.en_simple ? `<p><strong>En simple:</strong> ${conEnlaces(p.en_simple)}</p>` : ""}`).join("\n")}
    <h2>Pon a prueba lo aprendido</h2>
    ${c.situaciones.map((s) => `<p><strong>Situación ficticia:</strong> ${conEnlaces(s.enunciado)}</p>`).join("\n")}`;
  agregar({ ruta, titulo: `${c.titulo} · Curso breve · ${NOMBRE}`, descripcion: resumen(c.objetivo), tipo: "article", html,
    ld: { "@context": "https://schema.org", "@type": "Course", name: c.titulo, description: resumen(c.objetivo, 300),
      url: SITIO + ruta, inLanguage: "es-CL", isAccessibleForFree: true, timeRequired: `PT${c.duracion_min}M`, provider: ORGANIZACION } });
}

// ---------- Casos ----------
for (const c of datos.casos) {
  const ruta = `/aprende/casos/${slug(c.titulo)}/`;
  const html = `<h1>${esc(c.titulo)}</h1><p>Caso práctico · ${esc(tema(c.tema).nombre)} · situación ficticia</p>
    ${parrafos(c.escenario)}
    <h2>${esc(c.pasos[0].pregunta)}</h2>
    <ul>${c.pasos[0].opciones.map((o) => `<li>${esc(o.texto)}</li>`).join("")}</ul>
    <h2>¿Qué dicen los códigos?</h2>
    ${c.que_dicen_los_codigos.map((r) => `<p><strong>${esc(r.institucion)}</strong> (${esc(r.documento)}${r.referencia ? ", " + esc(r.referencia) : ""}): ${conEnlaces(r.resumen)}</p>`).join("\n")}`;
  agregar({ ruta, titulo: `${c.titulo} · Caso práctico · ${NOMBRE}`, descripcion: resumen(c.escenario), tipo: "article", html,
    ld: { "@context": "https://schema.org", "@type": "LearningResource", name: c.titulo, description: resumen(c.escenario, 300),
      url: SITIO + ruta, inLanguage: "es-CL", learningResourceType: "Caso práctico", isAccessibleForFree: true, provider: ORGANIZACION } });
}

// ---------- Glosario ----------
for (const g of datos.glosario) {
  const ruta = `/glosario/${g.id}/`;
  const ver = (g.ver_tambien || []).map((id) => terminos.get(id)).filter(Boolean);
  const html = `<h1>${esc(g.termino)}</h1>
    <p>${esc(g.definicion)}</p>
    <p><strong>Ejemplo:</strong> ${esc(g.ejemplo)}</p>
    <p>Fuente: ${esc(fuenteTexto(g.fuente))}</p>
    ${ver.length ? `<p>Ver también: ${ver.map((t) => `<a href="/glosario/${t.id}/">${esc(t.termino)}</a>`).join(", ")}</p>` : ""}`;
  agregar({ ruta, titulo: `${g.termino}: qué es, en simple · Glosario · ${NOMBRE}`, descripcion: resumen(g.definicion), tipo: "article", html,
    ld: { "@context": "https://schema.org", "@type": "DefinedTerm", name: g.termino, description: g.definicion, url: SITIO + ruta,
      inDefinedTermSet: { "@type": "DefinedTermSet", name: "Glosario de ética en salud", url: `${SITIO}/glosario/` } } });
}

// ---------- Instituciones ----------
for (const i of instituciones) {
  const ruta = `/instituciones/${i.slug}/`;
  const html = `<h1>${esc(i.nombre)}</h1><p>${esc(i.tag)} · ${esc(i.year)}</p><p>${esc(i.desc)}</p>
    ${i.website ? `<p><a href="${esc(i.website)}">Sitio oficial</a></p>` : ""}
    ${i.pdf_file ? `<p><a href="/${encodeURI(i.pdf_file)}">Descargar el código de ética (PDF)</a></p>` : ""}`;
  agregar({ ruta, titulo: `Código de ética de ${i.nombre} · ${NOMBRE}`, descripcion: resumen(i.desc), tipo: "article", html,
    ld: { "@context": "https://schema.org", "@type": "WebPage", name: `Código de ética de ${i.nombre}`, url: SITIO + ruta,
      about: { "@type": "Organization", name: i.nombre, ...(i.website ? { url: i.website } : {}) } } });
}

// ---------- Mapa del sitio (página para personas) ----------
const secciones = [["/", "Inicio"], ["/consultar/", "Consultar"], ["/aprende/", "Aprende"], ["/aprende/videos/", "Videos"],
  ["/aprende/casos/", "Casos prácticos"], ["/glosario/", "Glosario"], ["/instituciones/", "Instituciones"], ["/contexto/", "Contexto"],
  ["/leyes/", "Leyes de referencia"], ["/marco-de-consenso/", "Marco de Consenso Ético"], ["/contacto/", "Contacto"], ["/privacidad/", "Privacidad y términos de uso"]];
agregar({ ruta: "/mapa-del-sitio/", titulo: `Mapa del sitio · ${NOMBRE}`,
  descripcion: "Todas las secciones, cursos, casos, términos del glosario e instituciones de Ética en Salud Chile.",
  html: `<h1>Mapa del sitio</h1><h2>Secciones</h2>${lista(secciones)}
    <h2>Cursos</h2>${lista(datos.cursos.map((c) => [`/aprende/cursos/${slug(c.titulo)}/`, c.titulo]))}
    <h2>Casos prácticos</h2>${lista(datos.casos.map((c) => [`/aprende/casos/${slug(c.titulo)}/`, c.titulo]))}
    <h2>Glosario</h2>${lista(datos.glosario.map((g) => [`/glosario/${g.id}/`, g.termino]))}
    <h2>Instituciones</h2>${lista(instituciones.map((i) => [`/instituciones/${i.slug}/`, i.nombre]))}` });

// ---------- Escribir las páginas ----------
const INICIO_SEO = "<!-- SEO -->", FIN_SEO = "<!-- /SEO -->", MARCA_PRERENDER = "<!-- PRERENDER -->";
if (!plantilla.includes(INICIO_SEO) || !plantilla.includes(FIN_SEO) || !plantilla.includes(MARCA_PRERENDER)) {
  throw new Error("index.html no tiene las marcas <!-- SEO -->, <!-- /SEO --> o <!-- PRERENDER -->");
}
function cabecera(p) {
  const url = SITIO + p.ruta;
  return `${INICIO_SEO}
<title>${esc(p.titulo)}</title>
<meta name="description" content="${esc(p.descripcion)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${p.tipo || "website"}">
<meta property="og:site_name" content="${NOMBRE}">
<meta property="og:locale" content="es_CL">
<meta property="og:title" content="${esc(p.titulo)}">
<meta property="og:description" content="${esc(p.descripcion)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${IMAGEN}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${p.ld ? jsonLd(p.ld) : ""}
${FIN_SEO}`;
}
for (const carpeta of CARPETAS) fs.rmSync(path.join(RAIZ, carpeta), { recursive: true, force: true });
for (const p of paginas) {
  const html = plantilla
    .replace(new RegExp(`${INICIO_SEO}[\\s\\S]*?${FIN_SEO}`), () => cabecera(p))
    .replace(MARCA_PRERENDER, () => `<div id="prerender">${p.html}\n<p><a href="/mapa-del-sitio/">Mapa del sitio</a></p></div>`);
  const destino = path.join(RAIZ, ...p.ruta.split("/").filter(Boolean), "index.html");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html);
}

// ---------- sitemap.xml (para Google) ----------
const urls = ["/", ...paginas.filter((p) => !p.sinMapa).map((p) => p.ruta)];
fs.writeFileSync(path.join(RAIZ, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${SITIO}${u}</loc></url>`).join("\n") + `\n</urlset>\n`);

console.log(`Listo: ${paginas.length} páginas (${datos.cursos.length} cursos, ${datos.casos.length} casos, ${datos.glosario.length} términos, ${instituciones.length} instituciones) y sitemap.xml con ${urls.length} direcciones`);
