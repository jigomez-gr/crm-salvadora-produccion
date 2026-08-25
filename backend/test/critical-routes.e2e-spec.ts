import request from 'supertest';
import {
  bootstrapTestApp,
  sleep,
  E2eContext,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
} from './utils/e2e-app';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.constants';
import { UserRole } from '../src/common/entities/user.entity';
import { ContactStatus } from '../src/common/entities/contact.entity';

/**
 * End-to-end coverage of the security-critical request paths. These boot the
 * app (Mastra-free `TestAppModule`) against a throwaway DB and assert the
 * contracts that must never silently regress: authentication, the stateful
 * guard, role enforcement, the forced-password-change gate, session
 * invalidation, and the contacts partial-update that previously wiped fields
 * (ADR 0014). The webhook's fail-closed property is covered by the pure
 * `ycloud-signature.spec.ts` unit test.
 */
describe('Critical routes (e2e)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
  }, 120_000);

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  const server = () => ctx.app.getHttpServer();

  /** Pull the `access_token=<jwt>` cookie pair out of a Set-Cookie header. */
  function authCookie(res: request.Response): string {
    const setCookie = (res.headers['set-cookie'] as unknown as string[]) || [];
    const cookie = setCookie.find((c) =>
      c.startsWith(`${ACCESS_TOKEN_COOKIE}=`),
    );
    if (!cookie) throw new Error('Expected an access_token cookie on the response');
    return cookie.split(';')[0];
  }

  const login = (email: string, password: string) =>
    request(server()).post('/api/auth/login').send({ email, password });

  // ─── Authentication ───
  describe('Authentication', () => {
    it('rejects a login with wrong credentials (401)', async () => {
      const res = await login(E2E_ADMIN_EMAIL, 'definitely-wrong');
      expect(res.status).toBe(401);
    });

    it('logs the bootstrap admin in and sets an httpOnly cookie', async () => {
      const res = await login(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(E2E_ADMIN_EMAIL);
      expect(res.body.user.role).toBe(UserRole.ADMIN);
      // No secret ever leaves the server.
      expect(res.body.user.passwordHash).toBeUndefined();
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(
        setCookie.some(
          (c) =>
            c.startsWith(`${ACCESS_TOKEN_COOKIE}=`) && /HttpOnly/i.test(c),
        ),
      ).toBe(true);
    });

    it('requires a session for /api/auth/me (401 without a cookie)', async () => {
      const res = await request(server()).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns the user for /api/auth/me with a valid cookie', async () => {
      const cookie = authCookie(await login(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD));
      const res = await request(server())
        .get('/api/auth/me')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(E2E_ADMIN_EMAIL);
    });

    it('carries a correlation id (X-Request-Id) on every response', async () => {
      const res = await request(server()).get('/api/auth/me'); // 401, still tagged
      expect(res.headers['x-request-id']).toBeTruthy();
      // The error body's requestId matches the header (one id per request).
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });
  });

  // ─── Guard + roles + forced password change ───
  describe('Guard, roles & forced password change', () => {
    let adminCookie: string;

    beforeAll(async () => {
      adminCookie = authCookie(await login(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD));
    });

    it('blocks a guarded route without a session (401)', async () => {
      const res = await request(server()).get('/api/contacts');
      expect(res.status).toBe(401);
    });

    it('lets the admin reach a guarded route (200, paginated envelope)', async () => {
      const res = await request(server())
        .get('/api/contacts')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.limit).toBe(50);
      expect(res.body.offset).toBe(0);
    });

    it('forces a new user to change password, then enforces their role', async () => {
      const tempPassword = 'TempPass123!';
      const email = 'e2e-employee@crmacademy.local';

      // Admin creates an employee — the typed password is a temporary handoff.
      const created = await request(server())
        .post('/api/users')
        .set('Cookie', adminCookie)
        .send({ name: 'E2E Employee', email, password: tempPassword, role: UserRole.EMPLOYEE });
      expect(created.status).toBe(201);
      expect(created.body.mustChangePassword).toBe(true);
      expect(created.body.passwordHash).toBeUndefined();

      // They can log in, but every normal route is gated until they change it.
      let empCookie = authCookie(await login(email, tempPassword));
      const blocked = await request(server())
        .get('/api/contacts')
        .set('Cookie', empCookie);
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

      // The change-password route IS reachable; it clears the flag + re-issues.
      const changed = await request(server())
        .post('/api/auth/change-password')
        .set('Cookie', empCookie)
        .send({ currentPassword: tempPassword, newPassword: 'NewEmpPass123!' });
      expect(changed.status).toBe(200);
      empCookie = authCookie(changed);

      // Now the employee can use the CRM…
      const ok = await request(server())
        .get('/api/contacts')
        .set('Cookie', empCookie);
      expect(ok.status).toBe(200);

      // …but the admin-only Users API stays forbidden (RolesGuard), and that's a
      // role denial, not a password-change denial.
      const forbidden = await request(server())
        .get('/api/users')
        .set('Cookie', empCookie);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).toBeUndefined();
    });

    it('invalidates a live session the instant an admin resets that password', async () => {
      const pw = 'ResetMe123!';
      const email = 'e2e-reset@crmacademy.local';

      const created = await request(server())
        .post('/api/users')
        .set('Cookie', adminCookie)
        .send({ name: 'E2E Reset', email, password: pw, role: UserRole.EMPLOYEE });
      expect(created.status).toBe(201);
      const userId = created.body.id;

      // Clear the forced-change flag → a normal, usable session.
      const userCookie = authCookie(
        await request(server())
          .post('/api/auth/change-password')
          .set('Cookie', authCookie(await login(email, pw)))
          .send({ currentPassword: pw, newPassword: 'Usable123!Pass' }),
      );
      expect(
        (
          await request(server()).get('/api/auth/me').set('Cookie', userCookie)
        ).status,
      ).toBe(200);

      // Cross a whole-second boundary so the reset lands strictly after the
      // token's iat (session staleness has 1-second granularity).
      await sleep(1100);

      const reset = await request(server())
        .patch(`/api/users/${userId}`)
        .set('Cookie', adminCookie)
        .send({ password: 'AdminReset123!' });
      expect(reset.status).toBe(200);

      // The user's pre-existing session is dead now — no waiting for expiry.
      const dead = await request(server())
        .get('/api/auth/me')
        .set('Cookie', userCookie);
      expect(dead.status).toBe(401);
    });
  });

  // ─── Contacts CRUD + partial-update regression (ADR 0014) ───
  describe('Contacts CRUD & partial-update regression', () => {
    let adminCookie: string;

    beforeAll(async () => {
      adminCookie = authCookie(await login(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD));
    });

    it('rejects an invalid contact (missing name) with 400', async () => {
      const res = await request(server())
        .post('/api/contacts')
        .set('Cookie', adminCookie)
        .send({ phone: '+34600000001' });
      expect(res.status).toBe(400);
    });

    it('creates, partially updates without wiping fields, reads back, deletes', async () => {
      const create = await request(server())
        .post('/api/contacts')
        .set('Cookie', adminCookie)
        .send({ name: 'Regression Test', phone: '+34600111222' });
      expect(create.status).toBe(201);
      expect(create.body.name).toBe('Regression Test');
      expect(create.body.status).toBe(ContactStatus.LEAD); // default
      const id = create.body.id;

      // A status-only PATCH must NOT wipe the name — the ES2022 class-fields bug
      // where a blind Object.assign applied `undefined` own-properties.
      const patch = await request(server())
        .patch(`/api/contacts/${id}`)
        .set('Cookie', adminCookie)
        .send({ status: ContactStatus.ACTIVE });
      expect(patch.status).toBe(200);
      expect(patch.body.name).toBe('Regression Test'); // ← the regression guard
      expect(patch.body.status).toBe(ContactStatus.ACTIVE);

      const read = await request(server())
        .get(`/api/contacts/${id}`)
        .set('Cookie', adminCookie);
      expect(read.status).toBe(200);
      expect(read.body.name).toBe('Regression Test');
      expect(read.body.status).toBe(ContactStatus.ACTIVE);

      const del = await request(server())
        .delete(`/api/contacts/${id}`)
        .set('Cookie', adminCookie);
      expect(del.status).toBe(204);
    });

    it('paginates and filters the list server-side', async () => {
      // Seed a few contacts sharing a unique token in the name. (The regression
      // test above deleted its contact, so these are the only rows now.)
      const token = 'Pgnz';
      for (let i = 0; i < 3; i++) {
        const r = await request(server())
          .post('/api/contacts')
          .set('Cookie', adminCookie)
          .send({ name: `${token} Contact ${i}`, phone: `+3461100000${i}` });
        expect(r.status).toBe(201);
      }

      // First page of 2.
      const p1 = await request(server())
        .get('/api/contacts?limit=2&offset=0')
        .set('Cookie', adminCookie);
      expect(p1.status).toBe(200);
      expect(p1.body.items).toHaveLength(2);
      expect(p1.body.limit).toBe(2);
      expect(p1.body.total).toBeGreaterThanOrEqual(3);

      // Second page returns different rows.
      const p2 = await request(server())
        .get('/api/contacts?limit=2&offset=2')
        .set('Cookie', adminCookie);
      expect(p2.status).toBe(200);
      const ids1 = p1.body.items.map((c: { id: string }) => c.id);
      const ids2 = p2.body.items.map((c: { id: string }) => c.id);
      expect(ids2.every((id: string) => !ids1.includes(id))).toBe(true);

      // Search narrows to the seeded token, server-side.
      const s = await request(server())
        .get(`/api/contacts?search=${token}`)
        .set('Cookie', adminCookie);
      expect(s.status).toBe(200);
      expect(s.body.total).toBe(3);
      expect(
        s.body.items.every((c: { name: string }) => c.name.includes(token)),
      ).toBe(true);
    });
  });

  // ─── Conversations inbox pagination (ADR 0020) ───
  describe('Conversations inbox (paginated envelope)', () => {
    let adminCookie: string;

    beforeAll(async () => {
      adminCookie = authCookie(await login(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD));
    });

    it('returns the {items,total,limit,offset} envelope with defaults', async () => {
      const res = await request(server())
        .get('/api/conversations')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.limit).toBe(30);
      expect(res.body.offset).toBe(0);
      expect(typeof res.body.total).toBe('number');
    });

    it('honours the limit query param', async () => {
      const res = await request(server())
        .get('/api/conversations?limit=5&offset=0')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(5);
    });
  });

  // ─── Reports / analytics (ADR 0020) ───
  describe('Reports summary', () => {
    let adminCookie: string;

    beforeAll(async () => {
      adminCookie = authCookie(await login(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD));
    });

    it('requires a session (401 without a cookie)', async () => {
      const res = await request(server()).get('/api/reports/summary');
      expect(res.status).toBe(401);
    });

    it('returns the analytics summary shape for a signed-in user', async () => {
      const res = await request(server())
        .get('/api/reports/summary')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.appointments).toBeDefined();
      expect(res.body.appointments.byStatus).toBeDefined();
      expect(Array.isArray(res.body.appointments.byDay)).toBe(true);
      expect(res.body.appointments.byHour).toHaveLength(24);
      expect(res.body.contacts.byStatus).toBeDefined();
      expect(res.body.messages).toBeDefined();
    });

    it('rejects an invalid date range (400)', async () => {
      const res = await request(server())
        .get('/api/reports/summary?from=not-a-date')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(400);
    });
  });
});
