import "server-only";
import { auth } from "@clerk/nextjs/server";
import { RepositoryError } from "./expense-repository";
import { createNeonRepository } from "./neon-repository";

export async function authenticatedRepository() {
  const { userId } = await auth();
  if (!userId) throw new RepositoryError("로그인 후 장부를 열어 주세요.", 401);
  return createNeonRepository(userId, process.env.DATABASE_URL ?? "");
}
