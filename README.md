# Rendaval

Préstamos en dólares digitales (USDC) para empresas de cualquier país, con Bolivia como primer mercado y país predeterminado, respaldados por sus bonos tokenizados. La empresa deja sus bonos en garantía en un escrow sobre Stellar, recibe USDC y recupera los bonos al devolver el préstamo. Los bonos siguen siendo suyos durante todo el plazo.

> **Estado:** MVP de hackathon sobre la **red de pruebas de Stellar**. Los bonos y los dólares no tienen valor real, la tokenización del bono es simulada (no hay custodio) y los servicios externos se usan en modo sandbox.

La fase C2 del reinicio con **RBOND** entrega el libro y las reglas de garantía
protegida; [contratos/README](contracts/README.md) y [la interfaz](contracts/INTERFAZ.md)
son la referencia para la próxima integración web. El recorrido de la aplicación
que se describe abajo todavía usa el flujo anterior de VBOND. No usar su clave
emisora para el nuevo activo: C2 usa `NEW_BOND_ISSUER_SECRET_KEY`.

## Qué incluye

| Ruta | Contenido |
| --- | --- |
| `/` | Landing del producto, con simulador de préstamo. |
| `/app` | Aplicación: acceso, verificación de empresa, registro del bono, oferta, garantía, desembolso y reembolso. |

## Recorrido de la empresa

1. **Acceso.** Ingresa con correo o Google. Se crea su cuenta en Stellar sin instalar nada (Pollar).
2. **Verificación.** Confirma la identidad legal de la empresa (Didit), tras elegir su país; Bolivia aparece preseleccionada y «Otro país» permite continuar en USD. La aprobación queda registrada en Stellar como constancia pública.
3. **Registro del bono.** Declara su bono en la moneda local o en USD, con un equivalente de USD 100–400 según referencias de demostración. Rendaval emite los bonos digitales equivalentes a su valor en dólares (paso simulado).
4. **Oferta.** Rendaval fija las condiciones: 50 % del valor de la garantía, 8 % anual, 30 días. La empresa solo acepta.
5. **Garantía y desembolso.** La empresa firma el depósito de los bonos en un escrow (Trustless Work) y el prestamista envía los USDC.
6. **Reembolso.** La empresa devuelve capital más interés con una firma; el prestamista aprueba y Rendaval libera la garantía.

## Incumplimiento

El diseño tiene un único mecanismo, y es el mismo que describen la landing y la aplicación:

1. **Cuándo.** La empresa no paga capital e interés al vencimiento, o la deuda supera el 85 % del valor de la garantía y no la repone. Desde el 70 % se le pide añadir garantía o reducir el saldo.
2. **Ejecución.** Los bonos se transfieren a un comprador autorizado por el emisor, que paga en USDC. El prestamista puede ser ese comprador si el emisor lo autoriza.
3. **Reparto.** Con ese pago se cubren capital e interés del prestamista; el remanente vuelve a la empresa. Si no alcanza, la diferencia es una pérdida del prestamista: no hay póliza de seguro.

**Qué hace hoy el prototipo.** El préstamo en disputa se congela y la aplicación lo muestra «en revisión»; una garantía ya resuelta aparece como «ejecutada». Cada préstamo activo permite simular su precio en testnet (100 %, 80 %, 65 % o 50 % del valor inicial). Rendaval publica el precio por contrato en Stellar y la salud usa capital más interés sobre el valor actual: desde el 70 % abre un aviso de margen que pide devolver el préstamo; desde el 85 % avisa que la garantía puede ejecutarse. El oráculo de producción, el aporte de garantía adicional y la ejecución/venta al comprador autorizado quedan para una fase posterior. Los porcentajes son de ejemplo.
## Verifíquelo en Stellar

Todo lo que hace la aplicación queda en la red de pruebas de Stellar y se puede revisar sin instalar nada. Los enlaces abren el explorador [stellar.expert](https://stellar.expert/explorer/testnet).

**Cuentas y activos**

| Qué | Identificador |
| --- | --- |
| Rendaval: crea los escrows y guarda las constancias de verificación | [`GABI…TXW5`](https://stellar.expert/explorer/testnet/account/GABIK4IHUCZJIO7GJ35ZTBMAPIJI2M2FPG5Q5K44VTBRLSLJZXDYTXW5) |
| Emisor del bono digital `VBOND` | [`GDR5…YOXT`](https://stellar.expert/explorer/testnet/account/GDR5F6YS4U3H2GD7HVEE32DM6ELHBVSMAMVZBP2GMGMRXYARYWSCYOXT) |
| Contrato del activo `VBOND` (Stellar Asset Contract) | [`CDMT…4TAL`](https://stellar.expert/explorer/testnet/contract/CDMT46AH26WLTMVTWR57HL5KJIICB2F2SEWUXYY4YJRIOVXE3NQU4TAL) |
| Prestamista de demostración | [`GBCS…GXZ7`](https://stellar.expert/explorer/testnet/account/GBCS4OTV3GGP33J6J4HC77WQUCS2DGP2BP32IXGDPAWZ6W4FIKVOGXZ7) |

**Un préstamo completo, paso a paso** (empresa de prueba [`GAPU…TMLL`](https://stellar.expert/explorer/testnet/account/GAPUFWCFTYQIHZPMV4MCZ54PNQRJRJLMQ2XQZRP4PTLOFIRHTEDMTMLL), 18 de noviembre de 2026)

| Paso | Qué ocurre en la red | Transacción o contrato |
| --- | --- | --- |
| Verificación | Entrada de datos `kyb:<cuenta>` en la cuenta de Rendaval | [Datos de la cuenta](https://stellar.expert/explorer/testnet/account/GABIK4IHUCZJIO7GJ35ZTBMAPIJI2M2FPG5Q5K44VTBRLSLJZXDYTXW5?filter=data) |
| Registro del bono | El emisor entrega 200 `VBOND`, con el hash de los datos del bono en el memo | [`48db7273…`](https://stellar.expert/explorer/testnet/tx/48db72731705857ae6a893fedd6177ec19f3ecde4073d894acbf46bd45080e8a) |
| Escrow | Contrato Soroban de Trustless Work creado para este préstamo | [`CAIZ…6UIU`](https://stellar.expert/explorer/testnet/contract/CAIZXBP4BIMGIYU76SWSAFHYQLCWF35XX7P3W47AVF2HJ7SHTNQM6UIU) |
| Garantía | La empresa deposita los 200 `VBOND` en el escrow | [`58d18110…`](https://stellar.expert/explorer/testnet/tx/58d181102bfb719fc1b6dcd21b0bf33a5f5b0c2ef68f715e68c1a1f6f8e971b3) |
| Desembolso | El prestamista envía 100 USDC y deja el marcador del préstamo en la misma transacción | [`bd85ffae…`](https://stellar.expert/explorer/testnet/tx/bd85ffaeab1018b97569ef8cef2e1fa8905f07131d97bea959237b382408ec91) |
| Reembolso | La empresa paga 100,6666667 USDC con el memo propio del préstamo | [`652b6fed…`](https://stellar.expert/explorer/testnet/tx/652b6fed67f62205e4806c17fd52742ff14804b6cae89c38a2ace4402927a05f) |

La devolución de los bonos de este préstamo sigue pendiente por la limitación descrita en [Limitaciones conocidas](#limitaciones-conocidas). Un préstamo congelado por disputa puede verse en el contrato [`CBCI…A5AE`](https://stellar.expert/explorer/testnet/contract/CBCIAOMI32WMA3CYS6NSMBIGWH3E3DDRFQC3A3GNJQA36QTIXDWRA5AE).

## Arquitectura

```
Navegador (Next.js, /app)
  │  Pollar SDK: sesión, cuenta Stellar y firma de transacciones
  ▼
Rutas del servidor (Next.js, /api/kyb/* y /api/loan/*)
  ├─ Pollar Server API ── valida la sesión y obtiene la cuenta de la empresa
  ├─ Didit ───────────── sesión de verificación de empresa y su resultado
  ├─ Trustless Work ──── escrow de la garantía (contrato Soroban por préstamo)
  └─ Stellar testnet ─── saldos, pagos y constancias (Horizon)
```

- **Sin base de datos.** Todo el estado se lee de la red y de los proveedores, así que el despliegue solo necesita variables de entorno:
  - Empresa verificada: entrada de datos `kyb:<cuenta>` en la cuenta de Rendaval, con sesión y país. Las constancias antiguas corresponden a Bolivia.
  - Bono registrado: saldo del activo `VBOND` de la empresa (1 VBOND = 1 USD de garantía).
  - Préstamo: escrow de Trustless Work asociado a la empresa.
  - Desembolso: pago en USDC y marcador escritos en una misma transacción del prestamista, para que no pueda pagarse dos veces.
  - Reembolso: pago de la empresa al prestamista, identificado por un memo propio del préstamo.
- **Quién firma qué.** La empresa firma en el navegador el depósito de la garantía y el pago del reembolso. Rendaval, el prestamista de demostración y el emisor del bono firman en el servidor con cuentas de prueba.
- **Autorización.** Cada ruta valida el token de Pollar y usa únicamente la cuenta que devuelve ese servicio, nunca una enviada por el navegador. Las rutas de préstamo exigen además una empresa verificada.

Más detalle en [`docs/notas-tecnicas.md`](docs/notas-tecnicas.md).

El [libro de préstamos propio, fase A3](contracts/README.md), está desplegado y
probado por separado en testnet. Usa precios por serie y registros independientes
de préstamos. La aplicación todavía debe integrar su [nueva interfaz](contracts/INTERFAZ.md)
y un índice durable de eventos; el flujo del navegador descrito arriba no ha cambiado.

## Tecnologías

- [Next.js 16](https://nextjs.org) (App Router), React 19, Tailwind CSS 4, TypeScript.
- [Stellar](https://stellar.org) testnet: activos clásicos, Horizon y Soroban.
- [Pollar](https://docs.pollar.xyz): acceso, cuentas y firma.
- [Didit](https://docs.didit.me): verificación de empresas (KYB).
- [Trustless Work](https://docs.trustlesswork.com): escrow de la garantía.

## Puesta en marcha

Requisitos: Node.js 20.9 o superior y cuentas de prueba en Pollar, Didit y Trustless Work.

```sh
npm install
cp .env.example .env.local   # complete los valores
npm run dev
```

Abra `http://localhost:3000/app`.

### Variables de entorno

| Variable | Dónde se usa | Descripción |
| --- | --- | --- |
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | Navegador | Clave pública de Pollar (`pub_testnet_…`). |
| `NEXT_PUBLIC_VBOND_ISSUER` | Navegador y servidor | Cuenta pública que emite los bonos digitales `VBOND`. |
| `POLLAR_SECRET_KEY` | Servidor | Clave secreta de Pollar (`sec_testnet_…`) para validar sesiones. |
| `DIDIT_API_KEY` | Servidor | Clave sandbox de Didit (`sk_test_…`). |
| `DIDIT_KYB_WORKFLOW_ID` | Servidor | Flujo de verificación de empresas configurado en Didit. |
| `TRUSTLESS_WORK_API_KEY` | Servidor | Clave de la API de Trustless Work (testnet). |
| `VAULT_SECRET_KEY` | Servidor | Cuenta de Rendaval en testnet: crea los escrows, libera la garantía y registra las constancias. |
| `LENDER_SECRET_KEY` | Servidor | Cuenta del prestamista de demostración, con USDC de prueba. |
| `BOND_ISSUER_SECRET_KEY` | Servidor | Cuenta emisora de `VBOND`; debe corresponder a `NEXT_PUBLIC_VBOND_ISSUER`. |

La aplicación rechaza claves que no sean de prueba. Ninguna clave secreta llega al navegador.

### Configuración en los proveedores

- **Pollar** (dashboard): agregue el origen de la aplicación (`http://localhost:3000` y el dominio de producción) en *Developers → Websites*; habilite acceso con correo y Google; active el patrocinio de trustlines; agregue los activos USDC y VBOND; defina un saldo inicial de XLM para las cuentas nuevas (2 XLM alcanza para las comisiones del recorrido).
- **Didit** (consola): cree un flujo de verificación de empresas y copie su identificador.
- **Stellar testnet:** las cuentas de Rendaval, prestamista y emisor deben existir y tener XLM. Rendaval y el prestamista necesitan trustlines de USDC y VBOND. El contrato del activo `VBOND` debe estar desplegado una vez.

### Fondos de prueba del prestamista

El prestamista paga los desembolsos con su saldo de USDC de testnet. Para recargarlo comprando USDC con XLM en el mercado de testnet (2.500 USDC por ejecución):

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/fund-lender.ts
```

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` y `npm run start` | Compilación y servidor de producción. |
| `npm run lint` | Análisis estático. |
| `scripts/verify-kyb.ts` | Prueba real de la verificación contra Didit sandbox y testnet. |
| `scripts/verify-loan.ts` | Prueba real de tres préstamos independientes en testnet con una empresa nueva. |
| `scripts/clean-journal.ts` | Limpia entradas temporales de despliegue en la cuenta emisora. |

Los scripts se ejecutan con `node --env-file=.env.local --conditions=react-server --import tsx <script>` y operan sobre la red de pruebas: crean cuentas y transacciones reales de testnet.

## Despliegue

La aplicación se despliega en [Vercel](https://vercel.com) sin configuración adicional: defina las variables de entorno de la tabla en el proyecto y agregue el dominio resultante en el dashboard de Pollar.

## Estructura

```
app/                  Landing (/), aplicación (/app) y rutas del servidor (/api)
components/           Secciones de la landing
components/app/       Pantallas de la aplicación
lib/stellar/          Lectura de saldos y activos (navegador)
lib/loan/             Condiciones del préstamo compartidas
lib/server/           Integraciones del servidor: Pollar, Didit, Trustless Work, Stellar
scripts/              Pruebas reales en testnet y utilidades; scripts/evidence guarda sus resultados
docs/                 Notas técnicas
```

## Limitaciones conocidas

- **Devolución de la garantía.** La liberación del escrow por la API de Trustless Work falla hoy para activos que no son stablecoins, porque su cuenta de comisiones no tiene trustline del bono. La aplicación registra el pago, muestra la devolución «en proceso» y permite comprobarla desde cada préstamo; se completará sin cambios de código cuando el proveedor agregue la trustline.
- **Montos de prueba.** La garantía admite entre USD 100 y USD 400 (préstamo de hasta 200 USDC), por el tamaño de la tesorería de demostración.
- **Simulaciones.** La tokenización del bono, los tipos de cambio de referencia fijos por país (de demostración, no cotizaciones en tiempo real) y el prestamista único son de demostración. La verificación ofrece una aprobación de prueba además del flujo real.
- **Hasta 3 préstamos abiertos por empresa** (activos o pagados con bonos pendientes de devolución), y un solo prestamista. Puede registrar otro bono cuando no hay bonos disponibles ni un préstamo en preparación; cada préstamo se devuelve por separado.
- **Comisiones de red.** Las firmas de la empresa sobre el escrow pagan su comisión en XLM desde su cuenta; no se patrocinan.
- **No apto para producción.** No hay auditoría de contratos, gestión de llaves ni cumplimiento regulatorio.
