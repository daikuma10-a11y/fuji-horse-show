/** Values declared on the application, not an automatic eligibility certification. */
export const HORSE_DECLARATIONS=['S','中A','中B','中C','中D','未登録'] as const
export function horseDeclaration(raw:string){
 const value=raw.normalize('NFKC').replace(/[\s　]/g,'')
 // This text is the form's unselected placeholder, not a declaration of every grade.
 return value==='S・中A・中B・中C・中D・未'?'':value
}
export function validHorseDeclaration(value:string){return !value||HORSE_DECLARATIONS.includes(value as typeof HORSE_DECLARATIONS[number])}
