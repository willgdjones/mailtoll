import request from 'supertest';
import jwt from 'jsonwebtoken';

// Shared mock OAuth2 instance — the auth route captures this at module load
const mockOAuth2Instance = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  on: jest.fn(),
};

const mockOauth2Api = {
  userinfo: {
    get: jest.fn(),
  },
};

jest.mock('../src/db', () => ({
  supabase: {
    from: jest.fn(),
  },
  pool: {
    connect: jest.fn(),
    end: jest.fn(),
  },
}));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => mockOAuth2Instance),
    },
    oauth2: jest.fn().mockReturnValue(mockOauth2Api),
    gmail: jest.fn(),
  },
}));

import app from '../src/index';
import { supabase } from '../src/db';
import { config } from '../src/config';

const mockFrom = supabase.from as jest.Mock;

afterAll((done) => {
  // Close the Express server to prevent Jest from hanging
  done();
});

function mockSupabaseChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue(result);
  return chain;
}

// ─── Test 1: Auth middleware ─────────────────────────────────────────────────

describe('Authentication middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/settings/json');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .get('/settings/json')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign(
      { sub: 'some-id', email: 'test@test.com' },
      config.jwtSecret,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/settings/json')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

// ─── Test 2: OAuth callback creates new recipient ───────────────────────────

describe('Google OAuth callback — new recipient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new recipient with a unique handle', async () => {
    mockOAuth2Instance.getToken.mockResolvedValue({
      tokens: {
        access_token: 'access_123',
        refresh_token: 'refresh_123',
      },
    });
    mockOauth2Api.userinfo.get.mockResolvedValue({
      data: { id: 'google_new_123', email: 'newuser@gmail.com' },
    });

    // First call: check existing — not found
    const noExisting = mockSupabaseChain({ data: null, error: { code: 'PGRST116' } });
    // Second call: check handle conflict — no conflict
    const noConflict = mockSupabaseChain({ data: null, error: { code: 'PGRST116' } });
    // Third call: insert new recipient
    const inserted = mockSupabaseChain({ data: { id: 'new-uuid-123' }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return noExisting;
      if (callCount === 2) return noConflict;
      if (callCount === 3) return inserted;
      return mockSupabaseChain({ data: null, error: null });
    });

    const res = await request(app).get('/auth/google/callback?code=test_auth_code');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/settings');
    expect(inserted.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        google_id: 'google_new_123',
        email: 'newuser@gmail.com',
        handle: 'newuser',
        gmail_access_token: 'access_123',
        gmail_refresh_token: 'refresh_123',
      })
    );
  });
});

// ─── Test 3: OAuth callback updates existing recipient ──────────────────────

describe('Google OAuth callback — existing recipient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates tokens for an existing recipient', async () => {
    mockOAuth2Instance.getToken.mockResolvedValue({
      tokens: {
        access_token: 'new_access_456',
        refresh_token: 'new_refresh_456',
      },
    });
    mockOauth2Api.userinfo.get.mockResolvedValue({
      data: { id: 'google_existing_456', email: 'existing@gmail.com' },
    });

    // Found existing recipient
    const existing = mockSupabaseChain({
      data: { id: 'existing-uuid-456', handle: 'existing' },
      error: null,
    });
    // Update call
    const updated = mockSupabaseChain({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return existing;
      if (callCount === 2) return updated;
      return mockSupabaseChain({ data: null, error: null });
    });

    const res = await request(app).get('/auth/google/callback?code=test_auth_code');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/settings');
    expect(updated.update).toHaveBeenCalledWith(
      expect.objectContaining({
        gmail_access_token: 'new_access_456',
        gmail_refresh_token: 'new_refresh_456',
        email: 'existing@gmail.com',
      })
    );
  });
});

// ─── Test 4: GET /registry/:handle ──────────────────────────────────────────

describe('GET /registry/:handle', () => {
  it('returns correct recipient data for a valid handle', async () => {
    const chain = mockSupabaseChain({
      data: {
        handle: 'will',
        price_usd: '1.5000',
        accepted_rails: ['stripe', 'x402'],
        category_preferences: 'AI tooling only',
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await request(app).get('/registry/will');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      handle: 'will',
      endpoint: `${config.baseUrl}/schedule`,
      price_usd: 1.5,
      accepted_rails: ['stripe', 'x402'],
      category_preferences: 'AI tooling only',
    });
  });

  it('returns 404 for a non-existent handle', async () => {
    const chain = mockSupabaseChain({ data: null, error: { code: 'PGRST116' } });
    mockFrom.mockReturnValue(chain);

    const res = await request(app).get('/registry/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

// ─── Test 5: POST /schedule — 402 Payment Required ─────────────────────────

describe('POST /schedule', () => {
  it('returns 402 Payment Required for unwhitelisted sender without payment proof', async () => {
    const chain = mockSupabaseChain({
      data: {
        id: 'recipient-uuid',
        handle: 'will',
        email: 'will@gmail.com',
        price_usd: '2.0000',
        accepted_rails: ['stripe', 'coinbase'],
        whitelist: ['friend@company.com'],
        gmail_access_token: 'tok',
        gmail_refresh_token: 'rtok',
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await request(app)
      .post('/schedule')
      .send({
        handle: 'will',
        sender_email: 'stranger@agent.com',
        subject: 'Hello',
        body: 'Test message',
      });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('payment_required');
    expect(res.body.amount_usd).toBe(2);
    expect(res.body.accepted_rails).toEqual(['stripe', 'coinbase']);
    expect(res.body.payment_instructions).toBeDefined();
    expect(res.body.expires_at).toBeDefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/schedule')
      .send({ handle: 'will' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_fields');
  });
});
