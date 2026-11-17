export function Injectable(): ClassDecorator {
  return () => undefined;
}

export function Prop(): PropertyDecorator {
  return () => undefined;
}

export function Inject(token: string): ParameterDecorator {
  return () => token as unknown as undefined;
}
