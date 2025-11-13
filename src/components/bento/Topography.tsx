'use client'

import { type FunctionComponent, useCallback, useEffect, useState } from 'react'
import { SimplexNoise } from '@paper-design/shaders-react'
import { convert } from 'colorizr'

interface Props {
  className?: string;
}

const getThemeColors = () => [
  'var(--card)',
  'var(--border)',
  'var(--background)',
];

const resolveCssColor = (str: string, el: HTMLElement = document.documentElement) => {
  if (!str.match(/var\(--/)) return str;
  const m = str.match(/var\((--[^)]+)\)/);
  if (!m) return str;
  const cssVar = m[1];
  const value = getComputedStyle(el).getPropertyValue(cssVar).trim();
  if (!value) return str;
  return convert(value, 'hex');
};

const Topography: FunctionComponent<Props> = ({ className = '' }) => {
  const [resolvedColors, setResolvedColors] = useState<string[]>([]);

  const updateColors = useCallback(() => {
    setResolvedColors(getThemeColors().map(c => resolveCssColor(c)));
  }, []);

  useEffect(() => {
    updateColors();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          updateColors();
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => {
      observer.disconnect();
    };
  }, [updateColors]);

  return (
    <SimplexNoise
      colors={resolvedColors}
      stepsPerColor={2}
      softness={0}
      speed={0.5}
      scale={0.6}
      className={`size-full ${className}`}
    />
  );
};

export {Topography}