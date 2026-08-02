import { Pool } from 'pg';

const TABLE = 'replication_integration_test';

describe('Replicação escrita/leitura (integração)', () => {
  let writePool: Pool;
  let readPool: Pool;

  beforeAll(async () => {
    writePool = new Pool({
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    readPool = new Pool({
      host: process.env.DB_READ_HOST ?? 'localhost',
      port: Number(process.env.DB_READ_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });

    await writePool.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await writePool.query(
      `CREATE TABLE ${TABLE} (id serial PRIMARY KEY, value text NOT NULL)`,
    );
  });

  afterAll(async () => {
    await writePool
      .query(`DROP TABLE IF EXISTS ${TABLE}`)
      .catch(() => undefined);
    await writePool.end();
    await readPool.end();
  });

  it('escrita vai para o primary', async () => {
    const { rows } = await writePool.query<{ id: number }>(
      `INSERT INTO ${TABLE} (value) VALUES ('from-primary') RETURNING id`,
    );

    expect(rows[0].id).toBeGreaterThan(0);
  });

  it('dado escrito no primary aparece no replica (streaming replication)', async () => {
    const { rows } = await writePool.query<{ id: number }>(
      `INSERT INTO ${TABLE} (value) VALUES ('replicated-row') RETURNING id`,
    );
    const insertedId = rows[0].id;

    let found = false;
    for (let i = 0; i < 15; i += 1) {
      const result = await readPool.query<{ id: number }>(
        `SELECT id FROM ${TABLE} WHERE id = $1`,
        [insertedId],
      );
      if (result.rows.length === 1) {
        found = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    expect(found).toBe(true);
  });

  it('read pool é somente leitura (hot standby rejeita escrita)', async () => {
    await expect(
      readPool.query(`INSERT INTO ${TABLE} (value) VALUES ('must-fail')`),
    ).rejects.toThrow(/read-only|recovery in progress|cannot execute/i);
  });
});
