export const CURRENCIES=Object.freeze(['BDT','USD']);
export const MAX_MINOR=1_000_000_000;
export function currency(value){if(!CURRENCIES.includes(value))throw new Error('Choose BDT or USD.');return value}
export function minorAmount(value){if(!Number.isSafeInteger(value)||value<1||value>MAX_MINOR)throw new Error('Invalid payable amount.');return value}
export function decimalToMinor(value){if(typeof value!=='string'||!/^\d+(\.\d{1,2})?$/.test(value.trim()))throw new Error('Enter a positive price with at most two decimal places.');const [major,decimal='']=value.trim().split('.');const result=BigInt(major)*100n+BigInt(decimal.padEnd(2,'0'));if(result<1n||result>BigInt(MAX_MINOR))throw new Error('Price is outside the supported range.');return Number(result)}
export function minorToDecimal(value){minorAmount(value);return `${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`}
export function formatMoney(value,code){currency(code);minorAmount(value);return `${code} ${new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Math.floor(value/100))}.${String(value%100).padStart(2,'0')}`}
