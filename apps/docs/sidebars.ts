import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/configuration',
        'getting-started/local-development',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api-reference/chat-completions',
        'api-reference/models',
        'api-reference/embeddings',
        'api-reference/streaming',
      ],
    },
    {
      type: 'category',
      label: 'Model Catalog',
      items: [
        'model-catalog/overview',
        'model-catalog/live-models',
        'model-catalog/available-on-request',
      ],
    },
    {
      type: 'category',
      label: 'Providers',
      items: [
        'providers/azure-foundry',
        'providers/openai',
        'providers/anthropic',
        'providers/cohere',
        'providers/mistral',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: [
        'deployment/azure-setup',
        'deployment/docker',
      ],
    },
  ],
};

export default sidebars;
