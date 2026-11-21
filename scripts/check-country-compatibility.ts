/** Offline regression checks. No accounts, loans or transactions are created. */
import assert from 'node:assert/strict';
import { Keypair } from '@stellar/stellar-sdk';
import { countries } from '../lib/countries';
import { bondUsd, bondValue, examplesFor, normalizeBond, terms } from '../lib/loan/model';
import { validateBond } from '../lib/server/loan/register';
import { readAttestation } from '../lib/server/attestation';
import { createSession, decision } from '../lib/server/didit';

async function main() {
  for (const country of countries) {
    const example = examplesFor(country.code)[0];
    assert.match(example.issuer, /\(ficticia\)$/);
    for (const currency of new Set([country.currency, 'USD'])) {
      const rate = countries.find(c => c.currency === currency)!.perUsd;
      for (const usd of [100, 400]) {
        const bond = validateBond({ ...example, currency, nominal: usd * rate });
        assert.equal(bondUsd(bond), usd);
        assert.match(bondValue(bond, usd), new RegExp(currency));
      }
      for (const usd of [99, 401]) assert.throws(() => validateBond({ ...example, currency, nominal: usd * rate }));
    }
  }
  const legacy = { issuer: 'Histórico', series: 'A', nominalBs: 6960, coupon: 7, maturity: '2020-01-01' };
  const normalized = normalizeBond(legacy)!;
  assert.equal(bondUsd(normalized), 1000);
  assert.match(bondValue(normalized, 1000), /Bs 6\.960,00 BOB · USD 1\.000,00/);
  assert.match(bondValue(null, 400), /Bs 2\.784,00 BOB/);
  assert.equal(normalizeBond('Bono registrado: Bs 2784'), null);
  assert.throws(() => validateBond({ ...examplesFor('BO')[0], currency: 'INVALID' }));
  assert.throws(() => validateBond({ ...examplesFor('BO')[0], nominal: NaN }));
  assert.equal(terms(400).loan, 200);
  assert.equal(terms(400).interest, 1.3333333);

  const originalFetch = globalThis.fetch;
  // Disposable test-only values; never print or overwrite real credentials.
  process.env.VAULT_SECRET_KEY ??= Keypair.random().secret();
  process.env.DIDIT_API_KEY ??= 'sk_test_offline';
  process.env.DIDIT_KYB_WORKFLOW_ID ??= 'offline-workflow';
  const wallet = Keypair.random().publicKey();
  const id = '12345678-1234-1234-1234-123456789abc';
  try {
    for (const country of countries) {
      const value = `1:${country.code}:${id}`;
      assert.ok(Buffer.byteLength(value) <= 64);
      globalThis.fetch = async () => Response.json({ value: Buffer.from(value).toString('base64') });
      const entry = await readAttestation(wallet);
      assert.equal(entry?.country, country.code);
      assert.equal(entry?.sessionId, id);
    }
    globalThis.fetch = async () => Response.json({ value: Buffer.from(id).toString('base64') });
    assert.equal((await readAttestation(wallet))?.country, 'BO');
    for (const country of countries) {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        assert.equal(body.vendor_data, wallet);
        assert.equal(body.metadata.country, country.code);
        assert.deepEqual(body.expected_details, country.code === 'OTHER' ? undefined : { registry_country: country.code });
        return Response.json({ session_id: id, url: 'https://verification.didit.me/example' });
      };
      assert.equal((await createSession(wallet, 'http://localhost:3000', country.code)).country, country.code);
    }
    const result = { session_id: id, vendor_data: wallet, session_kind: 'business', workflow_id: process.env.DIDIT_KYB_WORKFLOW_ID, status: 'Approved', metadata: { country: 'OTHER' } };
    globalThis.fetch = async () => Response.json(result);
    assert.equal((await decision(wallet, id)).country, 'OTHER');
    await assert.rejects(() => decision(Keypair.random().publicKey(), id), { status: 403 });
    globalThis.fetch = async () => Response.json({ ...result, metadata: null, expected_details: { registry_country: 'PE' } });
    assert.equal((await decision(wallet, id)).country, 'PE');
    globalThis.fetch = async () => Response.json({ ...result, metadata: null });
    assert.equal((await decision(wallet, id)).country, 'BO');
  } finally { globalThis.fetch = originalFetch; }
  console.log('Country, currency, historical bond, attestation and session ownership checks passed (offline).');
}
void main();
