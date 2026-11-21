# Libro de préstamos Rendaval — A4

Contrato Soroban propio para Stellar **testnet**. Registra préstamos y ejecuta
pagos USDC: capital máximo del 50 % del nominal y del valor actual, interés
fijo del 8 % anual, 30 días y año de 360 días. Operador y prestamista autorizan
el desembolso atómico. Solo el emisor publica precios y autoriza compradores;
cualquiera puede marcar margen o default si se cumplen sus condiciones. La
empresa puede curar pagando toda la deuda hasta la liquidación.

Cada serie tiene un token inmutable y un precio compartido. **Registrar series
no tiene límite global ni toca una lista creciente**. list_series permite al
emisor publicar hasta 64 en el catálogo SEP-40; todas, incluso las no listadas,
se leen por nombre. El demo crea una serie por visitante sin listarla: no hace
falta otra instancia ni una base de datos que asigne préstamos a instancias.

El libro consulta balance y autorización del escrow en el token de la serie.
No abre sin garantía suficiente y autorizada. La salud usa el saldo real hasta
el nominal. Faltante o congelación permiten default sin esperar precio fresco
ni vencimiento. Liquidar cobra con descuento por lo que queda y exige que esté
autorizado. Repay permite cerrar aunque falten bonos o estén congelados; guarda
la foto final y no promete compensar ni devolver garantía.

Un error recuperable del token aparece como garantía no verificable; nunca se
inventa un faltante. Ninguna llamada recorre tokens de otras series. Un token
hostil puede agotar recursos en su propia transacción; el emisor debe vincular
SAC auténticos. [INTERFAZ.md](INTERFAZ.md) detalla estas condiciones.

Los cerrados conservan su foto y la protección contra apertura duplicada, sin
renovar Loan ni consultar tokens. Pueden archivarse sin mantenimiento periódico;
restaurarlos sigue costando. No existe list_loans. La web sin base de datos lee
por id obtenido de su flujo en cadena o del usuario; un buscador histórico global
necesitaría una fuente adicional. assets no es un índice de visitantes.

- [ESCALA.md](ESCALA.md): límites, almacenamiento, costes y límites de las pruebas.
- [INTERFAZ.md](INTERFAZ.md): especificación para la web, tipos, firmas y errores.
- [Evidencia testnet](../scripts/evidence/loan-book-testnet.json): instancia, WASM,
  hashes y resultados públicos.
- [Escala nativa](../scripts/evidence/loan-book-scale.json): mediciones locales.

## Instancia y alcance

Instancia testnet:
`CCIZPDJSPMUEH65IUK5MXOS4CNWN4XDNRRMWLIC3LAE4G6ELNQQK6CBC`.
Despliegue nuevo, no actualizable, sin migración. La evidencia anterior se
sustituye por la de esta instancia.

Las funciones del libro **no reciben ni mueven bonos** y no llaman Trustless Work. Verifica
saldo y autorización en el token, no titularidad ni reglas de salida del escrow.
La liquidación reparte USDC pero no acredita entrega de bonos; pago y entrega
externa todavía no son atómicos. No sustituye Pollar ni Didit.

No se modifican app/, components/ o lib/. La aplicación mantiene su flujo
anterior hasta integrar esta interfaz.

## Compilar y probar

Rust con target wasm32v1-none, Soroban SDK **29.0.1** fijado en Cargo.lock y
Stellar CLI **30.0.1**. La red de la prueba informa protocolo 30.

```sh
cargo test --manifest-path contracts/Cargo.toml --locked
stellar contract build --manifest-path contracts/loan-book/Cargo.toml
npx next build
```

En este entorno se usa CARGO_HOME=/tmp/rendaval-cargo y la CLI está en
/tmp/rendaval-cli/stellar. stellar contract build incluye la especificación del
contrato en el WASM. Artefactos y snapshots están excluidos de git.

Se conservan las pruebas económicas, firmas, atomicidad, reintentos, SEP-40 y
TTL. Se añaden registro de más de 1.024 series a coste constante, catálogo
separado, saldo insuficiente, congelación, faltante, salud real, fallos del token
sin afectar otra serie y fotos finales tras pagar con garantía dañada. La prueba
de apertura conserva 10.001 préstamos y mide con 10, 100, 1.000 y 10.000 previos.
Son mediciones del host nativo, no throughput ni comisiones de red.

## Demostración reproducible

```sh
LOAN_BOOK_EVIDENCE=scripts/evidence/loan-book-testnet.json \
  node --env-file=.env.local scripts/loan-book-testnet.mjs
```

Cada ejecución despliega una instancia nueva: no ejecutar para una mera lectura.
Solo testnet. Usa las claves de operador, prestamista y publicador de .env.local
sin imprimirlas ni guardarlas. Prestatario, comprador y emisor del bono son
cuentas efímeras de Friendbot con claves exclusivamente en memoria. El activo
nuevo A4BOND tiene autorización obligatoria, revocación y clawback habilitados.
No se altera VBOND ni su emisor. Direcciones de contratos reales sustituyen a
escrows para esta prueba: libro, USDC, SAC del bono y dos contratos auxiliares.
Solo se usan como direcciones tenedoras; no se invoca su lógica de escrow.
No se llama Trustless Work ni a sus contratos.

El script recorre liquidación a 55 % con descuento del 5 %, devolución normal,
cura tras default por precio, clawback de 80 sobre nominal 100 seguido de default
y devolución, y congelación seguida de default y devolución sin descongelar.
Usa cinco series, lista solo una para demostrar la separación y consulta una
no listada por SEP-40. Registra cada hash antes de enviar y consulta ese hash
para confirmar, sin reconstruir pagos ante resultados ambiguos. Comprueba WASM,
TTL, saldos y fotos finales; devuelve USDC recuperables y revoca al comprador.

El tope de gasto bruto del prestamista está fijado en 300 USDC. Las claves
efímeras se pierden al salir: no volver a ejecutar a ciegas tras un resultado
desconocido. La evidencia contiene datos públicos, no claves.

No se verifica entrega del bono, Pollar en navegador ni archivo/restauración
tras días reales. Mora, freshness, pérdida por liquidación y TTL se comprueban
en Rust con reloj y saldos controlados. Ver ESCALA.md antes de cualquier uso
en mainnet.

## Resultado de esta ejecución

21 de noviembre de 2026 UTC: **59 hashes**, cinco préstamos cerrados
(Liquidated / Repaid / Repaid / Repaid / Repaid). Gasto bruto del prestamista:
**254,2566669 USDC**, por debajo del tope; saldo inicial y final:
**12.749 USDC**. El WASM confirmado coincide con el compilado (23.149 bytes).

**27 pruebas Rust aprobadas**, ejecutadas en grupos, incluida la de 10.001
préstamos; npx next build aprobado. La evidencia anterior de contrato y recursos
se sustituyó. Las simulaciones de open en testnet utilizaron siete entradas de
solo lectura y cuatro de escritura; los recursos exactos están en el JSON.
