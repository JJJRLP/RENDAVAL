# Escala del libro de préstamos — A4

Revisión del 20 de noviembre de 2026. Una entrada por préstamo y otra por serie:
ni abrir ni registrar ni publicar un precio recorre lo que ya existe. El límite
de 64 corresponde solamente al catálogo elegido por el emisor para SEP-40.
Cada visitante puede tener una serie propia sin agotar esta instancia.

## Límites comprobados y fuentes

Las cifras siguientes vienen de `stellar network settings --network testnet`,
con CLI 30.0.1. La respuesta completa está en
[loan-book-network-settings.json](../scripts/evidence/loan-book-network-settings.json).
Son parámetros votados por la red, no constantes universales de Soroban.
La documentación remite a la configuración vigente en
[Stellar Lab](https://lab.stellar.org/network-limits) y explica el cobro en
[Fees, Resource Limits, and Metering](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering).

| Recurso | Testnet consultada | Consecuencia |
| --- | ---: | --- |
| Clave de datos, serializada | 250 bytes | Incluye campos del ledger, no solo nuestro identificador. |
| Entrada de datos completa | 65.536 bytes | El valor dispone de menos; no caben colecciones arbitrarias. |
| Código WASM | 131.072 bytes | Se mide aparte de las entradas de datos. |
| Footprint total por transacción | 400 entradas | Incluye lecturas y escrituras; no recorrer toda la cartera. |
| Lecturas de disco por transacción | 200 entradas / 200.000 bytes | Estado clásico y restauraciones; las lecturas Soroban vivas están en memoria. |
| Escrituras por transacción | 200 entradas / 132.096 bytes | Incluye los contratos llamados, como el SAC. |
| CPU / memoria | 400.000.000 instrucciones / 41.943.040 bytes | No equivale a tiempo de ejecución de una prueba Rust. |
| Eventos por transacción | 16.384 bytes | Emitir una transición, no una cartera completa. |
| Transacción serializada | 132.096 bytes | Firmas y autorizaciones también ocupan espacio. |
| TTL mínimo temporal / persistente | 720 / 120.960 ledgers | Aproximadamente una hora / siete días a cinco segundos. |
| TTL máximo | 3.110.400 ledgers | Aproximadamente 180 días; no garantía de duración de cada ledger. |
| Denominador de renta persistente / temporal | 1.215 / 2.430 | Temporal resulta más barato; tarifa efectiva depende del estado de la red. |

No se trasladó a testnet el mínimo de 120 días que la documentación menciona
para mainnet en noviembre: aquí la consulta devolvió siete días. El contrato
solicita 2.073.600 ledgers (aproximadamente 120 días), con umbral de la mitad.
El TTL debe revisarse si cambian los parámetros de red.

[State archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
explica que temporal desaparece sin recuperación, mientras persistente e
instancia se archivan. Una entrada persistente archivada no parece ausente ni
puede recrearse: hay que restaurarla. Desde protocolo 23 la simulación puede
preparar la restauración dentro de la invocación; sin la lista adecuada falla
antes de ejecutar el contrato. También existe RestoreFootprintOp para restaurar
por separado. Instancia y código tienen sus TTL; extender la instancia mediante
el SDK atiende ambos. Restaurar cuesta y deja el TTL mínimo de la red.

La [guía para elegir almacenamiento](https://developers.stellar.org/docs/build/guides/storage/choosing-the-right-storage)
reserva instance para configuración pequeña: todo se carga junto y comparte
una entrada y TTL. Persistente admite muchas claves independientes. Temporal
no sirve para deudas, permisos permanentes o pruebas de que un préstamo ya
existió. Aquí tampoco sirve para el último precio: olvidarlo permitiría
reiniciar la guarda de paso máximo. El pagador de la transacción paga creación,
crecimiento, extensión y restauración; no hay un débito periódico automático.
Una simulación sola no mantiene vivo el estado.

La guía oficial de [estrategias de almacenamiento](https://developers.stellar.org/docs/build/guides/storage/storage-strategies)
recomienda una clave por entidad para poblaciones crecientes, catálogos con
límite para conjuntos pequeños e índices de eventos fuera del contrato cuando
se necesita enumerar. Eso es lo que aplica A4. No se intenta devolver un millón
de préstamos en una llamada ni renovar toda la cartera a la vez.

## Diseño A4

`Loan(id)` guarda el préstamo y su última foto de garantía. `Series(nombre)`
guarda token inmutable y último precio. `Assets` guarda hasta 64 nombres
**publicados deliberadamente** mediante list_series. Registrar una serie no
lee ni escribe Assets: no hay contador, lista global ni límite de series.
El catálogo no es la lista de todos los precios disponibles; todas las series
se consultan por nombre con las tres funciones de precio SEP-40.

El demo registra una serie exclusiva por bono y nunca la lista. Así una caída
afecta solo ese préstamo y el visitante 65 no necesita otra instancia ni una
base de datos de asignaciones. Los nombres no se borran ni reutilizan; registrar
un nombre existente no puede reiniciar su precio o cambiar su token.

N es el número histórico de préstamos, S el de series y B el de permisos activos.
O(1) significa trabajo acotado, no comisión fija: tarifas, autorizaciones,
rentas y restauraciones pueden variar. No se ha ejecutado un millón de operaciones
en testnet; las columnas grandes describen el diseño.

| Estado / operación | 10 préstamos | 10.000 | 1.000.000 |
| --- | --- | --- | --- |
| Loan(id) | 10 entradas | 10.000 | 1.000.000; independientes y archivables |
| Series(nombre) | S entradas independientes | S | S; sin límite global de aplicación |
| Assets | Hasta 64 nombres | Igual | Igual, solo los elegidos por el emisor |
| Config + código | Constante | Igual | Igual |
| Buyer | B permisos activos | B | B; revocar elimina la entrada |
| open, get_loan, flag_margin, mark_default, repay, liquidate | O(1) | O(1) | O(1), más llamadas al token de esa serie |
| register_series, get_series, publish_price, lecturas SEP-40 por nombre | O(1) | O(1) | O(1) |
| list_series, assets | O(C), C <= 64 | Igual | Igual |
| Buscar toda la cartera fuera del contrato | O(N) | O(N) | O(N), requiere fuente histórica |

open lee la serie y consulta balance(id) y authorized(id) en su token. Exige
saldo >= nominal y autorización, además del LTV y precio fresco. Las demás
operaciones sobre abiertos también leen esa garantía: no hay barrido de cartera.
El valor utiliza min(saldo, nominal), por lo que un saldo enorme de un token
hostil no agranda los productos aritméticos. Un faltante o congelación permite
default sin condición de precio o fecha. Liquidar cobra por lo existente y
exige autorización; pagar permite cerrar aunque haya faltante o congelación.

La semántica de autorización y clawback de balances de contrato está definida
en [CAP-46-6](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-06.md).
La prueba real crea un activo clásico nuevo con autorización obligatoria,
revocación y clawback. No modifica el activo del producto ni consulta Trustless
Work. Verificar saldo no acredita propiedad del escrow ni entrega futura.

Las llamadas try_* capturan errores recuperables y tipos inesperados. Un saldo
negativo también es inválido. Se muestra known=false y shortfall=None, no un
faltante inventado. No se permite abrir ni liquidar con lectura desconocida.
No se consulta el token desde registro, catálogo, publicación ni SEP-40.
Una falla o consumo excesivo de recursos afecta a la transacción que llama ese
token, no a transacciones independientes de otras series. try_* no recupera
agotamiento del presupuesto del host. El emisor sigue siendo responsable de
vincular un SAC auténtico y unidades correctas: un contrato arbitrario puede
mentir. No se introduce un registro global de tokens ni un barrido que propague
sus fallos.

## Conservación y descubrimiento

Toda interacción mantiene solo las entradas usadas y la instancia/código.
La serie persiste para no reiniciar la guarda de paso máximo. Los cerrados
conservan la foto final, unicidad y reintentos seguros, sin consultar serie o
token ni renovar Loan. Pueden archivarse cuando expire lo ya pagado; no significa
cero bytes históricos o restauración gratuita. No hay mantenimiento de cerrados
a cargo de Rendaval. La llamada de cierre puede renovar al cargar el abierto.

Los eventos permiten un índice opcional: open contiene id, borrower, lender y
serie; price identifica la serie compartida, y default/repay/liquidate guardan
la foto relevante. Un clawback o congelación externo no emite evento del libro.
Para salud actual se consulta get_loan. Otra aplicación puede indexar por
(red, contrato, event.id), conservar cursor y ledger, y recuperar huecos.

[getEvents](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents)
tiene retención limitada; no es una lista histórica durable. La web sin base
de datos puede leer directamente préstamos cuyo id obtenga del flujo de escrow
en cadena o del usuario. Esta fase no construye descubrimiento histórico por
usuario. No hace falta un mapa de instancias para las series del demo y assets
no debe utilizarse como lista de visitantes.

## Pruebas y evidencia

Se conserva la prueba que abre 10.001 préstamos con pagos y compara recursos
con 10, 100, 1.000 y 10.000 ya existentes. Se añade una prueba que registra más
de 1.024 series y compara con 64, 128 y 1.024 existentes. Usa nombres de igual
longitud, hosts nuevos desde snapshots y caché acotada, sin desactivar límites.
Ambas comparan CPU, memoria, entradas, bytes, eventos y renta persistente.
Son mediciones nativas: no estimaciones de comisiones ni throughput de red.
Los números actuales están en [loan-book-scale.json](../scripts/evidence/loan-book-scale.json).

Las pruebas también cubren catálogo lleno con registro aún permitido, precio
de series no listadas, vínculo inmutable, saldo insuficiente al abrir,
congelación, salud con saldo real, default sin frescura por garantía, rechazo de
default sano, lectura fallida aislada, pago con faltante y cierre sin lecturas
posteriores del token. Conservan firmas, atomicidad, umbrales, cura, descuento,
reparto y pérdidas, reintentos, SEP-40 y TTL.

[La evidencia testnet](../scripts/evidence/loan-book-testnet.json) identifica
la instancia vigente, hash del WASM y todas las transacciones enviadas. Incluye
recursos simulados de open y cinco recorridos: liquidación con descuento, pago
normal, cura tras default por precio, clawback seguido de default y pago, y
congelación seguida de default y pago. El comprador solo paga USDC: el libro
no entrega bonos. El script devuelve los fondos recuperables al prestamista.

## Límites pendientes

No hay atomicidad entre pago de liquidación y entrega externa del bono. No se
verifican las condiciones de salida del escrow. Precio y token son decisiones
del emisor; la guarda de paso no impide varios pasos consecutivos ni garantiza
un precio económico correcto. No hay actualización del contrato, amortización
parcial ni compensación por clawback.

Antes de mainnet: auditoría independiente, custodia y rotación de claves,
alertas de precios/garantía/TTL, fuentes históricas para búsquedas, pruebas WASM
de carga y restauración real, y revisión de límites y rentas de la red. La demo
no espera días para probar mora o archivo: esas fronteras se prueban con reloj
controlado en Rust. No prueba Pollar en navegador ni la entrega vía escrow.
