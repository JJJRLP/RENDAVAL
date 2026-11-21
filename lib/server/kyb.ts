import 'server-only';
import { attest, readAttestation } from './attestation';
import { decision } from './didit';
export async function status(wallet: string, id?: string, write = false) {
  const existing = await readAttestation(wallet);
  if (existing) return { status: 'verified', ...existing };
  if (!id) return { status: 'none' };
  const result = await decision(wallet, id);
  if (result.status === 'Approved' && write) return { status: 'verified', ...await attest(wallet, id, result.country) };
  const state = result.status === 'In Review' ? 'review' : ['Declined', 'Expired', 'Abandoned', 'Kyc Expired'].includes(result.status) ? 'rejected' : 'in_progress';
  return { status: 'pending', country: result.country, state, decisionStatus: result.status };
}
