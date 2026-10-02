import { Injectable } from '@nestjs/common';
import type { Me } from '@jordan-sports/contracts';
import { Errors } from '../../../platform/http/errors.js';
import { UsersService } from '../../identity/index.js';
import { MembershipsService } from '../../tenancy/index.js';

/** Composes the signed-in user's view from identity and tenancy. */
@Injectable()
export class AccountService {
  constructor(
    private readonly users: UsersService,
    private readonly memberships: MembershipsService,
  ) {}

  async me(userId: string): Promise<Me> {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.unauthenticated();
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      displayName: user.display_name,
      locale: user.locale as Me['locale'],
      preferredMode: user.preferred_mode as Me['preferredMode'],
      memberships: await this.memberships.forUser(user.id),
      marketingOptIn: user.marketing_opt_in_at !== null,
    };
  }
}
