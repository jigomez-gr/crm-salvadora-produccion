import request from 'supertest';
import {
  bootstrapTestApp,
  E2eContext,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
} from './utils/e2e-app';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.constants';

/**
 * e2e coverage of the agent knowledge-base endpoints (upload/list/delete) over
 * the Mastra-free TestAppModule. Uses text uploads (base64 JSON) — the binary
 * PDF/DOCX/XLSX extraction is covered by the unit/manual checks. The large-KB FTS
 * path isn't reachable here (the synchronize test DB has no generated tsvector
 * column), which is by design — `resolveKnowledgeMode`/`packWithinBudget` are
 * unit-tested instead.
 */
describe('Agent knowledge base (e2e)', () => {
  let ctx: E2eContext;
  let cookie: string;

  const AGENT = 'e2e-agent';
  const base = () => `/api/agents/${AGENT}/knowledge`;
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD });
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    cookie = setCookie
      .find((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE}=`))!
      .split(';')[0];
  }, 120_000);

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  const server = () => ctx.app.getHttpServer();

  it('requires a session (401 without a cookie)', async () => {
    const res = await request(server()).get(base());
    expect(res.status).toBe(401);
  });

  it('starts with an empty knowledge base (inject mode)', async () => {
    const res = await request(server()).get(base()).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
    expect(res.body.totalChars).toBe(0);
    expect(res.body.mode).toBe('inject');
    expect(res.body.budgetChars).toBeGreaterThan(0);
  });

  it('uploads a .txt document, extracts its text, and lists it', async () => {
    const text = 'Horario: de lunes a viernes de 9 a 18h. Aparcamiento gratuito.';
    const up = await request(server())
      .post(base())
      .set('Cookie', cookie)
      .send({ filename: 'faq.txt', contentBase64: b64(text) });
    expect(up.status).toBe(201);
    expect(up.body.fileExtension).toBe('txt');
    expect(up.body.charCount).toBe(text.length);
    expect(up.body.content).toBeUndefined(); // never returns the raw text
    expect(up.body.id).toBeDefined();

    const list = await request(server()).get(base()).set('Cookie', cookie);
    expect(list.body.documents).toHaveLength(1);
    expect(list.body.documents[0].filename).toBe('faq.txt');
    expect(list.body.totalChars).toBe(text.length);
    expect(list.body.mode).toBe('inject');
  });

  it('accepts a base64 data-URL prefix', async () => {
    const up = await request(server())
      .post(base())
      .set('Cookie', cookie)
      .send({
        filename: 'precios.md',
        contentBase64: `data:text/markdown;base64,${b64('# Precios\n\nLimpieza: 40€')}`,
      });
    expect(up.status).toBe(201);
    expect(up.body.charCount).toBeGreaterThan(0);
  });

  it('rejects a disallowed extension (400)', async () => {
    const res = await request(server())
      .post(base())
      .set('Cookie', cookie)
      .send({ filename: 'virus.exe', contentBase64: b64('MZ...') });
    expect(res.status).toBe(400);
  });

  it('rejects a file with no extractable text (400, friendly message)', async () => {
    const res = await request(server())
      .post(base())
      .set('Cookie', cookie)
      .send({ filename: 'blank.txt', contentBase64: b64('    \n\n   ') });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/texto/i);
  });

  it('deletes a document (204) and it disappears from the list', async () => {
    const up = await request(server())
      .post(base())
      .set('Cookie', cookie)
      .send({ filename: 'temp.txt', contentBase64: b64('borrame') });
    const id = up.body.id;

    const del = await request(server())
      .delete(`${base()}/${id}`)
      .set('Cookie', cookie);
    expect(del.status).toBe(204);

    const list = await request(server()).get(base()).set('Cookie', cookie);
    expect(list.body.documents.map((d: { id: string }) => d.id)).not.toContain(id);
  });

  it('scopes deletion by agentKey (cannot delete another agent\'s doc)', async () => {
    const up = await request(server())
      .post(base())
      .set('Cookie', cookie)
      .send({ filename: 'mine.txt', contentBase64: b64('contenido propio') });
    const id = up.body.id;

    const del = await request(server())
      .delete(`/api/agents/other-agent/knowledge/${id}`)
      .set('Cookie', cookie);
    expect(del.status).toBe(404);

    // Still present under the original agent.
    const list = await request(server()).get(base()).set('Cookie', cookie);
    expect(list.body.documents.map((d: { id: string }) => d.id)).toContain(id);
  });
});
