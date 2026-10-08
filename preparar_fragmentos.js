// preparar_fragmentos.js
// Lee codigos-de-etica-salud-chile.md y lo divide en fragmentos pequeños
// (por institución y por sección) para que el chat pueda enviar a la IA
// solo los fragmentos relacionados con cada pregunta, y no todo el texto.
//
// Netlify lo ejecuta solo en cada publicación (ver netlify.toml).
// Si editas el archivo .md, basta con subirlo a GitHub.
// Para probarlo en tu computador:  node preparar_fragmentos.js

const fs = require("fs");
const path = require("path");

const ARCHIVO_MD = path.join(__dirname, "codigos-de-etica-salud-chile.md");
const ARCHIVO_SALIDA = path.join(__dirname, "netlify", "functions", "fragmentos.json");
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
