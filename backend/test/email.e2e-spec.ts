import request from 'supertest';
import {
  bootstrapTestApp,
  E2eContext,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
} from './utils/e2e-app';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.constants';

/**
 * e2e coverage of the email endpoints: auth, admin-only config, secret
 * sanitization, "configured" status and send validation. The actual SMTP send is
 * NOT exercised (no mail server in CI) — only the guardrails around it.
 */
describe('Business email (e2e)', () => {
  let ctx: E2eContext;
  let cookie: string;

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
    expect((await request(server()).get('/api/email/status')).status).toBe(401);
    expect((await request(server()).get('/api/email/config')).status).toBe(401);
  });

  it('starts unconfigured and never returns the password', async () => {
    const cfg = await request(server())
      .get('/api/email/config')
      .set('Cookie', cookie);
    expect(cfg.status).toBe(200);
    expect(cfg.body.hasSmtpPassword).toBe(false);
    expect(cfg.body.smtpPassword).toBeUndefined();

    const status = await request(server())
      .get('/api/email/status')
      .set('Cookie', cookie);
    expect(status.body.configured).toBe(false);
  });

  it('saves the account (secret write-only) and reports configured', async () => {
    const put = await request(server())
      .put('/api/email/config')
      .set('Cookie', cookie)
      .send({
        fromName: 'Demo',
        fromAddress: 'demo@example.com',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'demo@example.com',
        smtpPassword: 'app-password-123',
      });
    expect(put.status).toBe(200);
    expect(put.body.hasSmtpPassword).toBe(true);
    expect(put.body.smtpPassword).toBeUndefined();

    const status = await request(server())
      .get('/api/email/status')
      .set('Cookie', cookie);
    expect(status.body.configured).toBe(true);
    expect(status.body.fromAddress).toBe('demo@example.com');
  });

  it('keeps the stored password when the field is left blank', async () => {
    const put = await request(server())
      .put('/api/email/config')
      .set('Cookie', cookie)
      .send({ fromName: 'Demo 2' }); // no password
    expect(put.body.hasSmtpPassword).toBe(true); // still set
  });

  it('rejects an invalid send body (400)', async () => {
    const res = await request(server())
      .post('/api/email/send')
      .set('Cookie', cookie)
      .send({ contactId: 'not-a-uuid', body: 'hola' }); // missing subject + bad id
    expect(res.status).toBe(400);
  });

  it('rejects a malformed contactId on the history route (400, not 500)', async () => {
    const res = await request(server())
      .get('/api/email/contact/not-a-uuid')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('returns an empty history for a contact with no emails', async () => {
    const create = await request(server())
      .post('/api/contacts')
      .set('Cookie', cookie)
      .send({ name: 'Sin Correos', phone: '+34600999888' });
    const res = await request(server())
      .get(`/api/email/contact/${create.body.id}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
