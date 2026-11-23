import { VersioningType } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { DeprecationInterceptor } from './common/interceptors/deprecation.interceptor';

import { Logger } from 'nestjs-pino';

import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { validate } from './config/env.validation';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('InsightArena API')
    .setDescription(
      'The InsightArena Platform API description\n\n' +
        '### Rate limiting\n' +
        'Every endpoint is rate-limited per tier (default/auth/read/write). ' +
        'A `429 Too Many Requests` response always includes:\n' +
        '- `X-RateLimit-Limit`: max requests allowed in the current window\n' +
        '- `X-RateLimit-Remaining`: requests left in the window (`0` when throttled)\n' +
        '- `X-RateLimit-Reset`: seconds until the window resets\n' +
        '- `Retry-After`: seconds the client must wait before retrying',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: 'Oracle API key',
      },
      'api-key',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description:
          'Public API key. Keys must include the public:read scope and use the dedicated public rate-limit tier.',
      },
      'public-api-key',
    )
    .build();
}

export function renderStaticApiReferenceHtml(document: unknown): string {
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

export function exportOpenApiAndStaticDocs(
  document: unknown,
  targetDir?: string,
): { docsDir: string; openapiPath: string; htmlPath: string } {
  const cwd = process.cwd();
  const repoRoot =
    path.basename(cwd) === 'backend' ? path.resolve(cwd, '..') : cwd;

  const docsDir = targetDir ?? path.join(repoRoot, 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const openapiPath = path.join(docsDir, 'openapi.json');
  const htmlPath = path.join(docsDir, 'index.html');

  fs.writeFileSync(openapiPath, JSON.stringify(document, null, 2), 'utf-8');
  fs.writeFileSync(htmlPath, renderStaticApiReferenceHtml(document), 'utf-8');

  // Also sync to backend/docs if different from root docs
  const backendDocsDir = path.join(repoRoot, 'backend', 'docs');
  if (path.resolve(docsDir) !== path.resolve(backendDocsDir)) {
    if (!fs.existsSync(backendDocsDir)) {
      fs.mkdirSync(backendDocsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(backendDocsDir, 'openapi.json'),
      JSON.stringify(document, null, 2),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(backendDocsDir, 'index.html'),
      renderStaticApiReferenceHtml(document),
      'utf-8',
    );
  }

  return { docsDir, openapiPath, htmlPath };
}

async function bootstrap() {
  loadEnv();
  const env = validate(process.env);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  // Enable URI-based versioning.
  //
  // Supported versions: v1 (current, default).
  // Deprecated versions: none yet. When a version is deprecated, mark its
  // routes with @Deprecated({ sunset, link }) (src/common/decorators)
  // so DeprecationInterceptor emits Deprecation/Sunset response headers.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Set global API prefix
  app.setGlobalPrefix('api');

  const config = buildSwaggerConfig();
  const document: OpenAPIObject = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  // If the SWAGGER_EXPORT env var is set, or in development mode, write current Swagger JSON & static reference
  if (env.SWAGGER_EXPORT === 'true' || process.env.SWAGGER_EXPORT === 'true') {
    exportOpenApiAndStaticDocs(document);
    process.exit(0);
  }

  app.useGlobalInterceptors(
    new DeprecationInterceptor(app.get(Reflector)),
    new ResponseInterceptor(app.get(Reflector)),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(env.PORT ?? 3000);
}
if (require.main === module) {
  void bootstrap();
}
