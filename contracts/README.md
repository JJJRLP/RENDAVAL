# Contratos Rendaval — C1, reinicio con RVBOND

Dos contratos inmutables en Stellar **testnet**: libro de préstamos y reglas del
bono. El libro desembolsa USDC y marca la garantía atómicamente. Las reglas
conservan aprobación/revocación del emisor sobre tenedores ordinarios, pero
rechazan revocar un escrow marcado. Solo el libro puede autorizar la retirada
de la marca: préstamo Repaid o Liquidated y saldo actual del escrow igual a cero.
Pagar sin devolver los bonos todavía no desprotege la garantía.

RVBOND tiene autorización requerida y revocable, flags inmutables y ningún
clawback. Su SAC entrega el admin a reglas sin posibilidad de recuperarlo.
Ni reglas ni libro tienen actualización, pausa, cambio de admin o passthrough.
Las reglas tampoco tienen emisión, transferencia, quemado ni clawback. El emisor
emite mediante pago clásico a una cuenta aprobada. Las cuentas G conservan sus
rutas clásicas de autorización; solo una dirección C sirve como garantía.

## Instancia final

Las direcciones y cada hash están en
[evidencia C1](../scripts/evidence/loan-book-testnet.json), que reemplaza la instancia
anterior. La web aún no utiliza estos contratos. Leer contractId para el libro y
rulesContractId para reglas; no desplegar otra instancia por visitante.

- Libro: `CDNWNZUS5ZUAYQ4ZT7EM5WMBW7UJWH722L7MD6LTZJKNEWXGT46TSM5M`.
- Reglas: `CCC5LY3FACFCC3XKJB34RQASGQJCS7KE4TNMFXTEMDL6XOBPWK6YKPZF`.
- Auxiliar de prueba: `CACGWM2EJ3MZQVJH3TQYEGIZQ5MYZVGKD5GOINRLQCNUCZ2ZWTXYMSOZ`.
- Activo: RVBOND.
- Emisor/publicador: `GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6`.
- SAC: `CDPPMX5DG2XQUNQFYKIB77OZVZJWAHRDEOLHOCRBJ2UK4MGBNHQUGZGW`.
- USDC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.

Operador: cuenta VAULT_SECRET_KEY; prestamista de la corrida: LENDER_SECRET_KEY.
Emisor y publicador: NEW_BOND_ISSUER_SECRET_KEY. Nunca usar la clave del VBOND retirado.
La corrida usa al operador como empresa y dueño del auxiliar, para conservar la
capacidad de recuperar fondos sin escribir claves efímeras.

## Orden del despliegue

1. Comprobar que no existe ninguna trustline de RVBOND y verificar flags actuales:
   required/revocable sí, clawback no. Activar AUTH_IMMUTABLE y comprobar máscara 7.
2. Calcular direcciones de reglas y libro mediante cuenta de despliegue y salts.
   Desplegar reglas con emisor y libro fijos; libro con reglas y parámetros fijos.
   El protocolo exige firma del desplegador para esas direcciones. No hay enlace
   público posterior ni ventana para capturar un inicializador.
3. Comprobar ambas configuraciones y entregar admin del SAC a reglas; comprobarlo.
   Solo entonces crear trustlines, autorizar receptores, emitir y admitir garantías.

Flags inmutables y entrega del admin son decisiones irreversibles. Esta ejecución
está autorizada para testnet. No cambia el activo VBOND retirado.

## Reglas conservadas

Capital máximo 50 % del nominal y del valor actual; interés 8 % anual, 30 días,
año de 360 días; margen 7000, default 8500, paso máximo 2500, edad 86400 segundos,
descuento de liquidación 500 puntos básicos. Operador y prestamista firman open;
empresa firma repay; comprador aprobado firma liquidate. Se conserva cura hasta
liquidación, pago íntegro, excedente, pérdida, aritmética comprobada y reintentos.

Las series no tienen límite global: cada una tiene token y precio compartido.
Solo el catálogo opcional SEP-40 tiene límite de 64. Registrar, abrir, cotizar y
retirar una prenda no recorren la cartera. Las vistas consultan garantía real;
las vistas terminales conservan foto final. release_pledge lee saldo actual por
separado. El estado persistente archivado se restaura, nunca se interpreta como
préstamo o marca inexistentes.

## Evidencia y reproducción

- [INTERFAZ.md](INTERFAZ.md): especificación en español para la web; tipos, errores,
  eventos y pasos exactos con firmas para alta, escrow, apertura, precios, pago y retirada.
- [ESCALA.md](ESCALA.md): almacenamiento, límites, coste y pruebas de escala.
- [Prueba desechable](../scripts/evidence/bond-rules-throwaway.json): ataques y rechazos,
  con cuentas Friendbot y activo de pago desechable. No usa USDC del prestamista.
- [Verificación final](../scripts/evidence/loan-book-testnet-verification.json): cotejo
  independiente de todos los hashes, WASM, flags, configuración y saldos finales.
- [Verificación desechable](../scripts/evidence/bond-rules-throwaway-verification.json):
  los 42 hashes de la prueba, incluidos tres ataques a flags fallidos en ledger.
- [Escala](../scripts/evidence/loan-book-scale.json): recursos nativos, no throughput.

SDK Soroban 29.0.1 fijado en Cargo.lock; Stellar CLI 30.0.1. En este entorno:

```sh
CARGO_HOME=/tmp/rendaval-cargo cargo test --manifest-path contracts/Cargo.toml --locked
CARGO_HOME=/tmp/rendaval-cargo /tmp/rendaval-cli/stellar contract build --manifest-path contracts/Cargo.toml
npx next build
node scripts/bond-rules-verify.mjs
```

El verificador es de solo lectura y no usa claves. Los ejecutores sí envían
transacciones; no ejecutarlos para consultar estado:

```sh
node scripts/bond-rules-testnet.mjs --throwaway
node --env-file=.env.local scripts/bond-rules-testnet.mjs --final
```

El ejecutor rechaza sobrescribir una prueba desechable o repetir una corrida final
completa. Registra hash antes de enviar y consulta ese hash para evitar duplicar
pagos ante incertidumbre. No guarda claves ni sobres firmados. Para un fallo parcial,
inspeccionar hash y estado antes de continuar: no borrar el diario ni volver a emitir
a ciegas. La evidencia tiene solo datos públicos. El gasto bruto del prestamista se
limita a 300 USDC; la corrida prevista desembolsa 50 y financia su interés de demo,
recuperando ambos al pagar.

## Alcance pendiente para la web

No se tocó app/, components/ ni lib/. Los bonos nunca pasan por el libro ni reglas;
se consulta y protege la dirección del escrow. El auxiliar `test-escrow` es solo
una prueba: su dueño puede retirar en cualquier momento. No valida un escrow TW
ni debe usarse en producto. En producción, operador y prestamista deben comprobar
código, roles y condiciones de salida antes de firmar open.

No se llamó Trustless Work. Siguen pendientes la trustline y aprobación de su
cobrador para RVBOND, release/resolución real por sus rutas oficiales y Pollar en
navegador. Liquidar paga USDC pero no entrega bonos atómicamente. La protección
no evita emisión adicional, impago del emisor ni revocación de receptores ordinarios.
La web debe confirmar la salida completa y después llamar release_pledge, no
considerar Repaid equivalente a garantía liberada.

Archivo/restauración tras días reales y auditoría independiente no están verificados.
Las fronteras de tiempo y TTL se prueban en Rust. La verificación de admin no certifica
que un token arbitrario sea un SAC: la web debe usar RVBOND y comprobar su identidad
clásica y ejecutable. Véase la [documentación oficial del SAC](https://developers.stellar.org/docs/tokens/stellar-asset-contract).

## Resultado final de C1

21 de noviembre de 2026 UTC (20 de noviembre en Caracas): **21 transacciones
confirmadas**, un préstamo de 50 USDC contra 100 RVBOND. El intento de congelación
fue rechazado en simulación con error 101; no se envió. El pago cerró Repaid,
pero retirar la prenda con 100 bonos todavía presentes falló con error 15.
Después de devolverlos, release_pledge retiró la marca; su reintento no cambió nada.
Los 100 bonos de demo se devolvieron al emisor por pago clásico de su tenedor.

Gasto bruto del prestamista: **50,3333334 USDC**. Saldo inicial y final:
**12.749 USDC**, sin pérdida neta; el saldo USDC de la empresa también quedó igual.
Escrow final vacío, prenda false, admin del SAC todavía en reglas. Flags finales:
required/revocable/immutable true; clawback false. Las simulaciones fallidas no
se presentan como transacciones confirmadas. La evidencia conserva todos los hashes.

**34 pruebas Rust aprobadas**, incluida la escala, y compilación WASM verificada.
[Resumen de comprobaciones](../scripts/evidence/contracts-c1-tests.json).
La suite conserva las 27 pruebas anteriores y agrega protección, autenticación,
retirada, cuentas clásicas, superficie de funciones y aislamiento frente a un token
que intente usar indirectamente la autoridad de reglas. Las mediciones incluyen
10.001 préstamos y más de 1.024 series. `npx next build` pasó.
