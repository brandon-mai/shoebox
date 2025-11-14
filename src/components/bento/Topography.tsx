'use client'

import { type FunctionComponent, useCallback, useEffect, useState } from 'react'
import { SimplexNoise, Dithering } from '@paper-design/shaders-react'
import { convert } from 'colorizr'

interface Props {
  offsetX?: number;
  offsetY?: number;
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

const TopographySimplex: FunctionComponent<Props> = ({ className = '', offsetX = 0, offsetY = 0 }) => {
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
      offsetX={offsetX}
      offsetY={offsetY}
      className={`size-full ${className}`}
    />
  );
};

const TopographyDithering: FunctionComponent<Props> = ({ className = '', offsetX = 0, offsetY = 0 }) => {
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
    <Dithering
      colorBack={resolvedColors[0]}
      colorFront={resolvedColors[1]}
      shape="simplex"
      type="2x2"
      size={2.5}
      speed={1}
      offsetX={offsetX}
      offsetY={offsetY}
      className={`size-full ${className}`}
    />
  );
};

export {TopographySimplex, TopographyDithering}