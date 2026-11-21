# Libro de préstamos de Rendaval — fase A

Contrato propio de Soroban para testnet. Registra el préstamo y mueve USDC con
las reglas del producto: capital máximo del 50 % del nominal, interés fijo del
8 % anual y vencimiento a 30 días. Usa año comercial de 360 días, como la oferta
actual: interés = `ceil(capital / 150)` en unidades mínimas de USDC.

Los bonos permanecen en Trustless Work. Este contrato **no comprueba ni mueve
la garantía**, no llama al escrow y no sustituye Pollar ni Didit. El prestamista
que firma `open` debe verificar previamente el escrow, su titular y el nominal.
La liquidación aquí liquida el pago en USDC; no acredita entrega de bonos. Fase B
necesita coordinar esa entrega mediante el flujo autorizado de Trustless Work,
incluida su comisión. No hay atomicidad entre esa entrega externa y este pago.

## Compilar y probar

Rust con `wasm32v1-none`; Soroban SDK **29.0.1**, fijado junto con `Cargo.lock`.
Es la última versión estable del índice consultado; 30.0.0-rc.1 es preliminar.
El RPC de testnet confirmó protocolo 30, compatible con este contrato de protocolo
29. Se consultaron la [documentación del SDK](https://docs.rs/soroban-sdk/29.0.1/soroban_sdk/)
y la [guía de almacenamiento](https://developers.stellar.org/docs/build/smart-contracts/getting-started/storing-data).

Desde la raíz del repositorio:

```sh
cargo test --manifest-path contracts/Cargo.toml --locked
stellar contract build --manifest-path contracts/loan-book/Cargo.toml
npx next build
```

Se usó Stellar CLI 30.0.1. El SDK exige CLI >=25.2.0 para preparar las secciones
de especificación del WASM; un `cargo build` aislado no basta. En un entorno con
`~/.cargo` de solo lectura, use `CARGO_HOME=/tmp/rendaval-cargo`. No hace falta
instalar CLI globalmente: puede usar el binario oficial en `/tmp/rendaval-cli/`.
Los artefactos y snapshots de pruebas están excluidos de git. Next.js no ejecuta Rust.

## Desplegar y ejecutar la demostración

```sh
LOAN_BOOK_EVIDENCE=scripts/evidence/loan-book-testnet.json \
  node --env-file=.env.local scripts/loan-book-testnet.mjs
```

El script usa exclusivamente testnet, comprueba el SAC de USDC con una lectura,
sube el WASM, despliega e inicializa en una operación. Lee `VAULT_SECRET_KEY`,
`LENDER_SECRET_KEY` y `BOND_ISSUER_SECRET_KEY` sin imprimirlas ni guardarlas.
Crea prestatario y comprador con Friendbot y claves solo en memoria; usa dos
identificadores C ficticios, sin invocar Trustless Work. Cada ejecución crea un
contrato nuevo. Imprime su dirección y todos los hashes, y opcionalmente guarda
solo evidencia pública en la ruta indicada.

Abre 50 USDC, baja a 65 %, marca margen, baja a 55 %, marca incumplimiento y
liquida por 55 USDC con excedente. Otro préstamo de 50 USDC se devuelve con la
firma del prestatario como cuenta origen. Comprueba estados y saldos, devuelve
los USDC recuperables y revoca al comprador. El gasto bruto del prestamista es
155,3333334 USDC; el límite del script es 300 USDC y su saldo final debe coincidir
con el inicial. No reenvía movimientos con resultado ambiguo: consulta el hash.
Si se interrumpe el proceso, las claves efímeras se pierden; conserve el proceso
hasta que finalice. No vuelva a ejecutar a ciegas tras un resultado desconocido.

## Funciones y permisos

El constructor fija emisor, USDC y umbrales. `open` requiere al prestamista y
transfiere el desembolso; `repay` requiere al prestatario y devuelve la deuda.
Solo el emisor publica el precio por préstamo (`publish_price`) y administra
compradores (`set_buyer`). Cualquiera puede marcar margen (`flag_margin`) o
incumplimiento (`mark_default`) cuando se cumplen las reglas. `liquidate`
requiere la firma de un comprador autorizado, el precio esperado y un préstamo
Defaulted; reparte deuda, excedente y pérdida en una invocación.

Lecturas públicas: `get_loan`, `get_price`, `get_config`, `is_buyer`.
Los préstamos tienen almacenamiento persistente con renovación de TTL para
cubrir el plazo. No se reutilizan identificadores de préstamos cerrados.

[Interfaz completa](INTERFAZ.md): firmas, unidades, estados, errores, eventos,
reintentos, TTL y firma con Pollar para fase B.
[Evidencia pública de testnet](../scripts/evidence/loan-book-testnet.json).
