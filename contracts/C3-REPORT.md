# C3 — avance parcial, sin despliegue

21 de noviembre de 2026. **La fase no está terminada.** Se conservaron RBOND,
las reglas y el libro C2. No se envió ninguna transacción, no se gastó USDC y no
se hizo commit. El obstáculo está en la integración V1 probada, no en el mecanismo
de sustitución: la lectura actual de reglas devuelve `live_pledges = 0`.

## Bloqueo comprobado

El contrato público de Trustless Work, revisión
`ec4182547a0258d4f81694fa596ab90c11a06bd0`, expone en `get_escrow` importe,
USDC, roles, comisión de plataforma, hitos y banderas `released`, `resolved`,
`disputed`. No guarda el reparto de una resolución ni la fecha de liberación.
`resolve_dispute` transfiere según el mapa recibido y después guarda solamente
`resolved=true`, `disputed=false`. El evento de resolución tampoco incluye el mapa;
las transferencias del token sí permiten reconstruirlo fuera del contrato.
Un contrato Soroban no dispone de una consulta al historial de eventos.

La prueba contra una copia del código upstream demuestra que devolver todo al
prestamista y repartir la mitad a la empresa producen **exactamente el mismo XDR
de `get_escrow` y el mismo saldo cero del escrow**. En ambos casos se cobra el
0,3 %. Por tanto, `resolved && balance == 0` no demuestra devolución al prestamista.
Comparar saldos actuales de cuentas tampoco prueba el origen de sus movimientos.

Otras pruebas demuestran liberación sin que exista libro ni garantía, y fondeo
posterior a una resolución. También se comprobó que la plataforma puede reiniciar
las banderas de un escrow resuelto, vacío y sin hitos aprobados: el estado no es
un recibo histórico inmutable. El texto del hito no acredita un bloqueo de bonos.
Registrar Pending y leer banderas después no cierra estas salidas: cancelar al ver
saldo cero puede dejar un escrow que se financie tarde; aceptar una resolución como
refund puede devolver bonos a una empresa que sí recibió dinero. Rechazar escrows
ya liberados evita registrar una deuda falsa, pero no recupera dinero pagado antes.

Se exploró controlar las autorizaciones con un contrato de Rendaval. La API testnet
acepta direcciones C para receiver, releaseSigner, disputeResolver y platformAddress
al **construir** el deploy. Sin embargo, ambas rutas `release-funds` y
`resolve-dispute`, con firmante C, devuelven HTTP 400:
`invalid version byte. expected 48, got 16`. Las solicitudes de operación se hicieron
sobre un escrow histórico cerrado; el error es de dirección, no una prueba de
resolución sobre un escrow nuevo con roles C. No se enviaron esos XDR.

La documentación oficial de [release-funds](https://docs.trustlesswork.com/trustless-work/api-rest/deploy/release-funds)
expone contractId y releaseSigner, sin un origen G separado para un autorizador C.
No se ha demostrado otra ruta API compatible. Esto limita la alternativa investigada;
no demuestra que toda versión futura de TW sea incompatible.

Hace falta una ruta de TW que soporte autorización contractual, o autorizar un
adaptador que llame al contrato oficial manteniendo la cuenta y comisión oficiales.
Esa segunda opción cambia la restricción de operar exclusivamente por las rutas API,
por lo que no se ejecutó sin autorización. Un receiver intermedio por sí solo no basta:
el resolver con clave aún podría repartir directamente a la empresa.

## Diseño pendiente

La propuesta sigue siendo una bóveda por préstamo: conserva la identidad por dirección
y permite consultar balance real sin una contabilidad compartida de bonos. Código WASM
compartido, una instancia/configuración y balance SAC por préstamo; operaciones O(1).
Un vault común reduce instancias pero obliga a cambiar la identidad, contabilizar saldos
por préstamo y aislar depósitos ajenos. No se midió el coste XLM por préstamo ni se
implementó todavía la bóveda: no hay un despliegue C3 listo para aprobar.

El controlador de desembolso debe impedir release antes del registro y garantía,
impedir repartos parciales, fijar token/roles/receiver/comisión, impedir reutilizar el
escrow y conciliar el resultado con el libro. No basta confiar en una firma del servidor.
La empresa soportaría el fee del release: principal bruto adeudado y neto recibido
se mostrarían por separado; en un refund, el prestamista soportaría el 0,3 %.
Estos campos todavía no están implementados.

## Correcciones locales del segundo examen

| Hallazgo | Resultado local, todavía no desplegado |
| --- | --- |
| F1 | Pendiente: bóveda, cierre con entrega y retiro de prenda, salida por abandono prolongado. |
| F2 | `default_price` inmutable desde la primera marca; venta a `max(precio actual, default_price)`. Paso máximo del constructor limitado a 2500 bps. Rol `publisher` separado, inicialmente emisor; cambiarlo exige emisor y operador. El emisor conserva aprobación de compradores. |
| F3 | Pendiente: derivación del SAC auténtico a partir del activo clásico. |
| F4 | Margen mínimo 5034 bps, por encima de deuda/valor con capital mínimo e interés redondeado al 50 % de LTV. |
| F5 | Pendiente: retirar `accept_collateral` al integrar la bóveda. No se quitó la salida que todavía necesita C2. |
| F6 | Una autorización por dirección distinta, incluidas las dos coincidencias posibles del operador. Pruebas positivas con árboles exactos y transferencia anidada. |
| F7 | Constructor del libro rechaza emisor=operador; apertura coteja ambos con reglas; salud es `None` para valor cero o lectura desconocida. Vincular empresa/bóveda queda pendiente. No se cambió el constructor inmutable de reglas; las autoridades desplegadas son distintas. |
| Cobertura | Se añadió conservación de créditos durante liquidación, cobro fallido, reintentos y cobros sucesivos, sin depósitos ajenos al protocolo. Pendientes fixture general sin clawback y sustitución integral de libros con créditos antiguos. |

La igualdad entre créditos y saldo se prueba para los flujos del libro. Una transferencia
USDC espontánea al libro puede aumentar el saldo sin crear crédito: la propiedad global
sería saldo >= créditos; no se presenta la prueba como una igualdad ante donaciones.

Los cambios locales alteran Config, Loan y View: no describen el ABI del libro C2
que sigue en testnet. No deben conectarse a la web como si estuvieran desplegados.
No se modificaron app/, components/ ni lib/. No se necesita cambiar las reglas para
las correcciones ya hechas; las partes pendientes no se presentan como verificadas.

## Evidencia y reproducción

En [scripts/research/c3](../scripts/research/c3):
`api-capabilities.json`, `api-signers.json` y `on-chain-state.json` contienen respuestas
públicas, fecha, direcciones y ledger de lectura. `tw_state_tests.rs` contiene las cuatro
pruebas; `test-upstream.py` copia la referencia a un directorio temporal y añade las
pruebas sin modificar la referencia. Son pruebas nativas con autenticación simulada,
no transacciones reales ni una comparación binaria del WASM desplegado con el clone.

```sh
CARGO_HOME=/tmp/rendaval-cargo cargo test --manifest-path contracts/Cargo.toml --locked
python3 scripts/research/c3/test-upstream.py
npx next build
node scripts/research/c3/read-state.mjs
node --env-file=.env.local scripts/research/c3/probe-api.mjs
node --env-file=.env.local scripts/research/c3/probe-signers.mjs
```

Validación: **52 pruebas Rust del workspace aprobadas**, incluidas ambas pruebas
de escala (10.001 préstamos y más de 1.024 series); **4 pruebas upstream aprobadas**;
build WASM y `npx next build` aprobados. Resultados y hash del WASM local en
[validation.json](../scripts/research/c3/validation.json).

No hay hashes de transacciones nuevas: no se enviaron. No se verificaron los tres
recorridos exigidos de C3, ni entrega atómica, cancelación segura, reloj de desembolso,
compatibilidad de un adaptador con TW o costes de bóveda.

## Direcciones vigentes, no sustituidas

- Libro C2: `CA57AQCW24723MQ6IKR5YKZAMMKKDX5DIMC25UVYBWZHIWXTYTRHSSVS`.
- Reglas: `CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC`.
- RBOND: `CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3`.
- USDC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.

Los dos escrows de TW consultados son referencias históricas del spike, no préstamos
C3: `CDALLEYS4JWSXA7CC2SASY2TZ5AWSNRMCPDU55A5NELEWLM4FOKT3253` y
`CAD22WTYGHVCBUUHVNPWZCKD4I7VNK4Z6ZFWBXNQIQNVZJHZLERP6C6T`.
No se borró evidencia C2 vigente para simular que ya existe un reemplazo.
