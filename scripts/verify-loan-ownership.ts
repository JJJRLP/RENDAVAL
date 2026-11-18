// Read-only authorization regression; use a verified company's public wallet.
import assert from 'node:assert/strict';
import { buildDeposit, submitDeposit } from '../lib/server/loan/deposit';
import { disburse } from '../lib/server/loan/disburse';
import { topup, buildRepayment, submitRepayment } from '../lib/server/loan/repayment';
import { settle } from '../lib/server/loan/settle';
import { escrowsFor } from '../lib/server/loan/state';
const wallet = process.argv[2];
if (!wallet) throw new Error('Pass the verified company public wallet as argument.');
async function main() {
  const foreignWallet = 'GA4J2HFY45VDAX6T7YFMOXRAWXVX5RCQFI3Y6W6BM3NFW4T5LJ4VNYF4';
  assert.notEqual(wallet, foreignWallet);
  const historical = await escrowsFor(foreignWallet);
  assert.ok(historical.length);
  const id = historical[0].contractId;
  for (const [name, run] of Object.entries({ depositBuild: () => buildDeposit(wallet, id), depositSubmit: () => submitDeposit(wallet, 'invalid', id), disburse: () => disburse(wallet, id), topup: () => topup(wallet, id), repaymentBuild: () => buildRepayment(wallet, id), repaymentSubmit: () => submitRepayment(wallet, 'invalid', id), settle: () => settle(wallet, id) })) {
    await assert.rejects(run, { status: 403 }); console.log(name, '403 foreign contract refused');
  }
  // Provider fixture changes ONLY the historical serviceProvider role; ownership
  // validation must continue accepting the company's old layout.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).startsWith('https://dev.api.trustlesswork.com/helper/get-escrows-by-role') ? Response.json(historical.map(e => ({ ...e, roles: { ...e.roles, serviceProvider: foreignWallet } }))) : originalFetch(input, init);
  try { assert.equal((await escrowsFor(foreignWallet)).length, historical.length); console.log('legacyServiceProviderFixture', 'PASS (no chain mutation)'); }
  finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Failed'); process.exitCode = 1; });
