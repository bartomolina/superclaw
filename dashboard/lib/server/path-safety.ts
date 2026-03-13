import { existsSync, statSync } from "fs";
import path from "path";

export function isPathWithin(baseDir: string, targetPath: string) {
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveExistingFileWithin(baseDir: string, relativePath: string | null | undefined) {
  if (!baseDir || !relativePath) return null;
  if (path.isAbsolute(relativePath)) return null;

  const resolved = path.resolve(baseDir, relativePath);
  if (!isPathWithin(baseDir, resolved)) return null;
  if (!existsSync(resolved)) return null;

  try {
    const stat = statSync(resolved);
    return stat.isFile() ? resolved : null;
  } catch {
    return null;
  }
}

export function isSafeWorkspacePath(openclawHome: string, workspacePath: string | null | undefined) {
  if (!openclawHome || !workspacePath) return false;

  const home = path.resolve(openclawHome);
  const workspace = path.resolve(workspacePath);
  const baseName = path.basename(workspace);

  if (workspace === home) return false;
  if (!isPathWithin(home, workspace)) return false;
  return baseName.startsWith("workspace-");
}
