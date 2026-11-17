export const f = async (a?: {b?: number}) => a?.b ?? 1;
export class K { static s = 1; #p = 2; q = 3; get p() { return this.#p; } }
