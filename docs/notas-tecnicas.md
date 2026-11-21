# Servidor B1 e interfaz B2 — contratos C4

Solo Stellar testnet. Sin base de datos, nuevas variables ni dependencias. Se
conservan las constancias KYB existentes. [INTERFAZ](../contracts/INTERFAZ.md)
define el ABI; [README de contratos](../contracts/README.md) documenta sus límites.
Los contratos no se modifican ni despliegan desde el servidor.

## Identidad y verificación

Todas las rutas de préstamo pasan por `handle`: verifica el bearer token con
Pollar, obtiene exclusivamente su wallet y exige una constancia `kyb:<wallet>`
en Rendaval. Ni `wallet`, `borrower` ni un receptor enviado por el cliente eligen
la identidad. Las constancias antiguas siguen siendo válidas (país BO si no lo
incluyen). Didit y sus rutas mantienen su implementación.

## Persistencia sin base de datos

`store.ts` escribe JSON comprimido en nuestro contrato `app-registry`. Cada clave
se deriva de SHA-256(cuenta de namespace + clave lógica); el operador es el único
escritor. `put` exige versión esperada (compare-and-swap) y escribe documento y
hasta 16 slots atómicamente. Todos pueden leer y renovar TTL. No hay base de datos,
lista global ni límite de 1.000 entradas clásicas. Máximo 16 KiB comprimidos por valor.

El índice por empresa está ligado al **libro C4**. Su cabecera solo guarda dos
contadores; cada bono y cada reserva/préstamo ocupa un slot independiente. Añadir
una declaración o actualizar una reserva modifica un número constante de entradas
independientemente del historial. Las lecturas de una empresa recorren sus slots,
en lotes de 16; el contrato permite paginación, aunque state devuelve aún la lista
completa de esa empresa. No recorre otras empresas. El CAS de la cabecera evita
mezclar versiones o perder reservas concurrentes. El máximo de tres préstamos vivos
se conserva, al igual que la reserva previa a create_vault y el salt determinista.

Una entrada incorrecta no da acceso a fondos ni datos de otro préstamo: ownLoan
verifica siempre `get_vault(id).borrower`, también en state. El registro es un índice
público escrito por el operador; la autoridad de la deuda y la propiedad es el libro.

Declaración y aprobación son diferentes. `register` recibe metadatos del bono y
SHA-256 hexadecimal de su certificado de bloqueo. **El navegador calcula el hash;
no envía archivo, URL ni nombre de archivo.** El servidor rechaza campos extra.
El id deriva de empresa, metadatos normalizados y hash; repetir exactamente una
declaración recupera la misma. La declaración queda pública bajo `bond:<id>` y
aparece `under_review` hasta completar la aprobación explícita de demostración.
Los documentos reales no se guardan en Stellar. Esta demostración no verifica
que un certificado corresponda a un depositario auténtico.

Las antiguas entradas `b1:*` se retiraron de las cuentas operador y emisor; las
constancias KYB quedaron intactas. Cantidades, hashes de limpieza y capacidad restante
en [C4-REPORT](../contracts/C4-REPORT.md) y su evidencia. Antes de lanzamiento real
hay que migrar también las constancias a almacenamiento sin el límite clásico o a
un servicio durable apropiado, diseñar retención de datos públicos y programar
mantenimiento/restauración de TTL. El registro no transforma datos públicos en privados.

`keep_alive(key, slots)` mantiene una cabecera y hasta 16 slots; `book.keep_alive(id)`
mantiene el préstamo y todas sus custodias/prendas. GET/simulaciones no pagan ni
persisten renovación. Los errores de archivo requieren restaurar, no crear un registro
vacío que olvide deuda. Los documentos operativos por préstamo tienen límite de 16 KiB;
los historiales de actividad extensos deberán paginarse además del índice ya dividido.

## Transacciones y recuperación

`chain.once` mantiene un outbox durable por operación. Guarda el XDR firmado
público, hash implícito y retorno simulado ANTES de enviarlo; nunca claves privadas.
Usa el registro para ambos namespaces; la transacción de escritura usa Rendaval
excepto si Rendaval es origen del pago preparado, cuando usa el emisor como origen
y autorización Soroban del operador. Así no consume la secuencia del pago preparado. La escritura atómica elige un único sobre entre solicitudes paralelas.
No se crea un pago nuevo por un timeout: se reenvían los mismos bytes y se consulta
el hash. Tras éxito se conserva recibo y retorno. Horizon confirma hashes fuera de
la retención RPC; si no entrega metadata Soroban, el retorno simulado guardado solo
se utiliza DESPUÉS de comprobar éxito del hash exacto. Creaciones se cotejan con
configuración de cadena antes de usarse. Una transacción fallida o ausente después
de que Horizon haya avanzado más allá de su vencimiento puede reconstruirse.

Las firmas de empresa se preparan con la empresa como origen. El servidor firma
las autorizaciones Soroban de operador/prestamista necesarias para `open`; la
empresa autoriza la raíz y transferencias anidadas mediante su firma de sobre.
`build` guarda el desafío exacto. `submit` comprueba firma testnet y hash completo
del **inner transaction**: origen, secuencia, una sola operación, contrato,
función, todos los argumentos, memo, recursos, identidades y árboles de autorización.
Admite fee bump exterior sin alterar la transacción interior. Un desafío nuevo
invalida el anterior; una pestaña con un desafío antiguo debe prepararlo otra vez.
El ledger impide que dos sobres con la misma secuencia gasten dos veces.

## Recorrido

1. Pollar configura trustlines USDC y **RBOND**; las variables conservan sus nombres
   `NEXT_PUBLIC_VBOND_ISSUER` y `BOND_ISSUER_SECRET_KEY`, con el emisor RBOND final.
2. Empresa verificada declara bono USD 100–400, datos locales según referencia de
   `countries.ts`, vencimiento posterior a 30 días, cupón 0–30 %, hash de certificado.
3. `approve`: simulación explícita de revisión por custodio. Emisor autoriza tenedor
   por reglas, registra una serie propia del bono con XDR del Asset RBOND, publica
   precio inicial 1 y emite nominal digital. Cada etapa tiene outbox independiente.
   La emisión solo ocurre una vez aunque se pierda la respuesta.
4. `accept`: reserva el bono/slot, crea bóveda y custodia de entrega, registra su id
   en índice y autoriza ambas por reglas. Devuelve id de bóveda, no id TW.
5. `deposit/build` y `deposit/submit`: primera firma de empresa, `vault.deposit(face)`.
6. `fund`: verifica WASM fijado del libro y ambas custodias, configuración, términos,
   permisos RBOND, garantía y precio fresco. Despliega escrow TW de USDC, receiver
   bóveda, operator en roles de plataforma y lender como approver. Capital bruto,
   platformFee cero, un hito. Verifica roles/activo/importes devueltos por API.
   Lender fondea; operador completa hito; lender aprueba; operador libera.
   Toda mutación TW se construye y envía por API, jamás por llamada directa al contrato.
   Los balances reales se consultan por SAC; bruto en TW y al menos el neto en bóveda. El exceso pertenece al lender.
7. `open/build` y `open/submit`: segunda firma de empresa, más autorizaciones de
   operador y lender. El libro abre y entrega USDC atómicamente. Release TW por sí
   solo nunca aparece como deuda abierta. Plazo empieza en open.
8. `price`: una publicación por llamada, limitada por contrato a 25 % y 30 segundos.
   También permite renovar una serie aprobada antes de abrir, si caducó el precio. Si hace falta, devuelve `waiting`, precio alcanzado, objetivo y `nextChangeAt`.
   El cliente espera y vuelve a llamar hasta `complete`; no duerme 30 segundos en
   una petición. Al alcanzar margen, llama `flag_margin` cuando corresponde.
9. `repay/topup`: adelanto **de prueba** del lender una sola vez, interés más comisión
   TW. `repay/build`/`submit` cobran deuda y devuelven bonos en la misma transacción.
10. `default`: marca si contrato lo permite. `liquidate`: devuelve espera hasta cura,
    prepara lender como comprador/tenedor autorizado y ejecuta venta atómica.
    El precio esperado es max(actual, piso conservador calculado por el libro). Recuperación,
    pérdida y excedente son los del libro, no cálculos de historial de pagos.
11. `claim/build`/`submit`: la empresa reclama exclusivamente su crédito del libro.
    Un excedente entregado directamente no genera crédito pendiente; claim cero
    también es válido. `deliveryBalance` permite detectar bonos en custodia fallback.

El piso se describe en README/INTERFAZ: demorar mark_default no permite reducirlo.
Puede superar el primer precio de default. El comprador recibe solo la prenda;
exceso RBOND vuelve a la empresa, con fallback a delivery si es necesario.

Importes de contrato usan BigInt y se serializan como cadenas enteras con siete
decimales. Fee=floor(P*30/10000), neto=P-fee, interés=ceil(P/150), deuda=P+interés.
Los números decimales enviados a TW están acotados al MVP, nunca son cantidades
arbitrarias suministradas por el cliente. USDC y RBOND son activos distintos.

## API para B2

Todas las rutas bajo `/api/loan/`; bearer Pollar requerido. GET solo `state`; resto
POST JSON. Errores `{error}`: 400 formato/firma, 401 sesión, 403 KYB/pertenencia,
409 conflicto/condición de contrato, 502 proveedor. 202 indica hash pendiente;
consultar estado y reintentar, nunca asumir que no se movieron fondos. Respuestas
sin caché. Duración máxima declarada 300 s para operaciones con varios pasos.

| Ruta | Entrada | Salida principal |
| --- | --- | --- |
| `state` | ninguna | `bondRecords`, `preparations`, `allLoans`, `claimable`, índice de UI provisional |
| `register` | `{bond:{issuer,series,nominal,currency,coupon,maturity},certificateHash}` | id, serie interna, face, `under_review`, simulation |
| `approve` | `{bondId}` | approved, hashes, simulation |
| `accept` | `{bondId}` | contractId (bóveda), delivery, hashes |
| `deposit/build` | `{contractId}` | unsignedTransaction o completed |
| `deposit/submit` | `{contractId,signedXdr}` | hash, action |
| `fund` | `{contractId}` | ready_to_open, escrowId, hashes; reintentos recuperan etapas |
| `open/build` | `{contractId}` | unsignedTransaction |
| `open/submit` | `{contractId,signedXdr}` | hash |
| `price` | `{contractId,price}` o `{bondId,price}`; objetivo decimal (0,1] | complete/waiting, price, target, nextChangeAt, hashes |
| `repay/topup` | `{contractId}` | hash, amount decimal, simulation, etiqueta de adelanto |
| `repay/build` | `{contractId}` | unsignedTransaction o completed/repaid |
| `repay/submit` | `{contractId,signedXdr}` | hash |
| `default` | `{contractId}` | Defaulted, hash, cureDeadline |
| `liquidate` | `{contractId}` | waiting/retryAfter/cureDeadline o Liquidated/hash/buyer |
| `claim/build` | `{}` | unsignedTransaction de claim(wallet Pollar) |
| `claim/submit` | `{signedXdr}` | hash |

`allLoans` contiene también Pending; `loans` excluye preparaciones para mantener
compilación de pantallas. Cada registro trae `spec`, `vault`, `view` entero del libro,
status, `amounts` bruto/fee/neto/deuda, serie/precio, edad/frescura, `healthBps` nullable,
margin, cureDeadline, deliveryBalance y enlaces a libro/reglas/bóveda/delivery/TW.
`view.loan` conserva cantidades recibidas, vencimiento, default, proceeds, surplus,
loss, recipient y collateral conocido/autorizado/balance. Salud null se presenta
como desconocida. `claimable` es crédito total de empresa, no atribuible a un préstamo.
Los campos decimales `terms` y `health` solo adaptan pantallas anteriores.

No existen `/disburse` ni `/settle`: se quitaron pago clásico de desembolso,
repayment por memo, precio en manageData y liberación de bonos desde TW. La interfaz B2 usa bondRecords y allLoans directamente; nunca inventa un certificado ni aprueba automáticamente.

## Verificación reproducible

```sh
npm run lint
npx tsc --noEmit
npx next build
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-b1.ts
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-b1-authorization.ts
```

El primer script importa `dispatch` y los mismos servicios del servidor. Usa una
empresa Friendbot derivada solo en memoria, recuperable con las claves existentes,
Didit sandbox real y dos bonos de USD 100. No despliega contratos. Conserva pasos y
hashes públicos en `scripts/evidence/c4-server.json`, nunca secretos ni XDR firmado
en evidencia. Reejecutar una corrida completa no repite desembolsos. La segunda
prueba llama `handle` con una respuesta HTTP Pollar fixture: no modifica producción
ni añade bypass. Usa cadena real para KYB, pertenencia y preparación de firma.

Pollar en navegador requiere prueba humana: el SDK debe firmar el XDR interior
sin modificar recursos, fee, auth ni secuencia. Un fee bump exterior se acepta.
Si Pollar reconstruye el XDR o cambia la estrategia de autorización, se rechaza
con 400 y habrá que adaptar la integración tras observar su respuesta real. La
prueba automática no demuestra login humano ni esa firma del SDK.

No se simulan fechas futuras del ledger. Se espera la cura real de 60 segundos;
no se esperan los 30 días de plazo ni 180 de write_off. Contratos archivados por
TTL producen error explícito y requieren restauración, no se recrean deudas.
Enviar keep_alive periódicamente evita ese archivo; una simulación no basta.
Cancelación/refund extraordinario y retiro manual de delivery se describen en
INTERFAZ pero todavía no tienen rutas B1. No hay UI de liquidadores externos;
`mark_default` sigue siendo permissionless en cadena y liquidate admite cualquier
comprador autorizado a nivel de contrato, sin cambiar el servidor de esta demo.

## Resultado vigente C4

68 pruebas Rust y 65 verificaciones de autorización aprobadas. Ambos recorridos
reales usan el libro y registro C4; ids, hashes, transferencias y límites en
[C4-REPORT](../contracts/C4-REPORT.md). Gasto bruto global: 208,2215724 USDC,
incluidos probe y prueba intermedia. Se retiraron 746 entradas clásicas b1,
conservando 19 KYB; Rendaval admite 977 subentradas adicionales bajo el límite actual.
El índice incorrecto de prueba no permite fund ni state sobre otra empresa.

## Resultado histórico B1 — antes del reemplazo C4

Los siguientes importes pertenecen al libro anterior. Resultados vigentes, piso
nuevo, ids y hashes están en [C4-REPORT](../contracts/C4-REPORT.md).

- Dos préstamos reales de 50 USDC, cada uno con 100 RBOND. TW entregó 49,85 USDC
  por préstamo y cobró 0,15: comisión total **0,30 USDC**.
- Primer préstamo: margen a precio 0,65, recuperación a 1, adelanto de prueba de
  0,4833334 USDC, deuda pagada 50,3333334 y los 100 RBOND devueltos. [Repay](https://stellar.expert/explorer/testnet/tx/4348400e62f3ad5bb0a5b9fe1a49b0fb6154f81600632d56ac8aad270edb7090).
- Segundo: default a precio 0,5625, respuesta waiting durante cura de 60 segundos,
  compra por lender de 53,4375 USDC y entrega de 100 RBOND en el mismo hash.
  Excedente **3,1041666 USDC** recibido directamente por empresa; pérdida cero.
  [Liquidación](https://stellar.expert/explorer/testnet/tx/6cd9f82ccd9714a8f1359692dc3d90c93f4f7f4126fe3d00911aaed37ff63aae).
- Claim confirmado, crédito pendiente cero. En esta corrida el excedente se pagó
  directamente: **no se comprobó un claim de crédito positivo bloqueado**.
- Salida bruta del lender, incluida su compra y el adelanto: **153,9208334 USDC**,
  inferior al máximo autorizado de 400. El script verifica presupuesto antes de
  cada desembolso nuevo. La empresa termina con 100 RBOND y 52,9541666 USDC.
- 63 comprobaciones de autorización aprobadas: token ausente, empresa sin KYB,
  bono/préstamo ajenos, estado aislado, certificado/campos inyectados, función,
  contrato, cantidad, receptor, operación adicional, firma ajena/mainnet, árbol
  Soroban manipulado, fee bump válido y replay sin doble movimiento.
- Hubo un timeout real de Horizon al guardar un outbox durante la preparación del
  comprador. La corrida se reanudó desde cadena sin repetir fondeo TW ni pagos.
- `npm run lint`, `npx tsc --noEmit`, `npx next build` aprobados. Lint conserva una
  advertencia previa de import no usado en `scripts/research/c3/contract-receiver.mjs`.

[Evidencia del recorrido](../scripts/evidence/b1-testnet.json),
[autorización](../scripts/evidence/b1-authorization.json) y
[lista completa de archivos modificados, agregados y eliminados](../scripts/evidence/b1-files.txt).
No se hizo commit. No se cambiaron contratos, configuración de hosting ni secretos.

## Interfaz B2 y extensiones

`state` añade `readyToOpen` a cada préstamo (recibo durable de release), para
habilitar la segunda firma solo cuando terminó el fondeo. `claimTransactions` reúne los enlaces a los cobros de la empresa. La interfaz recupera
reservas sin bóveda y autorizaciones interrumpidas con `accept`.

- `collect/build`: `{contractId}`; prepara `collect_bonds` en delivery.
- `collect/submit`: `{contractId,signedXdr}`; valida y envía el desafío exacto.

Ambas requieren Pollar, KYB, propiedad del préstamo y que recipient de delivery
sea la empresa autenticada. No cambian permisos ni contratos. El dueño recibe los
bonos según el contrato; balance cero se considera completado. Los hashes se
agregan a la actividad del préstamo.

El rechazo de XDR registra un código técnico sin cuenta, token, documento, XDR ni
claves: formato, comisión exterior, desafío modificado/vencido o firma inválida.
Se conservan todas las comprobaciones del inner transaction.

Si la habilitación automática Pollar falla, el cliente prepara changeTrust RBOND,
pide signTx y lo envía a Horizon testnet. Comprueba el saldo antes de repetir y
explica la reserva XLM. Esto no autoriza al tenedor: la aprobación del emisor sigue
siendo un paso separado. No hay nuevas variables ni dependencias.

Los errores y firmas rechazadas permiten preparar un desafío nuevo. Una respuesta
202 se trata como pendiente, nunca como éxito. Las esperas de precio muestran el
objetivo y un contador; «Continuar cambio» publica el siguiente paso. Al recargar
se conserva el último precio confirmado, no una orden de precio futura.

Reglas mostradas por app y FAQ desde `lib/loan/risk-copy.ts`:

Aviso de margen al 70 % de deuda sobre garantía; incumplimiento al 85 % o al vencer los 30 días más 30 segundos de gracia. Tras declararlo, dispone de 60 segundos para pagar antes de habilitar la venta. Un comprador aprobado por el emisor compra con 5 % de descuento sobre el mayor entre el precio vigente y el piso protegido. Pago y entrega ocurren juntos: cobra primero el prestamista, el excedente va a la empresa y el prestamista asume cualquier faltante.
