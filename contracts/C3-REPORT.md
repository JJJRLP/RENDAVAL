# C3b — resultado final (histórico)

Despliegue sustituido por [C4](C4-REPORT.md). Los ids, semántica y resultados
de este documento describen C3b, no el servidor vigente.

21 de noviembre de 2026. **Implementado y desplegado en testnet**, con los tres
recorridos reales de RBOND y Trustless Work completados. No se cambió el contrato
de reglas, no se creó otro bono y no se hizo commit. La web queda para otra fase.

## La condición previa sí funciona

Antes de implementar, se desplegó por el API un escrow single-release de **1 USDC**
con receiver C y todos los firmantes G. Deploy, fund, completar hito, aprobación y
release confirmados. El receiver recibió **0,997 USDC**; TW cobró **0,003 USDC**.
Se devolvió todo el neto al prestamista. Release:
`e1c76f0b57412c120892b8d10ceb366a60974344c9af9fc2e3934c2708d40ebe`.
La [evidencia previa](../scripts/research/c3/contract-receiver.json) conserva ids,
hashes y saldos. El receiver era un auxiliar recuperable de prueba, no una bóveda
productiva. No se construyó adaptador; todos los cambios de TW pasaron por su API.

## Diseño y decisiones

Una bóveda por préstamo recibe RBOND y USDC; una segunda instancia del mismo WASM
sirve como custodia de entrega si la empresa o el prestamista no puede recibir bonos.
El libro crea ambas desde código fijado, con términos inmutables. Las dos direcciones
se autorizan por el emisor y se protegen al abrir. Esto cuesta dos instancias por
préstamo, pero evita contabilidad compartida y saldos que otro préstamo pueda gastar.

`open` exige firmas de empresa, prestamista y operador, bonos reales suficientes,
precio fresco y **saldo USDC exacto igual al neto**. Registrar deuda, proteger ambas
custodias y pagar a la empresa es una transacción. El libro **no lee nada de TW**.
Las lecturas de `get_escrow` en el verificador solo documentan roles y resultados;
no participan en decisiones del contrato.

Antes de abrir, cualquiera de las dos partes puede cancelar. Después cualquiera
puede disparar las devoluciones a destinos fijos: bonos a empresa, USDC al prestamista.
Si TW no liberó, disputa del prestamista y resolución del operador devuelven el neto
por el API. Montos incorrectos o parciales no abren; release tardío sigue siendo
reembolsable. USDC recibido tras un terminal también pertenece al prestamista.

Repay devuelve bonos, directamente o a custodia asignada a la empresa; liquidate
entrega **directamente al comprador dentro del mismo pago**, con rollback total si
falla. Ambos retiran todas sus marcas. Tras 180 días en default, write_off entrega en
especie al prestamista, directamente si puede recibir, o en custodia autorizada.
Registra la deuda USDC completa como loss, sin atribuir precio a los bonos. La cuenta
del prestamista debe estar autorizada para retirarlos. No hacen falta precio fresco,
comprador ni cooperación del emisor en ese cierre. La custodia deja de estar protegida
tras el cierre; no se promete que el emisor no la revoque después.

La empresa soporta la comisión TW si abre: principal bruto adeudado, neto entregado,
fee e interés aparecen separados. Para 20: 19,94 recibidos, 0,06 de fee y deuda
20,1333334 USDC. En cancelación, el prestamista soporta la comisión de devolución.

## Auditoría y pruebas

| Pendiente | Resultado |
| --- | --- |
| F1 | Cierre entrega y retira ambas prendas atómicamente; polvo no vuelve a bloquear. Custodia auxiliar resuelve receptor pasivo/bloqueado; write_off resuelve default abandonado tras 180 días. |
| F2 | Piso inmutable al primer default, paso máximo 2500 bps, publicador separable de quien admite compradores. Se conservan las correcciones del WIP. |
| F3 | register_series recibe XDR del Asset clásico y el host deriva el SAC; no acepta una dirección proxy suministrada. |
| F4 | Margen mínimo 5034 bps; se conservan guardas y pruebas de redondeo. |
| F5 | accept_collateral eliminado. No hay renuncia unilateral a garantía residual. |
| F6 | Una autorización por dirección distinta; pruebas positivas con árboles exactos y roles coincidentes. |
| F7 | Empresa y términos fijados al crear bóveda; solo bóvedas creadas por el libro. Salud desconocida = None. Libro rechaza emisor=operador y coteja autoridades con reglas. Reglas inmutables no se modifican; sus autoridades desplegadas son distintas. |
| Cobertura | Fixture auténtico requerido/revocable/inmutable sin clawback; créditos conservados y respaldados; sustitución entre dos libros con apertura vieja rechazada y créditos viejos cobrables; pruebas de depósito, cancelación, saldos tardíos y entrega fallida. |

**59 casos Rust distintos aprobados**: 57 funcionales y dos de escala (10.001
préstamos y más de 1.024 series). La corrida grande tardó 1631,33 segundos;
ese tiempo incluye preparar y copiar fixtures nativos, no mide latencia de red.
`npx next build` y build WASM aprobados. La comparación independiente confirma que
el WASM local coincide con libro, seis instancias de bóveda/custodia y reglas en red.
Las pruebas C2 de entrega externa/accept_collateral y de tokens arbitrarios fueron
reemplazadas por sus equivalentes C3; se conservaron las demás propiedades. Los casos
de burn/freeze forzados con mocks son daño artificial, no facultades reales sobre RBOND.

## Corridas y costes

**66 transacciones confirmadas**: 7 de la condición previa y 59 del despliegue y tres
recorridos. Se fondearon tres escrows reales de 20 USDC: Repaid, cancelación con refund,
y Liquidated. En la liquidación, el comprador pagó 21,375 USDC y recibió 40 RBOND
**en el mismo hash**:
`ca5f4dad137bde0da67e177743af0724e7b21fb9040646f8f0fde52dece66ed5`.

Gasto bruto del prestamista, incluidos apoyo de empresa/comprador y condición previa:
**92 USDC**, debajo de 300. Recuperado: **91,817 USDC**. Diferencia: **0,183 USDC**,
exactamente las comisiones oficiales TW verificadas por eventos. No quedan USDC en
escrows/bóvedas/libro, ni créditos ni prendas. Los 120 RBOND de las corridas volvieron
al emisor. Empresa y comprador terminaron sin RBOND ni USDC de prueba.

Crear ambas instancias costó 0,0942416–0,0942418 XLM por préstamo en esta muestra;
open, 0,2588953–0,2588956 XLM; repay, 0,1110458; liquidate, 0,1001086.
Son comisiones efectivamente cobradas en esas invocaciones, sin sumar las demás
operaciones del recorrido ni prometer tarifas futuras. WASM compartido de bóveda:
5503 bytes; libro: 33768 bytes. Recursos y costes por hash en la evidencia.

Una colisión de etiquetas en el ejecutor omitió inicialmente el permiso del comprador
en el libro. La simulación rechazó Buyer (7), sin envío ni cobro. Se corrigió la etiqueta
y se reanudó por hashes; el journal conserva el diagnóstico. No se presenta ese rechazo
como prueba de cura. La cura mínima y sus fronteras se verifican en Rust.

## Direcciones y reproducción

- Libro vigente: `CAC2Y7NO6NVBOSLAKHUQKIIZ5RIIAYXUGRKRB64JPYPPSM2KZQPBPKJA`.
- Reglas preservadas: `CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC`.
- RBOND: `CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3`.
- USDC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.

| Recorrido | Bóveda/id | Custodia de entrega | Escrow TW |
| --- | --- | --- | --- |
| repaid | `CAA4DGE2N67XMIVSLKLXT234D5BFQZNH6BWYCACL4WEUCOITVPLSIJT5` | `CAQ2IHTXVH33ZYPHWYDY6JUHKN4AL5VH7KA6WJBJP6KL47JN7HM4BBAN` | `CB6CUPWRKEN7WD7F3GHLIECIWA4XSNQW43PIPW5W7CZDGZ2WFQGHCSF2` |
| cancelled | `CA5WKOGC2UNVIYDZA6NSF74K4TDNFVWQULNPHWA3XMH4YCOGJR225M2O` | `CBY5I6O5N5P6HJWLXUFULZNPF4LVRNHNZ2KPIVCL22XFUXW3Q3ECF7LB` | `CB2SZKCEYOL3C32LDYWD4JBE4U64RBOPP5WSK75LBJGO4G6UIGKZOGGU` |
| liquidated | `CCZ3J6Z3FFTDDECRSN33HHLHRKH24BYAML4WTPMHMPW7JOGSBZVG44VS` | `CAJQUGIE5CS5C2EFYQZJFQWHVH66D2SOAPJLGDEXMHUBDXGMQJY5P5VW` | `CACGJ6ACTSWG6SSGUKV2SGYKJJVBPJKWBHQRKIQWBDJPCG3EPZUJAHVK` |

[Evidencia C3b](../scripts/evidence/c3-testnet.json),
[verificación independiente](../scripts/evidence/c3-verification.json),
[interfaz web](INTERFAZ.md), [reproducción](README.md).
La evidencia C2 se archivó fuera de las referencias vigentes; se conserva para
trazabilidad del reemplazo. No reutilizar sus instancias como el producto actual.

No se verificaron espera real de 30/180 días, archivo/restauración tras TTL real,
Pollar/navegador, mainnet ni auditoría independiente de C3b. El reloj de apertura,
fronteras temporales y write_off sí se prueban con ledger controlado. No se tocó
app/, components/ o lib/, ni se guardaron claves o sobres firmados.
