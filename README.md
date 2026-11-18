# Vault

Liquidez en USDC sobre activos tokenizados en Stellar testnet.

## Desarrollo local

Instale las dependencias con `npm install`. Copie `.env.example` a `.env.local` y complete:

- `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY`: clave pública de testnet de Pollar. El acceso rechaza claves que no comiencen por `pub_testnet_`.
- `NEXT_PUBLIC_VBOND_ISSUER`: dirección pública del emisor de VBOND en testnet.
- `POLLAR_SECRET_KEY`: reservada para futuras integraciones del servidor; no se utiliza en esta fase ni debe exponerse al navegador.

Ejecute `npm run dev` y abra `http://localhost:3000/app`. El origen `http://localhost:3000` debe estar en los orígenes permitidos del dashboard de Pollar (y en las URI de redirección si se solicita). Si el puerto está ocupado, use `npm run dev -- --port 3017` y registre también ese origen.

En Pollar, habilite correo y Google, billeteras clásicas con creación inmediata, el patrocinio de trustlines y los activos USDC y VBOND. El panel consulta Horizon testnet y solicita solamente las autorizaciones faltantes. Las solicitudes pendientes se consultan de nuevo sin reenviarlas durante la sesión de la página.

La landing permanece en `/`. La ruta `/app` contiene el acceso, la billetera y los marcadores deshabilitados de las próximas fases. No incluye verificación de empresa, préstamos ni escrow.

Validación: `npm run lint` y `npm run build`. Para probar producción en otro puerto: `npm run start -- --port 3017`.
