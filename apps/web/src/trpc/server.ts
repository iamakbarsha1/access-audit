import "server-only";
import { headers } from "next/headers";
import { createCallerFactory, createTRPCContext } from "./init";
import { appRouter } from "./routers/_app";

const createCaller = createCallerFactory(appRouter);

export async function createServerCaller() {
  return createCaller(
    await createTRPCContext({
      headers: await headers(),
    })
  );
}
