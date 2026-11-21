# Interfaz C3b — guía para integrar la web

Solo Stellar testnet. La web actual no implementa este flujo. El libro vigente es
`CAC2Y7NO6NVBOSLAKHUQKIIZ5RIIAYXUGRKRB64JPYPPSM2KZQPBPKJA`.
Direcciones, parámetros, hashes y recorridos reproducibles:
[la evidencia C3b](../scripts/evidence/c3-testnet.json).
No usar el ABI C2 con esta dirección.

## Activos, unidades y deuda

- RBOND: `CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3`.
- Reglas: `CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC`.
- USDC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.
- Emisor RBOND: `GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6`.

Dinero, nominal y precios: i128, siete decimales. En JS usar BigInt. 10.000.000
representa 1 USDC o 1 unidad de nominal del bono. Precio en [1, 10.000.000].
Tiempos: u64, segundos Unix del ledger. Puntos básicos: u32.

La empresa acepta **capital bruto**, comisión y neto antes de firmar. Para capital P:
`escrow_fee = floor(P * 30 / 10000)`, `net_disbursement = P - escrow_fee`,
`interest = ceil(P / 150)`, `debt = P + interest`. La empresa soporta el 0,3 %
si se abre; el prestamista lo soporta si TW reembolsa o si se cancela después del
release. No cobrarlo dos veces. Ejemplo: capital 20, comisión 0,06, entrega 19,94,
interés 0,1333334, deuda 20,1333334 USDC. `platformFee` debe ser cero.
Un cambio de tarifa de TW exige revisar esta fórmula; no ajustar la deuda en silencio.

Capital mínimo 1 USDC; máximo 50 % del nominal y del valor de los bonos disponibles.
Plazo: 30 días desde **open**, no desde deploy, fund o release de TW.
El libro no consulta TW ni certifica el origen del USDC: las tres partes aceptan los
importes y el código; solo el saldo exacto de esa bóveda habilita el desembolso.

## Preparar y abrir, paso por paso

1. La empresa conecta su cuenta G, crea trustlines de RBOND y USDC y firma esos XDR.
   El emisor autoriza RBOND para esa cuenta por las reglas. Servidor verifica red,
   activo, límites y autorizaciones. No enviar bonos a un escrow de TW.
2. La serie ya debe estar registrada y tener precio fresco. `register_series(series,
   classic_asset)` recibe **bytes XDR de Asset clásico**, no una dirección de contrato.
   Firma emisor. Para RBOND, serializar `new Asset('RBOND', issuer).toXDRObject().toXDR()`;
   el host deriva el SAC para la red. `publish_price` requiere al publicador.
3. Servidor construye `create_vault(salt, series, borrower, lender, face, principal)`;
   firma operador. Salt: 32 bytes únicos. Devuelve dirección C, el **id del préstamo**.
   `get_vault(id)` devuelve los términos inmutables y `delivery`, otra dirección C.
   Las dos instancias usan el mismo WASM fijado una sola vez con `set_vault_code`,
   que exige emisor y operador. Nunca aceptar una bóveda suministrada por el visitante.
4. Emisor firma `rules.set_authorized(RBOND, id, true)` y lo mismo para `delivery`.
   Servidor verifica ambas. `delivery` es custodia de entrega para el caso de un
   destinatario bloqueado; no recibe el préstamo y no permite retirar estando pendiente.
5. Empresa firma `vault.deposit(face)`. Requiere autorización raíz y transferencia
   anidada de RBOND de empresa a bóveda. También puede recibir una transferencia SAC,
   pero el servidor debe mostrar siempre la dirección exacta de su préstamo.
6. Servidor llama `POST https://dev.api.trustlesswork.com/deployer/single-release`:
   `signer`, `serviceProvider`, `platformAddress`, `releaseSigner`, `disputeResolver`
   = operador G; `approver` = prestamista G; **receiver = id de la bóveda C**.
   `amount` = capital bruto en unidades decimales del API, `platformFee: 0`, un hito
   «RBOND depositado en la bóveda», `trustline: {symbol: 'USDC', address: emisorUSDC}`.
   El emisor USDC es `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.
   Operador firma el XDR de deploy. Guardar contractId TW aparte del id del préstamo.
7. `POST /escrow/single-release/fund-escrow` con contractId TW, signer prestamista,
   amount bruto. Firma prestamista. Verificar balance real del SAC USDC, no el campo
   balance de una lista del API.
8. Servidor verifica código/configuración de ambas bóvedas, saldo y autorización
   RBOND, términos, precio, red, receiver y roles TW. Operador firma el XDR devuelto
   por `/change-milestone-status`: `milestoneIndex: '0'`, `newStatus: 'completed'`,
   `newEvidence`, `serviceProvider`. Prestamista firma `/approve-milestone` con
   `milestoneIndex: '0'` y `approver`. Operador firma `/release-funds` con `releaseSigner`.
9. Tras confirmar release, consultar `USDC.balance(id)`: debe ser exactamente el neto.
   Servidor prepara **una sola invocación propia** `book.open(id, series, borrower,
   lender, face, principal)`. Firman empresa, prestamista y operador: una autorización
   por dirección distinta. Si el operador coincide con otra parte, no duplicarla.
   Simular, firmar las autorizaciones Soroban y después el sobre. La empresa puede ser
   cuenta origen. El libro registra deuda, protege ambas custodias y hace que la bóveda
   pague el neto a la empresa en esa misma transacción. Una falla revierte todo.
10. Consultar `get_loan(id)`. Mostrar bruto, fee, neto, interés, deuda y vencimiento.
    Un release confirmado por sí solo **no** significa préstamo abierto. El dinero
    espera en la bóveda hasta open o cancelación.

Toda operación de TW se construye por el API, se firma en memoria y se envía por
`POST /helper/send-transaction {signedXdr}`. No invocar directamente su contrato ni
usar un adaptador. Persistir hash antes de enviar; ante timeout consultar ese hash
hasta saber el resultado. No repetir pagos con un XDR nuevo por una respuesta incierta.
No guardar claves ni sobres firmados en evidencia. El API expresa montos en unidades
decimales; no convertir cantidades arbitrarias con pérdida de precisión de Number.

## Cancelación y salidas de la bóveda

Antes de open, **empresa o prestamista** puede firmar `book.cancel(id, party)`.
La autorización incluye la llamada anidada `vault.cancel(party)`. Operador no tiene
facultad propia para cancelar. La bóveda queda Closed definitivamente y no puede abrirse.
También existe `vault.cancel(party)` directo; para completar la asignación de la
custodia auxiliar, usar la ruta del libro. Cancelar no mueve fondos y no registra deuda.

Después, cualquiera puede ejecutar por separado:

| Llamada a bóveda | Destino fijo | Cuándo |
| --- | --- | --- |
| `collect_bonds()` | Empresa tras cancelar/pagar; comprador tras liquidar; prestamista tras write_off | Closed |
| `refund_usdc()` | Prestamista original | Closed |

No existe argumento para elegir receptor, token o importe. Si el receptor no puede
recibir, la transferencia falla y el saldo queda disponible para reintentar. Una
salida de bonos bloqueada no impide ejecutar por separado el reembolso USDC.
Los depósitos tardíos siguen estas mismas reglas: nunca reabren ni vuelven a proteger
un préstamo cerrado. Mientras está Active no existe retiro independiente de saldo.
USDC extra que llegue durante Active se devuelve al prestamista después del cierre.

Si el dinero sigue en TW, prestamista firma `/dispute-escrow {contractId, signer}`;
operador firma `/resolve-dispute {contractId, disputeResolver, distributions:
[{address: prestamista, amount: saldoBruto}]}`. TW descuenta el 0,3 %. El resolver no
puede ser quien abre la disputa. No distribuir a la empresa en esta ruta. Cancelar
la bóveda no demuestra ni ordena un refund TW; mostrar ambos estados por separado.

Sin fondeo/release, no hay saldo y no se abre. Release anterior a los bonos deja
USDC esperando; release posterior a cancelación deja USDC reembolsable. Monto distinto,
resolución parcial o sobrepago impiden open: cancelar y recuperar, sin compensaciones
ocultas. Ofrecer el mismo escrow a otro préstamo no crea saldo en esa otra bóveda.
No se usan `released`, `resolved`, eventos históricos ni balances de terceros para
activar o cancelar una deuda.

## Préstamos vivos y cierre

`get_loan(id)` devuelve `View {loan, debt, value, health_bps, overdue, shortfall}`.
`Loan` conserva asset, borrower, lender, recipient, face, principal, interest, price,
price_time, due, defaulted_at, default_price, status, collateral, proceeds, surplus,
loss; añade `escrow_fee` y `net_disbursement`. `health_bps` es Option<i128>:
None = no calculable; nunca mostrarlo como sano. `Collateral` contiene balance,
authorized y known. `value = min(face, balance) * price / 10000000`.
Los terminales conservan la foto de garantía anterior a la entrega, no el saldo
actual: consultar el SAC si se quiere mostrar depósitos tardíos.

Estados: Active, Margin, Defaulted, Repaid, Liquidated, WrittenOff. Antes de open,
consultar `get_vault` y `vault.get_config`: Pending o Closed; no existe aún `Loan`.

| Función del libro | Firma / condición |
| --- | --- |
| `flag_margin(id)` | Cualquiera; ratio >= margin, cotización fresca. |
| `mark_default(id)` | Cualquiera; ratio >= default con precio fresco, deterioro legible, o mora posterior a due + grace. |
| `repay(id)` | Empresa; deuda completa. Admite Active, Margin o Defaulted. Reintento Repaid no paga de nuevo. |
| `liquidate(id, buyer, expected_price)` | Comprador; Defaulted y cura cumplida, permiso de comprador y autorización RBOND, precio fresco y esperado igual a max(actual, default_price). |
| `write_off(id)` | Cualquiera; 180 días desde la primera marca de default. Sin cotización ni comprador. |
| `claim(recipient)` | Dueño del crédito USDC; paga solo a su propia dirección. |
| `claimable(recipient)` | Lectura de créditos pendientes en este libro. |
| `release_pledge(id)` | Compatibilidad idempotente para terminales; el cierre ya retiró las marcas. |

Repay cobra deuda y entrega bonos; si el prestamista no recibe USDC, crea crédito
respaldado en el libro. Si la empresa no recibe RBOND, los bonos pasan a `delivery`
asignada irrevocablemente a la empresa. **Ambas prendas se retiran en el cierre**,
sin esperar que reclame. `delivery.collect_bonds()` solo paga a ese beneficiario y
el SAC exige su autorización. Las reglas pueden revocar la custodia después del
cierre: la protección de prenda no continúa sobre activos ya entregados en custodia.

Liquidate cobra `floor(value * (10000-discount_bps) / 10000)` y transfiere todos los
bonos presentes de la bóveda al comprador en la misma transacción; **no usa fallback**.
Si no caben en su trustline, se revierten cobro, créditos, préstamo y prendas.
Prestamista cobra primero hasta deuda; resto a empresa; faltante queda en loss.
Cada pago USDC fallido queda como crédito separado. Claim fallido conserva el crédito.

Write_off entrega los bonos al prestamista si está autorizado; si no puede recibir,
los deja en la custodia delivery ya autorizada, asignada al prestamista. Registra toda
la deuda USDC como loss, proceeds=0: **no** inventa un precio ni un cobro. Es cierre con
recuperación en especie, cuyo valor económico no se estima. No permite que una cuenta
sin aprobación del emisor reciba RBOND. Se retiran ambas marcas aunque el prestamista
no reclame. Reintentar no repite la entrega. El plazo de 180 días no se acorta en demo.

No existe `accept_collateral`: nadie firma una renuncia para retirar la protección.
No hay retirada administrativa de activos ni acceso de una bóveda a otra. Las dos
instancias de un préstamo solo aceptan cambios de estado de su libro original.

## Precios, configuración y sustitución

Constructor del libro conserva el orden:
`operator, issuer, usdc, rules, margin_bps, default_bps, max_step_bps, max_price_age,
discount_bps, price_interval, grace_period, cure_period`.
Exige issuer != operator, 5034 <= margin < default <= 10000, paso 1..2500,
descuento <10000, y edad, intervalo, gracia y cura positivos.
Demo: 7000, 8500, 2500, 86400 s, 500, 30 s, 30 s, 60 s respectivamente.

`publisher` empieza como emisor; `set_publisher(address)` exige emisor y operador.
`publish_price(series, price)` exige publisher; `set_buyer(buyer, allowed)` exige
emisor. Cada cambio respeta paso máximo y tiempo mínimo desde el último cambio;
republicar igual renueva frescura sin reiniciar el intervalo. Cambios posteriores no
reducen `default_price`, fijado al primer default. Publicar no recorre préstamos.
Margin se limpia al consultar/tocar con precio fresco si recuperó; Defaulted solo
se cierra pagando, liquidando o agotando el plazo de write_off.

SEP-40: base USD, decimals 7, resolution = price_interval; `lastprice`, `price` y
`prices` retienen la última publicación. `list_series` publica opcionalmente hasta
64 nombres; no limita registro ni lectura directa de otras series. Nombres inmutables.

La sustitución sigue `rules.replace_book(new)` con emisor y operador, solo con
`live_pledges == 0`. Cada préstamo activo tiene dos marcas; el cierre retira las dos.
El libro viejo conserva créditos cobrables allí; sus bóvedas pendientes siguen
siendo cancelables y reembolsables aunque ya no puedan abrir. Nunca mover sus créditos a otro libro
por una lectura externa. Conservar red, id de libro e id de bóveda junto a cada operación.
Eventos del libro: vault, open, cancel, price, default, margin, repay, liquidate,
writeoff, credit, claim, publisher, buyer, series, listed e init. Para recuperar un
resultado siempre consultar el contrato: un evento de reintento no cambia el estado
terminal, y cancelar una bóveda cerrada no transforma un préstamo ya pagado.

La retención de eventos RPC es limitada. Mantener un índice por hashes e ids para
la web; ninguna función enumera toda la cartera. Estado persistente e instancia tienen
TTL; lecturas reales extienden lo usado, simulaciones no. Restaurar entradas archivadas
antes de operar. No confundir ausencia de un índice con ausencia de deuda.
