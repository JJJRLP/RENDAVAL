/** Fixed demonstration references, never live exchange quotes. OTHER is not an ISO code. */
export const countries = [
  { code: 'MX', name: 'México', currency: 'MXN', symbol: '$', perUsd: 20 },
  { code: 'BR', name: 'Brasil', currency: 'BRL', symbol: 'R$', perUsd: 5 },
  { code: 'BO', name: 'Bolivia', currency: 'BOB', symbol: 'Bs', perUsd: 6.96 },
  { code: 'AR', name: 'Argentina', currency: 'ARS', symbol: '$', perUsd: 1200 },
  { code: 'CL', name: 'Chile', currency: 'CLP', symbol: '$', perUsd: 950 },
  { code: 'CO', name: 'Colombia', currency: 'COP', symbol: '$', perUsd: 4000 },
  { code: 'PE', name: 'Perú', currency: 'PEN', symbol: 'S/', perUsd: 3.75 },
  { code: 'OTHER', name: 'Otro país', currency: 'USD', symbol: '$', perUsd: 1 },
] as const;
export type CountryCode = typeof countries[number]['code'];
/** First market: Mexico (tokenized CETES live on Stellar), then Brazil. */
export const DEFAULT_COUNTRY: CountryCode = 'MX';
/** Records written before countries existed were all Bolivian; keep reading them as such. */
export const LEGACY_COUNTRY: CountryCode = 'BO';
export const countryFor = (code: unknown) => countries.find(c => c.code === code);
export const currencyFor = (code: unknown) => countries.find(c => c.currency === code);
