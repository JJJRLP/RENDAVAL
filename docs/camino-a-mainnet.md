# Camino a mainnet

Plan para llevar Rendaval desde este prototipo de Stellar testnet a un piloto con fondos reales. No es un compromiso de lanzamiento: la aplicación actual usa activos, emisor, prestamista, aprobación y tiempos de demostración.

## Estado del prototipo

| Pieza | Estado hoy | Pendiente antes de fondos reales |
| --- | --- | --- |
| KYB y pertenencia | Hecho en testnet: Pollar identifica la wallet y Didit deja una constancia Stellar. | Cobertura, privacidad, retención y operación de KYB; migrar constancias fuera del límite clásico. |
| Garantía | Hecho: hash local de certificado, serie RBOND y bóveda propia por préstamo. | Custodia legal/verificable del activo real y revisión documental que no publique datos sensibles. |
| Reglas del bono | Hecho: emisor aprueba tenedores y protege bóveda y custodia durante el préstamo; RBOND no tiene clawback. | Acuerdo con emisor sobre autorizaciones, transferencias, rescate y comprador. No asumir clawback ni que TW custodia bonos. |
| Desembolso | Hecho: Trustless Work protege USDC hasta liberar a la bóveda; el libro abre deuda y entrega el neto. | Diligencia de proveedor, términos, límites, comisiones, contingencia y reconciliación de producción. |
| Precio | Hecho: emisor publica precio en el libro; el libro expone SEP-40 y `verify-sep40-compat.ts` lo compara con Reflector. | Política de publicación, controles de calidad, continuidad y conflicto de interés. El préstamo no consume un oráculo externo. |
| Margen y venta cerrada | Hecho: margen, gracia, cura y venta con pago/entrega atómicos a comprador autorizado. | Prueba con activo del piloto, comprador independiente y revisión de plazos/umbrales de demostración. |
| Recuperación | Hecho: outbox durable, validación XDR y créditos reclamables. | Ensayo de incidentes, monitoreo, alertas y responsables de operación. |
| Auditorías | Tres revisiones independientes informaron y C4 corrigió hallazgos; hay 68 pruebas Rust y evidencia testnet. | Auditoría independiente del código corregido y despliegue final; C4 no afirma una nueva auditoría. |
| Liquidez y comercial | Pendiente: solo hay prestamista y comprador de demostración. | Prestamistas, modelo de riesgo, reservas, precios y validación de demanda. |
| Legal | Pendiente. | Opinión legal, custodia, valores/garantías, KYC/AML, contratos y datos del país piloto. |

## Límites que no deben ocultarse

Las tres revisiones no autorizan dinero real. Además de una auditoría posterior a C4, quedan operación de renovación/restauración de TTL, claves de producción en HSM o servicio de firma, paginación de historias grandes y validación humana de Pollar, Didit y Trustless Work. Los límites económicos actuales también requieren decisión: el *write-off* entrega toda la garantía al prestamista, el emisor puede autorizar al deudor como comprador, el interés es fijo y bonos extra no mejoran la salud.

## Orden propuesto para un piloto

1. Elegir empresa, emisor y bono reales; Bolivia es el primer mercado y el producto está diseñado para empresas de cualquier país.
2. Acordar custodia, autorizaciones, comprador independiente, precio y salida ante incumplimiento.
3. Repetir punta a punta en testnet con el activo del emisor: venta, entrega bloqueada, recuperación y fallo de proveedor.
4. Cerrar amenazas, TTL, claves, observabilidad, auditoría y revisión legal.
5. Ejecutar un piloto limitado: una empresa, un activo, monto pequeño, LTV conservador, reglas públicas y criterios explícitos para detenerlo.
6. Medir resultados antes de solicitar financiación adicional.
