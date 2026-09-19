/**
 * A stand-in for the browser's EventSource, which jsdom does not have.
 *
 * The screens that listen for live updates open one as they mount, so without
 * this every test that draws one of them fails before it asserts anything.
 * Nothing is fetched. Every stream opened is kept in `instances`, so a test can
 * read the URL it was opened on, push a message down it, drop it, and see
 * whether the component closed it.
 *
 * Installed as the global in setup.js; a test reaches it as
 * `globalThis.EventSource`.
 */
export class FakeEventSource {
  static instances = [];

  static reset() {
    FakeEventSource.instances = [];
  }

  /** The stream opened most recently, or null. */
  static latest() {
    return FakeEventSource.instances.at(-1) ?? null;
  }

  constructor(url) {
    this.url = String(url);
    this.closed = false;
    this.onmessage = null;
    this.onerror = null;
    FakeEventSource.instances.push(this);
  }

  /** The server pushing one message down this stream. */
  push(data) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }

  /** The connection dropping, as the browser reports it. */
  fail() {
    this.onerror?.(new Event("error"));
  }

  close() {
    this.closed = true;
  }
}
