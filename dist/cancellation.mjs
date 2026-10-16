// Yield to input events as well as checking the signal. A microtask alone would
// prevent the close/settings events from cancelling a long page loop.
export async function checkpoint(signal) {
  if (!signal) return;
  signal.throwIfAborted();
  await new Promise(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
}
