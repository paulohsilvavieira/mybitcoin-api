import { Administrator } from '@/modules/identity/domain/entities/administrator.entity';

export abstract class AdministratorReadRepository {
  abstract findByUserId(userId: string): Promise<Administrator | null>;
}
