declare module "node:fs/promises" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export interface Stats {
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<Dirent[]>;
  export function readdir(path: string): Promise<string[]>;
  export function stat(path: string): Promise<Stats>;
  export function mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<string | undefined>;
  export function writeFile(
    path: string,
    data: string,
    encoding: "utf8",
  ): Promise<void>;
}

declare module "node:path" {
  interface PathModule {
    basename(path: string): string;
    dirname(path: string): string;
    join(...paths: string[]): string;
  }

  const path: PathModule;
  export default path;
}
