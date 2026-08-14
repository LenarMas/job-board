import "server-only";
import { createServices, getDb, type Services } from "@jobtrack/core";

let services: Services | undefined;

export function getServices(): Services {
  services ??= createServices(getDb());
  return services;
}
