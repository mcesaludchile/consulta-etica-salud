"""
build_kb.py
-----------
Este script arma (o actualiza) knowledge_base.json, que usa la sección
Instituciones del sitio, y copia los PDF a la carpeta documentos/ para
que se puedan descargar.

OJO: el chat de IA ya NO usa este archivo. El chat usa
codigos-de-etica-salud-chile.md (ver preparar_fragmentos.js).

CÓMO USARLO (paso a paso, para principiantes):

1. Instala Python 3 si no lo tienes: https://www.python.org/downloads/
2. Abre una terminal en esta misma carpeta (la que tiene index.html).
3. Instala la librería necesaria, una sola vez:
       pip install pypdf
4. Crea una carpeta llamada "documentos_originales" (si no existe) y
   copia ahí TODOS tus PDF originales (los completos, no los resumidos).
5. Abre "instituciones_config.json" con cualquier editor de texto y,
   para cada institución, revisa que "source_file" tenga EXACTAMENTE
   el nombre del archivo PDF que copiaste en el paso 4.
   Puedes agregar más instituciones copiando el mismo formato de bloque.
6. Ejecuta:
       python3 build_kb.py
7. Esto genera/actualiza:
       knowledge_base.json               (para la sección Instituciones)
8. Sube estos archivos junto al resto del sitio a GitHub y Netlify
   volverá a desplegar automáticamente.
"""

import json
import os
import shutil
import sys

try:
    from pypdf import PdfReader
except ImportError:
    print("Falta la librería pypdf. Instálala con:  pip install pypdf")
    sys.exit(1)

DOCS_FOLDER = "documentos_originales"
CONFIG_FILE = "instituciones_config.json"
OUTPUT_ROOT = "knowledge_base.json"
PUBLIC_DOCS_FOLDER = "documentos"  # carpeta pública: aquí quedan los PDF descargables del sitio


def extract_text(path):
    reader = PdfReader(path)
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    text = "\n".join(parts)
    # limpia líneas vacías repetidas
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def main():
    if not os.path.isfile(CONFIG_FILE):
        print(f"No encontré {CONFIG_FILE}. Debe estar en esta misma carpeta.")
        sys.exit(1)

    with open(CONFIG_FILE, encoding="utf-8") as f:
        config = json.load(f)

    os.makedirs(PUBLIC_DOCS_FOLDER, exist_ok=True)

    kb = []
    for entry in config:
        pdf_path = os.path.join(DOCS_FOLDER, entry["source_file"])
        item = dict(entry)
        if os.path.isfile(pdf_path):
            try:
                text = extract_text(pdf_path)
                item["full_text"] = text
                item["status"] = "completo"
                print(f"✔ {entry['nombre']}: {len(text)} caracteres extraídos")
            except Exception as e:
                item["full_text"] = entry.get("desc", "")
                item["status"] = "error"
                print(f"✘ {entry['nombre']}: error al leer el PDF ({e})")

            # Copia el PDF a la carpeta pública para que quede descargable desde el sitio
            try:
                public_name = entry["source_file"]
                shutil.copyfile(pdf_path, os.path.join(PUBLIC_DOCS_FOLDER, public_name))
                item["pdf_file"] = f"{PUBLIC_DOCS_FOLDER}/{public_name}"
                print(f"   → copiado a {PUBLIC_DOCS_FOLDER}/{public_name} (descargable)")
            except Exception as e:
                print(f"   ⚠ no se pudo copiar el PDF a '{PUBLIC_DOCS_FOLDER}/': {e}")
        else:
            item["full_text"] = entry.get("desc", "")
            item["status"] = "pendiente"
            print(f"… {entry['nombre']}: no se encontró '{pdf_path}', se mantiene el resumen")
        kb.append(item)

    with open(OUTPUT_ROOT, "w", encoding="utf-8") as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)

    print(f"\nListo. Se actualizaron:\n - {OUTPUT_ROOT}\n - carpeta '{PUBLIC_DOCS_FOLDER}/' con los PDF descargables")
    print("No olvides subir también la carpeta 'documentos/' a GitHub para que los links de descarga funcionen.")


if __name__ == "__main__":
    main()
