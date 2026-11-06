import workerJsRaw from '../worker.js?raw';
import wranglerTomlRaw from '../wrangler.toml?raw';
import readmeMdRaw from '../README.md?raw';
import envExampleRaw from '../.env.example?raw';
import gitignoreRaw from '../.gitignore?raw';

export const STANDALONE_PACKAGE_JSON = `{
  "name": "zenox-gmail-bot",
  "version": "1.0.0",
  "private": true,
  "description": "High-performance single-file Telegram Bot running on Cloudflare Workers (ES Modules) with Cloudflare KV storage",
  "main": "worker.js",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev worker.js",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail",
    "kv:create": "wrangler kv namespace create DB",
    "kv:preview": "wrangler kv namespace create DB --preview"
  },
  "devDependencies": {
    "wrangler": "^3.109.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
`;

export interface RepoFileItem {
  filename: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const REPO_FILES: RepoFileItem[] = [
  {
    filename: 'worker.js',
    path: '/worker.js',
    language: 'javascript',
    description: 'Complete single-file Telegram Bot running on Cloudflare Workers (ES Modules) with Cloudflare KV state management.',
    content: workerJsRaw,
  },
  {
    filename: 'package.json',
    path: '/package.json',
    language: 'json',
    description: 'Minimal dependency setup with Cloudflare Wrangler CLI scripts for local dev, KV provisioning, and deployment.',
    content: STANDALONE_PACKAGE_JSON,
  },
  {
    filename: 'wrangler.toml',
    path: '/wrangler.toml',
    language: 'toml',
    description: 'Cloudflare Workers configuration pre-configured for KV namespace binding `DB` and environment variables.',
    content: wranglerTomlRaw,
  },
  {
    filename: 'README.md',
    path: '/README.md',
    language: 'markdown',
    description: 'Step-by-step setup guide for GitHub deployment, Wrangler CLI, Dashboard deploy, KV binding, and webhooks.',
    content: readmeMdRaw,
  },
  {
    filename: '.env.example',
    path: '/.env.example',
    language: 'bash',
    description: 'Environment variable template for BOT_TOKEN, OWNER_ID, SUPPORT_USERNAME, FORCE_CHANNEL, and UPI_DETAILS.',
    content: envExampleRaw,
  },
  {
    filename: '.gitignore',
    path: '/.gitignore',
    language: 'bash',
    description: 'Git ignore rules for node_modules, .wrangler, .dev.vars, and local environment files.',
    content: gitignoreRaw,
  },
];
