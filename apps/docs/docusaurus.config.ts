import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'OpenDoor',
  tagline: 'Multi-region LLM API Gateway on Azure',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://opendoor.ai',
  baseUrl: '/',

  organizationName: 'OchiengandCo',
  projectName: 'opendoor',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/OchiengandCo/opendoor/tree/main/apps/docs/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl:
            'https://github.com/OchiengandCo/opendoor/tree/main/apps/docs/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'OpenDoor',
      logo: {
        alt: 'OpenDoor Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'http://localhost:3000',
          label: 'Dashboard',
          position: 'right',
        },
        {
          href: 'https://github.com/OchiengandCo/opendoor',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started/installation',
            },
            {
              label: 'API Reference',
              to: '/docs/api-reference/chat-completions',
            },
            {
              label: 'Model Catalog',
              to: '/docs/model-catalog/overview',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/OchiengandCo/opendoor',
            },
            {
              label: 'Issues',
              href: 'https://github.com/OchiengandCo/opendoor/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'Dashboard',
              href: 'http://localhost:3000',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Ochieng and Co. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
