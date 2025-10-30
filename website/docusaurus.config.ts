import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'ID PASS  DataCollect',
  tagline: 'Offline-first data management for social protection and humanitarian assistance',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
    experimental_faster: false // if true, causes "Rspack FS Error: No such file or directory"
  },

  // Set the production url of your site here
  url: 'https://data-collect.idpass.org',
  baseUrl: '/',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
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
          routeBasePath: '/'
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    require.resolve('docusaurus-lunr-search'),
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../packages/datacollect/src/index.ts'],
        tsconfig: '../packages/datacollect/tsconfig.json',
        out: './docs/packages/datacollect/api',
        sidebar: {
          autoConfiguration: true,
          pretty: true,
          typescript: true
        },
        excludePrivate: true,
        excludeProtected: true,
        excludeInternal: true,
        readme: 'none',
        plugin: ['typedoc-plugin-markdown'],
        theme: 'markdown',
        hideBreadcrumbs: false,
        hidePageTitle: false,
        disableSources: false,
        categorizeByGroup: true,
        defaultCategory: 'Other',
        categoryOrder: [
          'Core',
          'Storage', 
          'Sync',
          'Services',
          'Utilities',
          '*'
        ],
        exclude: [
          '**/node_modules/**',
          '**/__tests__/**',
          '**/*.test.ts',
          '**/*.spec.ts'
        ],
        skipErrorChecking: true,
        sort: ['source-order'],
        gitRevision: 'main',
        sourceLinkTemplate: 'https://github.com/idpass/idpass-data-collect/blob/{gitRevision}/{path}#L{line}',
      },
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
  ],
  
  markdown: {
    mermaid: true,
  },

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'ID PASS DataCollect',
      logo: {
        alt: 'ID PASS DataCollect Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: 'developers',
          label: 'Developers',
          position: 'left',
        },
        {
          to: 'users',
          label: 'Admin & Mobile',
          position: 'left',
        },
        {
          href: 'https://github.com/idpass/idpass-data-collect',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
        {
          type: "localeDropdown",
          position: "right",
        },
        // {
        //   type: "docsVersionDropdown",
        //   position: "right",
        // },
      ],
    },
    footer: {
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Developer Guide',
              to: 'developers',
            },
            {
              label: 'Admin & Mobile Guide',
              to: 'users',
            },
            {
              label: 'Package Documentation',
              to: 'packages',
            },
            {
              label: 'DataCollect API',
              to: 'packages/datacollect/api/',
            },
            {
              label: 'Backend API',
              to: 'packages/backend/api-reference-generated/idpass-data-collect-backend-api',
            },
            {
              label: 'Architecture',
              to: 'architecture',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/idpass/idpass-data-collect/discussions',
            },
            {
              label: 'Issues',
              href: 'https://github.com/idpass/idpass-data-collect/issues',
            },
            {
              label: 'GitHub Repository',
              href: 'https://github.com/idpass/idpass-data-collect',
            },
          ],
        },
        {
          title: 'Development',
          items: [
            {
              label: 'Contributing',
              href: 'https://github.com/idpass/idpass-data-collect/blob/main/CONTRIBUTING.md',
            },
            {
              label: 'Report Issues',
              href: 'https://github.com/idpass/idpass-data-collect/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/idpass/idpass-data-collect',
            },
            {
              label: 'ACN',
              href: 'https://acn.org',
            },
            {
              label: 'License',
              href: 'https://github.com/idpass/idpass-data-collect/blob/main/LICENSE',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Association pour la Coopération Numérique (ACN). Licensed under Apache 2.0.`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['typescript', 'javascript', 'bash', 'json', 'yaml', 'markdown'],
    },
    mermaid: {
      theme: {
        light: 'default', 
        dark: 'dark'
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
