import { evidenceFile, campaign } from './t-config.mjs';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const read=p=>existsSync(p)?JSON.parse(readFileSync(p,'utf8')):null;
const failures=read(evidenceFile('failures'));
const journey=read(evidenceFile('journeys'));
const auth=read(evidenceFile('authorization'));
const oldAuth=read('scripts/evidence/c4-authorization.json');
const run=read(evidenceFile('run'));
const latest=[...new Map((failures?.cases??[]).map(r=>[r.name,r])).values()];
const passed=latest.filter(r=>r.status==='PASS').length;
const failed=latest.filter(r=>r.status==='FAIL').length;
const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
const txs=failures?.transactions??[];
const pending=[
  ['Precio vencido para default y liquidación','La edad real máxima es 86400 s. No se alteró el reloj ni la configuración; falta esperar 24 horas con un préstamo adecuado.'],
  ['Mora antes y después de los 30 segundos de gracia','El vencimiento real es 30 días desde open. Falta esperar ese plazo; la gracia corta no acorta el préstamo.'],
  ['Liquidación con pérdida por faltante','No se provocó pérdida real: con 100 bonos y deuda de 50,3333334 USDC, el piso protegido produce una venta superior a 56 USDC, incluso después del descuento. Con colateral íntegro supera la deuda. No se dañó la garantía ni se modificaron contratos para fabricar este caso.'],
  ['Pollar en navegador','Se sustituyó solo la identidad HTTP por cuentas Friendbot y firmas locales. Falta comprobar login y firma interactiva del SDK.'],
  ['Archivo y restauración TTL','No se dejó archivar un contrato real ni se restauró; no se presenta simulación como archivo efectivo.'],
];
const titles = {
'cancelled compatibility terms contain no debt':'Los campos de compatibilidad de la cancelación tampoco inventan deuda',
'recovery leaves exactly one vault per declaration':'La recuperación conserva exactamente una bóveda por declaración',
'declaration requires approval':'Una declaración sin aprobación no se usa',
'approval and issuance retry preserves balance and hashes':'Repetir aprobación no vuelve a emitir bonos',
'accept retry deploys exactly one vault':'Reanudar preparación conserva una sola bóveda',
'never-approved company cannot receive bonds':'Empresa nunca aprobada no recibe bonos',
'transfer to unapproved account':'No se transfieren bonos a una cuenta sin aprobación',
'unapproved issuance submitted to testnet':'Emisión sin aprobación: transacción enviada y rechazada',
'unapproved transfer submitted to testnet':'Transferencia sin aprobación: transacción enviada y rechazada',
'fund without collateral':'No se fondea sin los bonos',
'open without release':'No se abre sin liberación de TW',
'open missing collateral and dollars':'No se abre sin bonos ni dólares',
'signed deposit not submitted leaves pending and no collateral':'Depósito firmado pero no enviado: sigue pendiente',
'open with bonds but no dollars':'No se abre con bonos pero sin dólares',
'TW deploy error':'Error de TW antes de desplegar',
'deployed not funded':'Escrow desplegado: timeout antes de fondear',
'funded not released':'Escrow fondeado: error antes de liberar',
'TW response lost after real submission resumes by hash':'TW pierde la respuesta después del envío: recupera por hash',
'RPC response lost after deposit submission recovers by hash':'RPC pierde la respuesta del depósito: recupera por hash',
'released not opened retry does not redeploy or repay':'Liberado sin abrir: reintento sin despliegue ni pago duplicado',
'issuer cannot freeze live vault':'Emisor no puede congelar una bóveda viva',
'same vault cannot be opened twice':'No se abre dos veces la misma bóveda',
'healthy loan refuses default with Spanish message':'Préstamo sano rechaza incumplimiento en español',
'repay insufficient dollars':'Pago sin dólares suficientes',
'price step larger than 25 percent':'Precio rechaza un paso mayor a 25 %',
'RPC error and timeout return Spanish, retry reads real state':'Error y timeout RPC: respuesta española y reintento',
'price change before real interval is refused':'Precio rechaza un cambio antes del intervalo real',
'below 70 percent is healthy':'Por debajo de 70 %: sano',
'above 70 percent enters margin':'Por encima de 70 %: margen',
'below 85 percent refuses default':'Por debajo de 85 %: no permite incumplimiento',
'execution before cure waits':'Ejecución antes de terminar cura: debe esperar',
'default cured by repayment returns bonds':'Pago dentro de cura: cierra y devuelve bonos',
'second repayment does not pay twice':'Segundo pago no cobra otra vez',
'foreign company rejected on all ownership routes':'Empresa ajena rechazada en las rutas de bono y préstamo',
'non-publisher signed transaction fails on chain':'Firma de quien no es publicador: falla en cadena',
'collateral absent leaves escrow funded and loan pending':'Sin colateral: dólares siguen en TW y no hay deuda',
'TW dispute refunds net to lender and cancels without debt':'Disputa TW devuelve neto al lender; preparación cancelada',
'cancelled setup is readable without inventing a debt':'Estado cancelado legible, sin inventar deuda',
'stranger dust in both tokens cannot block opening':'Átomos de USDC y bonos de un tercero no bloquean apertura',
'buyer without issuer approval cannot execute':'Comprador sin permiso no ejecuta',
'execution rejects price changed since quote':'Precio cambiado invalida la venta preparada',
'liquidation has surplus and atomic payment and delivery':'Venta con excedente: cobro y bonos en el mismo hash',
'repayment after liquidation is refused':'Pago posterior a liquidación rechazado',
'blocked excess bond is assigned to company delivery':'Bono extra bloqueado queda en custodia de la empresa',
'collect returns excess bond and replay does not duplicate':'Recogida devuelve bono extra sin duplicación',
'refund and cancellation replay do not move money twice':'Repetir reembolso y cancelación no mueve fondos otra vez',
};
function title(name){return titles[name]??name.replace(' wrong signer and tampered transaction',': firma ajena y transacción manipulada').replace(' replay returns same hash without balance changes',': repetición conserva hash y saldos');}
function proof(r){
  if(r.error)return esc(r.error);
  const text=JSON.stringify(r.evidence);
  const hash=text?.match(/"hash":"([a-f0-9]{64})"/)?.[1];
  const message=r.evidence?.message??r.evidence?.body?.error;
  const status=typeof r.evidence?.status==='number'?'HTTP '+r.evidence.status+'. ':r.evidence?.loan?'Estado '+r.evidence.loan.status[0]+(r.evidence.health_bps!==undefined?'; salud '+r.evidence.health_bps+' puntos básicos':'')+'. ':'';
  return status+(hash?`[${hash.slice(0,12)}…](https://stellar.expert/explorer/testnet/tx/${hash}) `:'')+(message?esc(message):'Aserciones y estado posterior en el JSON de fallos.')+(r.evidence?.mode==='real RPC simulation; not submitted'?' Rechazo en simulación RPC; no enviado.':'');
}
const rows=latest.map(r=>`| ${esc(title(r.name))} | ${r.status==='PASS'?'APROBADO':'FALLÓ'} | ${proof(r)} |`).join('\n');
const authTitles={
'state only lists Pollar wallet, ignores requested owner':'Estado limitado a la cuenta autenticada; ignora otra cuenta enviada',
'incorrect registry index still checked against book borrower':'Índice incorrecto no evita comprobar al deudor en el libro',
'state rejects a foreign loan even if indexed for the caller':'Estado rechaza préstamo ajeno aunque figure en el índice',
'exact company signature':'Firma exacta de la empresa',
'fee bump preserves exact company transaction':'Comisión exterior conserva la transacción exacta de la empresa',
'wrong contract':'Contrato cambiado', 'wrong function':'Función cambiada', 'wrong amount':'Importe cambiado',
'wrong recipient':'Destinatario cambiado', 'extra operation':'Operación adicional', 'mainnet signature':'Firma para mainnet rechazada',
'injected nested Soroban authorization':'Autorización Soroban anidada inyectada', 'wrong signature':'Firma ajena',
'claim cannot redirect company credit':'Cobro no permite desviar crédito de la empresa',
'document/wallet injection rejected':'Documento o cuenta inyectados rechazados',
};
const authRows=(auth?.results??[]).map(r=>`| ${esc(authTitles[r.test]??r.test.replace('missing token','sin sesión').replace('foreign owner','empresa ajena').replace('unverified','sin verificación KYB').replace('successful transaction replay after closure','repetición de firma después del cierre'))} | ${esc(r.status==='accepted'?'aceptada':r.status)} |`).join('\n');
const gross=failures?.budget?Object.values(failures.budget).reduce((n,v)=>n+BigInt(v),0n):0n;
const units=n=>`${BigInt(n)/10000000n}.${(BigInt(n)%10000000n).toString().padStart(7,'0')}`;
let output=`# Pruebas T — Stellar testnet

**La cobertura solicitada no está completa.** ${failures?.completed?'La batería terminó.':'La batería todavía no terminó; hay casos sin ejecutar además de los pendientes indicados.'} ${failed} casos actualmente fallidos en la batería de fallos; ${pending.length} grupos pendientes detallados abajo. No se afirma que la publicación esté aprobada por esta fase mientras queden pendientes. Los rechazos detectados en simulación real de RPC se distinguen de transacciones enviadas.

## Resultado de esta ejecución

- Total aprobado: ${passed+(journey?.completed?2:0)+(auth?.completed?auth.results.length:0)+(oldAuth?.completed?oldAuth.results.length:0)} comprobaciones; no incluye los grupos pendientes.
- Batería de fallos: ${passed} aprobados, ${failed} fallidos; intentos fallidos conservados: ${(failures?.cases??[]).filter(r=>r.status==='FAIL').length}.
- Recorridos nuevos: ${journey?.completed?'2 terminados':'pendientes de terminar'}, con ${journey?.transactions?.length??0} hashes registrados (incluye escrituras del registro).
- Autorización del recorrido nuevo: ${auth?.completed?(auth.results.length+' comprobaciones aprobadas'):'pendiente'}.
- Autorización del recorrido anterior: ${oldAuth?.completed?(oldAuth.results.length+' comprobaciones aprobadas'):'pendiente'}.
- Lender antes de la fase: ${run?.before??'no registrado'} USDC; después: ${run?.after??'pendiente'} USDC.
- Gasto bruto reservado/confirmado de los recorridos nuevos: ${journey?.grossLenderSpend??'pendiente'} USDC; batería: ${units(gross)} USDC. El saldo neto no mide el gasto bruto. Los reembolsos y pagos vuelven al lender cuando corresponde. Al terminar se devuelven también los dólares de prueba sobrantes, con hashes separados; no son pagos de deuda.

## Validación local

${['lint','typescript','build'].every(k=>run?.validation?.[k]?.exitCode===0)?'Pasaron npm run lint, npx tsc --noEmit y npx next build. Lint conserva una advertencia previa de importación no usada en scripts/research/c3/contract-receiver.mjs.':'Resultados de compilación todavía no registrados para esta campaña.'}

## Qué cambió

Se sustituyeron los diagnósticos crudos de Soroban por mensajes en español que explican qué revisar. Se corrigió la lectura de una bóveda cancelada antes de abrir: no existe deuda y debe aparecer Cancelled, sin confundir fallos de RPC o archivo con ausencia de deuda. También se permite volver a preparar una declaración después de cancelar su bóveda. Se amplió la prueba de autorización a collect/build y collect/submit.

No se cambiaron ni desplegaron contratos ni secretos. En pantalla solo se corrigió el mensaje de preparación cancelada, que mostraba una deuda inexistente. Las cuentas nuevas se derivan en memoria; la evidencia no contiene claves privadas ni sobres firmados. Los escrows nuevos son parte del flujo normal por el API de Trustless Work. Nunca se invocó directamente un contrato TW.

## Cómo repetir

No ejecutar dos escritores a la vez con las cuentas del servidor. Conservar los journals: borrarlos no reinicia la cadena y puede invalidar las comprobaciones. Un reintento continúa las etapas guardadas, no crea otra campaña. Las comprobaciones ya aprobadas se conservan; para una campaña completamente nueva use un identificador público distinto: \`node scripts/verify-phase-t.mjs --campaign=otra-fecha\`. Cada campaña conserva sus propios archivos y cuentas, con el mismo límite bruto. No use un identificador nuevo para recuperar un timeout.

\
\`\`\`sh
node scripts/verify-phase-t.mjs
npm run lint
npx tsc --noEmit
npx next build
\`\`\`

El punto de entrada corre los recorridos anterior y nuevo, las dos verificaciones de autorización y la batería, en serie. Ante fallo sale con código distinto de cero y conserva la evidencia. Para reanudar solo la batería:

\`\`\`sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-t.ts
node scripts/report-t.mjs
\`\`\`

La prueba de autorización sustituye la respuesta HTTP de Pollar; KYB y pertenencia se leen en testnet. El recorrido nuevo usa Didit sandbox. La batería usa constancias testnet del servidor y cuentas Friendbot. Los errores de terceros se inyectan en el cliente HTTP/RPC local, sin atacar servicios. Hay rechazos de ruta que deliberadamente no llegan a cadena y rechazos de simulación que no se envían. No equivalen a una transacción fallida confirmada.

La recuperación por disputa usa apiCall del servidor y el API real de TW; todavía no existe una ruta pública de cancelación/disputa. Por eso este ensayo no demuestra una recuperación autónoma desde la interfaz. Si nunca llegaron bonos a la bóveda, siguen en la empresa: no se inventa una transferencia de devolución.

## Casos de fallo y estado posterior

Cada fila conserva la respuesta o error, los saldos/estado comprobados y hashes cuando existen. La continuación del mismo fixture constituye el reintento legítimo; los replays aceptados deben conservar el hash y los saldos, no devolver un falso error. Aprobar de nuevo es idempotente: no vuelve a emitir.

| Caso provocado | Resultado | Evidencia |
| --- | --- | --- |
${rows}

## Recorridos completos nuevos

| Caso | Resultado | Hash |
| --- | --- | --- |
| Margen, recuperación, pago y devolución de 100 RBOND | ${journey?.steps?.['repaid-final']?'APROBADO':'PENDIENTE'} | ${journey?.steps?.repay?.hash??'pendiente'} |
| Incumplimiento, cura y venta atómica con excedente | ${journey?.steps?.atomicTransfers?'APROBADO':'PENDIENTE'} | ${journey?.steps?.execution?.hash??'pendiente'} |

## Autorización de rutas

| Caso | HTTP o resultado |
| --- | --- |
${authRows}

## Intentos fallidos conservados

${run?.incidents?.length?'La primera prueba de autorización obtuvo 202 al competir por la secuencia del operador; se reejecuta en serie.':''} ${(failures?.cases??[]).some(r=>r.status==='FAIL'&&r.error==='Deposite los bonos antes de fondear.')?'El primer rechazo de fondeo fue correcto, pero el validador de español del script no reconocía «Deposite»; se corrigió sin cambiar el HTTP esperado ni las aserciones de saldos.':''}

| Caso | Error del intento |
| --- | --- |
${(failures?.cases??[]).filter(r=>r.status==='FAIL').map(r=>`| ${esc(title(r.name))} | ${esc(r.error)} |`).join('\n')}

${run?.incidents?.some(i=>i.action==='t-balance.ts startup')?'El punto de entrada también detectó un error de arranque del lector de saldo: tsx no admitía await al nivel superior en este paquete. Se envolvió la lectura en una función asíncrona y se reejecutó correctamente, sin mover fondos durante el fallo.':''}

## Pendientes y pruebas manuales

| Caso | Motivo y siguiente paso |
| --- | --- |
${pending.map(([a,b])=>`| ${a} | ${b} |`).join('\n')}

No todos los rechazos de emisor, publicador o comprador tienen una ruta pública equivalente: las pruebas del contrato pasan por los clientes del servidor, y la evidencia indica cuándo se trata de simulación. No se prueba que cada rechazo de bajo nivel se presente en una pantalla real.

Para verificar el precio vencido, deje un préstamo abierto con precio de riesgo sin republicar durante más de 24 horas. Pruebe primero incumplimiento con ese precio y después renueve la misma cotización y repita. En otro préstamo ya declarado en incumplimiento, espere de nuevo a que caduque el precio y pruebe la venta antes y después de renovarlo. No confunda estas esperas reales con los 30 segundos entre cambios.

Para mora, conserve un préstamo sano hasta su fecha de vencimiento. Compruebe que el incumplimiento se rechace hasta terminar los 30 segundos de gracia y que después se admita. Para Pollar, pruebe las firmas y su cancelación desde el navegador, incluidos el depósito, la apertura, el pago, el cobro y la recogida de bonos. El archivo TTL necesita una entrada realmente archivada y una transacción de restauración; una lectura no demuestra mantenimiento.

## Archivos de evidencia

- [Recorridos nuevos](../scripts/evidence/t-journeys.json): pasos, hashes, balances y eventos de transferencias atómicas.
- [Fallos](../scripts/evidence/t-failures.json): casos, intentos fallidos, reservas brutas y ${txs.length} hashes.
- [Autorización nueva](../scripts/evidence/t-authorization.json).
- [Autorización anterior](../scripts/evidence/c4-authorization.json).
- [Ejecución y validación](../scripts/evidence/t-run.json).

Los hashes se pueden consultar en https://stellar.expert/explorer/testnet/tx/HASH. Una escritura del registro no es por sí sola evidencia de que se movieran fondos: buscar el recibo de la operación y las aserciones de saldos/eventos.
`;
if(campaign) output=output.replaceAll('../scripts/evidence/t-', '../scripts/evidence/t-'+campaign+'-');
writeFileSync(campaign ? 'docs/pruebas-'+campaign+'.md' : 'docs/pruebas.md',output);
console.log({passed,failed,pendingGroups:pending.length});
