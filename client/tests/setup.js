import "@testing-library/jest-dom";
import { FakeEventSource } from "./fakeEventSource.js";

// jsdom has no EventSource, and the screens that listen for live updates open
// one as they mount. See fakeEventSource.js.
globalThis.EventSource = FakeEventSource;
