import neo4j, { Driver } from "neo4j-driver";

let driver: Driver | null = null;

function getDriver(): Driver {
  if (driver) {
    return driver;
  }

  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !user || !password) {
    throw new Error("Neo4j environment variables are not set");
  }

  driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true,
  });

  return driver;
}

export async function createEventNode(
  payload: Record<string, unknown>,
): Promise<void> {
  const drv = getDriver();
  const session = drv.session();

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(`CREATE (e:Event) SET e += $payload`, { payload });
    });
  } catch (error) {
    console.error("[DMF7][GRAPH] createEventNode failed:", error);
  } finally {
    await session.close();
  }
}

async function shutdown() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);