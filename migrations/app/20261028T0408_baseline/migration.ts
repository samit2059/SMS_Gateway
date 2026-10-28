#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/28b74471e1479cc967aaaea991bcc91c8725cc948c4111f987fbf7bed390baa0/contract';
import endContract from '../../snapshots/28b74471e1479cc967aaaea991bcc91c8725cc948c4111f987fbf7bed390baa0/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'MessageAttempt',
        columns: [
          col('attemptedAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('errorCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('messageId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'MessageAttempt_status_check_006242cc',
            sql`"status" IN ('SUCCESS', 'FAILED', 'SKIPPED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Provider',
        columns: [
          col('balance', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('failureRate', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('priority', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'SmsMessage',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('creditsCharged', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('direction', 'text', {
            notNull: true,
            default: lit('OUTGOING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('encoding', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('normalizedRecipient', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('providerMessageId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('recipient', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('refundIssued', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('segments', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('sender', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sentAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'SmsMessage_direction_check_fab8ce62',
            sql`"direction" IN ('INCOMING', 'OUTGOING')`,
          ),
          checkExpression(
            'SmsMessage_encoding_check_f262e757',
            sql`"encoding" IN ('GSM7', 'UNICODE')`,
          ),
          checkExpression(
            'SmsMessage_status_check_ae97c672',
            sql`"status" IN ('QUEUED', 'SENT', 'FAILED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'User',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Wallet',
        columns: [
          col('balance', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Provider',
        constraint: 'Provider_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Wallet',
        constraint: 'Wallet_userId_key',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MessageAttempt',
        index: 'MessageAttempt_attemptedAt_idx_b99fe373',
        columns: ['attemptedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MessageAttempt',
        index: 'MessageAttempt_messageId_idx_3cdded8d',
        columns: ['messageId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MessageAttempt',
        index: 'MessageAttempt_providerId_attemptedAt_idx_dc7a6bc9',
        columns: ['providerId', 'attemptedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MessageAttempt',
        index: 'MessageAttempt_providerId_idx_d1904c54',
        columns: ['providerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_normalizedRecipient_idx_6ef95151',
        columns: ['normalizedRecipient'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_providerId_idx_d1904c54',
        columns: ['providerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_recipient_idx_75bf5d7e',
        columns: ['recipient'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SmsMessage',
        index: 'SmsMessage_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MessageAttempt',
        foreignKey: {
          name: 'MessageAttempt_messageId_fkey',
          columns: ['messageId'],
          references: { schema: 'public', table: 'SmsMessage', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MessageAttempt',
        foreignKey: {
          name: 'MessageAttempt_providerId_fkey',
          columns: ['providerId'],
          references: { schema: 'public', table: 'Provider', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SmsMessage',
        foreignKey: {
          name: 'SmsMessage_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SmsMessage',
        foreignKey: {
          name: 'SmsMessage_providerId_fkey',
          columns: ['providerId'],
          references: { schema: 'public', table: 'Provider', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Wallet',
        foreignKey: {
          name: 'Wallet_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
