> **C3 está incompleta y no desplegada.** Véase [el informe C3](C3-REPORT.md):
> bloqueo de integración TW V1, pruebas reproducibles y correcciones locales.
> El texto C2 que sigue describe el despliegue vigente; no el ABI local modificado.

# Contratos Rendaval — C2, RBOND en testnet

El libro registra préstamos, cobra USDC y protege la garantía mediante reglas del
bono. Los dos contratos tienen código inmutable. Las reglas permiten sustituir el
libro con firmas del emisor y del operador **solo si no queda ninguna prenda**.
No permiten cambiar el admin del SAC, emitir, quemar, confiscar ni transferir bonos.

La instancia y todos los hashes públicos están en
[evidencia de despliegue y corrida](../scripts/evidence/loan-book-testnet.json).
La [verificación independiente](../scripts/evidence/loan-book-testnet-verification.json)
coteja hashes, WASM, configuración, firmas, eventos y saldos con la red.
La web todavía no está conectada; su especificación es [INTERFAZ.md](INTERFAZ.md).

- Libro: `CA57AQCW24723MQ6IKR5YKZAMMKKDX5DIMC25UVYBWZHIWXTYTRHSSVS`.
- Reglas: `CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC`.
- SAC RBOND: `CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3`.
- Escrow de pago: `CAWRSYEJGNXDF7I6RFI7ZMPVEDPZZ4LPINPT7RCPNZ5A3OSZWUR5ETX2`.
- Escrow de liquidación: `CDIBNSBBFYFHRRCXEJ5NQGCFFDLT7EKFBVSKGBQG4RVEATSNOFB4TGJ4`.

RBOND usa el emisor `GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6`.
Sus flags son autorización requerida, revocable e inmutable; sin clawback.
El USDC es `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.
El operador procede de VAULT_SECRET_KEY, el prestamista de LENDER_SECRET_KEY y
el emisor/publicador de NEW_BOND_ISSUER_SECRET_KEY. Ninguna clave se guarda en evidencia.
El activo anterior se abandonó porque sus reglas no podían cambiar de libro.

## Cambios del examen de seguridad

1. El comprador paga al libro; un excedente que la empresa no pueda recibir queda
   a su nombre en `claimable`. La liquidación ya está cerrada.
2. La devolución también entra al libro. Si el prestamista no puede cobrar, queda
   un crédito suyo: no puede impedir pagar ni forzar default por ese bloqueo.
   `claim` intenta cobrar posteriormente; un fallo conserva íntegro el crédito.
3. Cada cambio de precio espera un intervalo desde el cambio anterior. No acumula
   permisos durante la inactividad. Hay gracia de mora y tiempo mínimo de cura.
4. Fallos recuperables de transferencias USDC devuelven `Payment = 16`.
5. `open` exige empresa, operador y prestamista. La empresa puede ser origen y
   firmar una sola vez el sobre; el servidor firma las autorizaciones de los otros roles.
6. La liberación con escrow vacío sigue siendo pública. `accept_collateral` permite
   al beneficiario de un préstamo cerrado aceptar la entrega o renunciar al residuo;
   el polvo no puede bloquearlo. La firma es de la empresa tras pago y del comprador
   tras liquidación. Una deuda viva nunca admite esta salida.
7. El paso de precio admite al menos una unidad mínima, incluso con precios 1–3.
8. Capital mínimo: 1 USDC. El interés se redondea hacia arriba; no produce default
   inmediato por redondeo en una apertura válida.
9. Registrar no publica un precio. Abrir exige publicación explícita y fresca.
   `prices(n)` devuelve la última publicación para todo n positivo; `resolution`
   informa el intervalo mínimo de cambio, sin prometer publicaciones periódicas.
10. El comprador necesita permiso del libro y autorización vigente del SAC del bono.

La recuperación automática de Margin usa solamente un precio fresco. Si el emisor
abandona las publicaciones, se puede pagar y declarar mora pasada la gracia, pero
**liquidar sigue exigiendo precio fresco**. No se inventa un valor de venta a partir
de una cotización vieja. Resolver esa dependencia exige otro publicador/oráculo o
un procedimiento de valoración; queda fuera de esta corrección.

## Parámetros

| Parámetro | Demo desplegado | Referencia para una instancia real |
| --- | --- | --- |
| Margen / default | 70 % / 85 % | 70 % / 85 % |
| Paso máximo | 25 % del precio anterior, mínimo una unidad | Igual; revisar con riesgo |
| Intervalo entre cambios | 30 segundos | 86400 segundos (1 día) |
| Gracia después de vencimiento | 30 segundos | 259200 segundos (3 días) |
| Cura desde default | 60 segundos | 259200 segundos (3 días) |
| Edad máxima del precio | 86400 segundos | 86400 segundos |
| Descuento de liquidación | 5 % | 5 % |
| Plazo / interés | 30 días; 8 % anual, base 360 | Igual |
| Capital mínimo | 1 USDC | 1 USDC; la política comercial puede exigir más |

Los tiempos son parámetros obligatorios y positivos del constructor. Los valores
reales son una referencia operativa, no validación económica del producto. El demo
provoca default por precio; no acorta los 30 días contractuales del préstamo.

## Sustituir el libro sin abandonar el activo

`replace_book(nuevo)` exige emisor y operador originales. Un contador en instance
cuenta marcas persistentes en todos los tokens administrados. Crear una marca lo
incrementa una vez; retirarla lo reduce una vez. Ni repetir llamadas, ni vaciar un
escrow vivo, ni archivar entradas hacen cero el contador. Mientras exista cualquier
marca, la sustitución falla con Pledged (101). El nuevo libro no puede desproteger
marcas antiguas porque solo se acepta cuando ya no existen.

Desplegar y verificar primero el nuevo libro y sus parámetros, cerrar los préstamos
y entregar garantías, retirar todas las marcas y comprobar `live_pledges == 0`.
Ambas autoridades firman el cambio. El libro anterior ya no puede abrir préstamos
protegidos; sus créditos USDC siguen reclamándose allí. No borrar sus referencias
mientras existan créditos. Las reglas y su admin del SAC permanecen iguales.

## Pruebas y reproducción

```sh
CARGO_HOME=/tmp/rendaval-cargo cargo test --manifest-path contracts/Cargo.toml --locked
CARGO_HOME=/tmp/rendaval-cargo /tmp/rendaval-cli/stellar contract build --manifest-path contracts/Cargo.toml
npx next build
node scripts/bond-rules-verify.mjs
```

Las pruebas usan tokens diferentes para pago y garantía y cuentas G con trustlines.
Se conservaron los escenarios previos y la escala de 10.001 préstamos y más de
1.024 series. Los escenarios `audit_*` proceden del scratch del auditor, convertidos
en regresiones. La reproducción anterior y el resultado actual quedan resumidos en
[pruebas C2](../scripts/evidence/contracts-c2-tests.json).

El ejecutor envía transacciones, no sirve como consulta:

```sh
node scripts/bond-rules-testnet.mjs --throwaway
node --env-file=.env.local scripts/bond-rules-testnet.mjs --final
```

El primer modo usa Friendbot y activos desechables; el segundo RBOND y USDC testnet.
Los hashes se guardan antes de enviar. Ante incertidumbre consultar el hash original;
no borrar evidencia ni repetir pagos o emisiones a ciegas. Las claves desechables
solo viven en memoria y no permiten reiniciar una corrida perdida. El modo final
conserva salts y cuentas públicas; cualquier reanudación debe revisar estado y diario.

La corrida usa dos préstamos de 50 USDC y al operador como empresa. Para impedir
recepción sin tocar el saldo, ajusta temporalmente el límite de la trustline al saldo
actual. Restaura los límites originales y cobra ambos créditos. El comprador es el
prestamista aprobado. El gasto bruto está acotado a 300 USDC y el ejecutor exige
recuperar los saldos USDC iniciales de ambas cuentas. Devuelve los bonos al emisor.
Si otra corrida usa esas cuentas, el cotejo global se detiene: ejecutar
`node scripts/c2-reconcile.mjs --finalize` para conciliar eventos y completar
la evidencia sin enviar transacciones. No compensar movimientos ajenos ni repetir pagos.

## Límites de lo verificado

No se llamó Trustless Work ni se modificó app/, components/ o lib/. El auxiliar
`test-escrow` permite a su dueño retirar: es exclusivamente una prueba. Liquidar
cobra USDC pero no entrega bonos atómicamente; la siguiente fase debe verificar
las rutas, roles y aprobaciones del escrow real antes de firmar open.

Las cuentas G mantienen las rutas clásicas de autorización del emisor; por eso
la garantía debe estar en una dirección C. Las reglas no evitan impago del emisor,
emisión adicional ni una salida autorizada por el escrow. El libro comprueba admin,
pero no certifica que un contrato arbitrario sea el SAC legítimo: usar solo RBOND
verificado. Archivo/restauración tras días reales y Pollar en navegador quedan sin
verificar en esta fase. Un token hostil o agotamiento de recursos puede abortar una
transacción: el aislamiento de pagos cubre fallos recuperables del SAC conocido.

46 pruebas Rust aprobadas, incluidas las ocho regresiones de auditoría y ambas
pruebas de escala. `npx next build` y la reconstrucción WASM pasaron; los hashes
reconstruidos coinciden con el código desplegado.

## Resultado de la corrida final

44 transacciones confirmadas, dos préstamos
cerrados: uno Repaid y otro Liquidated. Pago con prestamista sin capacidad de recibir,
liquidación con excedente bloqueado, ambas reclamaciones y ambas prendas retiradas.
Se restauraron los límites de las trustlines; el libro quedó sin USDC ni créditos.
Gasto bruto propio del prestamista: **153,7708334 USDC**, devuelto íntegramente.

El saldo global bajó 20,06 USDC por tres movimientos ajenos a C2: dos salidas de
20 y una entrada de 19,94. No se compensaron ni se tocaron esas operaciones.
La [conciliación por hash](../scripts/evidence/c2-reconciliation.json) demuestra
saldo neto propio cero para prestamista y empresa. El verificador vuelve a cotejar
cada transferencia con sus eventos en cadena. Esto explica por qué el cotejo
inicial del saldo global se detuvo, aunque todos los pasos C2 ya habían terminado.
