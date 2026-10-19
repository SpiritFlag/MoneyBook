import "server-only";
import { auth } from "@clerk/nextjs/server";
import { RepositoryError, userExpenseRepository } from "./expense-repository";

export async function authenticatedRepository() {
  const { userId } = await auth();
  if (!userId) throw new RepositoryError("로그인 후 장부를 열어 주세요.", 401);
  return userExpenseRepository(userId);
}
