# Modelo de ingresos y lado prestamista

Supuestos de trabajo para el piloto en Ciudad de México y Brasil. **Todas las cifras son hipótesis, no condiciones ofrecidas.** En testnet el libro no cobra comisión de protocolo.

## Cómo gana dinero Rendaval

Rendaval cobra un diferencial (*spread*) entre la tasa que paga la empresa y el rendimiento que recibe el prestamista.

| Supuesto | Valor de trabajo |
| --- | --- |
| Tasa para la empresa | 8 % anual |
| Rendimiento para el prestamista | 6 % anual |
| Diferencial de Rendaval | 2 % anual sobre el saldo prestado |
| Préstamo típico | 250.000 USD a 30 días |
| Comisión de Trustless Work (0,3 %) | La paga la empresa al desembolso; no es ingreso de Rendaval |

**Por préstamo típico:** 250.000 × 2 % × 30/360 = **416,67 USD**.

**Volumen necesario:** cada 1 M USD de saldo promedio prestado deja 20.000 USD al año. Para cubrir **1 M USD de costos anuales** hacen falta **50 M USD de saldo promedio**. Con préstamos de 30 días son unos **200 préstamos vivos a la vez** y unos **2.400 préstamos al año** (600 M USD originados).

Lo que hay que validar en el piloto: el préstamo típico real, cuántas veces renueva una empresa y si el prestamista acepta un 6 % en USDC frente a otras opciones en Stellar.

## Lado prestamista en producción

Hoy hay un único prestamista de prueba que firma en el servidor. En producción:

| Tema | Plan |
| --- | --- |
| Quiénes prestan | Inversionistas calificados e institucionales con USDC: fondos, tesorerías y bóvedas de rendimiento de Stellar que buscan crédito respaldado por RWA. |
| Alta | Verificación KYB o KYC (Didit, el mismo proveedor que para empresas) y una cuenta Stellar propia: Pollar para equipos pequeños o custodia institucional para fondos. |
| Origen de los fondos | USDC en Stellar, con entrada y salida por exchanges y anchors locales (por ejemplo, Bitso en México). |
| Cómo aportan | Un pool de prestamistas, o un prestamista por préstamo como hoy. El escrow de Trustless Work ya protege el USDC hasta que los bonos están en la bóveda. |
| Riesgo que asumen | El faltante si la venta de la garantía no cubre la deuda. No hay seguro; un fondo de reserva se financiaría con parte del diferencial. |
| Regulación (por validar con abogados) | México: crédito a empresas mediante una SOFOM propia o aliada, con prestamistas como inversionistas calificados. Brasil: estructura de crédito regulada (por ejemplo, un fondo de derechos crediticios, FIDC) o una entidad autorizada por el BCB. |

## Tamaño de mercado: qué contar

No usar el número de wallets con RWA como clientes: una wallet no es una empresa. Contar en su lugar:

- **Activo en Stellar:** deuda soberana no estadounidense tokenizada en Stellar, 490 M USD (Stellar Development Foundation, agosto de 2026), con Etherfuse emitiendo CETES (México) y TESOURO (Brasil).
- **Canal a empresas:** plataformas de tesorería que ya ponen a empresas en esos bonos, como Bando en México.
- **Empresas candidatas:** el número que salga de las entrevistas y de la lista de espera, no una estimación de wallets.
