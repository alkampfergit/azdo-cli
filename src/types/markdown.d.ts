// Markdown files imported from src/ are inlined as strings by tsup's text loader.
declare module "*.md" {
  const content: string;
  export default content;
}
