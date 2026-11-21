# Contratos Rendaval — C3b en Stellar testnet

USDC entra por un escrow real de Trustless Work cuyo receiver es la bóveda del
préstamo. RBOND entra directamente en esa bóveda. `open` registra la deuda,
protege los bonos y entrega USDC a la empresa en una sola invocación propia.
No consulta ni cree las banderas de TW. La integración web está especificada en
[INTERFAZ.md](INTERFAZ.md); app/, components/ y lib/ no se modificaron en esta fase.

## Despliegue vigente

| Contrato | Dirección |
| --- | --- |
| Libro C3b | `CAC2Y7NO6NVBOSLAKHUQKIIZ5RIIAYXUGRKRB64JPYPPSM2KZQPBPKJA` |
| Reglas RBOND, sin cambios | `CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC` |
| SAC RBOND | `CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3` |
| SAC USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

[Despliegue y tres recorridos](../scripts/evidence/c3-testnet.json),
[verificación independiente](../scripts/evidence/c3-verification.json),
[informe final](C3-REPORT.md). El libro se conectó mediante `replace_book`, con
emisor y operador, partiendo de cero prendas. El admin de RBOND sigue en las mismas
reglas. No se creó otro activo ni se modificó ese contrato inmutable.

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
- Liquidate cobra al comprador y le entrega los bonos directamente en la misma
  transacción. Si falla la entrega, se revierte también el pago. No hay segunda fase.
- Tras 180 días en Defaulted, cualquiera puede ejecutar write_off: recuperación en
  especie para el prestamista, directa o en la custodia autorizada. La deuda USDC se
  registra como pérdida completa; no se finge una venta ni se usa un precio viejo.
  Retirar de esa custodia exige que el destinatario pueda recibir RBOND.
- USDC tardío tras cancelación o cierre pertenece al prestamista. Bonos tardíos al
  destinatario del cierre. Ninguna donación vuelve a crear prendas ni deuda.

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
`open` exige el saldo **exacto** neto: monto incorrecto o resolución parcial no activa
una deuda. Las tres partes autorizan los términos; no se intenta probar el origen
del saldo de la bóveda ni reconstruir historia de TW dentro del libro.

Se conservan LTV máximo 50 %, plazo de 30 días, interés anual 8 % base 360,
capital mínimo 1 USDC, margen/default, gracia, cura, descuento y prioridad del
prestamista. Publicar precio no recorre la cartera. El piso de liquidación es el
precio fijado al primer default; una baja posterior no lo reduce. Emisor aprueba
compradores, publicador fija precios; cambiar publicador exige emisor y operador.

Demo: margen 7000 bps, default 8500, paso máximo 2500, descuento 500,
precio válido 86400 segundos, intervalo 30, gracia 30 y cura 60 segundos.
El constructor exige margen >=5034 bps, paso <=2500 y autoridades diferentes.
Para uso comercial, intervalo/gracia/cura deben revisarse; no son recomendaciones
para dinero real. El plazo de 30 días y write_off de 180 días no se acortan en demo.

## Reproducir

```sh
CARGO_HOME=/tmp/rendaval-cargo cargo test --manifest-path contracts/Cargo.toml --locked
CARGO_HOME=/tmp/rendaval-cargo /tmp/rendaval-cli/stellar contract build --manifest-path contracts/Cargo.toml
npx next build
node scripts/c3-verify.mjs
```

El verificador no necesita claves ni envía transacciones. Coteja código desplegado,
configuración, flags RBOND, cada hash, transferencias del mismo cierre, comisiones,
prendas, créditos y saldos. Evidencia de la prueba previa de 1 USDC al receiver C:
[contract-receiver.json](../scripts/research/c3/contract-receiver.json).

`node --env-file=.env.local scripts/c3-testnet.mjs` **envía transacciones** y usa un
journal público. Rechaza repetir una corrida completa. Las cuentas Friendbot de
empresa y comprador se derivan solo en memoria para poder recuperar una interrupción;
no se escriben sus claves. Si un hash está pendiente se consulta antes de reconstruir.
El límite incluye 1 USDC de la prueba previa y las transferencias de apoyo al demo.
No ejecutar scripts antiguos de C2 para actualizar este despliegue.

## Pruebas y límites

**59 pruebas Rust aprobadas**, incluidas ambas pruebas de escala; build WASM y
Next aprobados. [Resultados](../scripts/research/c3/validation.json).

Las regresiones cubren autorización exacta de apertura con roles coincidentes,
depósito y cancelación, aislamiento entre préstamos, montos incorrectos, fondeo
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
con reloj controlado. No se probó Pollar ni la nueva interfaz en navegador. No se
hizo auditoría independiente de C3b. Precio económico, solvencia del emisor,
restricciones del activo y disponibilidad de la API siguen siendo dependencias.
