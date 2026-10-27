# LorEvolve.Web

React + TypeScript client built with Vite.

- `src/main.tsx` - React entry point.
- `src/App.tsx` - application shell (bootstrap placeholder).
- `vite.config.ts` - dev server on port 5173, proxies `/api` and `/health` to the API (`LOREVOLVE_API_URL`, default `http://localhost:5180`).

Tiptap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`) is installed as a dependency only;
the editor itself is not built yet.

```
npm install
npm run dev
```
