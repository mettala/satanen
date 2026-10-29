// Tests read repo files as text with Vite's `?raw` imports (fixtures, and the
// app's section lists for a drift check). The Worker itself never does.
declare module '*?raw' {
  const text: string;
  export default text;
}
