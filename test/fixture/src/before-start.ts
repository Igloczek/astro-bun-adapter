// Workers inherit the environment, so this shows where the hook ran.
export default async function beforeStart() {
  process.env.FIXTURE_BEFORE_START = String(process.pid);
}
