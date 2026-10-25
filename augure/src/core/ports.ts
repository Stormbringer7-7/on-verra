// Ports de l'app : ce dont elle a besoin, sans dire comment c'est fait.

export interface Logger {
  debug(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
}
