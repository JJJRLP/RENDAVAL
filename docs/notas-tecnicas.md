# Notas técnicas de implementación

Producto para empresas de cualquier país; Bolivia es el primer mercado y el país predeterminado. Detalle de cada fase del MVP. La visión general está en el [README](../README.md).

Para el reinicio C2 con RBOND, consultar [la especificación de contratos](../contracts/INTERFAZ.md).
Estas notas describen la web anterior, todavía sin integrar el nuevo libro ni reglas.
Su configuración VBOND no debe usarse para nuevas operaciones de RBOND.

## Acceso y verificación de empresa

Instale las dependencias con `npm install`. Copie `.env.example` a `.env.local` y complete:

- `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY`: clave pública de testnet de Pollar. El acceso rechaza claves que no comiencen por `pub_testnet_`.
- `NEXT_PUBLIC_VBOND_ISSUER`: dirección pública del emisor de VBOND en testnet.
- `POLLAR_SECRET_KEY`: clave secreta `sec_testnet_` para validar el token de acceso en cada ruta del servidor. Nunca se expone al navegador.
- `DIDIT_API_KEY`: clave sandbox `sk_test_` de Didit; las claves de producción se rechazan.
- `DIDIT_KYB_WORKFLOW_ID`: identificador del workflow de verificación de empresas. Revise la cobertura documental en la consola. Enviamos el país seleccionado en `expected_details.registry_country`; «Otro país» omite `expected_details`. Crear una sesión no confirma cobertura.
- `VAULT_SECRET_KEY`: clave secreta Stellar de la cuenta de plataforma Rendaval, financiada en testnet para comisiones y reservas de entradas de datos.

Los préstamos requieren `LENDER_SECRET_KEY`, `BOND_ISSUER_SECRET_KEY` y `TRUSTLESS_WORK_API_KEY` solo en el servidor. Configure las mismas variables en Vercel; no se usa base de datos ni almacenamiento en disco.

Ejecute `npm run dev -- --port 3017` y abra `http://localhost:3017/app`. El origen `http://localhost:3017` debe estar en los orígenes permitidos del dashboard de Pollar (y en las URI de redirección si se solicita). Si el puerto está ocupado, elija otro puerto libre y registre también ese origen.

En Pollar, habilite correo y Google, billeteras clásicas con creación inmediata, el patrocinio de trustlines y los activos USDC y VBOND. El panel consulta Horizon testnet y solicita solamente las autorizaciones faltantes. Las solicitudes pendientes se consultan de nuevo sin reenviarlas durante la sesión de la página.

La landing permanece en `/`. La ruta `/app` contiene el acceso, los saldos y la verificación de empresa. El flujo de préstamo incluye registro, garantía, desembolso, reembolso y devolución de bonos.

El servidor verifica el token de Pollar y usa exclusivamente la dirección devuelta por ese servicio. Una sesión de Didit debe corresponder a esa dirección y al workflow configurado. Al aprobarse, Rendaval firma en Stellar testnet una entrada `manageData` con nombre `kyb:<dirección de empresa>` y valor `1:<país>:<identificador de sesión>` (41 bytes para ISO de dos letras, 44 para `OTHER`, menos del límite de 64). Las constancias antiguas con solo el identificador se leen como Bolivia. El país se recupera de `metadata.country` en la decisión de Didit, validado contra `lib/countries.ts`; para sesiones históricas se usa `expected_details.registry_country` o Bolivia. Las consultas posteriores leen esa constancia pública; no incluye documentos ni datos de la empresa. Cada nueva entrada requiere reserva de XLM. La constancia no almacena fecha. Las lecturas posteriores obtienen el país desde Stellar sin depender de Didit. La dirección siempre procede de Pollar; el navegador solo elige el país, que define moneda y textos.

El navegador conserva el identificador, país y enlace de la sesión pendiente por cuenta. Al volver de la verificación, consulta automáticamente hasta cinco veces con esperas de 2, 4, 8 y 16 segundos. Después ofrece una comprobación manual. Si se borra el almacenamiento antes de aprobar, será necesario iniciar otra sesión. La aprobación de prueba solo funciona con configuración sandbox y requiere autenticación y pertenencia de la sesión.

Prueba real (crea una sesión sandbox y una entrada permanente en testnet para una dirección aleatoria):

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-kyb.ts
```

El script importa los mismos helpers del servidor y solo omite el acceso interactivo de Pollar. No guarda claves ni estado en disco. Las pruebas de producción deben usar un puerto libre y detener el proceso al terminar.

Referencias de contrato: [crear sesión](https://docs.didit.me/sessions-api/create-session), [sandbox y simulate](https://docs.didit.me/integration/sandbox-testing). La creación no devuelve `session_kind`; se valida `business` al consultar la decisión. El escenario simulado no sustituye una prueba humana del flujo alojado ni confirma la cobertura efectiva de Bolivia del workflow.

Validación: `npm run lint` y `npm run build`. Para probar producción en otro puerto: `npm run start -- --port 3017`.


## Préstamos de prueba — fase 4

Garantía admitida: USD 100–400; préstamo: 50 %, hasta 200 USDC. El ejemplo
boliviano es Bs 2.784 (USD 400, referencia de demostración). Capital, interés a 30 días y total se redondean a siete
decimales con `usdcAmount`; el pago y la oferta usan los mismos importes.

Cada ruta `/api/loan/*` autentica el token de Pollar y exige una empresa
verificada. Se usan Horizon y Trustless Work de testnet, sin base de datos,
disco persistente ni configuración adicional para Vercel. Rendaval es el
`serviceProvider`; la empresa es `receiver` y firma el depósito y, más tarde,
un solo pago de reembolso. El prestamista aprueba y Rendaval libera la garantía.
La búsqueda acepta únicamente el identificador `vault-loan-<wallet>` histórico
o `vault-loan-<wallet>:<timestamp>`, con los roles y el activo esperados.
Los préstamos antiguos conservan sus condiciones y roles originales; el cambio
de rol se aplica exclusivamente a nuevos contratos.

`POST /api/loan/repay/topup` aporta una sola vez el interés de prueba por contrato
(el interés propio de cada préstamo), mediante pago y marcador atómicos en el prestamista.
`repay/build` prepara el pago exacto con memo hash por contrato; `repay/submit`
valida la firma testnet y la operación. El estado reconoce el reembolso leyendo
transacciones exitosas en Horizon. `settle` marca, aprueba y libera, omitiendo
pasos ya confirmados en cadena. La respuesta conocida de Trustless Work
“Escrow already in dispute” en `release-funds` se devuelve como HTTP 200,
`release_pending`; se muestra solo en detalles técnicos. El pago queda recibido
y los bonos protegidos, con el botón “Comprobar devolución” de cada préstamo.
No se invoca el contrato con otra dirección de comisiones.

Al liberar, el saldo efectivamente devuelto (menos la eventual comisión del proveedor) vuelve a ofrecerse como garantía. El préstamo cerrado permanece en «Sus préstamos».

El diario de despliegue conserva el XDR firmado para serializar aceptaciones
paralelas. Sus entradas se eliminan al observar el contrato activo en cadena;
la ausencia del diario no impide consultar el préstamo. Para limpiar entradas
históricas, sin despliegues en curso:

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/clean-journal.ts
```

Prueba integral (crea una empresa fresca y tres préstamos de 200, 150 y 100 USDC; devuelve cada uno más el interés subvencionado; la tesorería termina con el mismo USDC):

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-loan.ts
```

Los marcadores de desembolso/ayuda y las constancias KYB permanecen como entradas
por préstamo/empresa. El diario voluminoso ya no se acumula. La búsqueda del pago
recorre el historial de la empresa; para historiales grandes será necesario un
indexador para mantener las consultas dentro del tiempo máximo de Vercel.
La prueba automática omite solo el login interactivo; firma con una clave fresca
en memoria. El recorrido real con Pollar requiere la comprobación humana.


## Varios préstamos por empresa

`GET /api/loan/state` devuelve `setup` (bono disponible o garantía aún no desembolsada),
`loans` (préstamos desembolsados, más recientes primero), `canRegister`, `openLoans`
y `limitReached`. Se permite registrar si el saldo disponible de VBOND es cero,
no hay preparación pendiente y hay menos de tres préstamos abiertos. Activos y
pagados con devolución pendiente cuentan para el límite; cerrados no cuentan.
Los campos superiores de etapa y condiciones representan la preparación o el
último préstamo; `locked` suma las garantías de todos los contratos sin liberar.

Depósito, desembolso, ayuda de interés, reembolso y liquidación requieren
`contractId` en el cuerpo JSON. El servidor vuelve a buscarlo entre los contratos
propios de la empresa, comprobando engagement, roles y activo. Un contrato ajeno
se rechaza con 403; una referencia ausente con 409. Los roles históricos de
serviceProvider (empresa o Rendaval) se admiten sin modificar el contrato.

El diario usa una generación por empresa (cantidad de contratos ya registrados),
por lo que una aceptación posterior no reutiliza el XDR de una anterior. Los
reintentos de la misma generación conservan el XDR firmado y limpian únicamente
esa generación después de observar el contrato. Los marcadores de desembolso y
ayuda siguen siendo atómicos y exclusivos por contrato. La ayuda aporta el interés
propio una vez, sin confundir el capital de otros préstamos con interés disponible.

El estado consulta saldos, roles y prestamista en paralelo, y escanea una sola vez
el historial de la empresa y una sola vez el del prestamista para todos los contratos.
Cada plazo empieza en la fecha de su propio desembolso y cada reembolso se reconoce
por su memo hash y pago exacto. No hay caché de autoridad ni base de datos.

La interfaz conserva el bloque de preparación y agrega «Sus préstamos» antes de
«Su cuenta». Cada fila tiene su propia acción, progreso, error y enlaces. Un bloqueo
compartido impide iniciar dos operaciones de préstamo a la vez; una recarga reconstruye
el progreso desde la red. La devolución pendiente se comprueba con el botón de su fila.

## Países, monedas y compatibilidad (issue #9)

`lib/countries.ts` comparte entre cliente y servidor los países BO, AR, BR, CL, CO,
MX y PE, más `OTHER` («Otro país», USD). Los códigos de los países son ISO;
`OTHER` es una opción interna y nunca se envía como país de registro a Didit.
Los tipos de cambio son referencias fijas de demostración, nunca cotizaciones.
La empresa elige moneda local o USD; el servidor obtiene la referencia del módulo,
no acepta un tipo de cambio enviado por el navegador. Un VBOND sigue representando
USD 1 de garantía, con 50 % de financiamiento, 8 % anual y 30 días.

Los nuevos bonos guardan `nominal` y `currency` en el JSON de descripción del
escrow. `normalizeBond` admite JSON históricos con `nominalBs` como BOB sin aplicar
los límites o fechas de registro actuales. Las descripciones de texto históricas
se muestran en la moneda del país de la empresa y en USD a partir del importe del
contrato. Si faltan los datos locales antes de crear un contrato, la descripción es
un texto con el valor en USD; no se recuperan datos originales del emisor.
Las constancias antiguas (sin país) admiten cualquier referencia no vacía, porque
los scripts de prueba escribieron valores que no son identificadores de Didit.
Los identificadores, memos de reembolso y activos existentes no cambian.

Comprobación real de sandbox: creación con país PE devolvió 201 y decisión 200;
la decisión incluyó `expected_details.registry_country: PE`, `metadata.country: PE`
y mantuvo `vendor_data` y `session_kind: business`. Con los helpers finales, PE y
`OTHER` conservaron su país después de la aprobación simulada. Horizon devolvió
200 y las diez constancias históricas se leyeron como Bolivia, con sus préstamos.
Se escribieron dos constancias de prueba (PE y `OTHER`) con cuentas nuevas; no se
crearon préstamos. Esto comprueba la persistencia
de la selección, no la cobertura documental del flujo alojado.

Pruebas locales de compatibilidad (sin red ni transacciones):

```sh
node --conditions=react-server --import tsx scripts/check-country-compatibility.ts
```

Cubren las ocho opciones, monedas locales y USD, extremos y rechazos de límites,
bonos históricos de USD 1.000 ya vencidos, constancias antiguas y nuevas, la omisión
de `expected_details` para `OTHER` y el rechazo de sesiones de otra cuenta.


## Precio de garantía y aviso de margen — fase 1

`POST /api/loan/price` usa el mismo manejador autenticado de Pollar y la constancia
KYB que las demás operaciones. El helper vuelve a comprobar engagement, roles,
activo y pertenencia con `escrowFor`; rechaza garantías sin desembolso, pagadas,
liberadas, disputadas o resueltas. La dirección del cuerpo nunca se usa.

Rendaval firma en testnet una entrada `price:<contractId>` en su cuenta
`VAULT_SECRET_KEY`: el nombre ocupa 62 bytes y conserva el identificador completo,
sin colisiones ni cambios a los identificadores existentes. El valor UTF-8 es
`1:<fracción decimal>` (por ejemplo `1:0.65`); el primer campo versiona el formato.
La ausencia significa 1. Volver a 1 elimina la entrada y libera su reserva y cupo.
El lector admite fracciones positivas hasta 1 con siete decimales; el control y
la ruta de simulación solo permiten 1, 0.8, 0.65 y 0.5. Una entrada malformada
produce un error de lectura, sin ocultar el riesgo con un precio predeterminado.

El estado carga la cuenta de Rendaval una vez en paralelo con las demás cuentas,
no por préstamo. Cada `LoanView` incluye `price`, `collateralValue` (valor nominal
por precio, redondeado a siete decimales) y `health` (ratio y nivel). La deuda
conserva el capital más interés acordados. Los niveles son saludable por debajo
de 0.7, aviso desde 0.7 y riesgo desde 0.85. El control está plegado después de la
salud y del botón de devolución. No ejecuta ni aporta garantía.

Comprobación sin red, incluidas pertenencia, roles históricos, etapas, ruta
autenticada, aislamiento de precios y eliminación idempotente:

```sh
node --conditions=react-server --import tsx scripts/check-loan-health.ts
```

Las escrituras reintentan conflictos de secuencia de Rendaval y vuelven a validar
la etapa. Como en los otros flujos basados en Horizon y Trustless Work, la lectura
de etapa y la escritura clásica no son atómicas entre cuentas/contratos; una
operación de devolución concurrente puede finalizar entre ambas. El precio no
modifica las condiciones ni inicia una ejecución automática.

Verificación real de esta fase: mediante los helpers, sobre el préstamo activo
`CDBEZE6372NOLV442UYXHFU4LLTM35IBH3UFEL4OWVXJRESYN35I6YLG`, Horizon confirmó
0.8 / saludable, 0.65 / aviso y 0.5 / riesgo; el estado conservó los precios de
los otros préstamos de la empresa. Otra empresa verificada recibió 403. Se
restauró el precio a 1 y se comprobó la ausencia de la entrada (transacción
`c229e7505438ffab019b9f69cf4784acc23739e800555e4baf8d6332b6f8c3ca`). No se
crearon préstamos ni se movieron USDC. No se probó el login interactivo de Pollar
ni la interfaz en un navegador real; la autorización de la ruta se comprobó con
fixtures offline y el helper con proveedores reales.
