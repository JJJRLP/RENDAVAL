# Escala y almacenamiento — C4

El libro tiene una entrada persistente `Series(nombre)`, una `Vault(id)` con términos
inmutables y, si abrió, una `Loan(id)`. No mantiene una lista de toda la cartera ni
recorre préstamos al publicar precio. El catálogo SEP-40 opcional sigue limitado a
64 series; registro y lectura por nombre no tienen ese límite.

Cada préstamo añade dos instancias del mismo WASM: bóveda y custodia de entrega.
La segunda permite finalizar aunque un destinatario no pueda recibir RBOND en su
cuenta. Las dos conservan configuración y estado pequeño en instance. El WASM se
sube una sola vez. El coste adicional de crear y autorizar dos contratos se paga por
préstamo; no se presenta como gratuito ni como una comisión fija.

| Operación / estado | Crecimiento |
| --- | --- |
| Series y última cotización | O(S), entradas independientes |
| Términos y préstamo | O(N), entradas independientes |
| Bóvedas y custodias auxiliares | 2N instancias; un WASM compartido |
| Marcas en reglas | Dos por préstamo vivo; ninguna pendiente tras cierre |
| Permisos de comprador y créditos USDC | O(B + R), una entrada por dirección |
| Abrir, pagar, liquidar, write_off, cancelar | O(1), sin dependencia de otros préstamos |
| Publicar o consultar precio por serie | O(1) |
| Catálogo SEP-40 | O(C), C <=64 |
| Buscar toda la historia fuera de cadena | O(N), requiere índice y conservación propios |

La bóveda principal debe tener el al menos el neto de USDC; no hay contabilidad global
compartida de depósitos. La liquidación usa min(saldo RBOND, nominal) para valorar,
y entrega esa misma cantidad al comprador. El exceso vuelve a la empresa. No trasladar saldos de otras direcciones
para completar el faltante de un préstamo.

`create_vault` despliega ambos contratos con salts derivados y guarda los términos.
`open` verifica garantía, términos, precio y reglas, crea dos marcas y paga desde
la bóveda. Los cierres transfieren la garantía, retiran ambas marcas y conservan
la foto final. `accept_collateral` desaparece. Una donación posterior no modifica
el contador de prendas. Créditos USDC sobreviven en el libro que los recibió.

Las entradas usan TTL objetivo de 2.073.600 ledgers, con umbral de renovación de
la mitad, sujeto al máximo de red. Constructor y operaciones de bóveda renuevan
instancia/código. Las operaciones sobre préstamos vivos llaman keep_alive: mantiene
Loan, Vault, Series, libro, bóveda, delivery y ambas marcas en reglas. Cualquiera puede
ejecutarlo como transacción. Lecturas simuladas no persisten renovación. Los terminales
se leen sin renovar Loan; keep_alive explícito sí permite conservarlos.
Sin mantenimiento antes del archivo, restaurar entradas; nunca recrear deuda.

El registro añade una entrada por documento y slots independientes para bonos y
préstamos de cada empresa. La cabecera contiene solo versión y dos contadores.
`put` toca una cabecera y hasta 16 slots, cada valor <=16 KiB. La escala compara
10.001 documentos y 10.001 slots bajo una empresa, sin crecimiento del footprint,
bytes ni renta por escritura del mismo tamaño; CPU/memoria nativas toleran <1 %
por diferencias de direcciones y nonces, como la prueba del libro. El servidor ensambla
la lista de una empresa fuera de cadena; paginar esa respuesta será necesario para
historias grandes. Ninguna escritura del índice guarda la lista completa.

Se conservan las pruebas nativas de 10.001 préstamos y más de 1.024 series. La
primera compara footprint, bytes, eventos y renta en 10, 100, 1.000 y 10.000 préstamos
previos. CPU/memoria admiten variación inferior al 1 % por despacho de múltiples
contratos nativos y direcciones; no es una prueba de throughput ni coste WASM.
No se ejecutó un millón de préstamos en testnet. Los costes C4 por hash están en
[c4-verification.json](../scripts/evidence/c4-verification.json). Como referencia
histórica, los costes reales de las tres
creaciones y aperturas están en `resources` del
[journal C3b](../scripts/evidence/c3-testnet.json), y las comisiones cobradas por hash
en `costs` de [la verificación](../scripts/evidence/c3-verification.json).

Los límites históricos de red están en
[loan-book-network-settings.json](../scripts/evidence/loan-book-network-settings.json).
Son una lectura de testnet, no constantes del protocolo. Revisar límites vigentes,
WASM, tamaños, rentas y restauración antes de desplegar en otra red. Los índices de
eventos necesitan retención propia; el RPC no es una base histórica ilimitada.

Como referencia histórica C3b (no tarifa C4), en sus tres creaciones reales, desplegar ambas instancias costó 0,0942416–0,0942418
XLM por préstamo. Open costó 0,2588953–0,2588956 XLM. Son cargos de esas invocaciones,
no todo el recorrido: faltan autorizaciones, depósitos, TW y cierre. El WASM compartido
de bóveda ocupa 5503 bytes y el libro 33768 bytes.
