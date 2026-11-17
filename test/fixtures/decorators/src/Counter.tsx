import { IGreeting } from './types';

export function Counter(props: { greeting: IGreeting }) {
  return <div>{props.greeting.text}</div>;
}
