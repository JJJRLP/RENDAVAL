import { Account, Address, Contract, Keypair, Networks, TransactionBuilder, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');

/** SEP-40 Asset: Stellar(Address) for an address, Other(Symbol) for a series or ticker. */
export function sep40Asset(asset: string) {
  return /^[CG][A-Z2-7]{55}$/.test(asset)
    ? xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Stellar'), new Address(asset).toScVal()])
    : xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Other'), xdr.ScVal.scvSymbol(asset)]);
}

async function read(contractId: string, method: string, args: xdr.ScVal[] = []) {
  const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), '0'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(30).build();
  const simulation = await rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) throw new Error(`No se pudo leer ${method} en ${contractId}.`);
  return scValToNative(simulation.result.retval);
}

export type Sep40Price = { price: number; decimals: number; resolution: number; updatedAt: string };

/** Read the latest price from any SEP-40-compatible contract. Never signs or submits. */
export async function readSep40Price(contractId: string, asset: string): Promise<Sep40Price> {
  const [decimals, resolution, quote] = await Promise.all([
    read(contractId, 'decimals') as Promise<number>,
    read(contractId, 'resolution') as Promise<number>,
    read(contractId, 'lastprice', [sep40Asset(asset)]) as Promise<{ price: bigint; timestamp: bigint } | undefined>,
  ]);
  if (!quote) throw new Error(`No hay precio SEP-40 para ${asset}.`);
  return { price: Number(quote.price) / 10 ** decimals, decimals, resolution, updatedAt: new Date(Number(quote.timestamp) * 1000).toISOString() };
}
