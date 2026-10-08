// preparar_fragmentos.js
// 1. Lee codigos-de-etica-salud-chile.md y lo divide en fragmentos pequeños
//    (por institución y por sección) para que el chat pueda enviar a la IA
//    solo los fragmentos relacionados con cada pregunta, y no todo el texto.
// 2. Arma knowledge_base.json, la lista de la sección Instituciones, a partir
//    de instituciones_config.json: marca "completo" cada institución cuyo
//    texto está en el .md y agrega el enlace al PDF si está en documentos/.
//
// Netlify lo ejecuta solo en cada publicación (ver netlify.toml).
// Si editas el .md o instituciones_config.json, basta con subirlos a GitHub.
// Para probarlo en tu computador:  node preparar_fragmentos.js

const fs = require("fs");
const path = require("path");

const ARCHIVO_MD = path.join(__dirname, "codigos-de-etica-salud-chile.md");
const ARCHIVO_SALIDA = path.join(__dirname, "netlify", "functions", "fragmentos.json");
const ARCHIVO_CONFIG = path.join(__dirname, "instituciones_config.json");
const ARCHIVO_INSTITUCIONES = path.join(__dirname, "knowledge_base.json");
const CARPETA_PDF = "documentos";
const LARGO_MAXIMO = 1500; // caracteres aproximados por fragmento

const lineas = fs.readFileSync(ARCHIVO_MD, "utf8").split(/\r?\n/);

const fragmentos = [];
let resumen = [];      // tabla "Resumen de documentos" (se envía siempre)
let enResumen = false;
let documento = null;  // institución actual (título "## N. ...")
let seccion = "";      // sección actual (título "### ...")
let enApendice = false; // apéndices y manuales anexos: material de apoyo, no el código mismo
let parrafos = [];
let parrafoActual = [];

function cerrarParrafo() {
  const texto = parrafoActual.join(" ").trim();
  if (texto && texto !== "---") parrafos.push(texto);
  parrafoActual = [];
}

function cerrarFragmentos() {
  cerrarParrafo();
  if (!documento) { parrafos = []; return; }
  let bloque = [];
  let largo = 0;
  const guardar = () => {
    if (!bloque.length) return;
    const fragmento = { doc: documento, seccion, texto: bloque.join("\n\n") };
    if (enApendice) fragmento.apendice = true;
    fragmentos.push(fragmento);
    bloque = [];
    largo = 0;
  };
  for (const p of parrafos) {
    if (largo + p.length > LARGO_MAXIMO && bloque.length) guardar();
    bloque.push(p);
    largo += p.length;
  }
  guardar();
  parrafos = [];
}

for (const linea of lineas) {
  if (/^## Resumen de documentos/.test(linea)) { enResumen = true; continue; }
  if (enResumen) {
    if (/^(---|# )/.test(linea)) enResumen = false;
    else { if (linea.trim()) resumen.push(linea); continue; }
  }

  const doc = linea.match(/^## \d+\.\s+(.*)$/);
  if (doc) {
    cerrarFragmentos();
    documento = doc[1].trim();
    seccion = "Inicio del documento";
    enApendice = false;
    continue;
  }
  if (/^# /.test(linea) || /^## /.test(linea)) {
    // Títulos generales (Índice, "Parte: ...") no pertenecen a una institución
    cerrarFragmentos();
    documento = null;
    continue;
  }
  const sec = linea.match(/^###\s+(.*)$/);
  if (sec) {
    cerrarFragmentos();
    seccion = sec[1].trim();
    if (/^AP[ÉE]NDICE/i.test(seccion)) enApendice = true;
    continue;
  }
  if (!linea.trim()) cerrarParrafo();
  else parrafoActual.push(linea.trim());
}
cerrarFragmentos();

const salida = { resumen: resumen.join("\n"), fragmentos };
fs.mkdirSync(path.dirname(ARCHIVO_SALIDA), { recursive: true });
fs.writeFileSync(ARCHIVO_SALIDA, JSON.stringify(salida));

const apendices = fragmentos.filter((f) => f.apendice).length;
const documentos = new Set(fragmentos.map((f) => f.doc));
console.log(`Listo: ${fragmentos.length} fragmentos de ${documentos.size} documentos (${apendices} de apéndices) -> ${path.relative(__dirname, ARCHIVO_SALIDA)}`);

// ---------- Lista de la sección Instituciones ----------
const config = JSON.parse(fs.readFileSync(ARCHIVO_CONFIG, "utf8"));
const instituciones = config.map(({ doc_md, source_file, ...datos }) => {
  const enMd = documentos.has(doc_md);
  const pdf = source_file && fs.existsSync(path.join(__dirname, CARPETA_PDF, source_file));
  if (!enMd) console.log(`  Aviso: "${datos.nombre}" no aparece en el .md (doc_md: "${doc_md}")`);
  if (!pdf) console.log(`  Aviso: no está el PDF de "${datos.nombre}" en ${CARPETA_PDF}/ (${source_file})`);
  return {
    ...datos,
    status: enMd ? "completo" : "pendiente",
    ...(pdf ? { pdf_file: `${CARPETA_PDF}/${source_file}` } : {}),
  };
});
fs.writeFileSync(ARCHIVO_INSTITUCIONES, JSON.stringify(instituciones, null, 2) + "\n");
const completas = instituciones.filter((i) => i.status === "completo").length;
const conPdf = instituciones.filter((i) => i.pdf_file).length;
console.log(`Listo: ${instituciones.length} instituciones (${completas} con texto completo, ${conPdf} con PDF) -> knowledge_base.json`);
