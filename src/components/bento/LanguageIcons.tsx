import type { JSX } from 'react'
import { type IconType } from 'react-icons/lib'
import {
  SiAstro,
  SiC,
  SiCplusplus,
  // SiCsharp,
  SiCss3,
  SiHtml5,
  SiJavascript,
  SiJson,
  SiJupyter,
  SiLatex,
  SiMarkdown,
  SiMdx,
  SiPython,
  SiTypescript,
  SiYaml,
} from 'react-icons/si'

export const languageIcons: { [key: string]: IconType } = {
  astro: SiAstro,
  html: SiHtml5,
  css: SiCss3,
  javascript: SiJavascript,
  python: SiPython,
  c: SiC,
  'c++': SiCplusplus,
  typescript: SiTypescript,
  markdown: SiMarkdown,
  mdx: SiMdx,
  json: SiJson,
  yaml: SiYaml,
  tex: SiLatex,
  jupyter: SiJupyter
}

export const getLanguageIcon = (language: string): JSX.Element | null => {
  const Icon = languageIcons[language]
  return Icon ? <Icon /> : null
}