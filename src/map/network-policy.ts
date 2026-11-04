// Passive estimates from the device/browser; never run bandwidth tests.
export type NetworkHints={offline?:boolean;saveData?:boolean;expensive?:boolean;generation?:string|null;effectiveType?:string;downlink?:number;rtt?:number};
export type MapNetwork='offline'|'limited'|'normal';
export function mapNetwork(hints:NetworkHints):MapNetwork {
 if(hints.offline)return 'offline';
 if(hints.saveData||hints.expensive||['2g','3g'].includes(hints.generation??'')||['slow-2g','2g','3g'].includes(hints.effectiveType??'')||(hints.downlink!==undefined&&hints.downlink<1.5)||(hints.rtt!==undefined&&hints.rtt>700))return 'limited';
 return 'normal';
}
export function mapPolicy(network:MapNetwork,dataSaver:boolean){
 const lean=network!=='normal'||dataSaver;
 return {lean,startDelayMs:network==='limited'?900:0,tileConcurrency:network==='offline'?0:lean?4:12,initialZoom:lean?13:14,loadTimeoutMs:network==='limited'?45000:25000};
}
