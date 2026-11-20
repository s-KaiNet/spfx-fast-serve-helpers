declare interface ICorpLibStrings {
  Greeting: string;
}

declare module 'CorpLibStrings' {
  const strings: ICorpLibStrings;
  export = strings;
}
