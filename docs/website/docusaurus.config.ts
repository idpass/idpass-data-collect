import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'ID PASS  DataCollect',
  tagline: 'Offline-first data management for social protection and humanitarian assistance',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://idpass.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/idpass-data-collect/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'idpass', // Usually your GitHub org/user name.
  projectName: 'idpass-data-collect', // Usually your repo name.

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
          routeBasePath: '/',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/idpass/idpass-data-collect/tree/main/docs/website/',
        },
        blog: false, // Disable blog feature for documentation site
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    // Removed OpenAPI plugin to avoid theme dependency issues
    // API docs are now generated via custom script
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../../packages/datacollect/src/index.ts'],
        tsconfig: '../../packages/datacollect/tsconfig.json',
        out: 'docs/packages/datacollect/api',
        sidebar: {
          autoConfiguration: true,
          pretty: true,
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

  themes: ['@docusaurus/theme-mermaid'],
  
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
          to: 'packages',
          label: 'Packages',
          position: 'left',
        },
        {
          to: 'architecture',
          label: 'Architecture',
          position: 'left',
        },
        {
          href: 'https://github.com/idpass/idpass-data-collect',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: 'getting-started',
            },
            {
              label: 'Packages',
              to: 'packages',
            },
            {
              label: 'DataCollect API',
              href: 'api/datacollect/index.html',
            },
            {
              label: 'Backend API',
              to: 'packages/backend/api-reference-generated/idpass-datacollect-backend-api',
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
      copyright: `Copyright © ${new Date().getFullYear()} Association pour la cooperation numerique (ACN). Licensed under Apache 2.0.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    mermaid: {
      theme: {light: 'default', dark: 'dark'},
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
