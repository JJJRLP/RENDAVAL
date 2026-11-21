> **C3 está incompleta y no desplegada.** Véase [el informe C3](C3-REPORT.md):
> bloqueo de integración TW V1, pruebas reproducibles y correcciones locales.
> El texto C2 que sigue describe el despliegue vigente; no el ABI local modificado.

## Cambios del ABI local pendientes de despliegue

No usar estos campos contra la dirección C2 vigente:

- `Config.publisher: Address`, inicialmente el emisor. `set_publisher(publisher)`
  exige emisor y operador, emite `publisher(publisher)` si cambia y es idempotente.
  `publish_price` exige al publicador; `set_buyer` sigue exigiendo al emisor.
- `Loan.default_price: i128`, fijado en la primera marca de default. La oferta de
  liquidación se construye con `max(loan.price, loan.default_price)` y se pasa como
  `expected_price`. La frescura de la publicación sigue siendo obligatoria.
- `View.health_bps: Option<i128>`; `None` significa ratio no calculable. Mostrar
  «No disponible», nunca un valor sano. Revisar también `collateral.known`.
- Constructor: emisor distinto de operador, `5034 <= margin < default <= 10000`,
  `1 <= max_step_bps <= 2500`. El resto de límites C2 sigue vigente.
- `open` comprueba emisor, operador y libro en reglas. El servidor prepara una sola
  entrada por dirección distinta; si operador=prestamista, esa entrada incluye la
  transferencia USDC; si operador=empresa, basta la autorización de la empresa.

El flujo de TW y la bóveda aún no tienen una especificación implementada. No activar
una deuda usando únicamente `resolved` o el saldo cero del escrow; el informe explica
el contraejemplo. La sección siguiente se conserva como referencia del despliegue C2.

# Interfaz C2 — especificación para la web

Usar Stellar testnet y las direcciones de [la evidencia](../scripts/evidence/loan-book-testnet.json):
`contractId`, `rulesContractId`, `bondToken`, `usdc`, `issuer`. El bono es RBOND.
La siguiente fase conecta esta interfaz; la web actual todavía no la usa.

## Datos y reglas

Un préstamo se identifica por `(red, contractId, id)`. `id` es la dirección C del
escrow y nunca se reutiliza en un libro. Operador y prestamista comprueban código,
roles y condiciones de salida del escrow antes de autorizar una deuda. El contrato
no certifica Trustless Work ni la identidad del token registrado.

Todos los importes son i128 de siete decimales: 10.000.000 = 1 USDC. JS usa BigInt,
nunca Number para dinero. Precio entero en [1, 10.000.000], como fracción de nominal.
Una unidad del bono equivale a una unidad de nominal USD. Los tiempos son u64 del
ledger en segundos Unix; puntos básicos e intervalo de precio son u32.

Capital mínimo 1 USDC; máximo 50 % del nominal y del valor real disponible.
Interés `ceil(principal / 150)`: 8 % anual, 30/360. `due = apertura + 2592000`.
Deuda = principal + interés. Valor = `min(face, saldo actual) * precio / 10000000`.
La salud compara productos enteros, no el ratio redondeado de la pantalla.

Config contiene los argumentos del constructor:
`operator, issuer, usdc, rules: Address`, `margin_bps, default_bps, max_step_bps,
discount_bps, price_interval: u32`, `max_price_age, grace_period, cure_period: u64`.
El orden de argumentos es operator, issuer, usdc, rules, margin_bps, default_bps,
max_step_bps, max_price_age, discount_bps, price_interval, grace_period, cure_period.
Se exige `5000 < margin < default <= 10000`, paso en 1..10000, descuento <10000,
edad e intervalo, gracia y cura positivos.

Demo: margen 7000, default 8500, paso 2500, edad 86400, descuento 500,
intervalo 30, gracia 30, cura 60. Referencia real: intervalo 86400, gracia 259200,
cura 259200; demás valores iguales. El plazo contractual no cambia para el demo.

`Series = { token: Address, quote: PriceData, changed_at: u64 }`.
Al registrar, quote tiene price=0 y timestamp=0: representa ausencia de publicación,
no cotización utilizable. `changed_at` es la fecha del último cambio de valor.
`PriceData = { price: i128, timestamp: u64 }`; timestamp es la última publicación.
`Collateral = { balance: i128, authorized: bool, known: bool }`.
`Loan` contiene asset (Symbol), borrower, lender, recipient (Address), face,
principal, interest, price, loss, proceeds, surplus (i128), due, price_time,
defaulted_at (u64), status y collateral. recipient es la empresa hasta liquidación;
al liquidar pasa a ser el comprador, con derecho a aceptar la entrega de la garantía.
`View = { loan, debt, value, health_bps: i128, overdue: bool, shortfall: Option<i128> }`.
Mapas ScVal representan structs; enums se codifican como vectores etiquetados.

## Operaciones del libro

Se omite Env. Las escrituras devuelven Result<(), Error>, salvo set_buyer (void).

| Función | Argumentos | Firma / efecto |
| --- | --- | --- |
| register_series | series: Symbol, token: Address | Emisor. Vínculo permanente, sin precio publicado. |
| publish_price | series: Symbol, price: i128 | Emisor/publicador. Primera cotización libre dentro del rango. |
| list_series | series: Symbol | Emisor. Catálogo opcional, máximo 64. |
| open | id: Address, series: Symbol, borrower: Address, lender: Address, face: i128, principal: i128 | Empresa, operador y prestamista. Comprueba garantía, precio y reglas; protege y desembolsa atómicamente. |
| flag_margin | id: Address | Cualquiera; deuda/valor >= margen y precio fresco. |
| mark_default | id: Address | Cualquiera; deterioro de garantía, umbral de default fresco, o ahora > due + gracia. |
| repay | id: Address | Empresa; paga deuda completa, también durante Defaulted. |
| set_buyer | buyer: Address, allowed: bool | Emisor. Admite o retira comprador. |
| liquidate | id: Address, buyer: Address, expected_price: i128 | Comprador; Defaulted, cura cumplida, permiso del libro y autorización SAC, garantía legible/autorizada, precio fresco e igual al esperado. |
| claim | recipient: Address | Receptor; cobra todo su crédito USDC pendiente en este libro. |
| release_pledge | id: Address | Cualquiera; cerrado y saldo actual del escrow cero. |
| accept_collateral | id: Address | Beneficiario (`loan.recipient`); cerrado. Acepta la entrega o renuncia al saldo residual y retira la marca incluso con polvo. |
| get_config | sin argumentos | Config. |
| get_series | name: Symbol | Result<Series, Error>. |
| get_loan | id: Address | Result<View, Error>. |
| get_price | id: Address | Result<i128, Error>; precio del préstamo. |
| is_buyer | buyer: Address | bool. |
| claimable | recipient: Address | i128; crédito pendiente, 0 si no existe. |

Estados: Active, Margin, Defaulted, Repaid, Liquidated. Los dos últimos son
terminales. Margin se limpia al consultar/tocar ese préstamo si el precio es fresco
y ya no cruza el umbral. Publicar no recorre préstamos. Simular no persiste cambios.
Defaulted no se limpia por recuperación de precio: se cura pagando toda la deuda.
Una segunda marca de default no reinicia defaulted_at. Se puede liquidar cuando
`ahora >= defaulted_at + cure_period`; antes falla Cure. Repay gana si confirma antes.
La gracia solo retrasa default por mora, no el deterioro de garantía ni de precio.
`overdue` sigue significando `ahora > due`; no equivale a permiso de default.

Cada cambio exige `abs(nuevo-anterior) <= max(1, floor(anterior*paso/10000))`
y `ahora >= changed_at + price_interval`. No se acumulan pasos por tiempo ocioso.
Republicar el mismo valor renueva timestamp sin cambiar changed_at; no habilita
otro cambio anticipado. Repetir mismo valor en mismo segundo no emite evento.
Edad <= max_price_age es válida. Sin publicación no se puede abrir.

Liquidación: proceeds = floor(value * (10000-descuento)/10000),
paid = min(proceeds, debt), surplus = proceeds-paid, loss = debt-paid.
El comprador paga proceeds al libro; el libro intenta entregar paid al prestamista
y surplus a la empresa. Cada entrega fallida queda como crédito independiente.
Repay hace lo mismo con la deuda completa del prestamista. El cierre y el crédito
son atómicos con el cobro: nunca hay cierre sin pago ni crédito sin respaldo.
La incapacidad del receptor no permite forzar default ni detener la liquidación.

`claimable` suma créditos de varios préstamos. `claim` requiere al dueño y solo
paga a su misma dirección; restaurar trustline/autorización/capacidad primero.
Un fallo revierte la retirada del crédito. Repetir después de cobrar no paga otra vez.
El libro no tiene retirada administrativa de USDC. Los créditos sobreviven al cierre
y a la sustitución del libro en reglas: se cobran en la instancia que recibió el dinero.

Precio viejo impide abrir, margen, default por precio y liquidar. Mora pasada la
gracia y deterioro legible permiten default sin precio fresco. Repay no necesita
precio fresco ni garantía completa/autorizada. Si el publicador deja de publicar,
liquidar queda pendiente: no se usa una cotización vieja como precio de venta.

Los bonos no pasan por el libro. Liquidate no acredita entrega ni llama TW. Una
prenda sigue protegida después de pagar/liquidar hasta release_pledge o la aceptación
del beneficiario. No pedir accept_collateral al usuario sin explicar que retira la
protección de cualquier saldo restante. Con deuda viva ambas salidas fallan State.

## Reglas del bono

Constructor `(issuer, book, operator: Address)`; book debe ser C. Emisor y operador
quedan fijos. El admin del SAC permanece en reglas; no hay set_admin ni upgrade.

| Función | Argumentos / resultado | Autorización |
| --- | --- | --- |
| get_config | () → { issuer, book, operator } | Lectura. |
| live_pledges | () → u64 | Número de marcas, no número de escrows con saldo. |
| pledged | token, holder: Address → bool | Lectura; renueva la marca. |
| set_authorized | token, holder: Address, authorized: bool | Emisor; false falla si hay prenda. |
| protect | token, holder: Address | Solo libro actual; holder debe ser C. |
| release | token, holder: Address | Solo libro actual; el libro verifica cierre y saldo o consentimiento. |
| replace_book | book: Address | Emisor y operador; contador de prendas igual a cero y nueva dirección C. |

No invocar protect/release desde el servidor: la autorización es contractual.
Repetir una marca o retirarla dos veces no cambia el contador dos veces. El contador
en instance no desaparece si se archiva una marca persistente. Debe restaurarse la
entrada para operarla. Para sustituir: desplegar y verificar nuevo libro, cerrar
préstamos, entregar garantías, retirar marcas, comprobar contador cero y firmar el
cambio con ambas autoridades. No cambiar el SAC ni el activo. El libro retirado
conserva sus créditos; informar a cada receptor dónde reclamarlos.

## Firmas: servidor y empresa, paso a paso

1. **Preparar identidades.** Servidor comprueba red, SAC RBOND y flags de la
   evidencia. Empresa firma sus `changeTrust` para RBOND y USDC con Pollar `signTx`.
   El emisor firma `reglas.set_authorized(SAC, empresa, true)` en el servidor y
   un pago clásico RBOND a la cuenta aprobada. No usar SAC.mint.
2. **Registrar y cotizar.** Servidor construye register_series(nombre exclusivo,
   SAC) y publish_price(nombre, precio inicial explícito); emisor firma ambos.
   Confirmar antes de abrir. No usar list_series para cada visitante: no es un índice
   de usuarios. El backend controla a qué flujo pertenece cada serie.
3. **Crear y financiar escrow.** Usar rutas oficiales TW de la próxima fase.
   Servidor valida código, roles y salidas. Emisor firma aprobación del escrow C y
   de los receptores TW necesarios. Empresa firma el depósito de bonos. Confirmar
   saldo y autorización; el intervalo anterior a open todavía no tiene prenda.
4. **Abrir con consentimiento de la empresa.** Servidor construye una transacción
   con **source = cuenta G de la empresa**, una sola operación open y todos sus
   argumentos finales. Carga secuencia de esa cuenta, fija red testnet, comisión
   y tiempo de expiración. Simula para obtener recursos y árbol de autorizaciones.
   La autorización de la empresa debe usar `SorobanCredentialsSourceAccount`.
   Servidor verifica cada árbol: open exacto, nominal, capital, serie, escrow,
   empresa, prestamista y transferencia anidada USDC lender→borrower por principal.
   Firma las entradas de dirección del operador con VAULT_SECRET_KEY y del
   prestamista con LENDER_SECRET_KEY mediante `authorizeEntry`, red testnet y
   vencimiento de ledger acotado. Si ambos roles coinciden se firma la entrada
   correspondiente; nunca aceptar direcciones o invocaciones inesperadas.
   Ensambla la transacción con esas entradas y los recursos simulados. Envía el
   XDR **sin firma de la empresa** al navegador, mostrando importes, interés, plazo,
   escrow y participantes. Empresa firma ese sobre una sola vez con Pollar signTx.
   El servidor verifica que volvió exactamente el mismo cuerpo, conserva el hash,
   envía y espera confirmación. No cambia secuencia, argumentos ni recursos tras
   esa firma. Si expiró, reconstruye, vuelve a autorizar y solicita nueva firma.
   No hace falta que el navegador firme entradas Soroban separadas. Firmar el sobre
   con operador/prestamista no sustituye sus entradas authorizeEntry. Confirmar
   get_loan, evento open y pledged=true antes de mostrar desembolso realizado.
5. **Publicar y vigilar.** Servidor firma precios con el emisor y respeta intervalo
   y paso. Cualquiera puede enviar flag_margin o mark_default, firmando su propio
   sobre para comisión. Mostrar due, gracia y defaulted_at+cura. Nunca ocultar
   la opción de pagar mientras no exista liquidación confirmada.
6. **Pagar/curar.** Servidor construye repay(escrow), source=empresa, simula y
   entrega XDR. Empresa firma el sobre con signTx; esa firma cubre require_auth
   y transferencia anidada empresa→libro. Confirmar Repaid; mostrar por separado
   crédito del prestamista y protección de la garantía. Repay repetido no cobra.
7. **Liquidar.** Servidor consulta estado, precio/edad, saldo, autorización de bono
   del comprador y permiso del libro. Emisor firma set_buyer si procede. Una vez
   cumplida cura, construye liquidate(id, buyer, expected_price), source=comprador.
   El comprador firma; en la corrida el prestamista firma en servidor. Si cambia
   el precio, volver a mostrar la oferta antes de reconstruir. Confirmar Liquidated,
   proceeds, loss, surplus y créditos. Ejecutar después la entrega TW con sus roles.
8. **Cobrar pendiente.** El receptor restaura su trustline y capacidad. Servidor
   construye claim(recipient), source=recipient. La empresa firma con signTx para
   su excedente; el prestamista firma su propia transacción en servidor. Confirmar
   saldo y claimable=0. No confundir cierre de préstamo con recepción inmediata.
9. **Entregar y liberar.** Seguir rutas TW y firmas de sus roles; esta fase no las
   sustituye. Con escrow vacío cualquiera envía release_pledge, firmando su sobre.
   Si queda polvo o saldo que el beneficiario decide aceptar sin protección,
   construir accept_collateral(id), source=loan.recipient y explicar su efecto.
   Ese beneficiario firma (empresa tras repay, comprador tras liquidate). Confirmar
   pledged=false. No depositar de nuevo en un escrow cerrado.

El ejecutor C2 demuestra source=empresa más firmas de autorización del servidor.
En la corrida empresa=operador; Rust comprueba roles separados. La integración
Pollar del navegador y las autorizaciones concretas de TW son trabajo de la próxima fase.

## Lecturas SEP-40, errores y conservación

Se conserva la forma de llamadas del [SEP-40](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0040.md).
Este publicador manual no ofrece historial uniforme ni ticks periódicos: timestamp
es la fecha real del ledger, sin alineación a intervalos. No usarlo como fuente
TWAP ni asumir una serie temporal regular a partir de resolution.

Asset = Stellar(Address) | Other(Symbol). base() = Other("USD"), decimals()=7.
assets() devuelve hasta 64 series que el emisor eligió listar. No enumera todas.
resolution() devuelve price_interval (30 en demo); no garantiza publicaciones.
lastprice(asset) devuelve la última publicación o None si no existe/publicó.
price(asset, timestamp) solo devuelve esa última si coincide la fecha.
prices(asset, records) devuelve un vector de un dato para todo records>0 si existe;
para 0 devuelve None. No hay historial. Asset::Stellar y nombres desconocidos dan None.

Las vistas abiertas leen balance y autorización del token de su serie. Fallos
recuperables o saldo negativo producen known=false, shortfall=None y value=0:
no mostrar eso como prueba de saldo cero. Un saldo legible insuficiente o congelado
sí permite default. Closed conserva foto del cierre; debt es deuda histórica,
no deuda pendiente. release_pledge lee saldo actual por separado; accept_collateral
no necesita una lectura del token. Tokens hostiles pueden agotar recursos o mentir;
no afectan a series independientes en transacciones independientes.

| Código libro | Nombre |
| --- | --- |
| 1 | Invalid: importes, participantes, precio o parámetros inválidos |
| 2 | Overflow |
| 3 | Exists |
| 4 | Missing |
| 5 | State |
| 6 | Healthy |
| 7 | Buyer: falta permiso del libro o autorización del bono |
| 8 | PriceChanged |
| 9 | PriceStep |
| 10 | StalePrice |
| 11 | Capacity: solo catálogo opcional |
| 12 | Collateral: insuficiente al abrir o congelado |
| 13 | CollateralRead |
| 14 | Rules: admin o vínculo incorrectos |
| 15 | Nonempty: liberar automáticamente requiere escrow vacío |
| 16 | Payment: falló transferencia USDC; claim fallido conserva crédito |
| 17 | PriceRate: intervalo entre cambios no cumplido |
| 18 | Cure: todavía no se puede liquidar |
| 19 | Unpublished: falta publicación inicial |

Reglas: 101 Pledged, 102 Nonempty reservado por compatibilidad, 103 Invalid,
104 Overflow. Errores de autenticación/recursos/restauración del host no son errores
de negocio: interpretar tipo y contrato de origen. El libro captura los fallos
recuperables de USDC, sin presentar números del token como si fueran su enum.

Eventos del libro: init(config), series(series, token, timestamp), listed(series),
buyer(buyer, allowed), open(id, loan), price(series, price, timestamp),
margin(id, flagged), default(id, loan), repay(id, amount, loan),
liquidate(id, buyer, loan), credit(recipient, amount), claim(recipient, amount).
Reglas: init(config), pledge(token, holder, pledged), authorized(token, holder,
authorized), book(previous, book). El primer nombre es tema; id/serie/receptor son
temas cuando el tipo los declara. Las transferencias exitosas tienen eventos SAC.
Reintentos sin cambio no repiten eventos; renew TTL no es cambio de negocio.

Préstamos, series, catálogo, permisos, créditos y marcas usan persistent. Config y
contador usan instance. TTL/umbral: 2073600/1036800 ledgers. Abiertos y créditos
consultados renuevan; cerrados conservan foto sin renovar préstamo. Entradas archivadas
se restauran, nunca se consideran inexistentes para reutilizar ids o evadir marcas.
Simular no renueva TTL. Preparar mediante RPC y restaurar footprint cuando corresponda.

Ante timeout buscar el hash original antes de reconstruir. Open y registro repetidos
fallan Exists; liquidación repetida State; repay tras Repaid y claim sin crédito son
inocuos pero exigen firma. No hay list_loans ni índice global de visitantes. Conservar
id del escrow; un índice histórico opcional deduplica por red, contrato y event.id.
No prometer retención eterna de getEvents. [ESCALA.md](ESCALA.md) explica el modelo.
