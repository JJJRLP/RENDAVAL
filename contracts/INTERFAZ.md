# Interfaz del libro de préstamos — fase B

`Address` es una dirección Stellar. `id` debe empezar por C y representa el
escrow; no se comprueba su existencia. Importes `i128` con siete decimales:
`10_000_000 = 1 USDC`. Nominal en equivalentes USD, misma escala. Precio `i128`
entre 1 y 10_000_000 (100 %), por préstamo, inicialmente 100 %. El valor de venta
es `floor(nominal * precio / 10_000_000)`. Se admite un valor redondeado a cero.
Tiempos `u64` en segundos Unix; umbrales `u32` en puntos básicos (7000 = 70 %).

Se omite `Env` en estas firmas:

| Función | Firma / resultado | Autorización |
| --- | --- | --- |
| `__constructor` | `(issuer: Address, usdc: Address, margin_bps: u32, default_bps: u32)` | Configuración atómica del despliegue; no existe inicializador público posterior. |
| `open` | `(id: Address, borrower: Address, lender: Address, face: i128, principal: i128)` | Prestamista; desembolsa y registra juntos. |
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
`face`, `principal`, `interest`, `due`, `status`, `price`, `loss`, `proceeds` y
`surplus`. `Config` contiene los cuatro parámetros del constructor.

`health_bps` se redondea hacia abajo para mostrarlo; las decisiones comparan
productos enteros sin redondear el ratio. Si el valor es cero, la salud devuelta
es `i128::MAX`. `overdue` expresa solo el tiempo, incluso en préstamos cerrados;
la interfaz debe atender primero a `status`.

Estados: `Active`, `Margin`, `Defaulted`, `Repaid`, `Liquidated`. Un precio
recuperado limpia Margin automáticamente; no revierte Defaulted. Se puede pagar
en Active o Margin, incluso vencido si todavía no se declaró Defaulted.
El incumplimiento bloquea la devolución por esta vía. No hay gracia adicional,
aportes de garantía, amortizaciones parciales ni actualización del contrato.
La prioridad de dos operaciones concurrentes depende del orden en el ledger.

Para Pollar: construir `repay(id)` con origen igual al prestatario, simular,
preparar recursos y firmar la transacción con `signTx`. `require_auth` y los pagos
anidados usan esa firma de origen; no se necesita una firma de autorización
separada. Las cuentas deben tener trustline y saldo de USDC, además de XLM para
comisiones. La demostración verifica este patrón con una clave efímera, no con
el navegador de Pollar.

Reintentos: `open` duplicado y `liquidate` repetido se rechazan sin mover fondos.
`repay` repetido, margen/default ya marcados, precio y permiso idénticos son
inocuos. Los errores de transferencia revierten toda la invocación, incluido el
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
