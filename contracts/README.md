# Libro de préstamos Rendaval — A3

Contrato Soroban propio para Stellar **testnet**. Registra préstamos y ejecuta
sus pagos USDC: capital máximo del 50 % del nominal y del valor actual, interés
fijo del 8 % anual, 30 días, año de 360 días. El operador y el prestamista
firman el desembolso atómico. Solo el emisor publica precios y autoriza
compradores; cualquiera puede marcar margen o incumplimiento cuando corresponde.
La empresa puede curar pagando toda la deuda hasta la liquidación.

El precio pertenece a una **serie de bonos** y lo comparten sus préstamos.
Cada préstamo tiene una entrada independiente: abrir otro no carga ni reescribe
la cartera. SEP-40 enumera un catálogo completo de hasta 64 series por instancia.
En el demo cada bono puede tener su propia serie para aislar su simulación;
al llenar el catálogo se aprovisiona otra instancia. Los nombres no se reciclan.

Los préstamos cerrados conservan su foto final y la protección contra apertura
duplicada, pero dejan de renovar TTL. Pueden archivarse sin mantenimiento
periódico; quien quiera restaurarlos paga. La web necesita indexar eventos,
porque el contrato no guarda listas de préstamos y el RPC no conserva toda la
historia indefinidamente.

- [ESCALA.md](ESCALA.md): límites vigentes con fuentes, auditoría a 10, 10.000 y
  1.000.000 préstamos, costes y decisiones de diseño.
- [INTERFAZ.md](INTERFAZ.md): especificación para la fase web: argumentos,
  unidades, firmas, errores, transiciones, SEP-40, eventos y restauraciones.
- [Evidencia testnet](../scripts/evidence/loan-book-testnet.json): instancia,
  WASM, hashes y resultados públicos del recorrido real.

## Instancia y alcance

Instancia testnet:
`CAF6FEECQ4OBWCSQDPKF62DUVJJJOQ6OXRIRJPKPMM4IKGKHERKIMBR2`.
Despliegue nuevo, sin migración, sin dependencias de instancias anteriores.
El contrato no es actualizable. Las evidencias de despliegues sustituidos se
retiraron del repositorio.

Los bonos permanecen en Trustless Work. Este contrato **no comprueba ni mueve
la garantía** y no llama al escrow. Operador y prestamista deben verificarla
antes de firmar. La liquidación aquí reparte USDC; no acredita entrega de bonos.
La fase web debe coordinar esa entrega externa y sus comisiones. Hoy no hay
atomicidad entre pago y entrega externa. No sustituye Pollar ni Didit.

No se modificaron `app/`, `components/` ni `lib/`. La aplicación existente
seguirá usando su flujo anterior hasta la integración de esta interfaz.

## Compilar y probar

Rust con target `wasm32v1-none`, Soroban SDK **29.0.1** fijado en Cargo.lock,
Stellar CLI **30.0.1**. Testnet informa protocolo 30, compatible con el WASM.

```sh
cargo test --manifest-path contracts/Cargo.toml --locked
stellar contract build --manifest-path contracts/loan-book/Cargo.toml
npx next build
```

En este entorno, Cargo usa `CARGO_HOME=/tmp/rendaval-cargo` y la CLI está en
`/tmp/rendaval-cli/stellar`. Usar `stellar contract build` para preparar también
las secciones de especificación del WASM. Los artefactos/snapshots están
excluidos de git; Next.js no ejecuta Rust.

Las pruebas conservan las reglas anteriores y añaden cotización compartida,
aislación de series, capacidad de catálogo, LTV/frescura de apertura y no
renovación de cerrados. La prueba de escala abre 10.001 préstamos con pagos y
compara recursos de aperturas con 10, 100, 1.000 y 10.000 ya existentes. Tarda
aproximadamente dos minutos en este entorno. Mide host nativo, no throughput de
red ni latencia WASM; mantiene activos los límites del SDK.

## Demostración reproducible

```sh
LOAN_BOOK_EVIDENCE=scripts/evidence/loan-book-testnet.json \
  node --env-file=.env.local scripts/loan-book-testnet.mjs
```

Cada ejecución despliega otra instancia; no ejecutar para una mera lectura.
El script usa exclusivamente testnet, comprueba el SAC USDC, sube el WASM y
despliega con constructor atómico. Lee `VAULT_SECRET_KEY`, `LENDER_SECRET_KEY`
y `BOND_ISSUER_SECRET_KEY` sin imprimir ni guardar secretos. Crea prestatario y
comprador con Friendbot, manteniendo sus claves únicamente en memoria. Usa
ids ficticios de escrow; no invoca Trustless Work.

Registra tres series y abre tres préstamos de 50 USDC: liquidación a 55 % con
descuento del 5 % y excedente, devolución normal, y cura por devolución completa
después de default a 50 %. Verifica estados, reparto, aislamiento de precios,
SEP-40, saldos, WASM desplegado y TTL. Devuelve saldos USDC recuperables y revoca
al comprador. El gasto bruto del prestamista está limitado por código a 300
USDC; el recorrido completo usa 202,9166668 USDC y recupera el saldo inicial.

La evidencia registra todos los hashes enviados y estado/ledger de confirmación
para las transacciones propias, además de los hashes devueltos por Friendbot.
Incluye recursos simulados de open. No reconstruye un pago después de un
resultado ambiguo: consulta su hash. Si se interrumpe el proceso, se pierden las
claves efímeras; no volver a ejecutar a ciegas después de un resultado desconocido.

La pérdida en liquidación, vencimiento, fronteras de frescura y avance de TTL
se comprueban con reloj/saldos controlados en Rust. La demostración real no
espera días para verificar archivo ni usa Pollar en navegador. Ver ESCALA.md
para el trabajo pendiente antes de mainnet.

## Resultado verificado

Ejecución del 20 de noviembre de 2026 (21 de noviembre UTC): 30 hashes,
Liquidated / Repaid / Repaid, gasto bruto 202,9166668 USDC y saldo del prestamista
12.749 → 12.749 USDC. El WASM desplegado coincide con el compilado (20.387 bytes).
`cargo test`: 20 pruebas aprobadas. `npx next build`: aprobado.
Los [recursos nativos de escala](../scripts/evidence/loan-book-scale.json) y la
[evidencia de red](../scripts/evidence/loan-book-testnet.json) distinguen medición
local de simulación y transacciones confirmadas.
