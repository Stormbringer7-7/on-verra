// Bus de commandes typé (CQRS léger).
//
//   const ConsulterScrutin = defineQuery<{ uid: string }, FicheScrutin>('scrutin/consulter');
//   bus.register(ConsulterScrutin, (input, ctx) => ...);
//   const fiche = await bus.execute(ConsulterScrutin({ uid }));
//
// Une *query* lit, une *command* modifie l'état (ex. synchroniser la base).
// Les middlewares entourent chaque exécution (journal, cache, mesure…).

export type CommandKind = 'query' | 'command';

export interface Command<TType extends string = string, TInput = unknown, TOutput = unknown> {
  readonly type: TType;
  readonly kind: CommandKind;
  readonly input: TInput;
  /** Type de retour, porté pour l'inférence uniquement. */
  readonly __output?: TOutput;
}

export interface CommandDefinition<TType extends string, TInput, TOutput> {
  (input: TInput): Command<TType, TInput, TOutput>;
  readonly type: TType;
  readonly kind: CommandKind;
}

export type InputOf<D> = D extends CommandDefinition<string, infer I, unknown> ? I : never;
export type OutputOf<D> = D extends CommandDefinition<string, unknown, infer O> ? O : never;

function define(kind: CommandKind) {
  return <TInput, TOutput>() =>
    <TType extends string>(type: TType): CommandDefinition<TType, TInput, TOutput> =>
      Object.assign((input: TInput) => ({ type, kind, input }), { type, kind });
}

export const defineQuery = <TInput, TOutput>(type: string) => define('query')<TInput, TOutput>()(type);
export const defineCommand = <TInput, TOutput>(type: string) => define('command')<TInput, TOutput>()(type);

export interface ExecutionContext {
  signal?: AbortSignal;
  bus: CommandBus;
}

export type Handler<TInput, TOutput> = (input: TInput, ctx: ExecutionContext) => Promise<TOutput>;

export type Middleware = (command: Command, ctx: ExecutionContext, next: () => Promise<unknown>) => Promise<unknown>;

export class CommandBus {
  private readonly handlers = new Map<string, Handler<any, any>>();
  private readonly middlewares: Middleware[] = [];

  register<TType extends string, TInput, TOutput>(
    definition: CommandDefinition<TType, TInput, TOutput>,
    handler: Handler<TInput, TOutput>,
  ): this {
    if (this.handlers.has(definition.type)) throw new Error(`Handler déjà enregistré : ${definition.type}`);
    this.handlers.set(definition.type, handler);
    return this;
  }

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  execute<TType extends string, TInput, TOutput>(
    command: Command<TType, TInput, TOutput>,
    options: { signal?: AbortSignal } = {},
  ): Promise<TOutput> {
    const handler = this.handlers.get(command.type);
    if (!handler) return Promise.reject(new Error(`Aucun handler pour ${command.type}`));
    const ctx: ExecutionContext = { signal: options.signal, bus: this };
    const run = (i: number): Promise<unknown> =>
      i < this.middlewares.length
        ? this.middlewares[i](command, ctx, () => run(i + 1))
        : handler(command.input, ctx);
    return run(0) as Promise<TOutput>;
  }
}
