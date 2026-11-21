# Rendaval

Préstamos en dólares digitales (USDC) para empresas, con Bolivia como primer
mercado, respaldados por bonos tokenizados. MVP de hackathon sobre **Stellar
testnet**: activos sin valor real, custodia/tokenización simuladas y proveedores
sandbox. Next.js 16, React 19, Pollar, Didit y Trustless Work.

El servidor B1 utiliza los contratos C4. La landing y las pantallas
completas se adaptan en B2; el registro/preparación antiguos quedan deshabilitados
con un aviso. [Interfaz de contratos](contracts/INTERFAZ.md),
[API y recorrido del servidor](docs/notas-tecnicas.md).

## Arquitectura

```
Navegador /app
  Pollar: sesión, trustlines USDC/RBOND, firmas de depósito, open, repay y claim
  Certificado del depositario: SHA-256 local; el archivo nunca sale del navegador
       ↓
Next.js /api/kyb/* y /api/loan/*
  Pollar Server API → identidad de empresa (no dirección enviada por cliente)
  Didit sandbox → verificación; constancias KYB existentes preservadas
  Registro Soroban → declaraciones, revisión, índice por empresa y outbox
  Stellar account data → constancias KYB
  Reglas RBOND → aprobación de tenedores; impide revocar garantía prendada
  Libro C4 → series, precio, deuda, salud, margen, default, repay y liquidación
  Bóveda por préstamo → bonos; custodia auxiliar para entrega bloqueada
  Trustless Work API → USDC del lender, release neto a la bóveda
```

Sin base de datos. Un índice durable por empresa permite leer sus ids de préstamo
sin recorrer los préstamos del sistema ni depender de retención de eventos RPC.
Las declaraciones pendientes y su hash de certificado viven en el registro Soroban. Aprobación explícita de demo autoriza a la empresa, registra una serie,
publica su precio y emite RBOND. Un outbox Stellar conserva la operación antes de
su envío para recuperar respuestas perdidas sin pagos duplicados.

La empresa firma depósito y apertura por separado. `open` protege bonos, registra
la deuda y entrega USDC netos atómicamente. Debe principal bruto más interés;
la comisión TW (0,3 %) se muestra por separado. `repay` devuelve todos los bonos
en la misma transacción. `liquidate` cobra al comprador autorizado y le entrega
los bonos atómicamente: lender primero, excedente a empresa, faltante como pérdida.
Los créditos no entregados se reclaman mediante `claim`.

Todas las rutas autentican Pollar, requieren KYB y comprueban pertenencia. Las
firmas se validan contra el XDR interior exacto preparado, incluyendo los árboles
Soroban. Se acepta fee bump exterior. Operador, emisor y lender firman solo en
servidor con claves de prueba.

| Contrato testnet | Dirección |
| --- | --- |
| Libro | [CB6V…SSKN](https://stellar.expert/explorer/testnet/contract/CB6VYHQXCB3EKR4Q43LNDH7Y6GZXURIUBTOCHBWPCNSACANPHKSMSSKN) |
| Registro app | [CAR5…AGGB](https://stellar.expert/explorer/testnet/contract/CAR55ERAQUCHESSOEW2UUWYAUC3PVK7LIV7MIP6IIWRNM7AV3TYVAGGB) |
| Reglas RBOND | [CCLL…HUKC](https://stellar.expert/explorer/testnet/contract/CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC) |
| RBOND SAC | [CDMV…EGC3](https://stellar.expert/explorer/testnet/contract/CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3) |
| USDC SAC | [CBIE…DAMA](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |

## Puesta en marcha

Node.js 20.9 o superior. `npm install`, copie `.env.example` a `.env.local`, complete
sus valores de testnet y ejecute `npm run dev`. Abra `/app`.

| Variable existente | Uso |
| --- | --- |
| NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY | Pollar navegador, pub_testnet_… |
| NEXT_PUBLIC_VBOND_ISSUER | Emisor **RBOND** GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6; nombre conservado |
| POLLAR_SECRET_KEY | Verificación de sesión, sec_testnet_… |
| DIDIT_API_KEY | Sandbox sk_test_… |
| DIDIT_KYB_WORKFLOW_ID | Flujo KYB |
| TRUSTLESS_WORK_API_KEY | API dev de TW |
| VAULT_SECRET_KEY | Operador Rendaval, attestations e índice |
| LENDER_SECRET_KEY | Prestamista/comprador de demo |
| BOND_ISSUER_SECRET_KEY | Emisor RBOND, revisión y precios |

Pollar dashboard: configurar origen, login, patrocinio de trustlines y activos
USDC y RBOND. Las cuentas del servidor necesitan XLM para comisiones y renta del
registro Soroban y reservas de constancias KYB. Lender necesita USDC testnet. No se usan variables NEW_* ni OLD_*.
Vercel utiliza las mismas variables; no hay configuración adicional ni base de datos.

## Comandos y evidencia

- `npm run lint`, `npx tsc --noEmit`, `npx next build`.
- `scripts/verify-b1.ts`: recorrido real por servicios del servidor, dos préstamos,
  margen/recuperación, repay y default/cura/ejecución/claim; presupuesto bruto <400 USDC.
- `scripts/verify-b1-authorization.ts`: rutas, pertenencia y firmas manipuladas.
- `scripts/verify-kyb.ts`: Didit sandbox y constancia Stellar.
- `scripts/fund-lender.ts`: recarga testnet del lender; no es parte de la prueba B1.
- `scripts/c4-verify.mjs`: verificador de evidencia de contratos C4, solo lectura.

Scripts TypeScript: `node --env-file=.env.local --conditions=react-server --import tsx
scripts/<nombre>.ts`. Hashes y resultados en `scripts/evidence/`. Las pruebas omiten
login y firma interactivos de Pollar; [notas técnicas](docs/notas-tecnicas.md) detallan
las diferencias posibles. Los scripts anteriores de préstamos web fueron eliminados.

## Límites de demostración

Garantía USD 100–400, hasta tres préstamos pendientes/vivos por empresa. Precio
inicial USD 1 por RBOND, actualizaciones hasta 25 % cada 30 segundos; precio fresco
hasta 86400 segundos. Margen 70 %, default 85 %, cura 60 segundos. Plazo 30 días,
interés anual 8 % base 360. Un adelanto de prueba cubre interés más fee una vez por
préstamo. Los tipos de cambio locales son referencias fijas de demostración.

No es un producto auditado ni apto para dinero real. El certificado se declara por
hash; su revisión es una simulación explícita. Cada entrada del registro tiene tamaño máximo, pero el índice usa slots independientes
sin vector creciente ni reservas clásicas. TTL requiere transacciones de mantenimiento
y restauración si se deja archivar. [Informe C4](contracts/C4-REPORT.md).
UI B2, liquidadores externos y operación comercial quedan fuera de esta fase.
