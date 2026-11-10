import type { SqlSourceType } from "@hoanghainh/knot-sync-core";
import type { DriverFactory } from "./driver.js";

const registry = new Map<string, DriverFactory>();

/** Register a driver factory for a SQL source type (used by enterprise plugin). */
export function registerSqlDriverFactory(
  type: SqlSourceType | string,
  factory: DriverFactory,
): void {
  registry.set(type, factory);
}

export function unregisterSqlDriverFactory(type: SqlSourceType | string): void {
  registry.delete(type);
}

export function getRegisteredSqlDriverFactory(
  type: SqlSourceType | string,
): DriverFactory | undefined {
  return registry.get(type);
}

/** Test helper — clear paid/enterprise registrations. */
export function clearSqlDriverRegistry(): void {
  registry.clear();
}
