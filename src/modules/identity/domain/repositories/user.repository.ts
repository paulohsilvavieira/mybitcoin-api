import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';

export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: Email): Promise<User | null>;
  abstract save(user: User): Promise<void>;
}
