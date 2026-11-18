# Vault

Liquidez en USDC sobre activos tokenizados en Stellar testnet.

## Desarrollo local

Instale las dependencias con `npm install`. Copie `.env.example` a `.env.local` y complete:

- `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY`: clave pública de testnet de Pollar. El acceso rechaza claves que no comiencen por `pub_testnet_`.
- `NEXT_PUBLIC_VBOND_ISSUER`: dirección pública del emisor de VBOND en testnet.
- `POLLAR_SECRET_KEY`: clave secreta `sec_testnet_` para validar el token de acceso en cada ruta del servidor. Nunca se expone al navegador.
- `DIDIT_API_KEY`: clave sandbox `sk_test_` de Didit; las claves de producción se rechazan.
- `DIDIT_KYB_WORKFLOW_ID`: identificador del workflow de verificación de empresas. Configure la cobertura de Bolivia en la consola; enviamos `expected_details.registry_country: "BO"`.
- `VAULT_SECRET_KEY`: clave secreta Stellar de la cuenta de plataforma Vault, financiada en testnet para comisiones y reservas de entradas de datos.

No se necesitan `LENDER_SECRET_KEY` ni `BOND_ISSUER_SECRET_KEY` para esta fase. Configure las mismas variables en Vercel; no se usa base de datos ni almacenamiento en disco.

Ejecute `npm run dev -- --port 3017` y abra `http://localhost:3017/app`. El origen `http://localhost:3017` debe estar en los orígenes permitidos del dashboard de Pollar (y en las URI de redirección si se solicita). Si el puerto está ocupado, elija otro puerto libre y registre también ese origen.

En Pollar, habilite correo y Google, billeteras clásicas con creación inmediata, el patrocinio de trustlines y los activos USDC y VBOND. El panel consulta Horizon testnet y solicita solamente las autorizaciones faltantes. Las solicitudes pendientes se consultan de nuevo sin reenviarlas durante la sesión de la página.

La landing permanece en `/`. La ruta `/app` contiene el acceso, los saldos y la verificación de empresa. La garantía y el préstamo siguen deshabilitados.

El servidor verifica el token de Pollar y usa exclusivamente la dirección devuelta por ese servicio. Una sesión de Didit debe corresponder a esa dirección y al workflow configurado. Al aprobarse, Vault firma en Stellar testnet una entrada `manageData` con nombre `kyb:<dirección de empresa>` y valor igual al identificador de sesión. Las consultas posteriores leen esa constancia pública; no incluye documentos ni datos de la empresa. Cada nueva entrada requiere reserva de XLM. La constancia no almacena fecha.

El navegador conserva únicamente el identificador y enlace de la sesión pendiente por cuenta. Al volver de la verificación, consulta automáticamente hasta cinco veces con esperas de 2, 4, 8 y 16 segundos. Después ofrece una comprobación manual. Si se borra el almacenamiento antes de aprobar, será necesario iniciar otra sesión. La aprobación de prueba solo funciona con configuración sandbox y requiere autenticación y pertenencia de la sesión.

Prueba real (crea una sesión sandbox y una entrada permanente en testnet para una dirección aleatoria):

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-kyb.ts
```

El script importa los mismos helpers del servidor y solo omite el acceso interactivo de Pollar. No guarda claves ni estado en disco. Las pruebas de producción deben usar un puerto libre y detener el proceso al terminar.

Referencias de contrato: [crear sesión](https://docs.didit.me/sessions-api/create-session), [sandbox y simulate](https://docs.didit.me/integration/sandbox-testing). La creación no devuelve `session_kind`; se valida `business` al consultar la decisión. El escenario simulado no sustituye una prueba humana del flujo alojado ni confirma la cobertura efectiva de Bolivia del workflow.

Validación: `npm run lint` y `npm run build`. Para probar producción en otro puerto: `npm run start -- --port 3017`.
