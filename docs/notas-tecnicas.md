# Servidor B1 — contratos finales C3b

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

`store.ts` escribe documentos JSON comprimidos en entradas `manageData` de
Stellar, fragmentadas en valores de hasta 64 bytes. Un contador y todos los
fragmentos nuevos se escriben en una sola transacción clásica. El número de
secuencia de la cuenta serializa actualizaciones concurrentes. Las lecturas
usan nombres deterministas y el endpoint `/accounts/<account>/data/<key>`:
no enumeran préstamos ajenos ni dependen de eventos RPC.

La cuenta Rendaval guarda un índice por empresa, ligado al **libro C3b**, con
ids de bonos y reservas/ids de bóvedas. Una reserva se escribe ANTES de crear la
bóveda. Salt determinista y outbox permiten recuperar una creación interrumpida.
El índice solo contiene préstamos nuevos; nunca se incorporan escrows históricos.
La reserva cuenta para el límite de tres préstamos pendientes/vivos. Un mismo
bono no garantiza dos préstamos vivos. Los estados terminales permiten reutilizar
los bonos devueltos. El saldo real siempre lo comprueban SAC y libro.

Declaración y aprobación son diferentes. `register` recibe metadatos del bono y
SHA-256 hexadecimal de su certificado de bloqueo. **El navegador calcula el hash;
no envía archivo, URL ni nombre de archivo.** El servidor rechaza campos extra.
El id deriva de empresa, metadatos normalizados y hash; repetir exactamente una
declaración recupera la misma. La declaración queda pública bajo `bond:<id>` y
aparece `under_review` hasta completar la aprobación explícita de demostración.
Los documentos reales no se guardan en Stellar. Esta demostración no verifica
que un certificado corresponda a un depositario auténtico.

Las claves públicas de documentos se transforman en nombres `b1:<sha256-prefix>:`.
Los valores se leen con su contador; una escritura interrumpida no produce JSON
parcial. Las entradas consumen reservas XLM, permanecen en las cuentas y no están
sujetas a retención RPC. El tamaño de cada documento atómico está limitado a 98
fragmentos comprimidos: un historial de empresa muy grande requiere paginar el
índice antes de producción. El servidor no interpreta un índice/contrato ilegible
como inexistencia de deuda. La autoridad sigue siendo el contrato.

## Transacciones y recuperación

`chain.once` mantiene un outbox durable por operación. Guarda el XDR firmado
público, hash implícito y retorno simulado ANTES de enviarlo; nunca claves privadas.
Usa Rendaval como cuenta de diario excepto para transacciones cuyo origen es
Rendaval, donde usa el emisor, evitando consumir la secuencia de la transacción
preparada. La escritura atómica elige un único sobre entre solicitudes paralelas.
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
   Los balances reales se consultan por SAC; bruto en TW y neto exacto en bóveda.
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
    El precio esperado es max(actual, precio fijado al default). Recuperación,
    pérdida y excedente son los del libro, no cálculos de historial de pagos.
11. `claim/build`/`submit`: la empresa reclama exclusivamente su crédito del libro.
    Un excedente entregado directamente no genera crédito pendiente; claim cero
    también es válido. `deliveryBalance` permite detectar bonos en custodia fallback.

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
repayment por memo, precio en manageData y liberación de bonos desde TW. El hook
antiguo de registro/preparación muestra un aviso B2, sin inventar certificado ni
aprobar automáticamente. Las pantallas completas son otra fase.

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
hashes públicos en `scripts/evidence/b1-testnet.json`, nunca secretos ni XDR firmado
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
Cancelación/refund extraordinario y retiro manual de delivery se describen en
INTERFAZ pero todavía no tienen rutas B1. No hay UI de liquidadores externos;
`mark_default` sigue siendo permissionless en cadena y liquidate admite cualquier
comprador autorizado a nivel de contrato, sin cambiar el servidor de esta demo.

## Resultado verificado B1 — 21 de noviembre de 2026

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
