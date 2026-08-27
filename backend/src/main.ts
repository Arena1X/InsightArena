import { VersioningType } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { DeprecationInterceptor } from './common/interceptors/deprecation.interceptor';

import { Logger } from 'nestjs-pino';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { validate } from './config/env.validation';

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

  const config = new DocumentBuilder()
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
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  // If the SWAGGER_EXPORT env var is set, or in development mode, write current Swagger JSON
  if (env.SWAGGER_EXPORT === 'true') {
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(docsDir, 'openapi.json'),
      JSON.stringify(document, null, 2),
    );
    process.exit(0);
  }

  app.useGlobalInterceptors(
    new DeprecationInterceptor(app.get(Reflector)),
    new ResponseInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(env.PORT ?? 3000);
}
void bootstrap();
