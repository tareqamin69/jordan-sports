import { Inject, Injectable } from '@nestjs/common';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { pgErrorCode, PgError } from '../../../platform/database/errors.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';

type Localized = { ar?: string; en?: string };

@Injectable()
export class HolidaysService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(countryCode: string) {
    const rows = await this.db
      .selectFrom('scheduling.holidays')
      .selectAll()
      .where('country_code', '=', countryCode)
      .orderBy('date')
      .execute();
    return {
      items: rows.map((r) => ({
        id: r.id,
        countryCode: r.country_code,
        date: String(r.date),
        name: r.name as Localized,
      })),
    };
  }

  async create(
    adminUserId: string,
    input: { countryCode: string; date: string; name: Localized },
    meta: RequestMeta,
  ) {
    try {
      await this.db.transaction().execute(async (tx) => {
        const id = uuidv7();
        await tx
          .insertInto('scheduling.holidays')
          .values({
            id,
            country_code: input.countryCode,
            date: input.date,
            name: JSON.stringify(input.name),
          })
          .execute();
        await this.audit.record(
          {
            actorType: 'admin',
            actorUserId: adminUserId,
            action: 'catalog.holiday_added',
            targetType: 'holiday',
            targetId: id,
            details: { date: input.date },
            meta,
          },
          tx,
        );
      });
    } catch (error) {
      if (pgErrorCode(error) === PgError.uniqueViolation)
        throw new AppError('VALIDATION_FAILED', 409, 'Holiday already exists');
      throw error;
    }
    return this.list(input.countryCode);
  }

  async delete(adminUserId: string, holidayId: string, meta: RequestMeta) {
    const row = await this.db
      .selectFrom('scheduling.holidays')
      .select('country_code')
      .where('id', '=', holidayId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('scheduling.holidays').where('id', '=', holidayId).execute();
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: adminUserId,
          action: 'catalog.holiday_removed',
          targetType: 'holiday',
          targetId: holidayId,
          meta,
        },
        tx,
      );
    });
    return this.list(row.country_code);
  }
}
