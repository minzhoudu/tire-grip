import { UserList } from "@/components/platform/user-list";
import { getDb } from "@/db";
import { listAllUsers } from "@/server/platform";

export default async function PlatformUsersPage() {
  const users = await listAllUsers(getDb());
  return <UserList users={users} />;
}
