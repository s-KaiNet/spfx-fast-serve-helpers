import { IGreeting, Mood } from './types';

export function greet(greeting: IGreeting, mood: Mood): string {
  return `${greeting.text} (${mood})`;
}
