# Vault

Liquidez en USDC sobre activos tokenizados en Stellar testnet.

## Desarrollo local

Instale las dependencias con `npm install`. Copie `.env.example` a `.env.local` y complete:

- `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY`: clave pública de testnet de Pollar. El acceso rechaza claves que no comiencen por `pub_testnet_`.
- `NEXT_PUBLIC_VBOND_ISSUER`: dirección pública del emisor de VBOND en testnet.
- `POLLAR_SECRET_KEY`: clave secreta `sec_testnet_` para validar el token de acceso en cada ruta del servidor. Nunca se expone al navegador.
- `DIDIT_API_KEY`: clave sandbox `sk_test_` de Didit; las claves de producción se rechazan.
- `DIDIT_KYB_WORKFLOW_ID`: identificador del workflow de verificación de empresas. Configure la cobertura de Bolivia en la consola; enviamos `expected_details.registry_country: "BO"`.
- `VAULT_SECRET_KEY`: clave secreta Stellar de la cuenta de plataforma Vault, financiada en testnet para comisiones y reservas de entradas de datos.

Los préstamos requieren `LENDER_SECRET_KEY`, `BOND_ISSUER_SECRET_KEY` y `TRUSTLESS_WORK_API_KEY` solo en el servidor. Configure las mismas variables en Vercel; no se usa base de datos ni almacenamiento en disco.

Ejecute `npm run dev -- --port 3017` y abra `http://localhost:3017/app`. El origen `http://localhost:3017` debe estar en los orígenes permitidos del dashboard de Pollar (y en las URI de redirección si se solicita). Si el puerto está ocupado, elija otro puerto libre y registre también ese origen.

En Pollar, habilite correo y Google, billeteras clásicas con creación inmediata, el patrocinio de trustlines y los activos USDC y VBOND. El panel consulta Horizon testnet y solicita solamente las autorizaciones faltantes. Las solicitudes pendientes se consultan de nuevo sin reenviarlas durante la sesión de la página.

La landing permanece en `/`. La ruta `/app` contiene el acceso, los saldos y la verificación de empresa. El flujo de préstamo incluye registro, garantía, desembolso, reembolso y devolución de bonos.

El servidor verifica el token de Pollar y usa exclusivamente la dirección devuelta por ese servicio. Una sesión de Didit debe corresponder a esa dirección y al workflow configurado. Al aprobarse, Vault firma en Stellar testnet una entrada `manageData` con nombre `kyb:<dirección de empresa>` y valor igual al identificador de sesión. Las consultas posteriores leen esa constancia pública; no incluye documentos ni datos de la empresa. Cada nueva entrada requiere reserva de XLM. La constancia no almacena fecha.

El navegador conserva únicamente el identificador y enlace de la sesión pendiente por cuenta. Al volver de la verificación, consulta automáticamente hasta cinco veces con esperas de 2, 4, 8 y 16 segundos. Después ofrece una comprobación manual. Si se borra el almacenamiento antes de aprobar, será necesario iniciar otra sesión. La aprobación de prueba solo funciona con configuración sandbox y requiere autenticación y pertenencia de la sesión.

Prueba real (crea una sesión sandbox y una entrada permanente en testnet para una dirección aleatoria):

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-kyb.ts
```

El script importa los mismos helpers del servidor y solo omite el acceso interactivo de Pollar. No guarda claves ni estado en disco. Las pruebas de producción deben usar un puerto libre y detener el proceso al terminar.

Referencias de contrato: [crear sesión](https://docs.didit.me/sessions-api/create-session), [sandbox y simulate](https://docs.didit.me/integration/sandbox-testing). La creación no devuelve `session_kind`; se valida `business` al consultar la decisión. El escenario simulado no sustituye una prueba humana del flujo alojado ni confirma la cobertura efectiva de Bolivia del workflow.

Validación: `npm run lint` y `npm run build`. Para probar producción en otro puerto: `npm run start -- --port 3017`.


## Préstamos de prueba — fase 4

Garantía admitida: USD 100–400; préstamo: 50 %, hasta 200 USDC. El ejemplo
es Bs 2.784 (USD 400). Capital, interés a 30 días y total se redondean a siete
decimales con `usdcAmount`; el pago y la oferta usan los mismos importes.

Cada ruta `/api/loan/*` autentica el token de Pollar y exige una empresa
verificada. Se usan Horizon y Trustless Work de testnet, sin base de datos,
disco persistente ni configuración adicional para Vercel. Vault es el
`serviceProvider`; la empresa es `receiver` y firma el depósito y, más tarde,
un solo pago de reembolso. El prestamista aprueba y Vault libera la garantía.
La búsqueda acepta únicamente el identificador `vault-loan-<wallet>` histórico
o `vault-loan-<wallet>:<timestamp>`, con los roles y el activo esperados.
Los préstamos antiguos conservan sus condiciones y roles originales; el cambio
de rol se aplica exclusivamente a nuevos contratos.

`POST /api/loan/repay/topup` cubre una sola vez el faltante de interés de prueba
(hasta interés + 0,01 USDC), mediante pago y marcador atómicos en el prestamista.
`repay/build` prepara el pago exacto con memo hash por contrato; `repay/submit`
valida la firma testnet y la operación. El estado reconoce el reembolso leyendo
transacciones exitosas en Horizon. `settle` marca, aprueba y libera, omitiendo
pasos ya confirmados en cadena. La respuesta conocida de Trustless Work
“Escrow already in dispute” en `release-funds` se devuelve como HTTP 200,
`release_pending`; se muestra solo en detalles técnicos. El pago queda recibido
y los bonos protegidos, con reintento al entrar y botón “Volver a intentar”.
No se invoca el contrato con otra dirección de comisiones.

Al liberar se muestra el saldo efectivamente devuelto (el proveedor puede cobrar
su comisión en bonos). “Solicitar un nuevo préstamo” abre una nueva oferta sobre
ese saldo; al aceptarla se crea otro identificador. La pantalla de cierre persiste
al recargar hasta que se solicite otro préstamo.

El diario de despliegue conserva el XDR firmado para serializar aceptaciones
paralelas. Sus entradas se eliminan al observar el contrato activo en cadena;
la ausencia del diario no impide consultar el préstamo. Para limpiar entradas
históricas, sin despliegues en curso:

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/clean-journal.ts
```

Prueba integral (crea una empresa fresca, deposita 400 bonos, recibe y devuelve
200 USDC más el interés subvencionado; la tesorería termina con el mismo USDC):

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-loan.ts
```

Los marcadores de desembolso/ayuda y las constancias KYB permanecen como entradas
por préstamo/empresa. El diario voluminoso ya no se acumula. La búsqueda del pago
recorre el historial de la empresa; para historiales grandes será necesario un
indexador para mantener las consultas dentro del tiempo máximo de Vercel.
La prueba automática omite solo el login interactivo; firma con una clave fresca
en memoria. El recorrido real con Pollar requiere la comprobación humana.
