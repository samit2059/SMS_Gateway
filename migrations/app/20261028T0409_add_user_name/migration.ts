#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/006cb4024dd2ca4c54661630ec98847f488fb62a6bb1b75ff07515870ca03564/contract';
import endContract from '../../snapshots/006cb4024dd2ca4c54661630ec98847f488fb62a6bb1b75ff07515870ca03564/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/28b74471e1479cc967aaaea991bcc91c8725cc948c4111f987fbf7bed390baa0/contract';
import startContract from '../../snapshots/28b74471e1479cc967aaaea991bcc91c8725cc948c4111f987fbf7bed390baa0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, sql } from '@prisma/orm-postgres/migration';
export default class M extends Migration<any, any> {
  override readonly startContractJson = startContract as any;
  override readonly endContractJson = endContract as any;
  override get operations() {
    return [
      this.dropIndex({
        schema: 'public' as any,
        table: 'MessageAttempt',
        index: 'MessageAttempt_attemptedAt_idx_b99fe373',
      }),
      this.dropCheckConstraint({
        schema: 'public' as any,
        table: 'SmsMessage',
        constraint: 'SmsMessage_status_check_ae97c672',
      }),
      this.dropIndex({
        schema: 'public' as any,
        table: 'SmsMessage',
        index: 'SmsMessage_createdAt_idx_9575dbd7',
      }),
      this.dropIndex({
        schema: 'public' as any,
        table: 'SmsMessage',
        index: 'SmsMessage_recipient_idx_75bf5d7e',
      }),
      this.dropIndex({
        schema: 'public' as any,
        table: 'SmsMessage',
        index: 'SmsMessage_status_idx_e98638ab',
      }),
      this.addColumn({
        schema: 'public' as any,
        table: 'User',
        column: col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
     this.dataTransform(endContract as any, 'backfill-User-name', {
        backfillsColumn: { schema: 'public', table: 'User', column: 'name' },
        check: sql`SELECT "id" FROM "public"."User" WHERE "name" IS NULL LIMIT 1` as any,
        run: sql`UPDATE "public"."User" SET "name" = "email" WHERE "name" IS NULL` as any,
      }),
      this.setNotNull({ schema: 'public' as any, table: 'User', column: 'name' }),
      this.addCheckConstraint({
        schema: 'public' as any,
        table: 'SmsMessage',
        constraint: 'SmsMessage_status_check_a256edd4',
        expression: sql`"status" IN ('QUEUED', 'SENDING', 'SENT', 'FAILED')`,
      }),
      this.createIndex({
        schema: 'public' as any,
        table: 'SmsMessage',
        index: 'SmsMessage_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public' as any,
        table: 'SmsMessage',
        index: 'SmsMessage_userId_createdAt_idx_f726f04a',
        columns: ['userId', 'createdAt'],
      }),
    ];
  }
}
MigrationCLI.run(import.meta.url, M);
