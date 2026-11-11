export interface GradeRecipe {
  exposure:number; contrast:number; saturation:number; gamma:number; lift:number;
  temperature:number; tint:number; fade:number; shadow:[number,number,number];
  highlight:[number,number,number]; split:number; hue:number;
}
export interface VideoFilter {id:string;name:string;category:string;description:string;recipe:GradeRecipe}
