# Interfaz del libro de préstamos — fase B

`Address` es una dirección Stellar. `id` debe empezar por C y representa el
escrow; no se comprueba su existencia. Importes `i128` con siete decimales:
`10_000_000 = 1 USDC`. Nominal en equivalentes USD, misma escala. Precio `i128`
entre 1 y 10_000_000 (100 %), por préstamo, inicialmente 100 %. El valor de garantía
es `floor(nominal * precio / 10_000_000)`. Se admite un valor redondeado a cero.
Tiempos `u64` en segundos Unix; umbrales `u32` en puntos básicos (7000 = 70 %).

Se omite `Env` en estas firmas:

| Función | Firma / resultado | Autorización |
| --- | --- | --- |
| `__constructor` | `(operator: Address, issuer: Address, usdc: Address, margin_bps: u32, default_bps: u32, max_step_bps: u32, max_price_age: u64, discount_bps: u32)` | Configuración atómica del despliegue; no existe inicializador público posterior. |
| `open` | `(id: Address, borrower: Address, lender: Address, face: i128, principal: i128)` | Operador y prestamista; desembolsa y registra juntos. |
| `publish_price` | `(id: Address, price: i128)` | Emisor. |
| `set_buyer` | `(buyer: Address, allowed: bool)` | Emisor; alta o revocación. |
| `flag_margin` | `(id: Address)` | Cualquiera, deuda/valor >= margen. |
| `mark_default` | `(id: Address)` | Cualquiera, deuda/valor >= incumplimiento **o** ahora > vencimiento. |
| `repay` | `(id: Address)` | Prestatario; paga deuda completa. |
| `liquidate` | `(id: Address, buyer: Address, expected_price: i128)` | Comprador autorizado; precio debe coincidir y estado ser Defaulted. |
| `get_loan` | `(id: Address) -> View` | Lectura pública. |
| `get_price` | `(id: Address) -> i128` | Lectura pública. |
| `get_config` | `() -> Config` | Lectura pública. |
| `is_buyer` | `(buyer: Address) -> bool` | Lectura pública. |

Las escrituras devuelven `Result<(), Error>`, excepto `set_buyer`, que devuelve
void. Lecturas de préstamo y precio devuelven `Result<..., Error>`. El WASM
contiene la especificación para generar clientes. `View` contiene `loan`,
`debt`, `value`, `health_bps` y `overdue`. `Loan` contiene `borrower`, `lender`,
`face`, `principal`, `interest`, `due`, `status`, `price`, `loss`, `proceeds`,
`surplus`, `asset` y `price_time`. `Config` contiene los ocho parámetros del constructor.

`health_bps` se redondea hacia abajo para mostrarlo; las decisiones comparan
productos enteros sin redondear el ratio. Si el valor es cero, la salud devuelta
es `i128::MAX`. `overdue` expresa solo el tiempo, incluso en préstamos cerrados;
la interfaz debe atender primero a `status`.

Estados: `Active`, `Margin`, `Defaulted`, `Repaid`, `Liquidated`. Un precio
recuperado limpia Margin automáticamente; no revierte Defaulted. Se puede pagar
en Active, Margin o Defaulted, incluso vencido, hasta la liquidación.
La devolución completa cura el incumplimiento y deja el préstamo Repaid. No hay gracia adicional,
aportes de garantía, amortizaciones parciales ni actualización del contrato.
La prioridad de dos operaciones concurrentes depende del orden en el ledger.

Para Pollar: construir `repay(id)` con origen igual al prestatario, simular,
preparar recursos y firmar la transacción con `signTx`. `require_auth` y los pagos
anidados usan esa firma de origen; no se necesita una firma de autorización
separada. Las cuentas deben tener trustline y saldo de USDC, además de XLM para
comisiones. La demostración verifica este patrón con una clave efímera, no con
el navegador de Pollar.

Reintentos: `open` duplicado y `liquidate` repetido se rechazan sin mover fondos.
`repay` repetido, margen/default ya marcados, permiso idéntico son inocuos. Repetir el precio refresca su fecha y emite
un evento; si precio y segundo son idénticos, no cambia nada. Los errores de transferencia revierten toda la invocación, incluido el
estado y el primer tramo de una liquidación. No hay saldo USDC intermediario en
el libro: el SAC transfiere directamente entre las partes.

| Código | Error | Significado |
| --- | --- | --- |
| 1 | Invalid | Importe, dirección de id, precio, participantes, umbral o LTV inválido. |
| 2 | Overflow | Aritmética fuera de rango. |
| 3 | Exists | Identificador ya registrado. |
| 4 | Missing | Préstamo inexistente. |
| 5 | State | Transición no permitida. |
| 6 | Healthy | No se cumple el umbral ni el vencimiento aplicable. |
| 7 | Buyer | Comprador no autorizado. |
| 8 | PriceChanged | Cotización distinta de la aceptada por el comprador. |
| 9 | PriceStep | Cambio mayor que el paso máximo. |
| 10 | StalePrice | Precio demasiado antiguo. |

Errores de firma, trustline, saldo y recursos provienen del host/SAC; no son estos
códigos. Todos los productos y sumas monetarios se comprueban antes de usarse.

## Eventos y duración

Eventos tipados: `init`, `buyer`, `open`, `price`, `margin`, `default`, `repay`,
`liquidate`. El segundo tema identifica préstamo o comprador cuando corresponde;
los datos incluyen precio, permiso, estado completo o importe según la acción.
No se emiten cambios de negocio al repetir una operación inocua.

Préstamos y permisos usan almacenamiento persistente. Al leer o escribir se
renueva a 2.073.600 ledgers cuando quedan menos de 1.036.800; también se renuevan
instancia y código. Equivale aproximadamente a 120/60 días a cinco segundos por
ledger, con margen sobre el plazo de 30 días. El TTL depende de ledgers y límites
de red, no de un reloj garantizado. Las simulaciones de lectura **no** persisten
renovaciones: para mantenimiento hay que enviar una invocación real o una
operación de extensión. Las entradas archivadas deben restaurarse antes de
usarse; nunca se borran los préstamos cerrados ni se reutilizan sus ids.


## Precio, descuento y SEP-40

Parámetros A2: margen 7000, incumplimiento 8500, paso máximo 2500
(25 % del precio anterior), vigencia 86400 segundos (24 horas) y descuento
500 (5 %). Se exige paso > 0 y <= 10000, vigencia > 0, descuento < 10000 y
5000 < margen < incumplimiento <= 10000. Son inmutables.

Cada publicación cumple `abs(nuevo - anterior) * 10000 <= anterior * max_step_bps`.
Se acepta la igualdad. El precio sigue limitado a (0, 100 %].
100→80→65→50 es válido; para volver se puede usar
50→62,5→78,125→97,65625→100. El servidor de fase B debe esperar confirmación
de cada paso. No es un límite acumulado diario: se pueden publicar varios
pasos seguidos, incluso en un mismo ledger. El operador autoriza el precio
inicial de 100 % al abrir; después publica el emisor.

La antigüedad usa el reloj del ledger, no una fecha enviada por el cliente.
Hasta 86400 segundos inclusive es fresco. Un precio viejo bloquea margen,
incumplimiento por precio y liquidación. Ahora > due permite declarar
incumplimiento sin precio fresco; ahora == due todavía no es mora.
Republicar el mismo precio renueva price_time (u64, segundos Unix), que también
se incluye en el evento price como timestamp. Repay no necesita precio fresco.

El comprador paga `floor(value * (10000 - discount_bps) / 10000)`.
Primero cobra el prestamista hasta la deuda; el excedente va a la empresa;
la diferencia no cubierta queda en loss. expected_price sigue siendo el precio
sin descuento. Con nominal 100 USDC, capital 50 y precio 55 %, el pago es
52,25, deuda 50,3333334 y excedente 1,9166666 USDC. A precio 40 %, el pago es
38 y la pérdida es 12,3333334 USDC.

Se leyó el [texto SEP-40](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0040.md).
Se implementan sus siete lecturas con los tipos y firmas del estándar:

| Función | Resultado |
| --- | --- |
| base() | Asset::Other(Symbol("USD")) |
| assets() | Vec<Asset> con todos los préstamos, incluidos los cerrados |
| decimals() | 7 |
| resolution() | 1 segundo; publicaciones bajo demanda, sin frecuencia garantizada |
| lastprice(asset) | Option<PriceData> con price y timestamp |
| price(asset, timestamp) | Última publicación solo si coincide exactamente la fecha; si no, None |
| prices(asset, records) | Vector de un registro si records == 1; si no, None |

Cada apertura asigna Asset::Other con Symbol BOND_ seguido por un índice
hexadecimal de ocho dígitos, empezando por BOND_00000000. El nombre está en
loan.asset y es único dentro de esta instancia. Cotiza esa garantía por unidad
de nominal USD, no el token VBOND global. El escrow no es un contrato de token,
por eso no se presenta como Asset::Stellar. Activos desconocidos o variantes
Stellar devuelven None. Solo se conserva el último registro; los consumidores
deben comprobar timestamp incluso tras el cierre. No se consulta Reflector ni
otra fuente externa: los tipos locales tienen la representación SEP-40.
La instancia no es actualizable, por requisito del producto; no cumple la
recomendación del SEP de mantener la dirección mediante actualizaciones.

Fase B debe usar la dirección nueva, obtener loan.asset para lecturas estándar,
firmar open con operador y prestamista, permitir repay en Defaulted y mostrar
precio, antigüedad, pago con descuento y pérdida por separado. La lista assets
se guarda completa: antes de escalar hay que revisar el coste y los límites
de almacenamiento de esa enumeración.


Para abrir con origen prestamista, el servidor simula open, firma la entrada de
autorización del operador con VAULT_SECRET_KEY (authorizeEntry, vencimiento de
ledger acotado), ensambla y firma la transacción con LENDER_SECRET_KEY. Firmar
solo el sobre con ambas claves no sustituye esa autorización Soroban.
El script de testnet muestra el flujo completo sin guardar claves.
