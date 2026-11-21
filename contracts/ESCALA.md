# Escala y almacenamiento — C3b

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

La bóveda principal debe tener el neto exacto de USDC; no hay contabilidad global
compartida de depósitos. La liquidación usa min(saldo RBOND, nominal) para valorar,
pero entrega todo el saldo de la bóveda. No trasladar saldos de otras direcciones
para completar el faltante de un préstamo.

`create_vault` despliega ambos contratos con salts derivados y guarda los términos.
`open` verifica garantía, términos, precio y reglas, crea dos marcas y paga desde
la bóveda. Los cierres transfieren la garantía, retiran ambas marcas y conservan
la foto final. `accept_collateral` desaparece. Una donación posterior no modifica
el contador de prendas. Créditos USDC sobreviven en el libro que los recibió.

Las entradas usan TTL de 2.073.600 ledgers, umbral de renovación de la mitad.
Las instancias y su código también requieren conservación. El constructor de bóveda
usa inicialmente el TTL mínimo de la red; una invocación real de get_config o de
sus operaciones renueva a 120 días. Deposit renueva la principal; para mantener
la auxiliar antes del cierre, invocar get_config como transacción o restaurarla
si ya se archivó. Una consulta simulada no hace ese mantenimiento. Cada operación mantiene
solo lo que usa. Simular no persiste renovaciones. Estado persistente archivado se
restaura; no se interpreta como una deuda ausente ni se recrea con el mismo id.
Los préstamos terminales se leen sin renovar Loan ni volver a leer su garantía;
`get_vault` y las llamadas a bóveda mantienen sus propias entradas al ejecutarse.
El plazo write_off puede superar TTL inicial: un operador debe mantener/restaurar
el estado, no prometer que permanecerá vivo sin operaciones.

Se conservan las pruebas nativas de 10.001 préstamos y más de 1.024 series. La
primera compara footprint, bytes, eventos y renta en 10, 100, 1.000 y 10.000 préstamos
previos. CPU/memoria admiten variación inferior al 1 % por despacho de múltiples
contratos nativos y direcciones; no es una prueba de throughput ni coste WASM.
No se ejecutó un millón de préstamos en testnet. Los costes reales de las tres
creaciones y aperturas están en `resources` del
[journal C3b](../scripts/evidence/c3-testnet.json), y las comisiones cobradas por hash
en `costs` de [la verificación](../scripts/evidence/c3-verification.json).

Los límites históricos de red están en
[loan-book-network-settings.json](../scripts/evidence/loan-book-network-settings.json).
Son una lectura de testnet, no constantes del protocolo. Revisar límites vigentes,
WASM, tamaños, rentas y restauración antes de desplegar en otra red. Los índices de
eventos necesitan retención propia; el RPC no es una base histórica ilimitada.

En las tres creaciones reales, desplegar ambas instancias costó 0,0942416–0,0942418
XLM por préstamo. Open costó 0,2588953–0,2588956 XLM. Son cargos de esas invocaciones,
no todo el recorrido: faltan autorizaciones, depósitos, TW y cierre. El WASM compartido
de bóveda ocupa 5503 bytes y el libro 33768 bytes.
