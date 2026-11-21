# C4 — auditoría, registro y reemplazo en testnet

Solo Stellar testnet. No se modificaron `components/` ni páginas, no se añadieron
variables o dependencias y no se hizo commit. Reglas RBOND y activo RBOND preservados.

## Hallazgos corregidos

| Hallazgo | Implementación y regresión |
| --- | --- |
| Polvo USDC bloqueaba open | La bóveda exige saldo >= neto y entrega exactamente neto. El exceso queda para el prestamista, cobrable tras cierre. Servidor usa la misma condición. Pruebas con un stroop y con exceso mayor. |
| Piso dependía de marcar a tiempo | Para default por precio se usa una cota conservadora derivada de deuda, face y umbral; para mora/deterioro, par. Pruebas bajando el precio hasta un stroop sin leer/marcar préstamos y bajándolo después de due. |
| Comprador recibía bonos extra gratis | Recibe min(face, saldo), la cantidad valorada y pagada. El exceso vuelve a empresa; si no puede recibir, delivery queda asignada a ella. Donaciones posteriores también son suyas. Entrega al comprador sigue atómica, sin fallback. |
| Missing y cancel terminal | get_vault comprueba existencia antes de extender TTL. cancel rechaza préstamos abiertos/terminales con State. Reintentar cancelación previa no emite evento; también completa delivery después de cancelación directa en la bóveda. |
| Archivo durante default largo | Constructor de bóveda extiende TTL; operaciones sobre préstamos vivos mantienen préstamo, especificación, serie, bóveda, delivery, reglas y las dos marcas. `keep_alive(id)` permite mantenimiento permissionless. Prueba con 212 días de ledgers, incluyendo write-off. |
| Redondeo TW | Release real por API de 1,0000001 USDC: receiver recibió 0,9970001, fee 0,003. Coincide con floor(P*30/10000); no se cambió aritmética. Neto devuelto al lender. |

La fórmula de piso por precio es:
`min(SCALE, ceil((floor(debt*10000/default_bps)+1)*SCALE/face))`.
Si un precio P permite default, `floor(face*P/SCALE)` no supera
`floor(debt*10000/default_bps)`, por lo que P queda por debajo de esta cota.
No se escanea historia ni cartera. **No se reconstruye el primer precio exacto**:
la cota puede superarlo. Si se marca después del vencimiento/gracia, se usa par;
la demora puede elevar el piso, nunca rebajarlo. Esto puede demorar una venta cuando
el mercado no paga ese precio; repay, cura y write-off mantienen sus reglas.

Extra RBOND no modifica salud: solo face forma parte de la prenda. Se conservan
los límites económicos solicitados en README: write-off entrega todo al lender sin
excedente a empresa; emisor puede aprobar al deudor como comprador; interés fijo
8 % anual por 30/360, sin descuento por prepago ni acumulación posterior.

## Registro y servidor

`app-registry` es inmutable, sin custodia ni funciones de transferencia. Solo el
operador escribe; cualquiera lee. Documentos por SHA-256 de namespace/clave, CAS
u64 por documento y slots persistentes independientes. Una escritura modifica una
cabecera y hasta 16 slots, cada valor <=16 KiB. Las posiciones de bonos y préstamos
usan rangos separados de u32; la cabecera de empresa solo guarda dos contadores.
No hay vector de empresa creciente en una entrada, catálogo global ni reserve
clásica por documento. El coste depende del tamaño y batch, sin crecer con la cartera.

El servidor conserva las firmas, reservas previas, outbox durable y recuperación
por hash. La cuenta origen de cada escritura se elige para no consumir la secuencia
del pago preparado; incluso con origen emisor, la escritura exige autorización del
operador. Lecturas de una empresa ensamblan sus slots en lotes de 16; paginar la
respuesta HTTP será necesario para historias grandes. Documentos operativos de
actividad por préstamo aún tienen límite individual de tamaño.

El índice nunca concede propiedad. `records.ownLoan` y `state` comprueban borrower
contra get_vault del libro. La autorización incluye una prueba con índice incorrecto
escrito deliberadamente por el operador: ni fund ni state aceptan la bóveda ajena.

TTL objetivo 120 días, renovación bajo 60, sujeto al máximo de red. El registro
expone `keep_alive(key, slots)`; el libro `keep_alive(id)`. Las simulaciones no
persisten TTL. Antes de lanzamiento hace falta mantenimiento periódico real y un
procedimiento de restauración; no se recrean registros archivados como vacíos.

## Despliegue y trazabilidad

Libro vigente: `CB6VYHQXCB3EKR4Q43LNDH7Y6GZXURIUBTOCHBWPCNSACANPHKSMSSKN`.
Registro: `CAR55ERAQUCHESSOEW2UUWYAUC3PVK7LIV7MIP6IIWRNM7AV3TYVAGGB`.
Reglas preservadas: `CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC`.
RBOND SAC: `CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3`.
USDC SAC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.

El WASM de bóveda/custodia es
`22abc2f4e3215a3f45adf0921937846a29cef8e89221f8a96859165e260718b6`.
Se desplegaron libro y registro; cada préstamo crea dos instancias del WASM de bóveda.
Hashes de los tres WASM y transacciones en [c4-testnet.json](../scripts/evidence/c4-testnet.json).

El reemplazo final se confirmó en
`ffd444a0122135154274e35c16eb7ef753e0662006b2cae94e332c1171c81203`,
con cero prendas. Hubo un libro intermedio
`CAZMNDEZNCHV7O5OYKU4BQI2BBJH2VZAF4BMUAQKIX3LF4D3ZCQVSVTE`:
la revisión final detectó el caso de cancelación directa y se corrigió antes de
cerrar C4. Su único préstamo abierto se pagó correctamente antes del segundo
reemplazo. La segunda declaración no llegó a fondearse. Se conserva el
[journal parcial](../scripts/evidence/archive/c4/first-book-server.json), y su gasto
se incluye en el límite global de 400 USDC. No se borró evidencia para reiniciar gastos.

Release de redondeo: `8fde4ddc2bc4eb2a0270a0a33d47973ebce1a568615ab7989cfd4c8e7288e241`.
Receiver de esa prueba (libro C3b anterior):
`CDDU4YIR6CZRW5QRGDWWSH2TKXJFQJ4S7BGJJ3SBKG3AKQARX6QSGPXW`;
escrow TW: `CCYMSOPYM7P7HMQGW353QON32TETYPNVNMUFAQWBDA644Q7RSRNOUYGV`.
Cancelado y neto devuelto, sin deuda ni prendas.


| Recorrido | Bóveda/id | Delivery | Escrow TW |
| --- | --- | --- | --- |
| repaid final | `CCMZDQGDI3HLECRQ2Q4OSSJ2WW2RAVBUHDZODT66HD7HJ3IV2UVDXBNB` | `CBUBUVZYERXAIC6CWHW64IDJUCOHSRJ364CDLYA7G42WVRA7CN42E7ZE` | `CCWPH5ESWJH4FUFC2NV6IBKX2TB7N6NJBSR2QSKODCFXTU5DQRMGROQ4` |
| liquidated final | `CCTWMA4PZOLK33UDUT4RQ5DRRIS4WLL76PRBWEJGA3FCLBYLQY45SNFW` | `CCOXQ7QIRLE4XDJOHR4446TA2DZPCSU6GVWAJWXQ2ETAANSUQ5NCIRX2` | `CA3W2E3L2KEZHMEJROYWLLEUPXMLO5O6YQMGWCV66RLKSMIIKFJVLZLN` |
| repaid intermedio | `CAEM62ZV3JJFWYYF4OF2QYU2FJLSUH4ON6N4DWZNWPPZ7AJXVPDXI7JI` | `CCPGAKUBCSQIT6IROFHB62R6XO2S7HNUNLCDP4X5NU7UTT3GKCDAAADR` | `CBNIBMGBOUPFIE5T3VJ6SDKNS7SRTOMI7SMCU7CHJ7XAHQ2R3J5HEOWO` |
| redondeo C3b | `CDDU4YIR6CZRW5QRGDWWSH2TKXJFQJ4S7BGJJ3SBKG3AKQARX6QSGPXW` | `CCGAQK6DGG4QWLS7HLY7ZILESPJNM4M5KBWXJUZMUEWI2LQWJWLVW7JF` | `CCYMSOPYM7P7HMQGW353QON32TETYPNVNMUFAQWBDA644Q7RSRNOUYGV` |

## Validación y limpieza

Ambos recorridos del servidor y **65 comprobaciones de autorización** aprobados,
incluido índice incorrecto, state aislado, XDR manipulado, fee bump válido y replay
sin doble movimiento. Identidad HTTP de Pollar es fixture; cadena y servicios son reales.

- Repay: capital 50, neto 49,85, fee 0,15, deuda 50,3333334 USDC; 100 RBOND devueltos.
  Hash: `f64d26a082aa802a3ecb45b34d7af751bb86fec87465bd967dd8be0f1e222a55`.
- Liquidate: quote 0,5625, piso 0,5921569, cura real observada, compra 56,2549055,
  excedente 5,9215721 USDC, loss=0 y 100 RBOND al comprador en el mismo hash:
  `577997a1756a68d4a58827328f0b42bf0c68f11fddceffe1fa0f4ef4163b098d`.
- Claim confirmado; crédito pendiente cero. Empresa final: 100 RBOND y 55,7715721 USDC.
  Es saldo en su cuenta, no dinero retenido en libro/escrow/bóveda.

Limpieza confirmada en ocho transacciones: **746 entradas b1** eliminadas, solo
registros de prueba del servidor anterior. Las **19 constancias KYB** se preservaron
byte por byte, comprobando SHA-256 de todos los datos no b1 antes/después.

| Cuenta | Entradas b1 retiradas | Datos restantes | Subentradas restantes | Capacidad adicional |
| --- | ---: | ---: | ---: | ---: |
| `GABIK4IHUCZJIO7GJ35ZTBMAPIJI2M2FPG5Q5K44VTBRLSLJZXDYTXW5` | 584 | 19 | 23 | 977 |
| `GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6` | 162 | 0 | 0 | 1000 |

La capacidad usa el límite de 1.000 **subentradas**, que incluye datos, trustlines y
otras entradas clásicas; no basta contar solo los datos. En Rendaval quedan 981
posiciones de datos por ese conteo aislado, pero el límite efectivo es **977 nuevas
constancias** si no se añaden otras subentradas, y requiere reserva XLM suficiente.
Antes de lanzamiento real hay que mover también KYB a almacenamiento sin este límite,
con política de privacidad/retención, y operar mantenimiento/restauración de TTL.

[Evidencia del servidor](../scripts/evidence/c4-server.json),
[autorización](../scripts/evidence/c4-authorization.json),
[limpieza y nombres retirados](../scripts/evidence/c4-classic-cleanup.json).

**68 pruebas Rust aprobadas**, sin ignorar ni quitar ninguna de las 59 anteriores:
61 del libro (incluidos siete casos nuevos), cinco de reglas y dos del registro.
Se conservaron 10.001 préstamos y más de 1.024 series; se añadieron 10.001 documentos
y 10.001 slots de una empresa. Footprint, bytes y renta constantes; CPU/memoria
nativas dentro del 1 %. La suite del libro tardó 1649 s, incluido preparar fixtures:
no mide latencia de red. Build WASM, lint, TypeScript y Next aprobados; lint conserva
solo el warning previo de import no usado en el auxiliar histórico contract-receiver.

Verificación independiente de **346 hashes**: código local = desplegado para libro,
registro, reglas y las cuatro custodias del recorrido final; reglas/flags/admin RBOND
preservados, cero prendas vivas, escrows/bóvedas/libro sin saldo retenido, créditos cero.
**Gasto bruto total del lender: 208,2215724 USDC**, incluidos probe y corrida intermedia,
inferior a 400; devuelto al lender: **151,9970003 USDC**. Fees reales TW: **0,453 USDC**.
Los importes se reconciliaron con transferencias de cadena, no solo con el presupuesto.

[Verificación independiente](../scripts/evidence/c4-verification.json),
[resultados de validación](../scripts/evidence/c4-validation.json),
[pruebas y métricas nativas](../scripts/evidence/c4-cargo.txt).

Durante la integración se corrigieron dos errores del ejecutor sin repetir pagos:
claves de struct Soroban serializadas inicialmente como strings en vez de símbolos,
y una comparación bigint/string en el verificador de transferencias. Ninguno alteró
la contabilidad del contrato; las corridas se recuperaron por registros y hashes.


## Reproducir

```sh
CARGO_HOME=/tmp/rendaval-cargo /tmp/rendaval-cli/stellar contract build --manifest-path contracts/Cargo.toml
CARGO_HOME=/tmp/rendaval-cargo cargo test --manifest-path contracts/Cargo.toml --locked
npm run lint
npx tsc --noEmit
npx next build
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-b1.ts
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-b1-authorization.ts
node --env-file=.env.local --import tsx scripts/c4-cleanup.ts
node scripts/c4-verify.mjs
```

Build WASM precede cargo test porque la regresión de fábrica ejecuta ese binario.
Los scripts con .env.local envían transacciones; conservan journals y no deben
reiniciarse borrando evidencia. `c4-verify.mjs` es solo lectura y no necesita secretos.

## Límites de la verificación

No se esperaron 30/180 días reales ni archivo/restauración real por TTL; se probaron
con ledger controlado. Pollar se sustituye solo en la respuesta HTTP de identidad
de la prueba de autorización: login/firma interactivos en navegador siguen pendientes.
El excedente del recorrido se entrega directamente: claim de crédito positivo
bloqueado se cubre en Rust, no en ese recorrido real. Las pruebas de escala son
nativas, no miles de préstamos en testnet. No se afirma una nueva auditoría
independiente de las correcciones C4 ni validación en mainnet.
