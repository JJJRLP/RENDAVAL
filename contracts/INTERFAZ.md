# Interfaz del libro de préstamos — A3, especificación para la web

Instancia testnet y hashes: [evidencia](../scripts/evidence/loan-book-testnet.json).
Usar `contractId` de ese archivo. El WASM incluye la especificación de tipos.
La aplicación existente aún no integra esta interfaz.

## Identificadores y unidades

Toda referencia a un préstamo incluye **red, contractId e id**. `id: Address`
debe empezar por C: representa el escrow, sin comprobar su existencia ni su
contenido. No puede reutilizarse dentro de esta instancia, ni después del cierre.
El operador y el prestamista verifican titular, bonos y nominal antes de firmar.

`series: Symbol` identifica una emisión dentro de una instancia, con hasta 32
caracteres de `a-zA-Z0-9_`. Su cotización es `Asset::Other(series)`, en USD por
unidad de nominal USD. No es el SAC VBOND ni el contrato escrow. Una serie puede
respaldar muchos préstamos. Para la simulación de visitantes se registra una
serie exclusiva por bono; el backend debe impedir publicar sobre series ajenas.
El emisor sigue siendo el único publicador on-chain.

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
| __constructor | `(operator: Address, issuer: Address, usdc: Address, margin_bps: u32, default_bps: u32, max_step_bps: u32, max_price_age: u64, discount_bps: u32)` | Atómico al desplegar; parámetros inmutables. |
| register_series | `(series: Symbol)` | Emisor; crea precio 100 % con fecha actual; máximo 64 series históricas. |
| open | `(id: Address, series: Symbol, borrower: Address, lender: Address, face: i128, principal: i128)` | Operador **y** prestamista; registra y transfiere capital al prestatario atómicamente. |
| publish_price | `(series: Symbol, price: i128)` | Emisor; cambia una cotización compartida, no un préstamo. |
| set_buyer | `(buyer: Address, allowed: bool)` | Emisor; false elimina permiso, true lo conserva persistente. |
| flag_margin | `(id: Address)` | Cualquiera; precio fresco y deuda/valor >= margen. |
| mark_default | `(id: Address)` | Cualquiera; deuda/valor >= default con precio fresco, o ahora > due sin exigir frescura. |
| repay | `(id: Address)` | Prestatario; paga deuda entera, incluso en Defaulted, hasta liquidación. |
| liquidate | `(id: Address, buyer: Address, expected_price: i128)` | Comprador autorizado; Defaulted, precio fresco e igual al esperado. |
| get_loan | `(id: Address) -> Result<View, Error>` | Precio actual de serie si abierto; foto final si cerrado. Reconcilia margen del id consultado. |
| get_price | `(id: Address) -> Result<i128, Error>` | Igual criterio de precio que get_loan. No recibe una serie. |
| get_config | `() -> Config` | Parámetros del constructor. |
| is_buyer | `(buyer: Address) -> bool` | Permiso actual; ausente significa false. |

`Config` contiene exactamente los ocho parámetros del constructor.
`Loan` contiene `asset: Symbol` (serie), `price_time: u64`, `borrower: Address`,
`lender: Address`, `face: i128`, `principal: i128`, `interest: i128`, `due: u64`,
`status: Status`, `price: i128`, `loss: i128`, `proceeds: i128`, `surplus: i128`.
`View` contiene `loan: Loan`, `debt: i128`, `value: i128`, `health_bps: i128`,
`overdue: bool`. Config, préstamos y series son tipos de mapa ScVal; variantes
de enum se codifican como vectores etiquetados, por ejemplo `['Active']` y
`['Other', series]`. El script muestra la conversión de SEP-40.

No usar el precio almacenado directamente en LedgerEntry de un préstamo abierto:
es una foto de su última escritura. `get_loan` lo combina con Series. Solo las
fotos cerradas son definitivas. `get_price` de un cerrado puede diferir de
`lastprice` de su serie, que puede seguir cotizando para otros holders.

## Reglas económicas y estados

- `face > 0`, `principal > 0`, prestatario distinto del prestamista.
  Capital <= `floor(face / 2)` **y** <= `floor(value / 2)` al abrir; serie
  existente y fresca. El límite sobre valor actual evita abrir al 50 % nominal
  cuando la serie ya cayó. Se verifica aritmética antes del desembolso.
- `interest = ceil(principal / 150)`; equivale a 8 % anual, 30 días y año de 360
  días. `debt = principal + interest`; `due = ahora + 30 * 86400`.
- `value = floor(face * price / 10_000_000)`. Puede redondearse a cero.
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
- Defaulted no se limpia al recuperar precio. Sí se cura pagando toda la deuda.
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
permite default sin frescura. Repay nunca necesita precio fresco.

Liquidación: `proceeds = floor(value * (10000 - discount_bps) / 10000)`;
`paid = min(proceeds, debt)` al prestamista, `surplus = proceeds - paid` a la
empresa, `loss = debt - paid` registrada. El comprador paga ambos tramos dentro
de la misma invocación. Un fallo en el segundo revierte también el primero.
No se guarda USDC intermedio. `expected_price` es la cotización sin descuento.

Con nominal 100, capital 50 y precio 55 %, proceeds=52,25, deuda=50,3333334,
surplus=1,9166666 USDC. Con precio 40 %, proceeds=38 y loss=12,3333334.
El comprador puede ser el prestamista si está autorizado. No se transfieren
bonos aquí; el pago no acredita entrega ni invoca Trustless Work.

## SEP-40 y catálogo

Se usan los tipos y siete lecturas del [SEP-40](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0040.md).
`Asset = Stellar(Address) | Other(Symbol)`;
`PriceData = { price: i128, timestamp: u64 }`.

| Lectura | Resultado |
| --- | --- |
| base() | Asset::Other(Symbol("USD")) |
| assets() | Vec<Asset>, catálogo completo de 0 a 64 series registradas, en orden de alta |
| decimals() | u32 = 7 |
| resolution() | u32 = 1; segundos, sin frecuencia garantizada de publicación |
| lastprice(asset) | Option<PriceData>, última publicación de serie, aunque esté vieja |
| price(asset, timestamp: u64) | Option<PriceData>, solo si timestamp coincide con la última publicación |
| prices(asset, records: u32) | Option<Vec<PriceData>>, un elemento solo si records == 1 y existe la serie |

Stellar y nombres desconocidos devuelven None. Solo se retiene la última
publicación; un consumidor comprueba timestamp. Todas las series del catálogo
siguen consultables/restaurables aunque sus préstamos estén cerrados. Capacidad
64 **durante toda la vida de esta instancia**; la serie 65 devuelve Capacity.
Eso no limita el número de préstamos por serie. Para más emisiones se despliega
otra instancia y se publica su catálogo por separado. La identidad del activo
incluye dirección del contrato; un símbolo solo no es global. No hay agregador
con una lista ilimitada ni cumplimiento de la recomendación SEP de actualizar
el contrato conservando dirección: esta implementación no es actualizable.

## Errores y reintentos

| Código | Nombre | Significado |
| --- | --- | --- |
| 1 | Invalid | Importe, id, participantes, LTV, precio o parámetros inválidos |
| 2 | Overflow | Aritmética fuera de rango |
| 3 | Exists | Préstamo o serie ya registrado |
| 4 | Missing | Préstamo o serie no registrado |
| 5 | State | Transición no permitida |
| 6 | Healthy | No se cumple umbral ni vencimiento |
| 7 | Buyer | Comprador no autorizado |
| 8 | PriceChanged | Precio diferente del esperado |
| 9 | PriceStep | Paso de precio excesivo |
| 10 | StalePrice | Precio viejo o tiempo inconsistente |
| 11 | Capacity | Ya existen 64 series en la instancia |

Firmas, saldo, trustline, recursos y restauración pueden fallar en host/SAC y
no usan esos códigos. `open` y `register_series` duplicados devuelven Exists;
liquidate repetido devuelve State. Repay después de Repaid no mueve dinero;
requiere igualmente al prestatario. Default ya marcado es inocuo. Margin
repetido es inocuo si aún cumple las guardas; con precio viejo falla StalePrice.
Permiso idéntico y precio idéntico en el mismo segundo no emiten evento nuevo.
Una escritura repetida puede mantener TTL aunque no cambie negocio.

Ante timeout consultar el hash firmado y confirmado antes de reconstruir una
transacción. Un error de red no prueba que el pago no ocurrió. No reintentar
con otro id. La unicidad es por instancia: aprovisionar otra no autoriza volver
a financiar el mismo escrow; el backend debe hacer esa comprobación global.

## Eventos, consultas y conservación

| Tema inicial y segundo tema | Datos |
| --- | --- |
| init | config |
| series, series | timestamp; el precio inicial es 100 % |
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
Cerrados no renuevan Loan ni consultan Series: conservan la foto final y pueden
archivarse. El cierre puede haber renovado al cargar el préstamo todavía vivo;
lo ya pagado no se recupera. Lecturas/reintentos posteriores no prolongan eso.

El TTL es en ledgers; no sustituye vencimiento ni fecha del precio. Simular no
persiste renovación. Preparar cada transacción mediante RPC: desde protocolo
23 puede incorporar restauración automática de entradas archivadas y su coste.
Si hace falta, restaurar por separado con RestoreFootprintOp y volver a simular.
Nunca interpretar un error de archivo/RPC como Missing. La prueba persistente
de existencia no se borra y bloquea un open repetido tras restaurar.

La web necesita un índice durable de eventos desde el ledger de despliegue.
No existe `list_loans`. Ingerir por contractId, deduplicar por event.id, guardar
cursor y ledger, y servir consultas paginadas por borrower/lender/serie. Guardar
fotos finales para mostrar cerrados sin restaurarlos. El RPC solo retiene una
ventana; comprobar getHealth y recuperar huecos desde una fuente histórica.
Para ver salud, usar get_loan; el índice de transiciones por sí solo no detecta
el paso del tiempo ni el efecto de una cotización compartida.

## Firmas y trabajo de la fase web

El servidor registra series con `BOND_ISSUER_SECRET_KEY`. Para open con origen
prestamista, simula, firma la autorización Soroban del operador con
`VAULT_SECRET_KEY` (`authorizeEntry`, vencimiento de ledger acotado), ensambla y
firma el sobre con `LENDER_SECRET_KEY`. Firmar solo el sobre con ambas claves no
sustituye la autorización. Ver [script](../scripts/loan-book-testnet.mjs).

Para Pollar, construir repay(id) con origen prestatario, simular/preparar y
firmar con signTx; require_auth y el pago anidado usan esa firma. Necesita
trustline y deuda completa en USDC, además de XLM para comisión o patrocinador.
El script verifica este patrón con una cuenta efímera, no con el navegador.

La fase web debe adoptar el nuevo id de contrato, persistir la relación serie–
préstamo–instancia, firmar open con las dos partes, reservar series exclusivas
para simulación, manejar Capacity y fuentes históricas, permitir cura en
Defaulted y separar precio, edad, descuento, excedente y pérdida en pantalla.
La liquidación de pago y entrega del bono necesitan coordinación externa antes
de presentarse como una ejecución completa de garantía.
