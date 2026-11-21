# Contratos Rendaval — C4 en Stellar testnet

USDC entra por un escrow real de Trustless Work cuyo receiver es la bóveda del
préstamo. RBOND entra directamente en esa bóveda. `open` registra la deuda,
protege los bonos y entrega USDC a la empresa en una sola invocación propia.
No consulta ni cree las banderas de TW. La integración web está especificada en
[INTERFAZ.md](INTERFAZ.md). El servidor y la interfaz B2 usan estos contratos.

## Despliegue vigente

| Contrato | Dirección |
| --- | --- |
| Libro C4 | `CB6VYHQXCB3EKR4Q43LNDH7Y6GZXURIUBTOCHBWPCNSACANPHKSMSSKN` |
| Reglas RBOND, sin cambios | `CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC` |
| SAC RBOND | `CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3` |
| SAC USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Registro de la app | `CAR55ERAQUCHESSOEW2UUWYAUC3PVK7LIV7MIP6IIWRNM7AV3TYVAGGB` |
| WASM bóveda/custodia (SHA-256) | `22abc2f4e3215a3f45adf0921937846a29cef8e89221f8a96859165e260718b6` |

[Despliegue y redondeo](../scripts/evidence/c4-testnet.json),
[dos recorridos del servidor](../scripts/evidence/c4-server.json),
[verificación independiente](../scripts/evidence/c4-verification.json),
[informe C4](C4-REPORT.md). `replace_book` se ejecutó con cero prendas, con emisor
y operador. Reglas y RBOND se conservan. C3-REPORT es evidencia histórica.

## Custodia y salidas

Una dirección identifica cada préstamo. El libro despliega dos instancias pequeñas
del mismo WASM: la bóveda que recibe ambos activos y una custodia auxiliar de entrega.
Esta segunda instancia evita que una trustline bloqueada impida cerrar y sustituir
el libro. Ambas deben estar autorizadas por el emisor antes de open; ambas quedan
protegidas mientras hay deuda. Las dos marcas se retiran dentro del cierre.
Un contrato compartido ahorraría instancias, pero necesitaría contabilidad por dueño
y préstamo; aquí los saldos y las facultades permanecen separados por dirección.

- Antes de abrir, empresa o prestamista puede cancelar definitivamente. Cualquiera
  puede activar después cada devolución, siempre al dueño fijo: bonos a empresa y
  USDC a prestamista. No necesita permiso del operador ni acuerdo de la contraparte.
- Repay cobra deuda completa y saca todos los bonos de la bóveda. Si la empresa no
  recibe, van a su custodia de entrega. No queda una prenda esperando su firma.
- Liquidate cobra al comprador y le entrega solo min(face, saldo) directamente en la misma
  transacción. Si falla la entrega, se revierte también el pago. No hay segunda fase.
- Tras 180 días en Defaulted, cualquiera puede ejecutar write_off: recuperación en
  especie para el prestamista, directa o en la custodia autorizada. La deuda USDC se
  registra como pérdida completa; no se finge una venta ni se usa un precio viejo.
  Retirar de esa custodia exige que el destinatario pueda recibir RBOND.
- USDC tardío tras cancelación o cierre pertenece al prestamista. Bonos tardíos al
  destinatario del cierre; en liquidación, los bonos extra/tardíos son de la empresa.
  Ninguna donación vuelve a crear prendas ni deuda.

Las transferencias USDC de liquidación y repayment que no lleguen al destinatario
quedan como créditos en el libro. `claim` solo paga a su dueño y un fallo conserva
el crédito. Los créditos sobreviven a la sustitución del libro. Sin donaciones,
la suma de créditos coincide con su saldo; con donaciones externas, saldo >= créditos.
No hay retirada administrativa de USDC ni de bonos.

La custodia de entrega deja de estar protegida al cerrar: el emisor puede revocar
su autorización entonces, como la de otros tenedores sin prenda. No se promete
liquidez ni autorización perpetua de RBOND. Durante el préstamo, las reglas impiden
revocar tanto la bóveda como su custodia auxiliar.

## Importes y riesgo

La empresa debe el bruto y recibe el neto tras 0,3 % de TW. Con 20 USDC:
recibe 19,94 y debe 20 + 0,1333334 de interés. La vista expone capital, comisión,
neto e interés por separado. En cancelación el prestamista soporta la comisión TW.
`open` exige saldo **al menos igual al neto**. Entrega exactamente el neto;
el exceso USDC queda para el prestamista, reclamable tras cierre. Un saldo inferior
no activa deuda. Un tercero no puede bloquear la apertura enviando polvo. Las tres partes autorizan los términos; no se intenta probar el origen
del saldo de la bóveda ni reconstruir historia de TW dentro del libro.

Se conservan LTV máximo 50 %, plazo de 30 días, interés anual 8 % base 360,
capital mínimo 1 USDC, margen/default, gracia, cura, descuento y prioridad del
prestamista. Publicar precio no recorre la cartera. El piso de liquidación es conservador: demorar mark_default nunca permite bajarlo.
Para default por precio, con deuda D, nominal F y umbral B:
`min(SCALE, ceil((floor(D*10000/B)+1)*SCALE/F))`. Incluye el redondeo de value.
Es al menos el primer precio que pudo disparar default; no reconstruye el precio
histórico exacto. Para mora o deterioro se usa par (SCALE), máximo precio admitido. Marcar después de
vencimiento puede elevar el piso a par; nunca lo reduce.
Esto puede exigir más que la primera cotización de default o que el mercado actual,
y demorar una venta; repay y write_off siguen disponibles según sus reglas.
Una baja posterior no reduce el piso. Emisor aprueba
compradores, publicador fija precios; cambiar publicador exige emisor y operador.

Demo: margen 7000 bps, default 8500, paso máximo 2500, descuento 500,
precio válido 86400 segundos, intervalo 30, gracia 30 y cura 60 segundos.
El constructor exige margen >=5034 bps, paso <=2500 y autoridades diferentes.
Para uso comercial, intervalo/gracia/cura deben revisarse; no son recomendaciones
para dinero real. El plazo de 30 días y write_off de 180 días no se acortan en demo.

## Reproducir

```sh
CARGO_HOME=/tmp/rendaval-cargo /tmp/rendaval-cli/stellar contract build --manifest-path contracts/Cargo.toml
CARGO_HOME=/tmp/rendaval-cargo cargo test --manifest-path contracts/Cargo.toml --locked
npx next build
node scripts/c4-verify.mjs
```

El verificador no necesita claves ni envía transacciones. Coteja código desplegado,
configuración, flags RBOND, cada hash, transferencias del mismo cierre, comisiones,
prendas, créditos y saldos. Evidencia de la prueba previa de 1 USDC al receiver C:
[contract-receiver.json](../scripts/research/c3/contract-receiver.json).

`node --env-file=.env.local scripts/c4-testnet.mjs` despliega/reconcilia el journal
C4; `--rounding` recupera la prueba de 1,0000001 USDC. Los scripts de servidor y
limpieza están documentados en C4-REPORT. Envían transacciones testnet; no borrar
sus journals para repetir pagos. Nunca usar scripts históricos C2/C3 para actualizar
el despliegue vigente. Secretos solo en .env.local, nunca en evidencia.

## Registro y mantenimiento

`app-registry` guarda documentos por clave SHA-256 y slots independientes por empresa.
Solo el operador escribe, con compare-and-swap de versión; cualquiera lee o mantiene
TTL con `keep_alive(key, slots)` (hasta 16 slots por llamada). Escritura acotada a 16
slots y 16 KiB por valor, sin vector creciente ni contador global. El índice no otorga
propiedad: cada acceso a préstamo vuelve a comprobar borrower en el libro.

`book.keep_alive(id)` es permissionless y renueva libro, préstamo, especificación,
serie, bóveda, custodia y ambas prendas. Las operaciones normales sobre préstamos
vivos hacen lo mismo. TTL objetivo: 120 días, renovación al bajar de 60 días, sujeto
al máximo de red. Hace falta una transacción real antes del archivo; las simulaciones
no persisten TTL. Entradas archivadas se restauran, no se recrean. El registro y las
custodias también permiten lecturas como transacciones para renovar su TTL.

## Límites económicos conocidos

- Write-off entrega **todo** el colateral al prestamista; la empresa no recibe
  excedente, aunque el valor económico supere la deuda.
- El emisor puede aprobar a la propia empresa deudora como comprador. No hay
  prohibición de autocompra ni garantía de independencia entre compradores.
- El interés es fijo: 8 % anual aplicado a 30/360 al abrir, redondeado hacia arriba.
  Pagar antes no lo reduce; pagar tarde no acumula interés adicional.
- Solo face forma parte de la prenda para salud/precio de venta. Enviar bonos extra
  no cura margen; en liquidación se devuelven a la empresa, directa o en delivery.

## Pruebas y límites

**68 pruebas Rust aprobadas**, incluidas las dos pruebas de escala existentes; C4 añade los casos de
la tercera auditoría, despliegue WASM real en fixture y escala del registro con
10.001 documentos y 10.001 posiciones de una empresa. Resultados en el informe C4.

Las regresiones cubren autorización exacta de apertura con roles coincidentes,
depósito y cancelación, aislamiento entre préstamos, fondeo insuficiente y exceso, fondeo
inexistente y tardío, release anterior al depósito, resolución parcial, cancelación,
créditos, entrega atómica con comprador sin capacidad, polvo posterior al cierre,
write_off sin precio ni comprador y sustitución con créditos pendientes.
El fixture usa SAC auténtico con autorización requerida, revocable e inmutable,
sin clawback. Las pruebas de daño que fuerzan burn o freeze bajo mocks son pruebas
defensivas del libro, no facultades que el emisor tenga sobre una bóveda protegida.

C3 reemplaza las pruebas C2 que exigían entrega externa/accept_collateral y las
que permitían registrar un token arbitrario. Se mantienen precio, umbrales,
SEP-40, TTL, créditos, errores, firmas y pruebas de escala. La identidad de series
se deriva en cadena del Asset clásico. Ver [ESCALA.md](ESCALA.md).

No se esperaron 30 o 180 días reales ni un archivo por TTL: esas fronteras se prueban
con reloj controlado. No se probó Pollar ni la nueva interfaz en navegador. Las correcciones C4 se basan en la tercera auditoría independiente; no se afirma
una nueva auditoría independiente del código corregido. Precio económico, solvencia del emisor,
restricciones del activo y disponibilidad de la API siguen siendo dependencias.
