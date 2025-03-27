import type { IconMap, SocialLink, Site } from '@/types'

export const SITE: Site = {
  title: "Bao's Shoebox",
  locale: 'en-US',
  description:
    'Discoveries and escapades of a curious mind on everything tech, data science, and AI.',
  href: 'https://brandonmai.vercel.app',
  featuredPostCount: 2,
  postsPerPage: 3,
}

export const NAV_LINKS: SocialLink[] = [
  {
    href: '/',
    label: 'home',
  },
  {
    href: '/blog',
    label: 'blog',
  },
  // {
  //   href: '/authors',
  //   label: 'authors',
  // },
  {
    href: '/about',
    label: 'about',
  },
  // {
  //   href: '/tags',
  //   label: 'tags',
  // },
]

export const SOCIAL_LINKS: SocialLink[] = [
  {
    href: 'https://github.com/brandon-mai',
    label: 'GitHub',
  },
  {
    href: 'https://x.com/brndnmai',
    label: 'Twitter',
  },
  {
    href: 'mvbao2022@pm.me',
    label: 'Email',
  },
  {
    href: '/rss.xml',
    label: 'RSS',
  },
]

export const ICON_MAP: IconMap = {
  Website: 'lucide:globe',
  GitHub: 'lucide:github',
  LinkedIn: 'lucide:linkedin',
  Twitter: 'lucide:twitter',
  Email: 'lucide:mail',
  RSS: 'lucide:rss',
}