import request from 'supertest';
import {
  bootstrapTestApp,
  E2eContext,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
} from './utils/e2e-app';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.constants';

/**
 * e2e coverage of the CRM pipeline board over the Mastra-free TestAppModule:
 * a new contact lands in "new", the board groups by stage, and a stage/position
 * PATCH moves the card. The booking auto-advance is unit-tested (pipeline.spec)
 * since AppointmentsModule isn't part of the Mastra-free test app.
 */
describe('Contacts pipeline board (e2e)', () => {
  let ctx: E2eContext;
  let cookie: string;
  let contactId: string;

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
    const res = await request(server()).get('/api/contacts/board');
    expect(res.status).toBe(401);
  });

  it('places a new contact in the "new" column', async () => {
    const create = await request(server())
      .post('/api/contacts')
      .set('Cookie', cookie)
      .send({ name: 'Ana Pérez', phone: '+34600111222' });
    expect(create.status).toBe(201);
    expect(create.body.pipelineStage).toBe('new');
    contactId = create.body.id;

    const board = await request(server())
      .get('/api/contacts/board')
      .set('Cookie', cookie);
    expect(board.status).toBe(200);
    expect(board.body.stages).toHaveLength(6);
    const newCol = board.body.stages.find(
      (s: { stage: string }) => s.stage === 'new',
    );
    expect(
      newCol.items.map((c: { id: string }) => c.id),
    ).toContain(contactId);
    // Card is enriched with a nextAppointment slot (null here — no appointments).
    const card = newCol.items.find(
      (c: { id: string }) => c.id === contactId,
    );
    expect(card).toHaveProperty('nextAppointment', null);
  });

  it('moves a card to another stage via PATCH', async () => {
    const patch = await request(server())
      .patch(`/api/contacts/${contactId}`)
      .set('Cookie', cookie)
      .send({ pipelineStage: 'contacted', boardPosition: 12345 });
    expect(patch.status).toBe(200);
    expect(patch.body.pipelineStage).toBe('contacted');

    const board = await request(server())
      .get('/api/contacts/board')
      .set('Cookie', cookie);
    const stages: { stage: string; items: { id: string }[] }[] =
      board.body.stages;
    const inContacted = stages
      .find((s) => s.stage === 'contacted')!
      .items.map((c) => c.id);
    const inNew = stages.find((s) => s.stage === 'new')!.items.map((c) => c.id);
    expect(inContacted).toContain(contactId);
    expect(inNew).not.toContain(contactId);
  });

  it('rejects an invalid pipeline stage (400)', async () => {
    const res = await request(server())
      .patch(`/api/contacts/${contactId}`)
      .set('Cookie', cookie)
      .send({ pipelineStage: 'not-a-stage' });
    expect(res.status).toBe(400);
  });

  it('reorders a column (drag persistence): sets stage + exact order', async () => {
    const second = await request(server())
      .post('/api/contacts')
      .set('Cookie', cookie)
      .send({ name: 'Beto Ruiz', phone: '+34600333444' });
    const secondId = second.body.id;

    // Put both into "qualified" with an explicit order: second on top.
    const reorder = await request(server())
      .post('/api/contacts/board/reorder')
      .set('Cookie', cookie)
      .send({ stage: 'qualified', orderedIds: [secondId, contactId] });
    expect(reorder.status).toBe(204);

    const board = await request(server())
      .get('/api/contacts/board')
      .set('Cookie', cookie);
    const qualified = board.body.stages.find(
      (s: { stage: string }) => s.stage === 'qualified',
    );
    const ids = qualified.items.map((c: { id: string }) => c.id);
    expect(ids).toEqual([secondId, contactId]); // exact top→bottom order
  });

  it('rejects a reorder with an invalid stage (400)', async () => {
    const res = await request(server())
      .post('/api/contacts/board/reorder')
      .set('Cookie', cookie)
      .send({ stage: 'nope', orderedIds: [contactId] });
    expect(res.status).toBe(400);
  });
});
