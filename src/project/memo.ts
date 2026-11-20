export function once<T>(compute: () => T): () => T {
  let state: { value: T } | undefined;
  return () => (state ??= { value: compute() }).value;
}

export function oncePerKey<K, T>(compute: (key: K) => T): (key: K) => T {
  const values = new Map<K, T>();
  return (key) => {
    if (!values.has(key)) values.set(key, compute(key));
    return values.get(key) as T;
  };
}
