// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

// react-router 7 usa TextEncoder, que el jsdom de Jest 27 no trae.
import { TextDecoder, TextEncoder } from "util";

global.TextEncoder ??= TextEncoder;
global.TextDecoder ??= TextDecoder;
