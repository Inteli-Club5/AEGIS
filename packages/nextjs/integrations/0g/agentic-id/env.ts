import { existsSync, readFileSync } from "fs";
import { join, normalize } from "path";
import "server-only";

const parseEnvFile = (path: string) => {
  if (!existsSync(path)) {
    return {};
  }

  const parsed: Record<string, string> = {};
  const raw = readFileSync(path, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalizedLine = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const value = normalizedLine
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    parsed[key] = value;
  }

  return parsed;
};

const loadRepoEnv = (() => {
  let cached: Record<string, string> | null = null;

  return () => {
    if (cached) {
      return cached;
    }

    const cwd = process.cwd();
    const candidates = [
      join(cwd, ".env.local"),
      join(cwd, ".env"),
      join(cwd, "packages/nextjs/.env.local"),
      join(cwd, "packages/nextjs/.env"),
      join(cwd, "../..", ".env.local"),
      join(cwd, "../..", ".env"),
    ];

    cached = candidates.reduce<Record<string, string>>((acc, candidate) => {
      const path = normalize(candidate);
      return { ...acc, ...parseEnvFile(path) };
    }, {});

    return cached;
  };
})();

export const getEnvValue = (names: string[]) => {
  for (const name of names) {
    const value = process.env[name]?.trim() || loadRepoEnv()[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
};

export const getRequiredEnvValue = (names: string[], label = names.join(" or ")) => {
  const value = getEnvValue(names);
  if (!value) {
    throw new Error(`${label} is required for real 0G Agentic ID registration.`);
  }

  return value;
};
