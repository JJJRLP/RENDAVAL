# ¿Por qué pedir prestado en vez de vender?

Respuesta a la objeción central de los jurados: «los RWA tokenizados suelen poder rescatarse rápido, y un préstamo al 8 % puede costar más de lo que rinde la garantía». Este documento separa cuándo Rendaval tiene sentido y cuándo no. **Las cifras son de ejemplo; las hipótesis deben confirmarse en las entrevistas** ([validacion.md](validacion.md)).

## El cálculo

Bono de 100.000 USD. Necesidad de caja: 50.000 USD durante 30 días.

**Opción A: préstamo en Rendaval** (condiciones de la demo)

| Concepto | Cálculo | Costo |
| --- | --- | --- |
| Interés | 50.000 × 8 % × 30/360 | 333,33 USD |
| Comisión de desembolso (Trustless Work) | 50.000 × 0,3 % | 150,00 USD |
| **Total** | | **483,33 USD**, o 0,48 % del valor del bono |

La empresa conserva el bono y su cupón durante el préstamo.

**Opción B: vender y recomprar**

Costo = descuento de venta + comisiones de venta y de recompra + impuestos por la venta + cupón no cobrado en el periodo sin el bono.

**Pedir prestado conviene cuando el costo de B supera 0,48 % del valor del bono.**

Que la tasa del préstamo (8 %) supere el rendimiento del bono no lo impide: no es una inversión apalancada, sino un puente de 30 días. Lo que importa es el costo total de cada opción en ese periodo.

## Cuándo NO conviene

Fondos tokenizados de letras del Tesoro que se rescatan a valor liquidativo en un día y sin costo (por ejemplo, muchos fondos del mercado monetario tokenizados). Ahí la opción B cuesta casi cero y el préstamo pierde. **No son el primer cliente.**

## Cuándo SÍ conviene (hipótesis a validar)

1. **Bonos sin mercado secundario profundo.** Si vender exige aceptar un descuento, un descuento mayor a 0,48 % ya hace más barato el préstamo. *Hipótesis Bolivia:* los bonos corporativos tienen poca negociación secundaria. Confirmar con empresas tenedoras y con la bolsa o agencias de bolsa.
2. **Ventanas de rescate.** Activos que solo se rescatan en fechas fijas o con preaviso, cuando la caja se necesita antes.
3. **Venta con efectos contables o fiscales.** Una venta realiza una ganancia o pérdida, o rompe una estrategia de mantener hasta el vencimiento.
4. **Obligación de mantener la posición.** Políticas de inversión, covenants o requisitos regulatorios que exigen conservar el activo.

## Qué llevar al deck

Una diapositiva con la tabla de la opción A, la condición de equilibrio (0,48 %) y **el caso concreto que validen las entrevistas**. Sin un caso validado, decir con franqueza que es la hipótesis principal del piloto.
