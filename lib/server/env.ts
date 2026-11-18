import 'server-only';
import { Keypair } from '@stellar/stellar-sdk';
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new ApiError(503, `Falta configurar ${name} en el servidor.`);
  return value;
}
export function pollarEnv() {
  const secret = required('POLLAR_SECRET_KEY');
  if (!secret.startsWith('sec_testnet_') || !required('NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY').startsWith('pub_testnet_'))
    throw new ApiError(503, 'Pollar debe usar claves de testnet.');
  return secret;
}
export function diditEnv() {
  const key = required('DIDIT_API_KEY');
  if (!key.startsWith('sk_test_')) throw new ApiError(503, 'Didit debe usar una clave sandbox sk_test_.');
  return { key, workflow: required('DIDIT_KYB_WORKFLOW_ID') };
}
export function vaultKey() {
  try { return Keypair.fromSecret(required('VAULT_SECRET_KEY')); }
  catch { throw new ApiError(503, 'Configure VAULT_SECRET_KEY con una clave Stellar válida y fondos en testnet.'); }
}
