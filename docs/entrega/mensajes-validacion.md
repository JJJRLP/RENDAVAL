# Mensajes de validación y guion

## Para un emisor de bonos tokenizados

Hola. Estamos validando Rendaval, un prototipo público en Stellar testnet para préstamos en USDC con bonos tokenizados en garantía. México sería el primer mercado. No tenemos piloto ni acuerdo comercial y quisiéramos entender sus restricciones:

1. ¿Cada empresa, bóveda y comprador debe ser autorizado para recibir el token?
2. ¿Autorizaría una bóveda por préstamo que el emisor no pueda revocar mientras exista deuda?
3. ¿Quién podría publicar el NAV o precio y con qué frecuencia?
4. Ante incumplimiento, ¿qué requisitos tendría un comprador autorizado?

¿Podemos conversar 20 minutos? No solicitamos compromiso; buscamos detectar si el diseño es viable.

## Para una fintech mexicana o tesorería de empresa

Hola. Estamos validando Rendaval, un prototipo público en Stellar testnet para obtener USDC sin vender bonos tokenizados. No tenemos clientes todavía. Nos ayudaría contrastar cuatro puntos:

1. ¿Su empresa mantiene CETES, bonos o fondos, tokenizados o no?
2. ¿Ha necesitado dólares por 30–90 días y para qué uso?
3. ¿Qué costo o restricción tendría vender y recomprar esa posición?
4. ¿Qué tasa, plazo y porcentaje de préstamo sobre la garantía serían aceptables?

Buscamos una conversación de 20 minutos, sin oferta comercial ni compromiso. Podemos compartir el prototipo y registrar respuestas sin datos personales.

## Guion de video — dos minutos

- **0:00–0:10 — Alcance.** Mostrar la portada y decir: prototipo público en Stellar testnet, activos sin valor, México primero y Brasil segundo.
- **0:10–0:20 — Pollar.** Entrar con Pollar en el lado de la empresa. Aclarar que la interfaz del prestamista no existe y su participación está simulada con una clave de prueba en el servidor.
- **0:20–0:32 — KYB sandbox.** Iniciar o mostrar la verificación Didit. Abrir en stellar.expert la constancia de testnet asociada.
- **0:32–0:43 — Declaración.** Declarar RBOND y el hash local del certificado. Abrir la transacción de declaración en stellar.expert; recalcar que el archivo no sale del navegador.
- **0:43–0:53 — Aprobación simulada.** Pulsar «Simular aprobación y emisión». Abrir en stellar.expert la autorización del tenedor, la serie, el precio y la emisión. Decir que no hay custodio ni emisor real.
- **0:53–1:05 — Depósito.** Firmar con Pollar el depósito en la bóveda propia del préstamo. Abrir el hash en stellar.expert y señalar el saldo RBOND de la bóveda.
- **1:05–1:18 — Desembolso.** Preparar el USDC del prestamista simulado, aprobar el hito y firmar la apertura. Abrir en stellar.expert el fondeo, la liberación a la bóveda y la transacción atómica de deuda/desembolso.
- **1:18–1:30 — Aviso de margen.** Simular cambios de precio, siempre rotulados, hasta el aviso. Abrir la publicación de precio y la transacción de margen en stellar.expert.
- **1:30–1:48 — Reembolso.** Simular el adelanto de prueba si hace falta, firmar el pago y abrir su hash en stellar.expert. Mostrar que los USDC pagan la deuda y todos los bonos regresan juntos a la empresa.
- **1:48–2:00 — Cierre.** Abrir la venta atómica del segundo recorrido en stellar.expert: comprador autorizado paga y recibe bonos, prestamista primero y excedente a la empresa. Cerrar con repositorio, demo y límites: sin clientes, sin acuerdo con Etherfuse y sin fondos reales.
