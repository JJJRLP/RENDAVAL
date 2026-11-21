import 'server-only';
import { ApiError } from '../env';

// 6 + 56 bytes: unambiguous contract id, within Stellar's 64-byte name limit.
export const priceKey = (contractId: string) => `price:${contractId}`;
export function readPrice(data: Record<string, string>, contractId: string) {
  const encoded = data[priceKey(contractId)];
  if (encoded === undefined) return 1;
  const value = Buffer.from(encoded, 'base64').toString('utf8');
  if (!/^1:(?:0\.[0-9]{1,7}|1(?:\.0{1,7})?)$/.test(value))
    throw new ApiError(502, 'No pudimos validar el precio de su garantía.');
  const price = Number(value.slice(2));
  if (price <= 0) throw new ApiError(502, 'No pudimos validar el precio de su garantía.');
  return price;
}
