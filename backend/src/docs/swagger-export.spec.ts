process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || '12345678901234567890123456789012';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'testnet';
process.env.SOROBAN_CONTRACT_ID =
  process.env.SOROBAN_CONTRACT_ID ||
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
process.env.SERVER_SECRET_KEY =
  process.env.SERVER_SECRET_KEY ||
  'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

import * as fs from 'fs';
import * as path from 'path';
import { buildSwaggerConfig, renderStaticApiReferenceHtml } from '../main';

describe('Swagger & Static API Reference Export', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const docsDir = path.join(repoRoot, 'docs');
  const openapiPath = path.join(docsDir, 'openapi.json');
  const htmlPath = path.join(docsDir, 'index.html');
  const backendDocsDir = path.join(repoRoot, 'backend', 'docs');

  it('buildSwaggerConfig produces valid OpenAPI configuration with title and version', () => {
    const config = buildSwaggerConfig();
    expect(config.info.title).toBe('InsightArena API');
    expect(config.info.version).toBe('1.0');
    expect(config.openapi).toMatch(/^3\./);
  });

  it('the export produces a valid OpenAPI document', () => {
    expect(fs.existsSync(openapiPath)).toBe(true);

    const content = fs.readFileSync(openapiPath, 'utf-8');
    const document = JSON.parse(content);

    expect(document.openapi).toMatch(/^3\./);
    expect(document.info).toBeDefined();
    expect(document.info.title).toBe('InsightArena API');
    expect(document.info.version).toBe('1.0');
    expect(typeof document.paths).toBe('object');
    expect(Object.keys(document.paths).length).toBeGreaterThan(0);
  });

  it('the static reference renders from the export', () => {
    expect(fs.existsSync(htmlPath)).toBe(true);

    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>InsightArena API Reference</title>');
    expect(html).toContain('swagger-ui');
    expect(html).toContain('SwaggerUIBundle');
    expect(html).toContain('SwaggerUIStandalonePreset');

    // Also verify backend/docs mirror exists
    expect(fs.existsSync(path.join(backendDocsDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(backendDocsDir, 'openapi.json'))).toBe(true);

    // Verify render function works directly on sample document
    const sampleDoc = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
    };
    const rendered = renderStaticApiReferenceHtml(sampleDoc);
    expect(rendered).toContain('InsightArena API Reference');
    expect(rendered).toContain(JSON.stringify(sampleDoc));
  });

  it('regeneration is documented', () => {
    const docsReadmePath = path.join(docsDir, 'README.md');
    const backendReadmePath = path.join(repoRoot, 'backend', 'README.md');

    expect(
      fs.existsSync(docsReadmePath) || fs.existsSync(backendReadmePath),
    ).toBe(true);

    const docsReadme = fs.existsSync(docsReadmePath)
      ? fs.readFileSync(docsReadmePath, 'utf-8')
      : '';
    const backendReadme = fs.existsSync(backendReadmePath)
      ? fs.readFileSync(backendReadmePath, 'utf-8')
      : '';

    const combined = docsReadme + '\n' + backendReadme;
    expect(combined).toMatch(/swagger:export|docs:generate/);
    expect(combined).toMatch(/openapi\.json/i);
    expect(combined).toMatch(/index\.html/i);
  });
});
