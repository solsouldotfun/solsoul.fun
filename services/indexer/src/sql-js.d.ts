declare module "sql.js" {
  export interface Database {
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
    export(): Uint8Array;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
