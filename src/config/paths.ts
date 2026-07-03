import path from "node:path";

function readCwd(): string {
  const runtime = globalThis as {
    process?: { cwd?: () => string };
  };
  return runtime.process?.cwd?.() ?? ".";
}

export interface ProjectPaths {
  projectRoot: string;
  dataRoot: string;
  personasRoot: string;
}

export function loadProjectPaths(projectRoot = readCwd()): ProjectPaths {
  const dataRoot = path.join(projectRoot, "src", "data");

  return {
    projectRoot,
    dataRoot,
    personasRoot: path.join(dataRoot, "personas"),
  };
}
