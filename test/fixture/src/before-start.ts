// Workers inherit the environment, so this shows where the hooks ran.
export default async function beforeStart() {
  process.env.FIXTURE_BEFORE_START = `${process.pid} first`;
}
