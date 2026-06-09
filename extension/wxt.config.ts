import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Chalk',
    description: 'Draw on any webpage. See what others left behind.',
    version: '0.1.25',
    action: { default_title: 'Toggle Chalk' },
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
  },
});
