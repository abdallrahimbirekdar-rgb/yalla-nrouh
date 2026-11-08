// Syrian mobile numbers have nine national digits, beginning with 9.
export function syrianMobile(input:string):string|null{
 const value=input.trim().replace(/[٠-٩۰-۹]/g,digit=>String(digit.charCodeAt(0)-(digit<'۰'?0x660:0x6f0)))
  .replace(/[\s()-]/g,'');
 const national=value.startsWith('+963')?value.slice(4)
  :value.startsWith('00963')?value.slice(5)
  :value.startsWith('963')?value.slice(3)
  :value.startsWith('0')?value.slice(1):value;
 return /^9\d{8}$/.test(national)?'+963'+national:null;
}
