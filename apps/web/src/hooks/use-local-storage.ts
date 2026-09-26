import { useEffect, useRef, useState } from "react";

type UseLocalStorageOptions<T> = {
  parse?: (rawValue: string) => T;
  serialize?: (value: T) => string | null;
};

export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
  options?: UseLocalStorageOptions<T>,
) {
  const parse = options?.parse;
  const serialize = options?.serialize ?? ((value: T) => JSON.stringify(value));

  const [value, setValue] = useState<T>(() => {
    const resolvedInitialValue =
      typeof initialValue === "function"
        ? (initialValue as () => T)()
        : initialValue;

    if (typeof window === "undefined") {
      return resolvedInitialValue;
    }

    const storedValue = window.localStorage.getItem(key);

    if (storedValue === null) {
      return resolvedInitialValue;
    }

    try {
      return parse ? parse(storedValue) : (JSON.parse(storedValue) as T);
    } catch {
      return resolvedInitialValue;
    }
  });

  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Skip the mount write: the initial value is either what's stored or a
    // fallback (e.g. a model/provider the remote catalog hasn't loaded yet),
    // and writing the fallback would erase the user's stored choice.
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    const serializedValue = serialize ? serialize(value) : JSON.stringify(value);

    if (serializedValue === null) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, serializedValue);
  }, [key, value]);

  return [value, setValue] as const;
}
