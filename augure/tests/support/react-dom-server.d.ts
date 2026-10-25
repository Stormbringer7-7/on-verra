// Seule fonction de react-dom/server utilisée par les tests de rendu (pas de @types/react-dom installé).
declare module 'react-dom/server' {
  import type { ReactNode } from 'react';
  export function renderToStaticMarkup(element: ReactNode): string;
}
