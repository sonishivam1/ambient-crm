import { closeClient, ensureIndexes } from "../src/index";

ensureIndexes()
  .then(() => console.log("Indexes are in place."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeClient);
