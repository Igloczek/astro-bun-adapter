// Imported first by the server entry: static imports evaluate in order, so a
// worker watches its supervisor before Astro loads the app, whose modules can
// await slow initialization.
import { isWorker, stopWithSupervisor } from "./worker.js";

if (isWorker) stopWithSupervisor();
