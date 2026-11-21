# Interfaz del libro de préstamos — C1, especificación para la web

Instancia testnet y hashes: [evidencia](../scripts/evidence/loan-book-testnet.json).
Usar `contractId` (libro), `rulesContractId` (reglas), `bondToken` (SAC) y
`issuer` de ese archivo. RVBOND reemplaza a VBOND para el reinicio limpio. El WASM incluye la especificación de tipos.
La aplicación existente aún no integra esta interfaz.

## Identificadores y unidades

Toda referencia a un préstamo incluye **red, contractId e id**. `id: Address`
debe empezar por C: representa el escrow que mantiene los bonos. Se consulta su
saldo y autorización en el token de la serie. No puede reutilizarse dentro de
esta instancia, ni después del cierre. No se comprueban dueño, reglas de salida
ni código del escrow; operador y prestamista verifican esas condiciones al firmar.

`series: Symbol` identifica una emisión dentro de una instancia, con hasta 32
caracteres de `a-zA-Z0-9_`. Su cotización es `Asset::Other(series)`, en USD por
unidad de nominal USD. No es la dirección del token ni la del escrow. Una serie puede
respaldar muchos préstamos. Para la simulación de visitantes se registra una
serie exclusiva por bono; el backend debe impedir publicar sobre series ajenas.
El emisor sigue siendo el único publicador on-chain.

Cada serie vincula permanentemente un `token: Address`, en el producto el SAC
de un activo clásico con autorización obligatoria. El emisor debe verificar
ese SAC y la equivalencia de unidades antes de registrarlo. Registrar una
dirección C no certifica que su código sea un SAC ni que diga la verdad.

Importes `i128`, siete decimales (`10_000_000 = 1 USDC`). Nominal y valor en
USD equivalentes con la misma escala. Precio en `(0, 10_000_000]`, donde
10.000.000 representa 100 %. Tiempos `u64`, segundos Unix del ledger; umbrales
`u32`, puntos básicos (`7000 = 70 %`). Nunca convertir importes a Number de JS:
usar BigInt / cadenas decimales y ScVal del tipo declarado.

## Funciones

Se omite Env. Escrituras devuelven `Result<(), Error>` salvo `set_buyer`, que
no devuelve valor. Los errores se revierten junto con pagos y eventos.

| Función | Argumentos y resultado | Autorización / conducta |
| --- | --- | --- |
| __constructor | `(operator: Address, issuer: Address, usdc: Address, rules: Address, margin_bps: u32, default_bps: u32, max_step_bps: u32, max_price_age: u64, discount_bps: u32)` | Atómico al desplegar; parámetros inmutables. |
| register_series | `(series: Symbol, token: Address)` | Emisor; vínculo inmutable y precio 100 % con fecha actual. Sin límite global ni acceso al catálogo. |
| list_series | `(series: Symbol)` | Emisor; añade una serie existente al catálogo, máximo 64. Repetir es inocuo. |
| get_series | `(name: Symbol) -> Result<Series, Error>` | Devuelve token y quote; no llama al token. |
| open | `(id: Address, series: Symbol, borrower: Address, lender: Address, face: i128, principal: i128)` | Operador **y** prestamista; exige saldo >= face, autorización y admin del SAC = rules; verifica vínculo de reglas con este libro, marca prenda y paga atómicamente. |
| publish_price | `(series: Symbol, price: i128)` | Emisor; cambia una cotización compartida, no un préstamo. |
| set_buyer | `(buyer: Address, allowed: bool)` | Emisor; false elimina permiso, true lo conserva persistente. |
| flag_margin | `(id: Address)` | Cualquiera; precio fresco y deuda/valor >= margen. |
| mark_default | `(id: Address)` | Cualquiera; saldo < face o saldo congelado sin exigir frescura; también deuda/valor >= default con precio fresco, o ahora > due. |
| repay | `(id: Address)` | Prestatario; paga deuda entera, incluso en Defaulted, hasta liquidación. |
| liquidate | `(id: Address, buyer: Address, expected_price: i128)` | Comprador autorizado; Defaulted, saldo legible y autorizado, precio fresco e igual al esperado. |
| release_pledge | `(id: Address)` | Cualquiera; solo Repaid/Liquidated y saldo actual exactamente cero. Retira la marca mediante llamada libro → reglas. Repetir después de retirarla no hace nada. |
| get_loan | `(id: Address) -> Result<View, Error>` | Precio actual de serie si abierto; foto final si cerrado. Reconcilia margen del id consultado. |
| get_price | `(id: Address) -> Result<i128, Error>` | Igual criterio de precio que get_loan. No recibe una serie. |
| get_config | `() -> Config` | Parámetros del constructor. |
| is_buyer | `(buyer: Address) -> bool` | Permiso actual; ausente significa false. |

`Series = { token: Address, quote: PriceData }`.
`Collateral = { balance: i128, authorized: bool, known: bool }`.
`Config` contiene exactamente los nueve parámetros del constructor, incluido `rules`.
`Loan` contiene `asset: Symbol` (serie), `price_time: u64`, `borrower: Address`,
`lender: Address`, `face: i128`, `principal: i128`, `interest: i128`, `due: u64`,
`status: Status`, `price: i128`, `loss: i128`, `proceeds: i128`, `surplus: i128`,
`collateral: Collateral`.
`View` contiene `loan: Loan`, `debt: i128`, `value: i128`, `health_bps: i128`,
`overdue: bool`, `shortfall: Option<i128>`. Config, préstamos y series son tipos de mapa ScVal; variantes
de enum se codifican como vectores etiquetados, por ejemplo `['Active']` y
`['Other', series]`. El script muestra la conversión de SEP-40.

No usar el precio almacenado directamente en LedgerEntry de un préstamo abierto:
es una foto de su última escritura. `get_loan` combina Series con saldo y
autorización actuales del escrow en su token. Solo las
fotos cerradas son definitivas. `get_price` de un cerrado puede diferir de
`lastprice` de su serie, que puede seguir cotizando para otros holders.

## Reglas económicas y estados

- `face > 0`, `principal > 0`, prestatario distinto del prestamista.
  Capital <= `floor(face / 2)` **y** <= `floor(value / 2)` al abrir; serie
  existente y fresca. El límite sobre valor actual evita abrir al 50 % nominal
  cuando la serie ya cayó. Se verifica aritmética antes del desembolso.
- `interest = ceil(principal / 150)`; equivale a 8 % anual, 30 días y año de 360
  días. `debt = principal + interest`; `due = ahora + 30 * 86400`.
- `value = floor(min(face, collateral.balance) * price / 10_000_000)`.
  El exceso sobre face no aumenta la cobertura comprometida ni el pago del comprador.
  `shortfall = max(face - balance, 0)` si la lectura es válida.
  Puede redondearse a cero. Si está congelado, value conserva la valoración del
  saldo existente; authorized=false es un disparador de default independiente.
  `health_bps = floor(debt * 10000 / value)`; con valor cero es `i128::MAX`.
  Las decisiones comparan productos enteros, no el ratio redondeado mostrado.
- Estados: Active → Margin → Defaulted → Liquidated, con posibilidad de pagar
  desde Active, Margin o Defaulted y acabar Repaid. También se puede pasar
  directamente Active → Defaulted si se cumple un disparador. No hay gracia.
- Margin se limpia automáticamente si el valor actual se recuperó, al tocar
  ese préstamo con una operación exitosa, incluido get_loan/get_price enviado
  como transacción. Una simulación devuelve el estado reconciliado pero no
  persiste cambios ni eventos. Publicar la serie no recorre préstamos. El
  indexador debe recalcular salud con el evento de precio; no esperar un evento
  margin por cada holder en la transacción del emisor. Si el precio sube y baja
  antes de tocar un id, se evalúa el último precio, no el trayecto intermedio.
- Defaulted no se limpia al recuperar precio, saldo o autorización. Sí se cura pagando toda la deuda.
  El orden de confirmación decide entre repay y liquidate concurrentes.
- `overdue` es solo `ahora > due`, incluso para cerrados. Mostrar primero status.

Parámetros de esta instancia: margen 7000, default 8500, paso 2500, vigencia
86400 segundos, descuento 500. El constructor exige
`5000 < margin_bps < default_bps <= 10000`, `0 < max_step_bps <= 10000`,
`max_price_age > 0`, `discount_bps < 10000`.

Cada publicación exige
`abs(nuevo - anterior) * 10000 <= anterior * max_step_bps`.
La igualdad se permite. Por ejemplo, 100→80→65→50 es válido; 100→50 no.
Para recuperar, 50→62,5→78,125→97,65625→100. Son pasos, no un límite acumulado
diario. El backend confirma cada paso. Registrar una nueva serie no puede
reemplazar ni reiniciar una existente, incluso archivada. No hay borrado ni
reciclaje de nombres.

La frescura admite edad <= 86400 inclusive. Republicar el mismo precio en otro
segundo renueva fecha y emite evento. La edad se calcula con el reloj del ledger,
no con una fecha del cliente. Precio viejo bloquea nuevas aperturas, margen,
default por precio y liquidación. `ahora == due` aún no es mora; `ahora > due`
permite default sin frescura. Repay nunca necesita precio fresco, saldo completo ni autorización del bono.

Liquidación: `proceeds = floor(value * (10000 - discount_bps) / 10000)`;
`paid = min(proceeds, debt)` al prestamista, `surplus = proceeds - paid` a la
empresa, `loss = debt - paid` registrada. El comprador paga ambos tramos dentro
de la misma invocación. Un fallo en el segundo revierte también el primero.
No se guarda USDC intermedio. `expected_price` es la cotización sin descuento.

Con nominal 100, capital 50 y precio 55 %, proceeds=52,25, deuda=50,3333334,
surplus=1,9166666 USDC. Con precio 40 %, proceeds=38 y loss=12,3333334.
Si falta garantía, la liquidación calcula proceeds sobre lo que queda, limitado
al nominal. Un saldo cero legible y autorizado permite cerrar con proceeds=0 y
pérdida de toda la deuda. Si está congelado, falla Collateral hasta que el emisor
lo autorice; no se cobra por bonos inmóviles. El saldo se vuelve a leer en la
transacción: expected_price fija la cotización, no una cantidad de bonos.

Repay sigue cobrando la deuda completa aunque falten bonos o estén congelados.
La vista final dice Repaid y conserva saldo, autorización y faltante observados
al cierre; surplus=0, proceeds=0 y loss=0. El faltante no es una deuda del libro
con la empresa ni una promesa de devolver bonos. debt sigue mostrando la deuda
contractual histórica, no un saldo pendiente: interpretar primero status.

El comprador puede ser el prestamista si está autorizado. No se transfieren
bonos aquí; el pago no acredita entrega ni invoca Trustless Work.

## SEP-40 y catálogo

Se usan los tipos y siete lecturas del [SEP-40](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0040.md).
`Asset = Stellar(Address) | Other(Symbol)`;
`PriceData = { price: i128, timestamp: u64 }`.

| Lectura | Resultado |
| --- | --- |
| base() | Asset::Other(Symbol("USD")) |
| assets() | Vec<Asset>, de 0 a 64 series elegidas por el emisor con list_series, en orden de publicación |
| decimals() | u32 = 7 |
| resolution() | u32 = 1; segundos, sin frecuencia garantizada de publicación |
| lastprice(asset) | Option<PriceData>, última publicación de serie, aunque esté vieja |
| price(asset, timestamp: u64) | Option<PriceData>, solo si timestamp coincide con la última publicación |
| prices(asset, records: u32) | Option<Vec<PriceData>>, un elemento solo si records == 1 y existe la serie |

Stellar y nombres desconocidos devuelven None. Solo se retiene la última
publicación; el consumidor comprueba timestamp. **assets no enumera todas las
series con precio**: solo las que el emisor eligió publicar. Toda serie registrada,
listada o no, responde a lastprice, price y prices por nombre. El demo registra
series exclusivas sin listarlas. No necesita otra instancia tras 64 visitantes.
Capacity solo afecta list_series; registrar, publicar y abrir siguen funcionando.
No hay bajas, cambio de token ni reciclaje de nombres o cupos del catálogo.
La identidad incluye red y dirección del libro; un símbolo no es global. No hay
actualización de WASM ni historial de precios más allá del último dato.

## Lecturas del token y fallos

Para un préstamo abierto se llaman balance(id) y authorized(id) solo en el token
de su serie. Un error recuperable, tipo incorrecto o saldo negativo produce
known=false, shortfall=None, value=0 y health_bps=i128::MAX. balance=0 y
authorized=false son entonces marcadores sin valor probatorio: la web debe
mostrar «garantía no verificable», no «saldo cero» ni «congelada».
Open y liquidate rechazan la lectura fallida con CollateralRead. Margin y default
por precio también; la mora sigue permitiendo default sin conocer el saldo.
Un fallo de lectura por sí solo no prueba faltante. Repay permite pagar con
known=false y guarda esa incertidumbre al cerrar.

Una lectura válida con saldo insuficiente o authorized=false permite a cualquiera
marcar default aunque el precio esté viejo y aún no venza el préstamo. get_loan
muestra la condición pero no marca default automáticamente. El evento default
conserva la foto de ese momento; una vista posterior de un abierto muestra el
estado actual, incluso si la garantía se recuperó.

try_* captura errores recuperables, no garantiza aislar agotamiento de recursos
del host. Un token hostil puede hacer fallar las llamadas que consultan **su propia
serie**, incluida una devolución, o mentir sobre su saldo. No se recorre ni llama
ese token desde operaciones de otras series, registro, catálogo o lecturas SEP-40.
No agrupar operaciones independientes con un token no confiable en una misma
transacción. El emisor debe registrar SAC conocidos. Las vistas de cerrados nunca llaman
al token y su foto no cambia. La operación separada release_pledge sí consulta el saldo
actual y falla si no puede leerlo; nunca usa la foto del cierre para desproteger.

## Errores y reintentos

| Código | Nombre | Significado |
| --- | --- | --- |
| 1 | Invalid | Importe, id, participantes, LTV, precio o parámetros inválidos |
| 2 | Overflow | Aritmética fuera de rango |
| 3 | Exists | Préstamo o serie ya registrado |
| 4 | Missing | Préstamo o serie no registrado |
| 5 | State | Transición no permitida |
| 6 | Healthy | No se cumple umbral, vencimiento ni deterioro de garantía |
| 7 | Buyer | Comprador no autorizado |
| 8 | PriceChanged | Precio diferente del esperado |
| 9 | PriceStep | Paso de precio excesivo |
| 10 | StalePrice | Precio viejo o tiempo inconsistente |
| 11 | Capacity | Ya se publicaron 64 series en el catálogo |
| 12 | Collateral | Saldo insuficiente al abrir o garantía congelada al abrir/liquidar |
| 13 | CollateralRead | No se pudo verificar saldo y autorización |
| 14 | Rules | Admin distinto de reglas, admin ilegible o reglas vinculadas a otro libro |
| 15 | Nonempty | Préstamo cerrado pero aún hay bonos en escrow |

Firmas, saldo, trustline, recursos y restauración pueden fallar en host/SAC y
no usan esos códigos. `open` y `register_series` duplicados devuelven Exists;
liquidate repetido devuelve State. Repay después de Repaid no mueve dinero;
requiere igualmente al prestatario. Default ya marcado es inocuo. Margin
repetido es inocuo si aún cumple las guardas; con precio viejo falla StalePrice.
list_series repetido, permiso idéntico y precio idéntico en el mismo segundo no emiten evento nuevo.
Una escritura repetida puede mantener TTL aunque no cambie negocio.

Ante timeout consultar el hash firmado y confirmado antes de reconstruir una
transacción. Un error de red no prueba que el pago no ocurrió. No reintentar
con otro id. La unicidad es por instancia: aprovisionar otra no autoriza volver
a financiar el mismo escrow; el backend debe hacer esa comprobación global.

## Eventos, consultas y conservación

| Tema inicial y segundo tema | Datos |
| --- | --- |
| init | config |
| series, series | token, timestamp; el precio inicial es 100 % |
| listed, series | sin campos de datos |
| buyer, buyer | allowed |
| open, id | loan completo (incluye borrower, lender y asset) |
| price, series | price, timestamp |
| margin, id | flagged (true al marcar, false al reconciliar recuperación) |
| default, id | loan completo |
| repay, id | amount, loan completo final |
| liquidate, id | buyer, loan completo final |

Cada cambio de negocio emite evento; los reintentos inocuos no lo repiten.
Renovar TTL no es una transición de negocio. Config está en instance;
Loan(id), Series(symbol), Assets y Buyer(address) en persistent.
Préstamos abiertos y entradas consultadas renuevan a 2.073.600 ledgers si quedan
menos de 1.036.800; también instancia y código. No hay mantenimiento global.
Las vistas de cerrados no renuevan Loan ni consultan Series o token: conservan la foto final y pueden
archivarse. El cierre puede haber renovado al cargar el préstamo todavía vivo;
lo ya pagado no se recupera. Lecturas/reintentos posteriores no prolongan eso.

El TTL es en ledgers; no sustituye vencimiento ni fecha del precio. Simular no
persiste renovación. Preparar cada transacción mediante RPC: desde protocolo
23 puede incorporar restauración automática de entradas archivadas y su coste.
Si hace falta, restaurar por separado con RestoreFootprintOp y volver a simular.
Nunca interpretar un error de archivo/RPC como Missing. La prueba persistente
de existencia no se borra y bloquea un open repetido tras restaurar.

No existe list_loans ni un catálogo de series del demo. Con id conocido, la web
lee directamente get_loan y get_series en esta única instancia: no necesita una
base de datos que asigne visitantes a contratos. La siguiente fase debe obtener
el id desde su flujo de escrow en cadena o recibirlo del usuario. Una búsqueda
histórica global por usuario requeriría una fuente adicional: no se promete que
getEvents sea una base de datos eterna. Para un índice opcional, deduplicar por
(red, contrato, event.id), conservar cursor y recuperar huecos de retención.
La salud exige consultar get_loan: ni los eventos del libro ni los de precio
anuncian automáticamente una salida del escrow. La marca impide revocación
por las reglas; no impide transferencias autorizadas por el propio escrow.

## Contrato de reglas y protección C1

RVBOND tiene AUTH_REQUIRED, AUTH_REVOCABLE y AUTH_IMMUTABLE activos y clawback
inactivo. Su SAC es `CDPPMX5DG2XQUNQFYKIB77OZVZJWAHRDEOLHOCRBJ2UK4MGBNHQUGZGW`;
emisor `GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6`.
No usar la clave del VBOND retirado. El registro de series sigue sin catálogo global.
Las reglas pueden administrar más de un SAC del mismo emisor: la clave persistente
de protección es `(token, holder)`. Darles el admin de otro activo exige revisar
por separado sus flags, procedencia y ausencia de clawback; open comprueba admin,
no flags clásicos ni autenticidad de código. Para esta versión la web acepta solo
el SAC RVBOND verificado en la evidencia, no un token proporcionado por el visitante.

| Función de reglas | Argumentos / resultado | Firma y condición |
| --- | --- | --- |
| __constructor | `(issuer: Address, book: Address)` | Atómico al desplegar; book debe ser C; configuración inmutable. |
| get_config | `() -> { issuer, book }` | Lectura. |
| pledged | `(token: Address, holder: Address) -> bool` | Lectura; renueva TTL de la marca existente. |
| set_authorized | `(token: Address, holder: Address, authorized: bool)` | Emisor. false falla con Pledged (101) si hay marca, incluso con saldo cero. |
| protect | `(token: Address, holder: Address)` | Solo autorización contractual del libro; holder debe ser C. No llamar desde servidor. |
| release | `(token: Address, holder: Address)` | Solo libro; comprueba de nuevo saldo cero. No llamar desde servidor. |

Escrituras devuelven Result<(), Error>. Errores de reglas: 101 Pledged,
102 Nonempty, 103 Invalid. Las firmas ausentes fallan en el host. Las reglas
no tienen mint, transfer, burn, clawback, set_admin, upgrade, pause ni passthrough.
La emisión se hace con pago clásico del emisor a una cuenta aprobada.

Eventos de reglas: `init` con config; `authorized, token, holder` con authorized;
`pledge, token, holder` con pledged. Cambios idénticos no repiten evento.
La retirada emite el evento pledge=false en reglas, no un segundo evento en libro.
Config vive en instance y marcas en persistent, con TTL/umbral 2.073.600/1.036.800.
Una marca archivada se restaura: no desaparece ni se interpreta como false.
Cualquiera puede mantenerla viva enviando pledged como transacción; una simulación
no persiste TTL. Ante un fallo de archivo o RPC, restaurar/simular, nunca permitir revocación
por asumir que no existe la marca. La marca no depende del TTL del préstamo cerrado.

La marca nace **en open**, antes del pago USDC, en la misma transacción. Si el pago
falla, también se revierten préstamo y marca. El intervalo entre depósito y open
todavía no tiene protección; no hay deuda desembolsada y open rechaza un saldo
congelado o insuficiente. Repay y liquidate no retiran la marca. release_pledge
requiere estado terminal y saldo actual cero (también cero de cualquier exceso sobre
face); es independiente del precio y no requiere firma de empresa, emisor u operador.
Después de retirar la marca no volver a depositar en ese escrow cerrado.

Las direcciones del libro y reglas se calculan con la cuenta de despliegue y dos
salts públicos antes de desplegar. Cada constructor fija la dirección del otro.
Crear esos contratos requiere la firma de la cuenta de despliegue; conocer los salts
no permite capturarlos. No hay inicialización ni enlace posterior. Se verifican ambos
constructores antes de entregar el admin del SAC. Ambos carecen de actualización.

Las cuentas G conservan las rutas clásicas de autorización del emisor: las reglas
no pueden impedir que el emisor use esas operaciones directamente. Por eso solo
un escrow C puede respaldar un préstamo. Tampoco se impide la emisión adicional,
la revocación de receptores ordinarios ni una salida permitida por el escrow.
La entrega tras liquidar sigue coordinándose fuera del libro.

## Firmas y pasos de la fase web

Usar exclusivamente Stellar testnet y las direcciones de la evidencia C1. Todas
las cantidades son enteros de siete decimales; simular/preparar cada transacción,
confirmar su hash y consultar el estado antes del siguiente paso. Ante timeout,
consultar el hash original; no crear un préstamo con otro id ni volver a emitir
bonos por asumir que falló la red. Los pagos clásicos y depósitos no son idempotentes:
el servidor debe conservar su hash confirmado como parte del flujo.

1. **Registrar bono para una empresa.** Comprobar identidad y aprobación del emisor.
   La empresa firma `changeTrust` para `RVBOND:issuer` y USDC si no existen esas
   trustlines. El servidor llama reglas.set_authorized(SAC, empresa, true), firmado
   con `NEW_BOND_ISSUER_SECRET_KEY`. Confirmar autorización. El emisor firma un
   pago clásico de RVBOND a la empresa por el nominal aprobado (emisión). Confirmar
   saldo. Registrar una serie exclusiva mediante libro.register_series(nombre, SAC),
   firmado por el mismo emisor, **sin list_series** para visitantes. El precio inicial
   es 100 %. No llamar SAC.mint: el emisor ya no es su admin y reglas no lo expone.
2. **Autorizar escrow.** Crear el escrow real por el flujo de Trustless Work de la
   próxima fase; comprobar activo, roles, empresa y condiciones de salida. El emisor
   firma reglas.set_authorized(SAC, escrow, true). La empresa firma el depósito al
   escrow por el flujo TW. Verificar saldo y autorización en SAC por RPC. Aprobar
   también todos los receptores previstos, incluido el cobrador TW, que necesita su
   propia trustline. C1 no prueba ni cambia ese cobrador.
3. **Abrir préstamo.** Invocar libro.open(escrow, serie, empresa, prestamista, face,
   principal) con origen de transacción prestamista. Simular; firmar la entrada de
   autorización Soroban del operador con `VAULT_SECRET_KEY` usando authorizeEntry y
   vencimiento de ledger acotado; ensamblar y firmar el sobre con `LENDER_SECRET_KEY`.
   Firmar solamente el sobre con ambas claves no sustituye la autorización Soroban.
   El pago anidado usa la firma del prestamista. No firmar protect: la autorización
   libro → reglas es contractual. Confirmar get_loan y reglas.pledged(SAC, escrow).
4. **Publicar precio.** El servidor verifica que la serie pertenece al flujo correcto
   y firma libro.publish_price(serie, precio) con `NEW_BOND_ISSUER_SECRET_KEY`.
   Confirmar cada paso de hasta 25 % respecto del anterior. Renovar antes de 24 h;
   publicar el mismo precio en otro segundo renueva la fecha. El emisor es también
   el publicador y no hay una clave de precios distinta.
5. **Pagar préstamo.** La empresa debe tener deuda completa en USDC y firma
   libro.repay(escrow) como origen (Pollar/signTx en la próxima fase). Simular y
   preparar; require_auth y transferencia anidada usan esa firma. Confirmar Repaid.
   No marcar garantía liberada: la prenda continúa hasta que salgan todos los bonos.
   Repay repetido no vuelve a cobrar, pero sigue exigiendo la firma de la empresa.
6. **Devolver bonos y levantar prenda.** Ejecutar la salida por las rutas oficiales
   del escrow TW y sus firmas/roles; C1 no especifica ni sustituye esas firmas.
   Confirmar saldo SAC del escrow exactamente cero y estado Repaid o Liquidated.
   Cualquier cuenta con XLM para la comisión puede enviar libro.release_pledge(escrow),
   firmando solo el sobre. Confirmar reglas.pledged=false. Si quedan bonos, falla
   Nonempty; si no se conoce saldo, falla CollateralRead. No llamar reglas.release
   con la clave del backend: nunca tiene autorización para retirar la marca.

Ver [ejecutor C1](../scripts/bond-rules-testnet.mjs) para authorizeEntry y orden de
llamadas. El contrato auxiliar test-escrow es **solo una prueba**: su dueño puede
retirar en cualquier momento y no debe usarse como escrow de producto. La corrida
final usa al operador como empresa para poder recuperar fondos sin guardar claves
nuevas; en la web empresa y operador son roles distintos.

La web debe mostrar precio y edad, estado, saldo, autorización, faltante o lectura
no verificable, y protección pendiente aun después de pagar. Mostrar por separado
el saldo actual al liberar: la foto final de get_loan no se actualiza. No usar assets
para descubrir visitantes ni interpretar health_bps como salud si known=false o
authorized=false. Esta fase no cambia app/, components/ ni lib/.
