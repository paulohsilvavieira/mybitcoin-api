import { User } from '@/modules/identity/domain/entities/user.entity';
import { UserId } from '@/modules/identity/domain/value-objects/user-id.vo';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import {
  UserStatus,
  UserStatusType,
} from '@/modules/identity/domain/value-objects/user-status.vo';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  status: string;
  email_verified: boolean;
  terms_accepted: boolean;
  registration_ip: string;
  created_at: Date;
  updated_at: Date;
}

export class UserMapper {
  static toDomain(row: UserRow): User {
    return User.reconstitute({
      id: UserId.from(row.id),
      name: row.name,
      email: Email.create(row.email),
      passwordHash: row.password_hash,
      status: UserStatus.from(row.status as UserStatusType),
      emailVerified: row.email_verified,
      termsAccepted: row.terms_accepted,
      registrationIp: row.registration_ip,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  static toRow(user: User): {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    status: string;
    emailVerified: boolean;
    termsAccepted: boolean;
    registrationIp: string;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: user.id.toString(),
      name: user.name,
      email: user.email.toString(),
      passwordHash: user.passwordHash,
      status: user.status.toString(),
      emailVerified: user.emailVerified,
      termsAccepted: user.termsAccepted,
      registrationIp: user.registrationIp,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
