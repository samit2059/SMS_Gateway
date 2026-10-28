#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/006cb4024dd2ca4c54661630ec98847f488fb62a6bb1b75ff07515870ca03564/contract';
import endContract from '../../snapshots/006cb4024dd2ca4c54661630ec98847f488fb62a6bb1b75ff07515870ca03564/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/28b74471e1479cc967aaaea991bcc91c8725cc948c4111f987fbf7bed390baa0/contract';
import startContract from '../../snapshots/28b74471e1479cc967aaaea991bcc91c8725cc948c4111f987fbf7bed390baa0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, placeholder, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropIndex({
        schema: 'public',
        table: 'MessageAttempt',
        index: 'MessageAttempt_attemptedAt_idx_b99fe373',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'SmsMessage',
        constraint: 'SmsMessage_status_check_ae97c672',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_createdAt_idx_9575dbd7',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_recipient_idx_75bf5d7e',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_status_idx_e98638ab',
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dataTransform(endContract, 'backfill-User-name', {
        backfillsColumn: { schema: 'public', table: 'User', column: 'name' },
        check: () => placeholder('User.name:check'),
        run: () => placeholder('User.name:run'),
      }),
      this.setNotNull({ schema: 'public', table: 'User', column: 'name' }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'SmsMessage',
        constraint: 'SmsMessage_status_check_a256edd4',
        expression: sql`"status" IN ('QUEUED', 'SENDING', 'SENT', 'FAILED')`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_userId_createdAt_idx_f726f04a',
        columns: ['userId', 'createdAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
