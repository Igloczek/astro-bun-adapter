import { logAppModule } from "./app-log";

logAppModule("renderer");

// Never claims a component; it only shows where renderer modules load.
export default {
  name: "fixture-renderer",
  check: () => false,
  renderToStaticMarkup: () => ({ html: "" }),
};
