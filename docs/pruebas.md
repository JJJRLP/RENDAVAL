# Pruebas T — Stellar testnet

**La cobertura solicitada no está completa.** La batería terminó. 0 casos actualmente fallidos en la batería de fallos; 5 grupos pendientes detallados abajo. No se afirma que la publicación esté aprobada por esta fase mientras queden pendientes. Los rechazos detectados en simulación real de RPC se distinguen de transacciones enviadas.

## Resultado de esta ejecución

- Total aprobado: 200 comprobaciones; no incluye los grupos pendientes.
- Batería de fallos: 56 aprobados, 0 fallidos; intentos fallidos conservados: 1.
- Recorridos nuevos: 2 terminados, con 198 hashes registrados (incluye escrituras del registro).
- Autorización del recorrido nuevo: 71 comprobaciones aprobadas.
- Autorización del recorrido anterior: 71 comprobaciones aprobadas.
- Lender antes de la fase: 12639.0382613 USDC; después: 12638.2882613 USDC.
- Gasto bruto reservado/confirmado de los recorridos nuevos: 156.7382389 USDC; batería: 221.7333335 USDC. El saldo neto no mide el gasto bruto. Los reembolsos y pagos vuelven al lender cuando corresponde. Al terminar se devuelven también los dólares de prueba sobrantes, con hashes separados; no son pagos de deuda.

## Validación local

Pasaron npm run lint, npx tsc --noEmit y npx next build. Lint conserva una advertencia previa de importación no usada en scripts/research/c3/contract-receiver.mjs.

## Qué cambió

Se sustituyeron los diagnósticos crudos de Soroban por mensajes en español que explican qué revisar. Se corrigió la lectura de una bóveda cancelada antes de abrir: no existe deuda y debe aparecer Cancelled, sin confundir fallos de RPC o archivo con ausencia de deuda. También se permite volver a preparar una declaración después de cancelar su bóveda. Se amplió la prueba de autorización a collect/build y collect/submit.

No se cambiaron ni desplegaron contratos ni secretos. En pantalla solo se corrigió el mensaje de preparación cancelada, que mostraba una deuda inexistente. Las cuentas nuevas se derivan en memoria; la evidencia no contiene claves privadas ni sobres firmados. Los escrows nuevos son parte del flujo normal por el API de Trustless Work. Nunca se invocó directamente un contrato TW.

## Cómo repetir

No ejecutar dos escritores a la vez con las cuentas del servidor. Conservar los journals: borrarlos no reinicia la cadena y puede invalidar las comprobaciones. Un reintento continúa las etapas guardadas, no crea otra campaña. Las comprobaciones ya aprobadas se conservan; para una campaña completamente nueva use un identificador público distinto: `node scripts/verify-phase-t.mjs --campaign=otra-fecha`. Cada campaña conserva sus propios archivos y cuentas, con el mismo límite bruto. No use un identificador nuevo para recuperar un timeout.

```sh
node scripts/verify-phase-t.mjs
npm run lint
npx tsc --noEmit
npx next build
```

El punto de entrada corre los recorridos anterior y nuevo, las dos verificaciones de autorización y la batería, en serie. Ante fallo sale con código distinto de cero y conserva la evidencia. Para reanudar solo la batería:

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-t.ts
node scripts/report-t.mjs
```

La prueba de autorización sustituye la respuesta HTTP de Pollar; KYB y pertenencia se leen en testnet. El recorrido nuevo usa Didit sandbox. La batería usa constancias testnet del servidor y cuentas Friendbot. Los errores de terceros se inyectan en el cliente HTTP/RPC local, sin atacar servicios. Hay rechazos de ruta que deliberadamente no llegan a cadena y rechazos de simulación que no se envían. No equivalen a una transacción fallida confirmada.

La recuperación por disputa usa apiCall del servidor y el API real de TW; todavía no existe una ruta pública de cancelación/disputa. Por eso este ensayo no demuestra una recuperación autónoma desde la interfaz. Si nunca llegaron bonos a la bóveda, siguen en la empresa: no se inventa una transferencia de devolución.

## Casos de fallo y estado posterior

Cada fila conserva la respuesta o error, los saldos/estado comprobados y hashes cuando existen. La continuación del mismo fixture constituye el reintento legítimo; los replays aceptados deben conservar el hash y los saldos, no devolver un falso error. Aprobar de nuevo es idempotente: no vuelve a emitir.

| Caso provocado | Resultado | Evidencia |
| --- | --- | --- |
| Una declaración sin aprobación no se usa | APROBADO | HTTP 409. El bono requiere aprobación explícita. |
| Repetir aprobación no vuelve a emitir bonos | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Reanudar preparación conserva una sola bóveda | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Empresa nunca aprobada no recibe bonos | APROBADO | No se puede transferir el activo. Compruebe el saldo y la autorización del destinatario. Rechazo en simulación RPC; no enviado. |
| No se transfieren bonos a una cuenta sin aprobación | APROBADO | No se puede transferir el activo. Compruebe el saldo y la autorización del destinatario. Rechazo en simulación RPC; no enviado. |
| Emisión sin aprobación: transacción enviada y rechazada | APROBADO | [d3ee6556cf3f…](https://stellar.expert/explorer/testnet/tx/d3ee6556cf3fa65b1859c9109af078a1611556944adeb1f4eaa96f609161cfd7) Aserciones y estado posterior en el JSON de fallos. |
| Transferencia sin aprobación: transacción enviada y rechazada | APROBADO | [5eaf2aaaca99…](https://stellar.expert/explorer/testnet/tx/5eaf2aaaca99722b3f9d6e80f836d9621a146143d766900c69f10ecb6a7ffc5f) Aserciones y estado posterior en el JSON de fallos. |
| No se fondea sin los bonos | APROBADO | HTTP 409. Deposite los bonos antes de fondear. |
| No se abre sin liberación de TW | APROBADO | HTTP 409. Complete el release USDC por Trustless Work antes de abrir. |
| No se abre sin bonos ni dólares | APROBADO | No se puede abrir el préstamo. Compruebe que siga pendiente, tenga todos los bonos y dólares y un precio vigente. Rechazo en simulación RPC; no enviado. |
| Depósito firmado pero no enviado: sigue pendiente | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| deposit: firma ajena y transacción manipulada | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| RPC pierde la respuesta del depósito: recupera por hash | APROBADO | [5c74f3253c51…](https://stellar.expert/explorer/testnet/tx/5c74f3253c51792f0c15733ea6d7e813725c89ba04637b147c964bba5476b2ee) Aserciones y estado posterior en el JSON de fallos. |
| deposit: repetición conserva hash y saldos | APROBADO | HTTP 200. [5c74f3253c51…](https://stellar.expert/explorer/testnet/tx/5c74f3253c51792f0c15733ea6d7e813725c89ba04637b147c964bba5476b2ee) Aserciones y estado posterior en el JSON de fallos. |
| No se abre con bonos pero sin dólares | APROBADO | No se puede abrir el préstamo. Compruebe que siga pendiente, tenga todos los bonos y dólares y un precio vigente. Rechazo en simulación RPC; no enviado. |
| Error de TW antes de desplegar | APROBADO | HTTP 502. El servicio de garantía no pudo completar la operación. Su progreso está guardado; vuelva a intentar. |
| Escrow desplegado: timeout antes de fondear | APROBADO | HTTP 502. [2e679d52a824…](https://stellar.expert/explorer/testnet/tx/2e679d52a824f3eb6597278b0c37fbfda793c2721e40400b09f926e163e63ad8) No pudimos confirmar la operación. Consulte su estado antes de reintentar. |
| Escrow fondeado: error antes de liberar | APROBADO | HTTP 502. [2e679d52a824…](https://stellar.expert/explorer/testnet/tx/2e679d52a824f3eb6597278b0c37fbfda793c2721e40400b09f926e163e63ad8) El servicio de garantía no pudo completar la operación. Su progreso está guardado; vuelva a intentar. |
| TW pierde la respuesta después del envío: recupera por hash | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Liberado sin abrir: reintento sin despliegue ni pago duplicado | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| open: firma ajena y transacción manipulada | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| open: repetición conserva hash y saldos | APROBADO | HTTP 200. [2771b1962aaa…](https://stellar.expert/explorer/testnet/tx/2771b1962aaa59f4dd782c0e21e8607e0c9e38e6d868c7940cf78bbdf87f3080) Aserciones y estado posterior en el JSON de fallos. |
| Emisor no puede congelar una bóveda viva | APROBADO | No se puede cambiar esta autorización. El emisor no puede bloquear una bóveda con un préstamo vivo. Rechazo en simulación RPC; no enviado. |
| No se abre dos veces la misma bóveda | APROBADO | No se puede abrir el préstamo. Compruebe que siga pendiente, tenga todos los bonos y dólares y un precio vigente. Rechazo en simulación RPC; no enviado. |
| Préstamo sano rechaza incumplimiento en español | APROBADO | HTTP 409. No se puede declarar incumplimiento. El préstamo debe superar el umbral con precio vigente o estar vencido después del período de gracia. |
| Pago sin dólares suficientes | APROBADO | HTTP 409. No se puede pagar el préstamo. Compruebe que tenga dólares suficientes y que no se haya ejecutado la garantía. |
| Precio rechaza un paso mayor a 25 % | APROBADO | No se puede publicar este precio. Solo el publicador autorizado puede hacerlo, con pasos de hasta 25 % y al menos 30 segundos entre cambios. Rechazo en simulación RPC; no enviado. |
| Error y timeout RPC: respuesta española y reintento | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Precio rechaza un cambio antes del intervalo real | APROBADO | [7ac64762609c…](https://stellar.expert/explorer/testnet/tx/7ac64762609c43e6043fc123ac0b2c88ff75f117a21d6c5d26b8f56539ca70c1) No se puede publicar este precio. Solo el publicador autorizado puede hacerlo, con pasos de hasta 25 % y al menos 30 segundos entre cambios. |
| Por debajo de 70 %: sano | APROBADO | Estado Active; salud 6990 puntos básicos. Aserciones y estado posterior en el JSON de fallos. |
| Por encima de 70 %: margen | APROBADO | Estado Margin; salud 7089 puntos básicos. Aserciones y estado posterior en el JSON de fallos. |
| Por debajo de 85 %: no permite incumplimiento | APROBADO | HTTP 409. No se puede declarar incumplimiento. El préstamo debe superar el umbral con precio vigente o estar vencido después del período de gracia. |
| repay: firma ajena y transacción manipulada | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Ejecución antes de terminar cura: debe esperar | APROBADO | HTTP 200. Aserciones y estado posterior en el JSON de fallos. |
| repay: repetición conserva hash y saldos | APROBADO | HTTP 200. [f03231680fa7…](https://stellar.expert/explorer/testnet/tx/f03231680fa7fde54412c24cb529a9d68a53ab482b81a7f189a4a2c55780bee0) Aserciones y estado posterior en el JSON de fallos. |
| Pago dentro de cura: cierra y devuelve bonos | APROBADO | Estado Repaid; salud 8531 puntos básicos. Aserciones y estado posterior en el JSON de fallos. |
| Segundo pago no cobra otra vez | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Empresa ajena rechazada en las rutas de bono y préstamo | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| claim: firma ajena y transacción manipulada | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| claim: repetición conserva hash y saldos | APROBADO | HTTP 200. [c8b760a6a733…](https://stellar.expert/explorer/testnet/tx/c8b760a6a7334526f02c7fd740f3254773b80844d09af1661086b0f5950fafec) Aserciones y estado posterior en el JSON de fallos. |
| Firma de quien no es publicador: falla en cadena | APROBADO | [acc7b352036b…](https://stellar.expert/explorer/testnet/tx/acc7b352036b3126dfbd27c8b94de231b76174f6a06d085ed56b96f610fc4fd6) Aserciones y estado posterior en el JSON de fallos. |
| Sin colateral: dólares siguen en TW y no hay deuda | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Disputa TW devuelve neto al lender; preparación cancelada | APROBADO | [d5b3e8f50fbf…](https://stellar.expert/explorer/testnet/tx/d5b3e8f50fbfbe4f31d235b905ac84b7be467821a5abf2a02459270f1c80c88f) Aserciones y estado posterior en el JSON de fallos. |
| Repetir reembolso y cancelación no mueve fondos otra vez | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Estado cancelado legible, sin inventar deuda | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| Átomos de USDC y bonos de un tercero no bloquean apertura | APROBADO | [579e35cb3f98…](https://stellar.expert/explorer/testnet/tx/579e35cb3f98a75a2fcf937f927eca9fce57ff26ab5d1d6a940d58f69ad6dae5) Aserciones y estado posterior en el JSON de fallos. |
| Comprador sin permiso no ejecuta | APROBADO | No se puede ejecutar la garantía. Compruebe el plazo de cura, la autorización y saldo del comprador y que el precio vigente no haya cambiado. Rechazo en simulación RPC; no enviado. |
| Precio cambiado invalida la venta preparada | APROBADO | No se puede ejecutar la garantía. Compruebe el plazo de cura, la autorización y saldo del comprador y que el precio vigente no haya cambiado. Rechazo en simulación RPC; no enviado. |
| Venta con excedente: cobro y bonos en el mismo hash | APROBADO | [c5d12f76e81a…](https://stellar.expert/explorer/testnet/tx/c5d12f76e81a1fc3a3cf67e107e251e7efad79c726c0428da2a0eef72017eb80) Aserciones y estado posterior en el JSON de fallos. |
| Pago posterior a liquidación rechazado | APROBADO | HTTP 409. No se puede pagar el préstamo. Compruebe que tenga dólares suficientes y que no se haya ejecutado la garantía. |
| Bono extra bloqueado queda en custodia de la empresa | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| collect: firma ajena y transacción manipulada | APROBADO | Aserciones y estado posterior en el JSON de fallos. |
| collect: repetición conserva hash y saldos | APROBADO | HTTP 200. [8973b465ae20…](https://stellar.expert/explorer/testnet/tx/8973b465ae20d27decee169e2a0a3a1c7840ed92e928bd89612c827626843ddb) Aserciones y estado posterior en el JSON de fallos. |
| Recogida devuelve bono extra sin duplicación | APROBADO | [8973b465ae20…](https://stellar.expert/explorer/testnet/tx/8973b465ae20d27decee169e2a0a3a1c7840ed92e928bd89612c827626843ddb) Aserciones y estado posterior en el JSON de fallos. |
| La recuperación conserva exactamente una bóveda por declaración | APROBADO | [f059c605d769…](https://stellar.expert/explorer/testnet/tx/f059c605d769a658bd451853da6dc10f435b936d55cdd133e0d5c3be5407bcf3) Aserciones y estado posterior en el JSON de fallos. |
| Los campos de compatibilidad de la cancelación tampoco inventan deuda | APROBADO | Aserciones y estado posterior en el JSON de fallos. |

## Recorridos completos nuevos

| Caso | Resultado | Hash |
| --- | --- | --- |
| Margen, recuperación, pago y devolución de 100 RBOND | APROBADO | 3c184bec3982ab869efe65c15b9d5f5454ebf37195c36d3fd1ed71ba2cb0df37 |
| Incumplimiento, cura y venta atómica con excedente | APROBADO | 974413ba7a367b0d213d6c28a6697f513ee6b14560e391d73744e07bbb600ed6 |

## Autorización de rutas

| Caso | HTTP o resultado |
| --- | --- |
| state: sin sesión | 401 |
| register: sin sesión | 401 |
| collect/build: sin sesión | 401 |
| collect/submit: sin sesión | 401 |
| approve: sin sesión | 401 |
| accept: sin sesión | 401 |
| fund: sin sesión | 401 |
| price: sin sesión | 401 |
| default: sin sesión | 401 |
| liquidate: sin sesión | 401 |
| deposit/build: sin sesión | 401 |
| deposit/submit: sin sesión | 401 |
| open/build: sin sesión | 401 |
| open/submit: sin sesión | 401 |
| repay/topup: sin sesión | 401 |
| repay/build: sin sesión | 401 |
| repay/submit: sin sesión | 401 |
| claim/build: sin sesión | 401 |
| claim/submit: sin sesión | 401 |
| collect/build: empresa ajena | 403 |
| collect/submit: empresa ajena | 403 |
| approve: empresa ajena | 403 |
| accept: empresa ajena | 403 |
| fund: empresa ajena | 403 |
| price: empresa ajena | 403 |
| default: empresa ajena | 403 |
| liquidate: empresa ajena | 403 |
| deposit/build: empresa ajena | 403 |
| deposit/submit: empresa ajena | 403 |
| open/build: empresa ajena | 403 |
| open/submit: empresa ajena | 403 |
| repay/topup: empresa ajena | 403 |
| repay/build: empresa ajena | 403 |
| repay/submit: empresa ajena | 403 |
| Estado limitado a la cuenta autenticada; ignora otra cuenta enviada | 200 |
| Índice incorrecto no evita comprobar al deudor en el libro | 403 |
| Estado rechaza préstamo ajeno aunque figure en el índice | 403 |
| state: sin verificación KYB | 403 |
| register: sin verificación KYB | 403 |
| collect/build: sin verificación KYB | 403 |
| collect/submit: sin verificación KYB | 403 |
| approve: sin verificación KYB | 403 |
| accept: sin verificación KYB | 403 |
| fund: sin verificación KYB | 403 |
| price: sin verificación KYB | 403 |
| default: sin verificación KYB | 403 |
| liquidate: sin verificación KYB | 403 |
| deposit/build: sin verificación KYB | 403 |
| deposit/submit: sin verificación KYB | 403 |
| open/build: sin verificación KYB | 403 |
| open/submit: sin verificación KYB | 403 |
| repay/topup: sin verificación KYB | 403 |
| repay/build: sin verificación KYB | 403 |
| repay/submit: sin verificación KYB | 403 |
| claim/build: sin verificación KYB | 403 |
| claim/submit: sin verificación KYB | 403 |
| Firma exacta de la empresa | aceptada |
| Comisión exterior conserva la transacción exacta de la empresa | aceptada |
| Contrato cambiado | 400 |
| Función cambiada | 400 |
| Importe cambiado | 400 |
| Destinatario cambiado | 400 |
| Operación adicional | 400 |
| Firma para mainnet rechazada | 400 |
| Autorización Soroban anidada inyectada | 400 |
| Firma ajena | 400 |
| Cobro no permite desviar crédito de la empresa | 400 |
| Documento o cuenta inyectados rechazados | 400 |
| deposit: repetición de firma después del cierre | 200 |
| open: repetición de firma después del cierre | 200 |
| repay: repetición de firma después del cierre | 200 |

## Intentos fallidos conservados

La primera prueba de autorización obtuvo 202 al competir por la secuencia del operador; se reejecuta en serie. El primer rechazo de fondeo fue correcto, pero el validador de español del script no reconocía «Deposite»; se corrigió sin cambiar el HTTP esperado ni las aserciones de saldos.

| Caso | Error del intento |
| --- | --- |
| No se fondea sin los bonos | Deposite los bonos antes de fondear. |

El punto de entrada también detectó un error de arranque del lector de saldo: tsx no admitía await al nivel superior en este paquete. Se envolvió la lectura en una función asíncrona y se reejecutó correctamente, sin mover fondos durante el fallo.

## Pendientes y pruebas manuales

| Caso | Motivo y siguiente paso |
| --- | --- |
| Precio vencido para default y liquidación | La edad real máxima es 86400 s. No se alteró el reloj ni la configuración; falta esperar 24 horas con un préstamo adecuado. |
| Mora antes y después de los 30 segundos de gracia | El vencimiento real es 30 días desde open. Falta esperar ese plazo; la gracia corta no acorta el préstamo. |
| Liquidación con pérdida por faltante | No se provocó pérdida real: con 100 bonos y deuda de 50,3333334 USDC, el piso protegido produce una venta superior a 56 USDC, incluso después del descuento. Con colateral íntegro supera la deuda. No se dañó la garantía ni se modificaron contratos para fabricar este caso. |
| Pollar en navegador | Se sustituyó solo la identidad HTTP por cuentas Friendbot y firmas locales. Falta comprobar login y firma interactiva del SDK. |
| Archivo y restauración TTL | No se dejó archivar un contrato real ni se restauró; no se presenta simulación como archivo efectivo. |

No todos los rechazos de emisor, publicador o comprador tienen una ruta pública equivalente: las pruebas del contrato pasan por los clientes del servidor, y la evidencia indica cuándo se trata de simulación. No se prueba que cada rechazo de bajo nivel se presente en una pantalla real.

Para verificar el precio vencido, deje un préstamo abierto con precio de riesgo sin republicar durante más de 24 horas. Pruebe primero incumplimiento con ese precio y después renueve la misma cotización y repita. En otro préstamo ya declarado en incumplimiento, espere de nuevo a que caduque el precio y pruebe la venta antes y después de renovarlo. No confunda estas esperas reales con los 30 segundos entre cambios.

Para mora, conserve un préstamo sano hasta su fecha de vencimiento. Compruebe que el incumplimiento se rechace hasta terminar los 30 segundos de gracia y que después se admita. Para Pollar, pruebe las firmas y su cancelación desde el navegador, incluidos el depósito, la apertura, el pago, el cobro y la recogida de bonos. El archivo TTL necesita una entrada realmente archivada y una transacción de restauración; una lectura no demuestra mantenimiento.

## Archivos de evidencia

- [Recorridos nuevos](../scripts/evidence/t-journeys.json): pasos, hashes, balances y eventos de transferencias atómicas.
- [Fallos](../scripts/evidence/t-failures.json): casos, intentos fallidos, reservas brutas y 309 hashes.
- [Autorización nueva](../scripts/evidence/t-authorization.json).
- [Autorización anterior](../scripts/evidence/c4-authorization.json).
- [Ejecución y validación](../scripts/evidence/t-run.json).

Los hashes se pueden consultar en https://stellar.expert/explorer/testnet/tx/HASH. Una escritura del registro no es por sí sola evidencia de que se movieran fondos: buscar el recibo de la operación y las aserciones de saldos/eventos.
