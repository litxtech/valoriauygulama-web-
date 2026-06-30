import { GroupMembersScreen } from '@/components/chat/GroupMembersScreen';

export default function AdminGroupMembersRoute() {
  return <GroupMembersScreen chatReturnPath="/admin/messages" />;
}
