# Contenido pendiente para el deck

## Por qué pedir prestado en vez de vender

**Ejemplo ilustrativo; hipótesis por validar.** Una empresa tiene USD 100.000 en bonos y necesita USD 50.000 durante 30 días.

| Préstamo Rendaval | Cálculo | Costo |
| --- | --- | ---: |
| Interés | 50.000 × 8 % × 30/360 | USD 333,33 |
| Comisión de desembolso | 50.000 × 0,3 % | USD 150,00 |
| **Total** | | **USD 483,33** |

El costo equivale al 0,48 % del valor del bono. Vender y recomprar cuesta el descuento de venta, ambas comisiones, los posibles efectos fiscales y el rendimiento perdido mientras la empresa no mantiene el activo. El préstamo conviene solo si ese costo supera 0,48 %. En CETES tokenizados cuyo rendimiento se incorpora al NAV, los tokens bloqueados continúan acumulándolo; Rendaval todavía no reenvía cupones de otros bonos. Es una hipótesis de piloto, no un resultado de clientes.

## Quién controla qué

| Pieza | Id de testnet | Quién controla | Límite contractual |
| --- | --- | --- | --- |
| Libro Rendaval | `CB6VYHQXCB3EKR4Q43LNDH7Y6GZXURIUBTOCHBWPCNSACANPHKSMSSKN` | Contrato; empresa firma apertura y pago | No abre sin bonos y precio vigente; no tiene retiro administrativo |
| Registro de la app | `CAR55ERAQUCHESSOEW2UUWYAUC3PVK7LIV7MIP6IIWRNM7AV3TYVAGGB` | Operador de testnet | Indexa declaraciones; no custodia ni concede propiedad |
| Reglas RBOND | `CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC` | Emisor | Autoriza tenedores; no puede revocar bóveda ni custodia mientras existe deuda |
| RBOND SAC | `CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3` | Reglas del activo de prueba | Sin valor real; no acumula rendimiento |
| USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | Activo de prueba | Sin valor real |
| Bóveda del préstamo pagado | `CCMZDQGDI3HLECRQ2Q4OSSJ2WW2RAVBUHDZODT66HD7HJ3IV2UVDXBNB` | Contrato por préstamo | Solo libera por cancelación previa, pago, venta o *write-off* a los destinatarios fijados |
| Escrow de desembolso | `CCWPH5ESWJH4FUFC2NV6IBKX2TB7N6NJBSR2QSKODCFXTU5DQRMGROQ4` | Prestamista aprueba; operador libera | Guarda USDC, no bonos; el receptor está fijado a la bóveda |
| Precio | Publicado en el libro | Publicador del emisor, separado de quien aprueba compradores | Paso máximo 25 %, intervalo y vigencia; la liquidación respeta el piso protegido |

## Dos transacciones clave

1. **Pago con bonos devueltos.** La empresa paga y todos los bonos regresan en la misma transacción: [ver en stellar.expert](https://stellar.expert/explorer/testnet/tx/f64d26a082aa802a3ecb45b34d7af751bb86fec87465bd967dd8be0f1e222a55).
2. **Venta atómica ante incumplimiento.** Un comprador autorizado paga y recibe los bonos en la misma transacción; cobra primero el prestamista y el excedente va a la empresa: [ver en stellar.expert](https://stellar.expert/explorer/testnet/tx/577997a1756a68d4a58827328f0b42bf0c68f11fddceffe1fa0f4ef4163b098d).

## Equipo

- **Claudio Condor — ingeniería y Stellar.** [LinkedIn: pendiente] · [GitHub: pendiente]
- **Jhonny — clientes y emisores.** [LinkedIn: pendiente] · [Correo: pendiente]

## Validación

**Estado actual:** no hay clientes ni acuerdos. Completar esta diapositiva solo con entrevistas realizadas y evidencia autorizada.

| Métrica | Resultado |
| --- | --- |
| Empresas entrevistadas | [n] |
| Emisores entrevistados | [n] |
| Empresas con bonos tokenizados o tokenizables | [n] |
| Necesidad de caja de corto plazo confirmada | [n] |
| Caso donde pedir prestado cuesta menos que vender | [describir o «no validado»] |
| Tasa y plazo aceptables | [rango observado] |
| Emisor dispuesto a autorizar bóveda y comprador | [n] |
| Próximo experimento | [acción, responsable y fecha] |

## Reemplazos en todo el deck

- «fase de diseño» → «prototipo público en testnet».
- «oráculo» → «precio publicado por el emisor (SEP-40)».
- Roadmap: marcar el hito 03 como **hecho en testnet**; no presentarlo como mainnet ni como piloto real.
- Mercado: «México (Ciudad de México) primero; Brasil segundo; diseñado para empresas de cualquier país».
- Tasas actuales: empresa 8 % anual fijo por 30/360; el contrato entrega todo ese interés al prestamista; comisión de desembolso 0,3 %; LTV 50 %.
- Modelo futuro, siempre rotulado como diseño no implementado: empresa 8 %, prestamista cerca de 6 %, Rendaval 2 puntos.
- Incumplimiento: venta a comprador aprobado por el emisor, 5 % de descuento sobre el precio protegido, prestamista primero, excedente a la empresa y faltante como pérdida del prestamista; después de 180 días, *write-off* al prestamista sin excedente.

