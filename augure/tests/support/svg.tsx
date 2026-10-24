// react-native-svg pour les tests de rendu : des balises SVG simples (react-dom les rend telles quelles).
import type { ReactNode } from 'react';

type Props = { children?: ReactNode } & Record<string, unknown>;
const balise = (nom: string) =>
  function Balise({ children }: Props) {
    return <g data-svg={nom}>{children}</g>;
  };

export default function Svg({ children }: Props) {
  return <svg aria-hidden>{children}</svg>;
}
export const Circle = balise('circle');
export const Path = balise('path');
export const Rect = balise('rect');
export const G = balise('g');
export const Text = balise('text');
