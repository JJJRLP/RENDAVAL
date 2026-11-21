# Borrador — solicitud al Stellar Community Fund

> Borrador con marcadores entre corchetes. No presentar sin completar equipo, presupuesto, enlaces, revisión legal y auditoría independiente posterior a C4.

## Nombre y resumen

**Rendaval: crédito USDC con bonos tokenizados y reglas del emisor.** Empresas de cualquier país —con Bolivia como primer mercado— obtienen USDC contra bonos tokenizados sin venderlos. Ante incumplimiento, la venta permanece dentro de las reglas del emisor y el pago/entrega son atómicos.

## Problema

Los activos tokenizados que exigen autorización de tenedores no encajan directamente en liquidaciones abiertas: la garantía no puede transferirse a cualquier dirección. [Añadir evidencia de mercado verificable, fechada y con fuente primaria.]

## Solución y estado actual

- KYB mediante Pollar/Didit y comprobación de pertenencia por préstamo.
- Libro Soroban propio, bóveda por préstamo, reglas RBOND de autorización y custodia auxiliar. RBOND es un activo de prueba aprobado por el emisor, sin clawback.
- Trustless Work protege el USDC del desembolso; **no** retiene los bonos.
- El emisor publica el precio en el libro. Este expone SEP-40 y una comprobación de solo lectura frente a Reflector; no se usa un oráculo externo para decidir el préstamo.
- Testnet: depósito, desembolso, pago, margen, incumplimiento, cura, venta cerrada, excedente y reclamación con evidencia. [Repositorio] · [Demostración].

## Riesgo y límites honestos

Activos, prestamista, aprobación, tipos de cambio y tiempos son de demostración. La venta depende de comprador autorizado y precio del emisor; no garantiza liquidez. Tres revisiones llevaron a C4, pero faltan auditoría independiente del código corregido, custodia legal, operación TTL, claves de producción, política de precios, prestamistas reales y legal. El *write-off*, la posible autocompra y el interés fijo requieren revisión antes del piloto.

## Integración y diferenciación

Stellar classic assets/SAC, Soroban, interfaz SEP-40, Trustless Work, Pollar y Didit. Activo e integración de emisor del piloto: [por confirmar]. No afirmar integración con Etherfuse, Bando, RedStone o Reflector más allá de la lectura SEP-40 de testnet. La comparación con competidores queda pendiente de fuentes primarias verificadas.

## Hitos y presupuesto — marcadores

| # | Entregable | Presupuesto |
| --- | --- | --- |
| 1 | Emisor y activo de prueba, recorrido testnet, amenazas y operación TTL | [$] |
| 2 | Auditoría posterior a C4, legal, claves de producción e incidentes | [$] |
| 3 | Piloto con una empresa, un activo, reglas públicas y evaluación | [$] |

## Equipo y métricas

[Nombres, roles y experiencia.] [Préstamo piloto cerrado sin incidente; empresa y emisor integrados; disponibilidad de precio; USDC desembolsado; resultados de auditoría.]
