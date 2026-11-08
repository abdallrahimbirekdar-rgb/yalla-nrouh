// This site uses only the React DOM portal entry point for its cancellation dialog.
// Keep the surface narrow without adding an unrelated native dependency.
declare module 'react-dom' {
 import type {ReactNode,ReactPortal} from 'react';
 export function createPortal(children:ReactNode,container:Element|DocumentFragment,key?:string|null):ReactPortal;
}
