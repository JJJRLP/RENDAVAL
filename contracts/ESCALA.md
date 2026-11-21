# Escala del libro de préstamos — A3

Revisión del 20 de noviembre de 2026. El problema era de diseño, no de falta de
gas: cada apertura añadía un activo a un único vector y volvía a escribirlo.
Separar cada préstamo en su propia entrada ya era correcto; faltaba hacer lo
mismo con las cotizaciones y poner un límite explícito a su catálogo.

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
se necesita enumerar. Eso es lo que aplica A3. No se intenta devolver un millón
de préstamos en una llamada ni renovar toda la cartera a la vez.

## Auditoría del diseño anterior

N es el número histórico de préstamos y B el de compradores registrados,
incluidos los revocados. O(1) significa trabajo acotado por llamada, no precio
fijo en XLM: cambian alquiler, restauraciones, autorizaciones y tarifas.
A 10.000 y 1.000.000 los costes de llamadas individuales que se indican son
hipotéticos: la apertura deja de funcionar mucho antes.

| Estado o función anterior | 10 préstamos | 10.000 préstamos | 1.000.000 préstamos | Conservación, pagador y primer fallo |
| --- | --- | --- | --- | --- |
| Config en instance; constructor, get_config | Una configuración; O(1) | Igual | Igual | Toda invocación carga la instancia. Pagador mantiene código/instancia. Sin fallo por N. |
| Assets; open, assets | Vector de 10; O(N) | Vector imposible | Vector imposible | Activos Other con nombre BOND_ + 8 hex: unos 52 bytes por elemento; ~520 KB / ~52 MB. Choca con 64 KiB alrededor de 1.200 activos, antes de 10.000. Renta y escritura crecen; todas las aperturas compiten por la misma entrada. |
| Asset(nombre) → id | 10 entradas | 10.000 | 1.000.000 | Una por préstamo para volver a encontrar su precio. Persisten también tras cierre; lectores pagan su renovación. |
| Loan(id); get_loan, get_price | 10 entradas, consulta O(1) | 10.000, O(1) | 1.000.000, O(1) | Precio duplicado por préstamo. Hasta las consultas de cerrados renuevan 120 días; el pagador financia historia innecesariamente viva. |
| Buyer; set_buyer, is_buyer | B entradas; O(1) | B; O(1) | B; O(1) | Incluso false se guardaba y renovaba. Si B crece con N, crece la renta agregada, no el trabajo individual. |
| publish_price | Una escritura de préstamo | Igual por llamada; 10.000 llamadas para precio común | Igual; 1.000.000 llamadas para precio común | Emisor paga por duplicar una noticia de una misma serie; actualización parcial entre holders. |
| flag_margin, mark_default | Un préstamo; O(1) | O(1) individual | O(1) individual | No había barrido implícito; conservar. El llamante paga renovación. Vigilar toda la cartera cuesta O(N) fuera del contrato. |
| repay | Un préstamo y transferencia; O(1) | O(1) | O(1) | Prestatario/fuente paga. Guarda registro completo y futuros accesos seguían renovándolo. |
| liquidate | Un préstamo, permiso y hasta dos pagos; O(1) | O(1) | O(1) | Comprador/fuente paga. Misma retención del préstamo cerrado. Balances compartidos del SAC siguen limitando concurrencia. |
| base, decimals, resolution | Constante | Constante | Constante | Sin crecimiento ni renta propia. |
| lastprice, price, prices | Alias + préstamo; O(1) | O(1) | O(1) | Renovaban ambas entradas; solo un dato histórico. No resuelven la enumeración imposible. |
| Eventos | O(1) por transición | O(N) histórico externo | O(N) histórico externo | No son storage consultable desde el contrato ni una base de datos RPC eterna. Hace falta ingestión. |

Además del tamaño, el vector era un punto de escritura compartido: paginar su
lectura no habría eliminado el coste de cada open. Los umbrales y cantidades
usan productos comprobados; una cartera grande no aumenta su tamaño entero.
El índice de nombres u32 también era finito, aunque el límite físico llegaba
muchísimo antes. Nadie puede mantener un millón de préstamos en una sola
transacción, aunque individualmente cada entrada sea pequeña.

## Decisión A3

- `Loan(id)` sigue siendo una entrada persistente independiente, sin listas de
  préstamos ni por usuario ni globales. `open` recibe `series`, lee su precio
  fresco y exige capital <= 50 % del nominal y del valor actual. No lee ni
  escribe el catálogo. El operador y el prestamista autorizan y desembolsan
  dentro de la misma invocación.
- `Series(nombre)` guarda una sola PriceData. El emisor registra la serie a
  100 % y publica después con paso máximo y vigencia. Todos sus préstamos
  abiertos ven el mismo dato. Publicar no recorre holders. Margin se reconcilia
  por préstamo al consultarlo/tocarlo; Defaulted nunca se limpia por precio.
  El evento de serie permite al indexador recalcular salud sin eventos masivos.
- `Assets` contiene **hasta 64 series por instancia, durante toda su vida**.
  Incluso nombres de 32 caracteres caben holgadamente. Es un catálogo completo
  para SEP-40, nunca una primera página engañosa. Los nombres no se reciclan,
  no se eliminan y no se reinicia el precio. Al llenarse, las series nuevas van
  a otra instancia; las existentes admiten más préstamos. El límite es una
  decisión de servicio visible (`Capacity`), no un fallo inesperado de recursos.
- En el demo, cada bono de visitante recibe una serie exclusiva. Un cambio suyo
  no afecta a otro visitante. Con 64 bonos históricos por instancia el backend
  debe aprovisionar otra y guardar `(contractId, series, loanId)`. No se promete
  un catálogo global SEP-40 ilimitado. Un millón de series exclusivas exigiría
  15.625 instancias; para bonos reales muchos préstamos comparten la misma serie.
- Cerrados conservan el registro y precio final, sin renovar su TTL en lecturas
  ni reintentos. Al agotarse lo ya pagado, se archivan sin gasto de mantenimiento
  de Rendaval. No significa cero bytes históricos ni consultas futuras gratis:
  quien necesite restaurarlos paga. Esta prueba persistente evita reutilizar un
  escrow y repetir el desembolso. Se revocan compradores eliminando su entrada.

| Estado / operación A3 | 10 préstamos | 10.000 | 1.000.000 |
| --- | --- | --- | --- |
| Loan(id) | 10 entradas | 10.000 | 1.000.000; independientes, cerrados archivables |
| Config + código | Constante | Constante | Constante por instancia |
| Series y Assets | S entradas + catálogo, S <= 64 | Igual para las mismas series | Igual para las mismas series |
| Buyer | B permisos vigentes | B | B; sin entradas false |
| open, get_loan, get_price, flag_margin, mark_default, repay, liquidate | O(1) | O(1) | O(1); rentas y throughput agregados crecen con actividad |
| register_series, assets | O(S), S <= 64 | Igual | Igual; otras instancias si hay más series |
| publish_price, lastprice, price, prices | O(1) | O(1) | O(1) por serie; sin alias por préstamo |
| constructor, get_config, set_buyer, is_buyer, base, decimals, resolution | O(1) | O(1) | O(1) |
| Indexar/buscar fuera de cadena | 10 registros | 10.000 | 1.000.000; índices paginados, almacenamiento externo |

Cada open añade solo su Loan; la transferencia añade el coste normal del SAC.
El prestamista que origina paga esa operación y su renta inicial. Las
interacciones de abiertos renuevan solo préstamo y serie usados; el emisor paga
publicaciones y el operador puede enviar mantenimiento por id si no hay tráfico.
La instancia/código se mantienen con las invocaciones que usan configuración.
Lecturas SEP-40 mantienen la serie consultada, no los préstamos. Nadie renueva
cerrados en masa. No se garantiza una cifra fija de TPS: un único prestamista,
su secuencia de cuenta y sus saldos USDC siguen siendo recursos compartidos.

Se rechazó: mover el vector a instance (mismo límite y carga en cada llamada),
paginar un vector único (misma escritura creciente), un activo por préstamo
(dato económico equivocado), un catálogo sin límite aun por serie (solo pospone
el fallo), borrar préstamos cerrados (pierde unicidad y reintentos), temporal
para deudas/precios (pérdida de seguridad al caducar), y un registro sofisticado
de slots reciclables (contadores de holders y nuevos casos de seguridad).
Los 64 nombres permanentes permiten una implementación pequeña y predecible;
la contrapartida es administrar varias instancias cuando hagan falta.

## Descubrimiento y evidencia

La web debe indexar `open` por contrato, id, borrower, lender y serie; mantener
la última transición y guardar recibos de cierre. Los eventos incluyen esos
datos. Usar `(red, contrato, event.id)` para deduplicar, guardar cursor y ledger
confirmado, paginar, reanudar con solapamiento y detectar huecos de retención.
El evento `price` afecta todos los abiertos de esa serie en el índice, sin
reescribirlos en Soroban. Otra aplicación puede construir su propio índice.
Otro protocolo que opere on-chain necesita que le pasen ids concretos.

[getEvents](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents)
retiene una ventana configurable (valor predeterminado documentado: 120.960
ledgers, unos siete días); `getHealth` permite conocer la disponible. No basta
consultar los últimos eventos al abrir el navegador. Ingerir desde despliegue,
respaldar la base y conservar transacciones/recibos; para huecos antiguos hace
falta una fuente histórica. No se implementa ese servicio en esta fase.

La prueba de escala abre 10.001 préstamos reales en el host de pruebas, con un
SAC y pagos, y compara recursos con 10, 100, 1.000 y 10.000 ya existentes. Se
reinicia el host desde snapshot para medir una transacción con caché limpia:
reutilizar indefinidamente el host de tests también mide su caché acumulada,
que no representa el footprint de una transacción real. La prueba comprueba
lecturas, escrituras, bytes, eventos, renta, CPU y memoria. Es medición nativa,
no un millón de transacciones en red ni una promesa de comisiones exactas.
Las [muestras nativas](../scripts/evidence/loan-book-scale.json) tienen
326.717 instrucciones, 51.860 bytes de memoria, 11 entradas leídas en memoria,
5 escritas y 1.216 bytes escritos en los tres puntos posteriores a la base.
La ejecución testnet y el hash del WASM están en la evidencia pública enlazada
desde README: 30 hashes y los tres recorridos completos. Las aperturas reales
tuvieron footprint de 5 entradas de lectura y 4 de escritura, aproximadamente
1,97 millones de instrucciones y 940–944 bytes escritos. Los nombres de serie
tienen distinta longitud; esos valores y las tarifas no son constantes
universales. No se publicaron 10.000 préstamos en testnet. El reloj de freshness, mora y TTL se prueba localmente.

## Antes de mainnet

Auditoría independiente; claves con custodia y rotación; operación del índice y
sus copias; alertas de precios, TTL y defaults; política para instancias llenas
y descubrimiento de series; pruebas de carga WASM y restauraciones reales;
medición de concurrencia del SAC y cuentas de origen; revisión de parámetros
y rentas en mainnet. El límite de paso no impide varios pasos consecutivos ni
valida el precio económico. Un emisor puede publicar valores incorrectos.

El contrato no tiene bonos, no comprueba el escrow y no llama a Trustless Work.
La entrega de garantía sigue requiriendo un flujo externo autorizado; hoy no
hay atomicidad entre entrega del bono y pago de liquidación. No hay aportes de
garantía, amortización parcial, gracia adicional ni actualización del WASM.
