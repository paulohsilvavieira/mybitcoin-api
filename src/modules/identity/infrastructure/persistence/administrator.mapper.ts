import { Administrator } from '@/modules/identity/domain/entities/administrator.entity';

export interface AdministratorRow {
  id: string;
  user_id: string;
  role: string;
  created_at: Date;
}

export class AdministratorMapper {
  static toDomain(row: AdministratorRow): Administrator {
    return Administrator.reconstitute({
      id: row.id,
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
    });
  }
}
