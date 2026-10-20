// Declaraciones globales para `npm run typecheck` (TypeScript con checkJs). No las usa el build.

interface Window {
  // Lo que se está arrastrando desde el panel de jerarquía hacia el lienzo (Dashboard.js,
  // UserDefinitionsTree.js): el objeto del nodo o la definición, o null.
  _dragComponent?: any;
}
