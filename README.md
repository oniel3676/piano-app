# Clave Maestra

Aplicación web para practicar lectura de partitura (clave de Sol y clave de Fa), con grados progresivos, estudios de oído, escalas, violín, piano de cinco dedos, afinador, reto diario, rutina, repaso espaciado y más. Un solo archivo (`index.html`), sin dependencias: funciona sin conexión y se puede instalar en el teléfono.

## Uso

Abre `index.html` en un navegador, o publícalo en GitHub Pages (Settings → Pages → rama `main`, carpeta raíz).

## Pruebas automáticas

Requieren Node y Playwright:

```
npm install playwright
npx playwright install chromium
node tests/test.js
```

## Publicar en GitHub desde tu Mac

```
cd "ruta/a/Clave Maestra"
git init && git add . && git commit -m "Clave Maestra"
gh repo create clave-maestra --public --source=. --push
```

(o crea el repositorio vacío en github.com y ejecuta `git remote add origin <url>` y `git push -u origin main`).
