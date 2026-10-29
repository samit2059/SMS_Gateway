#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/006cb4024dd2ca4c54661630ec98847f488fb62a6bb1b75ff07515870ca03564/contract';
import startContract from '../../snapshots/006cb4024dd2ca4c54661630ec98847f488fb62a6bb1b75ff07515870ca03564/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/4b1f29327e1f174fe07349512f7f2d4fbc4fb182793399276d7d2193e0c32539/contract';
import endContract from '../../snapshots/4b1f29327e1f174fe07349512f7f2d4fbc4fb182793399276d7d2193e0c32539/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'MessageAttempt',
        constraint: 'MessageAttempt_status_check_006242cc',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'MessageAttempt',
        constraint: 'MessageAttempt_status_check_fae7fbf7',
        expression: sql`"status" IN ('RESERVED', 'SENDING', 'SUCCESS', 'FAILED', 'RELEASED', 'SKIPPED')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
