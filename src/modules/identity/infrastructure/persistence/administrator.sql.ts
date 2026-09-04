export function findAdministratorByUserIdQuery(userId: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, user_id, role, created_at
    FROM administrators
    WHERE user_id = $1
  `;
  return { query, values: [userId] };
}
