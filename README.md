# Rendaval

Préstamos en dólares digitales (USDC) para empresas, con Bolivia como primer
mercado, respaldados por bonos tokenizados. MVP de hackathon sobre **Stellar
testnet**: activos sin valor real, custodia/tokenización simuladas y proveedores
sandbox. Next.js 16, React 19, Pollar, Didit y Trustless Work.

## Recorrido de la empresa

1. Ingrese con Pollar y verifique su empresa con Didit; Bolivia es el país inicial,
   pero puede elegir otro país y declarar en moneda local o USD.
2. Declare el bono y seleccione el certificado de bloqueo. El navegador calcula
   SHA-256; solo la huella y los datos declarados se registran públicamente.
3. Espere la revisión. En testnet pulse **Simular aprobación y emisión**: autoriza
   al tenedor y emite RBOND sin custodio real. Si Pollar no habilita RBOND, use
   **Habilitar bonos con mi firma** en Su cuenta (requiere reserva XLM).
4. Revise la oferta: por USD 100,00 nominales debe 50,00 de capital, paga 0,15 de
   comisión de desembolso y recibe 49,85 USDC. Debe 50,3333334 USDC con interés;
   la pantalla redondea a dos decimales. Prepare el préstamo.
5. Firme el depósito de bonos. Prepare los dólares del prestamista de prueba:
   Trustless Work los protege y libera a la bóveda tras comprobar la garantía.
   Firme por segunda vez para aceptar deuda y recibir el neto atómicamente.
6. Consulte precio publicado, salud, vencimiento y actividad Stellar por préstamo.
   Puede simular precios por pasos de hasta 25 % cada 30 segundos.
7. Firme el pago: todos los bonos se liberan en esa misma transacción. Puede simular
   un adelanto de interés y comisión una vez para probar el reembolso.
8. En incumplimiento vea la cuenta regresiva de cura y pague, o simule después la
   compra autorizada. Se muestran precio de compra, excedente y pérdida reales del libro.
9. Cobre créditos pendientes con una firma; recoja bonos de la custodia auxiliar si
   su cuenta puede recibirlos. Al volver a abrir la pestaña se consulta el estado
   del servidor; reintentar recupera etapas confirmadas. Hasta tres préstamos abiertos.

[API y recuperación](docs/notas-tecnicas.md), [contratos](contracts/INTERFAZ.md).

## Arquitectura

```
Navegador /app
  Pollar: sesión, trustlines USDC/RBOND, firmas de depósito, open, repay y claim
  Certificado del depositario: SHA-256 local; el archivo nunca sale del navegador
       ↓
Next.js /api/kyb/* y /api/loan/*
  Pollar Server API → identidad de empresa (no dirección enviada por cliente)
  Didit sandbox → verificación; constancias KYB existentes preservadas
  Registro Soroban → declaraciones, revisión, índice por empresa y outbox
  Stellar account data → constancias KYB
  Reglas RBOND → aprobación de tenedores; impide revocar garantía prendada
  Libro C4 → series, precio, deuda, salud, margen, default, repay y liquidación
  Bóveda por préstamo → bonos; custodia auxiliar para entrega bloqueada
  Trustless Work API → USDC del lender, release neto a la bóveda
```

Sin base de datos. Un índice durable por empresa permite leer sus ids de préstamo
sin recorrer los préstamos del sistema ni depender de retención de eventos RPC.
Las declaraciones pendientes y su hash de certificado viven en el registro Soroban. Aprobación explícita de demo autoriza a la empresa, registra una serie,
publica su precio y emite RBOND. Un outbox Stellar conserva la operación antes de
su envío para recuperar respuestas perdidas sin pagos duplicados.

La empresa firma depósito y apertura por separado. `open` protege bonos, registra
la deuda y entrega USDC netos atómicamente. Debe principal bruto más interés;
la comisión TW (0,3 %) se muestra por separado. `repay` devuelve todos los bonos
en la misma transacción. `liquidate` cobra al comprador autorizado y le entrega
los bonos atómicamente: lender primero, excedente a empresa, faltante como pérdida.
Los créditos no entregados se reclaman mediante `claim`.

Todas las rutas autentican Pollar, requieren KYB y comprueban pertenencia. Las
firmas se validan contra el XDR interior exacto preparado, incluyendo los árboles
Soroban. Se acepta fee bump exterior. Operador, emisor y lender firman solo en
servidor con claves de prueba.

| Contrato testnet | Dirección |
| --- | --- |
| Libro | [CB6V…SSKN](https://stellar.expert/explorer/testnet/contract/CB6VYHQXCB3EKR4Q43LNDH7Y6GZXURIUBTOCHBWPCNSACANPHKSMSSKN) |
| Registro app | [CAR5…AGGB](https://stellar.expert/explorer/testnet/contract/CAR55ERAQUCHESSOEW2UUWYAUC3PVK7LIV7MIP6IIWRNM7AV3TYVAGGB) |
| Reglas RBOND | [CCLL…HUKC](https://stellar.expert/explorer/testnet/contract/CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC) |
| RBOND SAC | [CDMV…EGC3](https://stellar.expert/explorer/testnet/contract/CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3) |
| USDC SAC | [CBIE…DAMA](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |

## Quién controla qué

Nadie puede retirar los bonos de una bóveda por su cuenta: solo los mueven `repay`, `liquidate`, `cancel` (antes de abrir) o `write_off` (180 días después del incumplimiento), y cada salida va a un destinatario fijado por el contrato.

| Pieza | Cuenta | Qué puede hacer | Qué no puede hacer |
| --- | --- | --- | --- |
| Bonos RBOND | Bóveda propia de cada préstamo (contrato) | Recibir el depósito de la empresa y entregar los bonos en las salidas previstas | Entregarlos a otra dirección; no hay retirada administrativa |
| Reglas RBOND | Emisor | Autorizar tenedores: empresa verificada, bóveda, custodia auxiliar y comprador | Revocar la bóveda o su custodia mientras hay deuda |
| Precio | Emisor (publicador) | Publicar el precio de la serie en el libro, con saltos de hasta 25 % | Saltarse el límite de frecuencia o de variación |
| Escrow USDC de Trustless Work: `approver` | Prestamista | Aprobar el hito de desembolso | Tocar los bonos: el escrow solo guarda USDC |
| Escrow USDC: `serviceProvider`, `platformAddress`, `releaseSigner`, `disputeResolver` | Operador Rendaval | Marcar el hito y liberar el USDC | Liberarlo a otro destino: el `receiver` es la bóveda del préstamo |
| Escrow USDC: `receiver` | Bóveda del préstamo | Recibir el USDC antes de `open` | — |
| Deuda y desembolso | Libro (contrato), con firma de la empresa | Abrir la deuda y entregar el neto en una transacción | Abrir sin bonos depositados ni precio vigente |

En testnet, el operador, el emisor y el prestamista firman en el servidor con claves de prueba. Detalle en [contracts/README.md](contracts/README.md) y [contracts/INTERFAZ.md](contracts/INTERFAZ.md).

## Puesta en marcha

Node.js 20.9 o superior. `npm install`, copie `.env.example` a `.env.local`, complete
sus valores de testnet y ejecute `npm run dev`. Abra `/app`.

| Variable existente | Uso |
| --- | --- |
| NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY | Pollar navegador, pub_testnet_… |
| NEXT_PUBLIC_VBOND_ISSUER | Emisor **RBOND** GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6; nombre conservado |
| POLLAR_SECRET_KEY | Verificación de sesión, sec_testnet_… |
| DIDIT_API_KEY | Sandbox sk_test_… |
| DIDIT_KYB_WORKFLOW_ID | Flujo KYB |
| TRUSTLESS_WORK_API_KEY | API dev de TW |
| VAULT_SECRET_KEY | Operador Rendaval, attestations e índice |
| LENDER_SECRET_KEY | Prestamista/comprador de demo |
| BOND_ISSUER_SECRET_KEY | Emisor RBOND, revisión y precios |

Pollar dashboard: configurar origen, login, patrocinio de trustlines y activos
USDC y RBOND. Las cuentas del servidor necesitan XLM para comisiones y renta del
registro Soroban y reservas de constancias KYB. Lender necesita USDC testnet. No se usan variables NEW_* ni OLD_*.
Vercel utiliza las mismas variables; no hay configuración adicional ni base de datos.

## Comandos y evidencia

La [fase T](docs/pruebas.md) reúne recorridos nuevos, fallos y recuperación en testnet.
Ejecute `node scripts/verify-phase-t.mjs` para reanudar; use `--campaign=identificador`
para una campaña nueva. No ejecute dos campañas simultáneamente con las mismas claves.
El informe distingue transacciones, rechazos de simulación y casos pendientes.

- `npm run lint`, `npx tsc --noEmit`, `npx next build`.
- `scripts/verify-b1.ts`: recorrido real por servicios del servidor, dos préstamos,
  margen/recuperación, repay y default/cura/ejecución/claim; presupuesto bruto <400 USDC.
- `scripts/verify-b1-authorization.ts`: rutas, pertenencia y firmas manipuladas.
- `scripts/verify-kyb.ts`: Didit sandbox y constancia Stellar.
- `scripts/fund-lender.ts`: recarga testnet del lender; no es parte de la prueba B1.
- `scripts/c4-verify.mjs`: verificador de evidencia de contratos C4, solo lectura.
- `scripts/verify-sep40-compat.ts`: lectura solo de testnet que consulta un precio de
  Reflector y uno del libro Rendaval con el mismo lector SEP-40.

Scripts TypeScript: `node --env-file=.env.local --conditions=react-server --import tsx
scripts/<nombre>.ts`. Hashes y resultados en `scripts/evidence/`. Las pruebas omiten
login y firma interactivos de Pollar; [notas técnicas](docs/notas-tecnicas.md) detallan
las diferencias posibles. Los scripts anteriores de préstamos web fueron eliminados.

El libro publica la interfaz de precios **SEP-40** (USD, siete decimales y resolución
del contrato). El precio que afecta cada préstamo sigue siendo publicado por el emisor
en el propio libro; la compatibilidad solo permite que lectores externos usen el mismo
formato. Compruébelo sin claves ni efectos en cadena con
`node --import tsx scripts/verify-sep40-compat.ts`.

## Límites de demostración

Garantía USD 100–400, hasta tres préstamos pendientes/vivos por empresa. Precio
inicial USD 1 por RBOND, actualizaciones hasta 25 % cada 30 segundos; precio fresco
hasta 86400 segundos. Margen 70 %, default 85 %, cura 60 segundos. Plazo 30 días,
interés anual 8 % base 360. Un adelanto de prueba cubre interés más fee una vez por
préstamo. Los tipos de cambio locales son referencias fijas de demostración.

No es un producto auditado ni apto para dinero real. El certificado se declara por
hash; su revisión es una simulación explícita. Cada entrada del registro tiene tamaño máximo, pero el índice usa slots independientes
sin vector creciente ni reservas clásicas. TTL requiere transacciones de mantenimiento
y restauración si se deja archivar. [Informe C4](contracts/C4-REPORT.md).
Liquidadores externos y operación comercial quedan fuera de esta demostración. La firma interactiva Pollar y su configuración RBOND requieren validación humana.

## Reglas de riesgo

Aviso de margen al 70 % de deuda sobre garantía; incumplimiento al 85 % o al vencer los 30 días más 30 segundos de gracia. Tras declararlo, dispone de 60 segundos para pagar antes de habilitar la venta. Un comprador aprobado por el emisor compra con 5 % de descuento sobre el mayor entre el precio vigente y el piso protegido. Pago y entrega ocurren juntos: cobra primero el prestamista, el excedente va a la empresa y el prestamista asume cualquier faltante.

El precio depende del emisor y no garantiza una venta. El piso protegido puede superar el precio de mercado y demorar la compra. Tras 180 días de incumplimiento, los bonos pueden entregarse al prestamista sin excedente para la empresa. El emisor puede autorizar a la empresa deudora como compradora. El interés es fijo: pagar antes no lo reduce y pagar tarde no lo aumenta. Añadir bonos no mejora la salud del préstamo. La autorización para recibir bonos puede revocarse después del cierre; una entrega bloqueada queda en custodia auxiliar. No hay seguro ni auditoría independiente de las correcciones C4.

Además, las entradas Stellar necesitan mantenimiento y restauración de TTL. La
verificación KYB aún usa entradas clásicas de capacidad finita. Los metadatos
son públicos y no existe custodia legal ni validación del certificado.

## Verifíquelo en Stellar

Los contratos vigentes figuran en la tabla de arquitectura. Activo regulado
[RBOND](https://stellar.expert/explorer/testnet/asset/RBOND-GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6),
[bóveda del recorrido pagado](https://stellar.expert/explorer/testnet/contract/CCMZDQGDI3HLECRQ2Q4OSSJ2WW2RAVBUHDZODT66HD7HJ3IV2UVDXBNB) y
[escrow de desembolso Trustless Work](https://stellar.expert/explorer/testnet/contract/CCWPH5ESWJH4FUFC2NV6IBKX2TB7N6NJBSR2QSKODCFXTU5DQRMGROQ4).

Recorrido completo de `scripts/evidence/c4-server.json`, finalizado el 21-11-2026:

- [Declaración](https://stellar.expert/explorer/testnet/tx/aae1196a07c3ed55b8716d31744da45660f5388bcfbc26f2e794aba58108c9d2).
- [Autorización de tenedor](https://stellar.expert/explorer/testnet/tx/93c2ccf1099a739ee2fc367e2ac42f803040760da8485abb9e76c505724e7e23).
- [Serie](https://stellar.expert/explorer/testnet/tx/7ecf9504b51cf0e034101540548fef344ef7e0ef307de507891d16eaa15573a7).
- [Precio inicial](https://stellar.expert/explorer/testnet/tx/a0c82475d1b0a11363a16da3006affdb57a161b86b049ea31e364eec8b39a5e2).
- [Emisión](https://stellar.expert/explorer/testnet/tx/3d9fb25acaf12ac8fee39839581904e23d32ab80ced946fee487cafa465204ed).
- [Primera firma: depósito](https://stellar.expert/explorer/testnet/tx/1592f4635971ddfb2d9ac2f09b64bd8b6655d4dfed8e43bde1b4a745b393370f).
- [Creación TW](https://stellar.expert/explorer/testnet/tx/7c9f2597b38c2029ddd45f0107055834a48024b3982ac431e1d95bb6e48ba8f4).
- [Fondeo TW](https://stellar.expert/explorer/testnet/tx/e47a3a6945c41fa783e178059eaaea66a377f46ccf950f90b07d4f25c78905e4).
- [Hito completado](https://stellar.expert/explorer/testnet/tx/6c3a6c0e05f60e98c885614298e34dbf8ad265a3d6f559fc23f1d3e9f7e22906).
- [Aprobación del prestamista](https://stellar.expert/explorer/testnet/tx/e64c535c1a13162e50caa84a0ce0afbc6f84b23638a2d97d8621cc3930ccfac8).
- [Liberación a la bóveda](https://stellar.expert/explorer/testnet/tx/a54afe3b6744490f1ce8370c0cb9518c5bdebcd719e63b224891c3c782318be4).
- [Segunda firma: deuda y desembolso](https://stellar.expert/explorer/testnet/tx/1c290604feb4f222d6eaebd57a45f860752b17c05f714e4bc0e5bacca57fa2d0).
- [Aviso de margen](https://stellar.expert/explorer/testnet/tx/c9e4e0712834693d40627d04e819efca9e07b3eb2d2aaf052f89ea0d6fe8a165).
- [Adelanto simulado](https://stellar.expert/explorer/testnet/tx/b3c70b8ef973a398bc5b07aa72f65dba7d0e79ee89828b2e9b353de648da25b4).
- [Pago y devolución íntegra de bonos](https://stellar.expert/explorer/testnet/tx/f64d26a082aa802a3ecb45b34d7af751bb86fec87465bd967dd8be0f1e222a55).

La segunda operación demuestra la [venta y entrega atómicas](https://stellar.expert/explorer/testnet/tx/577997a1756a68d4a58827328f0b42bf0c68f11fddceffe1fa0f4ef4163b098d), con excedente a la empresa. No se reejecutaron estos recorridos para B2.
