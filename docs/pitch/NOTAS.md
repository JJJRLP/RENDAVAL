# Notas para actualizar `Rendaval-pitch-v2`

> **Versión para presentar: `Rendaval-pitch-final` (10 diapositivas).** Resume la v4: portada, problema, solución (Pollar, Didit, Trustless Work), diferenciador, por qué pedir prestado, mercados, modelo de ingresos con lado prestamista, competencia, verificación en Stellar y cierre.
>
> **Versión completa: `Rendaval-pitch-v4`.** Sobre la v3 agrega cómo se conserva el rendimiento (bonos de acumulación), el modelo de ingresos con cifras de trabajo, el lado prestamista y una diapositiva «Verifíquelo en Stellar» con enlaces a contratos y transacciones de testnet.

> **Aplicadas en `Rendaval-pitch-v3`** (PPTX y PDF en esta carpeta), con un cambio de mercado: **México (Ciudad de México) es el primer mercado y Brasil el segundo**; Bolivia queda para después. La v3 agrega: por qué pedir prestado y no vender, mercados, estructura legal por país y competencia con fuentes (Liqvid, Blend, Templar, Talwex, HiYield). Las cifras de la diapositiva 2 citan a RedStone (2026). Sin diapositiva de equipo ni datos de contacto.

Los archivos PPTX y PDF se conservaron sin cambios como referencia. Este documento enumera los reemplazos exactos antes de reutilizarlos.

| Diapositiva | Qué ya no coincide | Reemplazo exacto |
| --- | --- | --- |
| 1 | «tus activos» es informal y no identifica testnet. | «Bonos tokenizados como garantía para préstamos en USDC sobre Stellar. Prototipo funcional en Stellar testnet; activos sin valor real.» |
| 2 | Las cifras de RWA y préstamo tienen fuentes no verificadas por este repositorio. | «[Añadir cifras de mercado con fuente primaria, fecha y permiso de uso antes de presentar.]» |
| 3 | Dice «Precio por oráculo SEP-40 (Reflector, RedStone) o NAV del emisor». | «El emisor publica el precio en el libro Rendaval. El libro expone una interfaz de lectura compatible con SEP-40; esta versión no consulta un oráculo externo para decidir el préstamo.» |
| 4 | «Pool con permisos» simplifica el diseño y no distingue garantía de desembolso. | «Bóveda por préstamo: la garantía queda en una bóveda propia bajo reglas del emisor.» «Emisor integrado: aprueba empresa, bóveda, custodia auxiliar y comprador cuando corresponde.» «Venta cerrada: pago y entrega de bonos ocurren juntos a un comprador autorizado.» |
| 5 | Declara que préstamo, pago, oráculo y liquidación están hechos sin límites. | «Prototipo testnet ✓: depósito, desembolso, pago y venta cerrada con activos de prueba. Precio publicado por el emisor; compatibilidad de lectura SEP-40 comprobada.» Añadir: «Pendiente antes de fondos: auditoría independiente posterior a C4, legal, custodia y operación.» |
| 6 | Presenta margen comercial como definido. | «Modelo comercial por validar en el piloto. Tasas, aportes de prestamistas, reservas y comisiones no están definidos para producción.» |
| 7 | Atribuye el precio a oráculo SEP-40 y omite límites. | «Precio y margen: el emisor publica el precio; el libro es compatible con SEP-40. Aviso al 70 % y default al 85 % son parámetros de demostración.» Añadir: «No hay seguro activo; la venta depende de un comprador autorizado y el precio no garantiza liquidez.» |
| 8 | No indica que contacto/disponibilidad comercial son marcadores. | Añadir: «Contacto y disponibilidad comercial: [por completar]. Prototipo exclusivo de testnet.» |
| 9 | Las afirmaciones sobre Liqvid, Talwex, HiYield y K2 Lend y sus fuentes no han sido verificadas aquí. | «Panorama competitivo [pendiente de investigación]. Validar para cada proyecto: producto, red, activos, fecha, fuente primaria y alcance. No presentar comparaciones actuales sin verificación.» |
| 10 | Nombra México junto con Bolivia, afirma disponibilidad/mainnet de proveedores/oráculos y puede sugerir que TW sostiene la garantía. | «Primer mercado: Bolivia; producto diseñado para empresas de cualquier país.» «Trustless Work protege el USDC del desembolso; la bóveda Rendaval mantiene los bonos.» «Antes de fondos: activo y emisor reales, comprador autorizado independiente, auditoría posterior a C4, revisión legal, custodia de claves, operación de TTL y prestamistas.» |

En todo el deck, no afirmar clawback del bono, custodia de garantía por Trustless Work, oráculo externo integrado, México como mercado inicial o disponibilidad/comercialización mainnet sin verificación independiente. Las comparaciones y cifras deben llevar fuente primaria verificable.
