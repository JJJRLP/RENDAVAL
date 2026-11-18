# Vault

Préstamos en dólares digitales (USDC) para empresas bolivianas, respaldados por sus bonos tokenizados. La empresa deja sus bonos en garantía en un escrow sobre Stellar, recibe USDC y recupera los bonos al devolver el préstamo. Los bonos siguen siendo suyos durante todo el plazo.

> **Estado:** MVP de hackathon sobre la **red de pruebas de Stellar**. Los bonos y los dólares no tienen valor real, la tokenización del bono es simulada (no hay custodio) y los servicios externos se usan en modo sandbox.

## Qué incluye

| Ruta | Contenido |
| --- | --- |
| `/` | Landing del producto, con simulador de préstamo. |
| `/app` | Aplicación: acceso, verificación de empresa, registro del bono, oferta, garantía, desembolso y reembolso. |

## Recorrido de la empresa

1. **Acceso.** Ingresa con correo o Google. Se crea su cuenta en Stellar sin instalar nada (Pollar).
2. **Verificación.** Confirma la identidad legal de la empresa (Didit, flujo para Bolivia). La aprobación queda registrada en Stellar como constancia pública.
3. **Registro del bono.** Declara su bono en bolivianos. Vault emite los bonos digitales equivalentes a su valor en dólares (paso simulado).
4. **Oferta.** Vault fija las condiciones: 50 % del valor de la garantía, 8 % anual, 30 días. La empresa solo acepta.
5. **Garantía y desembolso.** La empresa firma el depósito de los bonos en un escrow (Trustless Work) y el prestamista envía los USDC.
6. **Reembolso.** La empresa devuelve capital más interés con una firma; el prestamista aprueba y Vault libera la garantía.

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
  - Empresa verificada: entrada de datos `kyb:<cuenta>` en la cuenta de Vault.
  - Bono registrado: saldo del activo `VBOND` de la empresa (1 VBOND = 1 USD de garantía).
  - Préstamo: escrow de Trustless Work asociado a la empresa.
  - Desembolso: pago en USDC y marcador escritos en una misma transacción del prestamista, para que no pueda pagarse dos veces.
  - Reembolso: pago de la empresa al prestamista, identificado por un memo propio del préstamo.
- **Quién firma qué.** La empresa firma en el navegador el depósito de la garantía y el pago del reembolso. Vault, el prestamista de demostración y el emisor del bono firman en el servidor con cuentas de prueba.
- **Autorización.** Cada ruta valida el token de Pollar y usa únicamente la cuenta que devuelve ese servicio, nunca una enviada por el navegador. Las rutas de préstamo exigen además una empresa verificada.

Más detalle en [`docs/notas-tecnicas.md`](docs/notas-tecnicas.md).

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
| `VAULT_SECRET_KEY` | Servidor | Cuenta de Vault en testnet: crea los escrows, libera la garantía y registra las constancias. |
| `LENDER_SECRET_KEY` | Servidor | Cuenta del prestamista de demostración, con USDC de prueba. |
| `BOND_ISSUER_SECRET_KEY` | Servidor | Cuenta emisora de `VBOND`; debe corresponder a `NEXT_PUBLIC_VBOND_ISSUER`. |

La aplicación rechaza claves que no sean de prueba. Ninguna clave secreta llega al navegador.

### Configuración en los proveedores

- **Pollar** (dashboard): agregue el origen de la aplicación (`http://localhost:3000` y el dominio de producción) en *Developers → Websites*; habilite acceso con correo y Google; active el patrocinio de trustlines; agregue los activos USDC y VBOND; defina un saldo inicial de XLM para las cuentas nuevas (2 XLM alcanza para las comisiones del recorrido).
- **Didit** (consola): cree un flujo de verificación de empresas y copie su identificador.
- **Stellar testnet:** las cuentas de Vault, prestamista y emisor deben existir y tener XLM. Vault y el prestamista necesitan trustlines de USDC y VBOND. El contrato del activo `VBOND` debe estar desplegado una vez.

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
| `scripts/verify-loan.ts` | Prueba real del préstamo completo en testnet con una empresa nueva. |
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

- **Devolución de la garantía.** La liberación del escrow por la API de Trustless Work falla hoy para activos que no son stablecoins, porque su cuenta de comisiones no tiene trustline del bono. La aplicación registra el pago, muestra la devolución «en proceso» y la reintenta sola; se completará sin cambios de código cuando el proveedor agregue la trustline.
- **Montos de prueba.** La garantía admite entre USD 100 y USD 400 (préstamo de hasta 200 USDC), por el tamaño de la tesorería de demostración.
- **Simulaciones.** La tokenización del bono, el tipo de cambio (Bs 6,96 por USD) y el prestamista único son de demostración. La verificación ofrece una aprobación de prueba además del flujo real.
- **Un préstamo activo por empresa**, y un solo prestamista.
- **Comisiones de red.** Las firmas de la empresa sobre el escrow pagan su comisión en XLM desde su cuenta; no se patrocinan.
- **No apto para producción.** No hay auditoría de contratos, gestión de llaves ni cumplimiento regulatorio.
