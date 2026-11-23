#!/usr/bin/env node
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function renderStaticApiReferenceHtml(document) {
  const specJson = JSON.stringify(document).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InsightArena API Reference</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .topbar-header {
      background: #111827;
      padding: 14px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .topbar-header h1 {
      color: #ffffff;
      font-size: 18px;
      margin: 0;
      font-weight: 600;
      letter-spacing: -0.025em;
    }
    .topbar-nav {
      display: flex;
      gap: 16px;
    }
    .topbar-nav a {
      color: #93c5fd;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
    }
    .topbar-nav a:hover {
      color: #ffffff;
      text-decoration: underline;
    }
    .swagger-ui .topbar {
      display: none;
    }
  </style>
</head>
<body>
  <header class="topbar-header">
    <h1>InsightArena API Reference</h1>
    <nav class="topbar-nav">
      <a href="./openapi.json" download="openapi.json">Download OpenAPI Spec (JSON)</a>
      <a href="https://github.com/Arena1X/InsightArena" target="_blank" rel="noopener noreferrer">GitHub Repository</a>
    </nav>
  </header>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const spec = ${specJson};
      window.ui = SwaggerUIBundle({
        spec: spec,
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
}

function writeDocs(document, repoRoot) {
  const dirs = [
    path.join(repoRoot, 'docs'),
    path.join(repoRoot, 'backend', 'docs'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(dir, 'openapi.json'),
      JSON.stringify(document, null, 2),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      renderStaticApiReferenceHtml(document),
      'utf-8',
    );
  }
}

async function fetchFromRunningApp(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 3000 }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timed out'));
    });
  });
}

async function main() {
  const cwd = process.cwd();
  const repoRoot =
    path.basename(cwd) === 'backend' ? path.resolve(cwd, '..') : cwd;
  const docsUrl =
    process.env.API_DOCS_URL || 'http://localhost:3000/api/v1/docs-json';

  console.log(`Checking running backend instance at ${docsUrl}...`);
  try {
    const doc = await fetchFromRunningApp(docsUrl);
    console.log(
      'Successfully fetched OpenAPI document from running application.',
    );
    writeDocs(doc, repoRoot);
    console.log(`Exported OpenAPI spec and static reference HTML to:
  - ${path.join(repoRoot, 'docs')}
  - ${path.join(repoRoot, 'backend', 'docs')}`);
    return;
  } catch (err) {
    console.log(
      `Running app not reachable at ${docsUrl} (${err.message}). Falling back to offline generator...`,
    );
  }

  // Fallback: run offline generator via ts-node
  const scriptPath = path.join(
    repoRoot,
    'backend',
    'scripts',
    'generate-spec.ts',
  );
  if (fs.existsSync(scriptPath)) {
    console.log('Running offline generator script: ' + scriptPath);
    execSync(`npx ts-node -T "${scriptPath}"`, {
      cwd: path.join(repoRoot, 'backend'),
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db',
        JWT_SECRET: process.env.JWT_SECRET || '12345678901234567890123456789012',
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
        STELLAR_NETWORK: process.env.STELLAR_NETWORK || 'testnet',
        SOROBAN_CONTRACT_ID:
          process.env.SOROBAN_CONTRACT_ID ||
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        SERVER_SECRET_KEY:
          process.env.SERVER_SECRET_KEY ||
          'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      },
    });
    return;
  }

  // If already checked in, re-render HTML from openapi.json
  const existingJsonPath = path.join(repoRoot, 'docs', 'openapi.json');
  if (fs.existsSync(existingJsonPath)) {
    console.log('Rendering HTML from existing ' + existingJsonPath);
    const doc = JSON.parse(fs.readFileSync(existingJsonPath, 'utf-8'));
    writeDocs(doc, repoRoot);
    return;
  }

  console.error(
    'Could not export docs: backend is not running and no generator or openapi.json found.',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('Docs export failed:', err);
  process.exit(1);
});
