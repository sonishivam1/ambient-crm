import { createLogger, scrubString } from "@ambient/logger";

import { closeClient, ensureIndexes } from "../src/index";

const log = createLogger("indexes");

ensureIndexes()
  .then(() => log.info("Indexes are in place."))
  .catch((error) => {
    log.error({ err: error, detail: error instanceof Error ? scrubString(error.message) : undefined }, "Creating indexes failed.");
    process.exitCode = 1;
  })
  .finally(closeClient);
