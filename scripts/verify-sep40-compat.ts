// Read-only compatibility check. It submits no transaction and needs no .env.local.
// node --import tsx scripts/verify-sep40-compat.ts
import { readSep40Price } from '../lib/stellar/sep40';

const REFLECTOR_TESTNET = 'CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63';
const RENDAVAL_BOOK = 'CB6VYHQXCB3EKR4Q43LNDH7Y6GZXURIUBTOCHBWPCNSACANPHKSMSSKN';
const RENDAVAL_SERIES = 'Bb66c8c845a6cce853b0ce3061c8d3d';

async function main() {
  const [reflector, rendaval] = await Promise.all([
    readSep40Price(REFLECTOR_TESTNET, 'BTC'),
    readSep40Price(RENDAVAL_BOOK, RENDAVAL_SERIES),
  ]);
  if (!(reflector.price > 0) || !(rendaval.price > 0)) throw new Error('El lector devolvió un precio no positivo.');
  console.log('Reflector testnet · BTC:', reflector);
  console.log('Libro Rendaval · serie de prueba:', rendaval);
  console.log('Compatibilidad SEP-40 comprobada: ambos contratos se leyeron con el mismo lector.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
