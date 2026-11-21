# Libro de préstamos de Rendaval — fase A2

Contrato propio de Soroban para testnet. Registra el préstamo y mueve USDC con
las reglas del producto: capital máximo del 50 % del nominal, interés fijo del
8 % anual y vencimiento a 30 días. Usa año comercial de 360 días, como la oferta
actual: interés = `ceil(capital / 150)` en unidades mínimas de USDC.

Los bonos permanecen en Trustless Work. Este contrato **no comprueba ni mueve
la garantía**, no llama al escrow y no sustituye Pollar ni Didit. El operador Rendaval y el prestamista
que firman `open` deben verificar previamente el escrow, su titular y el nominal.
La liquidación aquí liquida el pago en USDC; no acredita entrega de bonos. Fase B
necesita coordinar esa entrega mediante el flujo autorizado de Trustless Work,
incluida su comisión. No hay atomicidad entre esa entrega externa y este pago.

## Compilar y probar

Rust con `wasm32v1-none`; Soroban SDK **29.0.1**, fijado junto con `Cargo.lock`.
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
Crea prestatario y comprador con Friendbot y claves solo en memoria; usa tres
identificadores C ficticios, sin invocar Trustless Work. Cada ejecución crea un
contrato nuevo. Imprime su dirección y todos los hashes, y opcionalmente guarda
solo evidencia pública en la ruta indicada.

Abre tres préstamos de 50 USDC: uno se liquida a precio 55 % con descuento
del 5 % y excedente; otro se devuelve normalmente; el tercero baja por
80/65/50 %, se declara incumplido y se cura pagando toda la deuda.
Comprueba estados, lectura SEP-40, saldos y TTL, devuelve los USDC recuperables
y revoca al comprador. El gasto bruto es 202,9166668 USDC, debajo del límite
de 300 USDC; el saldo final del prestamista debe coincidir con el inicial.
No reenvía movimientos con resultado ambiguo: consulta el hash.
Si se interrumpe el proceso, las claves efímeras se pierden; conserve el proceso
hasta que finalice. No vuelva a ejecutar a ciegas tras un resultado desconocido.

## Funciones y permisos

El constructor fija operador, emisor, USDC, umbrales y guardas. `open` requiere al operador y al prestamista y
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


## Cambios A2

Solo Rendaval puede originar préstamos, junto con la autorización del prestamista.
La empresa puede curar un incumplimiento pagando antes de la liquidación.
El emisor sigue publicando: no se añadió un oráculo externo. Se exponen las
siete lecturas de SEP-40 y solo se retiene la última publicación por garantía,
con nombre Other(BOND_ + índice hexadecimal) y base USD.

Paso máximo: 25 % del precio anterior; vigencia: 24 horas; descuento: 5 %.
Los límites incluyen la igualdad. La mora no depende de la edad del precio,
pero vender sí exige precio fresco. El descuento se aplica antes de repartir
deuda, excedente y pérdida. Ver fórmulas y reintentos en INTERFAZ.md.
Estas guardas no verifican el valor económico declarado por el emisor ni
impiden varios pasos consecutivos.

La instancia A1 `CAS76EAJ5M5EDDIHSSHDVTCOAM6YZB3HKZVT5VOALVJNHZTYCAMV2A7B`
queda **sustituida**, sin migración ni actualización. Se conserva su
[evidencia histórica](../scripts/evidence/loan-book-testnet-superseded-phase-a.json).
Nueva instancia A2 en testnet:
`CDODWB2OFCJMBXK5Z262MIXNUXNOZELI6SKT7LSPGJTHRRHC35DTXWU5`.
La evidencia incluye el hash del WASM y los hashes de todas las transacciones.
Un [intento previo](../scripts/evidence/loan-book-a2-upload-attempt.json)
subió el mismo WASM y se detuvo antes de desplegar; no movió USDC.

No se modificó la aplicación ni se llamó a Trustless Work.

Verificación A2: 17 pruebas Rust aprobadas, WASM compilado y `npx next build`
aprobado. La ejecución real terminó con los tres recorridos correctos y 27 hashes;
el saldo del prestamista pasó de 12749 USDC a 12749 USDC. Se comprobó el hash del
WASM desplegado y más de 2 millones de ledgers restantes para instancia y préstamos.
La caducidad y la pérdida por liquidación se verificaron con reloj y saldos
controlados en las pruebas Rust; no se esperaron 24 horas en testnet.
