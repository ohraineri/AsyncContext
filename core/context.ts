import { AsyncLocalStorage } from 'node:async_hooks';

export class Context {
  public static asyncLocalStorageInstance: AsyncLocalStorage<unknown>;

  private constructor() {
    Context.asyncLocalStorageInstance = new AsyncLocalStorage();
  }

  static getInstance() : AsyncLocalStorage<unknown> {
    if (!Context.asyncLocalStorageInstance) {
      new Context();
    }
    return Context.asyncLocalStorageInstance;
  }

  static addValue(key: string, value: any) {
    const contextObject = Context.getInstance().getStore() as Record<string, any>;
    if (!contextObject)
      throw new Error('No active context found. Use Context.getInstance().run().');

    contextObject[key] = value;
    return contextObject;
  }

  static addObjectValue(object: Record<string, any>) {
    const contextObject = Context.getInstance().getStore();
    if (!contextObject)
      throw new Error('No active context found. Use Context.getInstance().run().');

    const merged = Object.assign(contextObject, object);
    return merged;
  }
} 