// Local ESLint rules that re-create SonarJS decorators (SonarSource/SonarJS,
// packages/analysis/src/jsts/rules/<key>/decorator.ts). A decorator filters the reports of
// the ESLint rule it wraps; without it the local run raises findings SonarCloud never does.
// Registered as "sonar-local" in eslint.sonar.config.js; see docs/sonar-local.md.
import { builtinRules } from "eslint/use-at-your-own-risk";

const LOOPS = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);
const isLoop = (node) => LOOPS.has(node.type);
const isFunction = (node) =>
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression" ||
  node.type === "ArrowFunctionExpression";
// Same boundaries as ESLint core's no-await-in-loop.
const isBoundary = (node) =>
  isFunction(node) || (node.type === "ForOfStatement" && node.await === true);

function isLooped(node, loop) {
  switch (loop.type) {
    case "ForStatement":
      return node === loop.test || node === loop.update || node === loop.body;
    case "ForOfStatement":
    case "ForInStatement":
      return (
        node === loop.body ||
        (node === loop.left &&
          loop.left.type === "VariableDeclaration" &&
          loop.left.kind === "await using")
      );
    default: // while, do-while
      return node === loop.test || node === loop.body;
  }
}

function findEnclosingLoop(node) {
  for (let current = node, parent = node.parent; parent; current = parent, parent = parent.parent) {
    if (isBoundary(parent)) return null;
    if (isLoop(parent) && isLooped(current, parent)) {
      return { loop: parent, viaBody: current === parent.body };
    }
  }
  return null;
}

// A `return` / `break` after the await in the loop body: the loop is a search or a retry
// that stops early, which SonarJS accepts (a deliberate false-negative class on its side).
function hasLaterLoopExit(loop, afterNode, visitorKeys) {
  const afterEnd = afterNode.range?.[1] ?? Number.POSITIVE_INFINITY;
  const children = (node) =>
    (visitorKeys[node.type] ?? []).flatMap((key) => {
      const child = node[key];
      return (Array.isArray(child) ? child : [child]).filter((c) => c && typeof c.type === "string");
    });

  function search(node, inSwitch) {
    if (isBoundary(node)) return false;
    if (node.range && node.range[0] > afterEnd) {
      if (node.type === "ReturnStatement") return true;
      if (node.type === "BreakStatement" && (!inSwitch || node.label)) return true;
    }
    const nested = node.type === "SwitchStatement" || (inSwitch && !isLoop(node));
    return children(node).some((child) => search(child, nested));
  }
  return search(loop.body, false);
}

const core = builtinRules.get("no-await-in-loop");

const noAwaitInLoop = {
  meta: core.meta,
  create(context) {
    const filtered = Object.create(context, {
      report: {
        value(descriptor) {
          const enclosing = descriptor.node && findEnclosingLoop(descriptor.node);
          const suppressed =
            enclosing?.viaBody &&
            hasLaterLoopExit(enclosing.loop, descriptor.node, context.sourceCode.visitorKeys);
          if (!suppressed) context.report(descriptor);
        },
      },
    });
    return core.create(filtered);
  },
};

export default { rules: { "no-await-in-loop": noAwaitInLoop } };
