import { type Options, type PostgresType, type Sql } from 'postgres';
import { PgDatabase } from "drizzle-orm/pg-core";
import { type DrizzleConfig } from "drizzle-orm";

declare module "drizzle-orm/postgres-js" {
  export class PostgresJsDatabase<TSchema extends Record<string, unknown> = Record<string, never>> extends PgDatabase<any, TSchema> {
  }

  export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>, TClient extends Sql = Sql>(
    ...params: [
        TClient | string
    ] | [
        TClient | string,
        DrizzleConfig<TSchema>
    ] | [
        (DrizzleConfig<TSchema> & ({
            connection: string | ({
                url?: string;
            } & Options<Record<string, PostgresType>>);
        } | {
            client: TClient;
        }))
    ]
  ): PostgresJsDatabase<TSchema> & {
      $client: TClient;
  };
}
