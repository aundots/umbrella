interface RequireContext {
  keys(): string[];
  resolve(id: string): string;
  id: string;
  (id: string): unknown;
}

interface NodeRequire {
  context(path: string, deep?: boolean, filter?: RegExp): RequireContext;
}
